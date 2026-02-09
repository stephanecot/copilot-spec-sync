import * as vscode from 'vscode';

export interface PanelState {
  specs: SpecItem[];
  history: HistoryItem[];
  models: ModelItem[];
  selectedModelId: string;
  activeTab: string;
  loading: string | null;
}

export interface SpecItem {
  id: string;
  title: string;
  version: string;
  uploadedAt: string;
  requirementCount: number;
  compliancePct: number | null;
  implemented: number;
  partial: number;
  notImplemented: number;
  divergent: number;
}

export interface HistoryItem {
  specTitle: string;
  date: string;
  rawTimestamp: string;
  pct: number;
  delta: string;
  gitHash: string;
  implemented: number;
  total: number;
}

export interface ModelItem {
  id: string;
  name: string;
  vendor: string;
  family: string;
}

export interface ComparisonDetail {
  requirementId: string;
  requirementText: string;
  status: string;
  confidence: number;
  explanation: string;
  matchedFiles: { filePath: string; line?: number; snippet?: string }[];
  suggestedActions: string[];
}

export function getPanelHtml(nonce: string, _webview: vscode.Webview): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  /* ── Reset ── */
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  body{
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    overflow-x: hidden;
  }

  /* ── Header ── */
  .header{
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .header h1{
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -.02em;
    margin-bottom: 10px;
    color: var(--vscode-foreground);
  }
  .model-row{
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .model-row label{
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }
  .model-select{
    flex: 1;
    padding: 4px 6px;
    font-size: 12px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 3px;
    outline: none;
  }
  .model-select:focus{
    border-color: var(--vscode-focusBorder);
  }

  /* ── Tabs ── */
  .tabs{
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 0 8px;
  }
  .tab{
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    background: none;
    color: var(--vscode-descriptionForeground);
    border-bottom: 2px solid transparent;
    transition: color .15s, border-color .15s;
  }
  .tab:hover{
    color: var(--vscode-foreground);
  }
  .tab.active{
    color: var(--vscode-foreground);
    border-bottom-color: var(--vscode-focusBorder, var(--vscode-button-background));
  }

  /* ── Tab content ── */
  .tab-content{ display: none; padding: 12px 14px; }
  .tab-content.active{ display: block; }

  /* ── Cards ── */
  .card{
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    padding: 14px;
    margin-bottom: 10px;
  }
  .card-title{
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .card-desc{
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
    line-height: 1.4;
  }

  /* ── Buttons ── */
  .btn{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 500;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    transition: opacity .15s;
    white-space: nowrap;
  }
  .btn:hover{ opacity: .85; }
  .btn:active{ opacity: .7; }
  .btn:disabled{
    opacity: .4;
    cursor: not-allowed;
  }
  .btn-primary{
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-secondary{
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-danger{
    background: var(--vscode-errorForeground);
    color: #fff;
  }
  .btn-sm{ padding: 3px 8px; font-size: 11px; }

  /* ── Progress bar ── */
  .progress-wrap{
    width: 100%;
    height: 6px;
    background: var(--vscode-progressBar-background, rgba(128,128,128,.2));
    border-radius: 3px;
    overflow: hidden;
    margin: 8px 0 4px;
  }
  .progress-bar{
    height: 100%;
    border-radius: 3px;
    transition: width .4s ease;
  }
  .pct-green{ background: var(--vscode-testing-iconPassed, #89d185); }
  .pct-light-green{ background: #6abf69; }
  .pct-yellow-green{ background: #a3c644; }
  .pct-yellow{ background: var(--vscode-editorWarning-foreground, #cca700); }
  .pct-orange{ background: #e88a2e; }
  .pct-red{ background: var(--vscode-errorForeground, #f48771); }
  .pct-dark-red{ background: #d44; }

  .compliance-level{
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 10px;
    display: inline-block;
    margin-top: 4px;
  }
  .level-perfect{ background: rgba(137,209,133,.25); color: #89d185; }
  .level-excellent{ background: rgba(137,209,133,.2); color: #89d185; }
  .level-very-good{ background: rgba(106,191,105,.2); color: #6abf69; }
  .level-good{ background: rgba(163,198,68,.2); color: #a3c644; }
  .level-correct{ background: rgba(204,167,0,.2); color: #cca700; }
  .level-average{ background: rgba(232,138,46,.2); color: #e88a2e; }
  .level-insufficient{ background: rgba(244,135,113,.2); color: #f48771; }
  .level-weak{ background: rgba(221,68,68,.2); color: #d44; }
  .level-very-weak{ background: rgba(221,68,68,.25); color: #d44; }
  .level-critical{ background: rgba(221,68,68,.3); color: #d44; }
  .level-not-started{ background: rgba(128,128,128,.2); color: var(--vscode-descriptionForeground); }

  /* ── Spec card extras ── */
  .spec-meta{
    display: flex;
    gap: 10px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
  }
  .spec-stats{
    display: flex;
    gap: 8px;
    font-size: 11px;
    margin-top: 6px;
  }
  .stat{ display: flex; align-items: center; gap: 3px; }
  .dot{
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
  }
  .dot-green{ background: #89d185; }
  .dot-yellow{ background: #cca700; }
  .dot-red{ background: #f48771; }
  .dot-orange{ background: #ff9966; }

  .spec-actions{
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }

  /* ── History ── */
  .history-item{
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 12px;
  }
  .history-item:last-child{ border-bottom: none; }
  .history-date{
    font-variant-numeric: tabular-nums;
    color: var(--vscode-descriptionForeground);
    min-width: 80px;
  }
  .history-pct{
    font-weight: 600;
    min-width: 38px;
    text-align: right;
  }
  .history-delta{
    font-size: 11px;
    min-width: 40px;
  }
  .delta-up{ color: #89d185; }
  .delta-down{ color: #f48771; }
  .delta-flat{ color: var(--vscode-descriptionForeground); }
  .history-hash{
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  /* ── Empty state ── */
  .empty{
    text-align: center;
    padding: 28px 16px;
    color: var(--vscode-descriptionForeground);
  }
  .empty-icon{ font-size: 28px; margin-bottom: 8px; opacity: .5; }
  .empty p{ font-size: 12px; line-height: 1.5; }

  /* ── Loading spinner ── */
  .spinner{
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid var(--vscode-button-foreground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin .6s linear infinite;
  }
  @keyframes spin{ to{ transform: rotate(360deg); } }

  .loading-overlay{
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.3);
    z-index: 100;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    color: var(--vscode-foreground);
    font-size: 12px;
  }
  .loading-overlay.active{ display: flex; }

  /* ── Comparison details ── */
  .details-header{
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .details-header h3{ font-size: 13px; font-weight: 600; }
  .req-card{
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .req-header{
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .req-id{
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    font-weight: 600;
  }
  .req-badge{
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 500;
  }
  .badge-implemented{ background: rgba(137,209,133,.2); color: #89d185; }
  .badge-partial{ background: rgba(204,167,0,.2); color: #cca700; }
  .badge-not-implemented{ background: rgba(244,135,113,.2); color: #f48771; }
  .badge-divergent{ background: rgba(255,153,102,.2); color: #ff9966; }
  .req-confidence{
    margin-left: auto;
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
  }
  .req-text{
    font-size: 12px;
    line-height: 1.4;
    margin-bottom: 6px;
    color: var(--vscode-foreground);
  }
  .req-explanation{
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
    margin-bottom: 6px;
    padding: 4px 8px;
    background: rgba(128,128,128,.06);
    border-radius: 3px;
  }
  .req-actions-list{
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    padding-left: 16px;
    margin-bottom: 8px;
  }
  .req-actions-list li{ margin-bottom: 2px; }
  .req-footer{
    display: flex;
    gap: 6px;
    align-items: center;
  }

  /* ── Job cards (Analyses tab) ── */
  .job-card{
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-left: 3px solid var(--vscode-descriptionForeground);
    border-radius: 5px;
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .job-card.job-running{ border-left-color: var(--vscode-progressBar-background, #0078d4); }
  .job-card.job-completed{ border-left-color: var(--vscode-testing-iconPassed, #89d185); }
  .job-card.job-error{ border-left-color: var(--vscode-errorForeground, #f48771); }
  .job-card.job-cancelled{ border-left-color: var(--vscode-descriptionForeground); }

  .job-title{
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .job-subtitle{
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
  }
  .job-step{
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }
  .job-progress-wrap{
    width: 100%;
    height: 8px;
    background: var(--vscode-progressBar-background, rgba(128,128,128,.2));
    border-radius: 4px;
    overflow: hidden;
    margin: 6px 0;
  }
  .job-progress-bar{
    height: 100%;
    border-radius: 4px;
    transition: width .3s ease;
    background: var(--vscode-progressBar-background, #0078d4);
  }
  .job-progress-bar.completed{ background: var(--vscode-testing-iconPassed, #89d185); }
  .job-progress-bar.error{ background: var(--vscode-errorForeground, #f48771); }
  .job-footer{
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .job-status-badge{
    font-size: 10px;
    padding: 1px 8px;
    border-radius: 8px;
    font-weight: 500;
  }
  .badge-running{ background: rgba(0,120,212,.2); color: #4da6ff; }
  .badge-completed-job{ background: rgba(137,209,133,.2); color: #89d185; }
  .badge-error-job{ background: rgba(244,135,113,.2); color: #f48771; }
  .badge-cancelled-job{ background: rgba(128,128,128,.2); color: var(--vscode-descriptionForeground); }

  .running-indicator{
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4da6ff;
    margin-right: 6px;
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse{
    0%,100%{ opacity:1; }
    50%{ opacity:.3; }
  }

  .tab .tab-badge{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    font-size: 10px;
    font-weight: 600;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--vscode-badge-background, #0078d4);
    color: var(--vscode-badge-foreground, #fff);
    margin-left: 4px;
  }
</style>
</head>
<body>

<!-- Loading overlay -->
<div class="loading-overlay" id="loadingOverlay">
  <div class="spinner" style="width:24px;height:24px;border-width:3px"></div>
  <span id="loadingText">Loading...</span>
</div>

<!-- Header -->
<div class="header">
  <h1>Copilot Spec Sync <span id="versionNumber" style="font-size:11px;font-weight:400;color:var(--vscode-descriptionForeground);margin-left:4px">v0</span></h1>
  <div class="model-row">
    <label for="modelSelect">LLM Model:</label>
    <select class="model-select" id="modelSelect">
      <option value="">Loading...</option>
    </select>
  </div>
</div>

<!-- Tabs -->
<div class="tabs" id="tabBar">
  <button class="tab active" data-tab="actions">Actions</button>
  <button class="tab" data-tab="specs">Specs</button>
  <button class="tab" data-tab="analyses" id="tabAnalyses">Analyses</button>
  <button class="tab" data-tab="results">Results</button>
  <button class="tab" data-tab="history">History</button>
</div>

<!-- Tab: Actions -->
<div class="tab-content active" id="tab-actions">
  <div class="card">
    <div class="card-title">Generate Documentation</div>
    <div class="card-desc">Automatically analyze and document workspace projects.</div>
    <button class="btn btn-primary" data-action="generateDoc">Generate</button>
  </div>
  <div class="card">
    <div class="card-title">Upload a Specification</div>
    <div class="card-desc">Import a Word (.docx) or Markdown (.md) file containing your specification.</div>
    <button class="btn btn-primary" data-action="uploadSpec">Browse...</button>
  </div>
  <div class="card">
    <div class="card-title">Compare Code vs Specification</div>
    <div class="card-desc">Detect gaps between your code and the uploaded specification.</div>
    <button class="btn btn-secondary" data-action="compare">Run Comparison</button>
  </div>
  <div class="card">
    <div class="card-title">View Gaps</div>
    <div class="card-desc">List only non-implemented or divergent requirements.</div>
    <button class="btn btn-secondary" data-action="showGaps">Show Gaps</button>
  </div>
  <div class="card">
    <div class="card-title">Export Report</div>
    <div class="card-desc">Export the compliance report as Word or Markdown.</div>
    <button class="btn btn-secondary" data-action="exportReport">Export</button>
  </div>
</div>

<!-- Tab: Specs -->
<div class="tab-content" id="tab-specs">
  <div id="specsList">
    <div class="empty">
      <div class="empty-icon">&#128196;</div>
      <p>No specifications uploaded.<br>Use the Actions tab to add one.</p>
    </div>
  </div>
</div>

<!-- Tab: Analyses -->
<div class="tab-content" id="tab-analyses">
  <div id="jobsList">
    <div class="empty">
      <div class="empty-icon">&#9881;</div>
      <p>No analyses running.<br>Start a comparison from the Actions or Specs tab.</p>
    </div>
  </div>
</div>

<!-- Tab: Results -->
<div class="tab-content" id="tab-results">
  <div id="resultsList">
    <div class="empty">
      <div class="empty-icon">&#128202;</div>
      <p>No comparison results.<br>Start a comparison from the Specs tab.</p>
    </div>
  </div>
</div>

<!-- Tab: History -->
<div class="tab-content" id="tab-history">
  <div id="historyList">
    <div class="empty">
      <div class="empty-icon">&#128197;</div>
      <p>No history yet.<br>Run a comparison to get started.</p>
    </div>
  </div>
</div>

<script nonce="${nonce}">
(function(){
  const vscodeApi = acquireVsCodeApi();

  // ── Tab switching ──
  document.getElementById('tabBar').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });

  // ── Action buttons ──
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.getAttribute('data-action');
    vscodeApi.postMessage({ type: action });
  });

  // ── Model selector ──
  document.getElementById('modelSelect').addEventListener('change', e => {
    vscodeApi.postMessage({ type: 'selectModel', modelId: e.target.value });
  });

  // ── Receive data from extension ──
  window.addEventListener('message', e => {
    const msg = e.data;
    switch(msg.type){
      case 'updateModels': renderModels(msg.models, msg.selectedModelId); break;
      case 'updateSpecs': renderSpecs(msg.specs); break;
      case 'updateHistory': renderHistory(msg.history); break;
      case 'updateResults': renderResults(msg.details, msg.specTitle, msg.summary, msg.timestamp); break;
      case 'updateVersion': updateVersion(msg.version); break;
      case 'updateJobs': renderJobs(msg.jobs); break;
      case 'loading': setLoading(msg.text); break;
      case 'loaded': setLoading(null); break;
      case 'switchTab': switchTab(msg.tab); break;
    }
  });

  function switchTab(name){
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    document.querySelectorAll('.tab-content').forEach(t => {
      t.classList.toggle('active', t.id === 'tab-' + name);
    });
  }

  function setLoading(text){
    const overlay = document.getElementById('loadingOverlay');
    if(text){
      document.getElementById('loadingText').textContent = text;
      overlay.classList.add('active');
    } else {
      overlay.classList.remove('active');
    }
  }

  function updateVersion(version){
    const el = document.getElementById('versionNumber');
    if(el) el.textContent = 'v' + version;
  }

  function renderModels(models, selectedId){
    const sel = document.getElementById('modelSelect');
    sel.innerHTML = '';
    if(!models || models.length === 0){
      sel.innerHTML = '<option value="">No models available</option>';
      return;
    }
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name + (m.vendor ? ' (' + m.vendor + ')' : '');
      if(m.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderSpecs(specs){
    const container = document.getElementById('specsList');
    if(!specs || specs.length === 0){
      container.innerHTML = '<div class="empty"><div class="empty-icon">&#128196;</div><p>No specifications uploaded.<br>Use the Actions tab to add one.</p></div>';
      return;
    }
    let html = '';
    specs.forEach(s => {
      const pct = s.compliancePct !== null ? s.compliancePct : null;
      const pctClass = pct === null ? '' : pct >= 80 ? 'pct-green' : pct >= 50 ? 'pct-yellow' : 'pct-red';
      html += '<div class="card">';
      html += '<div class="card-title">' + esc(s.title) + ' <span style="font-weight:400;font-size:11px;color:var(--vscode-descriptionForeground)">v' + esc(s.version) + '</span></div>';
      html += '<div class="spec-meta"><span>' + s.requirementCount + ' requirements</span>';
      if(pct !== null) html += '<span>' + pct + '% compliant</span>';
      html += '</div>';
      if(pct !== null){
        html += '<div class="progress-wrap"><div class="progress-bar ' + pctClass + '" style="width:' + pct + '%"></div></div>';
        html += '<div class="spec-stats">';
        html += '<span class="stat"><span class="dot dot-green"></span>' + s.implemented + '</span>';
        html += '<span class="stat"><span class="dot dot-yellow"></span>' + s.partial + '</span>';
        html += '<span class="stat"><span class="dot dot-red"></span>' + s.notImplemented + '</span>';
        html += '<span class="stat"><span class="dot dot-orange"></span>' + s.divergent + '</span>';
        html += '</div>';
      }
      html += '<div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:6px">Uploaded on ' + formatDate(s.uploadedAt) + '</div>';
      html += '<div class="spec-actions">';
      html += '<button class="btn btn-primary btn-sm" data-action="compareSpec" data-spec-id="' + s.id + '">Compare</button>';
      html += '<button class="btn btn-secondary btn-sm" data-action="viewSpec" data-spec-id="' + s.id + '">Details</button>';
      html += '<button class="btn btn-danger btn-sm" data-action="deleteSpec" data-spec-id="' + s.id + '">Delete</button>';
      html += '</div>';
      html += '</div>';
    });
    container.innerHTML = html;

    // Wire up spec-specific buttons
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', function(){
        vscodeApi.postMessage({ type: this.dataset.action, specId: this.dataset.specId });
      });
    });
  }

  function renderHistory(items){
    const container = document.getElementById('historyList');
    if(!items || items.length === 0){
      container.innerHTML = '<div class="empty"><div class="empty-icon">&#128197;</div><p>No history yet.<br>Run a comparison to get started.</p></div>';
      return;
    }
    let html = '';
    items.forEach(h => {
      const deltaClass = h.delta.startsWith('+') ? 'delta-up' : h.delta.startsWith('-') ? 'delta-down' : 'delta-flat';
      const hInfo = getComplianceInfo(h.pct);
      html += '<div class="history-item" style="flex-wrap:wrap">';
      html += '<span style="width:100%;font-size:11px;font-weight:600;margin-bottom:2px">' + esc(h.specTitle) + '</span>';
      html += '<span class="history-date">' + esc(h.date) + '</span>';
      html += '<span class="history-pct">' + h.pct + '%</span>';
      html += '<span class="compliance-level ' + hInfo.levelClass + '" style="font-size:10px;padding:1px 6px">' + hInfo.label + '</span>';
      html += '<span class="history-delta ' + deltaClass + '">' + esc(h.delta) + '</span>';
      if(h.gitHash && h.gitHash !== '-') html += '<span class="history-hash">' + esc(h.gitHash) + '</span>';
      html += '<span style="font-size:10px;color:var(--vscode-descriptionForeground)">' + h.implemented + '/' + h.total + ' impl.</span>';
      html += '</div>';
    });
    container.innerHTML = html;
  }

  function renderResults(details, specTitle, summary, timestamp){
    const container = document.getElementById('resultsList');
    if(!details || details.length === 0){
      container.innerHTML = '<div class="empty"><div class="empty-icon">&#128202;</div><p>No comparison results.<br>Start a comparison from the Specs tab.</p></div>';
      return;
    }

    // Overall compliance = average confidence across all requirements
    const avgConfidence = Math.round(details.reduce(function(sum, d){ return sum + (d.confidence || 0); }, 0) / details.length);
    const info = getComplianceInfo(avgConfidence);

    // Count statuses from details (fallback if summary not provided)
    const implCount = summary ? summary.implemented : details.filter(function(d){ return d.status === 'implemented'; }).length;
    const partialCount = summary ? summary.partial : details.filter(function(d){ return d.status === 'partially-implemented' || d.status === 'partial'; }).length;
    const missingCount = summary ? summary.notImplemented : details.filter(function(d){ return d.status === 'not-implemented'; }).length;
    const divergentCount = summary ? summary.divergent : details.filter(function(d){ return d.status === 'divergent'; }).length;

    // Analysis summary card
    var html = '<div class="card" style="margin-bottom:12px">';
    html += '<div class="card-title">' + esc(specTitle || 'Results') + '</div>';
    if(timestamp){
      html += '<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:8px">Analysis from ' + formatDate(timestamp) + '</div>';
    }
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
    html += '<span style="font-size:13px;font-weight:600">' + avgConfidence + '% compliant</span>';
    html += '<span class="compliance-level ' + info.levelClass + '">' + info.label + '</span>';
    html += '</div>';
    html += '<div class="progress-wrap"><div class="progress-bar ' + info.pctClass + '" style="width:' + avgConfidence + '%"></div></div>';
    html += '<div class="spec-stats" style="margin-top:8px">';
    html += '<span class="stat"><span class="dot dot-green"></span> ' + implCount + ' impl.</span>';
    html += '<span class="stat"><span class="dot dot-yellow"></span> ' + partialCount + ' partial</span>';
    html += '<span class="stat"><span class="dot dot-red"></span> ' + missingCount + ' missing</span>';
    html += '<span class="stat"><span class="dot dot-orange"></span> ' + divergentCount + ' divergent</span>';
    html += '</div>';
    html += '<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:6px">' + details.length + ' requirements analyzed</div>';
    html += '</div>';

    // Sort: not-implemented and divergent first
    const order = {'not-implemented': 0, 'divergent': 1, 'partial': 2, 'partially-implemented': 2, 'implemented': 3};
    const sorted = [...details].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

    sorted.forEach((d, idx) => {
      const confInfo = getComplianceInfo(d.confidence);
      const badgeClass = d.status === 'implemented' ? 'badge-implemented'
        : (d.status === 'partial' || d.status === 'partially-implemented') ? 'badge-partial'
        : d.status === 'divergent' ? 'badge-divergent'
        : 'badge-not-implemented';
      const statusLabel = confInfo.label + ' (' + d.confidence + '%)';

      html += '<div class="req-card">';
      html += '<div class="req-header">';
      html += '<span class="req-id">' + esc(d.requirementId) + '</span>';
      html += '<span class="compliance-level ' + confInfo.levelClass + '" style="font-size:10px;padding:1px 8px">' + statusLabel + '</span>';
      html += '</div>';
      html += '<div class="req-text">' + esc(d.requirementText) + '</div>';
      if(d.explanation){
        html += '<div class="req-explanation"><strong>Justification:</strong> ' + esc(d.explanation) + '</div>';
      }
      if(d.matchedFiles && d.matchedFiles.length > 0){
        html += '<div class="req-explanation"><strong>Matched files:</strong> ';
        html += d.matchedFiles.map(function(f){ return esc(f.filePath) + (f.line ? ':' + f.line : ''); }).join(', ');
        html += '</div>';
      }
      if(d.suggestedActions && d.suggestedActions.length > 0){
        html += '<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:4px"><strong>Suggested actions:</strong></div>';
        html += '<ul class="req-actions-list">';
        d.suggestedActions.forEach(a => { html += '<li>' + esc(a) + '</li>'; });
        html += '</ul>';
      }
      if(d.status !== 'implemented'){
        html += '<div class="req-footer">';
        html += '<button class="btn btn-primary btn-sm" data-action="implementReq" data-req-idx="' + idx + '">Implement</button>';
        html += '</div>';
      }
      html += '</div>';
    });

    container.innerHTML = html;

    // Wire up implement buttons with full requirement data
    container.querySelectorAll('[data-action="implementReq"]').forEach(btn => {
      btn.addEventListener('click', function(){
        const idx = parseInt(this.dataset.reqIdx, 10);
        const req = sorted[idx];
        vscodeApi.postMessage({
          type: 'implementRequirement',
          requirementId: req.requirementId,
          requirementText: req.requirementText,
          suggestedActions: req.suggestedActions || [],
          matchedFiles: req.matchedFiles || [],
        });
      });
    });
  }

  function formatDate(iso){
    if(!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US',{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  function esc(s){
    if(!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getComplianceInfo(pct){
    if(pct === 100) return { label:'Perfect', levelClass:'level-perfect', pctClass:'pct-green' };
    if(pct >= 95) return { label:'Excellent', levelClass:'level-excellent', pctClass:'pct-green' };
    if(pct >= 90) return { label:'Very Good', levelClass:'level-very-good', pctClass:'pct-light-green' };
    if(pct >= 80) return { label:'Good', levelClass:'level-good', pctClass:'pct-yellow-green' };
    if(pct >= 70) return { label:'Fair', levelClass:'level-correct', pctClass:'pct-yellow' };
    if(pct >= 60) return { label:'Average', levelClass:'level-average', pctClass:'pct-orange' };
    if(pct >= 50) return { label:'Insufficient', levelClass:'level-insufficient', pctClass:'pct-red' };
    if(pct >= 40) return { label:'Weak', levelClass:'level-weak', pctClass:'pct-dark-red' };
    if(pct >= 25) return { label:'Very Weak', levelClass:'level-very-weak', pctClass:'pct-dark-red' };
    if(pct >= 10) return { label:'Critical', levelClass:'level-critical', pctClass:'pct-dark-red' };
    return { label:'Not Started', levelClass:'level-not-started', pctClass:'pct-dark-red' };
  }

  function renderJobs(jobs){
    const container = document.getElementById('jobsList');
    if(!jobs || jobs.length === 0){
      container.innerHTML = '<div class="empty"><div class="empty-icon">&#9881;</div><p>No analyses running.<br>Start a comparison from the Actions or Specs tab.</p></div>';
      updateAnalysesTabBadge(0);
      return;
    }

    const running = jobs.filter(j => j.status === 'running').length;
    updateAnalysesTabBadge(running);

    let html = '';
    jobs.forEach(j => {
      const statusClass = 'job-' + j.status;
      const badgeClass = j.status === 'running' ? 'badge-running'
        : j.status === 'completed' ? 'badge-completed-job'
        : j.status === 'error' ? 'badge-error-job'
        : 'badge-cancelled-job';
      const statusLabel = j.status === 'running' ? 'Running'
        : j.status === 'completed' ? 'Completed'
        : j.status === 'error' ? 'Error'
        : 'Cancelled';

      const elapsed = getElapsed(j.startedAt, j.completedAt);
      const progressClass = j.status === 'completed' ? 'completed'
        : j.status === 'error' ? 'error' : '';

      html += '<div class="job-card ' + statusClass + '" data-job-id="' + j.id + '">';

      // Header
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">';
      if(j.status === 'running') html += '<span class="running-indicator"></span>';
      html += '<span class="job-title">' + esc(j.specTitle) + '</span>';
      html += '<span class="job-status-badge ' + badgeClass + '">' + statusLabel + '</span>';
      html += '</div>';

      // Subtitle
      html += '<div class="job-subtitle">' + esc(j.projectNames.join(', ')) + ' &middot; v' + esc(j.specVersion) + '</div>';

      // Progress
      html += '<div class="job-step">' + esc(j.currentStep) + '</div>';
      html += '<div class="job-progress-wrap"><div class="job-progress-bar ' + progressClass + '" style="width:' + j.progress + '%"></div></div>';
      html += '<div style="font-size:11px;color:var(--vscode-descriptionForeground)">' + j.processedRequirements + '/' + j.totalRequirements + ' requirements &middot; ' + j.progress + '%</div>';

      // Result for completed
      if(j.status === 'completed' && j.resultPct !== undefined){
        const info = getComplianceInfo(j.resultPct);
        html += '<div style="margin-top:6px"><span class="compliance-level ' + info.levelClass + '">' + j.resultPct + '% — ' + info.label + '</span></div>';
      }

      // Error message
      if(j.status === 'error' && j.error){
        html += '<div style="margin-top:4px;font-size:11px;color:var(--vscode-errorForeground)">' + esc(j.error) + '</div>';
      }

      // Footer
      html += '<div class="job-footer">';
      html += '<span>' + elapsed + '</span>';
      html += '<span>';
      if(j.status === 'running'){
        html += '<button class="btn btn-danger btn-sm job-cancel-btn" data-job-id="' + j.id + '">Cancel</button>';
      } else {
        html += '<button class="btn btn-secondary btn-sm job-remove-btn" data-job-id="' + j.id + '">Remove</button>';
      }
      html += '</span>';
      html += '</div>';

      html += '</div>';
    });

    container.innerHTML = html;

    // Wire cancel/remove buttons
    container.querySelectorAll('.job-cancel-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        vscodeApi.postMessage({ type: 'cancelJob', jobId: this.dataset.jobId });
      });
    });
    container.querySelectorAll('.job-remove-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        vscodeApi.postMessage({ type: 'removeJob', jobId: this.dataset.jobId });
      });
    });
  }

  function updateAnalysesTabBadge(runningCount){
    const tab = document.getElementById('tabAnalyses');
    if(!tab) return;
    const existing = tab.querySelector('.tab-badge');
    if(existing) existing.remove();
    if(runningCount > 0){
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = String(runningCount);
      tab.appendChild(badge);
    }
  }

  function getElapsed(startIso, endIso){
    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    const secs = Math.floor((end - start) / 1000);
    if(secs < 60) return secs + 's';
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return mins + 'm ' + remainSecs + 's';
  }

  // Ask extension for initial data
  vscodeApi.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
