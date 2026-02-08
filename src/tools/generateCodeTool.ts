import * as vscode from 'vscode';
import { GenerateCodeInput } from '../types.js';

export class GenerateCodeTool implements vscode.LanguageModelTool<GenerateCodeInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GenerateCodeInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({
        message: `Pour implémenter ${options.input.requirementId}, utilisez la commande @specsync /implement ${options.input.requirementId}`,
        requirementId: options.input.requirementId,
        requirementText: options.input.requirementText,
      })),
    ]);
  }
}
