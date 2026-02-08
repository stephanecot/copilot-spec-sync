import * as vscode from 'vscode';
import { ComparisonSummary } from '../types.js';

export function createStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'specSync.showCompliance';
  item.text = '$(file-text) Spec Sync';
  item.tooltip = 'Copilot Spec Sync - Cliquez pour voir le statut';
  item.show();
  return item;
}

export function updateStatusBar(item: vscode.StatusBarItem, summary?: ComparisonSummary): void {
  if (!summary || summary.total === 0) {
    item.text = '$(file-text) Spec Sync';
    item.tooltip = 'Aucune comparaison disponible';
    return;
  }

  const pct = Math.round((summary.implemented / summary.total) * 100);
  item.text = `$(file-text) Spec Sync: ${pct}%`;
  item.tooltip = `Conformité: ${pct}% (${summary.implemented}/${summary.total})\nPartiel: ${summary.partial} | Manquant: ${summary.notImplemented} | Divergent: ${summary.divergent}`;

  if (pct >= 80) {
    item.backgroundColor = undefined;
  } else if (pct >= 50) {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }
}
