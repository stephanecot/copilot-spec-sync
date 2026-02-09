import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';

export async function handleStatus(
  _request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  _context: vscode.ExtensionContext,
  storage?: StorageManager,
): Promise<vscode.ChatResult> {
  if (!storage) {
    stream.markdown('**Error**: No workspace open.');
    return {};
  }

  const specs = await storage.listSpecs();
  if (specs.length === 0) {
    stream.markdown('No specifications. Use `@specsync /upload` to get started.');
    return {};
  }

  stream.markdown(`## Compliance Status\n\n`);

  for (const spec of specs) {
    const comparison = await storage.getLatestComparison(spec.id);
    if (!comparison) {
      stream.markdown(`### ${spec.title} v${spec.version}\n`);
      stream.markdown(`No comparison performed.\n\n`);
      continue;
    }

    const s = comparison.summary;
    const pct = s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0;

    stream.markdown(`### ${spec.title} v${spec.version}\n\n`);
    stream.markdown(`**Compliance: ${pct}%** (${s.implemented}/${s.total} requirements implemented)\n\n`);
    stream.markdown(`| Impl. | Partial | Missing | Divergent |\n|---|---|---|---|\n`);
    stream.markdown(`| ${s.implemented} | ${s.partial} | ${s.notImplemented} | ${s.divergent} |\n\n`);

    if (comparison.gitCommitHash) {
      stream.markdown(`Last analysis: ${new Date(comparison.timestamp).toLocaleDateString('en-US')} (commit \`${comparison.gitCommitHash}\`)\n\n`);
    }
  }

  return { metadata: { command: 'status' } };
}
