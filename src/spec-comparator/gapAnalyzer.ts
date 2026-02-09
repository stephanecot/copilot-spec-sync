import * as vscode from 'vscode';
import { Requirement, RequirementComparison, ComparisonRecord, ComparisonStatus, ComparisonSummary } from '../types.js';
import { CandidateFile } from './codeMapper.js';
import { generateId } from '../utils/fileUtils.js';

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

function validateStatus(status: unknown): ComparisonStatus {
  const valid: ComparisonStatus[] = ['implemented', 'partially-implemented', 'not-implemented', 'divergent'];
  if (typeof status === 'string' && valid.includes(status as ComparisonStatus)) {
    return status as ComparisonStatus;
  }
  return 'not-implemented';
}
