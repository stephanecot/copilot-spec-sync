import * as vscode from 'vscode';
import { StorageManager } from '../spec-comparator/storageManager.js';
import { findRelevantCode } from '../spec-comparator/codeMapper.js';
import { analyzeRequirement, consolidateResults } from '../spec-comparator/gapAnalyzer.js';
import { getGitCommitHash, generateId } from '../utils/fileUtils.js';
import { ProjectInfo, Requirement, SpecSection } from '../types.js';

export interface AnalysisJob {
  id: string;
  specId: string;
  specTitle: string;
  specVersion: string;
  projectNames: string[];
  status: 'running' | 'completed' | 'error' | 'cancelled';
  progress: number;
  currentStep: string;
  totalRequirements: number;
  processedRequirements: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  resultPct?: number;
}

export class AnalysisManager {
  private _jobs = new Map<string, AnalysisJob>();
  private _onDidUpdateJob = new vscode.EventEmitter<AnalysisJob>();
  public readonly onDidUpdateJob = this._onDidUpdateJob.event;
  private _cancellationTokens = new Map<string, vscode.CancellationTokenSource>();

  constructor(private _storage: StorageManager) {}

  getJobs(): AnalysisJob[] {
    return [...this._jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  cancelJob(jobId: string): void {
    const cts = this._cancellationTokens.get(jobId);
    if (cts) {
      cts.cancel();
    }
  }

  startAnalysis(
    specId: string,
    specTitle: string,
    specVersion: string,
    sections: SpecSection[],
    projects: ProjectInfo[],
    model: vscode.LanguageModelChat,
  ): string {
    const jobId = generateId();
    const cts = new vscode.CancellationTokenSource();
    this._cancellationTokens.set(jobId, cts);

    const allRequirements = this._flattenRequirements(sections);

    console.log(`[Spec Sync] Analysis starting:`);
    console.log(`  - Spec: ${specTitle} (${specId})`);
    console.log(`  - Projects:`, projects.map(p => `${p.name} (${p.path})`));
    console.log(`  - Requirements found: ${allRequirements.length}`);
    if (allRequirements.length > 0) {
      console.log(`  - First 3 requirements:`, allRequirements.slice(0, 3).map(r => r.id));
    }

    const job: AnalysisJob = {
      id: jobId,
      specId,
      specTitle,
      specVersion,
      projectNames: projects.map(p => p.name),
      status: 'running',
      progress: 0,
      currentStep: 'Starting...',
      totalRequirements: allRequirements.length,
      processedRequirements: 0,
      startedAt: new Date().toISOString(),
    };

    this._jobs.set(jobId, job);
    this._onDidUpdateJob.fire(job);

    if (allRequirements.length === 0) {
      job.status = 'error';
      job.error = 'No requirements found in the specification';
      job.currentStep = 'No requirements';
      job.completedAt = new Date().toISOString();
      this._onDidUpdateJob.fire(job);
      this._cancellationTokens.delete(jobId);
      return jobId;
    }

    // Run analysis in background (fire-and-forget, non-blocking)
    this._runAnalysis(jobId, specId, specVersion, allRequirements, projects, model, cts.token)
      .catch(err => {
        const j = this._jobs.get(jobId);
        if (j && j.status === 'running') {
          j.status = 'error';
          j.error = String(err);
          j.currentStep = 'Error';
          j.completedAt = new Date().toISOString();
          this._onDidUpdateJob.fire(j);
        }
      })
      .finally(() => {
        this._cancellationTokens.delete(jobId);
      });

    return jobId;
  }

  removeJob(jobId: string): void {
    this._jobs.delete(jobId);
    this._cancellationTokens.delete(jobId);
  }

  private async _runAnalysis(
    jobId: string,
    specId: string,
    specVersion: string,
    requirements: Requirement[],
    projects: ProjectInfo[],
    model: vscode.LanguageModelChat,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const job = this._jobs.get(jobId)!;

    const results = [];

    for (let i = 0; i < requirements.length; i++) {
      if (token.isCancellationRequested) {
        job.status = 'cancelled';
        job.currentStep = 'Cancelled';
        job.completedAt = new Date().toISOString();
        this._onDidUpdateJob.fire(job);
        return;
      }

      const req = requirements[i];
      job.currentStep = `${req.id}: ${req.text.substring(0, 60)}${req.text.length > 60 ? '...' : ''}`;
      job.processedRequirements = i;
      job.progress = Math.round((i / requirements.length) * 100);
      this._onDidUpdateJob.fire(job);

      try {
        const candidates = await findRelevantCode(req, projects, 5);
        console.log(`[Spec Sync] ${req.id}: Found ${candidates.length} candidate files`);
        if (candidates.length > 0) {
          console.log(`  - Top candidates:`, candidates.slice(0, 3).map(c => c.relativePath));
        }
        const result = await analyzeRequirement(req, candidates, model, token);
        console.log(`  - Result: ${result.status} (confidence: ${result.confidence}%)`);
        results.push(result);
      } catch (err) {
        if (token.isCancellationRequested) {
          job.status = 'cancelled';
          job.currentStep = 'Cancelled';
          job.completedAt = new Date().toISOString();
          this._onDidUpdateJob.fire(job);
          return;
        }
        // Log individual requirement error but continue
        console.error(`[Spec Sync] Error analyzing ${req.id}:`, err);
        results.push({
          requirementId: req.id,
          requirementText: req.text,
          status: 'not-implemented' as const,
          confidence: 0,
          matchedFiles: [],
          explanation: `Error during analysis: ${err}`,
          missingElements: [],
          suggestedActions: [],
          evolution: 'new' as const,
        });
      }
    }

    // Get git commit
    const gitHash = await getGitCommitHash(projects[0].path);

    // Previous comparison for evolution tracking
    const previousComparison = await this._storage.getLatestComparison(specId);

    // Consolidate and save
    const comparison = consolidateResults(
      results,
      specId,
      specVersion,
      projects.map(p => p.path),
      gitHash,
      previousComparison,
    );

    await this._storage.saveComparison(comparison);

    // Update job
    const pct = comparison.summary.total > 0
      ? Math.round((comparison.summary.implemented / comparison.summary.total) * 100)
      : 0;

    console.log(`[Spec Sync] Analysis completed:`);
    console.log(`  - Total: ${comparison.summary.total}`);
    console.log(`  - Implemented: ${comparison.summary.implemented}`);
    console.log(`  - Partial: ${comparison.summary.partial}`);
    console.log(`  - Not Implemented: ${comparison.summary.notImplemented}`);
    console.log(`  - Divergent: ${comparison.summary.divergent}`);
    console.log(`  - Compliance: ${pct}%`);

    job.status = 'completed';
    job.progress = 100;
    job.processedRequirements = requirements.length;
    job.resultPct = pct;
    job.currentStep = `Completed — ${pct}% compliant (${comparison.summary.implemented}/${comparison.summary.total})`;
    job.completedAt = new Date().toISOString();
    this._onDidUpdateJob.fire(job);

    // Refresh trees
    try {
      await vscode.commands.executeCommand('specSync.refreshTrees');
    } catch { /* ignore */ }
  }

  private _flattenRequirements(sections: SpecSection[]): Requirement[] {
    const reqs: Requirement[] = [];
    for (const section of sections) {
      reqs.push(...section.requirements);
      reqs.push(...this._flattenRequirements(section.subsections));
    }
    return reqs;
  }

  dispose() {
    for (const cts of this._cancellationTokens.values()) {
      cts.cancel();
      cts.dispose();
    }
    this._onDidUpdateJob.dispose();
  }
}
