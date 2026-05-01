/**
 * environment-promotion.ts — Environment Promotion Governance port
 *.
 *
 * Public
 * surface preserved verbatim by name + signature:
 *
 *   - `defaultState()` => EnvironmentPromotionState
 *   - `loadState(stateFile?)` => EnvironmentPromotionState
 *   - `saveState(state, stateFile?)` => void
 *   - `checkGates(environment, options?)` => CheckGatesResult
 *   - `recordGateResult(environment, gateName, passed, options?)`
 *       => RecordGateResultResult
 *   - `promote(targetEnv, options?)` => PromoteResult
 *   - `getStatus(options?)` => GetStatusResult
 *   - `ENVIRONMENTS`, `DEFAULT_GATES`
 *
 * Invariants:
 *   - 4 environments: dev → test → staging → prod (linear progression).
 *   - Default gates per environment (preserved verbatim from legacy).
 *   - `dev` starts as `active`; the others start as `pending`.
 *   - `promote(target)` validates that every gate from the current
 *     environment up to (but not including) the target is `passed=true`.
 *   - Backward promotion is rejected.
 *   - State file: `.jumpstart/state/environment-promotion.json`.
 *   - M3 hardening: shape-validated JSON; rejects __proto__/constructor/
 *     prototype keys recursively; defaultState fallback on parse failure.
 *
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'environment-promotion.json');

export const ENVIRONMENTS = ['dev', 'test', 'staging', 'prod'] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

export const DEFAULT_GATES: Record<Environment, string[]> = {
  dev: ['unit-tests', 'lint', 'build'],
  test: ['integration-tests', 'coverage-threshold', 'security-scan'],
  staging: ['e2e-tests', 'performance-tests', 'approval-required'],
  prod: ['release-readiness', 'change-advisory', 'final-approval'],
};

export interface Gate {
  name: string;
  passed: boolean;
  checked_at: string | null;
}

export interface EnvironmentEntry {
  name: string;
  status: 'active' | 'pending' | string;
  gates: Gate[];
  promoted_at: string | null;
  promoted_by: string | null;
}

export interface PromotionHistoryEntry {
  from: string;
  to: string;
  promoted_at: string;
  promoted_by: string | null;
}

export interface EnvironmentPromotionState {
  version: string;
  created_at: string;
  last_updated: string | null;
  current_environment: string;
  environments: EnvironmentEntry[];
  promotion_history: PromotionHistoryEntry[];
}

export interface BaseOptions {
  stateFile?: string | undefined;
}

export interface PromoteOptions extends BaseOptions {
  promotedBy?: string | undefined;
}

export type CheckGatesResult =
  | {
      success: true;
      environment: string;
      all_passed: boolean;
      passed: string[];
      pending: string[];
      total: number;
      ready_to_promote: boolean;
    }
  | { success: false; error: string };

export type RecordGateResultResult =
  | { success: true; environment: string; gate: string; passed: boolean; checked_at: string }
  | { success: false; error: string };

export type PromoteResult =
  | { success: true; from: string; to: string; current_environment: string }
  | { success: false; error: string };

export interface GetStatusResult {
  success: true;
  current_environment: string;
  environments: Array<{
    name: string;
    status: string;
    gates_passed: number;
    gates_total: number;
    ready: boolean;
  }>;
  promotion_history: PromotionHistoryEntry[];
}

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

export function defaultState(): EnvironmentPromotionState {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    current_environment: 'dev',
    environments: ENVIRONMENTS.map((env) => ({
      name: env,
      status: env === 'dev' ? 'active' : 'pending',
      gates: (DEFAULT_GATES[env] ?? []).map((g) => ({ name: g, passed: false, checked_at: null })),
      promoted_at: null,
      promoted_by: null,
    })),
    promotion_history: [],
  };
}

export function loadState(stateFile?: string | undefined): EnvironmentPromotionState {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(filePath)) return defaultState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return defaultState();
  }
  if (!isPlainObject(parsed) || hasForbiddenKey(parsed)) return defaultState();
  return parsed as unknown as EnvironmentPromotionState;
}

export function saveState(state: EnvironmentPromotionState, stateFile?: string | undefined): void {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function isValidEnvironment(env: string): env is Environment {
  return (ENVIRONMENTS as readonly string[]).includes(env);
}

export function checkGates(environment: string, options: BaseOptions = {}): CheckGatesResult {
  if (!isValidEnvironment(environment)) {
    return {
      success: false,
      error: `Invalid environment: ${environment}. Must be one of: ${ENVIRONMENTS.join(', ')}`,
    };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);
  const env = state.environments.find((e) => e.name === environment);
  if (!env) return { success: false, error: `Environment not found: ${environment}` };

  const passed = env.gates.filter((g) => g.passed);
  const failed = env.gates.filter((g) => !g.passed);

  return {
    success: true,
    environment,
    all_passed: failed.length === 0,
    passed: passed.map((g) => g.name),
    pending: failed.map((g) => g.name),
    total: env.gates.length,
    ready_to_promote: failed.length === 0,
  };
}

export function recordGateResult(
  environment: string,
  gateName: string,
  passed: boolean,
  options: BaseOptions = {}
): RecordGateResultResult {
  if (!isValidEnvironment(environment)) {
    return { success: false, error: `Invalid environment: ${environment}` };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);
  const env = state.environments.find((e) => e.name === environment);
  if (!env) return { success: false, error: `Environment not found: ${environment}` };

  const gate = env.gates.find((g) => g.name === gateName);
  if (!gate) return { success: false, error: `Gate not found: ${gateName}` };

  gate.passed = passed;
  gate.checked_at = new Date().toISOString();
  saveState(state, stateFile);

  return { success: true, environment, gate: gateName, passed, checked_at: gate.checked_at };
}

export function promote(targetEnv: string, options: PromoteOptions = {}): PromoteResult {
  if (!isValidEnvironment(targetEnv)) {
    return { success: false, error: `Invalid environment: ${targetEnv}` };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const targetIdx = (ENVIRONMENTS as readonly string[]).indexOf(targetEnv);
  const currentIdx = (ENVIRONMENTS as readonly string[]).indexOf(state.current_environment);

  if (targetIdx <= currentIdx) {
    return {
      success: false,
      error: `Cannot promote backward from ${state.current_environment} to ${targetEnv}`,
    };
  }

  // Check all intermediate gates.
  for (let i = currentIdx; i < targetIdx; i++) {
    const envName = ENVIRONMENTS[i];
    if (envName === undefined) continue;
    const env = state.environments.find((e) => e.name === envName);
    if (env) {
      const pending = env.gates.filter((g) => !g.passed);
      if (pending.length > 0) {
        return {
          success: false,
          error: `Gates not passed for ${envName}: ${pending.map((g) => g.name).join(', ')}`,
        };
      }
    }
  }

  state.current_environment = targetEnv;
  const envObj = state.environments.find((e) => e.name === targetEnv);
  if (envObj) {
    envObj.status = 'active';
    envObj.promoted_at = new Date().toISOString();
    envObj.promoted_by = options.promotedBy ?? null;
  }

  const fromName = ENVIRONMENTS[currentIdx] ?? state.current_environment;
  state.promotion_history.push({
    from: fromName,
    to: targetEnv,
    promoted_at: new Date().toISOString(),
    promoted_by: options.promotedBy ?? null,
  });

  saveState(state, stateFile);

  return {
    success: true,
    from: fromName,
    to: targetEnv,
    current_environment: state.current_environment,
  };
}

export function getStatus(options: BaseOptions = {}): GetStatusResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  return {
    success: true,
    current_environment: state.current_environment,
    environments: state.environments.map((e) => ({
      name: e.name,
      status: e.status,
      gates_passed: e.gates.filter((g) => g.passed).length,
      gates_total: e.gates.length,
      ready: e.gates.every((g) => g.passed),
    })),
    promotion_history: state.promotion_history,
  };
}
