import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { findRelevantCode } from '../spec-comparator/codeMapper.js';
import { analyzeRequirement, consolidateResults } from '../spec-comparator/gapAnalyzer.js';
import { getWorkspaceProjects, getGitCommitHash } from '../utils/fileUtils.js';
import { Requirement, SpecSection, ComparisonRecord, RequirementComparison } from '../types.js';

export async function handleComparison(
  request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  _context: vscode.ExtensionContext,
  storage?: StorageManager,
): Promise<vscode.ChatResult> {
  if (!storage) {
    stream.markdown('**Erreur** : Aucun workspace ouvert. Ouvrez un dossier pour utiliser cette fonctionnalité.');
    return {};
  }

  const specs = await storage.listSpecs();
  if (specs.length === 0) {
    stream.markdown('Aucune spécification uploadée. Utilisez `@specsync /upload` pour en ajouter une.');
    return {};
  }

  // Select spec (use last active or first available)
  const config = await storage.getConfig();
  const specId = config.lastActiveSpecId || specs[0].id;
  const spec = await storage.getSpec(specId);

  if (!spec) {
    stream.markdown(`**Erreur** : Impossible de charger la spécification ${specId}.`);
    return {};
  }

  const projects = await getWorkspaceProjects();
  if (projects.length === 0) {
    stream.markdown('Aucun projet détecté dans le workspace.');
    return {};
  }

  // Flatten all requirements
  const allRequirements = flattenRequirements(spec.sections);
  if (allRequirements.length === 0) {
    stream.markdown('Aucune exigence détectée dans la spécification. La comparaison ne peut pas être effectuée.');
    return {};
  }

  stream.markdown(`## Comparaison en cours\n\n`);
  stream.markdown(`**Spécification** : ${spec.title} v${spec.version}\n`);
  stream.markdown(`**Exigences** : ${allRequirements.length}\n`);
  stream.markdown(`**Projets** : ${projects.map(p => p.name).join(', ')}\n\n`);

  // Get LLM model
  const model = request.model;

  // Get git commit hash
  const gitHash = await getGitCommitHash(projects[0].path);

  // Analyze each requirement
  const results: RequirementComparison[] = [];

  for (let i = 0; i < allRequirements.length; i++) {
    if (token.isCancellationRequested) {
      stream.markdown('\n\n*Analyse annulée par l\'utilisateur.*\n');
      break;
    }

    const req = allRequirements[i];
    stream.progress(`Analyse ${req.id} (${i + 1}/${allRequirements.length})...`);

    const candidates = await findRelevantCode(req, projects, 5);
    const result = await analyzeRequirement(req, candidates, model, token);
    results.push(result);
  }

  // Get previous comparison for evolution tracking
  const previousComparison = await storage.getLatestComparison(specId);

  // Consolidate and save
  const comparison = consolidateResults(
    results,
    specId,
    spec.version,
    projects.map(p => p.path),
    gitHash,
    previousComparison,
  );

  await storage.saveComparison(comparison);

  // Stream the report
  streamReport(stream, comparison, spec.title);

  // Offer buttons
  stream.button({
    command: 'specSync.showCompliance',
    title: 'Voir les écarts',
  });

  // Refresh trees
  try {
    await vscode.commands.executeCommand('specSync.refreshTrees');
  } catch {
    // ignore if command not registered
  }

  return { metadata: { command: 'compare' } };
}

function streamReport(
  stream: vscode.ChatResponseStream,
  comparison: ComparisonRecord,
  specTitle: string,
): void {
  const s = comparison.summary;
  const implPct = s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0;
  const partialPct = s.total > 0 ? Math.round((s.partial / s.total) * 100) : 0;
  const missingPct = s.total > 0 ? Math.round((s.notImplemented / s.total) * 100) : 0;
  const divPct = s.total > 0 ? Math.round((s.divergent / s.total) * 100) : 0;

  stream.markdown(`\n---\n\n## Rapport de conformité - ${specTitle}\n\n`);

  // Summary
  stream.markdown(`### Résumé\n\n`);
  stream.markdown(`| Statut | Nombre | Pourcentage |\n|---|---|---|\n`);
  stream.markdown(`| Implémentées | ${s.implemented} | ${implPct}% |\n`);
  stream.markdown(`| Partielles | ${s.partial} | ${partialPct}% |\n`);
  stream.markdown(`| Non implémentées | ${s.notImplemented} | ${missingPct}% |\n`);
  stream.markdown(`| Divergentes | ${s.divergent} | ${divPct}% |\n`);
  stream.markdown(`| **Total** | **${s.total}** | **100%** |\n\n`);

  if (comparison.gitCommitHash) {
    stream.markdown(`> Commit : \`${comparison.gitCommitHash}\`\n\n`);
  }

  // Details table
  stream.markdown(`### Détail par exigence\n\n`);
  stream.markdown(`| ID | Exigence | Statut | Confiance | Fichiers |\n|---|---|---|---|---|\n`);

  for (const detail of comparison.details) {
    const statusIcon = getStatusIcon(detail.status);
    const truncText = detail.requirementText.length > 60
      ? detail.requirementText.substring(0, 60) + '...'
      : detail.requirementText;
    const files = detail.matchedFiles.slice(0, 2).map(f => `\`${f.filePath}\``).join(', ') || '-';
    const evolution = detail.evolution !== 'new' && detail.evolution !== 'unchanged'
      ? ` ${getEvolutionIcon(detail.evolution)}`
      : '';

    stream.markdown(`| ${detail.requirementId} | ${truncText} | ${statusIcon}${evolution} | ${detail.confidence}% | ${files} |\n`);
  }

  stream.markdown('\n');
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'implemented': return 'Impl.';
    case 'partially-implemented': return 'Partiel';
    case 'not-implemented': return 'Manquant';
    case 'divergent': return 'Divergent';
    default: return status;
  }
}

function getEvolutionIcon(evolution: string): string {
  switch (evolution) {
    case 'improved': return '(+)';
    case 'regressed': return '(-)';
    default: return '';
  }
}

function flattenRequirements(sections: SpecSection[]): Requirement[] {
  const reqs: Requirement[] = [];
  for (const section of sections) {
    reqs.push(...section.requirements);
    reqs.push(...flattenRequirements(section.subsections));
  }
  return reqs;
}
