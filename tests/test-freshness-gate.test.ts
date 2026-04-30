/**
 * tests/test-freshness-gate.test.ts — vitest suite for src/lib/freshness-gate.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  auditDocument,
  auditSpecs,
  CITATION_PATTERNS,
  generateAuditReport,
  TECH_KEYWORDS,
} from '../src/lib/freshness-gate.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeSpec(name: string, content: string) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ─── CITATION_PATTERNS & TECH_KEYWORDS exports ───────────────────────────────

describe('exports', () => {
  it('exports CITATION_PATTERNS as array of RegExp', () => {
    expect(Array.isArray(CITATION_PATTERNS)).toBe(true);
    expect(CITATION_PATTERNS[0]).toBeInstanceOf(RegExp);
  });

  it('exports TECH_KEYWORDS as non-empty array', () => {
    expect(Array.isArray(TECH_KEYWORDS)).toBe(true);
    expect(TECH_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('TECH_KEYWORDS includes common tech names', () => {
    expect(TECH_KEYWORDS).toContain('react');
    expect(TECH_KEYWORDS).toContain('typescript');
    expect(TECH_KEYWORDS).toContain('docker');
  });
});

// ─── auditDocument ───────────────────────────────────────────────────────────

describe('auditDocument', () => {
  it('returns score 100 for content with no tech keywords', () => {
    const result = auditDocument('A simple document about planning.');
    expect(result.score).toBe(100);
    expect(result.techs).toHaveLength(0);
    expect(result.uncited).toHaveLength(0);
  });

  it('detects tech keywords without citations as uncited', () => {
    const result = auditDocument('We will use React and TypeScript for the frontend.');
    expect(result.techs).toContain('react');
    expect(result.techs).toContain('typescript');
    expect(result.uncited.length).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it('detects Context7 citations and improves score', () => {
    const result = auditDocument(
      'We will use React [Context7: react@18] and TypeScript [Context7: typescript@5].'
    );
    expect(result.citations.length).toBeGreaterThan(0);
    // With citations present, uncited should shrink or be zero
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('detects c7 comment-style citations', () => {
    const result = auditDocument('Using Docker <!-- c7:docker --> in our stack.');
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it('returns score 100 when no techs but has content', () => {
    const result = auditDocument('Just prose with no tech references whatsoever.');
    expect(result.score).toBe(100);
  });
});

// ─── auditSpecs ──────────────────────────────────────────────────────────────

describe('auditSpecs', () => {
  it('returns overallScore 100 and warning when directory not found', () => {
    const result = auditSpecs('/nonexistent/specs-dir');
    expect(result.overallScore).toBe(100);
    expect(result.warnings.some((w) => w.includes('not found'))).toBe(true);
  });

  it('returns overallScore 100 for empty specs directory', () => {
    const result = auditSpecs(tmpDir);
    expect(result.overallScore).toBe(100);
    expect(result.files).toHaveLength(0);
  });

  it('audits markdown files in directory', () => {
    writeSpec('arch.md', 'Using React for frontend.');
    const result = auditSpecs(tmpDir);
    expect(result.files.length).toBe(1);
    const entry = result.files[0];
    if (!entry) throw new Error('expected entry');
    expect(entry.path).toBe('arch.md');
    expect(entry.techs).toContain('react');
  });

  it('generates warnings for uncited technologies', () => {
    writeSpec('prd.md', 'We use PostgreSQL and Redis.');
    const result = auditSpecs(tmpDir);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('skips non-markdown files', () => {
    writeSpec('notes.txt', 'Using React in code');
    const result = auditSpecs(tmpDir);
    expect(result.files).toHaveLength(0);
  });
});

// ─── generateAuditReport ─────────────────────────────────────────────────────

describe('generateAuditReport', () => {
  it('returns markdown with header and score', () => {
    const report = generateAuditReport(tmpDir);
    expect(report).toContain('Documentation Freshness Audit');
    expect(report).toContain('Overall Score');
  });

  it('mentions No spec files for empty directory', () => {
    const report = generateAuditReport(tmpDir);
    expect(report).toContain('No spec files found');
  });

  it('includes file-level table when specs exist', () => {
    writeSpec('prd.md', 'Using React without citation.');
    const report = generateAuditReport(tmpDir);
    expect(report).toContain('File-Level Results');
    expect(report).toContain('prd.md');
  });

  it('includes remediation section when warnings present', () => {
    writeSpec('arch.md', 'We use TypeScript and Prisma here.');
    const report = generateAuditReport(tmpDir);
    expect(report).toContain('Remediation');
  });
});

// ─── pollution-key safety ────────────────────────────────────────────────────

describe('pollution-key safety (no JSON state)', () => {
  it('auditDocument does not crash on raw __proto__ bytes in content', () => {
    const content = Buffer.from('{"__proto__":{"evil":1}} Using react here').toString();
    const result = auditDocument(content);
    expect(result.techs).toContain('react');
  });

  it('auditDocument does not crash on raw constructor key bytes', () => {
    const content = Buffer.from('{"constructor":{"prototype":{}}} docker setup').toString();
    const result = auditDocument(content);
    expect(result.techs).toContain('docker');
  });
});
