import * as fs from 'fs/promises';
import * as path from 'path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { ComparisonRecord, ParsedSpec, ComparisonStatus } from '../types.js';

const STATUS_LABELS: Record<ComparisonStatus, string> = {
  'implemented': 'Implemented',
  'partially-implemented': 'Partial',
  'not-implemented': 'Not Implemented',
  'divergent': 'Divergent',
};

const STATUS_COLORS: Record<ComparisonStatus, string> = {
  'implemented': '4caf50',
  'partially-implemented': 'ff9800',
  'not-implemented': 'f44336',
  'divergent': '9c27b0',
};

function cellBorders() {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' };
  return { top: border, bottom: border, left: border, right: border };
}

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font: 'Arial', color: 'ffffff' })] })],
    shading: { fill: '37474f' },
    borders: cellBorders(),
    width: { size: 0, type: WidthType.AUTO },
  });
}

function textCell(text: string, color?: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: 'Arial', color })] })],
    borders: cellBorders(),
    width: { size: 0, type: WidthType.AUTO },
  });
}

export async function exportComplianceReport(
  comparison: ComparisonRecord,
  spec: ParsedSpec,
  outputDir: string,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const s = comparison.summary;
  const implPct = s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0;

  const children: Paragraph[] = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: `Compliance Report`, bold: true, size: 48, font: 'Arial' })],
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: spec.title, bold: true, size: 32, font: 'Arial', color: '37474f' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({
      text: `Version ${spec.version} — ${new Date(comparison.timestamp).toLocaleDateString('en-US')}`,
      italics: true, size: 22, font: 'Arial', color: '666666',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));

  if (comparison.gitCommitHash) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `Commit: ${comparison.gitCommitHash}`, size: 20, font: 'Arial', color: '999999' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));
  }

  // Summary heading
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Summary', bold: true, size: 32, font: 'Arial' })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: `Overall compliance: ${implPct}%`, bold: true, size: 28, font: 'Arial' })],
    spacing: { after: 200 },
  }));

  // Summary table
  const summaryRows = [
    new TableRow({
      children: [headerCell('Status'), headerCell('Count'), headerCell('Percentage')],
    }),
    new TableRow({
      children: [
        textCell('Implemented', '4caf50'),
        textCell(String(s.implemented)),
        textCell(`${s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0}%`),
      ],
    }),
    new TableRow({
      children: [
        textCell('Partial', 'ff9800'),
        textCell(String(s.partial)),
        textCell(`${s.total > 0 ? Math.round((s.partial / s.total) * 100) : 0}%`),
      ],
    }),
    new TableRow({
      children: [
        textCell('Not Implemented', 'f44336'),
        textCell(String(s.notImplemented)),
        textCell(`${s.total > 0 ? Math.round((s.notImplemented / s.total) * 100) : 0}%`),
      ],
    }),
    new TableRow({
      children: [
        textCell('Divergent', '9c27b0'),
        textCell(String(s.divergent)),
        textCell(`${s.total > 0 ? Math.round((s.divergent / s.total) * 100) : 0}%`),
      ],
    }),
  ];

  const summaryTable = new Table({ rows: summaryRows, width: { size: 100, type: WidthType.PERCENTAGE } });

  // Details heading
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Detail by Requirement', bold: true, size: 32, font: 'Arial' })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
  }));

  // Details table
  const detailHeaderRow = new TableRow({
    children: [
      headerCell('ID'),
      headerCell('Requirement'),
      headerCell('Status'),
      headerCell('Confidence'),
      headerCell('Files'),
    ],
  });

  const detailRows = [detailHeaderRow];
  for (const detail of comparison.details) {
    const truncText = detail.requirementText.length > 80
      ? detail.requirementText.substring(0, 80) + '...'
      : detail.requirementText;
    const files = detail.matchedFiles.slice(0, 2).map(f => f.filePath).join(', ') || '-';
    const color = STATUS_COLORS[detail.status] || '000000';

    detailRows.push(new TableRow({
      children: [
        textCell(detail.requirementId),
        textCell(truncText),
        textCell(STATUS_LABELS[detail.status] || detail.status, color),
        textCell(`${detail.confidence}%`),
        textCell(files),
      ],
    }));
  }

  const detailTable = new Table({ rows: detailRows, width: { size: 100, type: WidthType.PERCENTAGE } });

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 } },
      },
      children: [
        ...children,
        summaryTable,
        new Paragraph({ spacing: { before: 400 } }),
        detailTable,
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = `compliance-report-${spec.title.replace(/\s+/g, '-').toLowerCase()}.docx`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, buffer);

  return filePath;
}

export function buildComplianceMarkdown(comparison: ComparisonRecord, spec: ParsedSpec): string {
  const s = comparison.summary;
  const implPct = s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0;
  const lines: string[] = [];

  lines.push(`# Compliance Report - ${spec.title}`);
  lines.push(`> Version ${spec.version} — ${new Date(comparison.timestamp).toLocaleDateString('en-US')}`);
  if (comparison.gitCommitHash) {
    lines.push(`> Commit: \`${comparison.gitCommitHash}\``);
  }
  lines.push('');
  lines.push(`## Summary — ${implPct}% compliant`);
  lines.push('');
  lines.push('| Status | Count | % |');
  lines.push('|---|---|---|');
  lines.push(`| Implemented | ${s.implemented} | ${s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0}% |`);
  lines.push(`| Partial | ${s.partial} | ${s.total > 0 ? Math.round((s.partial / s.total) * 100) : 0}% |`);
  lines.push(`| Not Implemented | ${s.notImplemented} | ${s.total > 0 ? Math.round((s.notImplemented / s.total) * 100) : 0}% |`);
  lines.push(`| Divergent | ${s.divergent} | ${s.total > 0 ? Math.round((s.divergent / s.total) * 100) : 0}% |`);
  lines.push('');
  lines.push('## Detail by Requirement');
  lines.push('');
  lines.push('| ID | Requirement | Status | Confidence | Files |');
  lines.push('|---|---|---|---|---|');

  for (const detail of comparison.details) {
    const truncText = detail.requirementText.length > 60
      ? detail.requirementText.substring(0, 60) + '...'
      : detail.requirementText;
    const files = detail.matchedFiles.slice(0, 2).map(f => `\`${f.filePath}\``).join(', ') || '-';
    lines.push(`| ${detail.requirementId} | ${truncText} | ${STATUS_LABELS[detail.status]} | ${detail.confidence}% | ${files} |`);
  }

  return lines.join('\n');
}
