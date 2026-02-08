import { describe, it, expect } from 'vitest';
import { generateId, getLanguageForType, classifyModule } from '../../src/utils/fileUtils.js';

describe('generateId', () => {
  it('should return a non-empty string', () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('should contain a dash separator', () => {
    const id = generateId();
    expect(id).toContain('-');
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('getLanguageForType', () => {
  it('should return TypeScript/JavaScript for react-frontend', () => {
    expect(getLanguageForType('react-frontend')).toBe('TypeScript/JavaScript');
  });

  it('should return TypeScript/JavaScript for node-backend', () => {
    expect(getLanguageForType('node-backend')).toBe('TypeScript/JavaScript');
  });

  it('should return Java for java-spring', () => {
    expect(getLanguageForType('java-spring')).toBe('Java');
  });

  it('should return Python for python', () => {
    expect(getLanguageForType('python')).toBe('Python');
  });

  it('should return Go for go', () => {
    expect(getLanguageForType('go')).toBe('Go');
  });

  it('should return Rust for rust', () => {
    expect(getLanguageForType('rust')).toBe('Rust');
  });

  it('should return C# for dotnet', () => {
    expect(getLanguageForType('dotnet')).toBe('C#');
  });

  it('should return Unknown for unknown', () => {
    expect(getLanguageForType('unknown')).toBe('Unknown');
  });
});

describe('classifyModule', () => {
  it('should classify route directories', () => {
    expect(classifyModule('routes')).toBe('routes');
    expect(classifyModule('api')).toBe('routes');
    expect(classifyModule('endpoints')).toBe('routes');
  });

  it('should classify model directories', () => {
    expect(classifyModule('models')).toBe('models');
    expect(classifyModule('entity')).toBe('models');
    expect(classifyModule('schema')).toBe('models');
    expect(classifyModule('dto')).toBe('models');
  });

  it('should classify service directories', () => {
    expect(classifyModule('services')).toBe('services');
    expect(classifyModule('providers')).toBe('services');
  });

  it('should classify controller directories', () => {
    expect(classifyModule('controllers')).toBe('controllers');
  });

  it('should classify utils directories', () => {
    expect(classifyModule('utils')).toBe('utils');
    expect(classifyModule('helpers')).toBe('utils');
    expect(classifyModule('lib')).toBe('utils');
    expect(classifyModule('common')).toBe('utils');
  });

  it('should classify config directories', () => {
    expect(classifyModule('config')).toBe('config');
    expect(classifyModule('settings')).toBe('config');
  });

  it('should classify test directories', () => {
    expect(classifyModule('test')).toBe('tests');
    expect(classifyModule('spec')).toBe('tests');
    expect(classifyModule('__test__')).toBe('tests');
  });

  it('should classify view directories', () => {
    expect(classifyModule('views')).toBe('views');
    expect(classifyModule('components')).toBe('views');
    expect(classifyModule('pages')).toBe('views');
  });

  it('should return other for unrecognized names', () => {
    expect(classifyModule('random')).toBe('other');
    expect(classifyModule('foobar')).toBe('other');
  });
});
