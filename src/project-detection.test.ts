import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileContainsDragonRubySignals, determineProjectConfidence, clearProjectOverride, getProjectOverride, initializeProjectDetectionState, projectDetectionCache, projectOverrideCache, setProjectOverride } from './project-detection';
import { describeProjectState } from './project-detection';

function createMemento(initial: Record<string, unknown> = {}): { get<T>(key: string, defaultValue?: T): T; update(key: string, value: unknown): Thenable<void>; keys(): readonly string[] } {
  const store = new Map<string, unknown>(Object.entries(initial));

  return {
    get<T>(key: string, defaultValue?: T): T {
      return (store.has(key) ? store.get(key) : defaultValue) as T;
    },
    update: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    keys: () => Array.from(store.keys())
  };
}

test('detects a confirmed DragonRuby project from file content', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dragonruby-project-'));
  const projectDir = path.join(tempRoot, 'game');
  fs.mkdirSync(projectDir, { recursive: true });

  const filePath = path.join(projectDir, 'main.rb');
  const contents = `
    def tick args
      if args.inputs.keyboard.key_down.up
        args.state.player_y ||= 0
      end
    end
  `;

  fs.writeFileSync(filePath, contents, 'utf8');

  assert.equal(fileContainsDragonRubySignals(contents), true);
  assert.equal(determineProjectConfidence(filePath), 'confirmed');

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('persists override decisions in the workspace state', () => {
  const projectRoot = '/workspace/project';
  const state = createMemento();

  initializeProjectDetectionState(state);
  setProjectOverride(projectRoot, true);
  assert.equal(getProjectOverride(projectRoot), true);
  assert.equal(projectOverrideCache.get(projectRoot), true);

  clearProjectOverride(projectRoot);
  assert.equal(getProjectOverride(projectRoot), undefined);
});

test('returns explicit state text for a disabled project', () => {
  const projectRoot = '/workspace/project';
  const summary = describeProjectState(projectRoot, false, false, false);

  assert.ok(summary.includes('state=disabled'));
  assert.ok(summary.includes('project=project'));
  assert.ok(summary.includes('cache=empty'));
});

test('uses cached project detection before rescanning a project', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dragonruby-detection-cache-'));
  const projectDir = path.join(tempRoot, 'game');
  fs.mkdirSync(projectDir, { recursive: true });

  const filePath = path.join(projectDir, 'main.rb');
  fs.writeFileSync(filePath, "def tick args\n  args.state.player_y ||= 0\nend\n", 'utf8');

  const cachedKey = path.dirname(filePath);
  projectOverrideCache.clear();
  projectDetectionCache.set(cachedKey, false);

  assert.equal(determineProjectConfidence(filePath), 'rejected');

  fs.rmSync(tempRoot, { recursive: true, force: true });
  projectDetectionCache.delete(cachedKey);
});
