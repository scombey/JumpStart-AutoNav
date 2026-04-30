/**
 * tests/test-coverage.test.ts — vitest suite for src/lib/coverage.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  extractStoryIds,
  extractTaskMappings,
  computeCoverage,
  generateCoverageReport,
} from '../src/lib/coverage.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(name: string, content: string) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ─── extractStoryIds ─────────────────────────────────────────────────────────

describe('extractStoryIds', () => {
  it('finds story IDs matching E\\d+-S\\d+ pattern', () => {
    const ids = extractStoryIds('Story E01-S01 and E02-S03 are here');
    expect(ids).toContain('E01-S01');
    expect(ids).toContain('E02-S03');
  });

  it('deduplicates repeated IDs', () => {
    const ids = extractStoryIds('E01-S01 appears twice: E01-S01');
    expect(ids.filter(x => x === 'E01-S01').length).toBe(1);
  });

  it('returns empty array for no stories', () => {
    expect(extractStoryIds('No stories here')).toEqual([]);
  });

  it('does not match partial patterns like E1-S (no trailing digit group)', () => {
    const ids = extractStoryIds('E1-S is not a valid ID');
    expect(ids).toEqual([]);
  });
});

// ─── extractTaskMappings ─────────────────────────────────────────────────────

describe('extractTaskMappings', () => {
  it('finds tasks with M\\d+-T\\d+ pattern', () => {
    const plan = 'M1-T01: Do E01-S01\nM1-T02: Do E01-S02\n';
    const map = extractTaskMappings(plan);
    expect(map.has('M1-T01')).toBe(true);
    expect(map.has('M1-T02')).toBe(true);
  });

  it('associates story IDs with tasks', () => {
    const plan = 'M1-T01 covers E01-S01 and E01-S02\nM1-T02';
    const map = extractTaskMappings(plan);
    const t01 = map.get('M1-T01') ?? [];
    expect(t01).toContain('E01-S01');
  });

  it('returns empty map for no tasks', () => {
    const map = extractTaskMappings('No tasks here');
    expect(map.size).toBe(0);
  });
});

// ─── computeCoverage ─────────────────────────────────────────────────────────

describe('computeCoverage', () => {
  it('reports 100% when all stories referenced in plan', () => {
    const prd = write('prd.md', '# PRD\nE01-S01 user story\nE01-S02 another story');
    const plan = write('plan.md', 'M1-T01: covers E01-S01\nM1-T02: covers E01-S02');
    const result = computeCoverage(prd, plan);
    expect(result.coverage_pct).toBe(100);
    expect(result.uncovered).toEqual([]);
  });

  it('reports uncovered stories', () => {
    const prd = write('prd.md', 'E01-S01 story\nE01-S02 story');
    const plan = write('plan.md', 'M1-T01: only E01-S01');
    const result = computeCoverage(prd, plan);
    expect(result.uncovered).toContain('E01-S02');
    expect(result.covered).toContain('E01-S01');
    expect(result.coverage_pct).toBeLessThan(100);
  });

  it('returns 100% when PRD has no stories', () => {
    const prd = write('prd.md', 'No story IDs');
    const plan = write('plan.md', 'No tasks');
    const result = computeCoverage(prd, plan);
    expect(result.coverage_pct).toBe(100);
    expect(result.total_stories).toBe(0);
  });

  it('throws when PRD not found', () => {
    const plan = write('plan.md', '');
    expect(() => computeCoverage('/nonexistent/prd.md', plan)).toThrow('PRD not found');
  });

  it('throws when plan not found', () => {
    const prd = write('prd.md', '');
    expect(() => computeCoverage(prd, '/nonexistent/plan.md')).toThrow('Implementation plan not found');
  });

  it('includes total_tasks in result', () => {
    const prd = write('prd.md', 'E01-S01');
    const plan = write('plan.md', 'M1-T01: E01-S01\nM1-T02: something');
    const result = computeCoverage(prd, plan);
    expect(result.total_tasks).toBe(2);
  });
});

// ─── generateCoverageReport ──────────────────────────────────────────────────

describe('generateCoverageReport', () => {
  it('returns markdown with coverage percentage', () => {
    const prd = write('prd.md', 'E01-S01 story');
    const plan = write('plan.md', 'M1-T01: E01-S01');
    const report = generateCoverageReport(prd, plan);
    expect(report).toContain('100%');
    expect(report).toContain('Coverage Report');
  });

  it('lists uncovered stories when present', () => {
    const prd = write('prd.md', 'E01-S01\nE01-S02');
    const plan = write('plan.md', 'M1-T01: E01-S01');
    const report = generateCoverageReport(prd, plan);
    expect(report).toContain('E01-S02');
    expect(report).toContain('Uncovered');
  });

  it('all-pass message when 100% covered', () => {
    const prd = write('prd.md', 'E01-S01');
    const plan = write('plan.md', 'M1-T01: E01-S01');
    const report = generateCoverageReport(prd, plan);
    expect(report).toContain('covered by implementation tasks');
  });
});

// ─── pollution-key safety ────────────────────────────────────────────────────

describe('pollution-key safety (no JSON state)', () => {
  it('extractStoryIds does not crash on __proto__ in content', () => {
    const content = Buffer.from('{"__proto__":{"evil":1}} E01-S01').toString();
    const ids = extractStoryIds(content);
    expect(ids).toContain('E01-S01');
  });

  it('extractStoryIds does not crash on constructor key in content', () => {
    const content = Buffer.from('{"constructor":{"prototype":{}}} E02-S01').toString();
    const ids = extractStoryIds(content);
    expect(ids).toContain('E02-S01');
  });
});
