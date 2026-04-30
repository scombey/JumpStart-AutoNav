/**
 * tests/test-semantic-diff.test.ts — Semantic Diff port tests (M11 batch 6).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  compareArtifacts,
  compareFiles,
  crossArtifactDiff,
  extractApiEndpoints,
  extractRequirements,
  extractSections,
  extractTableData,
  normalizeText,
  textSimilarity,
} from '../src/lib/semantic-diff.js';

let tmpDir: string;
beforeEach(() => { tmpDir = join(tmpdir(), `test-sdiff-${Date.now()}`); mkdirSync(tmpDir, { recursive: true }); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('extractSections', () => {
  it('returns preamble for content without headings', () => {
    const s = extractSections('just some text');
    expect(s.length).toBeGreaterThan(0);
  });

  it('parses headings correctly', () => {
    const s = extractSections('# H1\ncontent\n## H2\nmore');
    expect(s.some(sec => sec.heading === 'H1')).toBe(true);
    expect(s.some(sec => sec.heading === 'H2')).toBe(true);
  });
});

describe('extractRequirements', () => {
  it('extracts REQ ids', () => {
    const ids = extractRequirements('See REQ-001 and NFR-002');
    expect(ids).toContain('REQ-001');
    expect(ids).toContain('NFR-002');
  });

  it('deduplicates', () => {
    const ids = extractRequirements('REQ-001 REQ-001');
    expect(ids.filter(i => i === 'REQ-001').length).toBe(1);
  });

  it('returns empty for no matches', () => {
    expect(extractRequirements('no requirements here')).toEqual([]);
  });
});

describe('extractApiEndpoints', () => {
  it('extracts GET endpoints', () => {
    const endpoints = extractApiEndpoints('GET /api/users\nPOST /api/login');
    expect(endpoints.length).toBe(2);
    expect(endpoints[0]?.method).toBe('GET');
  });

  it('returns empty for no endpoints', () => {
    expect(extractApiEndpoints('no api here')).toEqual([]);
  });
});

describe('extractTableData', () => {
  it('extracts table rows', () => {
    const rows = extractTableData('| Col1 | Col2 |\n|------|------|\n| A | B |');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(r => r.includes('A'))).toBe(true);
  });
});

describe('normalizeText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeText('Hello, World!')).toBe('hello world');
  });

  it('collapses whitespace', () => {
    expect(normalizeText('  foo   bar  ')).toBe('foo bar');
  });
});

describe('textSimilarity', () => {
  it('returns 1 for identical texts', () => {
    expect(textSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely different texts', () => {
    expect(textSimilarity('abc def ghi', 'xyz uvw rst')).toBe(0);
  });

  it('returns 1 for both empty', () => {
    expect(textSimilarity('', '')).toBe(1);
  });

  it('returns between 0 and 1 for partial overlap', () => {
    const s = textSimilarity('hello world foo', 'hello world bar');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });
});

describe('compareArtifacts', () => {
  it('returns success for identical content', () => {
    const r = compareArtifacts('# PRD\n\nContent', '# PRD\n\nContent');
    expect(r.success).toBe(true);
    expect(r.overall_similarity).toBe(100);
    expect(r.has_breaking_changes).toBe(false);
  });

  it('detects added sections', () => {
    const r = compareArtifacts('# Sec A\nContent', '# Sec A\nContent\n# Sec B\nNew');
    expect(r.section_changes.some(c => c.type === 'section_added')).toBe(true);
  });

  it('detects removed sections', () => {
    const r = compareArtifacts('# Sec A\nContent\n# Sec B\nOld', '# Sec A\nContent');
    expect(r.section_changes.some(c => c.type === 'section_removed')).toBe(true);
  });

  it('detects added requirements', () => {
    const r = compareArtifacts('# PRD\n\nold', '# PRD\n\nREQ-001 new requirement');
    expect(r.requirement_changes.added).toContain('REQ-001');
  });

  it('detects breaking changes when reqs removed', () => {
    const r = compareArtifacts('# PRD\n\nREQ-001 existing', '# PRD\n\nchanged');
    expect(r.has_breaking_changes).toBe(true);
  });
});

describe('compareFiles', () => {
  it('returns error for missing file', () => {
    const r = compareFiles(join(tmpDir, 'a.md'), join(tmpDir, 'b.md'));
    expect(r.success).toBe(false);
  });

  it('compares real files', () => {
    writeFileSync(join(tmpDir, 'a.md'), '# Doc\n\nContent A');
    writeFileSync(join(tmpDir, 'b.md'), '# Doc\n\nContent B');
    const r = compareFiles(join(tmpDir, 'a.md'), join(tmpDir, 'b.md'));
    expect(r.success).toBe(true);
  });
});

describe('crossArtifactDiff', () => {
  it('returns error when specs dir missing', () => {
    const r = crossArtifactDiff(tmpDir);
    expect(r.success).toBe(false);
  });

  it('returns success with specs dir', () => {
    mkdirSync(join(tmpDir, 'specs'));
    writeFileSync(join(tmpDir, 'specs', 'prd.md'), '# PRD\n\nREQ-001');
    const r = crossArtifactDiff(tmpDir);
    expect(r.success).toBe(true);
  });
});
