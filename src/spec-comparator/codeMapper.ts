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
  maxCandidates: number = 5,
): Promise<CandidateFile[]> {
  const keywords = extractKeywords(requirement.text);
  if (keywords.length === 0) {
    return [];
  }

  const scoredFiles: { fullPath: string; relativePath: string; score: number; reason: string; projectPath: string }[] = [];

  for (const project of projects) {
    const fileTree = await getFileTree(project.path, 4);

    for (const relPath of fileTree) {
      if (relPath.endsWith('/')) { continue; }

      const fileName = path.basename(relPath);
      if (SKIP_FILES.has(fileName)) { continue; }
      if (/\.(test|spec|e2e)\./i.test(fileName)) { continue; }
      if (/\.(json|md|txt|yml|yaml|xml|lock|log)$/.test(fileName)) { continue; }

      const { score, reason } = scoreFile(relPath, keywords);
      if (score > 0) {
        scoredFiles.push({
          fullPath: path.join(project.path, relPath),
          relativePath: relPath,
          score,
          reason,
          projectPath: project.path,
        });
      }
    }
  }

  // Sort by score descending
  scoredFiles.sort((a, b) => b.score - a.score);

  // Load content for top candidates
  const candidates: CandidateFile[] = [];
  for (const file of scoredFiles.slice(0, maxCandidates)) {
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
  const lower = filePath.toLowerCase();
  const fileName = path.basename(lower, path.extname(lower));
  const dirName = path.dirname(lower).split('/').pop() || '';
  const parts = lower.split('/');

  let score = 0;
  const reasons: string[] = [];

  for (const keyword of keywords) {
    // File name match (highest weight)
    if (fileName.includes(keyword)) {
      score += 3;
      reasons.push(`nom fichier: ${keyword}`);
    }

    // Directory name match
    if (dirName.includes(keyword)) {
      score += 2;
      reasons.push(`dossier: ${keyword}`);
    }

    // Any path segment match
    if (parts.some(p => p.includes(keyword)) && !fileName.includes(keyword) && !dirName.includes(keyword)) {
      score += 1;
      reasons.push(`chemin: ${keyword}`);
    }
  }

  return { score, reason: reasons.slice(0, 3).join(', ') };
}
