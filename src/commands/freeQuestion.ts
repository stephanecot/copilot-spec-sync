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
      contextInfo = `\n\nContext: The latest comparison shows ${s.implemented}/${s.total} requirements implemented, ${s.partial} partial, ${s.notImplemented} missing, ${s.divergent} divergent.`;
    }
  }

  const prompt = `You are an assistant specialized in specification management and code documentation. You help developers understand the gap between their specifications and source code.

Available commands:
- /doc : Generate project documentation
- /upload : Upload a Word specification
- /compare : Compare code with the specification
- /gaps : View gaps
- /implement REQ-XXX : Propose an implementation
- /history : View history
- /status : Quick summary${contextInfo}

User question: ${request.prompt}`;

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];

  try {
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }
  } catch {
    stream.markdown(`To use Copilot Spec Sync, try one of the available commands:\n\n`);
    stream.markdown(`- \`/doc\` - Generate documentation\n`);
    stream.markdown(`- \`/upload\` - Upload a specification\n`);
    stream.markdown(`- \`/compare\` - Compare code vs spec\n`);
    stream.markdown(`- \`/gaps\` - View gaps\n`);
    stream.markdown(`- \`/status\` - Compliance summary\n`);
  }

  return {};
}
