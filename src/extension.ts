import * as path from 'path';
import * as vscode from 'vscode';
import { clearProjectCompletionMap, getProjectCompletionMap, initializeEngineCacheState, rescanProjectEngine } from './engine-scan';
import { createDragonRubyCompletionProvider, createDragonRubySnippetProvider, createKeywordProvider, dragonRubySnippetTriggerCharacters } from './providers';
import { clearProjectOverride, getProjectOverride, getProjectStatusSummary, initializeProjectDetectionState, notifyDragonRubyDetected, setProjectOverride } from './project-detection';

// -----------------------------------------------------------------------------
// Extension entry point
// -----------------------------------------------------------------------------
// This file is intentionally small. It wires together the project detection and
// completion providers so the extension remains modular and easier to maintain.
// -----------------------------------------------------------------------------

function getCurrentProjectRoot(fileName?: string): string | undefined {
  if (!fileName) {
    const activeEditor = vscode.window.activeTextEditor;
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

function updateStatusBar(statusBar: vscode.StatusBarItem, fileName?: string): void {
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

export function activate(context: vscode.ExtensionContext) {
  initializeProjectDetectionState(context.workspaceState);
  initializeEngineCacheState(context.workspaceState);

  // Register the main completion provider that understands DragonRuby runtime objects.
  const completionProvider = createDragonRubyCompletionProvider();

  // Register common snippet templates such as tick, state, and rendering helpers.
  const snippetProvider = createDragonRubySnippetProvider();

  // Register a secondary provider for plain Ruby keywords when the DragonRuby match is loose.
  const keywordProvider = createKeywordProvider();

  const completionDisposable = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'ruby' },
    completionProvider,
    '.', ' ', ':', '[', 'a', 'g', 'k', 'm', 'o', 's', 't'
  );

  const snippetDisposable = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'ruby' },
    snippetProvider,
    ...dragonRubySnippetTriggerCharacters
  );

  const keywordDisposable = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'ruby' },
    keywordProvider,
    'd', 's', 'l', 'k', 'm', 'r'
  );

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
  statusBarItem.command = 'dragonruby.toggleProjectAutocomplete';
  updateStatusBar(statusBarItem);

  const enableCommand = vscode.commands.registerCommand('dragonruby.enableProjectAutocomplete', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    setProjectOverride(projectRoot, true);
    updateStatusBar(statusBarItem, vscode.window.activeTextEditor?.document.fileName);
  });

  const disableCommand = vscode.commands.registerCommand('dragonruby.disableProjectAutocomplete', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    setProjectOverride(projectRoot, false);
    updateStatusBar(statusBarItem, vscode.window.activeTextEditor?.document.fileName);
  });

  const resetCommand = vscode.commands.registerCommand('dragonruby.resetProjectAutocomplete', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    clearProjectOverride(projectRoot);
    updateStatusBar(statusBarItem, vscode.window.activeTextEditor?.document.fileName);
  });

  const toggleCommand = vscode.commands.registerCommand('dragonruby.toggleProjectAutocomplete', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    const current = getProjectOverride(projectRoot);
    setProjectOverride(projectRoot, current === undefined ? true : !current);
    updateStatusBar(statusBarItem, vscode.window.activeTextEditor?.document.fileName);
  });

  const rescanCommand = vscode.commands.registerCommand('dragonruby.rescanEngine', async () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    const status = vscode.window.setStatusBarMessage('DragonRuby: rescan in progress…');
    try {
      await rescanProjectEngine(projectRoot);
      const fileName = vscode.window.activeTextEditor?.document.fileName;
      if (fileName) {
        updateStatusBar(statusBarItem, fileName);
      }
      void vscode.window.showInformationMessage('DragonRuby engine rescan complete for this project.');
    } finally {
      status.dispose();
    }
  });

  const clearDerivedCommand = vscode.commands.registerCommand('dragonruby.clearDerivedCompletions', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    const status = vscode.window.setStatusBarMessage('DragonRuby: clearing derived completions…');
    try {
      clearProjectCompletionMap(projectRoot);
      void vscode.window.showInformationMessage('Cleared engine-derived completions for this project.');
    } finally {
      status.dispose();
    }
  });

  const projectStatusCommand = vscode.commands.registerCommand('dragonruby.showProjectStatus', () => {
    const projectRoot = getCurrentProjectRoot();
    if (!projectRoot) {
      return;
    }

    const statusSummary = getProjectStatusSummary(projectRoot);
    void vscode.window.showInformationMessage(`DragonRuby project status: ${statusSummary}`);
  });

  async function resetSettingIfNeeded(key: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('dragonruby-autocomplete');
    const inspected = config.inspect<boolean>(key);

    if (inspected?.workspaceValue !== undefined) {
      await config.update(key, false, vscode.ConfigurationTarget.Workspace);
      return;
    }

    if (inspected?.globalValue !== undefined) {
      await config.update(key, false, vscode.ConfigurationTarget.Global);
      return;
    }

    await config.update(key, false, vscode.ConfigurationTarget.Workspace);
  }

  const configurationListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (!event.affectsConfiguration('dragonruby-autocomplete.rescanEngine') &&
        !event.affectsConfiguration('dragonruby-autocomplete.clearDerivedCompletions')) {
      return;
    }

    const config = vscode.workspace.getConfiguration('dragonruby-autocomplete');
    const projectRoot = getCurrentProjectRoot();

    if (!projectRoot) {
      return;
    }

    if (event.affectsConfiguration('dragonruby-autocomplete.rescanEngine') && config.get<boolean>('rescanEngine')) {
      const status = vscode.window.setStatusBarMessage('DragonRuby: settings-triggered rescan in progress…');
      try {
        await rescanProjectEngine(projectRoot);
        await resetSettingIfNeeded('rescanEngine');
        void vscode.window.showInformationMessage('DragonRuby engine rescan run from settings.');
      } finally {
        status.dispose();
      }
    }

    if (event.affectsConfiguration('dragonruby-autocomplete.clearDerivedCompletions') && config.get<boolean>('clearDerivedCompletions')) {
      const status = vscode.window.setStatusBarMessage('DragonRuby: clearing derived completions from settings…');
      try {
        clearProjectCompletionMap(projectRoot);
        await resetSettingIfNeeded('clearDerivedCompletions');
        void vscode.window.showInformationMessage('Cleared engine-derived completions from settings.');
      } finally {
        status.dispose();
      }
    }
  });

  // When a Ruby file is opened, re-check whether it belongs to a DragonRuby project.
  // This helps recognize non-default folder names or non-standard layouts.
  const openListener = vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.fileName.toLowerCase().endsWith('.rb')) {
      notifyDragonRubyDetected(document);
      updateStatusBar(statusBarItem, document.fileName);
    }
  });

  // When the active editor changes, check the current file again so the plugin can
  // activate immediately for newly opened DragonRuby files.
  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && editor.document.fileName.toLowerCase().endsWith('.rb')) {
      notifyDragonRubyDetected(editor.document);
      updateStatusBar(statusBarItem, editor.document.fileName);
    }
  });

  context.subscriptions.push(
    completionDisposable,
    snippetDisposable,
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
