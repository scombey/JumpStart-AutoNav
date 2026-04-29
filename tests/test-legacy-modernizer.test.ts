/**
 * test-legacy-modernizer.test.ts — M11 batch 3 port coverage.
 *
 * Verifies the TS port at `src/lib/legacy-modernizer.ts` matches the
 * legacy `bin/lib/legacy-modernizer.js` public surface:
 *   - LEGACY_PLATFORMS / MODERNIZATION_PATTERNS constants byte-identical
 *   - assessSystem validation, ID generation, unknown-platform fallback
 *   - createPlan happy path + assessment-not-found rejection + default phases
 *   - generateReport aggregation by platform + risk
 *   - M3 hardening: rejects __proto__ / constructor / prototype keys
 *
 * @see src/lib/legacy-modernizer.ts
 * @see bin/lib/legacy-modernizer.js (legacy reference)
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assessSystem,
  createPlan,
  defaultState,
  generateReport,
  LEGACY_PLATFORMS,
  loadState,
  MODERNIZATION_PATTERNS,
  saveState,
} from '../src/lib/legacy-modernizer.js';

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'legacy-modernizer-'));
  stateFile = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('legacy-modernizer — constants', () => {
  it('exposes the 8 documented platforms with risk + strategy + effort', () => {
    expect(Object.keys(LEGACY_PLATFORMS)).toEqual([
      'cobol',
      'dotnet-framework',
      'java-monolith',
      'ssis',
      'angular-legacy',
      'react-legacy',
      'jquery',
      'php-legacy',
    ]);
    expect(LEGACY_PLATFORMS.cobol).toEqual({
      risk: 'high',
      strategy: 'strangler-fig',
      estimated_effort: 'very-high',
    });
    expect(LEGACY_PLATFORMS['react-legacy']).toEqual({
      risk: 'low',
      strategy: 'in-place',
      estimated_effort: 'low',
    });
  });

  it('exposes the 5 documented modernization patterns', () => {
    expect(MODERNIZATION_PATTERNS).toEqual([
      'strangler-fig',
      'phased-cutover',
      'big-bang',
      'in-place',
      'rewrite',
    ]);
  });
});

describe('legacy-modernizer — defaultState', () => {
  it('returns an empty state with the canonical shape', () => {
    const s = defaultState();
    expect(s.version).toBe('1.0.0');
    expect(s.assessments).toEqual([]);
    expect(s.modernization_plans).toEqual([]);
    expect(s.last_updated).toBeNull();
    expect(s.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('legacy-modernizer — loadState/saveState', () => {
  it('returns defaultState when the file does not exist', () => {
    expect(loadState(stateFile).assessments).toEqual([]);
  });

  it('round-trips through saveState → loadState', () => {
    const s = defaultState();
    s.assessments.push({
      id: 'LEG-001',
      name: 'mainframe',
      platform: 'cobol',
      age_years: 30,
      loc: 100000,
      risk_level: 'high',
      recommended_strategy: 'strangler-fig',
      estimated_effort: 'very-high',
      modernization_targets: ['cloud-native'],
      assessed_at: '2026-01-01T00:00:00Z',
    });
    saveState(s, stateFile);
    const reloaded = loadState(stateFile);
    expect(reloaded.assessments).toHaveLength(1);
    expect(reloaded.assessments[0]?.name).toBe('mainframe');
    expect(reloaded.last_updated).not.toBeNull();
  });

  it('rejects __proto__ key (M3 hardening)', () => {
    writeFileSync(stateFile, JSON.stringify({ __proto__: { polluted: true }, assessments: [] }));
    const s = loadState(stateFile);
    expect(s.assessments).toEqual([]);
  });

  it('rejects constructor / prototype keys', () => {
    writeFileSync(stateFile, JSON.stringify({ constructor: { x: 1 }, assessments: [] }));
    const s = loadState(stateFile);
    expect(s.assessments).toEqual([]);
  });

  it('falls back to defaultState on malformed JSON', () => {
    writeFileSync(stateFile, '{not-json');
    const s = loadState(stateFile);
    expect(s.assessments).toEqual([]);
  });
});

describe('legacy-modernizer — assessSystem', () => {
  it('creates an assessment with zero-padded ID + lowered platform key', () => {
    const r = assessSystem({ name: 'monolith', platform: 'JAVA-MONOLITH' }, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.assessment.id).toBe('LEG-001');
      expect(r.assessment.platform).toBe('java-monolith');
      expect(r.assessment.risk_level).toBe('medium');
      expect(r.assessment.recommended_strategy).toBe('strangler-fig');
    }
  });

  it('falls back to medium-risk + phased-cutover for unknown platforms', () => {
    const r = assessSystem({ name: 'foo', platform: 'unknown-thing' }, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.assessment.risk_level).toBe('medium');
      expect(r.assessment.recommended_strategy).toBe('phased-cutover');
      expect(r.assessment.estimated_effort).toBe('medium');
    }
  });

  it('rejects missing system input', () => {
    const r = assessSystem(null, { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects missing name', () => {
    const r = assessSystem({ name: '', platform: 'cobol' }, { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects missing platform', () => {
    const r = assessSystem({ name: 'x', platform: '' }, { stateFile });
    expect(r.success).toBe(false);
  });

  it('increments the ID for each new assessment', () => {
    assessSystem({ name: 'a', platform: 'cobol' }, { stateFile });
    const r = assessSystem({ name: 'b', platform: 'jquery' }, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.assessment.id).toBe('LEG-002');
  });

  it('accepts age_years + loc + modernization_targets', () => {
    const r = assessSystem(
      { name: 'm', platform: 'cobol', age_years: 25, loc: 50000, modernization_targets: ['k8s'] },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.assessment.age_years).toBe(25);
      expect(r.assessment.loc).toBe(50000);
      expect(r.assessment.modernization_targets).toEqual(['k8s']);
    }
  });
});

describe('legacy-modernizer — createPlan', () => {
  it('creates a plan with the canonical 5 default phases', () => {
    const a = assessSystem({ name: 'm', platform: 'cobol' }, { stateFile });
    if (!a.success) throw new Error('setup');
    const r = createPlan(a.assessment.id, {}, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.plan.id).toBe('MOD-001');
      expect(r.plan.phases).toHaveLength(5);
      expect(r.plan.phases[0]).toMatchObject({ order: 1, name: 'assess', status: 'pending' });
      expect(r.plan.target_platform).toBe('modern-stack');
      expect(r.plan.strategy).toBe('strangler-fig');
    }
  });

  it('honours custom phases (string + object both)', () => {
    const a = assessSystem({ name: 'm', platform: 'cobol' }, { stateFile });
    if (!a.success) throw new Error('setup');
    const r = createPlan(
      a.assessment.id,
      { phases: ['scope', { name: 'lift' }, { name: 'shift' }] },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.plan.phases).toHaveLength(3);
      expect(r.plan.phases[0]?.name).toBe('scope');
      expect(r.plan.phases[1]?.name).toBe('lift');
    }
  });

  it('rejects unknown assessment id', () => {
    const r = createPlan('LEG-XYZ', {}, { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Assessment not found');
  });

  it('honours custom target_platform + timeline', () => {
    const a = assessSystem({ name: 'm', platform: 'cobol' }, { stateFile });
    if (!a.success) throw new Error('setup');
    const r = createPlan(
      a.assessment.id,
      { target_platform: 'kubernetes', timeline: 'Q3 2026' },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.plan.target_platform).toBe('kubernetes');
      expect(r.plan.timeline).toBe('Q3 2026');
    }
  });
});

describe('legacy-modernizer — generateReport', () => {
  it('aggregates by platform + risk', () => {
    assessSystem({ name: 'a', platform: 'cobol' }, { stateFile });
    assessSystem({ name: 'b', platform: 'cobol' }, { stateFile });
    assessSystem({ name: 'c', platform: 'jquery' }, { stateFile });
    const a = assessSystem({ name: 'd', platform: 'cobol' }, { stateFile });
    if (!a.success) throw new Error('setup');
    createPlan(a.assessment.id, {}, { stateFile });

    const r = generateReport({ stateFile });
    expect(r.total_assessments).toBe(4);
    expect(r.total_plans).toBe(1);
    expect(r.by_platform.cobol).toBe(3);
    expect(r.by_platform.jquery).toBe(1);
    expect(r.by_risk.high).toBe(3);
    expect(r.by_risk.low).toBe(1);
  });

  it('returns zeroed counts on empty state', () => {
    const r = generateReport({ stateFile });
    expect(r.total_assessments).toBe(0);
    expect(r.total_plans).toBe(0);
    expect(r.assessments).toEqual([]);
  });
});
