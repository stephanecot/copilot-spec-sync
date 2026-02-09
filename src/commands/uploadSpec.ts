import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { readDocx } from '../spec-comparator/docxReader.js';
import { parseSpec } from '../spec-comparator/specParser.js';
import { generateId } from '../utils/fileUtils.js';

export async function handleSpecUpload(
  _request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  _context: vscode.ExtensionContext,
  storage?: StorageManager,
): Promise<vscode.ChatResult> {
  if (!storage) {
    stream.markdown('**Error**: No workspace open. Open a folder to use this feature.');
    return {};
  }

  stream.progress('Selecting Word file...');

  const fileUris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { 'Word Documents': ['docx'] },
    title: 'Select a Word specification',
  });

  if (!fileUris || fileUris.length === 0) {
    stream.markdown('No file selected.');
    return {};
  }

  const filePath = fileUris[0].fsPath;
  stream.progress('Reading Word file...');

  try {
    const docxContent = await readDocx(filePath);

    if (docxContent.messages.length > 0) {
      stream.markdown(`> **Mammoth warnings**: ${docxContent.messages.slice(0, 3).join(', ')}\n\n`);
    }

    stream.progress('Parsing and extracting requirements...');

    const specId = generateId();
    const spec = parseSpec(docxContent, specId);

    stream.progress('Saving specification...');
    await storage.saveSpec(spec, filePath);

    // Count requirements across all sections
    let totalRequirements = 0;
    const countSections = (sections: typeof spec.sections): number => {
      let count = 0;
      for (const sec of sections) {
        count++;
        totalRequirements += sec.requirements.length;
        count += countSections(sec.subsections);
      }
      return count;
    };
    const totalSections = countSections(spec.sections);

    stream.markdown(`## Specification Uploaded\n\n`);
    stream.markdown(`| Property | Value |\n|---|---|\n`);
    stream.markdown(`| **Title** | ${spec.title} |\n`);
    stream.markdown(`| **Version** | ${spec.version} |\n`);
    stream.markdown(`| **Sections** | ${totalSections} |\n`);
    stream.markdown(`| **Requirements Detected** | ${totalRequirements} |\n`);
    stream.markdown(`| **ID** | ${spec.id} |\n\n`);

    if (totalRequirements === 0) {
      stream.markdown(`> **Note**: No requirements detected automatically. The document may not contain requirement keywords (must, shall, should...). Comparison can still be performed manually.\n\n`);
    }

    // Show first few requirements as preview
    const allReqs = flattenRequirements(spec.sections);
    if (allReqs.length > 0) {
      stream.markdown(`### Requirements Preview\n\n`);
      stream.markdown(`| ID | Type | Priority | Text |\n|---|---|---|---|\n`);
      for (const req of allReqs.slice(0, 10)) {
        const truncText = req.text.length > 80 ? req.text.substring(0, 80) + '...' : req.text;
        stream.markdown(`| ${req.id} | ${req.type} | ${req.priority} | ${truncText} |\n`);
      }
      if (allReqs.length > 10) {
        stream.markdown(`\n*... and ${allReqs.length - 10} more requirements*\n\n`);
      }
    }

    stream.button({
      command: 'specSync.compare',
      title: 'Compare with code',
    });

    return { metadata: { command: 'upload' } };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stream.markdown(`**Error uploading**: ${msg}\n\nMake sure the file is a valid Word (.docx) document.`);
    return {};
  }
}

function flattenRequirements(sections: { requirements: { id: string; text: string; type: string; priority: string }[]; subsections: typeof sections }[]): { id: string; text: string; type: string; priority: string }[] {
  const reqs: { id: string; text: string; type: string; priority: string }[] = [];
  for (const section of sections) {
    reqs.push(...section.requirements);
    reqs.push(...flattenRequirements(section.subsections));
  }
  return reqs;
}
