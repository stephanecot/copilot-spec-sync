import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { readDocx } from '../spec-comparator/docxReader.js';
import { readMarkdown } from '../spec-comparator/markdownReader.js';
import { parseSpec } from '../spec-comparator/specParser.js';
import { getWorkspaceProjects, generateId, getGitCommitHash } from '../utils/fileUtils.js';
import { analyzeProject } from '../doc-generator/projectAnalyzer.js';
import { exportAsMarkdown, exportAsDocx } from '../doc-generator/docBuilder.js';
import { findRelevantCode } from '../spec-comparator/codeMapper.js';
import { analyzeRequirement, consolidateResults } from '../spec-comparator/gapAnalyzer.js';

/**
 * Interactive command handlers that use UI dialogs instead of chat
 */

export async function interactiveUploadSpec(
  context: vscode.ExtensionContext,
  storage: StorageManager,
): Promise<void> {
  // File picker
  const fileUris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'Specifications': ['docx', 'md'] },
    openLabel: 'Sélectionner la spécification',
  });

  if (!fileUris || fileUris.length === 0) {
    return;
  }

  const filePath = fileUris[0].fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Upload de la spécification',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Lecture du fichier...' });

        // Read file based on extension
        const ext = path.extname(filePath).toLowerCase();
        const content = ext === '.md'
          ? await readMarkdown(filePath)
          : await readDocx(filePath);

        progress.report({ message: 'Analyse du contenu...' });

        // Generate spec ID
        const specId = generateId();

        // Parse spec
        const spec = parseSpec(content, specId);
        spec.filePath = filePath;
        // Use filename as title
        spec.title = path.basename(filePath, path.extname(filePath));

        // Save to storage
        await storage.initialize();
        await storage.saveSpec(spec, filePath);

        // Refresh views
        await vscode.commands.executeCommand('specSync.refreshTrees');

        // Success
        vscode.window.showInformationMessage(
          `Spécification "${spec.title}" uploadée avec succès (${spec.requirementCount} exigences)`,
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Erreur lors de l'upload: ${error}`);
      }
    },
  );
}

export async function interactiveCompare(
  context: vscode.ExtensionContext,
  storage: StorageManager,
  preferredModelId?: string,
  specId?: string,
): Promise<any | undefined> {
  const specs = await storage.listSpecs();

  if (specs.length === 0) {
    const upload = await vscode.window.showInformationMessage(
      'Aucune spécification trouvée. Voulez-vous en uploader une ?',
      'Oui',
      'Non',
    );
    if (upload === 'Oui') {
      await interactiveUploadSpec(context, storage);
    }
    return undefined;
  }

  // If specId is provided, use it directly without QuickPick
  let selectedSpec: any;
  if (specId) {
    selectedSpec = specs.find(s => s.id === specId);
    if (!selectedSpec) {
      vscode.window.showErrorMessage('Spécification introuvable');
      return undefined;
    }
  } else if (specs.length === 1) {
    selectedSpec = specs[0];
  } else {
    const items = specs.map((s) => ({
      label: s.title,
      description: `v${s.version}`,
      spec: s,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Sélectionnez une spécification à comparer',
    });

    if (!picked) {
      return undefined;
    }
    selectedSpec = picked.spec;
  }

  let resultComparison: any | undefined;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Comparaison avec ${selectedSpec.title}`,
      cancellable: true,
    },
    async (progress, token) => {
      try {
        progress.report({ message: 'Chargement de la spécification...' });

        const spec = await storage.getSpec(selectedSpec.id);
        if (!spec) {
          throw new Error('Spécification introuvable');
        }

        progress.report({ message: 'Détection des projets...' });
        const projects = await getWorkspaceProjects();

        if (projects.length === 0) {
          throw new Error('Aucun projet détecté dans le workspace');
        }

        // Get language model – try user-selected model first, then any available
        let model: vscode.LanguageModelChat | undefined;
        const allModels = await vscode.lm.selectChatModels();
        if (preferredModelId) {
          model = allModels.find(m => m.id === preferredModelId);
        }
        if (!model) {
          model = allModels[0];
        }
        if (!model) {
          throw new Error('Aucun modèle de langage disponible. GitHub Copilot est-il activé ?');
        }

        // Flatten requirements
        const allRequirements = flattenRequirements(spec);
        progress.report({ message: `Analyse de ${allRequirements.length} exigences...` });

        const results = [];
        for (let i = 0; i < allRequirements.length; i++) {
          if (token.isCancellationRequested) {
            throw new Error('Comparaison annulée');
          }

          const req = allRequirements[i];
          progress.report({
            message: `Exigence ${i + 1}/${allRequirements.length}: ${req.id}`,
            increment: (100 / allRequirements.length),
          });

          const candidates = await findRelevantCode(req, projects, 5);
          const comparison = await analyzeRequirement(req, candidates, model, token);
          results.push(comparison);
        }

        // Get git commit
        const gitHash = await getGitCommitHash(projects[0].path);

        // Get previous comparison for evolution tracking
        const previousComparison = await storage.getLatestComparison(selectedSpec.id);

        // Consolidate and save
        const comparison = consolidateResults(
          results,
          selectedSpec.id,
          selectedSpec.version,
          projects.map(p => p.path),
          gitHash,
          previousComparison,
        );

        await storage.saveComparison(comparison);

        // Refresh views
        await vscode.commands.executeCommand('specSync.refreshTrees');

        resultComparison = comparison;

        const implemented = comparison.summary.implemented;
        const total = comparison.summary.total;
        const percentage = Math.round((implemented / total) * 100);

        vscode.window.showInformationMessage(
          `Comparaison terminee: ${percentage}% conforme (${implemented}/${total} exigences)`,
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'Comparaison annulée') {
          vscode.window.showWarningMessage('Comparaison annulée');
        } else {
          vscode.window.showErrorMessage(`Erreur lors de la comparaison: ${error}`);
        }
      }
    },
  );

  return resultComparison;
}

export async function interactiveGenerateDoc(context: vscode.ExtensionContext): Promise<void> {
  console.log('[Spec Sync] interactiveGenerateDoc called');

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Aucun workspace ouvert');
    return;
  }

  const format = await vscode.window.showQuickPick(
    [
      { label: 'Markdown', description: 'Format .md', value: 'md' },
      { label: 'Word (DOCX)', description: 'Format .docx', value: 'docx' },
      { label: 'Les deux', description: 'Markdown et Word', value: 'both' },
    ],
    { placeHolder: 'Choisissez le format de sortie' },
  );

  if (!format) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Génération de la documentation',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Détection des projets...' });

        const projects = await getWorkspaceProjects();
        if (projects.length === 0) {
          throw new Error('Aucun projet détecté');
        }

        const outputDir = vscode.workspace.getConfiguration('specSync.documentation').get<string>('outputPath', './docs');
        const outputPath = path.join(workspaceFolders[0].uri.fsPath, outputDir);

        // Create output directory
        await fs.mkdir(outputPath, { recursive: true });

        for (const project of projects) {
          progress.report({ message: `Analyse de ${project.name}...` });

          const analysis = await analyzeProject(project.path);

          // Generate documentation content
          const doc: any = {
            projectInfo: analysis.projectInfo,
            sections: [
              {
                title: 'Vue d\'ensemble',
                key: 'overview',
                content: `# ${project.name}\n\nType: ${project.type}\nLanguage: ${project.language}`,
                priority: 1,
              },
            ],
            generatedAt: new Date().toISOString(),
          };

          progress.report({ message: `Export de ${project.name}...` });

          // Export based on format
          if (format.value === 'md' || format.value === 'both') {
            const mdPath = path.join(outputPath, `${project.name}.md`);
            await exportAsMarkdown(doc, mdPath);
          }

          if (format.value === 'docx' || format.value === 'both') {
            const docxPath = path.join(outputPath, `${project.name}.docx`);
            await exportAsDocx(doc, docxPath);
          }
        }

        const action = await vscode.window.showInformationMessage(
          `Documentation générée dans ${outputDir}/`,
          'Ouvrir le dossier',
        );

        if (action === 'Ouvrir le dossier') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Erreur lors de la génération: ${error}`);
      }
    },
  );
}

export async function interactiveShowGaps(
  context: vscode.ExtensionContext,
  storage: StorageManager,
): Promise<void> {
  const comparison = await storage.getLatestComparisonForAnySpec();
  if (!comparison) {
    vscode.window.showInformationMessage('Aucune comparaison disponible. Lancez une comparaison d\'abord.');
    return;
  }

  const gaps = comparison.details.filter(
    d => d.status === 'not-implemented' || d.status === 'divergent'
  );

  if (gaps.length === 0) {
    vscode.window.showInformationMessage('Aucun écart trouvé ! Tous les requis sont implémentés.');
    return;
  }

  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    'specSyncGaps',
    'Écarts de conformité',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  let html = '<!DOCTYPE html><html><head><style>body{padding:20px;font-family:var(--vscode-font-family);color:var(--vscode-foreground);}h2{color:var(--vscode-foreground);}table{width:100%;border-collapse:collapse;}th,td{padding:8px;text-align:left;border-bottom:1px solid var(--vscode-panel-border);}th{background:var(--vscode-editor-background);font-weight:600;}.missing{color:#f48771;}.divergent{color:#cca700;}</style></head><body>';
  html += `<h2>Écarts de conformité (${gaps.length} exigences)</h2>`;
  html += '<table><tr><th>ID</th><th>Statut</th><th>Exigence</th><th>Confiance</th></tr>';

  for (const gap of gaps) {
    const statusClass = gap.status === 'not-implemented' ? 'missing' : 'divergent';
    const statusText = gap.status === 'not-implemented' ? 'Non implémenté' : 'Divergent';
    html += `<tr><td><strong>${escapeHtml(gap.requirementId)}</strong></td><td class="${statusClass}">${statusText}</td><td>${escapeHtml(gap.requirementText.substring(0, 80))}...</td><td>${gap.confidence}%</td></tr>`;
  }

  html += '</table></body></html>';
  panel.webview.html = html;
}

export async function interactiveShowStatus(
  context: vscode.ExtensionContext,
  storage: StorageManager,
): Promise<void> {
  const comparison = await storage.getLatestComparisonForAnySpec();
  if (!comparison) {
    vscode.window.showInformationMessage('Aucune comparaison disponible.');
    return;
  }

  const s = comparison.summary;
  const percentage = Math.round((s.implemented / s.total) * 100);

  const panel = vscode.window.createWebviewPanel(
    'specSyncStatus',
    'État de conformité',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      padding: 20px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
    }
    h2 { color: var(--vscode-foreground); margin-top: 0; }
    .stat-box {
      display: inline-block;
      padding: 15px 20px;
      margin: 10px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      min-width: 150px;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .stat-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .implemented { color: #89d185; }
    .partial { color: #cca700; }
    .missing { color: #f48771; }
    .divergent { color: #ff9966; }
  </style>
</head>
<body>
  <h2>État de conformité: ${percentage}%</h2>

  <div class="stat-box">
    <div class="stat-value">${s.total}</div>
    <div class="stat-label">Total exigences</div>
  </div>

  <div class="stat-box implemented">
    <div class="stat-value">${s.implemented}</div>
    <div class="stat-label">Implémentées</div>
  </div>

  <div class="stat-box partial">
    <div class="stat-value">${s.partial}</div>
    <div class="stat-label">Partielles</div>
  </div>

  <div class="stat-box missing">
    <div class="stat-value">${s.notImplemented}</div>
    <div class="stat-label">Manquantes</div>
  </div>

  <div class="stat-box divergent">
    <div class="stat-value">${s.divergent}</div>
    <div class="stat-label">Divergentes</div>
  </div>
</body>
</html>`;
}

export async function interactiveImplementRequirement(
  context: vscode.ExtensionContext,
  requirementId: string,
  requirementText: string,
  suggestedActions: string[],
  matchedFiles: { filePath: string; line?: number; snippet?: string }[],
  preferredModelId?: string,
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Implementation de l'exigence ${requirementId}`,
      cancellable: true,
    },
    async (progress, token) => {
      try {
        progress.report({ message: 'Selection du modele...' });

        let model: vscode.LanguageModelChat | undefined;
        const allModels = await vscode.lm.selectChatModels();
        if (preferredModelId) {
          model = allModels.find(m => m.id === preferredModelId);
        }
        if (!model) {
          model = allModels[0];
        }
        if (!model) {
          throw new Error('Aucun modele de langage disponible.');
        }

        progress.report({ message: 'Generation de la proposition...' });

        // Build context from matched files
        let fileContext = '';
        for (const f of matchedFiles.slice(0, 3)) {
          try {
            const content = await fs.readFile(f.filePath, 'utf-8');
            const lines = content.split('\n');
            const start = Math.max(0, (f.line || 1) - 20);
            const end = Math.min(lines.length, (f.line || 1) + 40);
            fileContext += `\n--- ${f.filePath} (lines ${start + 1}-${end}) ---\n`;
            fileContext += lines.slice(start, end).join('\n');
          } catch {
            // File may not be readable
          }
        }

        const prompt = [
          vscode.LanguageModelChatMessage.User(`Tu es un developpeur expert. On te demande d'implementer l'exigence suivante dans le code existant.

EXIGENCE: [${requirementId}] ${requirementText}

ACTIONS SUGGEREES:
${suggestedActions.map(a => '- ' + a).join('\n') || '(aucune)'}

CODE EXISTANT PERTINENT:
${fileContext || '(aucun fichier associe)'}

Genere le code necessaire pour implementer cette exigence. Indique clairement:
1. Dans quel fichier ajouter/modifier le code
2. Le code complet a ajouter ou modifier
3. Une breve explication

Reponds en francais.`),
        ];

        const response = await model.sendRequest(prompt, {}, token);

        // Collect the streamed response
        let resultText = '';
        for await (const chunk of response.text) {
          resultText += chunk;
        }

        // Show result in a new editor tab
        const doc = await vscode.workspace.openTextDocument({
          content: `# Implementation: ${requirementId}\n\n## Exigence\n${requirementText}\n\n## Proposition\n\n${resultText}`,
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, { preview: false });

      } catch (error) {
        if (token.isCancellationRequested) {
          return;
        }
        vscode.window.showErrorMessage(`Erreur: ${error}`);
      }
    },
  );
}

function flattenRequirements(spec: any): any[] {
  const result: any[] = [];

  function traverse(items: any[]) {
    if (!items) return;
    for (const item of items) {
      if (item.requirements) {
        result.push(...item.requirements);
      }
      if (item.subsections) {
        traverse(item.subsections);
      }
    }
  }

  traverse(spec.sections);
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
