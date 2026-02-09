import * as vscode from 'vscode';
import { ComparisonSummary } from '../types.js';

export function createStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'specSync.showCompliance';
  item.text = '$(file-text) Spec Sync';
  item.tooltip = 'Copilot Spec Sync - Click to view status';
  item.show();
  return item;
}

export function getComplianceLevel(pct: number): { label: string; icon: string } {
  if (pct === 100) { return { label: 'Perfect', icon: '$(check-all)' }; }
  if (pct >= 95) { return { label: 'Excellent', icon: '$(pass-filled)' }; }
  if (pct >= 90) { return { label: 'Very Good', icon: '$(pass)' }; }
  if (pct >= 80) { return { label: 'Good', icon: '$(check)' }; }
  if (pct >= 70) { return { label: 'Fair', icon: '$(info)' }; }
  if (pct >= 60) { return { label: 'Average', icon: '$(warning)' }; }
  if (pct >= 50) { return { label: 'Insufficient', icon: '$(warning)' }; }
  if (pct >= 40) { return { label: 'Weak', icon: '$(error)' }; }
  if (pct >= 25) { return { label: 'Very Weak', icon: '$(error)' }; }
  if (pct >= 10) { return { label: 'Critical', icon: '$(error)' }; }
  return { label: 'Not Started', icon: '$(circle-slash)' };
}

export function updateStatusBar(item: vscode.StatusBarItem, summary?: ComparisonSummary): void {
  if (!summary || summary.total === 0) {
    item.text = '$(file-text) Spec Sync';
    item.tooltip = 'No comparison available';
    return;
  }

  const pct = Math.round((summary.implemented / summary.total) * 100);
  const level = getComplianceLevel(pct);
  item.text = `${level.icon} Spec Sync: ${pct}% (${level.label})`;
  item.tooltip = `Compliance: ${pct}% - ${level.label} (${summary.implemented}/${summary.total})\nPartial: ${summary.partial} | Missing: ${summary.notImplemented} | Divergent: ${summary.divergent}`;

  if (pct >= 90) {
    item.backgroundColor = undefined;
  } else if (pct >= 80) {
    item.backgroundColor = undefined;
  } else if (pct >= 60) {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }
}
