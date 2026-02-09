import * as vscode from 'vscode';

/**
 * Language model tool that searches the workspace for files matching a query.
 * The LLM can use this to discover relevant code files dynamically.
 */
export class WorkspaceSearchTool implements vscode.LanguageModelTool<{ query: string; maxResults?: number }> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ query: string; maxResults?: number }>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const input = options?.input || {};
      const query = input.query || '';
      const maxResults = input.maxResults || 20;
      
      if (!query) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify({
            error: 'Query parameter is required',
            results: [],
          }))
        ]);
      }

      console.log(`[Workspace Search Tool] Searching for: "${query}"`);

      // Use VS Code's native workspace search
      const files = await vscode.workspace.findFiles(
        `**/*${query}*`,
        '**/node_modules/**',
        maxResults
      );

      const results = files.map(uri => vscode.workspace.asRelativePath(uri));
      
      console.log(`[Workspace Search Tool] Found ${results.length} files matching "${query}"`);

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          query,
          results,
          count: results.length,
        }, null, 2))
      ]);
    } catch (error) {
      console.error('[Workspace Search Tool] Error:', error);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          error: String(error),
          results: [],
        }))
      ]);
    }
  }
}
