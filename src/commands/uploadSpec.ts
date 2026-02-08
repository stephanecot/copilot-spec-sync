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
    stream.markdown('**Erreur** : Aucun workspace ouvert. Ouvrez un dossier pour utiliser cette fonctionnalité.');
    return {};
  }

  stream.progress('Sélection du fichier Word...');

  const fileUris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { 'Word Documents': ['docx'] },
    title: 'Sélectionner une spécification Word',
  });

  if (!fileUris || fileUris.length === 0) {
    stream.markdown('Aucun fichier sélectionné.');
    return {};
  }

  const filePath = fileUris[0].fsPath;
  stream.progress('Lecture du fichier Word...');

  try {
    const docxContent = await readDocx(filePath);

    if (docxContent.messages.length > 0) {
      stream.markdown(`> **Avertissements mammoth** : ${docxContent.messages.slice(0, 3).join(', ')}\n\n`);
    }

    stream.progress('Analyse et extraction des exigences...');

    const specId = generateId();
    const spec = parseSpec(docxContent, specId);

    stream.progress('Sauvegarde de la spécification...');
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

    stream.markdown(`## Spécification uploadée\n\n`);
    stream.markdown(`| Propriété | Valeur |\n|---|---|\n`);
    stream.markdown(`| **Titre** | ${spec.title} |\n`);
    stream.markdown(`| **Version** | ${spec.version} |\n`);
    stream.markdown(`| **Sections** | ${totalSections} |\n`);
    stream.markdown(`| **Exigences détectées** | ${totalRequirements} |\n`);
    stream.markdown(`| **ID** | ${spec.id} |\n\n`);

    if (totalRequirements === 0) {
      stream.markdown(`> **Note** : Aucune exigence détectée automatiquement. Le document ne contient peut-être pas de mots-clés d'exigences (doit, devra, shall, must...). La comparaison pourra quand même être effectuée manuellement.\n\n`);
    }

    // Show first few requirements as preview
    const allReqs = flattenRequirements(spec.sections);
    if (allReqs.length > 0) {
      stream.markdown(`### Aperçu des exigences\n\n`);
      stream.markdown(`| ID | Type | Priorité | Texte |\n|---|---|---|---|\n`);
      for (const req of allReqs.slice(0, 10)) {
        const truncText = req.text.length > 80 ? req.text.substring(0, 80) + '...' : req.text;
        stream.markdown(`| ${req.id} | ${req.type} | ${req.priority} | ${truncText} |\n`);
      }
      if (allReqs.length > 10) {
        stream.markdown(`\n*... et ${allReqs.length - 10} autres exigences*\n\n`);
      }
    }

    stream.button({
      command: 'specSync.compare',
      title: 'Comparer avec le code',
    });

    return { metadata: { command: 'upload' } };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stream.markdown(`**Erreur lors de l'upload** : ${msg}\n\nAssurez-vous que le fichier est un document Word (.docx) valide.`);
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
