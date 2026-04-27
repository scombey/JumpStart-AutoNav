/**
 * test-analyzer-cluster.test.ts — T4.2.4 batch tests.
 *
 * Coverage for the three ports landed together:
 *   - analyzer.ts: analyze(), extractTerms(), extractStoryIds(),
 *     extractTaskIds(), extractNfrIds()
 *   - crossref.ts: extractLinks(), extractAnchors(), validateCrossRefs()
 *   - smell-detector.ts: detectSmells(), scoreSmellDensity(),
 *     scanDirectory(), generateSmellReport(), SMELL_PATTERNS
 *
 * @see bin/lib-ts/analyzer.ts
 * @see bin/lib-ts/crossref.ts
 * @see bin/lib-ts/smell-detector.ts
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  analyze,
  extractNfrIds,
  extractStoryIds,
  extractTaskIds,
  extractTerms,
} from '../bin/lib-ts/analyzer.js';
import { extractAnchors, extractLinks, validateCrossRefs } from '../bin/lib-ts/crossref.js';
import {
  detectSmells,
  generateSmellReport,
  SMELL_PATTERNS,
  scanDirectory,
  scoreSmellDensity,
} from '../bin/lib-ts/smell-detector.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'analyzer-cluster-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSpec(rel: string, body: string): void {
  const full = path.join(tmpDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────
// analyzer.ts
// ─────────────────────────────────────────────────────────────────────────

describe('analyzer — extractStoryIds/extractTaskIds/extractNfrIds', () => {
  it('extracts and dedupes story IDs', () => {
    expect(extractStoryIds('E1-S1, E2-S3, and E1-S1 again')).toEqual(['E1-S1', 'E2-S3']);
  });
  it('extracts and dedupes task IDs', () => {
    expect(extractTaskIds('M1-T01, M2-T05, M1-T01')).toEqual(['M1-T01', 'M2-T05']);
  });
  it('extracts and dedupes NFR IDs', () => {
    expect(extractNfrIds('NFR-PERF-1, NFR-SEC-2, NFR-PERF-1')).toEqual(['NFR-PERF-1', 'NFR-SEC-2']);
  });
});

describe('analyzer — extractTerms', () => {
  it('finds bold Title-Case terms (3-49 chars)', () => {
    const terms = extractTerms('Hello **Spec Engine** and **API Layer**\n');
    expect(terms.get('spec engine')).toBe('Spec Engine');
    expect(terms.get('api layer')).toBe('API Layer');
  });
  it('finds heading terms (H1-H4)', () => {
    const terms = extractTerms('# Title One\n## Sub Heading\n### Component: Validator\n');
    expect(terms.get('title one')).toBe('Title One');
    expect(terms.get('validator')).toBe('Validator');
  });
});

describe('analyzer — analyze()', () => {
  it('reports missing story coverage between PRD and plan/architecture', () => {
    writeSpec('specs/prd.md', '# PRD\nE1-S1, E1-S2\n');
    writeSpec('specs/architecture.md', '# Arch\nE1-S1 only\n');
    writeSpec('specs/implementation-plan.md', '# Plan\nNothing here\n');
    const result = analyze({ root: tmpDir, specs_dir: 'specs/' });
    expect(
      result.missing_coverage.some((m) => m.id === 'E1-S2' && m.type === 'story_not_in_plan')
    ).toBe(true);
    expect(
      result.missing_coverage.some(
        (m) => m.id === 'E1-S2' && m.type === 'story_not_in_architecture'
      )
    ).toBe(true);
  });

  it('flags orphan tasks (task with no nearby story ID)', () => {
    writeSpec('specs/prd.md', 'E1-S1\n');
    writeSpec('specs/implementation-plan.md', '## M1-T01 — does work\n');
    const result = analyze({ root: tmpDir });
    expect(result.missing_coverage.some((m) => m.id === 'M1-T01' && m.type === 'orphan_task')).toBe(
      true
    );
  });

  it('flags entities defined in data-model but missing from contracts', () => {
    writeSpec('specs/data-model.md', '### Entity: User\n### Entity: Order\n');
    writeSpec('specs/contracts.md', '## User contract\n');
    const result = analyze({ root: tmpDir });
    expect(result.contradictions.some((c) => c.description.includes('Order'))).toBe(true);
  });

  it('returns pass=true and score=100 when nothing is wrong', () => {
    writeSpec('specs/prd.md', '');
    const result = analyze({ root: tmpDir });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
  });

  it('Pit Crew M3 Reviewer M3 — story IDs match by word-boundary, not substring', () => {
    // Pre-fix: a task line referencing E1-S10 would falsely "link" to
    // story E1-S1 because String.includes('E1-S1') is true for the
    // 'E1-S10' substring. The plan/PRD here defines E1-S1 only; the
    // task references E1-S10 (a story that does NOT exist in PRD).
    // The task should therefore be flagged as orphan, not silently
    // passed. Post-fix: \b boundary matching catches the false-positive.
    writeSpec('specs/prd.md', 'Only story E1-S1 exists.\n');
    writeSpec(
      'specs/implementation-plan.md',
      ['## M1-T01', 'implements story E1-S10 (does not exist in PRD)', ''].join('\n')
    );
    const result = analyze({ root: tmpDir });
    expect(result.missing_coverage.some((m) => m.id === 'M1-T01' && m.type === 'orphan_task')).toBe(
      true
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// crossref.ts
// ─────────────────────────────────────────────────────────────────────────

describe('crossref — extractLinks', () => {
  it('extracts relative links with anchors and ignores external/anchor-only', () => {
    const md = [
      '[a](./other.md)',
      '[b](./other.md#section)',
      '[ext](https://example.com)',
      '[mail](mailto:x@y.z)',
      '[anchor](#here)',
    ].join('\n');
    const links = extractLinks(md);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ target: './other.md', anchor: null, line: 1 });
    expect(links[1]).toMatchObject({ target: './other.md', anchor: 'section', line: 2 });
  });
});

describe('crossref — extractAnchors', () => {
  it('slugifies headings GitHub-style', () => {
    const anchors = extractAnchors('# Hello World\n## Sub: Item\n### Multi   Word\n');
    expect(anchors).toContain('hello-world');
    expect(anchors).toContain('sub-item');
    expect(anchors).toContain('multi-word');
  });
});

describe('crossref — validateCrossRefs', () => {
  it('returns error envelope when specsDir missing', () => {
    const r = validateCrossRefs('no-such-specs', tmpDir);
    expect(r.error).toMatch(/Specs directory not found/);
  });

  it('reports broken file targets and missing anchors', () => {
    writeSpec('specs/a.md', '[broken](./nope.md)\n[anchor-bad](./b.md#nope)\n');
    writeSpec('specs/b.md', '# Real Heading\n');
    const r = validateCrossRefs('specs/', tmpDir);
    expect(r.broken_links.some((b) => b.reason.includes('Target file not found'))).toBe(true);
    expect(r.broken_links.some((b) => b.reason.includes('Anchor not found'))).toBe(true);
  });

  it('passes when all links resolve', () => {
    writeSpec('specs/a.md', '[ok](./b.md)\n');
    writeSpec('specs/b.md', '# heading\n');
    const r = validateCrossRefs('specs/', tmpDir);
    expect(r.broken_links).toEqual([]);
    expect(r.pass).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// smell-detector.ts
// ─────────────────────────────────────────────────────────────────────────

describe('smell-detector — SMELL_PATTERNS', () => {
  it('exports the canonical smell keys', () => {
    const keys = Object.keys(SMELL_PATTERNS);
    expect(keys).toContain('vague-quantifier');
    expect(keys).toContain('hedge-word');
    expect(keys).toContain('undefined-acronym');
    expect(keys).toContain('missing-owner');
    expect(keys).toContain('unbounded-list');
    expect(keys).toContain('dangling-reference');
    expect(keys).toContain('wishful-thinking');
  });
});

describe('smell-detector — detectSmells', () => {
  it('flags vague quantifiers and hedge words', () => {
    const r = detectSmells('We will support several users and might add caching later.\n');
    expect(r.count).toBeGreaterThanOrEqual(2);
    expect(r.smells.some((s) => s.type === 'vague-quantifier')).toBe(true);
    expect(r.smells.some((s) => s.type === 'hedge-word')).toBe(true);
  });

  it('skips code blocks', () => {
    const r = detectSmells('```\nseveral users might be ok\n```\n\nplain prose has no smell.\n');
    expect(r.smells.some((s) => s.line >= 2 && s.line <= 3)).toBe(false);
  });

  it('skips YAML frontmatter', () => {
    const r = detectSmells('---\nseveral: yes\nmight: maybe\n---\nclean prose\n');
    // Lines 2-3 are inside frontmatter and should NOT be smelled
    expect(r.smells.some((s) => s.line === 2 || s.line === 3)).toBe(false);
  });

  it('excludes well-known acronyms from undefined-acronym', () => {
    const r = detectSmells('We expose a REST API over HTTPS using JSON.\n');
    expect(r.smells.some((s) => s.type === 'undefined-acronym')).toBe(false);
  });

  it('flags unknown acronyms as undefined-acronym', () => {
    const r = detectSmells('The XYZQ subsystem talks to the WIFE service.\n');
    expect(r.smells.some((s) => s.type === 'undefined-acronym' && s.text === 'XYZQ')).toBe(true);
  });
});

describe('smell-detector — scoreSmellDensity', () => {
  it('returns 0 density when no prose lines', () => {
    const r = scoreSmellDensity('');
    expect(r.density).toBe(0);
    expect(r.prose_lines).toBe(0);
  });

  it('computes density per-100 prose lines', () => {
    // 1 prose line, 1 smell -> 100 per 100 lines
    const r = scoreSmellDensity('several users\n');
    expect(r.smell_count).toBeGreaterThan(0);
    expect(r.density).toBe(100);
  });
});

describe('smell-detector — scanDirectory', () => {
  it('returns empty + pass when dir missing', () => {
    expect(scanDirectory(path.join(tmpDir, 'no-such'))).toEqual({
      files: [],
      total_smells: 0,
      pass: true,
    });
  });

  it('honors threshold (default 5) and reports per-file densities', () => {
    writeSpec('clean.md', 'Plain text without smells.\n');
    writeSpec('smelly.md', 'several users might be ok\n');
    const r = scanDirectory(tmpDir);
    expect(r.files.length).toBe(2);
    expect(r.pass).toBe(false); // smelly.md exceeds threshold of 5
  });
});

describe('smell-detector — generateSmellReport', () => {
  it('returns "No spec smells" header when count=0', () => {
    writeSpec('clean.md', 'Plain prose.\n');
    const report = generateSmellReport(path.join(tmpDir, 'clean.md'));
    expect(report).toContain('Spec Smell Report:');
    expect(report).toContain('No spec smells detected');
  });

  it('groups smells by type with severity in the heading', () => {
    writeSpec('smelly.md', 'several users might be ok and so on\n');
    const report = generateSmellReport(path.join(tmpDir, 'smelly.md'));
    expect(report).toMatch(/##\s+vague-quantifier/);
    expect(report).toMatch(/##\s+hedge-word/);
  });
});
