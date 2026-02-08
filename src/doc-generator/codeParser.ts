import * as fs from 'fs/promises';
import * as path from 'path';
import { CodeSymbol, RouteInfo, ModelInfo, ProjectType } from '../types.js';
import { getFileTree, readFileContent } from '../utils/fileUtils.js';

export async function extractSymbols(filePath: string): Promise<CodeSymbol[]> {
  const symbols: CodeSymbol[] = [];
  let content: string;
  try {
    content = await readFileContent(filePath);
  } catch {
    return symbols;
  }

  const lines = content.split('\n');
  const ext = path.extname(filePath);

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    extractTypeScriptSymbols(lines, filePath, symbols);
  } else if (ext === '.java') {
    extractJavaSymbols(lines, filePath, symbols);
  } else if (ext === '.py') {
    extractPythonSymbols(lines, filePath, symbols);
  } else if (ext === '.go') {
    extractGoSymbols(lines, filePath, symbols);
  }

  return symbols;
}

export async function extractRoutes(projectPath: string, projectType: ProjectType): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const fileTree = await getFileTree(projectPath, 4);

  const routeFiles = fileTree.filter(f => {
    if (f.endsWith('/')) { return false; }
    const lower = f.toLowerCase();
    return /route|controller|api|endpoint/.test(lower) &&
      /\.(ts|js|java|py|go)$/.test(lower);
  });

  for (const relPath of routeFiles.slice(0, 20)) {
    const fullPath = path.join(projectPath, relPath);
    const content = await readFileContent(fullPath);
    const lines = content.split('\n');

    if (projectType === 'node-backend' || projectType === 'react-frontend') {
      extractExpressRoutes(lines, relPath, routes);
      extractNestRoutes(lines, relPath, routes);
    } else if (projectType === 'java-spring') {
      extractSpringRoutes(lines, relPath, routes);
    }
  }

  return routes;
}

export async function extractModels(projectPath: string): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
  const fileTree = await getFileTree(projectPath, 4);

  const modelFiles = fileTree.filter(f => {
    if (f.endsWith('/')) { return false; }
    const lower = f.toLowerCase();
    return /model|entity|schema|dto/.test(lower) && /\.(ts|js|java|py)$/.test(lower);
  });

  for (const relPath of modelFiles.slice(0, 20)) {
    const fullPath = path.join(projectPath, relPath);
    const content = await readFileContent(fullPath);
    const lines = content.split('\n');
    const ext = path.extname(relPath);

    if (['.ts', '.js'].includes(ext)) {
      extractTSModels(lines, relPath, models);
    } else if (ext === '.java') {
      extractJavaModels(lines, relPath, models);
    }
  }

  return models;
}

// --- TypeScript/JavaScript extraction ---

function extractTypeScriptSymbols(lines: string[], filePath: string, symbols: CodeSymbol[]): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Classes
    const classMatch = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', filePath, line: i + 1, signature: line.trim() });
    }

    // Interfaces
    const ifaceMatch = line.match(/^(?:export\s+)?interface\s+(\w+)/);
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], kind: 'interface', filePath, line: i + 1, signature: line.trim() });
    }

    // Type aliases
    const typeMatch = line.match(/^(?:export\s+)?type\s+(\w+)/);
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: 'type', filePath, line: i + 1, signature: line.trim() });
    }

    // Functions
    const funcMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      symbols.push({ name: funcMatch[1], kind: 'function', filePath, line: i + 1, signature: line.trim() });
    }

    // Arrow functions (const)
    const arrowMatch = line.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/);
    if (arrowMatch) {
      symbols.push({ name: arrowMatch[1], kind: 'function', filePath, line: i + 1, signature: line.trim() });
    }

    // Enums
    const enumMatch = line.match(/^(?:export\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      symbols.push({ name: enumMatch[1], kind: 'enum', filePath, line: i + 1, signature: line.trim() });
    }
  }
}

function extractJavaSymbols(lines: string[], filePath: string, symbols: CodeSymbol[]): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const classMatch = line.match(/(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', filePath, line: i + 1, signature: line.trim() });
    }
    const ifaceMatch = line.match(/(?:public\s+)?interface\s+(\w+)/);
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], kind: 'interface', filePath, line: i + 1, signature: line.trim() });
    }
    const methodMatch = line.match(/(?:public|private|protected)\s+(?:static\s+)?(?:\w+\s+)(\w+)\s*\(/);
    if (methodMatch && !['if', 'for', 'while', 'switch', 'class'].includes(methodMatch[1])) {
      symbols.push({ name: methodMatch[1], kind: 'method', filePath, line: i + 1, signature: line.trim() });
    }
  }
}

function extractPythonSymbols(lines: string[], filePath: string, symbols: CodeSymbol[]): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', filePath, line: i + 1, signature: line.trim() });
    }
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)/);
    if (funcMatch) {
      symbols.push({ name: funcMatch[1], kind: 'function', filePath, line: i + 1, signature: line.trim() });
    }
  }
}

function extractGoSymbols(lines: string[], filePath: string, symbols: CodeSymbol[]): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const funcMatch = line.match(/^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/);
    if (funcMatch) {
      symbols.push({ name: funcMatch[1], kind: 'function', filePath, line: i + 1, signature: line.trim() });
    }
    const structMatch = line.match(/^type\s+(\w+)\s+struct/);
    if (structMatch) {
      symbols.push({ name: structMatch[1], kind: 'class', filePath, line: i + 1, signature: line.trim() });
    }
    const ifaceMatch = line.match(/^type\s+(\w+)\s+interface/);
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], kind: 'interface', filePath, line: i + 1, signature: line.trim() });
    }
  }
}

// --- Route extraction ---

function extractExpressRoutes(lines: string[], filePath: string, routes: RouteInfo[]): void {
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const method of methods) {
      const regex = new RegExp(`\\.(${method})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`);
      const match = line.match(regex);
      if (match) {
        routes.push({
          method: match[1].toUpperCase(),
          path: match[2],
          handler: '',
          filePath,
          line: i + 1,
        });
      }
    }
  }
}

function extractNestRoutes(lines: string[], filePath: string, routes: RouteInfo[]): void {
  let controllerPath = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const controllerMatch = line.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
    if (controllerMatch) {
      controllerPath = controllerMatch[1];
    }

    const decoratorMatch = line.match(/@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]?([^'"`)]*)['"`]?\s*\)/);
    if (decoratorMatch) {
      routes.push({
        method: decoratorMatch[1].toUpperCase(),
        path: `${controllerPath}/${decoratorMatch[2]}`.replace(/\/\//g, '/'),
        handler: '',
        filePath,
        line: i + 1,
      });
    }
  }
}

function extractSpringRoutes(lines: string[], filePath: string, routes: RouteInfo[]): void {
  let basePath = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const requestMapping = line.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
    if (requestMapping) {
      basePath = requestMapping[1];
    }

    const methodMapping = line.match(/@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*(?:value\s*=\s*)?["']?([^"')]*)/);
    if (methodMapping) {
      const method = methodMapping[1].replace('Mapping', '').toUpperCase();
      routes.push({
        method,
        path: `${basePath}/${methodMapping[2]}`.replace(/\/\//g, '/'),
        handler: '',
        filePath,
        line: i + 1,
      });
    }
  }
}

// --- Model extraction ---

function extractTSModels(lines: string[], filePath: string, models: ModelInfo[]): void {
  let currentModel: ModelInfo | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const classMatch = line.match(/(?:export\s+)?(?:class|interface|type)\s+(\w+(?:Entity|Model|Schema|Dto|DTO))\b/);
    if (classMatch) {
      currentModel = { name: classMatch[1], filePath, fields: [] };
      braceDepth = 0;
    }

    if (currentModel) {
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      const fieldMatch = line.match(/^\s+(?:readonly\s+)?(\w+)\s*[?:]?\s*:\s*(\w[\w<>\[\]|, ]*)/);
      if (fieldMatch && !['constructor', 'return', 'if', 'for'].includes(fieldMatch[1])) {
        currentModel.fields.push({ name: fieldMatch[1], type: fieldMatch[2].trim() });
      }

      if (braceDepth <= 0 && currentModel.fields.length > 0) {
        models.push(currentModel);
        currentModel = null;
      }
    }
  }

  if (currentModel && currentModel.fields.length > 0) {
    models.push(currentModel);
  }
}

function extractJavaModels(lines: string[], filePath: string, models: ModelInfo[]): void {
  let currentModel: ModelInfo | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const classMatch = line.match(/(?:public\s+)?class\s+(\w+)/);
    if (classMatch) {
      currentModel = { name: classMatch[1], filePath, fields: [] };
    }

    if (currentModel) {
      const fieldMatch = line.match(/^\s+private\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*;/);
      if (fieldMatch) {
        currentModel.fields.push({ name: fieldMatch[2], type: fieldMatch[1] });
      }

      if (line.trim() === '}' && currentModel.fields.length > 0) {
        models.push(currentModel);
        currentModel = null;
      }
    }
  }
}
