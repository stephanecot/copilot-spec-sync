import * as path from 'path';
import { Requirement, ProjectInfo } from '../types.js';
import { getFileTree, readFileContent } from '../utils/fileUtils.js';

export interface CandidateFile {
  path: string;
  relativePath: string;
  relevanceScore: number;
  reason: string;
  content: string;
}

const STOP_WORDS = new Set([
  // French
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'en', 'dans',
  'pour', 'par', 'sur', 'avec', 'qui', 'que', 'ce', 'cette', 'ces', 'son', 'sa',
  'ses', 'au', 'aux', 'est', 'sont', 'être', 'avoir', 'fait', 'faire', 'peut',
  'doit', 'devra', 'devrait', 'il', 'elle', 'ils', 'nous', 'vous', 'leur',
  'pas', 'plus', 'ne', 'se', 'tous', 'tout', 'très', 'aussi', 'entre',
  // English
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall',
  'must', 'can', 'need', 'and', 'or', 'but', 'not', 'no', 'if', 'then', 'than',
  'so', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'to', 'up', 'it', 'its',
  'an', 'this', 'that', 'these', 'those', 'with', 'from', 'each', 'all', 'any',
]);

const SKIP_FILES = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', 'jest.config.js',
  'webpack.config.js', '.eslintrc.json', '.prettierrc', 'vite.config.ts',
  'README.md', 'CHANGELOG.md', 'LICENSE', '.gitignore', '.env',
]);

export async function findRelevantCode(
  requirement: Requirement,
  projects: ProjectInfo[],
  maxCandidates: number = 8,
): Promise<CandidateFile[]> {
  const keywords = extractKeywords(requirement.text);

  const allSourceFiles: { fullPath: string; relativePath: string; projectPath: string }[] = [];
  const scoredFiles: { fullPath: string; relativePath: string; score: number; reason: string; projectPath: string }[] = [];

  for (const project of projects) {
    console.log(`[Code Mapper] Scanning project: ${project.name} at ${project.path}`);
    const fileTree = await getFileTree(project.path, 10);

    for (const relPath of fileTree) {
      // Normalize path separators for consistent matching
      const normalizedPath = relPath.replace(/\\/g, '/');

      if (normalizedPath.endsWith('/')) { continue; }

      const fileName = path.basename(normalizedPath);
      if (SKIP_FILES.has(fileName)) { continue; }
      if (/\.(test|spec|e2e)\./i.test(fileName)) { continue; }
      if (/\.(json|md|txt|yml|yaml|xml|lock|log)$/.test(fileName)) { continue; }

      const fullPath = path.join(project.path, relPath);
      allSourceFiles.push({ fullPath, relativePath: normalizedPath, projectPath: project.path });

      if (keywords.length > 0) {
        const { score, reason } = scoreFile(normalizedPath, keywords);
        if (score > 0) {
          scoredFiles.push({
            fullPath,
            relativePath: normalizedPath,
            score,
            reason,
            projectPath: project.path,
          });
        }
      }
    }
  }

  console.log(`[Code Mapper] For "${requirement.id}": found ${allSourceFiles.length} source files, ${scoredFiles.length} scored matches`);

  // Sort by score descending
  scoredFiles.sort((a, b) => b.score - a.score);

  // FALLBACK: If no keyword matches, pick a sample of source files so the LLM
  // still gets code to analyze (instead of returning 0 candidates → auto not-implemented)
  let topFiles = scoredFiles.slice(0, maxCandidates);

  console.log(`[Code Mapper] Top ${topFiles.length} candidates (max=${maxCandidates}):`, topFiles.map(f => f.relativePath));

  if (topFiles.length === 0 && allSourceFiles.length > 0) {
    console.log(`[Code Mapper] No keyword matches, using fallback strategy`);
    // Prioritize common source extensions
    const SOURCE_EXT = new Set(['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cs', '.go', '.rs', '.vue', '.svelte', '.rb', '.php', '.kt', '.swift']);
    const sourceOnly = allSourceFiles.filter(f => SOURCE_EXT.has(path.extname(f.relativePath).toLowerCase()));
    const pool = sourceOnly.length > 0 ? sourceOnly : allSourceFiles;

    // Pick evenly spread files (not just the first N)
    const step = Math.max(1, Math.floor(pool.length / maxCandidates));
    for (let i = 0; i < pool.length && topFiles.length < maxCandidates; i += step) {
      topFiles.push({
        ...pool[i],
        score: 0,
        reason: 'fallback (no keyword match)',
      });
    }
  }

  // Load content for top candidates
  const candidates: CandidateFile[] = [];
  for (const file of topFiles) {
    const content = await readFileContent(file.fullPath, 30000);
    if (content.length > 0) {
      candidates.push({
        path: file.fullPath,
        relativePath: file.relativePath,
        relevanceScore: file.score,
        reason: file.reason,
        content,
      });
    }
  }

  return candidates;
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .filter(w => !STOP_WORDS.has(w));

  return [...new Set(words)];
}

function scoreFile(filePath: string, keywords: string[]): { score: number; reason: string } {
  // Normalize to forward slashes for consistent matching on all platforms
  const lower = filePath.toLowerCase().replace(/\\/g, '/');
  const fileName = path.basename(lower, path.extname(lower));
  const parts = lower.split('/');
  const dirName = parts.length > 1 ? parts[parts.length - 2] : '';

  let score = 0;
  const reasons: string[] = [];

  for (const keyword of keywords) {
    // File name match (highest weight)
    if (fileName.includes(keyword)) {
      score += 3;
      reasons.push(`filename: ${keyword}`);
    }

    // Parent directory name match
    if (dirName && dirName.includes(keyword)) {
      score += 2;
      reasons.push(`directory: ${keyword}`);
    }

    // Any path segment match (excluding already matched file/dir)
    if (parts.some(p => p.includes(keyword)) && !fileName.includes(keyword) && !dirName.includes(keyword)) {
      score += 1;
      reasons.push(`path: ${keyword}`);
    }
  }

  return { score, reason: reasons.slice(0, 3).join(', ') };
}
