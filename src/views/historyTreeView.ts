import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';

interface HistoryTreeItemData {
  label: string;
  description?: string;
  tooltip?: string;
  collapsible: boolean;
}

export class HistoryTreeDataProvider implements vscode.TreeDataProvider<HistoryTreeItemData> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HistoryTreeItemData | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private storage: StorageManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: HistoryTreeItemData): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label);
    item.collapsibleState = element.collapsible
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.iconPath = new vscode.ThemeIcon('history');
    return item;
  }

  async getChildren(element?: HistoryTreeItemData): Promise<HistoryTreeItemData[]> {
    if (element) {
      return [];
    }

    const specs = await this.storage.listSpecs();
    const items: HistoryTreeItemData[] = [];

    for (const spec of specs) {
      const comparisons = await this.storage.listComparisons(spec.id);

      for (const comparison of comparisons.slice(0, 10)) {
        const date = new Date(comparison.timestamp).toLocaleDateString('fr-FR');
        const s = comparison.summary;
        const pct = s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0;

        items.push({
          label: `${date} - ${pct}%`,
          description: `${s.implemented}/${s.total} impl.`,
          tooltip: `${spec.title} v${spec.version}\nCommit: ${comparison.gitCommitHash || 'N/A'}\nImpl: ${s.implemented}, Partiel: ${s.partial}, Manquant: ${s.notImplemented}`,
          collapsible: false,
        });
      }
    }

    return items;
  }
}
