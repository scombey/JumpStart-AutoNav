/**
 * tests/test-root-cause-analysis.test.ts — Root Cause Analysis port tests.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  analyzeFailure,
  analyzeTestFile,
  FAILURE_PATTERNS,
  generateReport,
} from '../src/lib/root-cause-analysis.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `test-rca-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('FAILURE_PATTERNS', () => {
  it('contains at least 5 patterns', () =>
    expect(FAILURE_PATTERNS.length).toBeGreaterThanOrEqual(5));
  it('each pattern has category and fix', () => {
    for (const p of FAILURE_PATTERNS) {
      expect(typeof p.category).toBe('string');
      expect(typeof p.fix).toBe('string');
    }
  });
});

describe('analyzeFailure', () => {
  it('returns error on empty output', () => {
    const r = analyzeFailure('');
    expect(r.success).toBe(false);
  });

  it('detects syntax error', () => {
    const r = analyzeFailure("SyntaxError: Unexpected token '>'");
    expect(r.success).toBe(true);
    expect(r.categories).toContain('syntax-error');
  });

  it('detects missing module', () => {
    const r = analyzeFailure("Cannot find module 'lodash'");
    expect(r.categories).toContain('missing-dependency');
  });

  it('detects type error', () => {
    const r = analyzeFailure('TypeError: foo is not a function');
    expect(r.categories).toContain('type-error');
  });

  it('detects reference error', () => {
    const r = analyzeFailure('ReferenceError: myVar is not defined');
    expect(r.categories).toContain('reference-error');
  });

  it('returns primary_cause null for empty hypotheses', () => {
    const r = analyzeFailure('all good no errors here');
    expect(r.primary_cause).toBeNull();
  });

  it('provides recommended_actions for up to 3 hypotheses', () => {
    const r = analyzeFailure(
      "SyntaxError: bad\nCannot find module 'a'\nReferenceError: x is not defined"
    );
    expect((r.recommended_actions ?? []).length).toBeLessThanOrEqual(3);
  });

  it('deduplicates same category+detail', () => {
    const r = analyzeFailure('SyntaxError: bad\nSyntaxError: bad\nSyntaxError: bad');
    const syntaxCount = r.hypotheses?.filter((h) => h.category === 'syntax-error').length ?? 0;
    expect(syntaxCount).toBe(1);
  });
});

describe('analyzeTestFile', () => {
  it('returns error for missing file', () => {
    const r = analyzeTestFile(join(tmpDir, 'missing.txt'));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/File not found/);
  });

  it('analyzes an actual file', () => {
    const f = join(tmpDir, 'output.txt');
    writeFileSync(f, 'SyntaxError: Unexpected end of input');
    const r = analyzeTestFile(f);
    expect(r.success).toBe(true);
    expect(r.file).toBe(f);
  });
});

describe('generateReport', () => {
  it('returns error for invalid analysis', () => {
    const r = generateReport({ success: false } as any);
    expect(r.success).toBe(false);
  });

  it('summarizes by category', () => {
    const analysis = analyzeFailure("SyntaxError: bad\nCannot find module 'x'");
    const r = generateReport(analysis);
    expect(r.success).toBe(true);
    expect(Object.keys(r.by_category ?? {}).length).toBeGreaterThan(0);
  });

  it('action_plan has at most 3 items', () => {
    const analysis = analyzeFailure(
      "SyntaxError: bad\nCannot find module 'x'\nReferenceError: y is not defined\nTypeError: z is not a function"
    );
    const r = generateReport(analysis);
    expect((r.action_plan ?? []).length).toBeLessThanOrEqual(3);
  });
});
