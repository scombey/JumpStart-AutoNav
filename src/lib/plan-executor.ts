/**
 * plan-executor.ts — Rich Plan Execution Engine port (M11 batch 5).
 *
 * Pure-library port of `bin/lib/plan-executor.js` (CJS) to a typed ES
 * module. Public surface preserved verbatim by name + signature:
 *
 *   - `defaultExecutionState()` => ExecutionState
 *   - `loadExecutionState(stateFile?)` => ExecutionState
 *   - `saveExecutionState(state, stateFile?)` => void  (sets last_updated)
 *   - `parsePlanToJobs(planContent)` => Job[]
 *   - `initializeExecution(root, options?)` => InitResult
 *   - `getExecutionStatus(options?)` => StatusResult
 *   - `updateJobStatus(jobId, status, options?)` => UpdateResult
 *   - `verifyJob(jobId, root, options?)` => VerifyResult
 *   - `resetExecution(options?)` => ResetResult
 *   - `TASK_STATUSES` (frozen list)
 *
 * Behavior parity:
 *   - Default state file: `.jumpstart/state/plan-execution.json`.
 *   - Default plan source: `<root>/specs/implementation-plan.md`.
 *   - Milestone heading regex: `^#{2,3}\s+(?:Milestone\s+)?(\d+|M\d+)…`.
 *   - Task heading/list regex: `(?:^#{2,4}\s+|^[-*]\s+\*{0,2})(M\d+-T\d+)…`.
 *   - Story refs auto-extracted via `E\d+-S\d+` pattern.
 *   - Dependency refs extracted from "depends on: M01-T02".
 *   - Status transitions: started_at on first `in_progress`,
 *     completed_at on `completed`, error on `failed` (when supplied).
 *   - verifyJob aggregates output_files existence, status_completed,
 *     has_completion_time, no_errors checks.
 *
 * M3 hardening: every JSON parse path runs through a recursive shape
 * check that rejects __proto__/constructor/prototype keys; falls back
 * to `defaultExecutionState()` on parse failure or pollution detection.
 *
 * Path-safety per ADR-009:
 *   - `initializeExecution(root, opts)` and `verifyJob(jobId, root, opts)`
 *     gate `root` through `assertInsideRoot` before any fs access. The
 *     `output_files` membership check (`fs.existsSync(path.join(root,
 *     file))`) re-asserts each file-name resolves inside root to defend
 *     against a malicious state file injecting `../../../etc/passwd`.
 *
 * @see bin/lib/plan-executor.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { assertInsideRoot } from './path-safety.js';
import { ValidationError } from './errors.js';

const DEFAULT_EXECUTION_FILE = join('.jumpstart', 'state', 'plan-execution.json');

export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'skipped',
  'blocked',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

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

export interface VerificationCheck {
  check: string;
  passed: boolean;
}

export interface JobVerification {
  verified_at: string;
  passed: boolean;
  checks: VerificationCheck[];
}

export interface Job {
  id: string;
  title: string;
  milestone: string;
  status: TaskStatus | string;
  story_refs: string[];
  dependencies: string[];
  started_at: string | null;
  completed_at: string | null;
  verification: JobVerification | null;
  output_files: string[];
  error: string | null;
}

export interface ExecutionLogEntry {
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface ExecutionState {
  version: string;
  created_at: string;
  last_updated: string | null;
  plan_source: string | null;
  jobs: Job[];
  execution_log: ExecutionLogEntry[];
}

export interface InitOptions {
  planPath?: string | undefined;
  stateFile?: string | undefined;
}

export type InitResult =
  | {
      success: true;
      total_jobs: number;
      milestones: string[];
      jobs: { id: string; title: string; milestone: string; dependencies: string[] }[];
    }
  | { success: false; error: string };

export interface StatusOptions {
  stateFile?: string | undefined;
}

export type StatusResult =
  | { success: true; initialized: false; message: string }
  | {
      success: true;
      initialized: true;
      plan_source: string | null;
      total_jobs: number;
      progress: number;
      status_counts: Record<string, number>;
      next_tasks: { id: string; title: string; milestone: string }[];
      jobs: { id: string; title: string; status: string; milestone: string }[];
    };

export interface UpdateOptions {
  stateFile?: string | undefined;
  error?: string | undefined;
  output_files?: string[] | undefined;
}

export type UpdateResult =
  | {
      success: true;
      job_id: string;
      previous_status: string;
      new_status: string;
      started_at: string | null;
      completed_at: string | null;
    }
  | { success: false; error: string };

export interface VerifyOptions {
  stateFile?: string | undefined;
}

export type VerifyResult =
  | {
      success: true;
      job_id: string;
      verified: boolean;
      checks: VerificationCheck[];
      summary: { total_checks: number; passed: number; failed: number };
    }
  | { success: false; error: string };

export interface ResetOptions {
  stateFile?: string | undefined;
}

export interface ResetResult {
  success: true;
  jobs_reset: number;
}

/**
 * Default execution state shape (legacy parity).
 */
export function defaultExecutionState(): ExecutionState {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    plan_source: null,
    jobs: [],
    execution_log: [],
  };
}

/**
 * Load execution state from disk.
 *
 * Returns `defaultExecutionState()` on file missing / parse failure /
 * shape mismatch / M3 pollution-key detection.
 */
export function loadExecutionState(stateFile?: string): ExecutionState {
  const filePath = stateFile ?? DEFAULT_EXECUTION_FILE;
  if (!existsSync(filePath)) return defaultExecutionState();
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return defaultExecutionState();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultExecutionState();
  }
  if (!isPlainObject(parsed)) return defaultExecutionState();
  if (hasForbiddenKey(parsed)) return defaultExecutionState();
  const base = defaultExecutionState();
  return {
    version: typeof parsed['version'] === 'string' ? (parsed['version'] as string) : base.version,
    created_at:
      typeof parsed['created_at'] === 'string'
        ? (parsed['created_at'] as string)
        : base.created_at,
    last_updated:
      typeof parsed['last_updated'] === 'string' ? (parsed['last_updated'] as string) : null,
    plan_source:
      typeof parsed['plan_source'] === 'string' ? (parsed['plan_source'] as string) : null,
    jobs: Array.isArray(parsed['jobs']) ? (parsed['jobs'] as Job[]) : [],
    execution_log: Array.isArray(parsed['execution_log'])
      ? (parsed['execution_log'] as ExecutionLogEntry[])
      : [],
  };
}

/**
 * Save execution state to disk. Sets `last_updated` and creates the
 * parent dir if missing.
 */
export function saveExecutionState(state: ExecutionState, stateFile?: string): void {
  const filePath = stateFile ?? DEFAULT_EXECUTION_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Parse implementation plan markdown into executable jobs. Detects:
 *   - Milestone headings: `## Milestone N: ...` or `## MNN: ...`
 *   - Task headings/list items: `### MNN-TNN — ...` or `- MNN-TNN: ...`
 *   - Story refs (auto-extracted): `EN-SN`
 *   - Dependencies: `depends on: MNN-TNN`
 */
export function parsePlanToJobs(planContent: string): Job[] {
  const jobs: Job[] = [];
  const lines = planContent.split('\n');
  let currentMilestone: string | null = null;

  for (const line of lines) {
    const milestoneMatch = line.match(
      /^#{2,3}\s+(?:Milestone\s+)?(\d+|M\d+)[:\s—–-]+\s*(.+)$/i
    );
    if (milestoneMatch) {
      const captured = milestoneMatch[1] ?? '';
      currentMilestone = captured.startsWith('M')
        ? captured
        : `M${captured.padStart(2, '0')}`;
      continue;
    }

    const taskMatch = line.match(
      /(?:^#{2,4}\s+|^[-*]\s+\*{0,2})(M\d+-T\d+)(?:\*{0,2})[:\s—–-]+\s*(.+)/i
    );
    if (taskMatch) {
      const taskId = taskMatch[1] ?? '';
      const titleRaw = taskMatch[2] ?? '';
      const title = titleRaw.trim().replace(/\*{1,2}/g, '');

      const storyRefs = line.match(/E\d+-S\d+/g) ?? [];

      const depMatch = line.match(/depends?\s+on[:\s]+([^.]+)/i);
      const dependencies = depMatch?.[1] ? (depMatch[1].match(/M\d+-T\d+/g) ?? []) : [];

      jobs.push({
        id: taskId,
        title,
        milestone: currentMilestone ?? (taskId.split('-')[0] ?? taskId),
        status: 'pending',
        story_refs: [...new Set(storyRefs)],
        dependencies,
        started_at: null,
        completed_at: null,
        verification: null,
        output_files: [],
        error: null,
      });
    }
  }

  return jobs;
}

/**
 * Initialize execution from implementation plan markdown. Reads the
 * plan, parses it into jobs, and persists a fresh state file.
 */
export function initializeExecution(root: string, options: InitOptions = {}): InitResult {
  // Path-safety: gate root before any fs probe.
  assertInsideRoot(root, root, { schemaId: 'plan-executor:initializeExecution:root' });

  const planPath = options.planPath ?? join(root, 'specs', 'implementation-plan.md');
  const stateFile = options.stateFile ?? join(root, DEFAULT_EXECUTION_FILE);

  if (!existsSync(planPath)) {
    return { success: false, error: `Implementation plan not found: ${planPath}` };
  }

  const planContent = readFileSync(planPath, 'utf8');
  const jobs = parsePlanToJobs(planContent);

  if (jobs.length === 0) {
    return { success: false, error: 'No tasks found in implementation plan' };
  }

  const state = defaultExecutionState();
  state.plan_source = relative(root, planPath);
  state.jobs = jobs;
  state.execution_log.push({
    event: 'initialized',
    timestamp: new Date().toISOString(),
    total_jobs: jobs.length,
  });

  saveExecutionState(state, stateFile);

  return {
    success: true,
    total_jobs: jobs.length,
    milestones: [...new Set(jobs.map((j) => j.milestone))],
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      milestone: j.milestone,
      dependencies: j.dependencies,
    })),
  };
}

/**
 * Get execution status snapshot. Returns `initialized: false` when no
 * jobs have been loaded.
 */
export function getExecutionStatus(options: StatusOptions = {}): StatusResult {
  const stateFile = options.stateFile ?? DEFAULT_EXECUTION_FILE;
  const state = loadExecutionState(stateFile);

  if (state.jobs.length === 0) {
    return { success: true, initialized: false, message: 'No execution plan loaded' };
  }

  const statusCounts: Record<string, number> = {};
  for (const status of TASK_STATUSES) {
    statusCounts[status] = state.jobs.filter((j) => j.status === status).length;
  }

  const completed = statusCounts['completed'] ?? 0;
  const completedPct =
    state.jobs.length > 0 ? Math.round((completed / state.jobs.length) * 100) : 0;

  const completedIds = new Set(
    state.jobs.filter((j) => j.status === 'completed').map((j) => j.id)
  );
  const nextTasks = state.jobs.filter(
    (j) => j.status === 'pending' && j.dependencies.every((dep) => completedIds.has(dep))
  );

  return {
    success: true,
    initialized: true,
    plan_source: state.plan_source,
    total_jobs: state.jobs.length,
    progress: completedPct,
    status_counts: statusCounts,
    next_tasks: nextTasks.map((j) => ({ id: j.id, title: j.title, milestone: j.milestone })),
    jobs: state.jobs.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      milestone: j.milestone,
    })),
  };
}

/**
 * Update a job's status. Tracks started_at / completed_at / error
 * timestamps and appends a status_change log entry.
 */
export function updateJobStatus(
  jobId: string,
  status: string,
  options: UpdateOptions = {}
): UpdateResult {
  if (!(TASK_STATUSES as readonly string[]).includes(status)) {
    return {
      success: false,
      error: `Invalid status: ${status}. Must be one of: ${TASK_STATUSES.join(', ')}`,
    };
  }

  const stateFile = options.stateFile ?? DEFAULT_EXECUTION_FILE;
  const state = loadExecutionState(stateFile);
  const job = state.jobs.find((j) => j.id === jobId);

  if (!job) {
    return { success: false, error: `Job not found: ${jobId}` };
  }

  const previousStatus = job.status;
  job.status = status;

  if (status === 'in_progress' && !job.started_at) {
    job.started_at = new Date().toISOString();
  }
  if (status === 'completed') {
    job.completed_at = new Date().toISOString();
  }
  if (status === 'failed' && options.error) {
    job.error = options.error;
  }
  if (options.output_files) {
    job.output_files = options.output_files;
  }

  state.execution_log.push({
    event: 'status_change',
    job_id: jobId,
    from: previousStatus,
    to: status,
    timestamp: new Date().toISOString(),
  });

  saveExecutionState(state, stateFile);

  return {
    success: true,
    job_id: jobId,
    previous_status: previousStatus,
    new_status: status,
    started_at: job.started_at,
    completed_at: job.completed_at,
  };
}

/**
 * Verify a job. Checks output-file existence, completion status, and
 * error-free state. Persists verification result on the job.
 *
 * Path-safety: re-asserts each `output_files` entry resolves inside
 * `root` before fs.existsSync — defends against a malicious state file
 * injecting `../../../etc/passwd`.
 */
export function verifyJob(
  jobId: string,
  root: string,
  options: VerifyOptions = {}
): VerifyResult {
  // Path-safety: gate root before any fs probe.
  assertInsideRoot(root, root, { schemaId: 'plan-executor:verifyJob:root' });

  const stateFile = options.stateFile ?? join(root, DEFAULT_EXECUTION_FILE);
  const state = loadExecutionState(stateFile);
  const job = state.jobs.find((j) => j.id === jobId);

  if (!job) {
    return { success: false, error: `Job not found: ${jobId}` };
  }

  const checks: VerificationCheck[] = [];

  if (job.output_files && job.output_files.length > 0) {
    for (const file of job.output_files) {
      // Defense in depth: re-validate each path resolves inside root.
      // A malicious state file might inject `../../../etc/passwd`.
      let exists = false;
      try {
        assertInsideRoot(file, root, {
          schemaId: 'plan-executor:verifyJob:output_files',
        });
        exists = existsSync(join(root, file));
      } catch (err) {
        if (err instanceof ValidationError) {
          // Reject traversal-shaped path: report check as failed.
          exists = false;
        } else {
          throw err;
        }
      }
      checks.push({ check: `file_exists: ${file}`, passed: exists });
    }
  }

  checks.push({ check: 'status_completed', passed: job.status === 'completed' });
  checks.push({ check: 'has_completion_time', passed: !!job.completed_at });
  checks.push({ check: 'no_errors', passed: !job.error });

  const allPassed = checks.every((c) => c.passed);

  job.verification = {
    verified_at: new Date().toISOString(),
    passed: allPassed,
    checks,
  };

  saveExecutionState(state, stateFile);

  return {
    success: true,
    job_id: jobId,
    verified: allPassed,
    checks,
    summary: {
      total_checks: checks.length,
      passed: checks.filter((c) => c.passed).length,
      failed: checks.filter((c) => !c.passed).length,
    },
  };
}

/**
 * Reset all jobs to `pending` and clear progress timestamps.
 */
export function resetExecution(options: ResetOptions = {}): ResetResult {
  const stateFile = options.stateFile ?? DEFAULT_EXECUTION_FILE;
  const state = loadExecutionState(stateFile);
  const previousCount = state.jobs.length;

  for (const job of state.jobs) {
    job.status = 'pending';
    job.started_at = null;
    job.completed_at = null;
    job.verification = null;
    job.error = null;
  }

  state.execution_log.push({
    event: 'reset',
    timestamp: new Date().toISOString(),
    jobs_reset: previousCount,
  });

  saveExecutionState(state, stateFile);

  return { success: true, jobs_reset: previousCount };
}
