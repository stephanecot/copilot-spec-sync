import * as vscode from 'vscode';
import { Requirement, RequirementComparison, ComparisonStatus, ProjectInfo } from '../types.js';
import { WorkspaceSearchTool } from '../tools/workspaceSearchTool.js';
import { ReadFileTool } from '../tools/readFileTool.js';
import { CodeSearchTool } from '../tools/codeSearchTool.js';

const MAX_TOOL_CALL_ROUNDS = 5; // Limit rounds to keep context manageable
const MAX_TOOL_RESULT_CHARS = 4000; // Truncate each tool result to stay within budget
const TOKEN_BUDGET_RATIO = 0.75; // Use at most 75% of model's maxInputTokens

// Instantiate tools for direct invocation
const workspaceSearchTool = new WorkspaceSearchTool();
const readFileTool = new ReadFileTool();
const codeSearchTool = new CodeSearchTool();

/**
 * Analyze a requirement using language model tools for dynamic code exploration.
 * Instead of passing code in the prompt, the LLM uses tools to search and read files.
 */
export async function analyzeRequirementWithTools(
  requirement: Requirement,
  projects: ProjectInfo[],
  model: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
): Promise<RequirementComparison> {
  const toolsToUse: vscode.LanguageModelChatTool[] = [
    {
      name: 'spec-sync_workspace_search',
      description: 'Search for files in workspace by filename pattern',
    },
    {
      name: 'spec-sync_code_search',
      description: 'Search for code within file contents',
    },
    {
      name: 'spec-sync_read_file',
      description: 'Read complete file content from workspace',
    },
  ];

  const projectPaths = projects.map(p => `${p.name}: ${p.path}`).join('\n');
  const tokenBudget = Math.floor((model.maxInputTokens || 16000) * TOKEN_BUDGET_RATIO);

  const systemPrompt = `You are a technical analyst. Analyze whether the following requirement is implemented in the codebase.

**Requirement:**
${requirement.id}: ${requirement.text}

**Available Projects:**
${projectPaths}

**Your Task:**
1. Use tools to explore the codebase. Be EFFICIENT: search first, read only the most relevant files.
2. You have limited rounds — do NOT read every file. Focus on key matches.
3. When ready, respond with your final JSON analysis.

**Tools:**
- spec-sync_workspace_search: Find files by name pattern (returns file paths)
- spec-sync_code_search: Search code content by keyword (grep-like, returns matching lines)
- spec-sync_read_file: Read a specific file (returns content, capped at 6000 chars)

**IMPORTANT - Response Format:**
When you have gathered enough information, respond with ONLY this JSON (no markdown, no code blocks):
{"status":"implemented","confidence":85,"matchedFiles":[{"filePath":"path/file.ts","line":42}],"explanation":"...","missingElements":["..."],"suggestedActions":["..."]}

**Status values and confidence rules:**
- "not-implemented" → confidence 0-20 (nothing found)
- "partially-implemented" → confidence 20-65 (some parts found)
- "divergent" → confidence 30-70 (implementation differs from spec)
- "implemented" → confidence 65-100 (fully matches)

**CRITICAL**: Confidence score MUST match your explanation. If you find gaps, use low confidence.`;

  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
  ];

  console.log(`[Tool-Based Analyzer] Analyzing ${requirement.id} with tools...`);
  console.log(`[Tool-Based Analyzer] Version: 4.0-tool-based (context budget mgmt)`);
  console.log(`[Tool-Based Analyzer] Token budget: ${tokenBudget} (model max: ${model.maxInputTokens})`);

  let round = 0;
  while (round < MAX_TOOL_CALL_ROUNDS) {
    if (token.isCancellationRequested) {
      return createDefaultResult(requirement, 'Analysis cancelled');
    }

    round++;
    console.log(`[Tool-Based Analyzer] Round ${round} for ${requirement.id}`);

    // Check token budget before sending — trim history if too large
    try {
      const estimatedTokens = await estimateMessagesTokens(model, messages, token);
      console.log(`[Tool-Based Analyzer] Round ${round} estimated tokens: ${estimatedTokens}/${tokenBudget}`);

      if (estimatedTokens > tokenBudget && messages.length > 3) {
        // Keep system prompt (first message) and last 2 messages (latest tool call + result)
        const systemMsg = messages[0];
        const recentMsgs = messages.slice(-2);
        messages.length = 0;
        messages.push(systemMsg, ...recentMsgs);
        console.log(`[Tool-Based Analyzer] Trimmed history to ${messages.length} messages`);
      }
    } catch {
      // If token counting fails, continue anyway
    }

    try {
      const response = await model.sendRequest(messages, { tools: toolsToUse }, token);

      let responseText = '';
      const toolCalls: vscode.LanguageModelToolCallPart[] = [];

      for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          responseText += part.value;
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push(part);
        }
      }

      // If we have a final result (JSON response), parse and return
      if (toolCalls.length === 0 && responseText.trim().length > 0) {
        console.log(`[Tool-Based Analyzer] ${requirement.id} - received final result`);
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
      }

// If LLM made tool calls, execute them and continue
      if (toolCalls.length > 0) {
        console.log(`[Tool-Based Analyzer] ${requirement.id} - executing ${toolCalls.length} tool call(s)`);

        // Add assistant message with tool calls
        messages.push(new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.Assistant, [
          ...toolCalls,
        ]));

        // Execute tools and collect results
        const toolResults: vscode.LanguageModelToolResultPart[] = [];
        for (const toolCall of toolCalls) {
          console.log(`[Tool-Based Analyzer] Calling tool: ${toolCall.name} with input:`, toolCall.input);
          
          try {
            // Invoke our own tools directly instead of via vscode.lm.invokeTool()
            let result: vscode.LanguageModelToolResult;
            
            switch (toolCall.name) {
              case 'spec-sync_workspace_search':
                result = await workspaceSearchTool.invoke({ input: toolCall.input }, token);
                break;
              case 'spec-sync_read_file':
                result = await readFileTool.invoke({ input: toolCall.input }, token);
                break;
              case 'spec-sync_code_search':
                result = await codeSearchTool.invoke({ input: toolCall.input }, token);
                break;
              default:
                throw new Error(`Unknown tool: ${toolCall.name}`);
            }
            
            // Extract text from the LanguageModelToolResult
            // LanguageModelToolResult.content is Array<LanguageModelTextPart | ...>
            let resultText = '';
            try {
              if (result && result.content && Array.isArray(result.content)) {
                resultText = result.content
                  .filter((part: any) => part != null)
                  .map((part: any) => {
                    if (typeof part === 'string') { return part; }
                    if (part && typeof part === 'object' && 'value' in part) { return String(part.value); }
                    return String(part);
                  })
                  .join('\n');
              }
            } catch (contentError) {
              console.error(`[Tool-Based Analyzer] Error extracting tool result:`, contentError);
              resultText = JSON.stringify({ error: 'Failed to extract tool result' });
            }
            
            console.log(`[Tool-Based Analyzer] Tool ${toolCall.name} result (${resultText.length} chars)`);
            
            // Truncate large results to stay within context budget
            if (resultText.length > MAX_TOOL_RESULT_CHARS) {
              resultText = resultText.substring(0, MAX_TOOL_RESULT_CHARS) + '\n... [truncated, result too large]';
              console.log(`[Tool-Based Analyzer] Truncated to ${MAX_TOOL_RESULT_CHARS} chars`);
            }
            
            // CRITICAL: LanguageModelToolResultPart constructor requires Array, NOT a string
            toolResults.push(new vscode.LanguageModelToolResultPart(
              toolCall.callId,
              [new vscode.LanguageModelTextPart(resultText)]
            ));
          } catch (error) {
            console.error(`[Tool-Based Analyzer] Tool ${toolCall.name} error:`, error);
            toolResults.push(new vscode.LanguageModelToolResultPart(
              toolCall.callId,
              [new vscode.LanguageModelTextPart(JSON.stringify({ error: String(error) }))]
            ));
          }
        }

        // Add user message with tool results
        messages.push(new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, toolResults));

        // Continue loop to let LLM process results
        continue;
      }

      // If no tool calls and no valid JSON, LLM might be stuck
      console.warn(`[Tool-Based Analyzer] ${requirement.id} - no tool calls and no valid JSON, stopping`);
      break;

    } catch (error: any) {
      const errorMsg = String(error?.message || error);
      console.error(`[Tool-Based Analyzer] ${requirement.id} error in round ${round}:`, errorMsg);

      // "Response contained no choices" = context overflow or rate limit
      if (errorMsg.includes('no choices') || errorMsg.includes('Response contained no')) {
        // If we have enough context from previous rounds, try to produce a result
        if (round > 1) {
          console.log(`[Tool-Based Analyzer] Context overflow at round ${round}, asking for final answer with trimmed context`);
          // Keep only system prompt and ask for final answer
          const systemMsg = messages[0];
          messages.length = 0;
          messages.push(systemMsg);
          messages.push(vscode.LanguageModelChatMessage.User(
            'Based on whatever you found so far, provide your final JSON analysis now. If you found nothing, report not-implemented.'
          ));
          try {
            const retryResponse = await model.sendRequest(messages, {}, token);
            let retryText = '';
            for await (const part of retryResponse.stream) {
              if (part instanceof vscode.LanguageModelTextPart) {
                retryText += part.value;
              }
            }
            const parsed = parseJsonResponse(retryText);
            if (parsed) {
              return {
                requirementId: requirement.id,
                requirementText: requirement.text,
                status: validateStatus(parsed.status),
                confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
                matchedFiles: Array.isArray(parsed.matchedFiles) ? parsed.matchedFiles : [],
                explanation: String(parsed.explanation || '') + ' [context was trimmed]',
                missingElements: Array.isArray(parsed.missingElements) ? parsed.missingElements : [],
                suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
                evolution: 'new',
              };
            }
          } catch (retryErr) {
            console.error(`[Tool-Based Analyzer] Retry also failed:`, retryErr);
          }
        }
        return createDefaultResult(requirement, `Analysis failed: model context limit exceeded at round ${round}`);
      }

      return createDefaultResult(requirement, `Error during analysis: ${errorMsg}`);
    }
  }

  console.warn(`[Tool-Based Analyzer] ${requirement.id} - max rounds reached or no result`);
  return createDefaultResult(requirement, 'Unable to complete analysis (max rounds reached or incomplete response)');
}

/**
 * Analyze multiple requirements with tools (sequential, to avoid quota issues).
 */
export async function analyzeRequirementsWithTools(
  requirements: Requirement[],
  projects: ProjectInfo[],
  model: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
): Promise<RequirementComparison[]> {
  const results: RequirementComparison[] = [];

  for (const req of requirements) {
    if (token.isCancellationRequested) {
      // Fill remaining with defaults
      for (let i = results.length; i < requirements.length; i++) {
        results.push(createDefaultResult(requirements[i], 'Analysis cancelled'));
      }
      break;
    }

    const result = await analyzeRequirementWithTools(req, projects, model, token);
    results.push(result);
  }

  return results;
}

// Helper functions

/**
 * Estimate total token count for all messages.
 * Uses model.countTokens when available, falls back to char/4 estimate.
 */
async function estimateMessagesTokens(
  model: vscode.LanguageModelChat,
  messages: vscode.LanguageModelChatMessage[],
  token: vscode.CancellationToken,
): Promise<number> {
  let total = 0;
  for (const msg of messages) {
    try {
      const count = await model.countTokens(msg, token);
      total += count;
    } catch {
      // Fallback: estimate from serialized content length
      const contentStr = JSON.stringify(msg);
      total += Math.ceil(contentStr.length / 4);
    }
  }
  return total;
}

function createDefaultResult(requirement: Requirement, explanation: string): RequirementComparison {
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

function parseJsonResponse(text: string): Record<string, unknown> | null {
  // Try direct parse
  try {
    return JSON.parse(text.trim());
  } catch {
    // fall through
  }

  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\\s*\\n?([\\s\\S]*?)\\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Try finding JSON object
  const jsonMatch = text.match(/\\{[\\s\\S]*\\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // fall through
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
