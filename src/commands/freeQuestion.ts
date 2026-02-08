import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';

export async function handleFreeQuestion(
  request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  _context: vscode.ExtensionContext,
  storage?: StorageManager,
): Promise<vscode.ChatResult> {
  // Build context from latest comparison
  let contextInfo = '';
  if (storage) {
    const comparison = await storage.getLatestComparisonForAnySpec();
    if (comparison) {
      const s = comparison.summary;
      contextInfo = `\n\nContexte : La dernière comparaison montre ${s.implemented}/${s.total} exigences implémentées, ${s.partial} partielles, ${s.notImplemented} manquantes, ${s.divergent} divergentes.`;
    }
  }

  const prompt = `Tu es un assistant spécialisé dans la gestion de spécifications et la documentation de code. Tu aides les développeurs à comprendre l'écart entre leurs spécifications et leur code source.

Commandes disponibles :
- /doc : Générer la documentation du projet
- /upload : Uploader une spécification Word
- /compare : Comparer le code avec la spécification
- /gaps : Voir les écarts
- /implement REQ-XXX : Proposer une implémentation
- /history : Voir l'historique
- /status : Résumé rapide${contextInfo}

Question de l'utilisateur : ${request.prompt}`;

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];

  try {
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }
  } catch {
    stream.markdown(`Pour utiliser Copilot Spec Sync, essayez une des commandes disponibles :\n\n`);
    stream.markdown(`- \`/doc\` - Générer la documentation\n`);
    stream.markdown(`- \`/upload\` - Uploader une spécification\n`);
    stream.markdown(`- \`/compare\` - Comparer code vs spec\n`);
    stream.markdown(`- \`/gaps\` - Voir les écarts\n`);
    stream.markdown(`- \`/status\` - Résumé de conformité\n`);
  }

  return {};
}
