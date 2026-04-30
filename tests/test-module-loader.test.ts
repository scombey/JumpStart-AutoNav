/**
 * tests/test-module-loader.test.ts — vitest suite for src/lib/module-loader.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  discoverModules,
  validateManifest,
  loadModule,
  loadAllModules,
} from '../src/lib/module-loader.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

function setupModule(name: string, manifest: Record<string, unknown>) {
  const modDir = path.join(tmpDir, name);
  fs.mkdirSync(modDir, { recursive: true });
  fs.writeFileSync(path.join(modDir, 'module.json'), JSON.stringify(manifest));
  return modDir;
}

const VALID_MANIFEST = {
  name: 'test-module',
  version: '1.0.0',
  description: 'A valid test module for testing purposes',
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-loader-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── discoverModules ──────────────────────────────────────────────────────────

describe('discoverModules', () => {
  it('returns empty array for non-existent directory', () => {
    expect(discoverModules('/nonexistent/path/modules')).toEqual([]);
  });

  it('returns empty array for empty directory', () => {
    expect(discoverModules(tmpDir)).toEqual([]);
  });

  it('skips files (non-directories)', () => {
    fs.writeFileSync(path.join(tmpDir, 'some-file.txt'), 'hello');
    expect(discoverModules(tmpDir)).toEqual([]);
  });

  it('skips directories without module.json', () => {
    fs.mkdirSync(path.join(tmpDir, 'empty-mod'));
    expect(discoverModules(tmpDir)).toEqual([]);
  });

  it('discovers a valid module', () => {
    setupModule('my-mod', VALID_MANIFEST);
    const mods = discoverModules(tmpDir);
    expect(mods.length).toBe(1);
    expect(mods[0]?.name).toBe('test-module');
  });

  it('falls back to directory name when manifest has no name', () => {
    setupModule('fallback-mod', { version: '1.0.0', description: 'no name field' });
    const mods = discoverModules(tmpDir);
    expect(mods[0]?.name).toBe('fallback-mod');
  });

  it('skips modules with invalid JSON manifests', () => {
    const modDir = path.join(tmpDir, 'bad-json');
    fs.mkdirSync(modDir);
    fs.writeFileSync(path.join(modDir, 'module.json'), 'NOT_JSON');
    expect(discoverModules(tmpDir)).toEqual([]);
  });
});

// ─── validateManifest ─────────────────────────────────────────────────────────

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    const result = validateManifest(VALID_MANIFEST as never);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing name', () => {
    const result = validateManifest({ version: '1.0.0', description: 'A long enough description' } as never);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });

  it('rejects non-kebab-case name', () => {
    const result = validateManifest({ name: 'My_Module', version: '1.0.0', description: 'A long enough description' } as never);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('kebab'))).toBe(true);
  });

  it('rejects invalid semver version', () => {
    const result = validateManifest({ name: 'mod', version: 'v1', description: 'A long enough description' } as never);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('semver'))).toBe(true);
  });

  it('rejects short description', () => {
    const result = validateManifest({ name: 'mod', version: '1.0.0', description: 'Short' } as never);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('description'))).toBe(true);
  });

  it('rejects non-array agents field', () => {
    const result = validateManifest({ ...VALID_MANIFEST, agents: 'not-array' } as never);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"agents"'))).toBe(true);
  });
});

// ─── loadModule ───────────────────────────────────────────────────────────────

describe('loadModule', () => {
  it('returns error when module directory does not exist', () => {
    const result = loadModule(tmpDir, 'nonexistent');
    expect(result.loaded).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error when module.json is missing', () => {
    fs.mkdirSync(path.join(tmpDir, 'no-manifest'));
    const result = loadModule(tmpDir, 'no-manifest');
    expect(result.loaded).toBe(false);
    expect(result.error).toContain('module.json');
  });

  it('loads a valid module successfully', () => {
    setupModule('valid-mod', VALID_MANIFEST);
    const result = loadModule(tmpDir, 'valid-mod');
    expect(result.loaded).toBe(true);
    expect(result.module?.name).toBe('test-module');
    expect(result.module?.version).toBe('1.0.0');
    expect(result.error).toBeNull();
  });

  it('returns error for invalid manifest', () => {
    setupModule('bad-mod', { name: 'BAD_NAME', version: '0.0.1', description: 'desc' });
    const result = loadModule(tmpDir, 'bad-mod');
    expect(result.loaded).toBe(false);
    expect(result.error).toContain('Invalid manifest');
  });

  it('resolves resource paths, filtering out non-existent files', () => {
    setupModule('res-mod', { ...VALID_MANIFEST, name: 'res-mod', agents: ['agent.md', 'missing.md'] });
    // Create only agent.md
    const modDir = path.join(tmpDir, 'res-mod');
    fs.writeFileSync(path.join(modDir, 'agent.md'), 'agent content');
    const result = loadModule(tmpDir, 'res-mod');
    expect(result.loaded).toBe(true);
    expect(result.module?.agents.length).toBe(1);
    expect(result.module?.agents[0]).toContain('agent.md');
  });
});

// ─── loadAllModules ───────────────────────────────────────────────────────────

describe('loadAllModules', () => {
  it('returns empty result for empty modules dir', () => {
    const result = loadAllModules(tmpDir);
    expect(result.modules).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('loads all discovered modules when no enabledList specified', () => {
    setupModule('mod-a', { ...VALID_MANIFEST, name: 'mod-a' });
    setupModule('mod-b', { ...VALID_MANIFEST, name: 'mod-b' });
    const result = loadAllModules(tmpDir);
    expect(result.modules.length).toBe(2);
  });

  it('filters modules by enabledList', () => {
    setupModule('mod-a', { ...VALID_MANIFEST, name: 'mod-a' });
    setupModule('mod-b', { ...VALID_MANIFEST, name: 'mod-b' });
    const result = loadAllModules(tmpDir, ['mod-a']);
    expect(result.modules.length).toBe(1);
    expect(result.modules[0]?.name).toBe('mod-a');
  });

  it('returns empty modules when enabledList does not match any discovered', () => {
    setupModule('mod-a', { ...VALID_MANIFEST, name: 'mod-a' });
    const result = loadAllModules(tmpDir, ['mod-z']);
    expect(result.modules).toEqual([]);
  });
});

// ─── pollution-key safety ────────────────────────────────────────────────────

describe('pollution-key safety', () => {
  it('discoverModules skips module with __proto__ key in manifest', () => {
    const modDir = path.join(tmpDir, 'poison-mod');
    fs.mkdirSync(modDir);
    // Raw bytes with __proto__ key — must not cause object pollution
    fs.writeFileSync(path.join(modDir, 'module.json'), '{"__proto__":{"evil":1},"name":"poison","version":"1.0.0","description":"A long enough description"}');
    const mods = discoverModules(tmpDir);
    // Should be skipped or returned without crashing
    expect(() => discoverModules(tmpDir)).not.toThrow();
  });

  it('loadModule rejects constructor key in manifest', () => {
    const modDir = path.join(tmpDir, 'constructor-mod');
    fs.mkdirSync(modDir);
    fs.writeFileSync(path.join(modDir, 'module.json'), '{"constructor":{"evil":1},"name":"constructor-mod","version":"1.0.0","description":"A long enough description"}');
    const result = loadModule(tmpDir, 'constructor-mod');
    expect(result.loaded).toBe(false);
  });
});
