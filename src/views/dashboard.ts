import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { getPanelHtml, SpecItem, HistoryItem, ModelItem } from './panelHtml.js';
import {
  interactiveUploadSpec,
  interactiveGenerateDoc,
  interactiveCompare,
  interactiveShowGaps,
  interactiveShowStatus,
  interactiveImplementRequirement,
} from '../commands/interactiveCommands.js';

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'specSync.dashboardView';
  private _view?: vscode.WebviewView;
  private _selectedModelId?: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _storage?: StorageManager,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const nonce = getNonce();
    webviewView.webview.html = getPanelHtml(nonce, webviewView.webview);

    // Restore saved model selection
    this._selectedModelId = this._context.workspaceState.get<string>('specSync.selectedModelId');

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        await this._handleMessage(msg);
      } catch (err) {
        console.error('[Spec Sync]', err);
        vscode.window.showErrorMessage(`Spec Sync: ${err}`);
        this._postLoaded();
      }
    });
  }

  // ── Public API for external refresh ──

  public async refresh() {
    await this._sendAllData();
  }

  public showLoading(text: string) {
    this._view?.webview.postMessage({ type: 'loading', text });
  }

  public hideLoading() {
    this._postLoaded();
  }

  // ── Message handling ──

  private async _handleMessage(msg: any) {
    switch (msg.type) {
      case 'ready':
        await this._sendAllData();
        break;

      case 'selectModel':
        this._selectedModelId = msg.modelId;
        await this._context.workspaceState.update('specSync.selectedModelId', msg.modelId);
        break;

      case 'generateDoc':
        this._postLoading('Generation de la documentation...');
        await interactiveGenerateDoc(this._context);
        this._postLoaded();
        break;

      case 'uploadSpec':
        if (!this._storage) { vscode.window.showErrorMessage('Aucun workspace ouvert'); return; }
        await interactiveUploadSpec(this._context, this._storage);
        await this._sendSpecs();
        this._switchTab('specs');
        break;

      case 'compare':
        if (!this._storage) { vscode.window.showErrorMessage('Aucun workspace ouvert'); return; }
        this._postLoading('Comparaison en cours...');
        {
          const result = await interactiveCompare(this._context, this._storage, this._selectedModelId);
          await this._sendAllData();
          if (result) {
            this._sendComparisonDetails(result);
            this._switchTab('results');
          }
        }
        this._postLoaded();
        break;

      case 'compareSpec':
        if (!this._storage || !msg.specId) return;
        this._postLoading('Comparaison en cours...');
        {
          const result = await interactiveCompare(this._context, this._storage, this._selectedModelId, msg.specId);
          await this._sendAllData();
          if (result) {
            this._sendComparisonDetails(result);
            this._switchTab('results');
          }
        }
        this._postLoaded();
        break;

      case 'implementRequirement':
        this._postLoading(`Implementation de ${msg.requirementId}...`);
        await interactiveImplementRequirement(
          this._context,
          msg.requirementId,
          msg.requirementText,
          msg.suggestedActions || [],
          msg.matchedFiles || [],
          this._selectedModelId,
        );
        this._postLoaded();
        break;

      case 'showGaps':
        if (!this._storage) return;
        await interactiveShowGaps(this._context, this._storage);
        break;

      case 'viewSpec':
        if (!this._storage || !msg.specId) return;
        {
          const comparison = await this._storage.getLatestComparison(msg.specId);
          if (comparison) {
            this._sendComparisonDetails(comparison);
            this._switchTab('results');
          } else {
            vscode.window.showInformationMessage('Aucune comparaison pour cette spec. Lancez une comparaison.');
          }
        }
        break;

      case 'deleteSpec':
        if (!this._storage || !msg.specId) return;
        const confirm = await vscode.window.showWarningMessage(
          'Supprimer cette specification et toutes ses comparaisons ?',
          { modal: true },
          'Supprimer',
        );
        if (confirm === 'Supprimer') {
          await this._storage.deleteSpec(msg.specId);
          await this._sendAllData();
        }
        break;

      case 'exportReport':
        vscode.commands.executeCommand('workbench.action.chat.open', { query: '@specsync /compare export' });
        break;
    }
  }

  // ── Data senders ──

  private async _sendAllData() {
    await Promise.all([
      this._sendModels(),
      this._sendSpecs(),
      this._sendHistory(),
    ]);
  }

  private async _sendModels() {
    const models: ModelItem[] = [];
    try {
      const chatModels = await vscode.lm.selectChatModels();
      for (const m of chatModels) {
        models.push({
          id: m.id,
          name: m.name || m.id,
          vendor: m.vendor || '',
          family: m.family || '',
        });
      }
    } catch {
      // Copilot may not be available
    }
    this._view?.webview.postMessage({
      type: 'updateModels',
      models,
      selectedModelId: this._selectedModelId || (models.length > 0 ? models[0].id : ''),
    });
  }

  private async _sendSpecs() {
    if (!this._storage) {
      this._view?.webview.postMessage({ type: 'updateSpecs', specs: [] });
      return;
    }

    const specMetas = await this._storage.listSpecs();
    const specs: SpecItem[] = [];

    for (const meta of specMetas) {
      const comparison = await this._storage.getLatestComparison(meta.id);
      const s = comparison?.summary;
      const pct = s ? Math.round((s.implemented / s.total) * 100) : null;

      specs.push({
        id: meta.id,
        title: meta.title,
        version: meta.version,
        uploadedAt: meta.uploadedAt,
        requirementCount: meta.requirementCount ?? 0,
        compliancePct: pct,
        implemented: s?.implemented ?? 0,
        partial: s?.partial ?? 0,
        notImplemented: s?.notImplemented ?? 0,
        divergent: s?.divergent ?? 0,
      });
    }

    this._view?.webview.postMessage({ type: 'updateSpecs', specs });
  }

  private async _sendHistory() {
    if (!this._storage) {
      this._view?.webview.postMessage({ type: 'updateHistory', history: [] });
      return;
    }

    const specMetas = await this._storage.listSpecs();
    const items: HistoryItem[] = [];

    for (const meta of specMetas) {
      const comparisons = await this._storage.listComparisons(meta.id);
      for (let i = 0; i < Math.min(comparisons.length, 20); i++) {
        const c = comparisons[i];
        const s = c.summary;
        const pct = Math.round((s.implemented / s.total) * 100);

        let delta = 'base';
        if (i < comparisons.length - 1) {
          const prev = comparisons[i + 1];
          const prevPct = Math.round((prev.summary.implemented / prev.summary.total) * 100);
          const diff = pct - prevPct;
          delta = diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : '=';
        }

        items.push({
          specTitle: meta.title,
          date: new Date(c.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
          pct,
          delta,
          gitHash: c.gitCommitHash ? c.gitCommitHash.substring(0, 7) : '-',
          implemented: s.implemented,
          total: s.total,
        });
      }
    }

    // Sort newest first
    items.sort((a, b) => b.date.localeCompare(a.date));

    this._view?.webview.postMessage({ type: 'updateHistory', history: items });
  }

  private _sendComparisonDetails(comparison: any) {
    // Find spec title
    const specTitle = comparison.specId || 'Comparaison';
    this._view?.webview.postMessage({
      type: 'updateResults',
      specTitle,
      details: (comparison.details || []).map((d: any) => ({
        requirementId: d.requirementId,
        requirementText: d.requirementText,
        status: d.status,
        confidence: d.confidence,
        explanation: d.explanation || '',
        matchedFiles: d.matchedFiles || [],
        suggestedActions: d.suggestedActions || [],
      })),
    });
  }

  private _postLoading(text: string) {
    this._view?.webview.postMessage({ type: 'loading', text });
  }

  private _postLoaded() {
    this._view?.webview.postMessage({ type: 'loaded' });
  }

  private _switchTab(tab: string) {
    this._view?.webview.postMessage({ type: 'switchTab', tab });
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
