/**
 * test-reference-architectures.test.ts — M11 batch 5 port coverage.
 *
 * Verifies the TS port at `src/lib/reference-architectures.ts` matches
 * the legacy `bin/lib/reference-architectures.js` public surface:
 *   - BUILTIN_PATTERNS shape (4 entries with required fields)
 *   - PATTERN_CATEGORIES list
 *   - defaultRegistry includes built-ins
 *   - loadRegistry / saveRegistry round-trip + defaultState fallback
 *   - listPatterns: all + by-category filter
 *   - getPattern: built-in + unknown
 *   - registerPattern: validation, duplicate-id, category-normalize
 *   - instantiatePattern: directory creation, README writes,
 *     skip-existing, traversal-defense
 *   - M3 hardening: pollution-key registry payloads fall back to default
 *
 * @see src/lib/reference-architectures.ts
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_PATTERNS,
  defaultRegistry,
  getPattern,
  instantiatePattern,
  listPatterns,
  loadRegistry,
  PATTERN_CATEGORIES,
  registerPattern,
  saveRegistry,
} from '../src/lib/reference-architectures.js';

let tmpDir: string;
let registryFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reference-architectures-'));
  mkdirSync(join(tmpDir, '.jumpstart'), { recursive: true });
  registryFile = join(tmpDir, '.jumpstart', 'reference-architectures.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('reference-architectures — BUILTIN_PATTERNS', () => {
  it('exposes 4 built-in patterns', () => {
    expect(BUILTIN_PATTERNS.length).toBe(4);
  });

  it('includes rag-pipeline, agent-app, api-platform, event-driven', () => {
    const ids = BUILTIN_PATTERNS.map((p) => p.id);
    expect(ids).toContain('rag-pipeline');
    expect(ids).toContain('agent-app');
    expect(ids).toContain('api-platform');
    expect(ids).toContain('event-driven');
  });

  it('each pattern has required fields', () => {
    for (const p of BUILTIN_PATTERNS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(Array.isArray(p.components)).toBe(true);
      expect(Array.isArray(p.tech_stack.suggested)).toBe(true);
      expect(Array.isArray(p.nfrs)).toBe(true);
    }
  });
});

describe('reference-architectures — PATTERN_CATEGORIES', () => {
  it('contains 9 canonical categories', () => {
    expect(PATTERN_CATEGORIES.length).toBe(9);
    expect(PATTERN_CATEGORIES).toContain('api-platform');
    expect(PATTERN_CATEGORIES).toContain('event-driven');
    expect(PATTERN_CATEGORIES).toContain('rag');
    expect(PATTERN_CATEGORIES).toContain('agent-app');
    expect(PATTERN_CATEGORIES).toContain('other');
  });
});

describe('reference-architectures — defaultRegistry', () => {
  it('includes all built-in patterns', () => {
    const r = defaultRegistry();
    expect(r.patterns.length).toBe(4);
    expect(r.custom_patterns).toEqual([]);
    expect(r.instantiation_history).toEqual([]);
  });
});

describe('reference-architectures — loadRegistry / saveRegistry', () => {
  it('returns defaultRegistry when file missing', () => {
    const r = loadRegistry(registryFile);
    expect(r.patterns.length).toBe(4);
  });

  it('round-trips a saved registry', () => {
    const r = defaultRegistry();
    r.custom_patterns.push({
      id: 'custom-x',
      name: 'X',
      category: 'other',
      description: 'd',
      components: [],
      tech_stack: { suggested: [] },
      structure: {},
      nfrs: [],
      custom: true,
      created_at: new Date().toISOString(),
    });
    saveRegistry(r, registryFile);
    const reloaded = loadRegistry(registryFile);
    expect(reloaded.custom_patterns).toHaveLength(1);
    expect(reloaded.custom_patterns[0]?.id).toBe('custom-x');
  });

  it('falls back to default on corrupt JSON', () => {
    writeFileSync(registryFile, '{not json', 'utf8');
    expect(loadRegistry(registryFile).patterns.length).toBe(4);
  });

  it('back-fills missing patterns array with built-ins', () => {
    writeFileSync(registryFile, '{"version":"1.0.0","custom_patterns":[]}', 'utf8');
    const r = loadRegistry(registryFile);
    expect(r.patterns.length).toBe(4);
  });

  it('M3 hardening: rejects raw __proto__ payload', () => {
    writeFileSync(registryFile, '{"__proto__":{"polluted":true},"version":"1.0.0"}', 'utf8');
    expect(loadRegistry(registryFile).custom_patterns).toEqual([]);
  });

  it('M3 hardening: rejects raw constructor payload', () => {
    writeFileSync(registryFile, '{"constructor":{"polluted":true},"version":"1.0.0"}', 'utf8');
    expect(loadRegistry(registryFile).custom_patterns).toEqual([]);
  });

  it('M3 hardening: rejects nested __proto__ in custom_patterns', () => {
    writeFileSync(
      registryFile,
      '{"version":"1.0.0","custom_patterns":[{"__proto__":{"x":1}}]}',
      'utf8'
    );
    expect(loadRegistry(registryFile).custom_patterns).toEqual([]);
  });

  it('saveRegistry creates parent dir if missing', () => {
    const nested = join(tmpDir, 'deep', 'nested', 'refarch.json');
    saveRegistry(defaultRegistry(), nested);
    expect(existsSync(nested)).toBe(true);
  });
});

describe('reference-architectures — listPatterns', () => {
  it('lists all patterns (built-in + custom)', () => {
    const r = listPatterns({}, { registryFile });
    expect(r.total).toBe(4); // No custom patterns yet
  });

  it('reduces components to a count in the summary', () => {
    const r = listPatterns({}, { registryFile });
    for (const p of r.patterns) {
      expect(typeof p.components).toBe('number');
    }
  });

  it('filters by category', () => {
    const r = listPatterns({ category: 'rag' }, { registryFile });
    expect(r.total).toBe(1);
    expect(r.patterns[0]?.id).toBe('rag-pipeline');
  });

  it('includes custom patterns alongside built-ins', () => {
    registerPattern({ name: 'Custom A', description: 'd', category: 'other' }, { registryFile });
    const r = listPatterns({}, { registryFile });
    expect(r.total).toBe(5);
  });

  it('returns deduped categories', () => {
    const r = listPatterns({}, { registryFile });
    const categories = r.categories;
    expect(new Set(categories).size).toBe(categories.length);
  });
});

describe('reference-architectures — getPattern', () => {
  it('returns a built-in pattern', () => {
    const r = getPattern('rag-pipeline', { registryFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.pattern.name).toBe('RAG Pipeline');
      expect(r.pattern.components.length).toBeGreaterThan(0);
    }
  });

  it('rejects unknown pattern', () => {
    const r = getPattern('nope', { registryFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/not found/);
  });

  it('returns custom-registered patterns', () => {
    registerPattern(
      { name: 'Custom B', description: 'd', category: 'other', id: 'custom-b' },
      { registryFile }
    );
    const r = getPattern('custom-b', { registryFile });
    expect(r.success).toBe(true);
  });
});

describe('reference-architectures — registerPattern', () => {
  it('registers a custom pattern', () => {
    const r = registerPattern(
      {
        name: 'Custom CMS',
        description: 'A CMS',
        category: 'other',
        components: ['ui', 'api'],
      },
      { registryFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.pattern.custom).toBe(true);
      expect(r.pattern.id).toBe('custom-cms');
    }
  });

  it('rejects without name', () => {
    const r = registerPattern({ description: 'd' }, { registryFile });
    expect(r.success).toBe(false);
  });

  it('rejects without description', () => {
    const r = registerPattern({ name: 'X' }, { registryFile });
    expect(r.success).toBe(false);
  });

  it('rejects null pattern', () => {
    const r = registerPattern(null, { registryFile });
    expect(r.success).toBe(false);
  });

  it('rejects duplicate id', () => {
    registerPattern({ name: 'Test', description: 'd', id: 't1' }, { registryFile });
    const r = registerPattern({ name: 'Test 2', description: 'd2', id: 't1' }, { registryFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/already exists/);
  });

  it('rejects collision with built-in pattern id', () => {
    const r = registerPattern(
      { name: 'X', description: 'd', id: 'rag-pipeline' },
      { registryFile }
    );
    expect(r.success).toBe(false);
  });

  it('normalizes unknown category to "other"', () => {
    const r = registerPattern({ name: 'Q', description: 'd', category: 'bogus' }, { registryFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.pattern.category).toBe('other');
  });

  it('preserves known categories verbatim', () => {
    const r = registerPattern({ name: 'P', description: 'd', category: 'rag' }, { registryFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.pattern.category).toBe('rag');
  });

  it('auto-generates id from name when not supplied', () => {
    const r = registerPattern(
      { name: 'My Custom Thing', description: 'd', category: 'other' },
      { registryFile }
    );
    if (r.success) expect(r.pattern.id).toBe('my-custom-thing');
  });

  it('persists custom pattern across reload', () => {
    registerPattern(
      { name: 'Persistent', description: 'd', category: 'other', id: 'p1' },
      { registryFile }
    );
    const reloaded = loadRegistry(registryFile);
    expect(reloaded.custom_patterns.find((p) => p.id === 'p1')).toBeDefined();
  });
});

describe('reference-architectures — instantiatePattern', () => {
  it('creates pattern directory structure', () => {
    const r = instantiatePattern('api-platform', tmpDir, { registryFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.directories_created.length).toBeGreaterThan(0);
      expect(r.components.length).toBeGreaterThan(0);
    }
  });

  it('writes a README.md in each created dir', () => {
    const r = instantiatePattern('rag-pipeline', tmpDir, { registryFile });
    if (r.success) {
      for (const dir of r.directories_created) {
        const readmePath = join(tmpDir, dir, 'README.md');
        expect(existsSync(readmePath)).toBe(true);
        const content = readFileSync(readmePath, 'utf8');
        expect(content).toContain('RAG Pipeline');
      }
    }
  });

  it('skips existing directories on re-run', () => {
    instantiatePattern('api-platform', tmpDir, { registryFile });
    const r = instantiatePattern('api-platform', tmpDir, { registryFile });
    if (r.success) {
      expect(r.directories_skipped.length).toBeGreaterThan(0);
      expect(r.directories_created.length).toBe(0);
    }
  });

  it('rejects unknown pattern', () => {
    const r = instantiatePattern('nope', tmpDir, { registryFile });
    expect(r.success).toBe(false);
  });

  it('records instantiation history', () => {
    instantiatePattern('api-platform', tmpDir, { registryFile });
    const reloaded = loadRegistry(registryFile);
    expect(reloaded.instantiation_history.length).toBe(1);
    expect(reloaded.instantiation_history[0]?.pattern_id).toBe('api-platform');
  });

  it('skips traversal-shaped structure keys (defense in depth)', () => {
    // Inject a malicious custom pattern whose structure tries to escape
    // the project root.
    const reg = loadRegistry(registryFile);
    reg.custom_patterns.push({
      id: 'evil',
      name: 'Evil',
      category: 'other',
      description: 'd',
      components: [],
      tech_stack: { suggested: [] },
      structure: {
        '../../../tmp-evil-dir/': 'should be rejected',
        'safe/': 'should be created',
      },
      nfrs: [],
      custom: true,
      created_at: 'now',
    });
    saveRegistry(reg, registryFile);
    const r = instantiatePattern('evil', tmpDir, { registryFile });
    expect(r.success).toBe(true);
    if (r.success) {
      // The traversal key should be in skipped, not created.
      expect(r.directories_skipped).toContain('../../../tmp-evil-dir/');
      expect(r.directories_created).toContain('safe/');
    }
    // The escape target must not exist.
    expect(existsSync(join(tmpDir, '..', '..', '..', 'tmp-evil-dir'))).toBe(false);
  });

  it('returns the pattern metadata in the result envelope', () => {
    const r = instantiatePattern('api-platform', tmpDir, { registryFile });
    if (r.success) {
      expect(r.pattern).toBe('api-platform');
      expect(r.pattern_name).toBe('API Platform');
      expect(r.suggested_tech_stack.suggested).toContain('express');
    }
  });
});
