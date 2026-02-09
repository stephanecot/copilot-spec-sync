import * as vscode from 'vscode';
import { ProjectAnalysis } from '../../types.js';
import { truncateToTokenBudget } from '../../utils/tokenBudget.js';

export function buildStructureAnalysisMessages(analysis: ProjectAnalysis): vscode.LanguageModelChatMessage[] {
  const fileTreeStr = analysis.fileTree.slice(0, 100).join('\n');
  const keyFilesStr = analysis.keyFiles.map(f => `- ${f.path} (${f.role})`).join('\n');
  const modulesStr = analysis.moduleStructure.map(m => `- ${m.name}/ (${m.type}, ${m.files.length} files)`).join('\n');
  const depsStr = Object.entries(analysis.projectInfo.dependencies).slice(0, 20).map(([k, v]) => `  ${k}: ${v}`).join('\n');

  const prompt = `You are an expert software architect. Analyze the following structure and produce a documentation plan.

## Project: ${analysis.projectInfo.name}
**Type**: ${analysis.projectInfo.type}
**Language**: ${analysis.projectInfo.language}
**Frameworks**: ${analysis.frameworks.join(', ') || 'N/A'}
**Patterns**: ${analysis.patterns.join(', ') || 'N/A'}

## Entry Points
${analysis.projectInfo.entryPoints.join(', ') || 'N/A'}

## Key Files
${keyFilesStr || 'None'}

## Modules
${modulesStr || 'None'}

## Dependencies
${depsStr || 'None'}

## File Tree (excerpt)
${truncateToTokenBudget(fileTreeStr, 2000)}

Produce a concise structural summary of this project in 3-5 sentences.`;

  return [vscode.LanguageModelChatMessage.User(prompt)];
}

export function buildSectionGenerationMessages(
  section: string,
  projectAnalysis: ProjectAnalysis,
  relevantFiles: { path: string; content: string; language: string }[],
  lang: string,
): vscode.LanguageModelChatMessage[] {
  const langInstruction = lang === 'fr'
    ? 'Rédige la documentation en français.'
    : 'Write the documentation in English.';

  const sectionInstructions: Record<string, string> = {
    overview: `Generate a project overview: description, tech stack, main dependencies, project objective. ${langInstruction}`,
    architecture: `Describe the project architecture: folder structure, design patterns (MVC, microservices, etc.), data flow. Include a Mermaid diagram if possible. ${langInstruction}`,
    api: `Document the project APIs and endpoints: HTTP routes, methods, parameters, request/response bodies. Format as Markdown tables. ${langInstruction}`,
    models: `Document the data models: entities, schemas, DTOs, model relationships. Format as tables. ${langInstruction}`,
    services: `Document the services and business logic: description of each service, public methods, main business flows. ${langInstruction}`,
    config: `Document the configuration: environment variables, config files, profiles. ${langInstruction}`,
    tests: `Document the testing strategy: test types, coverage, frameworks used, how to run tests. ${langInstruction}`,
    deployment: `Document deployment: scripts, Dockerfiles, CI/CD, deployment instructions. ${langInstruction}`,
  };

  const instruction = sectionInstructions[section] || `Document the "${section}" section. ${langInstruction}`;

  let filesContext = '';
  let totalTokens = 0;
  const maxTokens = 15000;

  for (const file of relevantFiles) {
    const fileBlock = `### ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`;
    const tokens = Math.ceil(fileBlock.length / 4);

    if (totalTokens + tokens > maxTokens) {
      const remaining = maxTokens - totalTokens;
      if (remaining > 500) {
        filesContext += `### ${file.path}\n\`\`\`${file.language}\n${truncateToTokenBudget(file.content, remaining - 100)}\n\`\`\`\n\n`;
      }
      break;
    }

    filesContext += fileBlock;
    totalTokens += tokens;
  }

  const prompt = `You are an expert technical writer. ${instruction}

## Project Context
- **Name**: ${projectAnalysis.projectInfo.name}
- **Type**: ${projectAnalysis.projectInfo.type}
- **Language**: ${projectAnalysis.projectInfo.language}
- **Frameworks**: ${projectAnalysis.frameworks.join(', ') || 'N/A'}

## Relevant Source Files

${filesContext || '*No relevant files found for this section.*'}

Generate the documentation for this section. Be concise, precise, and technical. Use Markdown tables when appropriate.
Do not repeat the section title, start directly with the content.`;

  return [vscode.LanguageModelChatMessage.User(prompt)];
}
