import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectAnalysis, ProjectInfo, ModuleInfo } from '../types.js';
import { detectProjectType, getFileTree, getModuleStructure, getLanguageForType } from '../utils/fileUtils.js';

export async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const projectType = await detectProjectType(projectPath);
  const language = getLanguageForType(projectType);
  const fileTree = await getFileTree(projectPath);
  const moduleStructure = await getModuleStructure(projectPath);
  const entryPoints = await findEntryPoints(projectPath, projectType);
  const dependencies = await readDependencies(projectPath, projectType);
  const keyFiles = identifyKeyFiles(fileTree, projectType);
  const frameworks = detectFrameworks(dependencies);
  const patterns = detectPatterns(moduleStructure, fileTree);

  const projectInfo: ProjectInfo = {
    name: path.basename(projectPath),
    path: projectPath,
    type: projectType,
    language,
    dependencies,
    entryPoints,
  };

  return {
    projectInfo,
    fileTree,
    keyFiles,
    frameworks,
    patterns,
    moduleStructure,
  };
}

function identifyKeyFiles(fileTree: string[], _projectType: string): { path: string; role: string }[] {
  const keyFiles: { path: string; role: string }[] = [];

  for (const file of fileTree) {
    if (file.endsWith('/')) { continue; }
    const name = file.split('/').pop()?.toLowerCase() || '';

    if (name === 'package.json' || name === 'pom.xml' || name === 'go.mod' || name === 'cargo.toml') {
      keyFiles.push({ path: file, role: 'manifest' });
    } else if (name === 'readme.md' || name === 'readme.txt') {
      keyFiles.push({ path: file, role: 'readme' });
    } else if (/^(index|main|app|server)\.(ts|js|tsx|jsx|py|go|rs|java|cs)$/.test(name)) {
      keyFiles.push({ path: file, role: 'entry' });
    } else if (name === 'dockerfile' || name === 'docker-compose.yml' || name === 'docker-compose.yaml') {
      keyFiles.push({ path: file, role: 'docker' });
    } else if (/\.(env|env\.example|env\.sample)$/.test(name)) {
      keyFiles.push({ path: file, role: 'env' });
    } else if (/^(tsconfig|webpack|vite|rollup|babel)\.(json|config\..*)$/.test(name)) {
      keyFiles.push({ path: file, role: 'build-config' });
    }
  }

  return keyFiles;
}

function detectFrameworks(dependencies: Record<string, string>): string[] {
  const frameworks: string[] = [];
  const depNames = Object.keys(dependencies);

  const frameworkMap: Record<string, string> = {
    'react': 'React',
    'next': 'Next.js',
    'vue': 'Vue.js',
    'nuxt': 'Nuxt',
    '@angular/core': 'Angular',
    'svelte': 'Svelte',
    'express': 'Express',
    'fastify': 'Fastify',
    '@nestjs/core': 'NestJS',
    'koa': 'Koa',
    'hapi': 'Hapi',
    'prisma': 'Prisma',
    'typeorm': 'TypeORM',
    'sequelize': 'Sequelize',
    'mongoose': 'Mongoose',
    'jest': 'Jest',
    'vitest': 'Vitest',
    'mocha': 'Mocha',
    'tailwindcss': 'Tailwind CSS',
    'redux': 'Redux',
    'mobx': 'MobX',
    'zustand': 'Zustand',
  };

  for (const dep of depNames) {
    if (frameworkMap[dep]) {
      frameworks.push(frameworkMap[dep]);
    }
  }

  return frameworks;
}

function detectPatterns(modules: ModuleInfo[], fileTree: string[]): string[] {
  const patterns: string[] = [];

  const hasControllers = modules.some(m => m.type === 'controllers');
  const hasModels = modules.some(m => m.type === 'models');
  const hasServices = modules.some(m => m.type === 'services');
  const hasViews = modules.some(m => m.type === 'views');
  const hasRoutes = modules.some(m => m.type === 'routes');

  if (hasControllers && hasModels && hasViews) {
    patterns.push('MVC');
  } else if (hasControllers && hasModels && hasServices) {
    patterns.push('Service Layer');
  }

  if (hasRoutes && hasControllers) {
    patterns.push('REST API');
  }

  const hasDockerCompose = fileTree.some(f => f.includes('docker-compose'));
  const hasMultiplePackageJson = fileTree.filter(f => f.endsWith('package.json')).length > 1;

  if (hasDockerCompose && hasMultiplePackageJson) {
    patterns.push('Microservices');
  } else if (hasMultiplePackageJson) {
    patterns.push('Monorepo');
  }

  if (fileTree.some(f => /middleware/i.test(f))) {
    patterns.push('Middleware Pipeline');
  }

  return patterns;
}

async function findEntryPoints(rootPath: string, projectType: string): Promise<string[]> {
  const candidates: Record<string, string[]> = {
    'react-frontend': ['src/index.tsx', 'src/index.ts', 'src/main.tsx', 'src/main.ts', 'src/App.tsx'],
    'node-backend': ['src/index.ts', 'src/main.ts', 'src/app.ts', 'src/server.ts', 'index.ts', 'index.js'],
    'java-spring': ['src/main/java'],
    'python': ['main.py', 'app.py', 'manage.py'],
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

async function readDependencies(rootPath: string, projectType: string): Promise<Record<string, string>> {
  try {
    if (projectType === 'react-frontend' || projectType === 'node-backend') {
      const content = await fs.readFile(path.join(rootPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      return { ...pkg.dependencies, ...pkg.devDependencies };
    }
    return {};
  } catch {
    return {};
  }
}
