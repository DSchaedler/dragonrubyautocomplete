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
    public sortText?: string;
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

function addDetail(item: any, detail: string, doc: string): any {
  item.detail = detail;
  item.documentation = new vscodeApi.MarkdownString(doc);
  return item;
}

export function isDragonRubyFile(document: { fileName: string }): boolean {
  return detectDragonRubyProject(document.fileName);
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
      return completionForContext(line, projectMap).map((item) => {
        const completionItem = new vscodeApi.CompletionItem(item.label, item.kind as number);
        completionItem.detail = item.detail ?? 'DragonRuby runtime';
        completionItem.insertText = item.insertText ?? item.label;
        if (typeof item.documentation !== 'undefined') {
          completionItem.documentation = item.documentation as string | { value: string } | undefined;
        }
        return completionItem;
      });
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
          item.sortText = `zzz${word}`;
          item.detail = 'Ruby keyword';
          item.documentation = new vscodeApi.MarkdownString('Ruby language keyword available while editing DragonRuby code.');
          return item;
        });
    }
  };
}
