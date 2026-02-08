import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { StorageManager } from '../../src/spec-comparator/storageManager.js';
import { ParsedSpec, ComparisonRecord } from '../../src/types.js';

describe('StorageManager', () => {
  let tmpDir: string;
  let storage: StorageManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specsync-test-'));
    storage = new StorageManager(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeParsedSpec(id: string): ParsedSpec {
    return {
      id,
      title: `Test Spec ${id}`,
      version: '1.0',
      uploadedAt: new Date().toISOString(),
      filePath: '',
      sections: [],
      requirementCount: 0,
    };
  }

  function makeComparison(specId: string): ComparisonRecord {
    return {
      id: 'comp-1',
      specId,
      timestamp: new Date().toISOString(),
      specVersion: '1.0',
      projectPaths: ['/test'],
      summary: { total: 3, implemented: 1, partial: 1, notImplemented: 1, divergent: 0 },
      details: [],
    };
  }

  it('should initialize storage directory', async () => {
    await storage.initialize();
    const specsDir = path.join(tmpDir, 'specs');
    const stat = await fs.stat(specsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('should return empty specs list initially', async () => {
    const specs = await storage.listSpecs();
    expect(specs).toEqual([]);
  });

  it('should save and retrieve a spec', async () => {
    const spec = makeParsedSpec('spec-1');

    // Create a dummy docx file for saveSpec
    const docxPath = path.join(tmpDir, 'test.docx');
    await fs.writeFile(docxPath, 'dummy docx content');

    await storage.saveSpec(spec, docxPath);

    const retrieved = await storage.getSpec('spec-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe('Test Spec spec-1');
    expect(retrieved!.version).toBe('1.0');
  });

  it('should list saved specs', async () => {
    const spec = makeParsedSpec('spec-1');
    const docxPath = path.join(tmpDir, 'test.docx');
    await fs.writeFile(docxPath, 'dummy docx content');

    await storage.saveSpec(spec, docxPath);

    const specs = await storage.listSpecs();
    expect(specs).toHaveLength(1);
    expect(specs[0].id).toBe('spec-1');
    expect(specs[0].title).toBe('Test Spec spec-1');
  });

  it('should delete a spec', async () => {
    const spec = makeParsedSpec('spec-1');
    const docxPath = path.join(tmpDir, 'test.docx');
    await fs.writeFile(docxPath, 'dummy');

    await storage.saveSpec(spec, docxPath);
    await storage.deleteSpec('spec-1');

    const specs = await storage.listSpecs();
    expect(specs).toHaveLength(0);

    const retrieved = await storage.getSpec('spec-1');
    expect(retrieved).toBeUndefined();
  });

  it('should save and list comparisons', async () => {
    const spec = makeParsedSpec('spec-1');
    const docxPath = path.join(tmpDir, 'test.docx');
    await fs.writeFile(docxPath, 'dummy');
    await storage.saveSpec(spec, docxPath);

    const comparison = makeComparison('spec-1');
    await storage.saveComparison(comparison);

    const comparisons = await storage.listComparisons('spec-1');
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].specId).toBe('spec-1');
    expect(comparisons[0].summary.total).toBe(3);
  });

  it('should return latest comparison', async () => {
    const spec = makeParsedSpec('spec-1');
    const docxPath = path.join(tmpDir, 'test.docx');
    await fs.writeFile(docxPath, 'dummy');
    await storage.saveSpec(spec, docxPath);

    const comp1 = makeComparison('spec-1');
    comp1.id = 'comp-1';
    comp1.timestamp = '2024-01-01T00:00:00.000Z';
    await storage.saveComparison(comp1);

    const comp2 = makeComparison('spec-1');
    comp2.id = 'comp-2';
    comp2.timestamp = '2024-06-01T00:00:00.000Z';
    await storage.saveComparison(comp2);

    const latest = await storage.getLatestComparison('spec-1');
    expect(latest).toBeDefined();
    // Latest should be the most recent by timestamp in filename (sorted reverse)
    expect(latest!.summary.total).toBe(3);
  });

  it('should manage config', async () => {
    await storage.initialize();

    const config = await storage.getConfig();
    expect(config.specs).toEqual([]);

    await storage.updateConfig({ lastActiveSpecId: 'test-id' });
    const updated = await storage.getConfig();
    expect(updated.lastActiveSpecId).toBe('test-id');
  });

  it('should handle get for non-existent spec', async () => {
    const result = await storage.getSpec('non-existent');
    expect(result).toBeUndefined();
  });

  it('should return empty comparisons for non-existent spec', async () => {
    const result = await storage.listComparisons('non-existent');
    expect(result).toEqual([]);
  });
});
