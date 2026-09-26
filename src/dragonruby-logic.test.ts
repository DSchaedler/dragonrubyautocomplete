import test from 'node:test';
import assert from 'node:assert/strict';
import { computeConfidenceFromSignals, fileContainsDragonRubySignals, hasDragonRubyProjectMarkers } from './dragonruby-logic';
import { completionForContext, createItems, baseSeed, addUnique } from './completion-data';

test('detects DragonRuby signals in a typical Ruby file', () => {
  const source = `
    def tick args
      if args.inputs.keyboard.key_down.up
        args.state.player_y += 1
      end
    end
  `;

  assert.equal(fileContainsDragonRubySignals(source), true);
  assert.equal(computeConfidenceFromSignals(source), 'confirmed');
});

test('treats folder markers as uncertain rather than confirmed', () => {
  const names = ['app', 'metadata', 'sprites'];

  assert.equal(hasDragonRubyProjectMarkers(names), true);
  assert.equal(computeConfidenceFromSignals(undefined, names), 'uncertain');
});

test('rejects irrelevant ruby files', () => {
  const source = `
    def hello world
      puts world
    end
  `;

  assert.equal(fileContainsDragonRubySignals(source), false);
  assert.equal(computeConfidenceFromSignals(source), 'rejected');
});

test('uses nested object context for args.inputs completions', () => {
  const suggestions = completionForContext('args.inputs.');
  const labels = suggestions.map((item) => item.label);

  assert.ok(labels.includes('keyboard'));
  assert.ok(labels.includes('mouse'));
  assert.ok(!labels.includes('outputs'));
  assert.ok(!labels.includes('args'));
});

test('uses the deepest known object for keyboard subproperties', () => {
  const suggestions = completionForContext('args.inputs.keyboard.');
  const labels = suggestions.map((item) => item.label);

  assert.ok(labels.includes('key_down'));
  assert.ok(labels.includes('key_held'));
  assert.ok(!labels.includes('controller_one'));
  assert.ok(!labels.includes('mouse'));
});

test('populates read-more text for hardcoded and source-derived suggestions', () => {
  const builtin = createItems([{ label: 'set_window_size', kind: 2 }])[0];
  const sourceDerived = createItems([{ label: 'scan_only_value', kind: 10 }])[0];
  const genericSource = createItems([{ label: 'scan_only_value_2', kind: 10, documentation: 'Not Specified; Please refer to engine docs.' }])[0];
  const engineOutsideProject = createItems([{ label: 'scan_only_value_3', kind: 10 }])[0];
  const builtinDoc = builtin.documentation as { value: string };
  const sourceDoc = sourceDerived.documentation as { value: string };
  const genericSourceDoc = genericSource.documentation as { value: string };
  const engineSourceDoc = engineOutsideProject.documentation as { value: string };

  assert.ok(String(builtinDoc.value).toLowerCase().includes('window width'));
  assert.ok(String(sourceDoc.value).toLowerCase().includes('not specified'));
  assert.ok(String(sourceDoc.value).toLowerCase().includes('please refer to engine docs'));
  assert.ok(!String(sourceDoc.value).toLowerCase().includes('source:'));
  assert.ok(String(genericSourceDoc.value).toLowerCase().includes('not specified'));
  assert.ok(String(genericSourceDoc.value).toLowerCase().includes('please refer to engine docs'));
  assert.ok(!String(genericSourceDoc.value).toLowerCase().includes('app/engine.rb'));
  assert.ok(String(engineSourceDoc.value).toLowerCase().includes('not specified'));
  assert.ok(String(engineSourceDoc.value).toLowerCase().includes('please refer to engine docs'));
  assert.ok(!String(engineSourceDoc.value).toLowerCase().includes('/tmp/dragonruby-linux-amd64/docs/oss/dragon/input.rb'));
});

test('gives every baseSeed entry explicit documentation text', () => {
  const entries = Object.values(baseSeed).flat();

  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.ok(entry.documentation, `Missing documentation for ${entry.label}`);
    assert.ok(String(entry.documentation).length > 20, `Documentation too short for ${entry.label}`);
  }
});

test('keeps the simple fallback text for discovered entries without a base-seed doc', () => {
  const map: Record<string, any[]> = {};
  addUnique(map, 'keyboard', 'ctrl_b');

  const entry = map.keyboard[0];
  const doc = createItems([entry])[0].documentation as { value: string };
  assert.ok(String(doc.value).toLowerCase().includes('not specified'));
  assert.ok(String(doc.value).toLowerCase().includes('please refer to engine docs'));
});
