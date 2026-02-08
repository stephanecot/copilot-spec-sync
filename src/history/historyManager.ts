import { StorageManager } from '../spec-comparator/storageManager.js';
import { ComparisonRecord, TrendData } from '../types.js';

export async function getHistory(
  storage: StorageManager,
  specId: string,
): Promise<{ comparisons: ComparisonRecord[]; trend: TrendData }> {
  const comparisons = await storage.listComparisons(specId);
  const trend = computeTrend(comparisons);
  return { comparisons, trend };
}

export function computeTrend(comparisons: ComparisonRecord[]): TrendData {
  if (comparisons.length === 0) {
    return { dataPoints: [], direction: 'stable', velocity: 0 };
  }

  // Build data points (most recent first → reverse for chronological order)
  const dataPoints = comparisons
    .slice()
    .reverse()
    .map(c => ({
      date: c.timestamp,
      implementedPct: c.summary.total > 0
        ? Math.round((c.summary.implemented / c.summary.total) * 100)
        : 0,
      total: c.summary.total,
    }));

  // Compute direction from last 3 data points
  let direction: TrendData['direction'] = 'stable';
  let velocity = 0;

  if (dataPoints.length >= 2) {
    const recent = dataPoints.slice(-3);
    const first = recent[0].implementedPct;
    const last = recent[recent.length - 1].implementedPct;
    velocity = last - first;

    if (velocity > 2) {
      direction = 'improving';
    } else if (velocity < -2) {
      direction = 'declining';
    } else {
      direction = 'stable';
    }
  }

  return { dataPoints, direction, velocity };
}
