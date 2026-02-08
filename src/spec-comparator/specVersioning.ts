import { StorageManager } from './storageManager.js';
import { ParsedSpec, SpecMetadata } from '../types.js';

/**
 * Detect version string from spec title or content.
 * Looks for patterns like "v1.0", "version 2.3", "V1.0.0" etc.
 */
export function detectVersion(spec: ParsedSpec): string {
  // Check title first
  const titleMatch = spec.title.match(/v(?:ersion)?\s*(\d+(?:\.\d+)*)/i);
  if (titleMatch) {
    return titleMatch[1];
  }

  // Check first section content
  for (const section of spec.sections) {
    const contentMatch = section.content.match(/version\s*[:\s]\s*(\d+(?:\.\d+)*)/i);
    if (contentMatch) {
      return contentMatch[1];
    }
  }

  return spec.version || '1.0';
}

/**
 * Check if a spec with the same title already exists.
 * Returns the existing spec metadata if found.
 */
export async function findExistingSpec(
  storage: StorageManager,
  title: string,
): Promise<SpecMetadata | undefined> {
  const specs = await storage.listSpecs();
  const normalizedTitle = title.toLowerCase().replace(/\s+/g, ' ').trim();

  return specs.find(s => {
    const existingTitle = s.title.toLowerCase().replace(/\s+/g, ' ').trim();
    return existingTitle === normalizedTitle;
  });
}

/**
 * Create a new version of an existing spec, linking to the previous version.
 */
export async function createNewVersion(
  storage: StorageManager,
  previousSpecId: string,
  newSpec: ParsedSpec,
  originalDocxPath: string,
): Promise<void> {
  // Set the previousVersionId link
  const config = await storage.getConfig();
  const prevMeta = config.specs.find(s => s.id === previousSpecId);

  // Save spec normally
  await storage.saveSpec(newSpec, originalDocxPath);

  // Update metadata to link to previous version
  if (prevMeta) {
    const updatedConfig = await storage.getConfig();
    const newMeta = updatedConfig.specs.find(s => s.id === newSpec.id);
    if (newMeta) {
      newMeta.previousVersionId = previousSpecId;
      await storage.updateConfig(updatedConfig);
    }
  }
}

/**
 * Get the version history chain for a spec.
 * Returns specs from newest to oldest.
 */
export async function getVersionHistory(
  storage: StorageManager,
  specId: string,
): Promise<SpecMetadata[]> {
  const config = await storage.getConfig();
  const chain: SpecMetadata[] = [];

  // Find the spec and walk backward through versions
  let currentId: string | undefined = specId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const meta = config.specs.find(s => s.id === currentId);
    if (!meta) { break; }

    chain.push(meta);
    currentId = meta.previousVersionId;
  }

  return chain;
}
