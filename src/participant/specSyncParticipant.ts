import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { handleDocGeneration } from '../commands/generateDoc.js';
import { handleSpecUpload } from '../commands/uploadSpec.js';
import { handleComparison } from '../commands/compareSpec.js';
import { handleGapReport } from '../commands/gapReport.js';
import { handleImplementation } from '../commands/implementReq.js';
import { handleHistory } from '../commands/historyCmd.js';
import { handleStatus } from '../commands/statusCmd.js';
import { handleFreeQuestion } from '../commands/freeQuestion.js';

const PARTICIPANT_ID = 'copilot-spec-sync.specsync';

export function createSpecSyncParticipant(
  context: vscode.ExtensionContext,
  storage?: StorageManager,
): vscode.Disposable {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> => {
    try {
      switch (request.command) {
        case 'doc':
          return await handleDocGeneration(request, chatContext, stream, token, context, storage);
        case 'upload':
          return await handleSpecUpload(request, chatContext, stream, token, context, storage);
        case 'compare':
          return await handleComparison(request, chatContext, stream, token, context, storage);
        case 'gaps':
          return await handleGapReport(request, chatContext, stream, token, context, storage);
        case 'implement':
          return await handleImplementation(request, chatContext, stream, token, context, storage);
        case 'history':
          return await handleHistory(request, chatContext, stream, token, context, storage);
        case 'status':
          return await handleStatus(request, chatContext, stream, token, context, storage);
        default:
          return await handleFreeQuestion(request, chatContext, stream, token, context, storage);
      }
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        stream.markdown(`**LLM Error**: ${error.message}\n\nCode: ${error.code}`);
      } else {
        const msg = error instanceof Error ? error.message : String(error);
        stream.markdown(`**Error**: ${msg}`);
      }
      return {};
    }
  };

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg');

  participant.followupProvider = {
    provideFollowups(result, _context, _token) {
      const metadata = result.metadata as Record<string, string> | undefined;
      const followups: vscode.ChatFollowup[] = [];

      if (metadata?.command === 'doc') {
        followups.push({ prompt: '@specsync /doc export md', label: 'Export as Markdown' });
        followups.push({ prompt: '@specsync /doc export docx', label: 'Export as Word' });
      }
      if (metadata?.command === 'compare') {
        followups.push({ prompt: '@specsync /gaps', label: 'View gaps' });
        followups.push({ prompt: '@specsync /history', label: 'View history' });
      }
      if (metadata?.command === 'upload') {
        followups.push({ prompt: '@specsync /compare', label: 'Compare with code' });
      }

      return followups;
    },
  };

  return participant;
}
