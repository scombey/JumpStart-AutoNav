/**
 * tests/test-test-generator.test.ts — Test Generator port tests (M11 batch 6).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_FRAMEWORKS,
  TEST_TYPES,
  checkCoverage,
  extractCriteria,
  generateTestStubs,
} from '../src/lib/test-generator.js';

let tmpDir: string;
beforeEach(() => { tmpDir = join(tmpdir(), `test-testgen-${Date.now()}`); mkdirSync(tmpDir, { recursive: true }); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

const SAMPLE_PRD = `
## User Stories

**E01-S01** - Login feature

- Given user visits login page
- When user submits valid credentials
- Then user is redirected to dashboard
- AC1: Login should work

**E01-S02** - Logout feature

- Given user is logged in
- When user clicks logout
- Then user is signed out
`;

describe('extractCriteria', () => {
  it('extracts Given/When/Then criteria', () => {
    const criteria = extractCriteria(SAMPLE_PRD);
    expect(criteria.length).toBeGreaterThan(0);
    expect(criteria.some(c => c.type === 'given')).toBe(true);
    expect(criteria.some(c => c.type === 'when')).toBe(true);
    expect(criteria.some(c => c.type === 'then')).toBe(true);
  });

  it('extracts AC criteria', () => {
    const criteria = extractCriteria(SAMPLE_PRD);
    expect(criteria.some(c => c.type === 'acceptance')).toBe(true);
  });

  it('associates story IDs with criteria', () => {
    const criteria = extractCriteria(SAMPLE_PRD);
    expect(criteria.some(c => c.story === 'E01-S01')).toBe(true);
  });

  it('returns empty for content without criteria', () => {
    expect(extractCriteria('# Plain doc\n\nNo criteria here')).toEqual([]);
  });
});

describe('generateTestStubs', () => {
  it('returns error for unsupported language', () => {
    const r = generateTestStubs([], { language: 'cobol' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unsupported/);
  });

  it('generates TypeScript test files', () => {
    const criteria = extractCriteria(SAMPLE_PRD);
    const r = generateTestStubs(criteria, { language: 'typescript' });
    expect(r.success).toBe(true);
    expect((r.test_files ?? 0)).toBeGreaterThan(0);
    expect(r.framework).toBe('vitest');
  });

  it('files have correct extension for TypeScript', () => {
    const criteria = extractCriteria(SAMPLE_PRD);
    const r = generateTestStubs(criteria, { language: 'typescript' });
    for (const f of r.files ?? []) {
      expect(f.fileName).toMatch(/\.test\.ts$/);
    }
  });

  it('generates Python test files', () => {
    const criteria = extractCriteria(SAMPLE_PRD);
    const r = generateTestStubs(criteria, { language: 'python' });
    expect(r.success).toBe(true);
    expect(r.framework).toBe('pytest');
  });

  it('groups criteria by story', () => {
    const criteria = extractCriteria(SAMPLE_PRD);
    const r = generateTestStubs(criteria, { language: 'javascript' });
    // E01-S01 and E01-S02 should produce separate files
    expect((r.test_files ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('includes total_criteria count', () => {
    const criteria = extractCriteria(SAMPLE_PRD);
    const r = generateTestStubs(criteria, { language: 'javascript' });
    expect(r.total_criteria).toBe(criteria.length);
  });
});

describe('checkCoverage', () => {
  it('returns error when PRD missing', () => {
    const r = checkCoverage(tmpDir);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/PRD not found/);
  });

  it('returns coverage when PRD exists', () => {
    const specsDir = join(tmpDir, 'specs');
    mkdirSync(specsDir);
    writeFileSync(join(specsDir, 'prd.md'), SAMPLE_PRD);
    const r = checkCoverage(tmpDir);
    expect(r.success).toBe(true);
    expect(typeof r.coverage).toBe('number');
    expect((r.coverage ?? 0)).toBeGreaterThanOrEqual(0);
    expect((r.coverage ?? 0)).toBeLessThanOrEqual(100);
  });
});

describe('TEST_TYPES', () => {
  it('includes unit and integration', () => {
    expect(TEST_TYPES).toContain('unit');
    expect(TEST_TYPES).toContain('integration');
  });
});

describe('TEST_FRAMEWORKS', () => {
  it('has typescript framework config', () => {
    expect(TEST_FRAMEWORKS['typescript']?.framework).toBe('vitest');
  });

  it('has python framework config', () => {
    expect(TEST_FRAMEWORKS['python']?.framework).toBe('pytest');
  });
});
