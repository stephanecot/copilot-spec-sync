import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Requirement, RequirementComparison, ComparisonStatus, ProjectInfo } from '../types.js';
import { getFileTree, readFileContent } from '../utils/fileUtils.js';

/**
 * Maximum characters of workspace context to include in the LLM prompt.
 * This must stay well under the model's token limit (~32k tokens ≈ ~120k chars).
 * We keep a safe margin for the prompt structure + response.
 */
const MAX_WORKSPACE_CONTEXT_CHARS = 60000;

/**
 * Maximum characters per individual file when included in context.
 */
const MAX_FILE_CHARS = 6000;

/**
 * Maximum requirements to analyze per LLM call.
 */
const MAX_REQUIREMENTS_PER_CALL = 8;

// ── Workspace Context Builder ────────────────────────────────────────

interface WorkspaceSnapshot {
  fileTree: string;
  fileContents: Map<string, string>;
  totalChars: number;
}

/**
 * Build a snapshot of the workspace: full file tree + contents of key source files.
 * This replaces the tool-based exploration with a single pre-computed context.
 */
async function buildWorkspaceSnapshot(projects: ProjectInfo[]): Promise<WorkspaceSnapshot> {
  const fileTree: string[] = [];
  const fileContents = new Map<string, string>();
  let totalChars = 0;

  for (const project of projects) {
    console.log(`[Chat Analyzer] Scanning project: ${project.name} at ${project.path}`);

    // Get full file tree
    const tree = await getFileTree(project.path, 10);
    const projectLabel = projects.length > 1 ? `[${project.name}] ` : '';

    for (const filePath of tree) {
      fileTree.push(`${projectLabel}${filePath}`);
    }

    // Prioritize and read source files
    const sourceFiles = tree
      .filter(f => isSourceFile(f))
      .sort((a, b) => getFilePriority(b) - getFilePriority(a));

    console.log(`[Chat Analyzer] Found ${sourceFiles.length} source files in ${project.name}`);

    for (const relPath of sourceFiles) {
      if (totalChars >= MAX_WORKSPACE_CONTEXT_CHARS) {
        console.log(`[Chat Analyzer] Context budget reached (${totalChars} chars), stopping file reads`);
        break;
      }

      const fullPath = path.join(project.path, relPath);
      try {
        let content = await readFileContent(fullPath);
        if (content.length > MAX_FILE_CHARS) {
          content = content.substring(0, MAX_FILE_CHARS) + '\n// ... [truncated]';
        }
        const key = projects.length > 1 ? `[${project.name}] ${relPath}` : relPath;
        fileContents.set(key, content);
        totalChars += content.length;
      } catch {
        // Skip unreadable files
      }
    }
  }

  console.log(`[Chat Analyzer] Workspace snapshot: ${fileTree.length} files in tree, ${fileContents.size} files read (${totalChars} total chars)`);

  return {
    fileTree: fileTree.join('\n'),
    fileContents,
    totalChars,
  };
}

// ── Main Analysis Entry Point ────────────────────────────────────────

/**
 * Analyze all requirements against the workspace using a chat-based approach:
 * 1. Build a workspace snapshot (file tree + key files)
 * 2. Send batches of requirements to the LLM with workspace context
 * 3. LLM produces a structured markdown report
 * 4. Save the markdown and parse results
 */
export async function analyzeWithChat(
  requirements: Requirement[],
  projects: ProjectInfo[],
  model: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
  onProgress?: (processed: number, total: number, step: string) => void,
): Promise<{ results: RequirementComparison[]; reportPath: string }> {
  console.log(`[Chat Analyzer] Starting analysis: ${requirements.length} requirements, ${projects.length} projects`);
  console.log(`[Chat Analyzer] Model: ${model.id}, maxInputTokens: ${model.maxInputTokens}`);

  // Phase 1: Build workspace snapshot
  onProgress?.(0, requirements.length, 'Scanning workspace...');
  const snapshot = await buildWorkspaceSnapshot(projects);

  if (token.isCancellationRequested) {
    return { results: requirements.map(r => createDefault(r, 'Cancelled')), reportPath: '' };
  }

  // Phase 2: Analyze in batches
  const allResults: RequirementComparison[] = [];
  const allMarkdownSections: string[] = [];
  const batchSize = Math.min(MAX_REQUIREMENTS_PER_CALL, Math.max(1, Math.floor(requirements.length / 2)));
  const totalBatches = Math.ceil(requirements.length / batchSize);

  console.log(`[Chat Analyzer] Batch size: ${batchSize}, total batches: ${totalBatches}`);

  for (let i = 0; i < totalBatches; i++) {
    if (token.isCancellationRequested) {
      // Fill remaining with defaults
      for (let j = allResults.length; j < requirements.length; j++) {
        allResults.push(createDefault(requirements[j], 'Cancelled'));
      }
      break;
    }

    const start = i * batchSize;
    const end = Math.min(start + batchSize, requirements.length);
    const batchReqs = requirements.slice(start, end);

    const step = `Analyzing batch ${i + 1}/${totalBatches}: ${batchReqs.map(r => r.id).join(', ')}`;
    onProgress?.(start, requirements.length, step);
    console.log(`[Chat Analyzer] ${step}`);

    try {
      const { results, markdown } = await analyzeBatchWithChat(
        batchReqs, snapshot, model, token,
      );
      allResults.push(...results);
      allMarkdownSections.push(markdown);

      console.log(`[Chat Analyzer] Batch ${i + 1} done: ${results.map(r => `${r.requirementId}=${r.status}(${r.confidence}%)`).join(', ')}`);
    } catch (error) {
      console.error(`[Chat Analyzer] Batch ${i + 1} error:`, error);
      for (const req of batchReqs) {
        allResults.push(createDefault(req, `Analysis error: ${error}`));
      }
      allMarkdownSections.push(`## Batch ${i + 1} — Error\n\nAnalysis failed: ${error}\n`);
    }
  }

  // Phase 3: Save the full markdown report
  onProgress?.(requirements.length, requirements.length, 'Saving report...');
  const reportPath = await saveMarkdownReport(allMarkdownSections, projects, requirements.length);

  console.log(`[Chat Analyzer] Report saved to: ${reportPath}`);
  return { results: allResults, reportPath };
}

// ── Single Batch Analysis ────────────────────────────────────────────

async function analyzeBatchWithChat(
  requirements: Requirement[],
  snapshot: WorkspaceSnapshot,
  model: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
): Promise<{ results: RequirementComparison[]; markdown: string }> {

  // Build the file contents section — only include files relevant to this batch
  const relevantFiles = selectRelevantFiles(requirements, snapshot);

  let filesSection = '';
  for (const [filePath, content] of relevantFiles) {
    const ext = filePath.split('.').pop() || 'txt';
    filesSection += `### ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
  }

  // Build requirements list
  const reqList = requirements
    .map(r => `- **${r.id}** (${r.type}, ${r.priority}): ${r.text}`)
    .join('\n');

  const prompt = `You are a senior technical analyst auditing code against a specification.

## Workspace File Tree
\`\`\`
${snapshot.fileTree}
\`\`\`

## Source Code
${filesSection}

## Requirements to Analyze
${reqList}

---

**Instructions:**
Analyze each requirement against the source code above. For each requirement, determine:
1. **Status**: implemented | partially-implemented | not-implemented | divergent
2. **Confidence**: 0-100 (MUST match your assessment — low if gaps found)
3. **Matched files**: which files implement it (with line numbers if possible)
4. **Explanation**: concise justification
5. **Missing elements**: what's not implemented
6. **Suggested actions**: what to do next

**CRITICAL scoring rules:**
- "not-implemented" → confidence 0-20
- "partially-implemented" → confidence 20-65
- "divergent" → confidence 30-70
- "implemented" → confidence 65-100

**Respond with ONLY a markdown report in this EXACT format (no JSON, no code blocks around the whole response):**

## Analysis Report

### REQ-XXX: [requirement text summary]
- **Status**: implemented
- **Confidence**: 85%
- **Files**: \`src/path/file.ts:42\`, \`src/other.ts:10\`
- **Explanation**: [your analysis]
- **Missing**: [missing elements, or "None"]
- **Actions**: [suggested actions, or "None"]

### REQ-YYY: [next requirement]
...

Produce one ### section per requirement, in order.`;

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];

  // Check token budget
  try {
    const tokenCount = await model.countTokens(messages[0], token);
    console.log(`[Chat Analyzer] Prompt tokens: ~${tokenCount} (max: ${model.maxInputTokens})`);
    if (tokenCount > model.maxInputTokens * 0.9) {
      console.warn(`[Chat Analyzer] Prompt is close to token limit! Trimming files...`);
      // Re-attempt with fewer files — take only the first half
      const trimmedFiles = new Map([...relevantFiles].slice(0, Math.ceil(relevantFiles.size / 2)));
      let trimmedSection = '';
      for (const [fp, content] of trimmedFiles) {
        const ext = fp.split('.').pop() || 'txt';
        trimmedSection += `### ${fp}\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
      }
      messages[0] = vscode.LanguageModelChatMessage.User(
        prompt.replace(filesSection, trimmedSection),
      );
    }
  } catch {
    // Continue with original prompt if token counting fails
  }

  const response = await model.sendRequest(messages, {}, token);

  let markdown = '';
  for await (const part of response.stream) {
    if (part instanceof vscode.LanguageModelTextPart) {
      markdown += part.value;
    }
  }

  console.log(`[Chat Analyzer] Received ${markdown.length} chars of markdown`);

  // Parse the markdown into structured results
  const results = parseMarkdownReport(markdown, requirements);

  return { results, markdown };
}

// ── File Selection ───────────────────────────────────────────────────

/**
 * From the workspace snapshot, select files most relevant to the given requirements.
 * Uses keyword matching from requirement text against file paths and content.
 */
function selectRelevantFiles(
  requirements: Requirement[],
  snapshot: WorkspaceSnapshot,
): Map<string, string> {
  // Extract keywords from all requirements in this batch
  const keywords = new Set<string>();
  for (const req of requirements) {
    const words = req.text
      .toLowerCase()
      .replace(/[^a-záàâäéèêëîïôöùûüç\w-]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    for (const w of words) {
      keywords.add(w);
    }
  }

  // Score each file by relevance
  const scored: { key: string; content: string; score: number }[] = [];

  for (const [key, content] of snapshot.fileContents) {
    let score = getFilePriority(key); // Base priority from file type
    const lower = (key + '\n' + content).toLowerCase();

    for (const kw of keywords) {
      // Check file path
      if (key.toLowerCase().includes(kw)) {
        score += 10;
      }
      // Check content (count occurrences, capped)
      const matches = lower.split(kw).length - 1;
      if (matches > 0) {
        score += Math.min(matches, 5) * 2;
      }
    }

    scored.push({ key, content, score });
  }

  // Sort by score and take top files within budget
  scored.sort((a, b) => b.score - a.score);

  const selected = new Map<string, string>();
  let totalChars = 0;
  const budgetPerBatch = MAX_WORKSPACE_CONTEXT_CHARS * 0.6; // Leave room for prompt structure

  for (const entry of scored) {
    if (totalChars + entry.content.length > budgetPerBatch) {
      continue; // Skip large files that would blow the budget, keep looking for smaller ones
    }
    selected.set(entry.key, entry.content);
    totalChars += entry.content.length;

    if (selected.size >= 25) { // Cap at 25 files per batch
      break;
    }
  }

  console.log(`[Chat Analyzer] Selected ${selected.size} relevant files (${totalChars} chars) from ${snapshot.fileContents.size} total`);

  return selected;
}

// ── Markdown Report Parser ───────────────────────────────────────────

/**
 * Parse the LLM's markdown report back into RequirementComparison objects.
 * Expected format per requirement:
 *
 * ### REQ-XXX: summary
 * - **Status**: implemented
 * - **Confidence**: 85%
 * - **Files**: `src/file.ts:42`, `src/other.ts`
 * - **Explanation**: ...
 * - **Missing**: ...
 * - **Actions**: ...
 */
function parseMarkdownReport(
  markdown: string,
  requirements: Requirement[],
): RequirementComparison[] {
  const results: RequirementComparison[] = [];
  const reqMap = new Map(requirements.map(r => [r.id, r]));

  // Split by ### headers
  const sections = markdown.split(/^###\s+/m).filter(s => s.trim().length > 0);

  for (const section of sections) {
    const lines = section.split('\n');
    const headerLine = lines[0] || '';

    // Extract requirement ID from header (e.g., "REQ-001: ..." or "REQ-001 :")
    const idMatch = headerLine.match(/(REQ-\d+)/i);
    if (!idMatch) {
      continue;
    }

    const reqId = idMatch[1].toUpperCase();
    const req = reqMap.get(reqId);
    if (!req) {
      continue;
    }

    // Parse fields
    const body = lines.slice(1).join('\n');
    const status = extractField(body, 'Status');
    const confidence = extractField(body, 'Confidence');
    const files = extractField(body, 'Files');
    const explanation = extractField(body, 'Explanation');
    const missing = extractField(body, 'Missing');
    const actions = extractField(body, 'Actions');

    results.push({
      requirementId: reqId,
      requirementText: req.text,
      status: validateStatus(status),
      confidence: parseConfidence(confidence),
      matchedFiles: parseFiles(files),
      explanation: explanation || 'No explanation provided.',
      missingElements: parselist(missing),
      suggestedActions: parselist(actions),
      evolution: 'new',
    });

    // Remove from map so we know which ones are still missing
    reqMap.delete(reqId);
  }

  // Fill in any requirements not found in the report
  for (const [id, req] of reqMap) {
    results.push(createDefault(req, 'Requirement not found in analysis report.'));
  }

  return results;
}

function extractField(text: string, fieldName: string): string {
  // Match "- **Field**: value" or "- **Field:** value"
  const regex = new RegExp(`-\\s*\\*\\*${fieldName}\\*\\*\\s*:?\\s*(.+?)(?=\\n-\\s*\\*\\*|$)`, 'is');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function validateStatus(raw: string): ComparisonStatus {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('partially') || lower.includes('partial')) { return 'partially-implemented'; }
  if (lower.includes('not-implemented') || lower.includes('not implemented') || lower.includes('missing')) { return 'not-implemented'; }
  if (lower.includes('divergent') || lower.includes('diverge')) { return 'divergent'; }
  if (lower.includes('implemented') || lower.includes('complete')) { return 'implemented'; }
  return 'not-implemented';
}

function parseConfidence(raw: string): number {
  const match = raw.match(/(\d+)/);
  if (match) {
    return Math.min(100, Math.max(0, parseInt(match[1], 10)));
  }
  return 0;
}

function parseFiles(raw: string): { filePath: string; line?: number }[] {
  if (!raw || raw.toLowerCase() === 'none' || raw === '-') {
    return [];
  }

  const files: { filePath: string; line?: number }[] = [];
  // Match `path/file.ts:42` or `path/file.ts` patterns
  const fileRegex = /`([^`]+?)`/g;
  let match;
  while ((match = fileRegex.exec(raw)) !== null) {
    const parts = match[1].split(':');
    const filePath = parts[0].trim();
    const line = parts[1] ? parseInt(parts[1], 10) : undefined;
    if (filePath && !filePath.includes(' ')) { // Skip non-path backtick content
      files.push({ filePath, line: isNaN(line as number) ? undefined : line });
    }
  }
  return files;
}

function parselist(raw: string): string[] {
  if (!raw || raw.toLowerCase() === 'none' || raw === '-') {
    return [];
  }
  // Split by commas, semicolons, or bullet points
  return raw.split(/[,;]|\n\s*[-*]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.toLowerCase() !== 'none');
}

// ── Report Persistence ───────────────────────────────────────────────

async function saveMarkdownReport(
  sections: string[],
  projects: ProjectInfo[],
  totalRequirements: number,
): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return '';
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const projectNames = projects.map(p => p.name).join(', ');

  const header = `# Spec Sync Analysis Report

- **Date**: ${now.toLocaleString()}
- **Projects**: ${projectNames}
- **Requirements analyzed**: ${totalRequirements}

---

`;

  const fullReport = header + sections.join('\n\n---\n\n');

  const reportDir = path.join(workspaceFolders[0].uri.fsPath, '.spec-sync', 'reports');
  const reportPath = path.join(reportDir, `report-${timestamp}.md`);

  try {
    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(reportPath, fullReport, 'utf-8');
    console.log(`[Chat Analyzer] Report written: ${reportPath} (${fullReport.length} chars)`);
  } catch (error) {
    console.error(`[Chat Analyzer] Failed to write report:`, error);
    return '';
  }

  return reportPath;
}

// ── Helpers ──────────────────────────────────────────────────────────

function createDefault(requirement: Requirement, explanation: string): RequirementComparison {
  return {
    requirementId: requirement.id,
    requirementText: requirement.text,
    status: 'not-implemented',
    confidence: 0,
    matchedFiles: [],
    explanation,
    missingElements: [],
    suggestedActions: [],
    evolution: 'new',
  };
}

function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [
    '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cs', '.go', '.rs',
    '.cpp', '.c', '.h', '.hpp', '.vue', '.svelte', '.rb', '.php',
    '.kt', '.swift', '.scala', '.sql',
  ].includes(ext);
}

function getFilePriority(filePath: string): number {
  const lower = filePath.toLowerCase();
  const name = path.basename(lower);

  // Entry points
  if (/^(index|main|app|server)\.(ts|js|tsx|jsx|py|go|rs)$/.test(name)) { return 90; }
  // Routes/API
  if (/route|api|endpoint|controller/i.test(lower)) { return 85; }
  // Models
  if (/model|entity|schema|dto/i.test(lower)) { return 80; }
  // Services
  if (/service|provider|manager|handler/i.test(lower)) { return 75; }
  // Config
  if (/config|setting|constant/i.test(lower)) { return 70; }
  // Middleware
  if (/middleware|guard|interceptor|filter/i.test(lower)) { return 65; }
  // Components/Views
  if (/component|page|view|screen/i.test(lower)) { return 55; }
  // Utils
  if (/util|helper|lib|common/i.test(lower)) { return 50; }
  // Tests
  if (/test|spec|__test__/i.test(lower)) { return 30; }
  // Generated
  if (/dist|build|out|generated/i.test(lower)) { return 10; }

  return 40;
}

const STOP_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'shall', 'must', 'can', 'need', 'and', 'or', 'but', 'not', 'no', 'if',
  'then', 'than', 'so', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'to',
  'up', 'it', 'its', 'an', 'this', 'that', 'these', 'those', 'with', 'from',
  'each', 'all', 'any', 'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de',
  'et', 'ou', 'en', 'dans', 'pour', 'par', 'sur', 'avec', 'qui', 'que',
  'ce', 'cette', 'ces', 'son', 'sa', 'ses', 'au', 'aux', 'est', 'sont',
  'être', 'avoir', 'fait', 'faire', 'peut', 'doit', 'devra', 'devrait',
  'pas', 'plus', 'ne', 'se', 'tous', 'tout', 'très', 'aussi', 'entre',
]);
