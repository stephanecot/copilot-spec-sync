import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Language model tool that reads the content of a file in the workspace.
 * The LLM can use this to examine specific code files.
 */
export class ReadFileTool implements vscode.LanguageModelTool<{ filePath: string; maxChars?: number }> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ filePath: string; maxChars?: number }>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const input = options?.input || {};
      const filePath = input.filePath || '';
      const maxChars = input.maxChars || 6000;

      if (!filePath) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify({
            error: 'filePath parameter is required',
            content: '',
          }))
        ]);
      }
      
      console.log(`[Read File Tool] Reading: ${filePath}`);
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
      }

      // Try to find the file in any workspace folder
      let fileUri: vscode.Uri | undefined;
      for (const folder of workspaceFolders) {
        const candidateUri = vscode.Uri.joinPath(folder.uri, filePath);
        try {
          await vscode.workspace.fs.stat(candidateUri);
          fileUri = candidateUri;
          break;
        } catch {
          // File not in this folder, try next
        }
      }

      if (!fileUri) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify({
            error: `File not found: ${filePath}`,
            content: '',
          }))
        ]);
      }

      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      let content = Buffer.from(fileContent).toString('utf-8');

      if (content.length > maxChars) {
        content = content.substring(0, maxChars) + '\n\n// ... [truncated due to length]';
      }

      const ext = path.extname(filePath);
      console.log(`[Read File Tool] Read ${content.length} chars from ${filePath}`);

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          filePath,
          content,
          size: content.length,
          extension: ext,
        }, null, 2))
      ]);
    } catch (error) {
      console.error(`[Read File Tool] Error reading ${filePath}:`, error);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          error: String(error),
          content: '',
        }))
      ]);
    }
  }
}
