/**
 * tests/test-uat-coverage.test.ts -- vitest suite for src/lib/uat-coverage.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeUATCoverage,
  extractAcceptanceCriteria,
  extractKeywords,
  generateUATReport,
  scanTestCoverage,
  walkTestFiles,
} from '../src/lib/uat-coverage.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(name: string, content: string) {
  const p = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

const SAMPLE_PRD = `
# PRD

## E01-S01: User Login
Acceptance Criteria:
- User can enter email and password
- System validates credentials
- User is redirected to dashboard after login

## E01-S02: User Logout
- User clicks logout button
- Session is terminated
`;

// ─── walkTestFiles ───────────────────────────────────────────────────────────

describe('walkTestFiles', () => {
  it('returns empty array for non-existent directory', () => {
    expect(walkTestFiles('/nonexistent')).toEqual([]);
  });

  it('finds test files by pattern', () => {
    write('tests/login.test.ts', 'test("login", () => {})');
    write('tests/auth.spec.ts', 'test("auth", () => {})');
    const files = walkTestFiles(path.join(tmpDir, 'tests'));
    expect(files.length).toBe(2);
  });

  it('skips node_modules', () => {
    write('node_modules/pkg/test.test.js', 'test code');
    write('tests/login.test.ts', 'test code');
    const files = walkTestFiles(tmpDir);
    expect(files.every((f) => !f.includes('node_modules'))).toBe(true);
  });
});

// ─── extractKeywords ─────────────────────────────────────────────────────────

describe('extractKeywords', () => {
  it('filters short words and stopwords', () => {
    const kw = extractKeywords('User can login with email address');
    expect(kw).not.toContain('with');
    expect(kw).not.toContain('can');
  });

  it('returns meaningful content words', () => {
    const kw = extractKeywords('login credential validation redirect dashboard');
    expect(kw).toContain('login');
    expect(kw).toContain('credential');
  });

  it('returns empty array for stopword-only text', () => {
    const kw = extractKeywords('is are was were be been');
    expect(kw.length).toBe(0);
  });
});

// ─── extractAcceptanceCriteria ────────────────────────────────────────────────

describe('extractAcceptanceCriteria', () => {
  it('returns empty array for content with no story IDs', () => {
    const result = extractAcceptanceCriteria('No stories here');
    expect(result).toEqual([]);
  });

  it('extracts story IDs from PRD', () => {
    const result = extractAcceptanceCriteria(SAMPLE_PRD);
    const ids = result.map((s) => s.story_id);
    expect(ids).toContain('E01-S01');
    expect(ids).toContain('E01-S02');
  });

  it('extracts acceptance criteria from AC section', () => {
    const result = extractAcceptanceCriteria(SAMPLE_PRD);
    const s01 = result.find((s) => s.story_id === 'E01-S01');
    if (!s01) throw new Error('expected E01-S01');
    expect(s01.criteria.length).toBeGreaterThan(0);
  });

  it('extracts Gherkin steps', () => {
    const prd = `
# E02-S01: Feature
Given the user is on the login page
When they submit credentials
Then they are redirected
`;
    const result = extractAcceptanceCriteria(prd);
    const s01 = result.find((s) => s.story_id === 'E02-S01');
    if (!s01) throw new Error('expected E02-S01');
    expect(s01.gherkin.length).toBeGreaterThan(0);
  });
});

// ─── scanTestCoverage ────────────────────────────────────────────────────────

describe('scanTestCoverage', () => {
  it('returns empty coverage for non-existent test dir', () => {
    const coverage = scanTestCoverage('/nonexistent', ['E01-S01']);
    const entry = coverage.get('E01-S01');
    if (!entry) throw new Error('expected entry');
    expect(entry.files).toEqual([]);
  });

  it('finds test files referencing story IDs', () => {
    write('tests/login.test.ts', 'describe("E01-S01 login", () => { it("works", () => {}) })');
    const testDir = path.join(tmpDir, 'tests');
    const coverage = scanTestCoverage(testDir, ['E01-S01']);
    const entry = coverage.get('E01-S01');
    if (!entry) throw new Error('expected entry');
    expect(entry.files.length).toBeGreaterThan(0);
  });
});

// ─── computeUATCoverage ──────────────────────────────────────────────────────

describe('computeUATCoverage', () => {
  it('throws when PRD not found', () => {
    expect(() => computeUATCoverage('/nonexistent/prd.md', tmpDir)).toThrow('PRD not found');
  });

  it('returns 100% story coverage when no stories in PRD', () => {
    const prd = write('prd.md', 'No story IDs here');
    const result = computeUATCoverage(prd, tmpDir);
    expect(result.story_coverage_pct).toBe(100);
    expect(result.total_stories).toBe(0);
  });

  it('returns pass:true when criteria coverage >= 80%', () => {
    const prd = write('prd.md', 'No story IDs here');
    const result = computeUATCoverage(prd, tmpDir);
    expect(result.pass).toBe(true);
  });

  it('returns story_details and criteria_details arrays', () => {
    const prd = write('prd.md', 'E01-S01 story here');
    const result = computeUATCoverage(prd, tmpDir);
    expect(Array.isArray(result.story_details)).toBe(true);
    expect(Array.isArray(result.criteria_details)).toBe(true);
  });

  it('computes story coverage percentage correctly', () => {
    const prd = write('prd.md', SAMPLE_PRD);
    write('tests/login.test.ts', 'test("E01-S01 login works", () => {})');
    const result = computeUATCoverage(prd, path.join(tmpDir, 'tests'));
    expect(result.total_stories).toBe(2);
    expect(result.covered_stories).toBeGreaterThanOrEqual(1);
  });
});

// ─── generateUATReport ───────────────────────────────────────────────────────

describe('generateUATReport', () => {
  it('returns markdown report with header', () => {
    const prd = write('prd.md', SAMPLE_PRD);
    const report = generateUATReport(prd, tmpDir);
    expect(report).toContain('UAT Coverage Report');
    expect(report).toContain('Story Coverage');
  });

  it('includes story summary table', () => {
    const prd = write('prd.md', SAMPLE_PRD);
    const report = generateUATReport(prd, tmpDir);
    expect(report).toContain('Story Summary');
    expect(report).toContain('E01-S01');
  });
});

// ─── pollution-key safety (no JSON state) ───────────────────────────────────

describe('pollution-key safety', () => {
  it('extractAcceptanceCriteria does not crash on __proto__ bytes', () => {
    const content = Buffer.from('{"__proto__":{"evil":1}} E01-S01 story').toString();
    expect(() => extractAcceptanceCriteria(content)).not.toThrow();
  });

  it('extractKeywords does not crash on constructor key in text', () => {
    const text = Buffer.from('{"constructor":{"prototype":{}}} login credential').toString();
    expect(() => extractKeywords(text)).not.toThrow();
  });
});
