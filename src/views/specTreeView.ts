import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { ComparisonStatus } from '../types.js';

type TreeItemType = 'spec' | 'status-group' | 'requirement';

interface SpecTreeItemData {
  type: TreeItemType;
  label: string;
  specId?: string;
  status?: ComparisonStatus;
  description?: string;
  children?: SpecTreeItemData[];
}

export class SpecTreeDataProvider implements vscode.TreeDataProvider<SpecTreeItemData> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SpecTreeItemData | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private storage: StorageManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SpecTreeItemData): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label);

    if (element.type === 'spec') {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      item.description = element.description;
      item.iconPath = new vscode.ThemeIcon('file-text');
    } else if (element.type === 'status-group') {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      item.description = element.description;
      item.iconPath = getStatusIcon(element.status);
    } else {
      item.collapsibleState = vscode.TreeItemCollapsibleState.None;
      item.description = element.description;
    }

    return item;
  }

  async getChildren(element?: SpecTreeItemData): Promise<SpecTreeItemData[]> {
    if (!element) {
      return this.getRootItems();
    }
    return element.children || [];
  }

  private async getRootItems(): Promise<SpecTreeItemData[]> {
    const specs = await this.storage.listSpecs();
    const items: SpecTreeItemData[] = [];

    for (const spec of specs) {
      const comparison = await this.storage.getLatestComparison(spec.id);
      const pct = comparison
        ? Math.round((comparison.summary.implemented / comparison.summary.total) * 100)
        : 0;

      const children: SpecTreeItemData[] = [];

      if (comparison) {
        const s = comparison.summary;
        if (s.implemented > 0) {
          children.push({
            type: 'status-group',
            label: `Implémentées (${s.implemented})`,
            status: 'implemented',
            description: '',
            children: comparison.details
              .filter(d => d.status === 'implemented')
              .map(d => ({ type: 'requirement' as TreeItemType, label: d.requirementId, description: d.requirementText.substring(0, 50) })),
          });
        }
        if (s.partial > 0) {
          children.push({
            type: 'status-group',
            label: `Partielles (${s.partial})`,
            status: 'partially-implemented',
            description: '',
            children: comparison.details
              .filter(d => d.status === 'partially-implemented')
              .map(d => ({ type: 'requirement' as TreeItemType, label: d.requirementId, description: d.requirementText.substring(0, 50) })),
          });
        }
        if (s.notImplemented > 0) {
          children.push({
            type: 'status-group',
            label: `Manquantes (${s.notImplemented})`,
            status: 'not-implemented',
            description: '',
            children: comparison.details
              .filter(d => d.status === 'not-implemented')
              .map(d => ({ type: 'requirement' as TreeItemType, label: d.requirementId, description: d.requirementText.substring(0, 50) })),
          });
        }
        if (s.divergent > 0) {
          children.push({
            type: 'status-group',
            label: `Divergentes (${s.divergent})`,
            status: 'divergent',
            description: '',
            children: comparison.details
              .filter(d => d.status === 'divergent')
              .map(d => ({ type: 'requirement' as TreeItemType, label: d.requirementId, description: d.requirementText.substring(0, 50) })),
          });
        }
      }

      items.push({
        type: 'spec',
        label: `${spec.title} v${spec.version}`,
        specId: spec.id,
        description: comparison ? `${pct}%` : 'Non analysée',
        children,
      });
    }

    return items;
  }
}

function getStatusIcon(status?: ComparisonStatus): vscode.ThemeIcon {
  switch (status) {
    case 'implemented': return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
    case 'partially-implemented': return new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconQueued'));
    case 'not-implemented': return new vscode.ThemeIcon('close', new vscode.ThemeColor('testing.iconFailed'));
    case 'divergent': return new vscode.ThemeIcon('diff', new vscode.ThemeColor('testing.iconErrored'));
    default: return new vscode.ThemeIcon('circle-outline');
  }
}
