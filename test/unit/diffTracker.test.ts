import { describe, it, expect } from 'vitest';
import { computeSnapshotDiff } from '../../src/history/diffTracker.js';
import { ComparisonRecord, RequirementComparison } from '../../src/types.js';

function makeComparison(details: Partial<RequirementComparison>[]): ComparisonRecord {
  const fullDetails: RequirementComparison[] = details.map(d => ({
    requirementId: d.requirementId || 'REQ-001',
    requirementText: d.requirementText || 'Test requirement',
    status: d.status || 'not-implemented',
    confidence: d.confidence || 80,
    matchedFiles: d.matchedFiles || [],
    explanation: d.explanation || '',
    missingElements: d.missingElements || [],
    suggestedActions: d.suggestedActions || [],
    previousStatus: d.previousStatus,
    evolution: d.evolution || 'new',
  }));

  return {
    id: 'test-id',
    specId: 'spec-1',
    timestamp: new Date().toISOString(),
    specVersion: '1.0',
    projectPaths: ['/test'],
    summary: {
      total: fullDetails.length,
      implemented: fullDetails.filter(d => d.status === 'implemented').length,
      partial: fullDetails.filter(d => d.status === 'partially-implemented').length,
      notImplemented: fullDetails.filter(d => d.status === 'not-implemented').length,
      divergent: fullDetails.filter(d => d.status === 'divergent').length,
    },
    details: fullDetails,
  };
}

describe('computeSnapshotDiff', () => {
  it('should detect newly implemented requirements', () => {
    const previous = makeComparison([
      { requirementId: 'REQ-001', status: 'not-implemented' },
    ]);
    const current = makeComparison([
      { requirementId: 'REQ-001', status: 'implemented', previousStatus: 'not-implemented', evolution: 'improved' },
    ]);

    const diff = computeSnapshotDiff(current, previous);
    expect(diff.newlyImplemented).toHaveLength(1);
    expect(diff.newlyImplemented[0].requirementId).toBe('REQ-001');
  });

  it('should detect regressions', () => {
    const previous = makeComparison([
      { requirementId: 'REQ-001', status: 'implemented' },
    ]);
    const current = makeComparison([
      { requirementId: 'REQ-001', status: 'not-implemented', previousStatus: 'implemented', evolution: 'regressed' },
    ]);

    const diff = computeSnapshotDiff(current, previous);
    expect(diff.regressions).toHaveLength(1);
  });

  it('should detect improvements (partial to implemented)', () => {
    const previous = makeComparison([
      { requirementId: 'REQ-001', status: 'partially-implemented' },
    ]);
    const current = makeComparison([
      { requirementId: 'REQ-001', status: 'implemented', previousStatus: 'partially-implemented', evolution: 'improved' },
    ]);

    const diff = computeSnapshotDiff(current, previous);
    expect(diff.newlyImplemented).toHaveLength(1);
  });

  it('should detect still missing requirements', () => {
    const previous = makeComparison([
      { requirementId: 'REQ-001', status: 'not-implemented' },
    ]);
    const current = makeComparison([
      { requirementId: 'REQ-001', status: 'not-implemented', previousStatus: 'not-implemented', evolution: 'unchanged' },
    ]);

    const diff = computeSnapshotDiff(current, previous);
    expect(diff.stillMissing).toHaveLength(1);
  });

  it('should detect unchanged implemented requirements', () => {
    const previous = makeComparison([
      { requirementId: 'REQ-001', status: 'implemented' },
    ]);
    const current = makeComparison([
      { requirementId: 'REQ-001', status: 'implemented', previousStatus: 'implemented', evolution: 'unchanged' },
    ]);

    const diff = computeSnapshotDiff(current, previous);
    expect(diff.unchanged).toHaveLength(1);
  });

  it('should handle new requirements not in previous', () => {
    const previous = makeComparison([]);
    const current = makeComparison([
      { requirementId: 'REQ-001', status: 'implemented' },
      { requirementId: 'REQ-002', status: 'not-implemented' },
    ]);

    const diff = computeSnapshotDiff(current, previous);
    expect(diff.newlyImplemented).toHaveLength(1);
    expect(diff.stillMissing).toHaveLength(1);
  });
});
