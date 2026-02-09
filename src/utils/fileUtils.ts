import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectInfo, ProjectType, ModuleInfo, ModuleType } from '../types.js';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'target', '__pycache__', '.venv', 'venv', '.gradle', '.idea',
  '.vscode', 'coverage', '.nyc_output', 'vendor', 'bin', 'obj',
]);

const IGNORED_EXTENSIONS = new Set([
  '.lock', '.map', '.min.js', '.min.css', '.ico', '.png', '.jpg',
  '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.docx', '.xlsx', '.zip', '.tar', '.gz',
]);

export async function getWorkspaceProjects(): Promise<ProjectInfo[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    console.log('[Spec Sync] No workspace folders found');
    return [];
  }

  console.log(`[Spec Sync] Detecting projects in ${workspaceFolders.length} workspace folder(s)`);

  const projects: ProjectInfo[] = [];

  for (const folder of workspaceFolders) {
    const rootPath = folder.uri.fsPath;
    console.log(`  - Scanning: ${folder.name} at ${rootPath}`);
    const projectType = await detectProjectType(rootPath);
    const deps = await readDependencies(rootPath, projectType);
    const entryPoints = await findEntryPoints(rootPath, projectType);
    const lang = getLanguageForType(projectType);

    console.log(`    Type: ${projectType}, Language: ${lang}, Entry points: ${entryPoints.length}`);

    projects.push({
      name: folder.name,
      path: rootPath,
      type: projectType,
      language: lang,
      dependencies: deps,
      entryPoints,
    });

    // Check for monorepo sub-projects
    const subProjects = await detectSubProjects(rootPath);
    if (subProjects.length > 0) {
      console.log(`    Found ${subProjects.length} sub-projects`);
    }
    projects.push(...subProjects);
  }

  console.log(`[Spec Sync] Total projects detected: ${projects.length}`);
  return projects;
}

export async function detectProjectType(rootPath: string): Promise<ProjectType> {
  const exists = async (file: string) => {
    try {
      await fs.access(path.join(rootPath, file));
      return true;
    } catch {
      return false;
    }
  };

  // Check for Docker/infra first
  if (await exists('docker-compose.yml') || await exists('docker-compose.yaml')) {
    if (!(await exists('package.json')) && !(await exists('pom.xml'))) {
      return 'infrastructure';
    }
  }

  // Check for package.json-based projects
  if (await exists('package.json')) {
    try {
      const content = await fs.readFile(path.join(rootPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps['react'] || allDeps['next'] || allDeps['vue'] || allDeps['@angular/core'] || allDeps['svelte']) {
        return 'react-frontend';
      }
      if (allDeps['express'] || allDeps['fastify'] || allDeps['@nestjs/core'] || allDeps['koa'] || allDeps['hapi']) {
        return 'node-backend';
      }
      // Default Node project
      return 'node-backend';
    } catch {
      return 'node-backend';
    }
  }

  if (await exists('pom.xml') || await exists('build.gradle') || await exists('build.gradle.kts')) {
    return 'java-spring';
  }

  if (await exists('requirements.txt') || await exists('pyproject.toml') || await exists('setup.py') || await exists('Pipfile')) {
    return 'python';
  }

  if (await exists('go.mod')) {
    return 'go';
  }

  if (await exists('Cargo.toml')) {
    return 'rust';
  }

  if (await exists('Program.cs') || await exists('*.csproj') || await exists('*.sln')) {
    return 'dotnet';
  }

  return 'unknown';
}

export async function getFileTree(rootPath: string, maxDepth: number = 6): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) { return; }

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') { continue; }

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) { continue; }
        const subPath = path.join(dir, entry.name);
        const relPath = path.relative(rootPath, subPath);
        files.push(relPath + '/');
        await walk(subPath, depth + 1);
      } else {
        const ext = path.extname(entry.name);
        if (IGNORED_EXTENSIONS.has(ext)) { continue; }
        const relPath = path.relative(rootPath, path.join(dir, entry.name));
        files.push(relPath);
      }
    }
  }

  await walk(rootPath, 0);
  return files;
}

export async function readFileContent(filePath: string, maxSize: number = 50000): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > maxSize) {
      const buffer = Buffer.alloc(maxSize);
      const fd = await fs.open(filePath, 'r');
      await fd.read(buffer, 0, maxSize, 0);
      await fd.close();
      return buffer.toString('utf-8') + '\n\n// ... [truncated]';
    }
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export async function getRelevantFiles(
  projectPath: string,
  category: ModuleType,
  projectType: ProjectType,
): Promise<string[]> {
  const patterns: Record<ModuleType, RegExp[]> = {
    routes: [
      /route/i, /router/i, /controller/i, /endpoint/i, /api/i,
      /\.controller\./i, /\.route\./i, /\.routes\./i,
    ],
    models: [
      /model/i, /entity/i, /schema/i, /dto/i, /type/i,
      /\.model\./i, /\.entity\./i, /\.schema\./i,
    ],
    services: [
      /service/i, /provider/i, /manager/i, /handler/i,
      /\.service\./i, /\.provider\./i,
    ],
    controllers: [
      /controller/i, /resolver/i, /\.controller\./i,
    ],
    utils: [
      /util/i, /helper/i, /lib/i, /common/i,
      /\.util\./i, /\.helper\./i,
    ],
    config: [
      /config/i, /\.env/i, /setting/i, /constant/i,
      /\.config\./i,
    ],
    tests: [
      /test/i, /spec/i, /\.test\./i, /\.spec\./i, /__test__/i,
    ],
    views: [
      /view/i, /component/i, /page/i, /screen/i, /template/i,
      /\.component\./i, /\.page\./i,
    ],
    other: [],
  };

  const fileTree = await getFileTree(projectPath, 4);
  const relevantPatterns = patterns[category] || [];
  if (relevantPatterns.length === 0) { return []; }

  return fileTree
    .filter(f => !f.endsWith('/'))
    .filter(f => relevantPatterns.some(p => p.test(f)))
    .map(f => path.join(projectPath, f))
    .slice(0, 20);
}

export function getStoragePath(workspaceFolder: vscode.WorkspaceFolder): string {
  const configPath = vscode.workspace.getConfiguration('specSync.history').get<string>('storagePath', '.vscode/spec-sync');
  return path.join(workspaceFolder.uri.fsPath, configPath);
}

export async function ensureStorageDir(storagePath: string): Promise<void> {
  await fs.mkdir(path.join(storagePath, 'specs'), { recursive: true });
}

export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

export async function getGitCommitHash(workspacePath: string): Promise<string | undefined> {
  try {
    const headPath = path.join(workspacePath, '.git', 'HEAD');
    const headContent = await fs.readFile(headPath, 'utf-8');
    const refMatch = headContent.trim().match(/^ref: (.+)$/);
    if (refMatch) {
      const refPath = path.join(workspacePath, '.git', refMatch[1]);
      const hash = await fs.readFile(refPath, 'utf-8');
      return hash.trim().substring(0, 7);
    }
    return headContent.trim().substring(0, 7);
  } catch {
    return undefined;
  }
}

export function getLanguageForType(projectType: ProjectType): string {
  const map: Record<ProjectType, string> = {
    'react-frontend': 'TypeScript/JavaScript',
    'node-backend': 'TypeScript/JavaScript',
    'java-spring': 'Java',
    'python': 'Python',
    'go': 'Go',
    'rust': 'Rust',
    'dotnet': 'C#',
    'infrastructure': 'YAML/Docker',
    'unknown': 'Unknown',
  };
  return map[projectType];
}

export function classifyModule(dirName: string): ModuleType {
  const lower = dirName.toLowerCase();
  if (/route|api|endpoint/.test(lower)) { return 'routes'; }
  if (/model|entity|schema|dto/.test(lower)) { return 'models'; }
  if (/service|provider/.test(lower)) { return 'services'; }
  if (/controller|resolver/.test(lower)) { return 'controllers'; }
  if (/util|helper|lib|common/.test(lower)) { return 'utils'; }
  if (/config|setting/.test(lower)) { return 'config'; }
  if (/test|spec|__test__/.test(lower)) { return 'tests'; }
  if (/view|component|page|screen|template/.test(lower)) { return 'views'; }
  return 'other';
}

export async function getModuleStructure(projectPath: string): Promise<ModuleInfo[]> {
  const modules: ModuleInfo[] = [];

  try {
    const srcPath = path.join(projectPath, 'src');
    const entries = await fs.readdir(srcPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
        const modulePath = path.join(srcPath, entry.name);
        const files = await getFileTree(modulePath, 2);
        modules.push({
          name: entry.name,
          path: path.relative(projectPath, modulePath),
          files: files.filter(f => !f.endsWith('/')),
          type: classifyModule(entry.name),
        });
      }
    }
  } catch {
    // No src directory, try top-level classification
    const fileTree = await getFileTree(projectPath, 2);
    const dirs = fileTree.filter(f => f.endsWith('/'));
    for (const dir of dirs) {
      const dirName = dir.replace(/\/$/, '');
      modules.push({
        name: dirName,
        path: dirName,
        files: fileTree.filter(f => f.startsWith(dirName) && !f.endsWith('/')),
        type: classifyModule(dirName),
      });
    }
  }

  return modules;
}

// --- Private helpers ---

async function readDependencies(rootPath: string, projectType: ProjectType): Promise<Record<string, string>> {
  try {
    if (projectType === 'react-frontend' || projectType === 'node-backend') {
      const content = await fs.readFile(path.join(rootPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      return { ...pkg.dependencies };
    }
    // Other project types: return empty for now
    return {};
  } catch {
    return {};
  }
}

async function findEntryPoints(rootPath: string, projectType: ProjectType): Promise<string[]> {
  const candidates: Record<ProjectType, string[]> = {
    'react-frontend': ['src/index.tsx', 'src/index.ts', 'src/main.tsx', 'src/main.ts', 'src/App.tsx', 'pages/index.tsx'],
    'node-backend': ['src/index.ts', 'src/main.ts', 'src/app.ts', 'src/server.ts', 'index.ts', 'index.js', 'app.ts', 'server.ts'],
    'java-spring': ['src/main/java/**/Application.java', 'src/main/java/**/Main.java'],
    'python': ['main.py', 'app.py', 'manage.py', 'wsgi.py'],
    'go': ['main.go', 'cmd/main.go'],
    'rust': ['src/main.rs', 'src/lib.rs'],
    'dotnet': ['Program.cs', 'Startup.cs'],
    'infrastructure': ['docker-compose.yml', 'Dockerfile'],
    'unknown': [],
  };

  const entries: string[] = [];
  for (const candidate of candidates[projectType] || []) {
    try {
      await fs.access(path.join(rootPath, candidate));
      entries.push(candidate);
    } catch {
      // skip
    }
  }
  return entries;
}

async function detectSubProjects(rootPath: string): Promise<ProjectInfo[]> {
  const subProjects: ProjectInfo[] = [];

  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      const subPath = path.join(rootPath, entry.name);
      const hasPackageJson = await fs.access(path.join(subPath, 'package.json')).then(() => true).catch(() => false);
      const hasPomXml = await fs.access(path.join(subPath, 'pom.xml')).then(() => true).catch(() => false);
      const hasGoMod = await fs.access(path.join(subPath, 'go.mod')).then(() => true).catch(() => false);

      if (hasPackageJson || hasPomXml || hasGoMod) {
        const projectType = await detectProjectType(subPath);
        const deps = await readDependencies(subPath, projectType);
        const entryPoints = await findEntryPoints(subPath, projectType);
        subProjects.push({
          name: entry.name,
          path: subPath,
          type: projectType,
          language: getLanguageForType(projectType),
          dependencies: deps,
          entryPoints,
        });
      }
    }
  } catch {
    // ignore
  }

  return subProjects;
}
