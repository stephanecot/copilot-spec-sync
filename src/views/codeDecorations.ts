import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { ComparisonStatus, RequirementComparison } from '../types.js';

export class SpecDecorationProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private implementedDecoration: vscode.TextEditorDecorationType;
  private partialDecoration: vscode.TextEditorDecorationType;
  private divergentDecoration: vscode.TextEditorDecorationType;

  constructor(private storage: StorageManager) {
    this.implementedDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: undefined,
      overviewRulerColor: '#4caf50',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      light: { borderColor: '#4caf5040' },
      dark: { borderColor: '#4caf5040' },
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
    });

    this.partialDecoration = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: '#ff9800',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      light: { borderColor: '#ff980040' },
      dark: { borderColor: '#ff980040' },
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
    });

    this.divergentDecoration = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: '#f44336',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      light: { borderColor: '#f4433640' },
      dark: { borderColor: '#f4433640' },
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
    });

    // Listen for editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) { this.updateDecorations(editor); }
      }),
    );

    // Initial decoration
    const editor = vscode.window.activeTextEditor;
    if (editor) { this.updateDecorations(editor); }
  }

  async updateDecorations(editor: vscode.TextEditor): Promise<void> {
    const enabled = vscode.workspace.getConfiguration('specSync.ui').get<boolean>('showCodeDecorations', true);
    if (!enabled) {
      editor.setDecorations(this.implementedDecoration, []);
      editor.setDecorations(this.partialDecoration, []);
      editor.setDecorations(this.divergentDecoration, []);
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const comparison = await this.storage.getLatestComparisonForAnySpec();
    if (!comparison) { return; }

    const implementedRanges: vscode.DecorationOptions[] = [];
    const partialRanges: vscode.DecorationOptions[] = [];
    const divergentRanges: vscode.DecorationOptions[] = [];

    for (const detail of comparison.details) {
      for (const match of detail.matchedFiles) {
        // Normalize paths for comparison
        if (filePath.endsWith(match.filePath) || match.filePath.endsWith(filePath.split('/').slice(-2).join('/'))) {
          const line = Math.max(0, (match.line || 1) - 1);
          if (line < editor.document.lineCount) {
            const range = editor.document.lineAt(line).range;
            const decoration: vscode.DecorationOptions = {
              range,
              hoverMessage: new vscode.MarkdownString(`**${detail.requirementId}**: ${detail.requirementText}\n\nStatut: ${detail.status} (${detail.confidence}%)`),
            };

            switch (detail.status) {
              case 'implemented':
                implementedRanges.push(decoration);
                break;
              case 'partially-implemented':
                partialRanges.push(decoration);
                break;
              case 'divergent':
                divergentRanges.push(decoration);
                break;
            }
          }
        }
      }
    }

    editor.setDecorations(this.implementedDecoration, implementedRanges);
    editor.setDecorations(this.partialDecoration, partialRanges);
    editor.setDecorations(this.divergentDecoration, divergentRanges);
  }

  dispose(): void {
    this.implementedDecoration.dispose();
    this.partialDecoration.dispose();
    this.divergentDecoration.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
