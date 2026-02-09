import * as vscode from 'vscode';

const SOURCE_EXTENSIONS = '**/*.{ts,js,tsx,jsx,py,java,cs,go,rs,cpp,c,h,hpp,vue,svelte,html,css,scss,json,yaml,yml,xml,sql,sh,bat,ps1}';

/**
 * Language model tool that searches file CONTENTS in the workspace.
 * Uses findFiles + readFile + regex since findTextInFiles is a proposed API.
 */
export class CodeSearchTool implements vscode.LanguageModelTool<{ query: string; maxResults?: number }> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ query: string; maxResults?: number }>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const input = options?.input || {};
      const query = input.query || '';
      const maxResults = input.maxResults || 15;

      if (!query) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify({
            error: 'Query parameter is required',
            results: [],
          }))
        ]);
      }
      
      console.log(`[Code Search Tool] Searching content for: "${query}"`);
      const results: Array<{
        file: string;
        line: number;
        preview: string;
      }> = [];

      // Get all source files in workspace
      const files = await vscode.workspace.findFiles(
        SOURCE_EXTENSIONS,
        '**/node_modules/**',
        500 // scan up to 500 files
      );

      if (token.isCancellationRequested) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify({ query, results: [], count: 0, cancelled: true }))
        ]);
      }

      // Escape special regex characters for a literal search, but allow simple patterns
      let searchRegex: RegExp;
      try {
        searchRegex = new RegExp(query, 'gi');
      } catch {
        // If user query is not valid regex, escape it
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(escaped, 'gi');
      }

      // Search through each file's content
      for (const fileUri of files) {
        if (token.isCancellationRequested || results.length >= maxResults) {
          break;
        }

        try {
          const contentBytes = await vscode.workspace.fs.readFile(fileUri);
          const content = Buffer.from(contentBytes).toString('utf-8');

          // Skip very large files (> 500KB) and binary-looking files
          if (content.length > 500_000 || content.includes('\0')) {
            continue;
          }

          const lines = content.split('\n');
          const relativePath = vscode.workspace.asRelativePath(fileUri);

          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (searchRegex.test(lines[i])) {
              results.push({
                file: relativePath,
                line: i + 1,
                preview: lines[i].trim().substring(0, 200),
              });
            }
            // Reset lastIndex for global regex
            searchRegex.lastIndex = 0;
          }
        } catch {
          // Skip files we can't read
        }
      }

      console.log(`[Code Search Tool] Found ${results.length} matches for "${query}" across ${files.length} files`);

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          query,
          results,
          count: results.length,
        }, null, 2))
      ]);
    } catch (error) {
      console.error('[Code Search Tool] Error:', error);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          error: String(error),
          results: [],
        }))
      ]);
    }
  }
}
