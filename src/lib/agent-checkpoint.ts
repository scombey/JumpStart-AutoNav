/**
 * agent-checkpoint.ts — Agent Self-Checkpoint & Resume port.
 *
 * Public surface
 * preserved verbatim by name + signature:
 *
 *   - `defaultState()` => AgentCheckpointState
 *   - `loadState(stateFile?)` => AgentCheckpointState
 *   - `saveState(state, stateFile?)` => void
 *   - `saveCheckpoint(checkpoint, options?)` => SaveCheckpointResult
 *   - `restoreCheckpoint(checkpointId?, options?)` => RestoreCheckpointResult
 *   - `listCheckpoints(filter?, options?)` => ListCheckpointsResult
 *   - `cleanCheckpoints(options?)` => CleanCheckpointsResult
 *   - `CHECKPOINT_TYPES`
 *
 * Invariants:
 *   - Default state file: `.jumpstart/state/agent-checkpoints.json`.
 *   - 6 checkpoint types: phase-start, phase-end, task-start, task-end,
 *     error-recovery, manual.
 *   - Auto-trim to last 50 checkpoints on save.
 *   - cleanCheckpoints default keep=10.
 *   - M3 hardening: shape-validated JSON; rejects __proto__/constructor/
 *     prototype keys recursively; defaultState fallback on parse failure.
 *
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'agent-checkpoints.json');

export const CHECKPOINT_TYPES = [
  'phase-start',
  'phase-end',
  'task-start',
  'task-end',
  'error-recovery',
  'manual',
] as const;

export type CheckpointType = (typeof CHECKPOINT_TYPES)[number];

export interface AgentCheckpoint {
  id: string;
  agent: string;
  phase: string | null;
  task: string | null;
  type: string;
  context: Record<string, unknown>;
  files_snapshot: string[];
  saved_at: string;
}

export interface RecoveryLogEntry {
  checkpoint_id: string;
  restored_at: string;
}

export interface AgentCheckpointState {
  version: string;
  created_at: string;
  last_updated: string | null;
  checkpoints: AgentCheckpoint[];
  recovery_log: RecoveryLogEntry[];
}

export interface SaveCheckpointInput {
  agent: string;
  phase?: string | null | undefined;
  task?: string | null | undefined;
  type?: string | undefined;
  context?: Record<string, unknown> | undefined;
  files_snapshot?: string[] | undefined;
}

export interface SaveCheckpointOptions {
  stateFile?: string | undefined;
}

export type SaveCheckpointResult =
  | { success: true; checkpoint: AgentCheckpoint }
  | { success: false; error: string };

export interface RestoreCheckpointOptions {
  stateFile?: string | undefined;
}

export type RestoreCheckpointResult =
  | {
      success: true;
      checkpoint: AgentCheckpoint;
      agent: string;
      phase: string | null;
      task: string | null;
      context: Record<string, unknown>;
    }
  | { success: false; error: string };

export interface CheckpointFilter {
  agent?: string | undefined;
  phase?: string | undefined;
  type?: string | undefined;
}

export interface ListCheckpointsOptions {
  stateFile?: string | undefined;
}

export interface ListCheckpointsResult {
  success: true;
  checkpoints: AgentCheckpoint[];
  total: number;
}

export interface CleanCheckpointsOptions {
  stateFile?: string | undefined;
  keep?: number | undefined;
}

export interface CleanCheckpointsResult {
  success: true;
  removed: number;
  remaining: number;
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

export function defaultState(): AgentCheckpointState {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    checkpoints: [],
    recovery_log: [],
  };
}

export function loadState(stateFile?: string | undefined): AgentCheckpointState {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(filePath)) return defaultState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return defaultState();
  }
  if (!isPlainObject(parsed) || hasForbiddenKey(parsed)) return defaultState();
  return parsed as unknown as AgentCheckpointState;
}

export function saveState(state: AgentCheckpointState, stateFile?: string | undefined): void {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Save a checkpoint. Auto-trims `state.checkpoints` to the most recent
 * 50 entries (legacy parity — see bin/lib/agent-checkpoint.js:75-77).
 */
export function saveCheckpoint(
  checkpoint: SaveCheckpointInput | null | undefined,
  options: SaveCheckpointOptions = {}
): SaveCheckpointResult {
  if (!checkpoint?.agent) {
    return { success: false, error: 'agent is required' };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const cp: AgentCheckpoint = {
    id: `CP-${Date.now().toString(36).toUpperCase()}`,
    agent: checkpoint.agent,
    phase: checkpoint.phase ?? null,
    task: checkpoint.task ?? null,
    type: checkpoint.type ?? 'manual',
    context: checkpoint.context ?? {},
    files_snapshot: checkpoint.files_snapshot ?? [],
    saved_at: new Date().toISOString(),
  };

  state.checkpoints.push(cp);

  // Keep only the most recent 50 checkpoints (legacy parity).
  if (state.checkpoints.length > 50) {
    state.checkpoints = state.checkpoints.slice(-50);
  }

  saveState(state, stateFile);

  return { success: true, checkpoint: cp };
}

/**
 * Restore a checkpoint. If `checkpointId` is omitted, restores from the
 * most recent checkpoint. Pushes a recovery_log entry on success.
 */
export function restoreCheckpoint(
  checkpointId?: string | undefined,
  options: RestoreCheckpointOptions = {}
): RestoreCheckpointResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  let checkpoint: AgentCheckpoint | undefined;
  if (checkpointId) {
    checkpoint = state.checkpoints.find((c) => c.id === checkpointId);
  } else {
    checkpoint = state.checkpoints[state.checkpoints.length - 1];
  }

  if (!checkpoint) {
    return {
      success: false,
      error: checkpointId ? `Checkpoint not found: ${checkpointId}` : 'No checkpoints available',
    };
  }

  state.recovery_log.push({
    checkpoint_id: checkpoint.id,
    restored_at: new Date().toISOString(),
  });
  saveState(state, stateFile);

  return {
    success: true,
    checkpoint,
    agent: checkpoint.agent,
    phase: checkpoint.phase,
    task: checkpoint.task,
    context: checkpoint.context,
  };
}

/**
 * List available checkpoints. Optional filter by `agent` / `phase` / `type`.
 */
export function listCheckpoints(
  filter: CheckpointFilter = {},
  options: ListCheckpointsOptions = {}
): ListCheckpointsResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);
  let checkpoints = state.checkpoints;

  if (filter.agent) checkpoints = checkpoints.filter((c) => c.agent === filter.agent);
  if (filter.phase) checkpoints = checkpoints.filter((c) => c.phase === filter.phase);
  if (filter.type) checkpoints = checkpoints.filter((c) => c.type === filter.type);

  return { success: true, checkpoints, total: checkpoints.length };
}

/**
 * Clean old checkpoints. `keep` defaults to 10 (legacy parity).
 * `removed` is `Math.max(0, checkpoints.length - keep)`.
 */
export function cleanCheckpoints(options: CleanCheckpointsOptions = {}): CleanCheckpointsResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);
  const keep = options.keep ?? 10;
  const removed = Math.max(0, state.checkpoints.length - keep);

  state.checkpoints = state.checkpoints.slice(-keep);
  saveState(state, stateFile);

  return { success: true, removed, remaining: state.checkpoints.length };
}
