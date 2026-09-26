import * as path from 'path';
import type * as vscodeApiType from 'vscode';

const vscodeApi = (() => {
  try {
    return require('vscode') as typeof vscodeApiType;
  } catch {
    return undefined;
  }
})();

import { clearProjectCompletionMap, getProjectCompletionMap, initializeEngineCacheState, rescanProjectEngine } from './engine-scan';
import { createDragonRubyCompletionProvider, createKeywordProvider } from './providers';
import { clearProjectOverride, getProjectOverride, getProjectStatusSummary, initializeProjectDetectionState, notifyDragonRubyDetected, setProjectOverride } from './project-detection';

// -----------------------------------------------------------------------------
// Extension entry point
// -----------------------------------------------------------------------------
// This file is intentionally small. It wires together the project detection and
// completion providers so the extension remains modular and easier to maintain.
// -----------------------------------------------------------------------------

function getCurrentProjectRoot(fileName?: string): string | undefined {
  if (!vscodeApi) {
    return undefined;
  }

  if (!fileName) {
    const activeEditor = vscodeApi.window.activeTextEditor;
    if (!activeEditor) {
      return undefined;
    }

    fileName = activeEditor.document.fileName;
  }

  if (!fileName || !fileName.toLowerCase().endsWith('.rb')) {
    return undefined;
  }

  return path.dirname(path.resolve(fileName));
}

function updateStatusBar(statusBar: vscodeApiType.StatusBarItem, fileName?: string): void {
  if (!vscodeApi) {
    return;
  }

  const projectRoot = getCurrentProjectRoot(fileName);
  if (!projectRoot) {
    statusBar.hide();
    return;
  }

  const statusSummary = getProjectStatusSummary(projectRoot);
  const statusText = statusSummary.includes('state=enabled')
    ? 'DragonRuby: enabled'
    : statusSummary.includes('state=disabled')
      ? 'DragonRuby: disabled'
      : statusSummary.includes('state=detected')
        ? 'DragonRuby: detected'
        : 'DragonRuby: not detected';

  statusBar.text = statusText;
  statusBar.tooltip = statusSummary;
  statusBar.show();
}

export function getCompletionTriggerCharacters(): string[] {
  return ['.'];
}

export function activate(context: vscodeApiType.ExtensionContext) {
  const runtime = vscodeApi;
  if (!runtime) {
    return;
  }

  initializeProjectDetectionState(context.workspaceState);
  initializeEngineCacheState(context.workspaceState);

  // Register the main completion provider that understands DragonRuby runtime objects.
  const completionProvider = createDragonRubyCompletionProvider();

  // Register a secondary provider for plain Ruby keywords when the DragonRuby match is loose.
  const keywordProvider = createKeywordProvider();
  const completionTriggerCharacters = getCompletionTriggerCharacters();

  const completionDisposable = vscodeApi.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'ruby' },
    completionProvider,
    ...completionTriggerCharacters
  );

  const keywordDisposable = vscodeApi.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'ruby' },
    keywordProvider,
    ...completionTriggerCharacters
  );

  const statusBarItem = vscodeApi.window.createStatusBarItem(vscodeApi.StatusBarAlignment.Right, 200);
  statusBarItem.command = 'dragonruby.toggleProjectAutocomplete';
  updateStatusBar(statusBarItem);

  const enableCommand = vscodeApi.commands.registerCommand('dragonruby.enableProjectAutocomplete', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    setProjectOverride(projectRoot, true);
    updateStatusBar(statusBarItem, vscodeApi.window.activeTextEditor?.document.fileName);
  });

  const disableCommand = vscodeApi.commands.registerCommand('dragonruby.disableProjectAutocomplete', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    setProjectOverride(projectRoot, false);
    updateStatusBar(statusBarItem, vscodeApi.window.activeTextEditor?.document.fileName);
  });

  const resetCommand = vscodeApi.commands.registerCommand('dragonruby.resetProjectAutocomplete', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    clearProjectOverride(projectRoot);
    updateStatusBar(statusBarItem, vscodeApi.window.activeTextEditor?.document.fileName);
  });

  const toggleCommand = vscodeApi.commands.registerCommand('dragonruby.toggleProjectAutocomplete', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    const current = getProjectOverride(projectRoot);
    setProjectOverride(projectRoot, current === undefined ? true : !current);
    updateStatusBar(statusBarItem, vscodeApi.window.activeTextEditor?.document.fileName);
  });

  const rescanCommand = vscodeApi.commands.registerCommand('dragonruby.rescanEngine', async () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    const status = vscodeApi.window.setStatusBarMessage('DragonRuby: rescan in progress…');
    try {
      await rescanProjectEngine(projectRoot);
      const fileName = vscodeApi.window.activeTextEditor?.document.fileName;
      if (fileName) {
        updateStatusBar(statusBarItem, fileName);
      }
      void vscodeApi.window.showInformationMessage('DragonRuby engine rescan complete for this project.');
    } finally {
      status.dispose();
    }
  });

  const clearDerivedCommand = vscodeApi.commands.registerCommand('dragonruby.clearDerivedCompletions', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    const status = vscodeApi.window.setStatusBarMessage('DragonRuby: clearing derived completions…');
    try {
      clearProjectCompletionMap(projectRoot);
      void vscodeApi.window.showInformationMessage('Cleared engine-derived completions for this project.');
    } finally {
      status.dispose();
    }
  });

  const projectStatusCommand = vscodeApi.commands.registerCommand('dragonruby.showProjectStatus', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    const statusSummary = getProjectStatusSummary(projectRoot);
    void vscodeApi.window.showInformationMessage(`DragonRuby project status: ${statusSummary}`);
  });

  async function resetSettingIfNeeded(key: string): Promise<void> {
    if (!runtime) {
      return;
    }

    const config = runtime.workspace.getConfiguration('dragonruby-autocomplete');
    const inspected = config.inspect<boolean>(key);

    if (inspected?.workspaceValue !== undefined) {
      await config.update(key, false, runtime.ConfigurationTarget.Workspace);
      return;
    }

    if (inspected?.globalValue !== undefined) {
      await config.update(key, false, runtime.ConfigurationTarget.Global);
      return;
    }

    await config.update(key, false, runtime.ConfigurationTarget.Workspace);
  }

  const configurationListener = vscodeApi.workspace.onDidChangeConfiguration(async (event) => {
    if (!event.affectsConfiguration('dragonruby-autocomplete.rescanEngine') &&
        !event.affectsConfiguration('dragonruby-autocomplete.clearDerivedCompletions')) {
      return;
    }

    const config = vscodeApi.workspace.getConfiguration('dragonruby-autocomplete');
    const projectRoot = getCurrentProjectRoot();

    if (!projectRoot) {
      return;
    }

    if (event.affectsConfiguration('dragonruby-autocomplete.rescanEngine') && config.get<boolean>('rescanEngine')) {
      const status = vscodeApi.window.setStatusBarMessage('DragonRuby: settings-triggered rescan in progress…');
      try {
        await rescanProjectEngine(projectRoot);
        await resetSettingIfNeeded('rescanEngine');
        void vscodeApi.window.showInformationMessage('DragonRuby engine rescan run from settings.');
      } finally {
        status.dispose();
      }
    }

    if (event.affectsConfiguration('dragonruby-autocomplete.clearDerivedCompletions') && config.get<boolean>('clearDerivedCompletions')) {
      const status = vscodeApi.window.setStatusBarMessage('DragonRuby: clearing derived completions from settings…');
      try {
        clearProjectCompletionMap(projectRoot);
        await resetSettingIfNeeded('clearDerivedCompletions');
        void vscodeApi.window.showInformationMessage('Cleared engine-derived completions from settings.');
      } finally {
        status.dispose();
      }
    }
  });

  // When a Ruby file is opened, re-check whether it belongs to a DragonRuby project.
  // This helps recognize non-default folder names or non-standard layouts.
  const openListener = vscodeApi.workspace.onDidOpenTextDocument((document) => {
    if (document.fileName.toLowerCase().endsWith('.rb')) {
      notifyDragonRubyDetected(document);
      updateStatusBar(statusBarItem, document.fileName);
    }
  });

  // When the active editor changes, check the current file again so the plugin can
  // activate immediately for newly opened DragonRuby files.
  const activeEditorListener = vscodeApi.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && editor.document.fileName.toLowerCase().endsWith('.rb')) {
      notifyDragonRubyDetected(editor.document);
      updateStatusBar(statusBarItem, editor.document.fileName);
    }
  });

  context.subscriptions.push(
    completionDisposable,
    keywordDisposable,
    openListener,
    activeEditorListener,
    statusBarItem,
    enableCommand,
    disableCommand,
    resetCommand,
    toggleCommand,
    rescanCommand,
    clearDerivedCommand,
    projectStatusCommand,
    configurationListener
  );
}

export function deactivate() {}
