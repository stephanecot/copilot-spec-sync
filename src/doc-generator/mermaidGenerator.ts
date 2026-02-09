import { ProjectAnalysis, ComparisonRecord, ComparisonSummary, ModuleInfo } from '../types.js';

/**
 * Generate a Mermaid architecture diagram from project analysis.
 */
export function generateArchitectureDiagram(analysis: ProjectAnalysis): string {
  const lines: string[] = ['graph TD'];

  const modules = analysis.moduleStructure;
  if (modules.length === 0) {
    lines.push('  A[No modules detected]');
    return lines.join('\n');
  }

  // Group modules by type
  const typeGroups = new Map<string, ModuleInfo[]>();
  for (const mod of modules) {
    const group = typeGroups.get(mod.type) || [];
    group.push(mod);
    typeGroups.set(mod.type, group);
  }

  // Define typical architectural flow
  const flowOrder = ['routes', 'controllers', 'services', 'models', 'utils', 'config', 'views'];

  let nodeId = 0;
  const moduleNodes = new Map<string, string>();

  // Create subgraphs for each type
  for (const type of flowOrder) {
    const group = typeGroups.get(type);
    if (!group || group.length === 0) { continue; }

    lines.push(`  subgraph ${capitalize(type)}`);
    for (const mod of group) {
      const id = `n${nodeId++}`;
      moduleNodes.set(mod.name, id);
      lines.push(`    ${id}["${mod.name} (${mod.files.length} files)"]`);
    }
    lines.push('  end');
  }

  // Handle remaining types
  for (const [type, group] of typeGroups) {
    if (flowOrder.includes(type)) { continue; }
    lines.push(`  subgraph ${capitalize(type)}`);
    for (const mod of group) {
      const id = `n${nodeId++}`;
      moduleNodes.set(mod.name, id);
      lines.push(`    ${id}["${mod.name} (${mod.files.length} files)"]`);
    }
    lines.push('  end');
  }

  // Add typical flow edges
  const edges: [string, string][] = [
    ['routes', 'controllers'],
    ['controllers', 'services'],
    ['services', 'models'],
    ['routes', 'services'],
    ['services', 'utils'],
  ];

  for (const [from, to] of edges) {
    const fromGroup = typeGroups.get(from);
    const toGroup = typeGroups.get(to);
    if (!fromGroup || !toGroup) { continue; }

    // Connect first module of each group
    const fromId = moduleNodes.get(fromGroup[0].name);
    const toId = moduleNodes.get(toGroup[0].name);
    if (fromId && toId) {
      lines.push(`  ${fromId} --> ${toId}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a Mermaid module diagram showing the file structure.
 */
export function generateModuleDiagram(modules: ModuleInfo[]): string {
  const lines: string[] = ['graph LR'];

  if (modules.length === 0) {
    lines.push('  A[No modules]');
    return lines.join('\n');
  }

  let nodeId = 0;
  for (const mod of modules) {
    const modId = `m${nodeId++}`;
    lines.push(`  ${modId}{"${mod.name}<br/>${mod.type}<br/>${mod.files.length} files"}`);

    const maxFiles = Math.min(mod.files.length, 5);
    for (let i = 0; i < maxFiles; i++) {
      const fileId = `f${nodeId++}`;
      const fileName = mod.files[i].split('/').pop() || mod.files[i];
      lines.push(`  ${modId} --- ${fileId}["${fileName}"]`);
    }

    if (mod.files.length > 5) {
      const moreId = `f${nodeId++}`;
      lines.push(`  ${modId} --- ${moreId}["... +${mod.files.length - 5} more"]`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a Mermaid pie chart for compliance status.
 */
export function generateComplianceDiagram(comparison: ComparisonRecord): string {
  const s = comparison.summary;
  const lines: string[] = [
    '  pie title Requirements Compliance',
  ];

  if (s.implemented > 0) {
    lines.push(`    "Implemented" : ${s.implemented}`);
  }
  if (s.partial > 0) {
    lines.push(`    "Partial" : ${s.partial}`);
  }
  if (s.notImplemented > 0) {
    lines.push(`    "Not Implemented" : ${s.notImplemented}`);
  }
  if (s.divergent > 0) {
    lines.push(`    "Divergent" : ${s.divergent}`);
  }

  return lines.join('\n');
}

/**
 * Generate a Mermaid timeline of compliance evolution.
 */
export function generateEvolutionDiagram(
  dataPoints: { date: string; implementedPct: number }[],
): string {
  if (dataPoints.length === 0) {
    return 'graph TD\n  A[No history data]';
  }

  const lines: string[] = ['xychart-beta', '  title "Compliance Evolution"', '  x-axis ['];

  const labels = dataPoints.map(dp => {
    const date = new Date(dp.date);
    return `"${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}"`;
  });
  lines.push(`    ${labels.join(', ')}`);
  lines.push('  ]');
  lines.push('  y-axis "Compliance (%)" 0 --> 100');
  lines.push(`  line [${dataPoints.map(dp => dp.implementedPct).join(', ')}]`);

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
