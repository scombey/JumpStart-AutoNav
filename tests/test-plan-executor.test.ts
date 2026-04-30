/**
 * test-plan-executor.test.ts — M11 batch 5 port coverage.
 *
 * Verifies the TS port at `src/lib/plan-executor.ts` matches the legacy
 * `bin/lib/plan-executor.js` public surface:
 *   - defaultExecutionState shape
 *   - loadExecutionState / saveExecutionState round-trip + defaultState
 *     fallback
 *   - parsePlanToJobs (milestones, tasks, story refs, dependencies)
 *   - initializeExecution validation + persistence
 *   - getExecutionStatus next-task computation + progress calc
 *   - updateJobStatus transitions, started_at/completed_at tracking,
 *     invalid-status/unknown-job rejection
 *   - verifyJob output_files existence + status checks +
 *     traversal-path defense
 *   - resetExecution clears progress
 *   - TASK_STATUSES constant
 *   - M3 hardening: pollution-key state payloads fall back to default
 *
 * @see src/lib/plan-executor.ts
 * @see bin/lib/plan-executor.js (legacy reference)
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultExecutionState,
  getExecutionStatus,
  initializeExecution,
  loadExecutionState,
  parsePlanToJobs,
  resetExecution,
  saveExecutionState,
  TASK_STATUSES,
  updateJobStatus,
  verifyJob,
} from '../src/lib/plan-executor.js';

let tmpDir: string;
let stateFile: string;
let planPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plan-executor-'));
  mkdirSync(join(tmpDir, '.jumpstart', 'state'), { recursive: true });
  mkdirSync(join(tmpDir, 'specs'), { recursive: true });
  stateFile = join(tmpDir, '.jumpstart', 'state', 'plan-execution.json');
  planPath = join(tmpDir, 'specs', 'implementation-plan.md');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('plan-executor — defaultExecutionState', () => {
  it('returns canonical default shape', () => {
    const s = defaultExecutionState();
    expect(s.version).toBe('1.0.0');
    expect(s.jobs).toEqual([]);
    expect(s.execution_log).toEqual([]);
    expect(s.last_updated).toBeNull();
    expect(s.plan_source).toBeNull();
  });
});

describe('plan-executor — TASK_STATUSES', () => {
  it('contains the canonical 6 statuses', () => {
    expect(TASK_STATUSES).toContain('pending');
    expect(TASK_STATUSES).toContain('in_progress');
    expect(TASK_STATUSES).toContain('completed');
    expect(TASK_STATUSES).toContain('failed');
    expect(TASK_STATUSES).toContain('skipped');
    expect(TASK_STATUSES).toContain('blocked');
    expect(TASK_STATUSES.length).toBe(6);
  });
});

describe('plan-executor — loadExecutionState / saveExecutionState', () => {
  it('returns defaultExecutionState when file missing', () => {
    const s = loadExecutionState(stateFile);
    expect(s.version).toBe('1.0.0');
    expect(s.jobs).toEqual([]);
  });

  it('round-trips a saved state', () => {
    const s = defaultExecutionState();
    s.jobs.push({
      id: 'M01-T01',
      title: 'X',
      milestone: 'M01',
      status: 'pending',
      story_refs: [],
      dependencies: [],
      started_at: null,
      completed_at: null,
      verification: null,
      output_files: [],
      error: null,
    });
    saveExecutionState(s, stateFile);
    const reloaded = loadExecutionState(stateFile);
    expect(reloaded.jobs[0]?.id).toBe('M01-T01');
    expect(reloaded.last_updated).toBeTruthy();
  });

  it('falls back to default on corrupt JSON', () => {
    writeFileSync(stateFile, '{not json', 'utf8');
    expect(loadExecutionState(stateFile).jobs).toEqual([]);
  });

  it('M3 hardening: rejects raw __proto__ payload', () => {
    writeFileSync(stateFile, '{"__proto__":{"polluted":true},"version":"1.0.0"}', 'utf8');
    expect(loadExecutionState(stateFile).jobs).toEqual([]);
  });

  it('M3 hardening: rejects raw constructor payload', () => {
    writeFileSync(stateFile, '{"constructor":{"polluted":true},"version":"1.0.0"}', 'utf8');
    expect(loadExecutionState(stateFile).jobs).toEqual([]);
  });

  it('M3 hardening: rejects nested __proto__ in jobs', () => {
    writeFileSync(stateFile, '{"version":"1.0.0","jobs":[{"__proto__":{"x":1}}]}', 'utf8');
    expect(loadExecutionState(stateFile).jobs).toEqual([]);
  });

  it('saveExecutionState creates parent dir if missing', () => {
    const nested = join(tmpDir, 'deep', 'nested', 'plan.json');
    saveExecutionState(defaultExecutionState(), nested);
    expect(existsSync(nested)).toBe(true);
  });
});

describe('plan-executor — parsePlanToJobs', () => {
  it('parses milestones + tasks', () => {
    const content =
      '## Milestone 1: Setup\n\n- **M01-T01**: Scaffold\n- **M01-T02**: DB\n\n## Milestone 2: Features\n\n- **M02-T01**: Auth\n';
    const jobs = parsePlanToJobs(content);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]?.id).toBe('M01-T01');
    expect(jobs[0]?.milestone).toBe('M01');
    expect(jobs[2]?.milestone).toBe('M02');
  });

  it('returns empty for no tasks', () => {
    expect(parsePlanToJobs('no tasks here')).toEqual([]);
  });

  it('extracts story refs', () => {
    const content = '- **M01-T01**: Build (E01-S01, E01-S02)\n';
    const jobs = parsePlanToJobs(content);
    expect(jobs[0]?.story_refs).toContain('E01-S01');
    expect(jobs[0]?.story_refs).toContain('E01-S02');
  });

  it('extracts dependency refs', () => {
    const content = '- **M01-T02**: Build, depends on M01-T01\n';
    const jobs = parsePlanToJobs(content);
    expect(jobs[0]?.dependencies).toContain('M01-T01');
  });

  it('handles task heading style under a milestone heading (#### MNN-TNN — title)', () => {
    // The milestone regex `^#{2,3}` only matches 2-3 hash levels; tasks
    // need `^#{2,4}` headers so 4-hash lines bypass the milestone branch
    // and fall into the task branch.
    const content = '## Milestone 1: Setup\n#### M01-T01 — Scaffold\n';
    const jobs = parsePlanToJobs(content);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe('M01-T01');
  });

  it('falls back to taskId-prefix when no milestone heading', () => {
    const content = '- **M03-T05**: orphan task\n';
    const jobs = parsePlanToJobs(content);
    expect(jobs[0]?.milestone).toBe('M03');
  });

  it('strips bold markdown markers from title', () => {
    const content = '- **M01-T01**: **Bold** title\n';
    const jobs = parsePlanToJobs(content);
    expect(jobs[0]?.title).not.toContain('**');
  });
});

describe('plan-executor — initializeExecution', () => {
  it('initializes from a valid plan', () => {
    writeFileSync(planPath, '## Milestone 1: Setup\n\n- **M01-T01**: x\n- **M01-T02**: y\n');
    const r = initializeExecution(tmpDir, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.total_jobs).toBe(2);
      expect(r.milestones).toContain('M01');
    }
  });

  it('fails when plan file does not exist', () => {
    const r = initializeExecution(tmpDir, { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Implementation plan not found/);
  });

  it('fails when plan has no parseable tasks', () => {
    writeFileSync(planPath, '# heading\nno tasks\n');
    const r = initializeExecution(tmpDir, { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/No tasks found/);
  });

  it('persists initial state', () => {
    writeFileSync(planPath, '- **M01-T01**: Task\n');
    initializeExecution(tmpDir, { stateFile });
    const s = loadExecutionState(stateFile);
    expect(s.jobs).toHaveLength(1);
    expect(s.execution_log[0]?.event).toBe('initialized');
  });
});

describe('plan-executor — getExecutionStatus', () => {
  it('reports uninitialized state', () => {
    const r = getExecutionStatus({ stateFile });
    expect(r.initialized).toBe(false);
  });

  it('reports progress after init', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n- **M01-T02**: y\n');
    initializeExecution(tmpDir, { stateFile });
    const r = getExecutionStatus({ stateFile });
    expect(r.initialized).toBe(true);
    if (r.initialized) {
      expect(r.total_jobs).toBe(2);
      expect(r.progress).toBe(0);
      expect(r.next_tasks.length).toBe(2);
    }
  });

  it('progresses to 50% on one of two completed', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n- **M01-T02**: y\n');
    initializeExecution(tmpDir, { stateFile });
    updateJobStatus('M01-T01', 'completed', { stateFile });
    const r = getExecutionStatus({ stateFile });
    if (r.initialized) {
      expect(r.progress).toBe(50);
    }
  });

  it('next_tasks excludes tasks blocked by uncompleted dependencies', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n- **M01-T02**: y, depends on M01-T01\n');
    initializeExecution(tmpDir, { stateFile });
    const r = getExecutionStatus({ stateFile });
    if (r.initialized) {
      expect(r.next_tasks.find((t) => t.id === 'M01-T02')).toBeUndefined();
      expect(r.next_tasks.find((t) => t.id === 'M01-T01')).toBeDefined();
    }
  });
});

describe('plan-executor — updateJobStatus', () => {
  it('updates status pending → in_progress and sets started_at', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    const r = updateJobStatus('M01-T01', 'in_progress', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.previous_status).toBe('pending');
      expect(r.new_status).toBe('in_progress');
      expect(r.started_at).toBeTruthy();
    }
  });

  it('sets completed_at on completed', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    const r = updateJobStatus('M01-T01', 'completed', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.completed_at).toBeTruthy();
  });

  it('rejects invalid status', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    const r = updateJobStatus('M01-T01', 'bogus', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Invalid status/);
  });

  it('rejects unknown job', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    const r = updateJobStatus('M99-T99', 'completed', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Job not found/);
  });

  it('records error message on failed status', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    updateJobStatus('M01-T01', 'failed', { stateFile, error: 'boom' });
    const s = loadExecutionState(stateFile);
    expect(s.jobs[0]?.error).toBe('boom');
  });

  it('records output_files when supplied', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    updateJobStatus('M01-T01', 'completed', { stateFile, output_files: ['src/x.ts'] });
    const s = loadExecutionState(stateFile);
    expect(s.jobs[0]?.output_files).toEqual(['src/x.ts']);
  });

  it('appends a status_change log entry', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    updateJobStatus('M01-T01', 'in_progress', { stateFile });
    const s = loadExecutionState(stateFile);
    const lastLog = s.execution_log[s.execution_log.length - 1];
    expect(lastLog?.event).toBe('status_change');
  });
});

describe('plan-executor — verifyJob', () => {
  it('verifies a completed job with no output files', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    updateJobStatus('M01-T01', 'completed', { stateFile });
    const r = verifyJob('M01-T01', tmpDir, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.verified).toBe(true);
  });

  it('rejects unknown job', () => {
    const r = verifyJob('M99-T99', tmpDir, { stateFile });
    expect(r.success).toBe(false);
  });

  it('fails verification when output_file missing', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    updateJobStatus('M01-T01', 'completed', {
      stateFile,
      output_files: ['nonexistent/file.ts'],
    });
    const r = verifyJob('M01-T01', tmpDir, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.verified).toBe(false);
      expect(r.checks.find((c) => c.check.includes('file_exists') && !c.passed)).toBeDefined();
    }
  });

  it('passes verification when output file exists', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    writeFileSync(join(tmpDir, 'output.ts'), '');
    updateJobStatus('M01-T01', 'completed', {
      stateFile,
      output_files: ['output.ts'],
    });
    const r = verifyJob('M01-T01', tmpDir, { stateFile });
    if (r.success) expect(r.verified).toBe(true);
  });

  it('rejects traversal-shaped output_files (defense in depth)', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    // Inject a malicious output_files via direct state-file write.
    const s = loadExecutionState(stateFile);
    if (s.jobs[0]) {
      s.jobs[0].status = 'completed';
      s.jobs[0].completed_at = new Date().toISOString();
      s.jobs[0].output_files = ['../../../etc/passwd'];
    }
    saveExecutionState(s, stateFile);
    const r = verifyJob('M01-T01', tmpDir, { stateFile });
    expect(r.success).toBe(true);
    // The traversal path should be reported as failed (file_exists: false).
    if (r.success) {
      const traversalCheck = r.checks.find((c) => c.check.startsWith('file_exists: ../'));
      expect(traversalCheck?.passed).toBe(false);
    }
  });
});

describe('plan-executor — resetExecution', () => {
  it('resets all jobs to pending', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n- **M01-T02**: y\n');
    initializeExecution(tmpDir, { stateFile });
    updateJobStatus('M01-T01', 'completed', { stateFile });
    updateJobStatus('M01-T02', 'in_progress', { stateFile });

    const r = resetExecution({ stateFile });
    expect(r.jobs_reset).toBe(2);

    const status = getExecutionStatus({ stateFile });
    if (status.initialized) {
      expect(status.status_counts.completed).toBe(0);
      expect(status.status_counts.in_progress).toBe(0);
      expect(status.status_counts.pending).toBe(2);
    }
  });

  it('clears started_at and completed_at', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    updateJobStatus('M01-T01', 'completed', { stateFile });
    resetExecution({ stateFile });
    const s = loadExecutionState(stateFile);
    expect(s.jobs[0]?.started_at).toBeNull();
    expect(s.jobs[0]?.completed_at).toBeNull();
  });

  it('appends a reset log entry', () => {
    writeFileSync(planPath, '- **M01-T01**: x\n');
    initializeExecution(tmpDir, { stateFile });
    resetExecution({ stateFile });
    const s = loadExecutionState(stateFile);
    const lastLog = s.execution_log[s.execution_log.length - 1];
    expect(lastLog?.event).toBe('reset');
  });

  it('handles reset on empty state (0 jobs)', () => {
    const r = resetExecution({ stateFile });
    expect(r.jobs_reset).toBe(0);
  });
});
