let vscodeRuntime: typeof import('vscode') | undefined;
try {
  vscodeRuntime = require('vscode');
} catch {
  vscodeRuntime = undefined;
}

const vscodeApi = vscodeRuntime ?? {
  CompletionItem: class {
    public label: string;
    public kind: number;
    public insertText?: string | { value: string };
    public detail?: string;
    public documentation?: unknown;
    constructor(label: string, kind: number) {
      this.label = label;
      this.kind = kind;
    }
  },
  MarkdownString: class {
    public value: string;
    constructor(value: string) {
      this.value = value;
    }
  },
  CompletionItemKind: {
    Snippet: 15,
    Keyword: 14,
    Property: 10,
    Method: 2,
    Variable: 6
  }
};

import { completionForContext, rubyKeywords } from './completion-data';
import { getProjectCompletionMap } from './engine-scan';
import { detectDragonRubyProject } from './project-detection';

// -----------------------------------------------------------------------------
// Completion providers
// -----------------------------------------------------------------------------
// This file owns the actual VS Code completion providers. It keeps the provider
// logic isolated from the data model and project detection so each concern stays
// easier to reason about.
// -----------------------------------------------------------------------------

export const dragonRubySnippetTriggerCharacters = ['c', 'd', 'h', 'k', 'l', 'm', 'p', 'r', 's', 't'] as const;

const snippets: Record<string, { body: string; detail: string; doc: string }> = {
  tick: {
    body: 'def tick args\n  $0\nend',
    detail: 'DragonRuby tick loop',
    doc: 'Create a standard DragonRuby tick method that receives the args object.'
  },
  state: {
    body: 'args.state.$1 ||= {}',
    detail: 'Game state',
    doc: 'Create a reusable state bucket for persistent runtime data.'
  },
  state_init: {
    body: 'args.state.$1 ||= { $2: $3 }',
    detail: 'Initialize state data',
    doc: 'Create a state object and initialize it with a default value.'
  },
  key_check: {
    body: 'if args.inputs.keyboard.key_down.$1\n  $0\nend',
    detail: 'Keyboard input check',
    doc: 'Insert a keyboard check for a pressed key in the current frame.'
  },
  key_held: {
    body: 'if args.inputs.keyboard.key_held.$1\n  $0\nend',
    detail: 'Held key check',
    doc: 'Insert a check for a key that is currently held down.'
  },
  mouse_click: {
    body: 'if args.inputs.mouse.click\n  $0\nend',
    detail: 'Mouse click check',
    doc: 'Hook a block to the mouse click signal.'
  },
  controller_check: {
    body: 'if args.inputs.controller_one.key_down.$1\n  $0\nend',
    detail: 'Controller input check',
    doc: 'Insert a controller input check for a common gamepad button.'
  },
  move_input: {
    body: 'if args.inputs.keyboard.key_held.left\n  $1\nelsif args.inputs.keyboard.key_held.right\n  $2\nend',
    detail: 'Movement input pattern',
    doc: 'Capture left/right movement with keyboard-held checks.'
  },
  label: {
    body: 'args.outputs.labels << { x: $1, y: $2, text: "$3", size_enum: $4, r: 255, g: 255, b: 255, a: 255 }',
    detail: 'Render text label',
    doc: 'Create a label output with position, text, size, and color.'
  },
  sprite: {
    body: 'args.outputs.sprites << [$1, $2, $3, $4, "$5"]',
    detail: 'Render sprite',
    doc: 'Create a sprite render instruction with x, y, target, and sprite path.'
  },
  solid: {
    body: 'args.outputs.solids << { x: $1, y: $2, w: $3, h: $4, r: $5, g: $6, b: $7, a: $8 }',
    detail: 'Render rectangle',
    doc: 'Create a filled solid rectangle output.'
  },
  line: {
    body: 'args.outputs.lines << { x: $1, y: $2, x2: $3, y2: $4, r: $5, g: $6, b: $7, a: $8 }',
    detail: 'Render line',
    doc: 'Create a line primitive between two points.'
  },
  primitive: {
    body: 'args.outputs.primitives << { x: $1, y: $2, text: "$3" }',
    detail: 'Render primitive',
    doc: 'Insert a primitive output with a basic text payload.'
  },
  rect: {
    body: 'args.geometry.rect($1, $2, $3, $4)',
    detail: 'Geometry rectangle',
    doc: 'Create a rectangle geometry definition for collision or layout calculations.'
  },
  render_loop: {
    body: 'args.outputs.sprites << [\n  $1,\n  $2,\n  $3,\n  $4,\n  "$5"\n]',
    detail: 'Common render pattern',
    doc: 'Insert a common sprite render block for game objects.'
  },
  hud: {
    body: 'args.outputs.labels << { x: 10, y: 700, text: "$1", size_enum: 4, r: 255, g: 255, b: 255, a: 255 }',
    detail: 'Heads-up display label',
    doc: 'Insert a quick HUD text label anchored to the top-left of the screen.'
  }
};

function addDetail(item: any, detail: string, doc: string): any {
  item.detail = detail;
  item.documentation = new vscodeApi.MarkdownString(doc);
  return item;
}

export function isDragonRubyFile(document: { fileName: string }): boolean {
  return detectDragonRubyProject(document.fileName);
}

function buildSnippetCompletionItems(): any[] {
  return Object.entries(snippets).map(([label, value]) => {
    const item = new vscodeApi.CompletionItem(label, vscodeApi.CompletionItemKind.Snippet) as any;
    item.insertText = new (vscodeApi as any).SnippetString(value.body);
    item.sortText = `0${label}`;
    item.filterText = label;
    return addDetail(item, value.detail, value.doc);
  });
}

export function createDragonRubyCompletionProvider(): any {
  return {
    provideCompletionItems(document: any, position: any) {
      if (!isDragonRubyFile(document)) {
        // Returning an empty array is safer than undefined because the provider can
        // still participate in the completion pipeline without throwing or
        // triggering downstream assumptions about missing context.
        return [];
      }

      const line = document.lineAt(position).text.slice(0, position.character);
      const projectMap = getProjectCompletionMap(document.fileName);
      const directItems = completionForContext(line, projectMap).map((item) => {
        const completionItem = new vscodeApi.CompletionItem(item.label, item.kind as number);
        completionItem.detail = item.detail ?? 'DragonRuby runtime';
        completionItem.insertText = item.insertText ?? item.label;
        if (typeof item.documentation !== 'undefined') {
          completionItem.documentation = item.documentation as string | { value: string } | undefined;
        }
        return completionItem;
      });

      return [...buildSnippetCompletionItems(), ...directItems];
    }
  };
}

export function createDragonRubySnippetProvider(): any {
  return {
    provideCompletionItems() {
      return buildSnippetCompletionItems();
    }
  };
}

export function createKeywordProvider(): any {
  return {
    provideCompletionItems(document: any, position: any) {
      if (!isDragonRubyFile(document)) {
        return [];
      }

      const line = document.lineAt(position).text.slice(0, position.character);
      const prefix = line.trim().match(/([A-Za-z_\$][A-Za-z0-9_\$]*)$/)?.[1] ?? '';
      return rubyKeywords
        .filter((word) => word.toLowerCase().startsWith(prefix.toLowerCase()))
        .map((word) => {
          const item = new vscodeApi.CompletionItem(word, vscodeApi.CompletionItemKind.Keyword);
          item.insertText = word;
          item.detail = 'Ruby keyword';
          item.documentation = new vscodeApi.MarkdownString('Ruby language keyword available while editing DragonRuby code.');
          return item;
        });
    }
  };
}
