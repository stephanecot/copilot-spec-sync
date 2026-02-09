import * as vscode from 'vscode';
import { Requirement, RequirementComparison, ComparisonRecord, ComparisonStatus, ComparisonSummary } from '../types.js';
import { CandidateFile } from './codeMapper.js';
import { generateId } from '../utils/fileUtils.js';

/**
 * Maximum number of requirements to analyze in a single LLM call.
 * Keeps prompt size manageable while drastically reducing API calls.
 */
const BATCH_SIZE = 5;

/**
 * Max total characters of code context to include per batch to stay within token limits.
 */
const MAX_BATCH_CODE_CHARS = 30000;

export async function analyzeRequirement(
  requirement: Requirement,
  candidateFiles: CandidateFile[],
  model: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
): Promise<RequirementComparison> {
  if (candidateFiles.length === 0) {
    return {
      requirementId: requirement.id,
      requirementText: requirement.text,
      status: 'not-implemented',
      confidence: 0,
      matchedFiles: [],
      explanation: 'No relevant code files found for this requirement.',
      missingElements: [requirement.text],
      suggestedActions: ['Create the necessary files to implement this requirement.'],
      evolution: 'new',
    };
  }

  // Build files context
  let filesContext = '';
  for (const file of candidateFiles.slice(0, 5)) {
    const ext = file.relativePath.split('.').pop() || 'text';
    const truncatedContent = file.content.length > 8000
      ? file.content.substring(0, 8000) + '\n// ... [truncated]'
      : file.content;
    filesContext += `### ${file.relativePath}\n\`\`\`${ext}\n${truncatedContent}\n\`\`\`\n\n`;
  }

  const prompt = `You are an expert technical analyst. Compare the following requirement with the provided source code.

## Requirement
${requirement.id}: ${requirement.text}

## Relevant Code Files

${filesContext}

Analyze whether this requirement is implemented in the code. Respond ONLY with a valid JSON object (no markdown, no code block, no comments):
{"status":"implemented","confidence":85,"matchedFiles":[{"filePath":"path/file.ts","line":42}],"explanation":"...","missingElements":["..."],"suggestedActions":["..."]}

Possible values for status: "implemented", "partially-implemented", "not-implemented", "divergent"
Confidence is a number between 0 and 100.`;

  try {
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(messages, {}, token);

    let responseText = '';
    for await (const fragment of response.text) {
      responseText += fragment;
    }

    const parsed = parseJsonResponse(responseText);
    if (parsed) {
      return {
        requirementId: requirement.id,
        requirementText: requirement.text,
        status: validateStatus(parsed.status),
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
        matchedFiles: Array.isArray(parsed.matchedFiles) ? parsed.matchedFiles : [],
        explanation: String(parsed.explanation || ''),
        missingElements: Array.isArray(parsed.missingElements) ? parsed.missingElements : [],
        suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
        evolution: 'new',
      };
    }
  } catch {
    // LLM error - fall through to default
  }

  return {
    requirementId: requirement.id,
    requirementText: requirement.text,
    status: 'not-implemented',
    confidence: 0,
    matchedFiles: [],
    explanation: 'Analysis unavailable (LLM error).',
    missingElements: [],
    suggestedActions: [],
    evolution: 'new',
  };
}

/**
 * Analyze a batch of requirements against their respective code files in a SINGLE LLM call.
 * This reduces API calls by ~BATCH_SIZE x compared to one-call-per-requirement.
 */
export async function analyzeRequirementsBatch(
  batch: { requirement: Requirement; candidateFiles: CandidateFile[] }[],
  model: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
): Promise<RequirementComparison[]> {
  // Handle entries with no candidates locally (no LLM needed)
  const noCodeEntries: { index: number; requirement: Requirement }[] = [];
  const withCodeEntries: { index: number; requirement: Requirement; candidateFiles: CandidateFile[] }[] = [];

  for (let i = 0; i < batch.length; i++) {
    if (batch[i].candidateFiles.length === 0) {
      noCodeEntries.push({ index: i, requirement: batch[i].requirement });
    } else {
      withCodeEntries.push({ index: i, ...batch[i] });
    }
  }

  // Pre-fill results array
  const results: (RequirementComparison | null)[] = new Array(batch.length).fill(null);

  // Fill no-code results immediately (zero LLM cost)
  for (const entry of noCodeEntries) {
    results[entry.index] = {
      requirementId: entry.requirement.id,
      requirementText: entry.requirement.text,
      status: 'not-implemented',
      confidence: 0,
      matchedFiles: [],
      explanation: 'No relevant code files found for this requirement.',
      missingElements: [entry.requirement.text],
      suggestedActions: ['Create the necessary files to implement this requirement.'],
      evolution: 'new',
    };
  }

  // If all entries had no code, return early
  if (withCodeEntries.length === 0) {
    return results as RequirementComparison[];
  }

  // Build combined prompt with deduplicated code files
  const codeFileMap = new Map<string, string>(); // relativePath -> content
  let totalCodeChars = 0;

  // Collect unique code files across all requirements in this batch
  for (const entry of withCodeEntries) {
    for (const file of entry.candidateFiles.slice(0, 3)) { // Max 3 files per requirement
      if (!codeFileMap.has(file.relativePath) && totalCodeChars < MAX_BATCH_CODE_CHARS) {
        const truncatedContent = file.content.length > 6000
          ? file.content.substring(0, 6000) + '\n// ... [truncated]'
          : file.content;
        codeFileMap.set(file.relativePath, truncatedContent);
        totalCodeChars += truncatedContent.length;
      }
    }
  }

  // Build code files section
  let filesSection = '';
  for (const [filePath, content] of codeFileMap) {
    const ext = filePath.split('.').pop() || 'text';
    filesSection += `### ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
  }

  // Build requirements section
  let reqSection = '';
  const reqIds: string[] = [];
  for (const entry of withCodeEntries) {
    reqSection += `- **${entry.requirement.id}**: ${entry.requirement.text}\n`;
    reqSection += `  Candidate files: ${entry.candidateFiles.slice(0, 3).map(f => f.relativePath).join(', ')}\n`;
    reqIds.push(entry.requirement.id);
  }

  const prompt = `You are an expert technical analyst. Analyze whether each of the following requirements is implemented in the provided code.

## Requirements to Analyze
${reqSection}

## Source Code Files
${filesSection}

Analyze ALL ${withCodeEntries.length} requirements above. Respond ONLY with a valid JSON array (no markdown, no code block, no comments). Each element must have this shape:
{"requirementId":"REQ-001","status":"implemented","confidence":85,"matchedFiles":[{"filePath":"path/file.ts","line":42}],"explanation":"...","missingElements":["..."],"suggestedActions":["..."]}

Possible values for status: "implemented", "partially-implemented", "not-implemented", "divergent"
Confidence is a number between 0 and 100.
Return exactly ${withCodeEntries.length} results, one per requirement, in the same order as listed above.`;

  try {
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(messages, {}, token);

    let responseText = '';
    for await (const fragment of response.text) {
      responseText += fragment;
    }

    const parsed = parseJsonArrayResponse(responseText);
    if (parsed && parsed.length > 0) {
      // Map parsed results back to the correct indices
      for (let i = 0; i < withCodeEntries.length; i++) {
        const entry = withCodeEntries[i];
        // Try to match by requirementId first, then by position
        const matchedResult = parsed.find((r: any) => r.requirementId === entry.requirement.id) || parsed[i];

        if (matchedResult) {
          results[entry.index] = {
            requirementId: entry.requirement.id,
            requirementText: entry.requirement.text,
            status: validateStatus(matchedResult.status),
            confidence: Math.min(100, Math.max(0, Number(matchedResult.confidence) || 0)),
            matchedFiles: Array.isArray(matchedResult.matchedFiles) ? matchedResult.matchedFiles : [],
            explanation: String(matchedResult.explanation || ''),
            missingElements: Array.isArray(matchedResult.missingElements) ? matchedResult.missingElements : [],
            suggestedActions: Array.isArray(matchedResult.suggestedActions) ? matchedResult.suggestedActions : [],
            evolution: 'new',
          };
        }
      }
    }
  } catch {
    // LLM error — leave nulls, will be filled below
  }

  // Fill any remaining nulls with defaults
  for (let i = 0; i < results.length; i++) {
    if (!results[i]) {
      const req = batch[i].requirement;
      results[i] = {
        requirementId: req.id,
        requirementText: req.text,
        status: 'not-implemented',
        confidence: 0,
        matchedFiles: [],
        explanation: 'Analysis unavailable (LLM error or incomplete batch response).',
        missingElements: [],
        suggestedActions: [],
        evolution: 'new',
      };
    }
  }

  return results as RequirementComparison[];
}

/**
 * Returns an optimal batch size based on the total number of requirements.
 * For small specs, use smaller batches for finer progress updates.
 * For large specs, use larger batches to minimize API calls.
 */
export function getOptimalBatchSize(totalRequirements: number): number {
  if (totalRequirements <= 5) return totalRequirements; // 1 call total
  if (totalRequirements <= 15) return 5;
  if (totalRequirements <= 50) return 8;
  return 10; // Large specs: ~10 per call
}

export function consolidateResults(
  results: RequirementComparison[],
  specId: string,
  specVersion: string,
  projectPaths: string[],
  gitCommitHash?: string,
  previousComparison?: ComparisonRecord,
): ComparisonRecord {
  // Compute evolution if previous comparison exists
  if (previousComparison) {
    for (const result of results) {
      const previous = previousComparison.details.find(d => d.requirementId === result.requirementId);
      if (!previous) {
        result.evolution = 'new';
        result.previousStatus = undefined;
      } else {
        result.previousStatus = previous.status;
        const statusOrder: Record<ComparisonStatus, number> = {
          'not-implemented': 0,
          'divergent': 1,
          'partially-implemented': 2,
          'implemented': 3,
        };
        const prevScore = statusOrder[previous.status];
        const currScore = statusOrder[result.status];
        if (currScore > prevScore) {
          result.evolution = 'improved';
        } else if (currScore < prevScore) {
          result.evolution = 'regressed';
        } else {
          result.evolution = 'unchanged';
        }
      }
    }
  }

  return {
    id: generateId(),
    specId,
    timestamp: new Date().toISOString(),
    specVersion,
    projectPaths,
    summary: computeSummary(results),
    details: results,
    gitCommitHash,
  };
}

export function computeSummary(results: RequirementComparison[]): ComparisonSummary {
  return {
    total: results.length,
    implemented: results.filter(r => r.status === 'implemented').length,
    partial: results.filter(r => r.status === 'partially-implemented').length,
    notImplemented: results.filter(r => r.status === 'not-implemented').length,
    divergent: results.filter(r => r.status === 'divergent').length,
  };
}

function parseJsonResponse(text: string): Record<string, unknown> | null {
  // Try direct parse
  try {
    return JSON.parse(text.trim());
  } catch {
    // Try extracting JSON from markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // fall through
      }
    }

    // Try finding JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // fall through
      }
    }
  }
  return null;
}

function parseJsonArrayResponse(text: string): Record<string, unknown>[] | null {
  // Try direct parse
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }

  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }

  // Try finding JSON array in text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }

  // Last resort: try to find multiple JSON objects and wrap in array
  const objects: Record<string, unknown>[] = [];
  const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  while ((match = objRegex.exec(text)) !== null) {
    try {
      objects.push(JSON.parse(match[0]));
    } catch {
      // skip
    }
  }
  return objects.length > 0 ? objects : null;
}

function validateStatus(status: unknown): ComparisonStatus {
  const valid: ComparisonStatus[] = ['implemented', 'partially-implemented', 'not-implemented', 'divergent'];
  if (typeof status === 'string' && valid.includes(status as ComparisonStatus)) {
    return status as ComparisonStatus;
  }
  return 'not-implemented';
}
