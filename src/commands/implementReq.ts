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
    stream.markdown('**Erreur** : Aucun workspace ouvert.');
    return {};
  }

  // Extract requirement ID from prompt
  const reqIdMatch = request.prompt.match(/REQ-(\d+)/i);
  if (!reqIdMatch) {
    stream.markdown('Spécifiez un ID d\'exigence. Exemple : `@specsync /implement REQ-003`');
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
    stream.markdown(`Exigence **${reqId}** non trouvée dans les spécifications uploadées.`);
    return {};
  }

  stream.markdown(`## Proposition d'implémentation - ${reqId}\n\n`);
  stream.markdown(`**Exigence** : ${requirement.text}\n`);
  stream.markdown(`**Type** : ${requirement.type} | **Priorité** : ${requirement.priority}\n\n`);

  stream.progress('Analyse du code existant...');

  const projects = await getWorkspaceProjects();
  const candidates = await findRelevantCode(requirement, projects, 8);

  // Build context for LLM
  let codeContext = '';
  for (const file of candidates.slice(0, 5)) {
    const ext = file.relativePath.split('.').pop() || '';
    const truncContent = file.content.length > 5000 ? file.content.substring(0, 5000) + '\n// ...' : file.content;
    codeContext += `### ${file.relativePath}\n\`\`\`${ext}\n${truncContent}\n\`\`\`\n\n`;
  }

  const prompt = `Tu es un architecte logiciel expert. On te demande de proposer l'implémentation d'une exigence manquante.

## Exigence à implémenter
${reqId}: ${requirement.text}

## Code existant pertinent
${codeContext || '*Aucun code existant trouvé.*'}

## Projets dans le workspace
${projects.map(p => `- ${p.name} (${p.type}, ${p.language})`).join('\n')}

Propose un plan d'implémentation détaillé :
1. Liste les fichiers à créer avec leur chemin et une description
2. Liste les fichiers existants à modifier avec les changements nécessaires
3. Donne des notes architecturales si pertinent
4. Estime la complexité (faible/moyenne/élevée)

Ensuite, génère le code pour les fichiers principaux.`;

  try {
    stream.progress('Génération de la proposition...');
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }
  } catch {
    stream.markdown('*Erreur lors de la génération de la proposition.*');
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
