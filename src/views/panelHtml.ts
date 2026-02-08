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
<html lang="fr">
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
  .pct-yellow{ background: var(--vscode-editorWarning-foreground, #cca700); }
  .pct-red{ background: var(--vscode-errorForeground, #f48771); }

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
    line-height: 1.3;
    margin-bottom: 6px;
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
</style>
</head>
<body>

<!-- Loading overlay -->
<div class="loading-overlay" id="loadingOverlay">
  <div class="spinner" style="width:24px;height:24px;border-width:3px"></div>
  <span id="loadingText">Chargement...</span>
</div>

<!-- Header -->
<div class="header">
  <h1>Copilot Spec Sync</h1>
  <div class="model-row">
    <label for="modelSelect">Modele LLM :</label>
    <select class="model-select" id="modelSelect">
      <option value="">Chargement...</option>
    </select>
  </div>
</div>

<!-- Tabs -->
<div class="tabs" id="tabBar">
  <button class="tab active" data-tab="actions">Actions</button>
  <button class="tab" data-tab="specs">Specs</button>
  <button class="tab" data-tab="results">Resultats</button>
  <button class="tab" data-tab="history">Historique</button>
</div>

<!-- Tab: Actions -->
<div class="tab-content active" id="tab-actions">
  <div class="card">
    <div class="card-title">Generer la documentation</div>
    <div class="card-desc">Analyse et documente automatiquement les projets du workspace.</div>
    <button class="btn btn-primary" data-action="generateDoc">Generer</button>
  </div>
  <div class="card">
    <div class="card-title">Uploader une specification</div>
    <div class="card-desc">Importez un fichier Word (.docx) ou Markdown (.md) contenant votre specification.</div>
    <button class="btn btn-primary" data-action="uploadSpec">Parcourir...</button>
  </div>
  <div class="card">
    <div class="card-title">Comparer code vs specification</div>
    <div class="card-desc">Detecte les ecarts entre votre code et la specification uploadee.</div>
    <button class="btn btn-secondary" data-action="compare">Lancer la comparaison</button>
  </div>
  <div class="card">
    <div class="card-title">Voir les ecarts</div>
    <div class="card-desc">Liste uniquement les exigences non implementees ou divergentes.</div>
    <button class="btn btn-secondary" data-action="showGaps">Afficher les ecarts</button>
  </div>
  <div class="card">
    <div class="card-title">Exporter le rapport</div>
    <div class="card-desc">Exporte le rapport de conformite en Word ou Markdown.</div>
    <button class="btn btn-secondary" data-action="exportReport">Exporter</button>
  </div>
</div>

<!-- Tab: Specs -->
<div class="tab-content" id="tab-specs">
  <div id="specsList">
    <div class="empty">
      <div class="empty-icon">&#128196;</div>
      <p>Aucune specification uploadee.<br>Utilisez l'onglet Actions pour en ajouter.</p>
    </div>
  </div>
</div>

<!-- Tab: Results -->
<div class="tab-content" id="tab-results">
  <div id="resultsList">
    <div class="empty">
      <div class="empty-icon">&#128202;</div>
      <p>Aucun resultat de comparaison.<br>Lancez une comparaison depuis l'onglet Specs.</p>
    </div>
  </div>
</div>

<!-- Tab: History -->
<div class="tab-content" id="tab-history">
  <div id="historyList">
    <div class="empty">
      <div class="empty-icon">&#128197;</div>
      <p>Aucun historique.<br>Lancez une comparaison pour commencer.</p>
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
      case 'updateResults': renderResults(msg.details, msg.specTitle); break;
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

  function renderModels(models, selectedId){
    const sel = document.getElementById('modelSelect');
    sel.innerHTML = '';
    if(!models || models.length === 0){
      sel.innerHTML = '<option value="">Aucun modele disponible</option>';
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
      container.innerHTML = '<div class="empty"><div class="empty-icon">&#128196;</div><p>Aucune specification uploadee.<br>Utilisez l\\'onglet Actions pour en ajouter.</p></div>';
      return;
    }
    let html = '';
    specs.forEach(s => {
      const pct = s.compliancePct !== null ? s.compliancePct : null;
      const pctClass = pct === null ? '' : pct >= 80 ? 'pct-green' : pct >= 50 ? 'pct-yellow' : 'pct-red';
      html += '<div class="card">';
      html += '<div class="card-title">' + esc(s.title) + ' <span style="font-weight:400;font-size:11px;color:var(--vscode-descriptionForeground)">v' + esc(s.version) + '</span></div>';
      html += '<div class="spec-meta"><span>' + s.requirementCount + ' exigences</span>';
      if(pct !== null) html += '<span>' + pct + '% conforme</span>';
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
      html += '<div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:6px">Uploade le ' + formatDate(s.uploadedAt) + '</div>';
      html += '<div class="spec-actions">';
      html += '<button class="btn btn-primary btn-sm" data-action="compareSpec" data-spec-id="' + s.id + '">Comparer</button>';
      html += '<button class="btn btn-secondary btn-sm" data-action="viewSpec" data-spec-id="' + s.id + '">Details</button>';
      html += '<button class="btn btn-danger btn-sm" data-action="deleteSpec" data-spec-id="' + s.id + '">Supprimer</button>';
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
      container.innerHTML = '<div class="empty"><div class="empty-icon">&#128197;</div><p>Aucun historique.<br>Lancez une comparaison pour commencer.</p></div>';
      return;
    }
    let html = '';
    items.forEach(h => {
      const deltaClass = h.delta.startsWith('+') ? 'delta-up' : h.delta.startsWith('-') ? 'delta-down' : 'delta-flat';
      html += '<div class="history-item">';
      html += '<span class="history-date">' + esc(h.date) + '</span>';
      html += '<span class="history-pct">' + h.pct + '%</span>';
      html += '<span class="history-delta ' + deltaClass + '">' + esc(h.delta) + '</span>';
      html += '<span class="history-hash">' + esc(h.gitHash) + '</span>';
      html += '</div>';
    });
    container.innerHTML = html;
  }

  function renderResults(details, specTitle){
    const container = document.getElementById('resultsList');
    if(!details || details.length === 0){
      container.innerHTML = '<div class="empty"><div class="empty-icon">&#128202;</div><p>Aucun resultat de comparaison.<br>Lancez une comparaison depuis l\\'onglet Specs.</p></div>';
      return;
    }

    const implemented = details.filter(d => d.status === 'implemented').length;
    const total = details.length;
    const pct = Math.round((implemented / total) * 100);

    let html = '<div class="details-header"><h3>' + esc(specTitle || 'Resultats') + '</h3><span style="font-size:12px;font-weight:600">' + pct + '% conforme</span></div>';

    // Sort: not-implemented and divergent first
    const order = {'not-implemented': 0, 'divergent': 1, 'partial': 2, 'implemented': 3};
    const sorted = [...details].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

    sorted.forEach((d, idx) => {
      const badgeClass = d.status === 'implemented' ? 'badge-implemented'
        : d.status === 'partial' ? 'badge-partial'
        : d.status === 'divergent' ? 'badge-divergent'
        : 'badge-not-implemented';
      const statusLabel = d.status === 'implemented' ? 'Implemente'
        : d.status === 'partial' ? 'Partiel'
        : d.status === 'divergent' ? 'Divergent'
        : 'Non implemente';

      html += '<div class="req-card">';
      html += '<div class="req-header">';
      html += '<span class="req-id">' + esc(d.requirementId) + '</span>';
      html += '<span class="req-badge ' + badgeClass + '">' + statusLabel + '</span>';
      html += '<span class="req-confidence">' + d.confidence + '%</span>';
      html += '</div>';
      html += '<div class="req-text">' + esc(d.requirementText) + '</div>';
      if(d.explanation){
        html += '<div class="req-explanation">' + esc(d.explanation) + '</div>';
      }
      if(d.suggestedActions && d.suggestedActions.length > 0){
        html += '<ul class="req-actions-list">';
        d.suggestedActions.forEach(a => { html += '<li>' + esc(a) + '</li>'; });
        html += '</ul>';
      }
      if(d.status !== 'implemented'){
        html += '<div class="req-footer">';
        html += '<button class="btn btn-primary btn-sm" data-action="implementReq" data-req-idx="' + idx + '">Implementer</button>';
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
    return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  function esc(s){
    if(!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Ask extension for initial data
  vscodeApi.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
