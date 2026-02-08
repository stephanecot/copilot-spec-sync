import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { findRelevantCode } from '../spec-comparator/codeMapper.js';
import { getWorkspaceProjects } from '../utils/fileUtils.js';
import { CompareRequirementInput, Requirement } from '../types.js';

export class CompareRequirementTool implements vscode.LanguageModelTool<CompareRequirementInput> {
  constructor(private storage?: StorageManager) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CompareRequirementInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const requirement: Requirement = {
        id: 'TOOL-REQ',
        text: options.input.requirementText,
        type: 'functional',
        priority: 'should',
        sectionId: 'tool',
      };

      const projects = await getWorkspaceProjects();
      const candidates = await findRelevantCode(requirement, projects, 5);

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          requirementText: options.input.requirementText,
          candidateFiles: candidates.map(c => ({
            path: c.relativePath,
            relevanceScore: c.relevanceScore,
            reason: c.reason,
            contentPreview: c.content.substring(0, 500),
          })),
        }, null, 2)),
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error: ${msg}`),
      ]);
    }
  }
}
