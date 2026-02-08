import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { computeSnapshotDiff } from '../history/diffTracker.js';

export async function handleHistory(
  request: vscode.ChatRequest,
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

  const prompt = request.prompt.trim().toLowerCase();

  // Handle "compare" sub-command
  if (prompt.includes('compare')) {
    return await handleHistoryCompare(request.prompt, stream, storage);
  }

  // Default: show history table
  const specs = await storage.listSpecs();
  if (specs.length === 0) {
    stream.markdown('Aucune spécification. Utilisez `@specsync /upload` pour commencer.');
    return {};
  }

  stream.markdown(`## Historique des comparaisons\n\n`);

  for (const spec of specs) {
    const comparisons = await storage.listComparisons(spec.id);
    if (comparisons.length === 0) {
      stream.markdown(`### ${spec.title} v${spec.version}\nAucune comparaison.\n\n`);
      continue;
    }

    stream.markdown(`### ${spec.title} v${spec.version}\n\n`);
    stream.markdown(`| Date | Commit | Impl. | Partiel | Manquant | Divergent | Progression |\n|---|---|---|---|---|---|---|\n`);

    for (let i = 0; i < comparisons.length; i++) {
      const c = comparisons[i];
      const date = new Date(c.timestamp).toLocaleDateString('fr-FR');
      const commit = c.gitCommitHash || '-';
      const s = c.summary;

      let progression = '-';
      if (i < comparisons.length - 1) {
        const prev = comparisons[i + 1];
        const diff = s.implemented - prev.summary.implemented;
        if (diff > 0) { progression = `+${diff}`; }
        else if (diff < 0) { progression = `${diff}`; }
        else { progression = '='; }
      } else {
        progression = 'baseline';
      }

      stream.markdown(`| ${date} | \`${commit}\` | ${s.implemented} | ${s.partial} | ${s.notImplemented} | ${s.divergent} | ${progression} |\n`);
    }

    stream.markdown('\n');
  }

  return { metadata: { command: 'history' } };
}

async function handleHistoryCompare(
  prompt: string,
  stream: vscode.ChatResponseStream,
  storage: StorageManager,
): Promise<vscode.ChatResult> {
  const specs = await storage.listSpecs();
  if (specs.length === 0) {
    stream.markdown('Aucune spécification disponible.');
    return {};
  }

  const specId = specs[0].id;
  const comparisons = await storage.listComparisons(specId);

  if (comparisons.length < 2) {
    stream.markdown('Il faut au moins 2 comparaisons pour comparer. Relancez `@specsync /compare` après avoir modifié votre code.');
    return {};
  }

  // Use the two most recent comparisons by default
  const current = comparisons[0];
  const previous = comparisons[1];

  const diff = computeSnapshotDiff(current, previous);

  const currentDate = new Date(current.timestamp).toLocaleDateString('fr-FR');
  const prevDate = new Date(previous.timestamp).toLocaleDateString('fr-FR');

  stream.markdown(`## Évolution du ${prevDate} au ${currentDate}\n\n`);

  if (diff.newlyImplemented.length > 0) {
    stream.markdown(`### Nouvellement implémentées (${diff.newlyImplemented.length})\n\n`);
    for (const r of diff.newlyImplemented) {
      const truncText = r.requirementText.length > 60 ? r.requirementText.substring(0, 60) + '...' : r.requirementText;
      stream.markdown(`- **${r.requirementId}** : ${truncText}\n`);
    }
    stream.markdown('\n');
  }

  if (diff.improved.length > 0) {
    stream.markdown(`### Améliorées (${diff.improved.length})\n\n`);
    for (const r of diff.improved) {
      stream.markdown(`- **${r.requirementId}** : ${r.previousStatus} -> ${r.status}\n`);
    }
    stream.markdown('\n');
  }

  if (diff.regressions.length > 0) {
    stream.markdown(`### Régressions (${diff.regressions.length})\n\n`);
    for (const r of diff.regressions) {
      stream.markdown(`- **${r.requirementId}** : ${r.previousStatus} -> ${r.status}\n`);
    }
    stream.markdown('\n');
  }

  if (diff.stillMissing.length > 0) {
    stream.markdown(`### Toujours manquantes (${diff.stillMissing.length})\n\n`);
    for (const r of diff.stillMissing.slice(0, 10)) {
      const truncText = r.requirementText.length > 60 ? r.requirementText.substring(0, 60) + '...' : r.requirementText;
      stream.markdown(`- **${r.requirementId}** : ${truncText}\n`);
    }
    if (diff.stillMissing.length > 10) {
      stream.markdown(`\n*... et ${diff.stillMissing.length - 10} autres*\n`);
    }
    stream.markdown('\n');
  }

  return { metadata: { command: 'history' } };
}
