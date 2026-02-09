import * as vscode from 'vscode';
import * as path from 'path';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { analyzeProject } from '../doc-generator/projectAnalyzer.js';
import { exportAsMarkdown, exportAsDocx, buildMarkdownString } from '../doc-generator/docBuilder.js';
import { buildStructureAnalysisMessages, buildSectionGenerationMessages } from '../doc-generator/prompts/docGenerationPrompts.js';
import { getWorkspaceProjects, getRelevantFiles, readFileContent } from '../utils/fileUtils.js';
import { GeneratedDocumentation, DocumentationSection, ProjectInfo, ModuleType } from '../types.js';

const DOC_SECTIONS: { key: string; title: string; category: ModuleType }[] = [
  { key: 'overview', title: 'Overview', category: 'other' },
  { key: 'architecture', title: 'Architecture', category: 'other' },
  { key: 'api', title: 'API / Endpoints', category: 'routes' },
  { key: 'models', title: 'Data Models', category: 'models' },
  { key: 'services', title: 'Services / Business Logic', category: 'services' },
  { key: 'config', title: 'Configuration', category: 'config' },
  { key: 'tests', title: 'Tests', category: 'tests' },
  { key: 'deployment', title: 'Deployment', category: 'other' },
];

export async function handleDocGeneration(
  request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  context: vscode.ExtensionContext,
  _storage?: StorageManager,
): Promise<vscode.ChatResult> {
  const prompt = request.prompt.toLowerCase().trim();

  // Handle export commands
  if (prompt.includes('export md') || prompt.includes('export markdown')) {
    return await handleExport(context, stream, 'markdown');
  }
  if (prompt.includes('export docx') || prompt.includes('export word')) {
    return await handleExport(context, stream, 'docx');
  }

  // Detect projects
  stream.progress('Detecting projects in workspace...');
  const projects = await getWorkspaceProjects();

  if (projects.length === 0) {
    stream.markdown('No projects detected in the workspace. Open a folder containing a project.');
    return {};
  }

  // Display detected projects
  stream.markdown(`**Projects detected**:\n\n`);
  for (const project of projects) {
    stream.markdown(`- \`${project.name}/\` (${project.type} - ${project.language})\n`);
  }
  stream.markdown('\n---\n\n');

  const lang = vscode.workspace.getConfiguration('specSync.documentation').get<string>('language', 'fr');
  const model = request.model;

  // Generate documentation for each project
  for (const project of projects) {
    if (token.isCancellationRequested) { break; }

    stream.markdown(`# Documentation - ${project.name}\n\n`);
    stream.progress(`Analyzing project ${project.name}...`);

    // Step 1: Analyze project structure
    const analysis = await analyzeProject(project.path);

    // Step 2: Get structure overview from LLM
    const structureMessages = buildStructureAnalysisMessages(analysis);
    let structureOverview = '';
    try {
      const structureResponse = await model.sendRequest(structureMessages, {}, token);
      for await (const fragment of structureResponse.text) {
        structureOverview += fragment;
      }
    } catch {
      structureOverview = `Projet ${project.type} avec ${analysis.fileTree.length} fichiers.`;
    }

    // Step 3: Generate each section
    const sections: DocumentationSection[] = [];

    for (const section of DOC_SECTIONS) {
      if (token.isCancellationRequested) { break; }

      stream.progress(`Generating: ${section.title}...`);

      // Gather relevant files for this section
      const relevantFilePaths = await getRelevantFiles(project.path, section.category, project.type);
      const relevantFiles = await Promise.all(
        relevantFilePaths.slice(0, 10).map(async (filePath) => {
          const content = await readFileContent(filePath, 30000);
          const ext = path.extname(filePath).replace('.', '');
          return {
            path: path.relative(project.path, filePath),
            content,
            language: ext || 'text',
          };
        }),
      );

      const messages = buildSectionGenerationMessages(
        section.key,
        analysis,
        relevantFiles,
        lang,
      );

      let sectionContent = '';
      try {
        stream.markdown(`## ${section.title}\n\n`);
        const response = await model.sendRequest(messages, {}, token);
        for await (const fragment of response.text) {
          stream.markdown(fragment);
          sectionContent += fragment;
        }
        stream.markdown('\n\n');
      } catch {
        sectionContent = `*Section not generated (LLM error)*`;
        stream.markdown(`${sectionContent}\n\n`);
      }

      sections.push({
        title: section.title,
        key: section.key,
        content: sectionContent,
        priority: DOC_SECTIONS.indexOf(section),
      });
    }

    // Store generated documentation for later export
    const documentation: GeneratedDocumentation = {
      projectInfo: project,
      sections,
      generatedAt: new Date().toISOString(),
    };

    await context.workspaceState.update('lastGeneratedDoc', documentation);
  }

  // Offer export buttons
  stream.markdown('---\n\n');
  stream.button({
    command: 'specSync.exportMarkdown',
    title: 'Export as Markdown',
  });
  stream.button({
    command: 'specSync.exportDocx',
    title: 'Export as Word',
  });

  return { metadata: { command: 'doc' } };
}

async function handleExport(
  context: vscode.ExtensionContext,
  stream: vscode.ChatResponseStream,
  format: 'markdown' | 'docx',
): Promise<vscode.ChatResult> {
  const doc = context.workspaceState.get<GeneratedDocumentation>('lastGeneratedDoc');
  if (!doc) {
    stream.markdown('No documentation generated. Use `@specsync /doc` to generate one.');
    return {};
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    stream.markdown('No workspace open.');
    return {};
  }

  const outputDir = vscode.workspace.getConfiguration('specSync.documentation').get<string>('outputPath', './docs');
  const outputPath = path.join(workspaceFolder.uri.fsPath, outputDir);

  try {
    if (format === 'markdown') {
      const filePath = await exportAsMarkdown(doc, outputPath);
      stream.markdown(`Documentation exportée en Markdown : \`${path.relative(workspaceFolder.uri.fsPath, filePath)}\``);
    } else {
      const filePath = await exportAsDocx(doc, outputPath);
      stream.markdown(`Documentation exportée en Word : \`${path.relative(workspaceFolder.uri.fsPath, filePath)}\``);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stream.markdown(`**Export error**: ${msg}`);
  }

  return { metadata: { command: 'doc' } };
}
