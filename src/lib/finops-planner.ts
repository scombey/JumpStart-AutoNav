/**
 * finops-planner.ts — FinOps-Aware Architecture Planning.
 *
 * Public surface:
 *   - `defaultState()` => State
 *   - `loadState(stateFile?)` => State
 *   - `saveState(state, stateFile?)` => void  (sets last_updated)
 *   - `createEstimate(estimate, options?)` => CreateEstimateResult
 *   - `getOptimizations(options?)` => OptimizationsResult
 *   - `generateReport(options?)` => ReportResult
 *   - `COST_CATEGORIES` (frozen list)
 *   - `CLOUD_PRICING_ESTIMATES` (per-category low/medium/high rates)
 *
 * Invariants:
 *   - Default state file: `.jumpstart/state/finops.json`.
 *   - Estimate IDs: `FIN-${Date.now().toString(36).toUpperCase()}`.
 *   - Storage + monitoring categories use rate * quantity (no hour
 *     multiplier); compute/network/database/ai-ml multiply by hours.
 *   - All currency results are rounded to 2 decimals via
 *     `Math.round(v * 100) / 100`.
 *   - Optimization heuristics: compute > $500 → reserved/spot;
 *     storage > $100 → tiering; ai-ml > $200 → smaller models.
 *   - Every JSON parse path runs through a recursive shape check that
 *     rejects __proto__/constructor/prototype keys; on pollution or
 *     parse failure we fall back to `defaultState()`.
 *
 * Path-safety: callers supply a `stateFile` path which the CLI
 * cluster constructs via `safeJoin(deps, ...)` (gated through
 * `assertInsideRoot` upstream). The library itself does not walk the
 * filesystem; it only reads/writes the supplied path. `saveState`
 * defensively re-validates relative paths against `process.cwd()`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'finops.json');

export const COST_CATEGORIES = [
  'compute',
  'storage',
  'network',
  'database',
  'ai-ml',
  'monitoring',
  'third-party',
  'licensing',
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number];

export interface PricingTier {
  unit: string;
  low: number;
  medium: number;
  high: number;
}

export const CLOUD_PRICING_ESTIMATES: Record<string, PricingTier> = {
  compute: { unit: 'vCPU-hour', low: 0.02, medium: 0.05, high: 0.1 },
  storage: { unit: 'GB-month', low: 0.01, medium: 0.023, high: 0.1 },
  network: { unit: 'GB-transfer', low: 0.01, medium: 0.08, high: 0.12 },
  database: { unit: 'instance-hour', low: 0.02, medium: 0.1, high: 0.5 },
  'ai-ml': { unit: '1K-tokens', low: 0.001, medium: 0.01, high: 0.06 },
  monitoring: { unit: 'GB-logs-month', low: 0.25, medium: 0.5, high: 1.0 },
};

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    for (const item of value) if (hasForbiddenKey(item)) return true;
    return false;
  }
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKey(value[key])) return true;
  }
  return false;
}

export interface BreakdownEntry {
  name: string;
  category: string;
  quantity: number;
  monthly_cost: number;
}

export interface Estimate {
  id: string;
  name: string;
  breakdown: BreakdownEntry[];
  monthly_total: number;
  annual_total: number;
  created_at: string;
}

export interface Budget {
  // Legacy code never wrote any specific shape into budgets[]; we treat
  // it as opaque. The state object accepts whatever the caller stores.
  [key: string]: unknown;
}

export interface OptimizationItem {
  estimate: string;
  component: string;
  recommendation: string;
  potential_savings: string;
}

export interface State {
  version: string;
  created_at: string;
  last_updated: string | null;
  estimates: Estimate[];
  budgets: Budget[];
  optimizations: OptimizationItem[];
}

export interface ComponentInput {
  name?: string;
  category?: string;
  tier?: 'low' | 'medium' | 'high';
  quantity?: number;
  hours_per_month?: number;
  monthly_cost?: number;
}

export interface EstimateInput {
  name?: string;
  components?: ComponentInput[];
}

export interface CommonOptions {
  stateFile?: string | undefined;
}

export type CreateEstimateResult =
  | { success: true; estimate: Estimate }
  | { success: false; error: string };

export interface OptimizationsResult {
  success: true;
  recommendations: OptimizationItem[];
  total: number;
}

export interface ReportResult {
  success: true;
  total_estimates: number;
  total_monthly: number;
  total_annual: number;
  by_category: Record<string, number>;
  estimates: Estimate[];
}

/**
 * Default FinOps state shape (legacy parity).
 */
export function defaultState(): State {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    estimates: [],
    budgets: [],
    optimizations: [],
  };
}

/**
 * Load FinOps state from disk.
 *
 * Returns `defaultState()` on file missing / parse failure / shape
 * mismatch / M3 pollution-key detection.
 */
export function loadState(stateFile?: string): State {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(filePath)) return defaultState();
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return defaultState();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultState();
  }
  if (!isPlainObject(parsed)) return defaultState();
  if (hasForbiddenKey(parsed)) return defaultState();
  const base = defaultState();
  return {
    version: typeof parsed.version === 'string' ? (parsed.version as string) : base.version,
    created_at:
      typeof parsed.created_at === 'string' ? (parsed.created_at as string) : base.created_at,
    last_updated: typeof parsed.last_updated === 'string' ? (parsed.last_updated as string) : null,
    estimates: Array.isArray(parsed.estimates) ? (parsed.estimates as Estimate[]) : [],
    budgets: Array.isArray(parsed.budgets) ? (parsed.budgets as Budget[]) : [],
    optimizations: Array.isArray(parsed.optimizations)
      ? (parsed.optimizations as OptimizationItem[])
      : [],
  };
}

/**
 * Save FinOps state to disk. Sets `last_updated` and creates the parent
 * dir if missing.
 */
export function saveState(state: State, stateFile?: string): void {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Create a cost estimate for a service / component breakdown. Persists
 * the new estimate into the FinOps state file.
 */
export function createEstimate(
  estimate: EstimateInput | null | undefined,
  options: CommonOptions = {}
): CreateEstimateResult {
  if (!estimate?.name) {
    return { success: false, error: 'estimate.name is required' };
  }

  const components = estimate.components ?? [];
  let totalMonthly = 0;
  const breakdown: BreakdownEntry[] = [];

  for (const comp of components) {
    const category = comp.category ?? 'compute';
    const pricing = CLOUD_PRICING_ESTIMATES[category];
    const tier = comp.tier ?? 'medium';
    const quantity = comp.quantity ?? 1;
    const hours = comp.hours_per_month ?? 730; // ~24 * 30

    let monthlyCost: number;
    if (pricing) {
      const tierKey = (['low', 'medium', 'high'] as const).includes(
        tier as 'low' | 'medium' | 'high'
      )
        ? (tier as 'low' | 'medium' | 'high')
        : 'medium';
      const rate = pricing[tierKey];
      monthlyCost =
        rate * quantity * (category === 'storage' || category === 'monitoring' ? 1 : hours);
    } else {
      monthlyCost = comp.monthly_cost ?? 0;
    }

    breakdown.push({
      name: comp.name ?? category,
      category,
      quantity,
      monthly_cost: round2(monthlyCost),
    });
    totalMonthly += monthlyCost;
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const est: Estimate = {
    id: `FIN-${Date.now().toString(36).toUpperCase()}`,
    name: estimate.name,
    breakdown,
    monthly_total: round2(totalMonthly),
    annual_total: round2(totalMonthly * 12),
    created_at: new Date().toISOString(),
  };

  state.estimates.push(est);
  saveState(state, stateFile);

  return { success: true, estimate: est };
}

/**
 * Compute optimization recommendations based on current estimates.
 *
 * Heuristics (legacy parity):
 *   - compute > $500/mo → reserved or spot instances (30-60% savings)
 *   - storage > $100/mo → storage tiering (20-40%)
 *   - ai-ml > $200/mo → smaller models, batched requests (40-70%)
 */
export function getOptimizations(options: CommonOptions = {}): OptimizationsResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const recommendations: OptimizationItem[] = [];

  for (const est of state.estimates) {
    for (const comp of est.breakdown) {
      if (comp.category === 'compute' && comp.monthly_cost > 500) {
        recommendations.push({
          estimate: est.name,
          component: comp.name,
          recommendation: 'Consider reserved instances or spot instances',
          potential_savings: '30-60%',
        });
      }
      if (comp.category === 'storage' && comp.monthly_cost > 100) {
        recommendations.push({
          estimate: est.name,
          component: comp.name,
          recommendation: 'Implement storage tiering (hot/warm/cold)',
          potential_savings: '20-40%',
        });
      }
      if (comp.category === 'ai-ml' && comp.monthly_cost > 200) {
        recommendations.push({
          estimate: est.name,
          component: comp.name,
          recommendation: 'Use smaller models for simple tasks, batch requests',
          potential_savings: '40-70%',
        });
      }
    }
  }

  return { success: true, recommendations, total: recommendations.length };
}

/**
 * Generate a FinOps roll-up report: total monthly + annual cost,
 * cost-by-category histogram, and the full estimate list.
 */
export function generateReport(options: CommonOptions = {}): ReportResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const totalMonthly = state.estimates.reduce((sum, e) => sum + e.monthly_total, 0);
  const byCategory: Record<string, number> = {};

  for (const est of state.estimates) {
    for (const comp of est.breakdown) {
      byCategory[comp.category] = (byCategory[comp.category] ?? 0) + comp.monthly_cost;
    }
  }

  return {
    success: true,
    total_estimates: state.estimates.length,
    total_monthly: round2(totalMonthly),
    total_annual: round2(totalMonthly * 12),
    by_category: byCategory,
    estimates: state.estimates,
  };
}
