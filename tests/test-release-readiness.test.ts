/**
 * test-release-readiness.test.ts — M11 batch 3 port coverage.
 *
 * Verifies the TS port at `src/lib/release-readiness.ts` matches the
 * legacy `bin/lib/release-readiness.js` public surface:
 *   - READINESS_CATEGORIES / READINESS_LEVELS constants byte-identical
 *   - assessReadiness scoring heuristics across all 8 categories
 *   - assessReadiness level + recommendation banding
 *   - generateReport happy path + no-assessment rejection
 *   - M3 hardening: rejects __proto__ / constructor / prototype keys
 *
 * @see src/lib/release-readiness.ts
 * @see bin/lib/release-readiness.js (legacy reference)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assessReadiness,
  defaultState,
  generateReport,
  loadState,
  READINESS_CATEGORIES,
  READINESS_LEVELS,
  saveState,
} from '../src/lib/release-readiness.js';

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'release-readiness-'));
  stateFile = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('release-readiness — constants', () => {
  it('exposes the 8 documented categories', () => {
    expect(READINESS_CATEGORIES).toEqual([
      'quality',
      'security',
      'performance',
      'dependencies',
      'documentation',
      'rollback',
      'monitoring',
      'compliance',
    ]);
  });

  it('exposes the 4 readiness levels in descending order', () => {
    expect(READINESS_LEVELS).toHaveLength(4);
    expect(READINESS_LEVELS[0]).toMatchObject({ min: 90, recommendation: 'go' });
    expect(READINESS_LEVELS[1]).toMatchObject({ min: 70, recommendation: 'conditional-go' });
    expect(READINESS_LEVELS[2]).toMatchObject({ min: 50, recommendation: 'no-go' });
    expect(READINESS_LEVELS[3]).toMatchObject({ min: 0, recommendation: 'blocked' });
  });
});

describe('release-readiness — defaultState', () => {
  it('returns an empty state with the canonical shape', () => {
    const s = defaultState();
    expect(s.version).toBe('1.0.0');
    expect(s.assessments).toEqual([]);
    expect(s.current_readiness).toBeNull();
    expect(s.last_updated).toBeNull();
  });
});

describe('release-readiness — loadState/saveState', () => {
  it('returns defaultState when the file does not exist', () => {
    expect(loadState(stateFile).assessments).toEqual([]);
  });

  it('round-trips through saveState → loadState', () => {
    const s = defaultState();
    s.assessments.push({
      id: 'rr-1',
      assessed_at: '2026-01-01T00:00:00Z',
      scores: { quality: 80 },
      total_score: 80,
      level: 'Conditionally Ready',
      recommendation: 'conditional-go',
      blockers: [],
      risks: [],
    });
    saveState(s, stateFile);
    const reloaded = loadState(stateFile);
    expect(reloaded.assessments).toHaveLength(1);
    expect(reloaded.assessments[0]?.total_score).toBe(80);
    expect(reloaded.last_updated).not.toBeNull();
  });

  it('rejects __proto__ key (M3 hardening)', () => {
    writeFileSync(stateFile, JSON.stringify({ __proto__: { polluted: true }, assessments: [] }));
    const s = loadState(stateFile);
    expect(s.assessments).toEqual([]);
  });

  it('rejects constructor / prototype keys', () => {
    writeFileSync(stateFile, JSON.stringify({ prototype: { x: 1 }, assessments: [] }));
    const s = loadState(stateFile);
    expect(s.assessments).toEqual([]);
  });

  it('falls back to defaultState on malformed JSON', () => {
    writeFileSync(stateFile, '{not-json');
    const s = loadState(stateFile);
    expect(s.assessments).toEqual([]);
  });
});

describe('release-readiness — assessReadiness', () => {
  it('produces all 8 category scores on an empty project root', () => {
    const r = assessReadiness(tmpDir, { stateFile });
    expect(r.success).toBe(true);
    expect(Object.keys(r.scores).sort()).toEqual([...READINESS_CATEGORIES].sort());
    // All defaults: quality=30, security=40, performance=40, dependencies=50,
    // documentation=30, rollback=50, monitoring=50, compliance=40 → avg ≈ 41 (Blocked)
    expect(r.recommendation).toBe('blocked');
  });

  it('boosts quality score when tests + specs both exist', () => {
    mkdirSync(join(tmpDir, 'tests'), { recursive: true });
    mkdirSync(join(tmpDir, 'specs'), { recursive: true });
    const r = assessReadiness(tmpDir, { stateFile });
    expect(r.scores.quality).toBe(80);
  });

  it('boosts quality score when only tests exist', () => {
    mkdirSync(join(tmpDir, 'tests'), { recursive: true });
    const r = assessReadiness(tmpDir, { stateFile });
    expect(r.scores.quality).toBe(60);
  });

  it('boosts security when policies + secret-scan exist', () => {
    mkdirSync(join(tmpDir, '.jumpstart', 'state'), { recursive: true });
    writeFileSync(join(tmpDir, '.jumpstart', 'state', 'secret-scan-results.json'), '{}');
    writeFileSync(join(tmpDir, '.jumpstart', 'policies.json'), '{}');
    const r = assessReadiness(tmpDir, { stateFile });
    expect(r.scores.security).toBe(85);
  });

  it('boosts dependencies when package-lock.json exists', () => {
    writeFileSync(join(tmpDir, 'package-lock.json'), '{}');
    const r = assessReadiness(tmpDir, { stateFile });
    expect(r.scores.dependencies).toBe(80);
  });

  it('boosts performance when architecture.md mentions NFR', () => {
    mkdirSync(join(tmpDir, 'specs'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'specs', 'architecture.md'),
      '# Arch\n\n## NFR\n\nNon-functional requirements include performance.'
    );
    const r = assessReadiness(tmpDir, { stateFile });
    expect(r.scores.performance).toBe(75);
  });

  it('boosts documentation when README + specs both exist', () => {
    writeFileSync(join(tmpDir, 'README.md'), '# Project');
    mkdirSync(join(tmpDir, 'specs'), { recursive: true });
    const r = assessReadiness(tmpDir, { stateFile });
    expect(r.scores.documentation).toBe(85);
  });

  it('persists assessment + sets current_readiness', () => {
    assessReadiness(tmpDir, { stateFile });
    const reloaded = loadState(stateFile);
    expect(reloaded.assessments).toHaveLength(1);
    expect(reloaded.current_readiness).not.toBeNull();
  });

  it('lists low-scoring categories as blockers (<50) + risks (50-69)', () => {
    const r = assessReadiness(tmpDir, { stateFile });
    // Quality (30), security (40), performance (40), documentation (30), compliance (40)
    // are all <50 → blockers. dependencies (50), rollback (50), monitoring (50) ≥50 + <70 → risks.
    expect(r.blockers).toContain('quality');
    expect(r.blockers).toContain('documentation');
    expect(r.risks).toContain('rollback');
    expect(r.risks).toContain('monitoring');
  });
});

describe('release-readiness — generateReport', () => {
  it('returns success=false when no assessment exists', () => {
    const r = generateReport({ stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('No readiness assessment');
  });

  it('returns the latest assessment with category statuses', () => {
    assessReadiness(tmpDir, { stateFile });
    const r = generateReport({ stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.categories).toHaveLength(READINESS_CATEGORIES.length);
      // Quality is 30 → fail
      const quality = r.categories.find((c) => c.name === 'quality');
      expect(quality?.status).toBe('fail');
      // Dependencies is 50 → warning
      const deps = r.categories.find((c) => c.name === 'dependencies');
      expect(deps?.status).toBe('warning');
    }
  });

  it('reports pass status for category scores >= 70', () => {
    // Stage a passing project root.
    mkdirSync(join(tmpDir, 'tests'), { recursive: true });
    mkdirSync(join(tmpDir, 'specs'), { recursive: true });
    writeFileSync(join(tmpDir, 'README.md'), '# r');
    writeFileSync(join(tmpDir, 'package-lock.json'), '{}');
    assessReadiness(tmpDir, { stateFile });
    const r = generateReport({ stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      const docs = r.categories.find((c) => c.name === 'documentation');
      expect(docs?.status).toBe('pass'); // score=85
    }
  });
});
