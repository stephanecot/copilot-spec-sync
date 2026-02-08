import * as vscode from 'vscode';
import { analyzeProject } from '../doc-generator/projectAnalyzer.js';
import { AnalyzeProjectInput } from '../types.js';

export class AnalyzeProjectTool implements vscode.LanguageModelTool<AnalyzeProjectInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AnalyzeProjectInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const analysis = await analyzeProject(options.input.path);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          projectType: analysis.projectInfo.type,
          language: analysis.projectInfo.language,
          fileCount: analysis.fileTree.length,
          frameworks: analysis.frameworks,
          patterns: analysis.patterns,
          modules: analysis.moduleStructure.map(m => ({ name: m.name, type: m.type, files: m.files.length })),
          keyFiles: analysis.keyFiles,
          entryPoints: analysis.projectInfo.entryPoints,
        }, null, 2)),
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error analyzing project: ${msg}`),
      ]);
    }
  }
}
