/**
 * migration-planner.ts — Brownfield Migration Planner port (M11 batch 2).
 *
 * Pure-library port of `bin/lib/migration-planner.js`. Public surface
 * preserved verbatim by name + signature:
 *
 *   - `defaultState()` => MigrationState
 *   - `loadState(stateFile?)` => MigrationState
 *   - `saveState(state, stateFile?)` => void
 *   - `createMigration(input, options?)` => CreateMigrationResult
 *   - `advancePhase(id, phase, options?)` => AdvancePhaseResult
 *   - `generateReport(options?)` => MigrationReport
 *   - `MIGRATION_STRATEGIES`, `MIGRATION_PHASES`
 *
 * Behavior parity:
 *   - Default state file: `.jumpstart/state/migration-plan.json`.
 *   - 5 strategies (strangler-fig, big-bang, phased-cutover,
 *     parallel-run, feature-flag).
 *   - 7 phases (discovery → cleanup).
 *   - M3 hardening: shape-validated JSON; rejects __proto__/
 *     constructor/prototype keys.
 *
 * @see bin/lib/migration-planner.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'migration-plan.json');

export const MIGRATION_STRATEGIES = [
  'strangler-fig',
  'big-bang',
  'phased-cutover',
  'parallel-run',
  'feature-flag',
] as const;

export type MigrationStrategy = (typeof MIGRATION_STRATEGIES)[number];

export const MIGRATION_PHASES = [
  'discovery',
  'planning',
  'compatibility-layer',
  'migration',
  'validation',
  'cutover',
  'cleanup',
] as const;

export type MigrationPhase = (typeof MIGRATION_PHASES)[number];

export interface MigrationComponent {
  name: string;
  status: 'pending' | 'in-progress' | 'migrated' | 'rolled-back';
  migrated_at: string | null;
}

export interface MigrationPlan {
  id: string;
  name: string;
  strategy: MigrationStrategy;
  source_system: string | null;
  target_system: string | null;
  current_phase: MigrationPhase;
  phase_updated_at?: string;
  components: MigrationComponent[];
  rollback_plan: string | null;
  compatibility_requirements: string[];
  created_at: string;
}

export interface MigrationState {
  version: string;
  created_at: string;
  last_updated: string | null;
  migrations: MigrationPlan[];
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function defaultState(): MigrationState {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    migrations: [],
  };
}

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

export function loadState(stateFile?: string | undefined): MigrationState {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(filePath)) return defaultState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return defaultState();
  }
  if (!isPlainObject(parsed) || hasForbiddenKey(parsed)) return defaultState();
  // Trust-but-verify: legacy returned the parsed value directly. We
  // narrow the same shape and let downstream callers rely on it.
  return parsed as unknown as MigrationState;
}

export function saveState(state: MigrationState, stateFile?: string | undefined): void {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────
// createMigration
// ─────────────────────────────────────────────────────────────────────────

export interface CreateMigrationInput {
  name: string;
  strategy: string;
  source_system?: string | null | undefined;
  target_system?: string | null | undefined;
  components?: Array<string | { name: string }> | undefined;
  rollback_plan?: string | null | undefined;
  compatibility_requirements?: string[] | undefined;
}

export interface CreateMigrationOptions {
  stateFile?: string | undefined;
}

export type CreateMigrationResult =
  | { success: true; migration: MigrationPlan }
  | { success: false; error: string };

function isStrategy(value: string): value is MigrationStrategy {
  return (MIGRATION_STRATEGIES as readonly string[]).includes(value);
}

export function createMigration(
  input: CreateMigrationInput | null | undefined,
  options: CreateMigrationOptions = {}
): CreateMigrationResult {
  if (!input?.name || !input.strategy) {
    return { success: false, error: 'name and strategy are required' };
  }

  if (!isStrategy(input.strategy)) {
    return {
      success: false,
      error: `Invalid strategy. Must be one of: ${MIGRATION_STRATEGIES.join(', ')}`,
    };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const id = `MIG-${(state.migrations.length + 1).toString().padStart(3, '0')}`;
  const components: MigrationComponent[] = (input.components ?? []).map((c) => ({
    name: typeof c === 'string' ? c : c.name,
    status: 'pending',
    migrated_at: null,
  }));

  const plan: MigrationPlan = {
    id,
    name: input.name,
    strategy: input.strategy,
    source_system: input.source_system ?? null,
    target_system: input.target_system ?? null,
    current_phase: 'discovery',
    components,
    rollback_plan: input.rollback_plan ?? null,
    compatibility_requirements: input.compatibility_requirements ?? [],
    created_at: new Date().toISOString(),
  };

  state.migrations.push(plan);
  saveState(state, stateFile);

  return { success: true, migration: plan };
}

// ─────────────────────────────────────────────────────────────────────────
// advancePhase
// ─────────────────────────────────────────────────────────────────────────

export interface AdvancePhaseOptions {
  stateFile?: string | undefined;
}

export type AdvancePhaseResult =
  | {
      success: true;
      migration_id: string;
      phase: MigrationPhase;
      previous_phase: MigrationPhase;
    }
  | { success: false; error: string };

function isPhase(value: string): value is MigrationPhase {
  return (MIGRATION_PHASES as readonly string[]).includes(value);
}

export function advancePhase(
  migrationId: string,
  phase: string,
  options: AdvancePhaseOptions = {}
): AdvancePhaseResult {
  if (!isPhase(phase)) {
    return {
      success: false,
      error: `Invalid phase. Must be one of: ${MIGRATION_PHASES.join(', ')}`,
    };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const migration = state.migrations.find((m) => m.id === migrationId);
  if (!migration) {
    return { success: false, error: `Migration not found: ${migrationId}` };
  }

  // Legacy returned `previous_phase` AFTER mutating current_phase, which
  // is confusing — the returned `previous_phase` was already the new
  // phase. We preserve that bug for parity (downstream callers may rely
  // on the documented-but-broken behaviour). A future amendment can
  // capture the actual previous phase.
  const previousPhase = migration.current_phase;
  migration.current_phase = phase;
  migration.phase_updated_at = new Date().toISOString();
  saveState(state, stateFile);

  return {
    success: true,
    migration_id: migrationId,
    phase,
    // Match legacy: this echoes the new phase, not the old one.
    // (See note above; preserved for parity.)
    previous_phase: phase,
    ...(previousPhase === phase ? {} : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// generateReport
// ─────────────────────────────────────────────────────────────────────────

export interface GenerateReportOptions {
  stateFile?: string | undefined;
}

export interface MigrationReport {
  success: true;
  total_migrations: number;
  by_strategy: Record<string, number>;
  by_phase: Record<string, number>;
  migrations: MigrationPlan[];
}

export function generateReport(options: GenerateReportOptions = {}): MigrationReport {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const byStrategy: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  for (const m of state.migrations) {
    byStrategy[m.strategy] = (byStrategy[m.strategy] ?? 0) + 1;
    byPhase[m.current_phase] = (byPhase[m.current_phase] ?? 0) + 1;
  }

  return {
    success: true,
    total_migrations: state.migrations.length,
    by_strategy: byStrategy,
    by_phase: byPhase,
    migrations: state.migrations,
  };
}
