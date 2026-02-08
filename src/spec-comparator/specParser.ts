import { DocxContent, ParsedSpec, SpecSection, Requirement, RequirementType, MoSCoWPriority } from '../types.js';
import { generateId } from '../utils/fileUtils.js';

let globalReqIndex = 0;

export function parseSpec(content: DocxContent, specId: string): ParsedSpec {
  globalReqIndex = 0;

  const html = content.html;
  const title = extractTitle(html) || 'Spécification sans titre';
  const version = extractVersion(html, content.text) || '1.0';
  const sections = parseSections(html);

  let requirementCount = 0;
  const countReqs = (secs: SpecSection[]): void => {
    for (const sec of secs) {
      requirementCount += sec.requirements.length;
      countReqs(sec.subsections);
    }
  };
  countReqs(sections);

  return {
    id: specId,
    title,
    version,
    uploadedAt: new Date().toISOString(),
    filePath: '',
    sections,
    requirementCount,
  };
}

function extractTitle(html: string): string | undefined {
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match) {
    return stripHtml(h1Match[1]).trim();
  }
  const firstParagraph = html.match(/<p[^>]*>(.*?)<\/p>/i);
  if (firstParagraph) {
    const text = stripHtml(firstParagraph[1]).trim();
    if (text.length > 0 && text.length < 200) {
      return text;
    }
  }
  return undefined;
}

function extractVersion(html: string, text: string): string | undefined {
  const versionPatterns = [
    /version\s*[:\s]*(\d+\.\d+(?:\.\d+)?)/i,
    /v(\d+\.\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of versionPatterns) {
    const match = text.match(pattern) || html.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function parseSections(html: string): SpecSection[] {
  // Split HTML into chunks based on heading tags
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  const chunks: { level: number; title: string; startIndex: number }[] = [];

  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    chunks.push({
      level: parseInt(match[1]),
      title: stripHtml(match[2]).trim(),
      startIndex: match.index + match[0].length,
    });
  }

  if (chunks.length === 0) {
    // No headings found, treat entire content as one section
    const reqs = extractRequirements(html, 'root');
    return [{
      id: generateId(),
      title: 'Contenu',
      level: 1,
      content: stripHtml(html),
      requirements: reqs,
      subsections: [],
    }];
  }

  // Extract content between headings
  const sectionsWithContent = chunks.map((chunk, i) => {
    const nextIndex = i + 1 < chunks.length
      ? html.lastIndexOf(`<h${chunks[i + 1].level}`, chunks[i + 1].startIndex)
      : html.length;
    const content = html.substring(chunk.startIndex, nextIndex);
    return { ...chunk, content };
  });

  // Build hierarchical tree
  return buildSectionTree(sectionsWithContent, 0, sectionsWithContent.length, 1);
}

function buildSectionTree(
  flatSections: { level: number; title: string; content: string }[],
  start: number,
  end: number,
  expectedLevel: number,
): SpecSection[] {
  const sections: SpecSection[] = [];

  let i = start;
  while (i < end) {
    const section = flatSections[i];
    if (section.level < expectedLevel) {
      break;
    }

    const sectionId = generateId();
    const requirements = extractRequirements(section.content, sectionId);

    // Find subsections
    let j = i + 1;
    while (j < end && flatSections[j].level > section.level) {
      j++;
    }

    const subsections = buildSectionTree(flatSections, i + 1, j, section.level + 1);

    sections.push({
      id: sectionId,
      title: section.title,
      level: section.level,
      content: stripHtml(section.content).trim(),
      requirements,
      subsections,
    });

    i = j;
  }

  return sections;
}

export function extractRequirements(htmlContent: string, sectionId: string): Requirement[] {
  const requirements: Requirement[] = [];
  const text = stripHtml(htmlContent);

  // Split into sentences/blocks
  const sentences = text.split(/[.!?;\n]+/).map(s => s.trim()).filter(s => s.length > 15);

  const requirementKeywords = [
    // French
    /\bdoit\b/i, /\bdevra\b/i, /\bdevront\b/i, /\bil faut\b/i,
    /\bobligatoire\b/i, /\bnécessaire\b/i, /\brequis\b/i,
    /\bpermettre\s+de\b/i, /\bpouvoir\b/i,
    // English
    /\bshall\b/i, /\bmust\b/i, /\brequired\b/i, /\bshould\b/i,
    /\bthe system\b/i, /\bthe application\b/i,
  ];

  for (const sentence of sentences) {
    const isRequirement = requirementKeywords.some(kw => kw.test(sentence));
    if (isRequirement) {
      globalReqIndex++;
      const { type, priority } = classifyRequirement(sentence);
      requirements.push({
        id: `REQ-${String(globalReqIndex).padStart(3, '0')}`,
        text: sentence.substring(0, 500),
        type,
        priority,
        sectionId,
      });
    }
  }

  // Also extract from list items
  const listItemRegex = /<li[^>]*>(.*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = listItemRegex.exec(htmlContent)) !== null) {
    const itemText = stripHtml(liMatch[1]).trim();
    if (itemText.length > 15) {
      const hasKeyword = requirementKeywords.some(kw => kw.test(itemText));
      if (hasKeyword) {
        // Check if this sentence was already captured
        const isDuplicate = requirements.some(r =>
          r.text.includes(itemText.substring(0, 50)) || itemText.includes(r.text.substring(0, 50)),
        );
        if (!isDuplicate) {
          globalReqIndex++;
          const { type, priority } = classifyRequirement(itemText);
          requirements.push({
            id: `REQ-${String(globalReqIndex).padStart(3, '0')}`,
            text: itemText.substring(0, 500),
            type,
            priority,
            sectionId,
          });
        }
      }
    }
  }

  return requirements;
}

export function classifyRequirement(text: string): { type: RequirementType; priority: MoSCoWPriority } {
  const lower = text.toLowerCase();

  // Priority (MoSCoW)
  let priority: MoSCoWPriority = 'should';
  if (/\b(must|doit|devra|obligatoire|impératif|critique)\b/i.test(lower)) {
    priority = 'must';
  } else if (/\b(should|devrait|recommandé|souhaitable)\b/i.test(lower)) {
    priority = 'should';
  } else if (/\b(could|pourrait|optionnel|facultatif)\b/i.test(lower)) {
    priority = 'could';
  }

  // Type
  let type: RequirementType = 'functional';
  const technicalKeywords = /\b(api|endpoint|base de donn|database|serveur|server|http|rest|graphql|websocket|docker|kubernetes|aws|cloud|cdn|cache|queue|microservice)\b/i;
  const nonFunctionalKeywords = /\b(performance|sécurité|security|disponibilité|availability|scalab|résilience|resilience|latence|latency|rgpd|gdpr|accessibilité|accessibility|temps de réponse|response time)\b/i;

  if (nonFunctionalKeywords.test(lower)) {
    type = 'non-functional';
  } else if (technicalKeywords.test(lower)) {
    type = 'technical';
  } else if (/\b(règle métier|business rule|contrainte|constraint|validation)\b/i.test(lower)) {
    type = 'business-rule';
  }

  return { type, priority };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
