/**
 * test-pattern-library.test.ts — M11 batch 1 port coverage.
 *
 * Verifies the TS port at `src/lib/pattern-library.ts` matches the
 * legacy `bin/lib/pattern-library.js` public surface:
 *   - registerPattern / searchPatterns / getPattern / listPatterns
 *   - load/save round-trip
 *   - PATTERN_CATEGORIES enum contents
 *
 * @see src/lib/pattern-library.ts
 * @see bin/lib/pattern-library.js (legacy reference)
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultState,
  getPattern,
  listPatterns,
  loadState,
  PATTERN_CATEGORIES,
  registerPattern,
  saveState,
  searchPatterns,
} from '../src/lib/pattern-library.js';
import { expectDefined } from './_helpers.js';

let tmp: string;
let stateFile: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'pattern-library-'));
  stateFile = path.join(tmp, 'pattern-library.json');
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('pattern-library — PATTERN_CATEGORIES', () => {
  it('lists the 8 documented categories', () => {
    expect(PATTERN_CATEGORIES.length).toBe(8);
    expect(PATTERN_CATEGORIES).toContain('api');
    expect(PATTERN_CATEGORIES).toContain('data-access');
    expect(PATTERN_CATEGORIES).toContain('auth');
    expect(PATTERN_CATEGORIES).toContain('messaging');
    expect(PATTERN_CATEGORIES).toContain('testing');
    expect(PATTERN_CATEGORIES).toContain('deployment');
    expect(PATTERN_CATEGORIES).toContain('error-handling');
    expect(PATTERN_CATEGORIES).toContain('logging');
  });
});

describe('pattern-library — defaultState / load / save', () => {
  it('defaultState returns empty patterns + version 1.0.0', () => {
    const s = defaultState();
    expect(s.version).toBe('1.0.0');
    expect(s.patterns).toEqual([]);
    expect(s.last_updated).toBe(null);
  });

  it('loadState returns defaultState when file missing', () => {
    const s = loadState(stateFile);
    expect(s.patterns).toEqual([]);
  });

  it('saveState writes JSON + populates last_updated', () => {
    const s = defaultState();
    saveState(s, stateFile);
    const raw = readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('loadState round-trips saved state', () => {
    const s = defaultState();
    saveState(s, stateFile);
    const loaded = loadState(stateFile);
    expect(loaded.version).toBe('1.0.0');
  });

  it('rejects malformed JSON by returning defaultState', () => {
    writeFileSync(stateFile, 'not-json', 'utf8');
    const loaded = loadState(stateFile);
    expect(loaded.patterns).toEqual([]);
  });

  it('rejects __proto__-keyed JSON by returning defaultState', () => {
    writeFileSync(stateFile, '{"__proto__":{"polluted":true}}', 'utf8');
    const loaded = loadState(stateFile);
    expect(loaded.patterns).toEqual([]);
  });
});

describe('pattern-library — registerPattern', () => {
  it('registers a new pattern with id starting PAT-', () => {
    const r = registerPattern('rate-limiter', 'api', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.pattern.id).toMatch(/^PAT-\d+/);
      expect(r.pattern.name).toBe('rate-limiter');
      expect(r.pattern.category).toBe('api');
      expect(r.pattern.language).toBe('javascript');
      expect(r.pattern.approved).toBe(false);
    }
  });

  it('persists the pattern to state', () => {
    registerPattern('rate-limiter', 'api', { stateFile });
    const list = listPatterns({ stateFile });
    expect(list.total).toBe(1);
  });

  it('rejects when name is missing', () => {
    const r = registerPattern('', 'api', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('required');
  });

  it('rejects unknown category', () => {
    const r = registerPattern('thing', 'made-up', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Unknown category');
  });

  it('honors options.approved and tags', () => {
    const r = registerPattern('p', 'auth', {
      stateFile,
      approved: true,
      tags: ['oauth', 'jwt'],
      description: 'desc',
      language: 'typescript',
      code: 'const x = 1;',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.pattern.approved).toBe(true);
      expect(r.pattern.tags).toEqual(['oauth', 'jwt']);
      expect(r.pattern.description).toBe('desc');
      expect(r.pattern.language).toBe('typescript');
      expect(r.pattern.code).toBe('const x = 1;');
    }
  });
});

describe('pattern-library — searchPatterns', () => {
  it('returns all patterns when query is empty', () => {
    registerPattern('a', 'api', { stateFile });
    registerPattern('b', 'auth', { stateFile });
    const r = searchPatterns('', { stateFile });
    expect(r.total).toBe(2);
  });

  it('matches by name substring (case-insensitive)', () => {
    registerPattern('rate-limiter', 'api', { stateFile });
    registerPattern('jwt', 'auth', { stateFile });
    const r = searchPatterns('Rate', { stateFile });
    expect(r.total).toBe(1);
    const [first] = r.patterns;
    expectDefined(first);
    expect(first.name).toBe('rate-limiter');
  });

  it('matches by tag', () => {
    registerPattern('p', 'auth', { stateFile, tags: ['oauth', 'jwt'] });
    const r = searchPatterns('oauth', { stateFile });
    expect(r.total).toBe(1);
  });

  it('filters by category', () => {
    registerPattern('a', 'api', { stateFile });
    registerPattern('b', 'auth', { stateFile });
    const r = searchPatterns('', { stateFile, category: 'auth' });
    expect(r.total).toBe(1);
  });

  it('returns no results for non-matching query', () => {
    registerPattern('a', 'api', { stateFile });
    const r = searchPatterns('does-not-exist', { stateFile });
    expect(r.total).toBe(0);
  });
});

describe('pattern-library — getPattern', () => {
  it('returns the pattern by id', () => {
    const reg = registerPattern('p', 'api', { stateFile });
    const id = reg.success ? reg.pattern.id : '';
    const r = getPattern(id, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.pattern.id).toBe(id);
  });

  it('rejects unknown id with not-found error', () => {
    const r = getPattern('PAT-doesnotexist', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('not found');
  });
});

describe('pattern-library — listPatterns', () => {
  it('returns total + slimmed patterns + categories', () => {
    registerPattern('a', 'api', { stateFile });
    registerPattern('b', 'auth', { stateFile, approved: true });
    const r = listPatterns({ stateFile });
    expect(r.total).toBe(2);
    expect(r.patterns.length).toBe(2);
    expect(r.categories).toBe(PATTERN_CATEGORIES);
    const approved = r.patterns.find((p) => p.approved);
    expect(approved?.name).toBe('b');
  });

  it('returns 0 + categories when no patterns registered', () => {
    const r = listPatterns({ stateFile });
    expect(r.total).toBe(0);
    expect(r.categories.length).toBe(8);
  });
});
