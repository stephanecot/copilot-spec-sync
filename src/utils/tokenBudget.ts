import { ProjectType } from '../types.js';

export interface PrioritizedFile {
  path: string;
  priority: number;
  category: string;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function prioritizeFiles(files: string[], projectType: ProjectType): PrioritizedFile[] {
  return files.map(f => {
    const { priority, category } = getFilePriority(f, projectType);
    return { path: f, priority, category };
  }).sort((a, b) => b.priority - a.priority);
}

export function truncateToTokenBudget(content: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) {
    return content;
  }

  // Try to truncate at a natural boundary (end of function/class)
  const truncated = content.substring(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  if (lastNewline > maxChars * 0.8) {
    return truncated.substring(0, lastNewline) + '\n// ... [truncated]';
  }
  return truncated + '\n// ... [truncated]';
}

export function chunkByModule(files: string[], maxTokensPerChunk: number): string[][] {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const file of files) {
    // Rough estimate: file path alone is small, but content will be loaded later
    // For grouping purposes, estimate ~500 tokens per file average
    const estimatedTokensPerFile = 500;

    if (currentTokens + estimatedTokensPerFile > maxTokensPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(file);
    currentTokens += estimatedTokensPerFile;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function getFilePriority(filePath: string, _projectType: ProjectType): { priority: number; category: string } {
  const lower = filePath.toLowerCase();
  const name = lower.split('/').pop() || '';

  // Entry points and config (highest priority)
  if (name === 'package.json' || name === 'pom.xml' || name === 'go.mod' || name === 'cargo.toml') {
    return { priority: 100, category: 'manifest' };
  }
  if (name === 'readme.md' || name === 'readme.txt') {
    return { priority: 95, category: 'readme' };
  }
  if (/^(index|main|app|server)\.(ts|js|tsx|jsx|py|go|rs|java|cs)$/.test(name)) {
    return { priority: 90, category: 'entry' };
  }

  // Route/API definitions
  if (/route|api|endpoint|controller/.test(lower)) {
    return { priority: 85, category: 'routes' };
  }

  // Models/DTOs
  if (/model|entity|schema|dto/.test(lower)) {
    return { priority: 80, category: 'models' };
  }

  // Services/Business logic
  if (/service|provider|manager|handler/.test(lower)) {
    return { priority: 75, category: 'services' };
  }

  // Config files
  if (/config|setting|constant|\.env/.test(lower)) {
    return { priority: 70, category: 'config' };
  }

  // Middleware/Guards/Interceptors
  if (/middleware|guard|interceptor|filter|pipe/.test(lower)) {
    return { priority: 65, category: 'middleware' };
  }

  // Utils/Helpers
  if (/util|helper|lib|common/.test(lower)) {
    return { priority: 50, category: 'utils' };
  }

  // Views/Components
  if (/component|page|view|screen|template/.test(lower)) {
    return { priority: 55, category: 'views' };
  }

  // Tests (lower priority for documentation)
  if (/test|spec|__test__|\.test\.|\.spec\./.test(lower)) {
    return { priority: 30, category: 'tests' };
  }

  // Generated/Build files
  if (/dist|build|out|generated/.test(lower)) {
    return { priority: 10, category: 'generated' };
  }

  // Default
  return { priority: 40, category: 'other' };
}
