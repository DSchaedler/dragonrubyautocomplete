import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import { DictionaryMap, addUnique, baseSeed, mergeMaps } from './completion-data';

let vscodeRuntime: typeof import('vscode') | undefined;
try {
  vscodeRuntime = require('vscode');
} catch {
  vscodeRuntime = undefined;
}

// -----------------------------------------------------------------------------
// Engine scan module
// -----------------------------------------------------------------------------
// This module owns the non-blocking engine scan. It is intentionally separated so
// the end-user completion layer does not have to know anything about filesystem
// traversal or progress UI.
// -----------------------------------------------------------------------------

export const projectCompletionCache = new Map<string, DictionaryMap>();
const PROJECT_CACHE_STATE_KEY = 'dragonruby.projectCache.v1';
const PROJECT_CACHE_VERSION_KEY = 'dragonruby.projectCacheVersion';
const PROJECT_CACHE_VERSION = 1;
let workspaceCacheState: vscode.Memento | undefined;

export function initializeEngineCacheState(state: vscode.Memento): void {
  workspaceCacheState = state;
  const version = state.get<number>(PROJECT_CACHE_VERSION_KEY, 0);
  if (version !== PROJECT_CACHE_VERSION) {
    void state.update(PROJECT_CACHE_VERSION_KEY, PROJECT_CACHE_VERSION);
  }

  const stored = state.get<Record<string, DictionaryMap>>(PROJECT_CACHE_STATE_KEY, {});
  projectCompletionCache.clear();

  for (const [projectRoot, entries] of Object.entries(stored)) {
    projectCompletionCache.set(projectRoot, entries);
  }
}

function saveProjectCacheState(): void {
  if (!workspaceCacheState) {
    return;
  }

  const serializable = Object.fromEntries(
    Array.from(projectCompletionCache.entries()).map(([projectRoot, map]) => [projectRoot, map])
  );
  void workspaceCacheState.update(PROJECT_CACHE_STATE_KEY, serializable);
}

function walkRubyFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const child of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, child.name);
      if (child.isDirectory()) {
        stack.push(full);
      } else if (child.name.endsWith('.rb')) {
        files.push(full);
      }
    }
  }

  return files;
}

function collectFromEngine(projectRoot?: string): DictionaryMap {
  const engineRoot = path.resolve(__dirname, '..', '..', 'dragonruby-linux-amd64', 'docs', 'oss', 'dragon');
  const files = walkRubyFiles(engineRoot);
  const map: DictionaryMap = {};

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');

    for (const match of text.matchAll(/args\.outputs\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      addUnique(map, 'outputs', match[1]);
    }
    for (const match of text.matchAll(/args\.inputs\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      addUnique(map, 'inputs', match[1]);
    }
    for (const match of text.matchAll(/args\.state\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      addUnique(map, 'state', match[1]);
    }
    for (const match of text.matchAll(/\$?gtk\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      addUnique(map, 'gtk', match[1]);
    }
    for (const match of text.matchAll(/args\.geometry\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      addUnique(map, 'geometry', match[1]);
    }
    for (const match of text.matchAll(/args\.layout\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      addUnique(map, 'layout', match[1]);
    }
    for (const match of text.matchAll(/args\.audio\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      addUnique(map, 'audio', match[1]);
    }
    for (const match of text.matchAll(/controller_(one|two|three|four)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      addUnique(map, 'controller', match[2]);
    }
    for (const match of text.matchAll(/args\.inputs\.keyboard\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      addUnique(map, 'keyboard', match[1]);
    }
    for (const match of text.matchAll(/def\s+([A-Za-z_][A-Za-z0-9_!?=]*)/g)) {
      addUnique(map, 'generic', match[1]);
    }
  }

  return map;
}

export async function scanEngineDataAsync(projectRoot?: string): Promise<DictionaryMap> {
  if (!vscodeRuntime) {
    return mergeMaps(baseSeed, collectFromEngine(projectRoot));
  }

  const engineRoot = path.resolve(__dirname, '..', '..', 'dragonruby-linux-amd64', 'docs', 'oss', 'dragon');

  return vscodeRuntime.window.withProgress(
    {
      location: vscodeRuntime!.ProgressLocation.Notification,
      title: 'DragonRuby engine scan',
      cancellable: true
    },
    async (progress, token) => {
      if (!fs.existsSync(engineRoot)) {
        return {};
      }

      const files = walkRubyFiles(engineRoot);
      const map: DictionaryMap = {};
      let processed = 0;

      progress.report({ message: 'Finding DragonRuby API names…', increment: 5 });

      for (const file of files) {
        if (token.isCancellationRequested) {
          progress.report({ message: 'Scan cancelled.', increment: 100 });
          return map;
        }

        const text = fs.readFileSync(file, 'utf8');

        for (const match of text.matchAll(/args\.outputs\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          addUnique(map, 'outputs', match[1]);
        }
        for (const match of text.matchAll(/args\.inputs\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          addUnique(map, 'inputs', match[1]);
        }
        for (const match of text.matchAll(/args\.state\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          addUnique(map, 'state', match[1]);
        }
        for (const match of text.matchAll(/\$?gtk\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          addUnique(map, 'gtk', match[1]);
        }
        for (const match of text.matchAll(/args\.geometry\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          addUnique(map, 'geometry', match[1]);
        }
        for (const match of text.matchAll(/args\.layout\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          addUnique(map, 'layout', match[1]);
        }
        for (const match of text.matchAll(/args\.audio\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          addUnique(map, 'audio', match[1]);
        }
        for (const match of text.matchAll(/controller_(one|two|three|four)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          addUnique(map, 'controller', match[2]);
        }
        for (const match of text.matchAll(/args\.inputs\.keyboard\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          addUnique(map, 'keyboard', match[1]);
        }
        for (const match of text.matchAll(/def\s+([A-Za-z_][A-Za-z0-9_!?=]*)/g)) {
          addUnique(map, 'generic', match[1]);
        }

        processed += 1;
        const pct = files.length === 0 ? 100 : Math.round((processed / files.length) * 90);
        progress.report({ message: `Scanning ${path.basename(file)}…`, increment: pct });
      }

      progress.report({ message: 'Merging completion data…', increment: 100 });
      return mergeMaps(baseSeed, map);
    }
  );
}

export function getProjectCompletionMap(filePath: string): DictionaryMap {
  const projectRoot = path.dirname(path.resolve(filePath));
  const cached = projectCompletionCache.get(projectRoot);
  if (cached) {
    return mergeMaps(baseSeed, cached);
  }

  return baseSeed;
}

export function cacheProjectCompletionMap(projectRoot: string, map: DictionaryMap): void {
  projectCompletionCache.set(projectRoot, map);
  saveProjectCacheState();
}

export function clearProjectCompletionMap(projectRoot?: string): void {
  if (projectRoot) {
    projectCompletionCache.delete(projectRoot);
    saveProjectCacheState();
    return;
  }

  projectCompletionCache.clear();
  saveProjectCacheState();
}

export async function rescanProjectEngine(projectRoot: string): Promise<DictionaryMap> {
  const discovered = await scanEngineDataAsync(projectRoot);
  cacheProjectCompletionMap(projectRoot, discovered);
  return discovered;
}

export function getEngineScanSeed(projectRoot?: string): DictionaryMap {
  return mergeMaps(baseSeed, collectFromEngine(projectRoot));
}
