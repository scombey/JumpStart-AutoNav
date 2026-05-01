/**
 * parallel-agents.ts — Multi-Agent Concurrent Execution port
 *.
 *
 * Public surface
 * preserved verbatim by name + signature:
 *
 *   - `defaultParallelState()` => ParallelAgentsState
 *   - `loadParallelState(stateFile?)` => ParallelAgentsState
 *   - `saveParallelState(state, stateFile?)` => void
 *   - `scheduleRun(agents, context, options?)` => ScheduleRunResult
 *   - `recordAgentFindings(runId, agentName, findings, options?)`
 *       => RecordAgentFindingsResult
 *   - `reconcileRun(runId, options?)` => ReconcileRunResult
 *   - `getRunStatus(runId, options?)` => GetRunStatusResult
 *   - `listRuns(options?)` => ListRunsResult
 *   - `SIDECAR_AGENTS`
 *
 * Invariants:
 *   - 5 sidecar agents: architect, security, qa, docs, performance.
 *   - Default state file: `.jumpstart/state/parallel-agents.json`.
 *   - Legacy `recordAgentFindings(... null)` is tolerated by reading
 *     `findings.length` after defaulting to `[]` — preserved.
 *   - Reconciliation: per-`(file, type)` key, conflicts surface when
 *     two agents disagree on severity.
 *   - M3 hardening: shape-validated JSON; rejects __proto__/constructor/
 *     prototype keys recursively; defaultState fallback on parse failure.
 *
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'parallel-agents.json');

export const SIDECAR_AGENTS = ['architect', 'security', 'qa', 'docs', 'performance'] as const;

export type SidecarAgent = (typeof SIDECAR_AGENTS)[number];

export interface AgentFinding {
  type?: string | undefined;
  message?: string | undefined;
  severity?: string | undefined;
  file?: string | undefined;
  // Legacy callers may attach arbitrary extra fields; preserved as
  // `Record<string, unknown>` so the shape is forward-compatible.
  [key: string]: unknown;
}

export interface AgentRunEntry {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  started_at: string | null;
  completed_at: string | null;
  findings: AgentFinding[];
  errors: string[];
}

export interface Reconciliation {
  reconciled_at: string;
  total_findings: number;
  conflicts: number;
  conflict_list: Array<{
    key: string;
    agents: [string, string];
    severities: [string | undefined, string | undefined];
    message: string;
  }>;
  merged_findings: Array<AgentFinding & { agent: string }>;
}

export interface ParallelRun {
  id: string;
  scheduled_at: string;
  context: Record<string, unknown>;
  agents: AgentRunEntry[];
  reconciliation: Reconciliation | null;
  status: 'pending' | 'running' | 'completed' | string;
}

export interface ParallelAgentsState {
  version: string;
  created_at: string;
  last_updated: string | null;
  runs: ParallelRun[];
}

export interface BaseOptions {
  stateFile?: string | undefined;
}

export type ScheduleRunResult =
  | { success: true; run_id: string; agents: string[] }
  | { success: false; error: string };

export type RecordAgentFindingsResult =
  | { success: true; run_id: string; agent: string; findings_count: number }
  | { success: false; error: string };

export type ReconcileRunResult =
  | { success: true; run_id: string; reconciliation: Reconciliation }
  | { success: false; error: string };

export type GetRunStatusResult =
  | {
      success: true;
      run_id: string;
      status: string;
      agents: Array<{ name: string; status: string; findings: number }>;
      reconciliation: Reconciliation | null;
    }
  | { success: false; error: string };

export interface ListRunsResult {
  success: true;
  runs: Array<{ id: string; status: string; scheduled_at: string; agent_count: number }>;
  total: number;
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

export function defaultParallelState(): ParallelAgentsState {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    runs: [],
  };
}

export function loadParallelState(stateFile?: string | undefined): ParallelAgentsState {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(filePath)) return defaultParallelState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return defaultParallelState();
  }
  if (!isPlainObject(parsed) || hasForbiddenKey(parsed)) return defaultParallelState();
  return parsed as unknown as ParallelAgentsState;
}

export function saveParallelState(
  state: ParallelAgentsState,
  stateFile?: string | undefined
): void {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Schedule a new parallel agent run. `agents` may be a subset of
 * SIDECAR_AGENTS; an empty / missing list defaults to all five.
 */
export function scheduleRun(
  agents: string[] | undefined | null,
  context: Record<string, unknown> | undefined | null,
  options: BaseOptions = {}
): ScheduleRunResult {
  const agentList =
    agents && agents.length > 0
      ? agents.filter((a): a is SidecarAgent => (SIDECAR_AGENTS as readonly string[]).includes(a))
      : [...SIDECAR_AGENTS];

  if (agentList.length === 0) {
    return {
      success: false,
      error: `No valid agents specified. Valid: ${SIDECAR_AGENTS.join(', ')}`,
    };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadParallelState(stateFile);

  const runId = `run-${Date.now()}`;
  const run: ParallelRun = {
    id: runId,
    scheduled_at: new Date().toISOString(),
    context: context ?? {},
    agents: agentList.map((name) => ({
      name,
      status: 'pending',
      started_at: null,
      completed_at: null,
      findings: [],
      errors: [],
    })),
    reconciliation: null,
    status: 'pending',
  };

  state.runs.push(run);
  saveParallelState(state, stateFile);

  return { success: true, run_id: runId, agents: agentList };
}

/**
 * Record findings for one of the agents in a run. Auto-marks the run
 * `completed` once every agent has reported `completed` or `failed`.
 */
export function recordAgentFindings(
  runId: string,
  agentName: string,
  findings: AgentFinding[] | undefined | null,
  options: BaseOptions = {}
): RecordAgentFindingsResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadParallelState(stateFile);

  const run = state.runs.find((r) => r.id === runId);
  if (!run) return { success: false, error: `Run not found: ${runId}` };

  const agent = run.agents.find((a) => a.name === agentName);
  if (!agent) return { success: false, error: `Agent not found: ${agentName}` };

  const safeFindings = findings ?? [];
  agent.findings = safeFindings;
  agent.status = 'completed';
  agent.completed_at = new Date().toISOString();

  // Update overall run status when every agent has finished.
  const allDone = run.agents.every((a) => a.status === 'completed' || a.status === 'failed');
  if (allDone) {
    run.status = 'completed';
  }

  saveParallelState(state, stateFile);

  return { success: true, run_id: runId, agent: agentName, findings_count: safeFindings.length };
}

/**
 * Merge findings across agents and detect severity disagreements on
 * the same `(file, type)` key.
 */
export function reconcileRun(runId: string, options: BaseOptions = {}): ReconcileRunResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadParallelState(stateFile);

  const run = state.runs.find((r) => r.id === runId);
  if (!run) return { success: false, error: `Run not found: ${runId}` };

  const allFindings: Array<AgentFinding & { agent: string }> = [];
  for (const agent of run.agents) {
    for (const finding of agent.findings ?? []) {
      allFindings.push({ ...finding, agent: agent.name });
    }
  }

  const conflicts: Reconciliation['conflict_list'] = [];
  const seen: Record<string, AgentFinding & { agent: string }> = {};
  for (const f of allFindings) {
    const key = `${f.file ?? ''}:${f.type ?? ''}`;
    const prior = seen[key];
    if (prior && prior.severity !== f.severity) {
      conflicts.push({
        key,
        agents: [prior.agent, f.agent],
        severities: [prior.severity, f.severity],
        message: `Conflict: ${f.type ?? '(no-type)'} severity disagrees between ${prior.agent} and ${f.agent}`,
      });
    } else if (!prior) {
      seen[key] = f;
    }
  }

  const reconciliation: Reconciliation = {
    reconciled_at: new Date().toISOString(),
    total_findings: allFindings.length,
    conflicts: conflicts.length,
    conflict_list: conflicts,
    merged_findings: allFindings,
  };

  run.reconciliation = reconciliation;
  saveParallelState(state, stateFile);

  return { success: true, run_id: runId, reconciliation };
}

export function getRunStatus(runId: string, options: BaseOptions = {}): GetRunStatusResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadParallelState(stateFile);

  const run = state.runs.find((r) => r.id === runId);
  if (!run) return { success: false, error: `Run not found: ${runId}` };

  return {
    success: true,
    run_id: runId,
    status: run.status,
    agents: run.agents.map((a) => ({
      name: a.name,
      status: a.status,
      findings: a.findings.length,
    })),
    reconciliation: run.reconciliation,
  };
}

export function listRuns(options: BaseOptions = {}): ListRunsResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadParallelState(stateFile);

  const runs = state.runs.map((r) => ({
    id: r.id,
    status: r.status,
    scheduled_at: r.scheduled_at,
    agent_count: r.agents.length,
  }));

  return { success: true, runs, total: runs.length };
}
