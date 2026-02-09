import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { AnalysisManager } from '../analysis/analysisManager.js';
import { getPanelHtml, SpecItem, HistoryItem, ModelItem } from './panelHtml.js';
import { getWorkspaceProjects } from '../utils/fileUtils.js';
import { ProjectInfo } from '../types.js';
import {
  interactiveUploadSpec,
  interactiveGenerateDoc,
  interactiveShowGaps,
  interactiveShowStatus,
  interactiveImplementRequirement,
} from '../commands/interactiveCommands.js';

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'specSync.dashboardView';
  private _view?: vscode.WebviewView;
  private _selectedModelId?: string;
  private _analysisManager?: AnalysisManager;
  private _jobListener?: vscode.Disposable;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _storage?: StorageManager,
  ) {
    if (_storage) {
      this._analysisManager = new AnalysisManager(_storage);
    }
  }

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

    // Listen to analysis job updates
    if (this._analysisManager) {
      this._jobListener?.dispose();
      this._jobListener = this._analysisManager.onDidUpdateJob((job) => {
        this._sendJobs();
        // Also refresh specs/history/results when a job completes
        if (job.status === 'completed') {
          this._sendSpecs();
          this._sendHistory();
          this._sendVersion();
          this._sendLatestResults();
        }
      });
    }

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        await this._handleMessage(msg);
      } catch (err) {
        console.error('[Spec Sync]', err);
        vscode.window.showErrorMessage(`Spec Sync: ${err}`);
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
    this._view?.webview.postMessage({ type: 'loaded' });
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
        await interactiveGenerateDoc(this._context);
        break;

      case 'uploadSpec':
        if (!this._storage) { vscode.window.showErrorMessage('No workspace open'); return; }
        await interactiveUploadSpec(this._context, this._storage);
        await this._sendSpecs();
        this._switchTab('specs');
        break;

      case 'compare':
        await this._launchComparison();
        break;

      case 'compareSpec':
        await this._launchComparison(msg.specId);
        break;

      case 'cancelJob':
        if (this._analysisManager && msg.jobId) {
          this._analysisManager.cancelJob(msg.jobId);
        }
        break;

      case 'removeJob':
        if (this._analysisManager && msg.jobId) {
          this._analysisManager.removeJob(msg.jobId);
          this._sendJobs();
        }
        break;

      case 'implementRequirement':
        await interactiveImplementRequirement(
          this._context,
          msg.requirementId,
          msg.requirementText,
          msg.suggestedActions || [],
          msg.matchedFiles || [],
          this._selectedModelId,
        );
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
            const spec = await this._storage.getSpec(msg.specId);
            this._sendComparisonDetails(comparison, spec?.title);
            this._switchTab('results');
          } else {
            vscode.window.showInformationMessage('No comparison for this spec. Run a comparison first.');
          }
        }
        break;

      case 'deleteSpec':
        if (!this._storage || !msg.specId) return;
        {
          const confirm = await vscode.window.showWarningMessage(
            'Delete this specification and all its comparisons?',
            { modal: true },
            'Delete',
          );
          if (confirm === 'Delete') {
            await this._storage.deleteSpec(msg.specId);
            await this._sendAllData();
          }
        }
        break;

      case 'exportReport':
        vscode.commands.executeCommand('workbench.action.chat.open', { query: '@specsync /compare export' });
        break;
    }
  }

  // ── Launch comparison (non-blocking) ──

  private async _launchComparison(specId?: string) {
    if (!this._storage || !this._analysisManager) {
      vscode.window.showErrorMessage('No workspace open');
      return;
    }

    // 1. Select spec
    const specs = await this._storage.listSpecs();
    if (specs.length === 0) {
      const upload = await vscode.window.showInformationMessage(
        'No specification found. Would you like to upload one?',
        'Yes', 'No',
      );
      if (upload === 'Yes') {
        await interactiveUploadSpec(this._context, this._storage);
        await this._sendSpecs();
      }
      return;
    }

    let selectedSpec: any;
    if (specId) {
      selectedSpec = specs.find(s => s.id === specId);
      if (!selectedSpec) {
        vscode.window.showErrorMessage('Specification not found');
        return;
      }
    } else if (specs.length === 1) {
      selectedSpec = specs[0];
    } else {
      const items = specs.map(s => ({
        label: s.title,
        description: `v${s.version}`,
        spec: s,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a specification to compare',
      });
      if (!picked) return;
      selectedSpec = picked.spec;
    }

    // 2. Select sub-projects
    const allProjects = await getWorkspaceProjects();
    if (allProjects.length === 0) {
      vscode.window.showErrorMessage('No projects detected in the workspace');
      return;
    }

    let selectedProjects: ProjectInfo[];
    if (allProjects.length === 1) {
      selectedProjects = allProjects;
    } else {
      const projectItems = allProjects.map(p => ({
        label: p.name,
        description: `${p.type} · ${p.language}`,
        detail: p.path,
        picked: false,
        project: p,
      }));
      const pickedProjects = await vscode.window.showQuickPick(projectItems, {
        placeHolder: 'Select the sub-project(s) to analyze',
        canPickMany: true,
      });
      if (!pickedProjects || pickedProjects.length === 0) return;
      selectedProjects = pickedProjects.map(p => p.project);
    }

    // Save for reuse in implement
    await this._context.workspaceState.update('specSync.selectedProjects', selectedProjects);

    // 3. Resolve LLM model
    let model: vscode.LanguageModelChat | undefined;
    try {
      const allModels = await vscode.lm.selectChatModels();
      if (allModels && Array.isArray(allModels)) {
        if (this._selectedModelId) {
          model = allModels.find(m => m.id === this._selectedModelId);
        }
        if (!model && allModels.length > 0) {
          model = allModels[0];
        }
      }
    } catch (err) {
      console.error('[Spec Sync] Error loading models:', err);
    }

    if (!model) {
      vscode.window.showErrorMessage('No language model available. Is GitHub Copilot enabled?');
      return;
    }

    // 4. Load spec
    const spec = await this._storage.getSpec(selectedSpec.id);
    if (!spec) {
      vscode.window.showErrorMessage('Unable to load the specification');
      return;
    }

    console.log(`[Spec Sync] Dashboard launching analysis:`);
    console.log(`  - Spec ID: ${selectedSpec.id}`);
    console.log(`  - Spec has ${spec.sections?.length || 0} sections`);
    console.log(`  - Selected ${selectedProjects.length} projects:`, selectedProjects.map(p => `${p.name} at ${p.path}`));

    // 5. Launch analysis (NON-BLOCKING!)
    this._analysisManager.startAnalysis(
      selectedSpec.id,
      selectedSpec.title,
      selectedSpec.version,
      spec.sections,
      selectedProjects,
      model,
    );

    // Switch to analyses tab to show progress
    this._switchTab('analyses');
  }

  // ── Data senders ──

  private async _sendAllData() {
    await Promise.all([
      this._sendModels(),
      this._sendSpecs(),
      this._sendHistory(),
      this._sendVersion(),
      this._sendLatestResults(),
    ]);
    this._sendJobs();
  }

  private async _sendModels() {
    const models: ModelItem[] = [];
    try {
      const chatModels = await vscode.lm.selectChatModels();
      if (chatModels && Array.isArray(chatModels)) {
        for (const m of chatModels) {
          models.push({
            id: m.id,
            name: m.name || m.id,
            vendor: m.vendor || '',
            family: m.family || '',
          });
        }
      }
    } catch (err) {
      // Copilot may not be available
      console.error('[Spec Sync] Error loading models:', err);
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

        // Use average confidence for consistency with the Results tab
        const avgConfidence = c.details && c.details.length > 0
          ? Math.round(c.details.reduce((sum: number, d: any) => sum + (d.confidence || 0), 0) / c.details.length)
          : (s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0);

        let delta = 'base';
        if (i < comparisons.length - 1) {
          const prev = comparisons[i + 1];
          const prevAvg = prev.details && prev.details.length > 0
            ? Math.round(prev.details.reduce((sum: number, d: any) => sum + (d.confidence || 0), 0) / prev.details.length)
            : (prev.summary.total > 0 ? Math.round((prev.summary.implemented / prev.summary.total) * 100) : 0);
          const diff = avgConfidence - prevAvg;
          delta = diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : '=';
        }

        items.push({
          specTitle: meta.title,
          date: new Date(c.timestamp).toLocaleString('en-US', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit',
            hour12: true 
          }),
          rawTimestamp: c.timestamp,
          pct: avgConfidence,
          delta,
          gitHash: c.gitCommitHash ? c.gitCommitHash.substring(0, 7) : '-',
          implemented: s.implemented,
          total: s.total,
        });
      }
    }

    // Sort newest first by raw ISO timestamp
    items.sort((a, b) => b.rawTimestamp.localeCompare(a.rawTimestamp));

    this._view?.webview.postMessage({ type: 'updateHistory', history: items });
  }

  private _sendJobs() {
    if (!this._analysisManager) {
      this._view?.webview.postMessage({ type: 'updateJobs', jobs: [] });
      return;
    }
    const jobs = this._analysisManager.getJobs();
    this._view?.webview.postMessage({ type: 'updateJobs', jobs });
  }

  private _sendComparisonDetails(comparison: any, specTitle?: string) {
    this._view?.webview.postMessage({
      type: 'updateResults',
      specTitle: specTitle || 'Results',
      summary: comparison.summary || null,
      timestamp: comparison.timestamp || null,
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

  private _switchTab(tab: string) {
    this._view?.webview.postMessage({ type: 'switchTab', tab });
  }

  private async _sendLatestResults() {
    if (!this._storage) return;
    const comparison = await this._storage.getLatestComparisonForAnySpec();
    if (comparison) {
      const spec = await this._storage.getSpec(comparison.specId);
      this._sendComparisonDetails(comparison, spec?.title);
    }
  }

  private async _sendVersion() {
    if (!this._storage) {
      this._view?.webview.postMessage({ type: 'updateVersion', version: 0 });
      return;
    }
    const version = await this._storage.getPromptVersion();
    this._view?.webview.postMessage({ type: 'updateVersion', version });
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
