import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { findRelevantCode } from '../spec-comparator/codeMapper.js';
import { analyzeRequirement, consolidateResults } from '../spec-comparator/gapAnalyzer.js';
import { getWorkspaceProjects, getGitCommitHash } from '../utils/fileUtils.js';
import { Requirement, SpecSection, ComparisonRecord, RequirementComparison } from '../types.js';
import { getComplianceLevel } from '../views/statusBar.js';

export async function handleComparison(
  request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  _context: vscode.ExtensionContext,
  storage?: StorageManager,
): Promise<vscode.ChatResult> {
  if (!storage) {
    stream.markdown('**Error**: No workspace open. Open a folder to use this feature.');
    return {};
  }

  const specs = await storage.listSpecs();
  if (specs.length === 0) {
    stream.markdown('No specification uploaded. Use `@specsync /upload` to add one.');
    return {};
  }

  // Select spec (use last active or first available)
  const config = await storage.getConfig();
  const specId = config.lastActiveSpecId || specs[0].id;
  const spec = await storage.getSpec(specId);

  if (!spec) {
    stream.markdown(`**Error**: Unable to load specification ${specId}.`);
    return {};
  }

  const allProjects = await getWorkspaceProjects();
  if (allProjects.length === 0) {
    stream.markdown('No projects detected in the workspace.');
    return {};
  }

  // Sub-project selection if multiple projects detected
  let projects = allProjects;
  if (allProjects.length > 1) {
    const projectItems = allProjects.map(p => ({
      label: p.name,
      description: `${p.type} · ${p.language}`,
      detail: p.path,
      picked: false,
      project: p,
    }));

    const pickedProjects = await vscode.window.showQuickPick(projectItems, {
      placeHolder: 'Select the sub-project(s) to analyze',
      canPickMany: true,
    });

    if (!pickedProjects || pickedProjects.length === 0) {
      stream.markdown('*Comparison cancelled (no project selected).*');
      return {};
    }
    projects = pickedProjects.map(p => p.project);
  }

  // Flatten all requirements
  const allRequirements = flattenRequirements(spec.sections);
  if (allRequirements.length === 0) {
    stream.markdown('No requirements detected in the specification. Comparison cannot be performed.');
    return {};
  }

  stream.markdown(`## Comparison in progress\n\n`);
  stream.markdown(`**Specification**: ${spec.title} v${spec.version}\n`);
  stream.markdown(`**Requirements**: ${allRequirements.length}\n`);
  stream.markdown(`**Projects**: ${projects.map(p => p.name).join(', ')}\n\n`);

  // Get LLM model
  const model = request.model;

  // Get git commit hash
  const gitHash = await getGitCommitHash(projects[0].path);

  // Analyze each requirement
  const results: RequirementComparison[] = [];

  for (let i = 0; i < allRequirements.length; i++) {
    if (token.isCancellationRequested) {
      stream.markdown('\n\n*Analysis cancelled by user.*\n');
      break;
    }

    const req = allRequirements[i];
    stream.progress(`Analyzing ${req.id} (${i + 1}/${allRequirements.length})...`);

    const candidates = await findRelevantCode(req, projects, 5);
    const result = await analyzeRequirement(req, candidates, model, token);
    results.push(result);
  }

  // Get previous comparison for evolution tracking
  const previousComparison = await storage.getLatestComparison(specId);

  // Consolidate and save
  const comparison = consolidateResults(
    results,
    specId,
    spec.version,
    projects.map(p => p.path),
    gitHash,
    previousComparison,
  );

  await storage.saveComparison(comparison);

  // Stream the report
  streamReport(stream, comparison, spec.title);

  // Offer buttons
  stream.button({
    command: 'specSync.showCompliance',
    title: 'View Gaps',
  });

  // Refresh trees
  try {
    await vscode.commands.executeCommand('specSync.refreshTrees');
  } catch {
    // ignore if command not registered
  }

  return { metadata: { command: 'compare' } };
}

function streamReport(
  stream: vscode.ChatResponseStream,
  comparison: ComparisonRecord,
  specTitle: string,
): void {
  const s = comparison.summary;
  const implPct = s.total > 0 ? Math.round((s.implemented / s.total) * 100) : 0;
  const partialPct = s.total > 0 ? Math.round((s.partial / s.total) * 100) : 0;
  const missingPct = s.total > 0 ? Math.round((s.notImplemented / s.total) * 100) : 0;
  const divPct = s.total > 0 ? Math.round((s.divergent / s.total) * 100) : 0;
  const level = getComplianceLevel(implPct);

  stream.markdown(`\n---\n\n## Compliance Report - ${specTitle}\n\n`);

  // Compliance level with progress bar
  stream.markdown(`### Compliance Level: ${implPct}% — **${level.label}**\n\n`);
  stream.markdown(renderProgressBar(implPct) + '\n\n');

  // Level scale
  stream.markdown(`| Threshold | Level | |
|---|---|---|
`);
  stream.markdown(`| 100% | Perfect | ${implPct === 100 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 95-99% | Excellent | ${implPct >= 95 && implPct < 100 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 90-94% | Very Good | ${implPct >= 90 && implPct < 95 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 80-89% | Good | ${implPct >= 80 && implPct < 90 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 70-79% | Fair | ${implPct >= 70 && implPct < 80 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 60-69% | Average | ${implPct >= 60 && implPct < 70 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 50-59% | Insufficient | ${implPct >= 50 && implPct < 60 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 40-49% | Weak | ${implPct >= 40 && implPct < 50 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 25-39% | Very Weak | ${implPct >= 25 && implPct < 40 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 10-24% | Critical | ${implPct >= 10 && implPct < 25 ? '◀ You are here' : ''} |\n`);
  stream.markdown(`| 0-9% | Not Started | ${implPct < 10 ? '◀ You are here' : ''} |\n\n`);

  // Summary
  stream.markdown(`### Summary\n\n`);
  stream.markdown(`| Status | Count | Percentage |\n|---|---|---|\n`);
  stream.markdown(`| Implemented | ${s.implemented} | ${implPct}% |\n`);
  stream.markdown(`| Partial | ${s.partial} | ${partialPct}% |\n`);
  stream.markdown(`| Not Implemented | ${s.notImplemented} | ${missingPct}% |\n`);
  stream.markdown(`| Divergent | ${s.divergent} | ${divPct}% |\n`);
  stream.markdown(`| **Total** | **${s.total}** | **100%** |\n\n`);

  if (comparison.gitCommitHash) {
    stream.markdown(`> Commit: \`${comparison.gitCommitHash}\`\n\n`);
  }

  // Details table
  stream.markdown(`### Detail by Requirement\n\n`);
  stream.markdown(`| ID | Requirement | Status | Confidence | Files |\n|---|---|---|---|---|\n`);

  for (const detail of comparison.details) {
    const statusIcon = getStatusIcon(detail.status);
    const truncText = detail.requirementText.length > 60
      ? detail.requirementText.substring(0, 60) + '...'
      : detail.requirementText;
    const files = detail.matchedFiles.slice(0, 2).map(f => `\`${f.filePath}\``).join(', ') || '-';
    const evolution = detail.evolution !== 'new' && detail.evolution !== 'unchanged'
      ? ` ${getEvolutionIcon(detail.evolution)}`
      : '';

    stream.markdown(`| ${detail.requirementId} | ${truncText} | ${statusIcon}${evolution} | ${detail.confidence}% | ${files} |\n`);
  }

  stream.markdown('\n');
}

function renderProgressBar(pct: number): string {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  return `\`${bar}\` ${pct}%`;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'implemented': return 'Impl.';
    case 'partially-implemented': return 'Partial';
    case 'not-implemented': return 'Missing';
    case 'divergent': return 'Divergent';
    default: return status;
  }
}

function getEvolutionIcon(evolution: string): string {
  switch (evolution) {
    case 'improved': return '(+)';
    case 'regressed': return '(-)';
    default: return '';
  }
}

function flattenRequirements(sections: SpecSection[]): Requirement[] {
  const reqs: Requirement[] = [];
  for (const section of sections) {
    reqs.push(...section.requirements);
    reqs.push(...flattenRequirements(section.subsections));
  }
  return reqs;
}
