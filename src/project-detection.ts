import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import { cacheProjectCompletionMap, projectCompletionCache, scanEngineDataAsync } from './engine-scan';

let vscodeRuntime: typeof import('vscode') | undefined;
try {
  vscodeRuntime = require('vscode');
} catch {
  vscodeRuntime = undefined;
}

// -----------------------------------------------------------------------------
// Project detection
// -----------------------------------------------------------------------------
// A DragonRuby project is not always named "mygame" or stored in a single default
// folder. This section inspects both file content and common directory layouts to
// determine whether the current file is part of a DragonRuby project.
// -----------------------------------------------------------------------------

export const dragonRubyNoticeCache = new Set<string>();
export const projectDetectionCache = new Map<string, boolean>();
export const projectOverrideCache = new Map<string, boolean>();
const pendingProjectScan = new Map<string, NodeJS.Timeout>();
const PROJECT_OVERRIDE_STATE_KEY = 'dragonruby.projectOverrides.v1';
const PROJECT_STATE_VERSION_KEY = 'dragonruby.projectStateVersion';
const PROJECT_STATE_VERSION = 1;
let workspaceStateStore: vscode.Memento | undefined;

export function initializeProjectDetectionState(state: vscode.Memento): void {
  workspaceStateStore = state;
  const activeVersion = state.get<number>(PROJECT_STATE_VERSION_KEY, 0);
  if (activeVersion !== PROJECT_STATE_VERSION) {
    void state.update(PROJECT_STATE_VERSION_KEY, PROJECT_STATE_VERSION);
  }

  const storedOverrides = state.get<Record<string, boolean>>(PROJECT_OVERRIDE_STATE_KEY, {});
  projectOverrideCache.clear();

  for (const [projectRoot, enabled] of Object.entries(storedOverrides)) {
    projectOverrideCache.set(projectRoot, Boolean(enabled));
  }
}

function saveProjectOverrideState(): void {
  if (!workspaceStateStore) {
    return;
  }

  const state = Object.fromEntries(projectOverrideCache.entries());
  void workspaceStateStore.update(PROJECT_OVERRIDE_STATE_KEY, state);
}

export function fileContainsDragonRubySignals(contents: string): boolean {
  const text = contents.replace(/\r/g, '');
  return /def\s+tick\s+args\b|args\.outputs\b|args\.inputs\b|args\.state\b|\$gtk\b|def\s+[A-Za-z_][A-Za-z0-9_]*\s+args\b/.test(text) ||
    /controller_(one|two|three|four)\b/.test(text) ||
    /metadata\s*\.|sprites\s*\.|sounds\s*\.|fonts\s*\./.test(text);
}

function hasStrongDragonRubyProjectSignals(directory: string): boolean {
  if (!fs.existsSync(directory)) {
    return false;
  }

  const strongMarkers = [
    'app/main.rb',
    'metadata/game_metadata.txt',
    'metadata/metadata.txt',
    'main.rb',
    'dragonruby',
    'dragonruby-linux-amd64'
  ];

  return strongMarkers.some((marker) => fs.existsSync(path.join(directory, marker))) ||
    fs.existsSync(path.join(directory, 'app')) && fs.existsSync(path.join(directory, 'metadata'));
}

function hasDragonRubyProjectMarkers(directory: string): boolean {
  if (!fs.existsSync(directory)) {
    return false;
  }

  const markers = ['app', 'mygame', 'metadata', 'sprites', 'sounds', 'fonts', 'data'];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name.toLowerCase()));

  const hasMetadataFile = fs.existsSync(path.join(directory, 'metadata', 'game_metadata.txt')) ||
    fs.existsSync(path.join(directory, 'metadata', 'metadata.txt')) ||
    fs.existsSync(path.join(directory, 'app', 'main.rb')) ||
    fs.existsSync(path.join(directory, 'main.rb'));

  const hasEngineLayout = fs.existsSync(path.join(directory, 'dragonruby')) ||
    fs.existsSync(path.join(directory, 'dragonruby-linux-amd64')) ||
    fs.existsSync(path.join(directory, 'dragonruby.exe'));

  return hasMetadataFile || hasEngineLayout || markers.some((marker) => names.has(marker));
}

export function setProjectOverride(projectRoot: string, enabled: boolean): void {
  projectOverrideCache.set(projectRoot, enabled);
  projectDetectionCache.set(projectRoot, enabled);
  saveProjectOverrideState();
}

export function clearProjectOverride(projectRoot: string): void {
  projectOverrideCache.delete(projectRoot);
  projectDetectionCache.delete(projectRoot);
  saveProjectOverrideState();
}

export function getProjectOverride(projectRoot: string): boolean | undefined {
  return projectOverrideCache.get(projectRoot);
}

export function determineProjectConfidence(filePath: string): 'confirmed' | 'uncertain' | 'rejected' {
  const resolved = path.resolve(filePath);
  const projectRoot = path.dirname(resolved);
  const override = projectOverrideCache.get(projectRoot);

  if (override !== undefined) {
    return override ? 'confirmed' : 'rejected';
  }

  if (fs.existsSync(resolved)) {
    try {
      const text = fs.readFileSync(resolved, 'utf8');
      if (fileContainsDragonRubySignals(text)) {
        projectDetectionCache.set(projectRoot, true);
        return 'confirmed';
      }
    } catch {
      // Ignore unreadable files while checking project markers.
    }
  }

  let current = path.dirname(resolved);
  for (let depth = 0; depth < 12; depth += 1) {
    if (hasStrongDragonRubyProjectSignals(current)) {
      projectDetectionCache.set(projectRoot, true);
      return 'confirmed';
    }

    if (hasDragonRubyProjectMarkers(current)) {
      projectDetectionCache.set(projectRoot, false);
      return 'uncertain';
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    const siblingRubyFiles = fs.existsSync(current)
      ? fs.readdirSync(current, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.rb'))
          .slice(0, 20)
      : [];

    for (const entry of siblingRubyFiles) {
      const file = path.join(current, entry.name);
      try {
        const text = fs.readFileSync(file, 'utf8');
        if (fileContainsDragonRubySignals(text)) {
          projectDetectionCache.set(projectRoot, true);
          return 'confirmed';
        }
      } catch {
        // Ignore unreadable Ruby files while scanning parent directories.
      }
    }

    current = parent;
  }

  projectDetectionCache.set(projectRoot, false);
  return 'rejected';
}

export function detectDragonRubyProject(filePath: string): boolean {
  return determineProjectConfidence(filePath) === 'confirmed';
}

// Queue the engine scan in a low-priority background pass once we’ve confirmed a
// valid project. This prevents the scan from interrupting typing or editing.
export function scheduleProjectEngineScan(projectRoot: string): void {
  if (!projectRoot || projectDetectionCache.get(projectRoot) === false) {
    return;
  }

  const existing = projectCompletionCache.get(projectRoot);
  if (existing && Object.keys(existing).length > 0) {
    return;
  }

  if (pendingProjectScan.has(projectRoot)) {
    return;
  }

  const handle = setTimeout(() => {
    pendingProjectScan.delete(projectRoot);
    void (async () => {
      const discovered = await scanEngineDataAsync();
      if (Object.keys(discovered).length > 0) {
        cacheProjectCompletionMap(projectRoot, discovered);
      }
    })();
  }, 250);

  pendingProjectScan.set(projectRoot, handle);
}

export function promptForProjectActivation(document: vscode.TextDocument): void {
  if (!document || !document.fileName || !document.fileName.toLowerCase().endsWith('.rb')) {
    return;
  }

  const projectKey = path.dirname(path.resolve(document.fileName));
  if (projectOverrideCache.has(projectKey)) {
    return;
  }

  if (determineProjectConfidence(document.fileName) !== 'uncertain') {
    return;
  }

  if (!vscodeRuntime) {
    return;
  }

  void vscodeRuntime.window.showWarningMessage(
    'This folder looks like a DragonRuby project, but it is not certain. Enable autocomplete for this project?',
    'Yes, enable',
    'No'
  ).then((selection) => {
    if (selection === 'Yes, enable') {
      setProjectOverride(projectKey, true);
      scheduleProjectEngineScan(projectKey);
      return;
    }

    if (selection === 'No') {
      setProjectOverride(projectKey, false);
    }
  });
}

export function notifyDragonRubyDetected(document: vscode.TextDocument): void {
  if (!document || !document.fileName || !document.fileName.toLowerCase().endsWith('.rb')) {
    return;
  }

  const projectKey = path.dirname(path.resolve(document.fileName));
  const confidence = determineProjectConfidence(document.fileName);

  if (confidence === 'uncertain') {
    promptForProjectActivation(document);
    return;
  }

  if (confidence !== 'confirmed') {
    return;
  }

  scheduleProjectEngineScan(projectKey);

  if (dragonRubyNoticeCache.has(projectKey)) {
    return;
  }

  if (!vscodeRuntime) {
    return;
  }

  dragonRubyNoticeCache.add(projectKey);
  void vscodeRuntime.window.showInformationMessage(
    `DragonRuby project detected in ${path.basename(projectKey)}. Autocomplete is active for ${path.basename(document.fileName)}.`,
    'OK'
  );
}

export function getProjectStatusSummary(projectRoot: string): string {
  const override = getProjectOverride(projectRoot);
  const detection = projectDetectionCache.get(projectRoot) ?? false;
  const cacheReady = projectCompletionCache.has(projectRoot) && Object.keys(projectCompletionCache.get(projectRoot) ?? {}).length > 0;

  if (override === true) {
    return `state=enabled project=${path.basename(projectRoot)} cache=${cacheReady ? 'ready' : 'empty'} detection=${detection ? 'detected' : 'manual'}`;
  }

  if (override === false) {
    return `state=disabled project=${path.basename(projectRoot)} cache=${cacheReady ? 'ready' : 'empty'} detection=${detection ? 'detected' : 'not detected'}`;
  }

  if (detection) {
    return `state=detected project=${path.basename(projectRoot)} cache=${cacheReady ? 'ready' : 'empty'} override=unknown`;
  }

  return `state=not detected project=${path.basename(projectRoot)} cache=${cacheReady ? 'ready' : 'empty'} override=unknown`;
}

export function describeProjectState(projectRoot: string, detection: boolean, override?: boolean, cacheReady = false): string {
  const state = override === true ? 'enabled' : override === false ? 'disabled' : detection ? 'detected' : 'not detected';
  return `state=${state} project=${path.basename(projectRoot)} cache=${cacheReady ? 'ready' : 'empty'} detection=${detection ? 'detected' : 'not detected'}`;
}
