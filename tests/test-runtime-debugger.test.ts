/**
 * tests/test-runtime-debugger.test.ts — Runtime Debugger port tests.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  analyzeLogFile,
  analyzeLogs,
  correlateWithSource,
  generateHypotheses,
  LOG_PATTERNS,
} from '../src/lib/runtime-debugger.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `test-rdbg-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('LOG_PATTERNS', () => {
  it('contains error and warning patterns', () => {
    expect(LOG_PATTERNS.error).toBeTruthy();
    expect(LOG_PATTERNS.warning).toBeTruthy();
  });
});

describe('analyzeLogs', () => {
  it('detects ERROR line', () => {
    const r = analyzeLogs('2024-01-01 ERROR something went wrong');
    expect(r.success).toBe(true);
    expect(r.summary?.errors ?? 0).toBeGreaterThan(0);
  });

  it('detects WARN line', () => {
    const r = analyzeLogs('2024-01-01 WARN low disk space');
    expect(r.summary?.warnings ?? 0).toBeGreaterThan(0);
  });

  it('detects OOM', () => {
    const r = analyzeLogs('heap allocation failed OOM');
    expect(r.summary?.oom ?? 0).toBeGreaterThan(0);
  });

  it('detects ECONNREFUSED', () => {
    const r = analyzeLogs('connect ECONNREFUSED 127.0.0.1:5432');
    expect(r.summary?.connection_issues ?? 0).toBeGreaterThan(0);
  });

  it('detects timeout', () => {
    const r = analyzeLogs('request timed out after 30s');
    expect(r.summary?.timeouts ?? 0).toBeGreaterThan(0);
  });

  it('returns total_findings count', () => {
    const r = analyzeLogs('ERROR a\nERROR b\nWARN c');
    expect(r.total_findings ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('handles empty log', () => {
    const r = analyzeLogs('');
    expect(r.total_findings).toBe(0);
  });

  it('truncates content to 200 chars', () => {
    const longLine = `ERROR ${'x'.repeat(300)}`;
    const r = analyzeLogs(longLine);
    for (const f of r.findings ?? []) {
      expect(f.content.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('analyzeLogFile', () => {
  it('returns error for missing file', () => {
    const r = analyzeLogFile(join(tmpDir, 'nope.log'));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not found/);
  });

  it('analyzes real file', () => {
    const f = join(tmpDir, 'app.log');
    writeFileSync(f, 'ERROR something failed\nWARN low memory');
    const r = analyzeLogFile(f);
    expect(r.success).toBe(true);
    expect(r.file).toBe(f);
  });
});

describe('correlateWithSource', () => {
  it('extracts file references from findings', () => {
    const findings = [
      { type: 'error', line: 1, content: 'at src/app.ts:42', severity: 'high' as const },
    ];
    const r = correlateWithSource(findings, tmpDir);
    expect(r.success).toBe(true);
    expect(r.total).toBeGreaterThan(0);
  });

  it('returns empty for no file refs', () => {
    const findings = [
      { type: 'error', line: 1, content: 'no file ref here', severity: 'high' as const },
    ];
    const r = correlateWithSource(findings, tmpDir);
    expect(r.correlations).toHaveLength(0);
  });
});

describe('generateHypotheses', () => {
  it('suggests memory hypothesis for OOM', () => {
    const analysis = analyzeLogs('heap allocation failed OOM');
    const r = generateHypotheses(analysis);
    expect(r.hypotheses.some((h) => h.hypothesis.toLowerCase().includes('memory'))).toBe(true);
  });

  it('suggests connection hypothesis for ECONNREFUSED', () => {
    const analysis = analyzeLogs('ECONNREFUSED');
    const r = generateHypotheses(analysis);
    expect(r.hypotheses.some((h) => h.hypothesis.toLowerCase().includes('service'))).toBe(true);
  });

  it('returns success true', () => {
    const r = generateHypotheses(analyzeLogs('ERROR test'));
    expect(r.success).toBe(true);
  });
});
