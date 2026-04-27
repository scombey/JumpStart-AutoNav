/**
 * test-spec-drift.test.ts — T4.2.3 unit tests.
 *
 * Coverage:
 *   - extractStoryIds / extractTaskIds / extractComponents (regex parity)
 *   - checkSpecDrift (PRD↔Arch↔Plan cross-refs)
 *   - checkCodeTraceability (planned-files resolution)
 *
 * @see bin/lib-ts/spec-drift.ts
 * @see bin/lib/spec-drift.js (legacy reference)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkCodeTraceability,
  checkSpecDrift,
  extractComponents,
  extractStoryIds,
  extractTaskIds,
} from '../bin/lib-ts/spec-drift.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'spec-drift-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSpec(name: string, body: string): string {
  const full = path.join(tmpDir, name);
  writeFileSync(full, body, 'utf8');
  return full;
}

describe('extractStoryIds', () => {
  it('extracts and dedupes story IDs', () => {
    expect(extractStoryIds('See E1-S1, E2-S3, and E1-S1 again')).toEqual(['E1-S1', 'E2-S3']);
  });
  it('returns empty when none', () => {
    expect(extractStoryIds('no stories here')).toEqual([]);
  });
});

describe('extractTaskIds', () => {
  it('extracts and dedupes task IDs', () => {
    expect(extractTaskIds('M1-T01 and M2-T05 and M1-T01')).toEqual(['M1-T01', 'M2-T05']);
  });
});

describe('extractComponents', () => {
  it('extracts component names from "### Component:" lines', () => {
    const md = '### Component: Validator\nblah\n### Component: Graph Engine\n';
    expect(extractComponents(md)).toEqual(['Validator', 'Graph Engine']);
  });
});

describe('checkSpecDrift', () => {
  it('reports missing-reference drift for PRD stories absent from Architecture/Plan', () => {
    writeSpec('prd.md', '# PRD\nE1-S1, E1-S2\n');
    writeSpec('architecture.md', '# Arch\nE1-S1 only\n');
    writeSpec('implementation-plan.md', '# Plan\n');

    const report = checkSpecDrift(tmpDir);
    expect(report.drifts.length).toBeGreaterThanOrEqual(2);
    expect(
      report.drifts.some((d) => d.detail.includes('E1-S2') && d.target === 'architecture.md')
    ).toBe(true);
    expect(
      report.drifts.some((d) => d.detail.includes('E1-S2') && d.target === 'implementation-plan.md')
    ).toBe(true);
  });

  it('reports component drift between Architecture and Plan', () => {
    writeSpec('prd.md', '');
    writeSpec('architecture.md', '### Component: Validator\n### Component: Graph Engine\n');
    writeSpec('implementation-plan.md', '# Plan\nWe build Validator only\n');

    const report = checkSpecDrift(tmpDir);
    expect(report.drifts.some((d) => d.detail.includes('Graph Engine'))).toBe(true);
  });

  it('returns empty drifts when all stories+components cross-referenced', () => {
    writeSpec('prd.md', 'E1-S1\n');
    writeSpec('architecture.md', '### Component: Validator\nE1-S1\n');
    writeSpec('implementation-plan.md', 'Validator implements E1-S1\n');

    const report = checkSpecDrift(tmpDir);
    expect(report.drifts).toEqual([]);
    expect(report.summary).toMatch(/No spec drift/);
  });

  it('warns on orphan tasks with no story reference', () => {
    writeSpec('prd.md', '');
    writeSpec('architecture.md', '');
    writeSpec(
      'implementation-plan.md',
      [
        '### Task M1-T01',
        '**Story Reference** | None',
        '',
        '### Task M1-T02',
        '**Story Reference** | E1-S1',
      ].join('\n')
    );
    const report = checkSpecDrift(tmpDir);
    expect(report.warnings.some((w) => w.includes('M1-T01'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('M1-T02'))).toBe(false);
  });

  it('warns when spec file is missing', () => {
    // No files written
    const report = checkSpecDrift(tmpDir);
    expect(report.warnings.some((w) => w.includes('prd not found'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('architecture not found'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('plan not found'))).toBe(true);
  });
});

describe('checkCodeTraceability', () => {
  it('returns "Source or plan not found." when missing', () => {
    const report = checkCodeTraceability(
      path.join(tmpDir, 'no-such-src'),
      path.join(tmpDir, 'no-plan.md')
    );
    expect(report.unmapped).toEqual([]);
    expect(report.summary).toMatch(/not found/);
  });

  it('reports planned files that are not yet on disk', () => {
    // Setup: a fake project root with src/ + a plan listing two files
    const projectRoot = tmpDir;
    const srcDir = path.join(projectRoot, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, 'present.ts'), '// exists');
    const planPath = path.join(projectRoot, 'plan.md');
    writeFileSync(
      planPath,
      ['**Files** | src/present.ts, src/missing.ts', '**Files** | -', ''].join('\n')
    );
    const report = checkCodeTraceability(srcDir, planPath);
    expect(report.unmapped).toEqual(['src/missing.ts']);
    expect(report.summary).toMatch(/1 planned file/);
  });
});
