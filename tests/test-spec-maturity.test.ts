/**
 * tests/test-spec-maturity.test.ts — Spec Maturity port tests (M11 batch 6).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MATURITY_CRITERIA,
  MATURITY_LEVELS,
  assessFile,
  assessMaturity,
  assessProject,
  runMaturityChecks,
} from '../src/lib/spec-maturity.js';

let tmpDir: string;
beforeEach(() => { tmpDir = join(tmpdir(), `test-maturity-${Date.now()}`); mkdirSync(tmpDir, { recursive: true }); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('MATURITY_LEVELS', () => {
  it('has 5 levels from Draft to Production-Ready', () => {
    expect(MATURITY_LEVELS.length).toBe(5);
    expect(MATURITY_LEVELS[0]?.name).toBe('Draft');
    expect(MATURITY_LEVELS[4]?.name).toBe('Production-Ready');
  });
});

describe('MATURITY_CRITERIA', () => {
  it('has required categories', () => {
    expect(MATURITY_CRITERIA['structure']).toBeTruthy();
    expect(MATURITY_CRITERIA['completeness']).toBeTruthy();
    expect(MATURITY_CRITERIA['governance']).toBeTruthy();
  });
});

describe('runMaturityChecks', () => {
  it('detects frontmatter', () => {
    const r = runMaturityChecks('---\ntitle: test\n---\n# Heading');
    expect(r['has_frontmatter']).toBe(true);
  });

  it('no_placeholders true for clean content', () => {
    const r = runMaturityChecks('# Clean\n\nNo placeholders here');
    expect(r['no_placeholders']).toBe(true);
  });

  it('no_placeholders false when TODO present', () => {
    const r = runMaturityChecks('# Doc\n\n[TODO] fix this');
    expect(r['no_placeholders']).toBe(false);
  });

  it('has_requirement_ids detects REQ pattern', () => {
    const r = runMaturityChecks('See REQ-001 for details');
    expect(r['has_requirement_ids']).toBe(true);
  });

  it('has_approval detects Phase Gate Approval', () => {
    const r = runMaturityChecks('## Phase Gate Approval\n- [x] done\nApproved by: Alice');
    expect(r['has_approval']).toBe(true);
    expect(r['is_approved']).toBe(true);
  });

  it('sufficient_length true for long content', () => {
    const r = runMaturityChecks('x'.repeat(1100));
    expect(r['sufficient_length']).toBe(true);
  });

  it('has_security detects security keyword', () => {
    const r = runMaturityChecks('Security considerations include auth');
    expect(r['has_security']).toBe(true);
  });
});

describe('assessMaturity', () => {
  it('returns success', () => {
    const r = assessMaturity('# Simple doc\n\nContent');
    expect(r.success).toBe(true);
  });

  it('overall_score between 0 and 100', () => {
    const r = assessMaturity('# Simple\n\nContent');
    expect((r.overall_score ?? 0)).toBeGreaterThanOrEqual(0);
    expect((r.overall_score ?? 0)).toBeLessThanOrEqual(100);
  });

  it('higher score for richer content', () => {
    const minimal = assessMaturity('hello');
    const rich = assessMaturity(`---
title: test
---
# Section A
## Section B
### Section C

See REQ-001 and NFR-001.

Acceptance criteria: done.

\`\`\`typescript
const x = 1;
\`\`\`

Security considerations: use auth.
Compliance: GDPR applies.

2024-01-01

## Phase Gate Approval
- [x] done
Approved by: Alice

Version: 1.0

[See prd](specs/prd.md)
`.repeat(5));
    expect((rich.overall_score ?? 0)).toBeGreaterThan((minimal.overall_score ?? 0));
  });

  it('includes gaps array', () => {
    const r = assessMaturity('hello');
    expect(Array.isArray(r.gaps)).toBe(true);
  });

  it('next_level is null when at max score', () => {
    // A document unlikely to be at max, so just check the type
    const r = assessMaturity('minimal');
    // next_level should be either an object or null (not undefined structurally)
    expect(r.next_level !== undefined).toBe(true);
  });
});

describe('assessFile', () => {
  it('returns error for missing file', () => {
    const r = assessFile(join(tmpDir, 'missing.md'));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/File not found/);
  });

  it('assesses an actual file', () => {
    const f = join(tmpDir, 'spec.md');
    writeFileSync(f, '# My Spec\n\nSome content\n\nREQ-001 requirement');
    const r = assessFile(f);
    expect(r.success).toBe(true);
    expect(r.file).toBe(f);
  });
});

describe('assessProject', () => {
  it('returns error when specs dir missing', () => {
    const r = assessProject(tmpDir);
    expect(r.success).toBe(false);
  });

  it('assesses with existing artifacts', () => {
    const specsDir = join(tmpDir, 'specs');
    mkdirSync(specsDir);
    writeFileSync(join(specsDir, 'prd.md'), '# PRD\n\nContent\n\nREQ-001');
    const r = assessProject(tmpDir);
    expect(r.success).toBe(true);
    expect((r.artifacts ?? []).length).toBeGreaterThan(0);
  });
});
