import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';

export async function handleGapReport(
  _request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  _context: vscode.ExtensionContext,
  storage?: StorageManager,
): Promise<vscode.ChatResult> {
  if (!storage) {
    stream.markdown('**Erreur** : Aucun workspace ouvert.');
    return {};
  }

  const comparison = await storage.getLatestComparisonForAnySpec();
  if (!comparison) {
    stream.markdown('Aucune comparaison disponible. Utilisez `@specsync /compare` pour en lancer une.');
    return {};
  }

  const gaps = comparison.details.filter(
    d => d.status === 'not-implemented' || d.status === 'divergent' || d.status === 'partially-implemented',
  );

  if (gaps.length === 0) {
    stream.markdown('Toutes les exigences sont implémentées. Aucun écart détecté.');
    return { metadata: { command: 'gaps' } };
  }

  stream.markdown(`## Écarts détectés (${gaps.length})\n\n`);

  // Not implemented
  const notImpl = gaps.filter(g => g.status === 'not-implemented');
  if (notImpl.length > 0) {
    stream.markdown(`### Non implémentées (${notImpl.length})\n\n`);
    stream.markdown(`| ID | Exigence | Actions suggérées |\n|---|---|---|\n`);
    for (const gap of notImpl) {
      const truncText = gap.requirementText.length > 60 ? gap.requirementText.substring(0, 60) + '...' : gap.requirementText;
      const actions = gap.suggestedActions.slice(0, 1).join('; ') || '-';
      stream.markdown(`| ${gap.requirementId} | ${truncText} | ${actions} |\n`);
    }
    stream.markdown('\n');
  }

  // Partially implemented
  const partial = gaps.filter(g => g.status === 'partially-implemented');
  if (partial.length > 0) {
    stream.markdown(`### Partiellement implémentées (${partial.length})\n\n`);
    stream.markdown(`| ID | Exigence | Éléments manquants |\n|---|---|---|\n`);
    for (const gap of partial) {
      const truncText = gap.requirementText.length > 60 ? gap.requirementText.substring(0, 60) + '...' : gap.requirementText;
      const missing = gap.missingElements.slice(0, 2).join('; ') || '-';
      stream.markdown(`| ${gap.requirementId} | ${truncText} | ${missing} |\n`);
    }
    stream.markdown('\n');
  }

  // Divergent
  const divergent = gaps.filter(g => g.status === 'divergent');
  if (divergent.length > 0) {
    stream.markdown(`### Divergentes (${divergent.length})\n\n`);
    stream.markdown(`| ID | Exigence | Explication |\n|---|---|---|\n`);
    for (const gap of divergent) {
      const truncText = gap.requirementText.length > 60 ? gap.requirementText.substring(0, 60) + '...' : gap.requirementText;
      const explanation = gap.explanation.length > 80 ? gap.explanation.substring(0, 80) + '...' : gap.explanation;
      stream.markdown(`| ${gap.requirementId} | ${truncText} | ${explanation} |\n`);
    }
    stream.markdown('\n');
  }

  return { metadata: { command: 'gaps' } };
}
