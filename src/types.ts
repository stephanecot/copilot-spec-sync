// ============================================================
// Core domain types for Copilot Spec Sync extension
// ============================================================

// === Specification Models ===

export interface ParsedSpec {
  id: string;
  title: string;
  version: string;
  uploadedAt: string; // ISO date
  filePath: string;
  sections: SpecSection[];
  requirementCount: number;
}

export interface SpecSection {
  id: string;
  title: string;
  level: number;
  content: string;
  requirements: Requirement[];
  subsections: SpecSection[];
}

export interface Requirement {
  id: string;
  text: string;
  type: RequirementType;
  priority: MoSCoWPriority;
  sectionId: string;
  status?: ComparisonStatus;
}

export type RequirementType = 'functional' | 'technical' | 'non-functional' | 'business-rule';
export type MoSCoWPriority = 'must' | 'should' | 'could' | 'wont';
export type ComparisonStatus = 'implemented' | 'partially-implemented' | 'not-implemented' | 'divergent';

// === Comparison Models ===

export interface ComparisonRecord {
  id: string;
  specId: string;
  timestamp: string; // ISO date
  specVersion: string;
  projectPaths: string[];
  summary: ComparisonSummary;
  details: RequirementComparison[];
  gitCommitHash?: string;
}

export interface ComparisonSummary {
  total: number;
  implemented: number;
  partial: number;
  notImplemented: number;
  divergent: number;
}

export interface RequirementComparison {
  requirementId: string;
  requirementText: string;
  status: ComparisonStatus;
  confidence: number;
  matchedFiles: FileMatch[];
  explanation: string;
  missingElements: string[];
  suggestedActions: string[];
  previousStatus?: ComparisonStatus;
  evolution: EvolutionType;
}

export type EvolutionType = 'new' | 'improved' | 'regressed' | 'unchanged';

export interface FileMatch {
  filePath: string;
  line?: number;
  snippet?: string;
}

// === Documentation Models ===

export interface ProjectInfo {
  name: string;
  path: string;
  type: ProjectType;
  language: string;
  dependencies: Record<string, string>;
  entryPoints: string[];
}

export type ProjectType =
  | 'react-frontend'
  | 'node-backend'
  | 'java-spring'
  | 'python'
  | 'go'
  | 'rust'
  | 'dotnet'
  | 'infrastructure'
  | 'unknown';

export interface ProjectAnalysis {
  projectInfo: ProjectInfo;
  fileTree: string[];
  keyFiles: { path: string; role: string }[];
  frameworks: string[];
  patterns: string[];
  moduleStructure: ModuleInfo[];
}

export interface ModuleInfo {
  name: string;
  path: string;
  files: string[];
  type: ModuleType;
}

export type ModuleType = 'routes' | 'models' | 'services' | 'controllers' | 'utils' | 'config' | 'tests' | 'views' | 'other';

export interface DocumentationSection {
  title: string;
  key: string;
  content: string;
  priority: number;
}

export interface GeneratedDocumentation {
  projectInfo: ProjectInfo;
  sections: DocumentationSection[];
  generatedAt: string; // ISO date
  mermaidDiagrams?: string[];
}

// === Code Parsing Models ===

export interface CodeSymbol {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  children?: CodeSymbol[];
  signature?: string;
}

export interface RouteInfo {
  method: string;
  path: string;
  handler: string;
  filePath: string;
  line: number;
  parameters?: string[];
}

export interface ModelInfo {
  name: string;
  filePath: string;
  fields: { name: string; type: string }[];
  relations?: string[];
}

// === Storage Models ===

export interface SpecSyncConfig {
  lastActiveSpecId?: string;
  specs: SpecMetadata[];
}

export interface SpecMetadata {
  id: string;
  title: string;
  version: string;
  uploadedAt: string;
  filePath: string;
  comparisonCount: number;
  requirementCount?: number;
  lastComparisonAt?: string;
  previousVersionId?: string;
}

// === History Models ===

export interface SnapshotDiff {
  newlyImplemented: RequirementComparison[];
  regressions: RequirementComparison[];
  stillMissing: RequirementComparison[];
  improved: RequirementComparison[];
  unchanged: RequirementComparison[];
}

export interface TrendData {
  dataPoints: { date: string; implementedPct: number; total: number }[];
  direction: 'improving' | 'stable' | 'declining';
  velocity: number;
}

// === Implementation Proposal Models ===

export interface ImplementationProposal {
  requirementId: string;
  requirementText: string;
  filesToCreate: { path: string; description: string; suggestedContent?: string }[];
  filesToModify: { path: string; changes: string }[];
  architecturalNotes: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

// === DOCX Reader Models ===

export interface DocxContent {
  html: string;
  text: string;
  messages: string[];
}

// === LM Tool Input Models ===

export interface AnalyzeProjectInput {
  path: string;
}

export interface CompareRequirementInput {
  requirementText: string;
  filePaths: string[];
}

export interface GenerateCodeInput {
  requirementId: string;
  requirementText: string;
  projectPath: string;
  context?: string;
}
