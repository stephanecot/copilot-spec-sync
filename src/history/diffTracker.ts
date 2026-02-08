import { ComparisonRecord, SnapshotDiff } from '../types.js';

export function computeSnapshotDiff(current: ComparisonRecord, previous: ComparisonRecord): SnapshotDiff {
  const diff: SnapshotDiff = {
    newlyImplemented: [],
    regressions: [],
    stillMissing: [],
    improved: [],
    unchanged: [],
  };

  for (const detail of current.details) {
    const prev = previous.details.find(d => d.requirementId === detail.requirementId);

    if (!prev) {
      if (detail.status === 'implemented') {
        diff.newlyImplemented.push(detail);
      } else {
        diff.stillMissing.push(detail);
      }
      continue;
    }

    if (detail.status === 'implemented' && prev.status !== 'implemented') {
      diff.newlyImplemented.push(detail);
    } else if (detail.evolution === 'improved') {
      diff.improved.push(detail);
    } else if (detail.evolution === 'regressed') {
      diff.regressions.push(detail);
    } else if (detail.status === 'not-implemented' || detail.status === 'divergent') {
      diff.stillMissing.push(detail);
    } else {
      diff.unchanged.push(detail);
    }
  }

  return diff;
}
