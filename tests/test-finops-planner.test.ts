/**
 * test-finops-planner.test.ts — M11 batch 5 port coverage.
 *
 * Verifies the TS port at `src/lib/finops-planner.ts` matches the
 * legacy `bin/lib/finops-planner.js` public surface:
 *   - defaultState shape
 *   - loadState / saveState round-trip + defaultState fallback
 *   - createEstimate validation, breakdown math, persistence
 *   - getOptimizations heuristics (compute/storage/ai-ml thresholds)
 *   - generateReport totals + by-category aggregation
 *   - COST_CATEGORIES + CLOUD_PRICING_ESTIMATES constants
 *   - M3 hardening: pollution-key state payloads fall back to default
 *
 * @see src/lib/finops-planner.ts
 * @see bin/lib/finops-planner.js (legacy reference)
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLOUD_PRICING_ESTIMATES,
  COST_CATEGORIES,
  createEstimate,
  defaultState,
  generateReport,
  getOptimizations,
  loadState,
  saveState,
} from '../src/lib/finops-planner.js';

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finops-'));
  mkdirSync(join(tmpDir, '.jumpstart', 'state'), { recursive: true });
  stateFile = join(tmpDir, '.jumpstart', 'state', 'finops.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('finops-planner — constants', () => {
  it('exports COST_CATEGORIES with 8 entries', () => {
    expect(COST_CATEGORIES.length).toBe(8);
    expect(COST_CATEGORIES).toContain('compute');
    expect(COST_CATEGORIES).toContain('storage');
    expect(COST_CATEGORIES).toContain('ai-ml');
    expect(COST_CATEGORIES).toContain('licensing');
  });

  it('exports CLOUD_PRICING_ESTIMATES with low/medium/high tiers', () => {
    expect(CLOUD_PRICING_ESTIMATES.compute).toEqual({
      unit: 'vCPU-hour',
      low: 0.02,
      medium: 0.05,
      high: 0.1,
    });
    expect(CLOUD_PRICING_ESTIMATES.storage?.medium).toBe(0.023);
    expect(CLOUD_PRICING_ESTIMATES['ai-ml']?.high).toBe(0.06);
  });
});

describe('finops-planner — defaultState', () => {
  it('returns canonical default shape', () => {
    const s = defaultState();
    expect(s.version).toBe('1.0.0');
    expect(s.estimates).toEqual([]);
    expect(s.budgets).toEqual([]);
    expect(s.optimizations).toEqual([]);
    expect(s.last_updated).toBeNull();
    expect(typeof s.created_at).toBe('string');
  });
});

describe('finops-planner — loadState / saveState', () => {
  it('returns defaultState when file missing', () => {
    const s = loadState(stateFile);
    expect(s.version).toBe('1.0.0');
    expect(s.estimates).toEqual([]);
  });

  it('round-trips a saved state', () => {
    const s = defaultState();
    s.estimates.push({
      id: 'FIN-TEST',
      name: 'X',
      breakdown: [],
      monthly_total: 0,
      annual_total: 0,
      created_at: 'now',
    });
    saveState(s, stateFile);
    const loaded = loadState(stateFile);
    expect(loaded.estimates).toHaveLength(1);
    expect(loaded.estimates[0]?.id).toBe('FIN-TEST');
    expect(loaded.last_updated).toBeTruthy();
  });

  it('falls back to defaultState on corrupt JSON', () => {
    writeFileSync(stateFile, '{not json', 'utf8');
    const s = loadState(stateFile);
    expect(s.estimates).toEqual([]);
  });

  it('falls back to defaultState on top-level array', () => {
    writeFileSync(stateFile, '[]', 'utf8');
    expect(loadState(stateFile).estimates).toEqual([]);
  });

  it('M3 hardening: rejects raw __proto__ payload, returns default', () => {
    writeFileSync(stateFile, '{"__proto__":{"polluted":true},"version":"1.0.0"}', 'utf8');
    const s = loadState(stateFile);
    expect(s.estimates).toEqual([]);
  });

  it('M3 hardening: rejects raw constructor payload', () => {
    writeFileSync(stateFile, '{"constructor":{"polluted":true},"version":"1.0.0"}', 'utf8');
    const s = loadState(stateFile);
    expect(s.estimates).toEqual([]);
  });

  it('M3 hardening: rejects nested __proto__ in estimates', () => {
    writeFileSync(stateFile, '{"version":"1.0.0","estimates":[{"__proto__":{"x":1}}]}', 'utf8');
    const s = loadState(stateFile);
    expect(s.estimates).toEqual([]);
  });

  it('saveState creates parent dir if missing', () => {
    const nested = join(tmpDir, 'deep', 'nested', 'finops.json');
    saveState(defaultState(), nested);
    expect(existsSync(nested)).toBe(true);
  });

  it('saveState updates last_updated timestamp', () => {
    const s = defaultState();
    saveState(s, stateFile);
    expect(s.last_updated).toBeTruthy();
    const reloaded = loadState(stateFile);
    expect(reloaded.last_updated).toBe(s.last_updated);
  });
});

describe('finops-planner — createEstimate', () => {
  it('rejects without estimate name', () => {
    const r = createEstimate({}, { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/name/);
  });

  it('rejects null estimate', () => {
    const r = createEstimate(null, { stateFile });
    expect(r.success).toBe(false);
  });

  it('creates estimate with compute components (rate * quantity * hours)', () => {
    const r = createEstimate(
      {
        name: 'API',
        components: [{ name: 'srv', category: 'compute', tier: 'medium', quantity: 2 }],
      },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.estimate.id).toMatch(/^FIN-/);
      // medium=0.05, qty=2, hours=730 → 73 monthly
      expect(r.estimate.breakdown[0]?.monthly_cost).toBe(73);
      expect(r.estimate.monthly_total).toBe(73);
      expect(r.estimate.annual_total).toBe(876);
    }
  });

  it('storage uses rate * quantity (no hours multiplier)', () => {
    const r = createEstimate(
      {
        name: 'Data',
        components: [{ name: 's3', category: 'storage', tier: 'low', quantity: 100 }],
      },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      // low=0.01, qty=100 → 1.00
      expect(r.estimate.breakdown[0]?.monthly_cost).toBe(1);
    }
  });

  it('monitoring uses rate * quantity (no hours multiplier)', () => {
    const r = createEstimate(
      {
        name: 'Mon',
        components: [{ name: 'logs', category: 'monitoring', tier: 'low', quantity: 10 }],
      },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      // low=0.25, qty=10 → 2.50
      expect(r.estimate.breakdown[0]?.monthly_cost).toBe(2.5);
    }
  });

  it('uses manual monthly_cost for unknown categories', () => {
    const r = createEstimate(
      {
        name: 'Custom',
        components: [{ name: 'saas', category: 'third-party', monthly_cost: 99.99 }],
      },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.estimate.breakdown[0]?.monthly_cost).toBe(99.99);
  });

  it('falls back to 0 for unknown category with no manual cost', () => {
    const r = createEstimate(
      { name: 'X', components: [{ name: 'opaque', category: 'third-party' }] },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.estimate.breakdown[0]?.monthly_cost).toBe(0);
  });

  it('persists estimate to state file', () => {
    createEstimate({ name: 'Svc1', components: [] }, { stateFile });
    const s = loadState(stateFile);
    expect(s.estimates).toHaveLength(1);
    expect(s.estimates[0]?.name).toBe('Svc1');
  });

  it('coerces unknown tier to medium', () => {
    const r = createEstimate(
      {
        name: 'X',
        components: [{ name: 'srv', category: 'compute', tier: 'bogus' as 'low', quantity: 1 }],
      },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      // medium=0.05, qty=1, hours=730 → 36.5
      expect(r.estimate.breakdown[0]?.monthly_cost).toBe(36.5);
    }
  });

  it('defaults quantity to 1 when omitted', () => {
    const r = createEstimate(
      { name: 'X', components: [{ name: 'srv', category: 'compute', tier: 'medium' }] },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.estimate.breakdown[0]?.quantity).toBe(1);
  });

  it('defaults hours_per_month to 730 when omitted', () => {
    const r = createEstimate(
      {
        name: 'X',
        components: [{ name: 'srv', category: 'compute', tier: 'medium', quantity: 1 }],
      },
      { stateFile }
    );
    expect(r.success).toBe(true);
    // 0.05 * 1 * 730 = 36.5
    if (r.success) expect(r.estimate.breakdown[0]?.monthly_cost).toBe(36.5);
  });

  it('rounds monthly_total to 2 decimals', () => {
    const r = createEstimate(
      {
        name: 'X',
        components: [
          { name: 'a', category: 'compute', tier: 'low', quantity: 3 },
          { name: 'b', category: 'compute', tier: 'low', quantity: 7 },
        ],
      },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      // The total should always be expressible in 2 decimals.
      const dec = (r.estimate.monthly_total.toString().split('.')[1] ?? '').length;
      expect(dec).toBeLessThanOrEqual(2);
    }
  });
});

describe('finops-planner — getOptimizations', () => {
  it('returns empty recommendations when no estimates', () => {
    const r = getOptimizations({ stateFile });
    expect(r.total).toBe(0);
    expect(r.recommendations).toEqual([]);
  });

  it('recommends reserved/spot for expensive compute (>$500)', () => {
    const s = defaultState();
    s.estimates.push({
      id: 'FIN-1',
      name: 'API',
      breakdown: [{ name: 'srv', category: 'compute', quantity: 1, monthly_cost: 600 }],
      monthly_total: 600,
      annual_total: 7200,
      created_at: 'now',
    });
    saveState(s, stateFile);
    const r = getOptimizations({ stateFile });
    expect(r.total).toBe(1);
    expect(r.recommendations[0]?.recommendation).toMatch(/reserved/);
    expect(r.recommendations[0]?.potential_savings).toBe('30-60%');
  });

  it('does NOT recommend for compute at exactly $500', () => {
    const s = defaultState();
    s.estimates.push({
      id: 'FIN-1',
      name: 'API',
      breakdown: [{ name: 'srv', category: 'compute', quantity: 1, monthly_cost: 500 }],
      monthly_total: 500,
      annual_total: 6000,
      created_at: 'now',
    });
    saveState(s, stateFile);
    const r = getOptimizations({ stateFile });
    expect(r.total).toBe(0);
  });

  it('recommends storage tiering for expensive storage (>$100)', () => {
    const s = defaultState();
    s.estimates.push({
      id: 'FIN-2',
      name: 'Data',
      breakdown: [{ name: 'blob', category: 'storage', quantity: 1, monthly_cost: 150 }],
      monthly_total: 150,
      annual_total: 1800,
      created_at: 'now',
    });
    saveState(s, stateFile);
    const r = getOptimizations({ stateFile });
    expect(r.total).toBe(1);
    expect(r.recommendations[0]?.recommendation).toMatch(/tiering/);
  });

  it('recommends batching for expensive ai-ml (>$200)', () => {
    const s = defaultState();
    s.estimates.push({
      id: 'FIN-3',
      name: 'LLM',
      breakdown: [{ name: 'gpt', category: 'ai-ml', quantity: 1, monthly_cost: 300 }],
      monthly_total: 300,
      annual_total: 3600,
      created_at: 'now',
    });
    saveState(s, stateFile);
    const r = getOptimizations({ stateFile });
    expect(r.total).toBe(1);
    expect(r.recommendations[0]?.recommendation).toMatch(/batch/);
    expect(r.recommendations[0]?.potential_savings).toBe('40-70%');
  });

  it('recommends multiple components in one estimate', () => {
    const s = defaultState();
    s.estimates.push({
      id: 'FIN-4',
      name: 'BigSvc',
      breakdown: [
        { name: 'srv', category: 'compute', quantity: 1, monthly_cost: 800 },
        { name: 'blob', category: 'storage', quantity: 1, monthly_cost: 200 },
      ],
      monthly_total: 1000,
      annual_total: 12000,
      created_at: 'now',
    });
    saveState(s, stateFile);
    const r = getOptimizations({ stateFile });
    expect(r.total).toBe(2);
  });
});

describe('finops-planner — generateReport', () => {
  it('returns zeroed report with no estimates', () => {
    const r = generateReport({ stateFile });
    expect(r.total_estimates).toBe(0);
    expect(r.total_monthly).toBe(0);
    expect(r.total_annual).toBe(0);
    expect(r.by_category).toEqual({});
  });

  it('aggregates by category across multiple estimates', () => {
    createEstimate(
      {
        name: 'A',
        components: [{ name: 'cpu', category: 'compute', tier: 'low', quantity: 1 }],
      },
      { stateFile }
    );
    createEstimate(
      {
        name: 'B',
        components: [{ name: 'disk', category: 'storage', tier: 'low', quantity: 10 }],
      },
      { stateFile }
    );
    const r = generateReport({ stateFile });
    expect(r.total_estimates).toBe(2);
    expect(r.by_category).toHaveProperty('compute');
    expect(r.by_category).toHaveProperty('storage');
    expect(r.total_monthly).toBeGreaterThan(0);
  });

  it('total_annual = total_monthly * 12', () => {
    createEstimate(
      {
        name: 'A',
        components: [{ name: 'cpu', category: 'compute', tier: 'medium', quantity: 1 }],
      },
      { stateFile }
    );
    const r = generateReport({ stateFile });
    expect(r.total_annual).toBe(Math.round(r.total_monthly * 12 * 100) / 100);
  });

  it('returns the underlying estimates array', () => {
    createEstimate({ name: 'X', components: [] }, { stateFile });
    const r = generateReport({ stateFile });
    expect(r.estimates).toHaveLength(1);
    expect(r.estimates[0]?.name).toBe('X');
  });
});
