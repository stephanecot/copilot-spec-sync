import * as fs from 'fs/promises';
import * as path from 'path';
import { ParsedSpec, ComparisonRecord, SpecSyncConfig, SpecMetadata } from '../types.js';

export class StorageManager {
  constructor(private storagePath: string) {}

  async initialize(): Promise<void> {
    await fs.mkdir(path.join(this.storagePath, 'specs'), { recursive: true });
    try {
      await fs.access(path.join(this.storagePath, 'config.json'));
    } catch {
      const defaultConfig: SpecSyncConfig = { specs: [] };
      await fs.writeFile(
        path.join(this.storagePath, 'config.json'),
        JSON.stringify(defaultConfig, null, 2),
        'utf-8',
      );
    }
  }

  // --- Spec management ---

  async saveSpec(spec: ParsedSpec, originalFilePath: string): Promise<void> {
    await this.initialize();

    const specDir = this.getSpecDir(spec.id);
    await fs.mkdir(path.join(specDir, 'comparisons'), { recursive: true });

    // Copy original file preserving its extension
    const ext = path.extname(originalFilePath) || '.docx';
    await fs.copyFile(originalFilePath, path.join(specDir, `original${ext}`));

    // Save parsed spec
    await fs.writeFile(
      path.join(specDir, 'parsed.json'),
      JSON.stringify(spec, null, 2),
      'utf-8',
    );

    // Save metadata
    const metadata: SpecMetadata = {
      id: spec.id,
      title: spec.title,
      version: spec.version,
      uploadedAt: spec.uploadedAt,
      filePath: `specs/${spec.id}`,
      comparisonCount: 0,
      requirementCount: spec.requirementCount,
    };
    await fs.writeFile(
      path.join(specDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8',
    );

    // Update config
    const config = await this.getConfig();
    config.specs = config.specs.filter(s => s.id !== spec.id);
    config.specs.push(metadata);
    config.lastActiveSpecId = spec.id;
    await this.writeConfig(config);
  }

  async getSpec(specId: string): Promise<ParsedSpec | undefined> {
    try {
      const content = await fs.readFile(
        path.join(this.getSpecDir(specId), 'parsed.json'),
        'utf-8',
      );
      return JSON.parse(content) as ParsedSpec;
    } catch {
      return undefined;
    }
  }

  async listSpecs(): Promise<SpecMetadata[]> {
    const config = await this.getConfig();
    return config.specs;
  }

  async deleteSpec(specId: string): Promise<void> {
    try {
      await fs.rm(this.getSpecDir(specId), { recursive: true, force: true });
    } catch {
      // ignore
    }

    const config = await this.getConfig();
    config.specs = config.specs.filter(s => s.id !== specId);
    if (config.lastActiveSpecId === specId) {
      config.lastActiveSpecId = config.specs[0]?.id;
    }
    await this.writeConfig(config);
  }

  // --- Comparison management ---

  async saveComparison(comparison: ComparisonRecord): Promise<void> {
    await this.initialize();

    const comparisonsDir = this.getComparisonsDir(comparison.specId);
    await fs.mkdir(comparisonsDir, { recursive: true });

    const timestamp = comparison.timestamp.replace(/:/g, '-');
    const filePath = path.join(comparisonsDir, `${timestamp}.json`);
    await fs.writeFile(filePath, JSON.stringify(comparison, null, 2), 'utf-8');

    // Update metadata
    const config = await this.getConfig();
    const specMeta = config.specs.find(s => s.id === comparison.specId);
    if (specMeta) {
      specMeta.comparisonCount = (specMeta.comparisonCount || 0) + 1;
      specMeta.lastComparisonAt = comparison.timestamp;
      await this.writeConfig(config);
    }
  }

  async getComparison(specId: string, comparisonId: string): Promise<ComparisonRecord | undefined> {
    const comparisons = await this.listComparisons(specId);
    return comparisons.find(c => c.id === comparisonId);
  }

  async listComparisons(specId: string): Promise<ComparisonRecord[]> {
    const comparisonsDir = this.getComparisonsDir(specId);
    const comparisons: ComparisonRecord[] = [];

    try {
      const files = await fs.readdir(comparisonsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(comparisonsDir, file), 'utf-8');
          comparisons.push(JSON.parse(content) as ComparisonRecord);
        } catch {
          // skip corrupted files
        }
      }
    } catch {
      // comparisons dir doesn't exist
    }

    return comparisons;
  }

  async getLatestComparison(specId: string): Promise<ComparisonRecord | undefined> {
    const comparisons = await this.listComparisons(specId);
    return comparisons[0];
  }

  async getLatestComparisonForAnySpec(): Promise<ComparisonRecord | undefined> {
    const config = await this.getConfig();
    let latest: ComparisonRecord | undefined;

    for (const spec of config.specs) {
      const comparison = await this.getLatestComparison(spec.id);
      if (comparison) {
        if (!latest || comparison.timestamp > latest.timestamp) {
          latest = comparison;
        }
      }
    }

    return latest;
  }

  // --- Config ---

  async getConfig(): Promise<SpecSyncConfig> {
    try {
      const content = await fs.readFile(
        path.join(this.storagePath, 'config.json'),
        'utf-8',
      );
      return JSON.parse(content) as SpecSyncConfig;
    } catch {
      return { specs: [] };
    }
  }

  async updateConfig(updates: Partial<SpecSyncConfig>): Promise<void> {
    const config = await this.getConfig();
    Object.assign(config, updates);
    await this.writeConfig(config);
  }

  // --- Helpers ---

  getSpecDir(specId: string): string {
    return path.join(this.storagePath, 'specs', specId);
  }

  getComparisonsDir(specId: string): string {
    return path.join(this.getSpecDir(specId), 'comparisons');
  }

  private async writeConfig(config: SpecSyncConfig): Promise<void> {
    await fs.writeFile(
      path.join(this.storagePath, 'config.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );
  }
}
