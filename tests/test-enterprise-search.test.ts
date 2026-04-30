/**
 * test-enterprise-search.test.ts — M11 batch 2 port coverage.
 *
 * Verifies the TS port at `src/lib/enterprise-search.ts` matches the
 * legacy `bin/lib/enterprise-search.js` public surface:
 *   - indexProject(root) — entry counts + types
 *   - searchProject(root, query) — match preview + maxResults
 *   - SEARCHABLE_TYPES enum contents
 *
 * @see src/lib/enterprise-search.ts
 * @see bin/lib/enterprise-search.js (legacy reference)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexProject, SEARCHABLE_TYPES, searchProject } from '../src/lib/enterprise-search.js';
import { expectDefined } from './_helpers.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'enterprise-search-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('enterprise-search — SEARCHABLE_TYPES', () => {
  it('exposes the 6 documented types', () => {
    expect(SEARCHABLE_TYPES.length).toBe(6);
    expect(SEARCHABLE_TYPES).toContain('spec');
    expect(SEARCHABLE_TYPES).toContain('code');
    expect(SEARCHABLE_TYPES).toContain('adr');
    expect(SEARCHABLE_TYPES).toContain('incident');
    expect(SEARCHABLE_TYPES).toContain('release');
    expect(SEARCHABLE_TYPES).toContain('config');
  });
});

describe('enterprise-search — indexProject', () => {
  it('returns success and 0 entries on an empty project', () => {
    const result = indexProject(tmp);
    expect(result.success).toBe(true);
    expect(result.total_entries).toBe(0);
    expect(result.index.entries).toEqual([]);
    expect(result.index.root).toBe(tmp);
    expect(result.index.indexed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('indexes spec files with type=spec', () => {
    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    writeFileSync(path.join(tmp, 'specs', 'prd.md'), '# PRD', 'utf8');
    const result = indexProject(tmp);
    expect(result.total_entries).toBeGreaterThanOrEqual(1);
    const specEntry = result.index.entries.find((e) => e.type === 'spec');
    expect(specEntry?.path).toBe('specs/prd.md');
  });

  it('indexes ADRs with type=adr from specs/decisions/', () => {
    mkdirSync(path.join(tmp, 'specs', 'decisions'), { recursive: true });
    writeFileSync(path.join(tmp, 'specs', 'decisions', 'adr-001.md'), '# ADR', 'utf8');
    const result = indexProject(tmp);
    const adrEntry = result.index.entries.find((e) => e.type === 'adr');
    expect(adrEntry).toBeDefined();
  });

  it('indexes src/ files with code-type extensions', () => {
    mkdirSync(path.join(tmp, 'src'), { recursive: true });
    writeFileSync(path.join(tmp, 'src', 'a.ts'), 'export const x = 1;', 'utf8');
    writeFileSync(path.join(tmp, 'src', 'b.py'), 'x = 1', 'utf8');
    writeFileSync(path.join(tmp, 'src', 'README.md'), '# readme', 'utf8'); // skipped
    const result = indexProject(tmp);
    const codeEntries = result.index.entries.filter((e) => e.type === 'code');
    expect(codeEntries.length).toBe(2);
  });

  it('indexes the .jumpstart/config.yaml as type=config', () => {
    mkdirSync(path.join(tmp, '.jumpstart'), { recursive: true });
    writeFileSync(path.join(tmp, '.jumpstart', 'config.yaml'), 'project: test\n', 'utf8');
    const result = indexProject(tmp);
    const cfgEntry = result.index.entries.find((e) => e.type === 'config');
    expect(cfgEntry?.path).toBe('.jumpstart/config.yaml');
  });

  it('skips dotfiles inside specs/', () => {
    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    writeFileSync(path.join(tmp, 'specs', '.hidden.md'), 'hidden', 'utf8');
    const result = indexProject(tmp);
    const hidden = result.index.entries.find((e) => e.name === '.hidden.md');
    expect(hidden).toBeUndefined();
  });

  it('skips node_modules/.git/dist directories', () => {
    mkdirSync(path.join(tmp, 'src', 'node_modules'), { recursive: true });
    writeFileSync(path.join(tmp, 'src', 'node_modules', 'a.ts'), 'x', 'utf8');
    mkdirSync(path.join(tmp, 'src', 'dist'), { recursive: true });
    writeFileSync(path.join(tmp, 'src', 'dist', 'b.ts'), 'x', 'utf8');
    writeFileSync(path.join(tmp, 'src', 'real.ts'), 'export const r = 1;', 'utf8');
    const result = indexProject(tmp);
    const codeEntries = result.index.entries.filter((e) => e.type === 'code');
    expect(codeEntries.length).toBe(1);
    expectDefined(codeEntries[0]);
    expect(codeEntries[0].path).toBe('src/real.ts');
  });

  it('records file size in each entry', () => {
    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    writeFileSync(path.join(tmp, 'specs', 'a.md'), 'hello', 'utf8');
    const result = indexProject(tmp);
    expectDefined(result.index.entries[0]);
    expect(result.index.entries[0].size).toBe(5);
  });
});

describe('enterprise-search — searchProject', () => {
  it('rejects an empty query', () => {
    const result = searchProject(tmp, '');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('required');
  });

  it('rejects null/undefined query', () => {
    const result = searchProject(tmp, null);
    expect(result.success).toBe(false);
  });

  it('finds a match in specs/', () => {
    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    writeFileSync(
      path.join(tmp, 'specs', 'prd.md'),
      'The product\nshould use rate-limiting.\nDone.\n',
      'utf8'
    );
    const result = searchProject(tmp, 'rate-limiting');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.total_results).toBe(1);
      expectDefined(result.results[0]);
      expect(result.results[0].path).toBe('specs/prd.md');
      expect(result.results[0].preview.length).toBe(1);
      expectDefined(result.results[0].preview[0]);
      expect(result.results[0].preview[0].text).toContain('rate-limiting');
    }
  });

  it('matches case-insensitively', () => {
    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    writeFileSync(path.join(tmp, 'specs', 'a.md'), 'OAuth flow', 'utf8');
    const result = searchProject(tmp, 'oauth');
    if (result.success) expect(result.total_results).toBe(1);
  });

  it('caps preview to 3 matching lines', () => {
    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    writeFileSync(path.join(tmp, 'specs', 'a.md'), 'foo\nfoo\nfoo\nfoo\nfoo\n', 'utf8');
    const result = searchProject(tmp, 'foo');
    if (result.success) {
      expectDefined(result.results[0]);
      expect(result.results[0].preview.length).toBe(3);
    }
  });

  it('honors maxResults option', () => {
    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    for (let i = 0; i < 5; i += 1) {
      writeFileSync(path.join(tmp, 'specs', `a${i}.md`), 'match', 'utf8');
    }
    const result = searchProject(tmp, 'match', { maxResults: 2 });
    if (result.success) {
      expect(result.results.length).toBe(2);
    }
  });

  it('returns 0 results when no match', () => {
    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    writeFileSync(path.join(tmp, 'specs', 'a.md'), 'hello', 'utf8');
    const result = searchProject(tmp, 'nothere');
    if (result.success) expect(result.total_results).toBe(0);
  });

  it('returns the original query (not lowercased) on success', () => {
    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    writeFileSync(path.join(tmp, 'specs', 'a.md'), 'OAuth', 'utf8');
    const result = searchProject(tmp, 'OAuth');
    if (result.success) expect(result.query).toBe('OAuth');
  });
});
