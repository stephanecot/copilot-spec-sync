import * as fs from 'fs/promises';
import * as path from 'path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { GeneratedDocumentation } from '../types.js';

export function buildMarkdownString(documentation: GeneratedDocumentation): string {
  const lines: string[] = [];
  lines.push(`# Documentation - ${documentation.projectInfo.name}\n`);
  lines.push(`> Généré le ${new Date(documentation.generatedAt).toLocaleDateString('fr-FR')}`);
  lines.push(`> Type : ${documentation.projectInfo.type} | Langage : ${documentation.projectInfo.language}\n`);

  for (const section of documentation.sections) {
    lines.push(`## ${section.title}\n`);
    lines.push(section.content);
    lines.push('');
  }

  return lines.join('\n');
}

export async function exportAsMarkdown(documentation: GeneratedDocumentation, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const content = buildMarkdownString(documentation);
  const fileName = `documentation-${documentation.projectInfo.name}.md`;
  const filePath = path.join(outputDir, fileName);

  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function exportAsDocx(documentation: GeneratedDocumentation, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Documentation - ${documentation.projectInfo.name}`, bold: true, size: 48, font: 'Arial' })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  );

  // Metadata
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Généré le : ${new Date(documentation.generatedAt).toLocaleDateString('fr-FR')}`, italics: true, size: 20, font: 'Arial', color: '666666' }),
      ],
      spacing: { after: 100 },
    }),
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Type de projet : ${documentation.projectInfo.type} | Langage : ${documentation.projectInfo.language}`, italics: true, size: 20, font: 'Arial', color: '666666' }),
      ],
      spacing: { after: 400 },
    }),
  );

  // Sections
  for (const section of documentation.sections) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: section.title, bold: true, size: 32, font: 'Arial' })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
    );

    // Split content into paragraphs
    const contentParagraphs = section.content.split('\n');
    for (const para of contentParagraphs) {
      const trimmed = para.trim();
      if (trimmed === '') { continue; }

      if (trimmed.startsWith('### ')) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed.replace(/^### /, ''), bold: true, size: 24, font: 'Arial' })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          }),
        );
      } else if (trimmed.startsWith('## ')) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed.replace(/^## /, ''), bold: true, size: 28, font: 'Arial' })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          }),
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `  ${trimmed}`, size: 22, font: 'Arial' })],
            spacing: { after: 50 },
          }),
        );
      } else if (trimmed.startsWith('```')) {
        // Code block marker - skip formatting markers
        continue;
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed, size: 22, font: 'Arial' })],
            spacing: { after: 100 },
          }),
        );
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = `documentation-${documentation.projectInfo.name}.docx`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, buffer);

  return filePath;
}
