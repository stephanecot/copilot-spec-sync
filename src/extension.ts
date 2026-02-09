import * as vscode from 'vscode';
import { createSpecSyncParticipant } from './participant/specSyncParticipant.js';
import { DashboardViewProvider } from './views/dashboard.js';
import { createStatusBarItem, updateStatusBar } from './views/statusBar.js';
import { SpecDecorationProvider } from './views/codeDecorations.js';
import { StorageManager } from './spec-comparator/storageManager.js';
import { AnalyzeProjectTool } from './tools/analyzeProjectTool.js';
import { CompareRequirementTool } from './tools/compareRequirementTool.js';
import { GenerateCodeTool } from './tools/generateCodeTool.js';
import { getStoragePath } from './utils/fileUtils.js';
import {
  interactiveUploadSpec,
  interactiveCompare,
  interactiveGenerateDoc,
  interactiveShowGaps,
  interactiveShowStatus,
} from './commands/interactiveCommands.js';

export function activate(context: vscode.ExtensionContext) {
  console.log('[Spec Sync] Extension activating...');
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const storagePath = workspaceFolder ? getStoragePath(workspaceFolder) : undefined;
  const storage = storagePath ? new StorageManager(storagePath) : undefined;

  console.log('[Spec Sync] Storage path:', storagePath);

  // Chat Participant
  const participant = createSpecSyncParticipant(context, storage);
  context.subscriptions.push(participant);

  // Language Model Tools
  context.subscriptions.push(
    vscode.lm.registerTool('spec-sync_analyze_project', new AnalyzeProjectTool()),
    vscode.lm.registerTool('spec-sync_compare_requirement', new CompareRequirementTool(storage)),
    vscode.lm.registerTool('spec-sync_generate_code', new GenerateCodeTool()),
  );

  // Dashboard WebView (single unified sidebar panel)
  const dashboardProvider = new DashboardViewProvider(context.extensionUri, context, storage);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewType, dashboardProvider),
  );

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('specSync.refreshTrees', () => {
      dashboardProvider.refresh();
    }),
  );

  // StatusBar
  const showStatusBar = vscode.workspace.getConfiguration('specSync.ui').get<boolean>('showStatusBar', true);
  if (showStatusBar && storage) {
    const statusBarItem = createStatusBarItem();
    context.subscriptions.push(statusBarItem);

    storage.getLatestComparisonForAnySpec().then(comparison => {
      if (comparison) {
        updateStatusBar(statusBarItem, comparison.summary);
      }
    });
  }

  // Code Decorations
  const showDecorations = vscode.workspace.getConfiguration('specSync.ui').get<boolean>('showCodeDecorations', true);
  if (showDecorations && storage) {
    const decorationProvider = new SpecDecorationProvider(storage);
    context.subscriptions.push(decorationProvider);
  }

  // Palette Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('specSync.uploadSpec', () => {
      if (storage) {
        interactiveUploadSpec(context, storage);
      } else {
        vscode.window.showErrorMessage('No workspace open');
      }
    }),
    vscode.commands.registerCommand('specSync.generateDoc', () => {
      interactiveGenerateDoc(context);
    }),
    vscode.commands.registerCommand('specSync.compare', () => {
      if (storage) {
        interactiveCompare(context, storage);
      } else {
        vscode.window.showErrorMessage('No workspace open');
      }
    }),
    vscode.commands.registerCommand('specSync.showCompliance', () => {
      if (storage) {
        interactiveShowStatus(context, storage);
      } else {
        vscode.window.showInformationMessage('No comparison available');
      }
    }),
    vscode.commands.registerCommand('specSync.showGaps', () => {
      if (storage) {
        interactiveShowGaps(context, storage);
      } else {
        vscode.window.showInformationMessage('No comparison available');
      }
    }),
    vscode.commands.registerCommand('specSync.exportMarkdown', () => {
      vscode.commands.executeCommand('workbench.action.chat.open', { query: '@specsync /doc export md' });
    }),
    vscode.commands.registerCommand('specSync.exportDocx', () => {
      vscode.commands.executeCommand('workbench.action.chat.open', { query: '@specsync /doc export docx' });
    }),
    vscode.commands.registerCommand('specSync.exportReport', () => {
      vscode.commands.executeCommand('workbench.action.chat.open', { query: '@specsync /compare export' });
    }),
  );

  console.log('[Spec Sync] Extension activated successfully');
}

export function deactivate() {}
