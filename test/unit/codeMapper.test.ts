import { describe, it, expect } from 'vitest';
import { computeTrend } from '../../src/history/historyManager.js';
import { ComparisonRecord } from '../../src/types.js';
import {
  generateArchitectureDiagram,
  generateModuleDiagram,
  generateComplianceDiagram,
  generateEvolutionDiagram,
} from '../../src/doc-generator/mermaidGenerator.js';
import { ProjectAnalysis, ModuleInfo } from '../../src/types.js';

describe('computeTrend', () => {
  function makeComparison(implemented: number, total: number, timestamp: string): ComparisonRecord {
    return {
      id: `comp-${timestamp}`,
      specId: 'spec-1',
      timestamp,
      specVersion: '1.0',
      projectPaths: ['/test'],
      summary: {
        total,
        implemented,
        partial: 0,
        notImplemented: total - implemented,
        divergent: 0,
      },
      details: [],
    };
  }

  it('should return stable for empty comparisons', () => {
    const trend = computeTrend([]);
    expect(trend.direction).toBe('stable');
    expect(trend.velocity).toBe(0);
    expect(trend.dataPoints).toEqual([]);
  });

  it('should return stable for single comparison', () => {
    const trend = computeTrend([makeComparison(5, 10, '2024-01-01T00:00:00Z')]);
    expect(trend.direction).toBe('stable');
    expect(trend.dataPoints).toHaveLength(1);
    expect(trend.dataPoints[0].implementedPct).toBe(50);
  });

  it('should detect improving trend', () => {
    const comparisons = [
      makeComparison(8, 10, '2024-03-01T00:00:00Z'),
      makeComparison(5, 10, '2024-02-01T00:00:00Z'),
      makeComparison(3, 10, '2024-01-01T00:00:00Z'),
    ];
    const trend = computeTrend(comparisons);
    expect(trend.direction).toBe('improving');
    expect(trend.velocity).toBeGreaterThan(0);
  });

  it('should detect declining trend', () => {
    const comparisons = [
      makeComparison(3, 10, '2024-03-01T00:00:00Z'),
      makeComparison(5, 10, '2024-02-01T00:00:00Z'),
      makeComparison(8, 10, '2024-01-01T00:00:00Z'),
    ];
    const trend = computeTrend(comparisons);
    expect(trend.direction).toBe('declining');
    expect(trend.velocity).toBeLessThan(0);
  });
});

describe('mermaidGenerator', () => {
  describe('generateArchitectureDiagram', () => {
    it('should generate a graph TD diagram', () => {
      const analysis: ProjectAnalysis = {
        projectInfo: { name: 'test', path: '/test', type: 'node-backend', language: 'TypeScript', dependencies: {}, entryPoints: [] },
        fileTree: [],
        keyFiles: [],
        frameworks: [],
        patterns: [],
        moduleStructure: [
          { name: 'routes', path: 'src/routes', files: ['index.ts'], type: 'routes' },
          { name: 'services', path: 'src/services', files: ['userService.ts'], type: 'services' },
        ],
      };

      const diagram = generateArchitectureDiagram(analysis);
      expect(diagram).toContain('graph TD');
      expect(diagram).toContain('Routes');
      expect(diagram).toContain('Services');
    });

    it('should handle empty modules', () => {
      const analysis: ProjectAnalysis = {
        projectInfo: { name: 'test', path: '/test', type: 'unknown', language: 'Unknown', dependencies: {}, entryPoints: [] },
        fileTree: [],
        keyFiles: [],
        frameworks: [],
        patterns: [],
        moduleStructure: [],
      };

      const diagram = generateArchitectureDiagram(analysis);
      expect(diagram).toContain('No modules detected');
    });
  });

  describe('generateModuleDiagram', () => {
    it('should generate a graph LR diagram with modules', () => {
      const modules: ModuleInfo[] = [
        { name: 'services', path: 'src/services', files: ['auth.ts', 'user.ts'], type: 'services' },
      ];

      const diagram = generateModuleDiagram(modules);
      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('services');
    });

    it('should truncate files list if more than 5', () => {
      const modules: ModuleInfo[] = [
        { name: 'big', path: 'src/big', files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts'], type: 'other' },
      ];

      const diagram = generateModuleDiagram(modules);
      expect(diagram).toContain('+2 more');
    });
  });

  describe('generateComplianceDiagram', () => {
    it('should generate a pie chart', () => {
      const comparison: ComparisonRecord = {
        id: 'test',
        specId: 'spec-1',
        timestamp: new Date().toISOString(),
        specVersion: '1.0',
        projectPaths: ['/test'],
        summary: { total: 10, implemented: 5, partial: 2, notImplemented: 2, divergent: 1 },
        details: [],
      };

      const diagram = generateComplianceDiagram(comparison);
      expect(diagram).toContain('pie');
      expect(diagram).toContain('Implemented');
      expect(diagram).toContain('5');
    });
  });

  describe('generateEvolutionDiagram', () => {
    it('should generate an xychart', () => {
      const dataPoints = [
        { date: '2024-01-01T00:00:00Z', implementedPct: 30 },
        { date: '2024-02-01T00:00:00Z', implementedPct: 50 },
        { date: '2024-03-01T00:00:00Z', implementedPct: 70 },
      ];

      const diagram = generateEvolutionDiagram(dataPoints);
      expect(diagram).toContain('xychart-beta');
      expect(diagram).toContain('30, 50, 70');
    });

    it('should handle empty data', () => {
      const diagram = generateEvolutionDiagram([]);
      expect(diagram).toContain('No history data');
    });
  });
});
