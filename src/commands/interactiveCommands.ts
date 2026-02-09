import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { readDocx } from '../spec-comparator/docxReader.js';
import { readMarkdown } from '../spec-comparator/markdownReader.js';
import { parseSpec } from '../spec-comparator/specParser.js';
import { getWorkspaceProjects, generateId, getGitCommitHash } from '../utils/fileUtils.js';
import { ProjectInfo } from '../types.js';
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
    openLabel: 'Select the specification',
  });

  if (!fileUris || fileUris.length === 0) {
    return;
  }

  const filePath = fileUris[0].fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Uploading specification',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Reading file...' });

        // Read file based on extension
        const ext = path.extname(filePath).toLowerCase();
        const content = ext === '.md'
          ? await readMarkdown(filePath)
          : await readDocx(filePath);

        progress.report({ message: 'Parsing content...' });

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
          `Specification "${spec.title}" uploaded successfully (${spec.requirementCount} requirements)`,
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error uploading: ${error}`);
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
      'No specification found. Would you like to upload one?',
      'Yes',
      'No',
    );
    if (upload === 'Yes') {
      await interactiveUploadSpec(context, storage);
    }
    return undefined;
  }

  // If specId is provided, use it directly without QuickPick
  let selectedSpec: any;
  if (specId) {
    selectedSpec = specs.find(s => s.id === specId);
    if (!selectedSpec) {
      vscode.window.showErrorMessage('Specification not found');
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
      placeHolder: 'Select a specification to compare',
    });

    if (!picked) {
      return undefined;
    }
    selectedSpec = picked.spec;
  }

  // ── Sub-project selection ──
  const allProjects = await getWorkspaceProjects();
  if (allProjects.length === 0) {
    vscode.window.showErrorMessage('No projects detected in the workspace');
    return undefined;
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

    if (!pickedProjects || pickedProjects.length === 0) {
      return undefined;
    }
    selectedProjects = pickedProjects.map(p => p.project);
  }

  // Save selected projects in workspace state for reuse in implement
  await context.workspaceState.update('specSync.selectedProjects', selectedProjects);

  let resultComparison: any | undefined;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Comparison with ${selectedSpec.title}`,
      cancellable: true,
    },
    async (progress, token) => {
      try {
        progress.report({ message: 'Loading specification...' });

        const spec = await storage.getSpec(selectedSpec.id);
        if (!spec) {
          throw new Error('Specification not found');
        }

        progress.report({ message: 'Detecting projects...' });
        const projects = selectedProjects;

        if (projects.length === 0) {
          throw new Error('No projects detected in the workspace');
        }

        // Get language model – try user-selected model first, then any available
        let model: vscode.LanguageModelChat | undefined;
        const allModels = await vscode.lm.selectChatModels();
        if (allModels && Array.isArray(allModels)) {
          if (preferredModelId) {
            model = allModels.find(m => m.id === preferredModelId);
          }
          if (!model && allModels.length > 0) {
            model = allModels[0];
          }
        }
        if (!model) {
          throw new Error('No language model available. Is GitHub Copilot enabled?');
        }

        // Flatten requirements
        const allRequirements = flattenRequirements(spec);
        progress.report({ message: `Analyzing ${allRequirements.length} requirements...` });

        const results = [];
        for (let i = 0; i < allRequirements.length; i++) {
          if (token.isCancellationRequested) {
            throw new Error('Comparison cancelled');
          }

          const req = allRequirements[i];
          progress.report({
            message: `Requirement ${i + 1}/${allRequirements.length}: ${req.id}`,
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
          `Comparison complete: ${percentage}% compliant (${implemented}/${total} requirements)`,
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'Comparison cancelled') {
          vscode.window.showWarningMessage('Comparison cancelled');
        } else {
          vscode.window.showErrorMessage(`Error during comparison: ${error}`);
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
    vscode.window.showErrorMessage('No workspace open');
    return;
  }

  const format = await vscode.window.showQuickPick(
    [
      { label: 'Markdown', description: 'Format .md', value: 'md' },
      { label: 'Word (DOCX)', description: 'Format .docx', value: 'docx' },
      { label: 'Both', description: 'Markdown and Word', value: 'both' },
    ],
    { placeHolder: 'Choose the output format' },
  );

  if (!format) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Generating documentation',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Detecting projects...' });

        const projects = await getWorkspaceProjects();
        if (projects.length === 0) {
          throw new Error('No projects detected');
        }

        const outputDir = vscode.workspace.getConfiguration('specSync.documentation').get<string>('outputPath', './docs');
        const outputPath = path.join(workspaceFolders[0].uri.fsPath, outputDir);

        // Create output directory
        await fs.mkdir(outputPath, { recursive: true });

        for (const project of projects) {
          progress.report({ message: `Analyzing ${project.name}...` });

          const analysis = await analyzeProject(project.path);

          // Generate documentation content
          const doc: any = {
            projectInfo: analysis.projectInfo,
            sections: [
              {
                title: 'Overview',
                key: 'overview',
                content: `# ${project.name}\n\nType: ${project.type}\nLanguage: ${project.language}`,
                priority: 1,
              },
            ],
            generatedAt: new Date().toISOString(),
          };

          progress.report({ message: `Exporting ${project.name}...` });

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
          `Documentation generated in ${outputDir}/`,
          'Open Folder',
        );

        if (action === 'Open Folder') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error during generation: ${error}`);
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
    vscode.window.showInformationMessage('No comparison available. Run a comparison first.');
    return;
  }

  const gaps = comparison.details.filter(
    d => d.status === 'not-implemented' || d.status === 'divergent'
  );

  if (gaps.length === 0) {
    vscode.window.showInformationMessage('No gaps found! All requirements are implemented.');
    return;
  }

  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    'specSyncGaps',
    'Compliance Gaps',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  let html = '<!DOCTYPE html><html><head><style>body{padding:20px;font-family:var(--vscode-font-family);color:var(--vscode-foreground);}h2{color:var(--vscode-foreground);}table{width:100%;border-collapse:collapse;}th,td{padding:8px;text-align:left;border-bottom:1px solid var(--vscode-panel-border);}th{background:var(--vscode-editor-background);font-weight:600;}.missing{color:#f48771;}.divergent{color:#cca700;}</style></head><body>';
  html += `<h2>Compliance Gaps (${gaps.length} requirements)</h2>`;
  html += '<table><tr><th>ID</th><th>Status</th><th>Requirement</th><th>Confidence</th></tr>';

  for (const gap of gaps) {
    const statusClass = gap.status === 'not-implemented' ? 'missing' : 'divergent';
    const statusText = gap.status === 'not-implemented' ? 'Not Implemented' : 'Divergent';
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
    vscode.window.showInformationMessage('No comparison available.');
    return;
  }

  const s = comparison.summary;
  const percentage = Math.round((s.implemented / s.total) * 100);
  const level = getComplianceLevelLabel(percentage);

  const panel = vscode.window.createWebviewPanel(
    'specSyncStatus',
    'Compliance Status',
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
    .progress-wrap {
      width: 100%;
      height: 12px;
      background: rgba(128,128,128,.2);
      border-radius: 6px;
      overflow: hidden;
      margin: 8px 0;
    }
    .progress-bar {
      height: 100%;
      border-radius: 6px;
      background: ${percentage >= 80 ? '#89d185' : percentage >= 60 ? '#cca700' : '#f48771'};
    }
    .level-badge {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 16px;
      background: ${percentage >= 80 ? 'rgba(137,209,133,.2)' : percentage >= 60 ? 'rgba(204,167,0,.2)' : 'rgba(244,135,113,.2)'};
      color: ${percentage >= 80 ? '#89d185' : percentage >= 60 ? '#cca700' : '#f48771'};
    }
    table { border-collapse: collapse; margin-top: 20px; width: 100%; }
    th, td { padding: 6px 12px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); font-size: 12px; }
    th { font-weight: 600; }
    .current-row { background: rgba(137,209,133,.1); font-weight: 600; }
  </style>
</head>
<body>
  <h2>Compliance Status: ${percentage}%</h2>
  <div class="level-badge">${level}</div>
  <div class="progress-wrap"><div class="progress-bar" style="width:${percentage}%"></div></div>

  <div class="stat-box">
    <div class="stat-value">${s.total}</div>
    <div class="stat-label">Total requirements</div>
  </div>

  <div class="stat-box implemented">
    <div class="stat-value">${s.implemented}</div>
    <div class="stat-label">Implemented</div>
  </div>

  <div class="stat-box partial">
    <div class="stat-value">${s.partial}</div>
    <div class="stat-label">Partial</div>
  </div>

  <div class="stat-box missing">
    <div class="stat-value">${s.notImplemented}</div>
    <div class="stat-label">Missing</div>
  </div>

  <div class="stat-box divergent">
    <div class="stat-value">${s.divergent}</div>
    <div class="stat-label">Divergent</div>
  </div>

  <h3 style="margin-top:24px">Compliance Scale</h3>
  <table>
    <tr><th>Threshold</th><th>Level</th></tr>
    <tr${percentage === 100 ? ' class="current-row"' : ''}><td>100%</td><td>Perfect</td></tr>
    <tr${percentage >= 95 && percentage < 100 ? ' class="current-row"' : ''}><td>95-99%</td><td>Excellent</td></tr>
    <tr${percentage >= 90 && percentage < 95 ? ' class="current-row"' : ''}><td>90-94%</td><td>Very Good</td></tr>
    <tr${percentage >= 80 && percentage < 90 ? ' class="current-row"' : ''}><td>80-89%</td><td>Good</td></tr>
    <tr${percentage >= 70 && percentage < 80 ? ' class="current-row"' : ''}><td>70-79%</td><td>Fair</td></tr>
    <tr${percentage >= 60 && percentage < 70 ? ' class="current-row"' : ''}><td>60-69%</td><td>Average</td></tr>
    <tr${percentage >= 50 && percentage < 60 ? ' class="current-row"' : ''}><td>50-59%</td><td>Insufficient</td></tr>
    <tr${percentage >= 40 && percentage < 50 ? ' class="current-row"' : ''}><td>40-49%</td><td>Weak</td></tr>
    <tr${percentage >= 25 && percentage < 40 ? ' class="current-row"' : ''}><td>25-39%</td><td>Very Weak</td></tr>
    <tr${percentage >= 10 && percentage < 25 ? ' class="current-row"' : ''}><td>10-24%</td><td>Critical</td></tr>
    <tr${percentage < 10 ? ' class="current-row"' : ''}><td>0-9%</td><td>Not Started</td></tr>
  </table>
</body>
</html>`;
}

function getComplianceLevelLabel(pct: number): string {
  if (pct === 100) { return 'Perfect'; }
  if (pct >= 95) { return 'Excellent'; }
  if (pct >= 90) { return 'Very Good'; }
  if (pct >= 80) { return 'Good'; }
  if (pct >= 70) { return 'Fair'; }
  if (pct >= 60) { return 'Average'; }
  if (pct >= 50) { return 'Insufficient'; }
  if (pct >= 40) { return 'Weak'; }
  if (pct >= 25) { return 'Very Weak'; }
  if (pct >= 10) { return 'Critical'; }
  return 'Not Started';
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
      title: `Implementing requirement ${requirementId}`,
      cancellable: true,
    },
    async (progress, token) => {
      try {
        progress.report({ message: 'Selecting model...' });

        let model: vscode.LanguageModelChat | undefined;
        const allModels = await vscode.lm.selectChatModels();
        if (allModels && Array.isArray(allModels)) {
          if (preferredModelId) {
            model = allModels.find(m => m.id === preferredModelId);
          }
          if (!model && allModels.length > 0) {
            model = allModels[0];
          }
        }
        if (!model) {
          throw new Error('No language model available.');
        }

        progress.report({ message: 'Generating proposal...' });

        // Retrieve selected projects for context
        const selectedProjects: ProjectInfo[] | undefined = context.workspaceState.get('specSync.selectedProjects');
        const projectContext = selectedProjects && selectedProjects.length > 0
          ? selectedProjects.map(p => `- ${p.name} (${p.type}, ${p.language}, path: ${p.path})`).join('\n')
          : '(no project selected)';
        const targetFolder = selectedProjects && selectedProjects.length > 0
          ? selectedProjects[0].path
          : '';
        const techStack = selectedProjects && selectedProjects.length > 0
          ? `Type: ${selectedProjects[0].type}, Language: ${selectedProjects[0].language}` +
            (selectedProjects[0].dependencies ? `, Dependencies: ${Object.keys(selectedProjects[0].dependencies).slice(0, 15).join(', ')}` : '')
          : '';

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
          vscode.LanguageModelChatMessage.User(`You are an expert developer. You are asked to implement the following requirement in existing code.

REQUIREMENT: [${requirementId}] ${requirementText}

TARGET PROJECT:
${projectContext}

TECHNICAL CONSTRAINTS:
${techStack}
Project root folder: ${targetFolder}
All created or modified files MUST be inside this folder.
Follow the conventions, language, frameworks and patterns already used in the project.

SUGGESTED ACTIONS:
${suggestedActions.map(a => '- ' + a).join('\n') || '(none)'}

RELEVANT EXISTING CODE:
${fileContext || '(no associated files)'}

Generate the code necessary to implement this requirement. Clearly indicate:
1. In which file to add/modify the code (paths relative to the project folder)
2. The complete code to add or modify
3. A brief explanation

Respond in English.`),
        ];

        const response = await model.sendRequest(prompt, {}, token);

        // Collect the streamed response
        let resultText = '';
        for await (const chunk of response.text) {
          resultText += chunk;
        }

        // Show result in a new editor tab
        const doc = await vscode.workspace.openTextDocument({
          content: `# Implementation: ${requirementId}\n\n## Requirement\n${requirementText}\n\n## Proposal\n\n${resultText}`,
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, { preview: false });

      } catch (error) {
        if (token.isCancellationRequested) {
          return;
        }
        vscode.window.showErrorMessage(`Error: ${error}`);
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
