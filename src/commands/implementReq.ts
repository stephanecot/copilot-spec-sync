import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { findRelevantCode } from '../spec-comparator/codeMapper.js';
import { getWorkspaceProjects } from '../utils/fileUtils.js';
import { Requirement, SpecSection } from '../types.js';

export async function handleImplementation(
  request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  _context: vscode.ExtensionContext,
  storage?: StorageManager,
): Promise<vscode.ChatResult> {
  if (!storage) {
    stream.markdown('**Error**: No workspace open.');
    return {};
  }

  // Extract requirement ID from prompt
  const reqIdMatch = request.prompt.match(/REQ-(\d+)/i);
  if (!reqIdMatch) {
    stream.markdown('Specify a requirement ID. Example: `@specsync /implement REQ-003`');
    return {};
  }

  const reqId = `REQ-${reqIdMatch[1].padStart(3, '0')}`;

  // Find the requirement in specs
  const specs = await storage.listSpecs();
  let requirement: Requirement | undefined;

  for (const specMeta of specs) {
    const spec = await storage.getSpec(specMeta.id);
    if (!spec) { continue; }

    requirement = findRequirement(spec.sections, reqId);
    if (requirement) { break; }
  }

  if (!requirement) {
    stream.markdown(`Requirement **${reqId}** not found in uploaded specifications.`);
    return {};
  }

  stream.markdown(`## Implementation Proposal - ${reqId}\n\n`);
  stream.markdown(`**Requirement**: ${requirement.text}\n`);
  stream.markdown(`**Type**: ${requirement.type} | **Priority**: ${requirement.priority}\n\n`);

  stream.progress('Analyzing existing code...');

  // Get all projects, then let user pick which sub-project to target
  const allProjects = await getWorkspaceProjects();
  let projects = allProjects;
  if (allProjects.length > 1) {
    const projectItems = allProjects.map(p => ({
      label: p.name,
      description: `${p.type} · ${p.language}`,
      detail: p.path,
      picked: false,
      project: p,
    }));

    const pickedProjects = await vscode.window.showQuickPick(projectItems, {
      placeHolder: 'Select the target sub-project for implementation',
      canPickMany: false,
    });

    if (!pickedProjects) {
      stream.markdown('*Implementation cancelled (no project selected).*');
      return {};
    }
    projects = [pickedProjects.project];
  }

  const candidates = await findRelevantCode(requirement, projects, 8);

  // Build context for LLM
  let codeContext = '';
  for (const file of candidates.slice(0, 5)) {
    const ext = file.relativePath.split('.').pop() || '';
    const truncContent = file.content.length > 5000 ? file.content.substring(0, 5000) + '\n// ...' : file.content;
    codeContext += `### ${file.relativePath}\n\`\`\`${ext}\n${truncContent}\n\`\`\`\n\n`;
  }

  const targetProject = projects[0];
  const techStack = `Type: ${targetProject.type}, Langage: ${targetProject.language}` +
    (targetProject.dependencies ? `, Dependencies: ${Object.keys(targetProject.dependencies).slice(0, 15).join(', ')}` : '');

  const prompt = `You are an expert software architect. You are asked to propose the implementation of a missing requirement.

## Requirement to Implement
${reqId}: ${requirement.text}

## Target Project
- Name: ${targetProject.name}
- Path: ${targetProject.path}
- ${techStack}

## Technical Constraints
- All created or modified files MUST be in the project folder: ${targetProject.path}
- Follow the conventions, language (${targetProject.language}), frameworks and patterns already used in the project.
- Use the same dependencies and libraries as those existing in the project.

## Relevant Existing Code
${codeContext || '*No existing code found.*'}

Propose a detailed implementation plan:
1. List the files to create with their path relative to the project and a description
2. List the existing files to modify with the necessary changes
3. Provide architectural notes if relevant
4. Estimate the complexity (low/medium/high)

Then, generate the code for the main files.`;

  try {
    stream.progress('Generating proposal...');
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }
  } catch {
    stream.markdown('*Error generating the proposal.*');
  }

  stream.markdown('\n\n---\n');

  return { metadata: { command: 'implement' } };
}

function findRequirement(sections: SpecSection[], reqId: string): Requirement | undefined {
  for (const section of sections) {
    const found = section.requirements.find(r => r.id === reqId);
    if (found) { return found; }
    const sub = findRequirement(section.subsections, reqId);
    if (sub) { return sub; }
  }
  return undefined;
}
