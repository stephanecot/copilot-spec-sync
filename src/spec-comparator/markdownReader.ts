import * as fs from 'fs/promises';
import { DocxContent } from '../types.js';

/**
 * Reads a Markdown file and converts it to DocxContent
 * so it can be processed by the same parseSpec pipeline as DOCX files.
 */
export async function readMarkdown(filePath: string): Promise<DocxContent> {
  const text = await fs.readFile(filePath, 'utf-8');
  const html = markdownToHtml(text);
  return { html, text, messages: [] };
}

/**
 * Minimal markdown-to-HTML conversion covering the structures
 * that specParser relies on: headings, lists, and paragraphs.
 */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const htmlParts: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headings: # … ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${escapeHtml(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Unordered list items: - or *
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (ulMatch) {
      if (!inList) { htmlParts.push('<ul>'); inList = true; }
      htmlParts.push(`<li>${escapeHtml(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list items: 1.
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList) { htmlParts.push('<ul>'); inList = true; }
      htmlParts.push(`<li>${escapeHtml(olMatch[1])}</li>`);
      continue;
    }

    // Close list if no longer in list items
    if (inList) { htmlParts.push('</ul>'); inList = false; }

    // Blank line → skip
    if (line.trim() === '') {
      continue;
    }

    // Regular paragraph
    htmlParts.push(`<p>${escapeHtml(line)}</p>`);
  }

  if (inList) { htmlParts.push('</ul>'); }
  return htmlParts.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
