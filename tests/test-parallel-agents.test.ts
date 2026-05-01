/**
 * test-parallel-agents.test.ts — M11 batch 4 port coverage.
 *
 * Verifies the TS port at `src/lib/parallel-agents.ts` matches the
 * legacy `bin/lib/parallel-agents.js` public surface:
 *   - SIDECAR_AGENTS constant
 *   - defaultParallelState / loadParallelState / saveParallelState
 *   - scheduleRun: empty list → all 5 agents; subset filter; reject all-bogus
 *   - recordAgentFindings happy + unknown run + unknown agent
 *   - reconcileRun conflict detection
 *   - getRunStatus + listRuns
 *   - M3 hardening: rejects pollution payloads
 *
 * @see src/lib/parallel-agents.ts
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultParallelState,
  getRunStatus,
  listRuns,
  loadParallelState,
  reconcileRun,
  recordAgentFindings,
  SIDECAR_AGENTS,
  saveParallelState,
  scheduleRun,
} from '../src/lib/parallel-agents.js';

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'parallel-agents-'));
  stateFile = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('parallel-agents — constants', () => {
  it('exposes the 5 documented sidecar agents', () => {
    expect(SIDECAR_AGENTS).toEqual(['architect', 'security', 'qa', 'docs', 'performance']);
  });
});

describe('parallel-agents — defaultParallelState', () => {
  it('returns an empty state with the canonical shape', () => {
    const s = defaultParallelState();
    expect(s.version).toBe('1.0.0');
    expect(s.runs).toEqual([]);
    expect(s.last_updated).toBeNull();
    expect(s.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('parallel-agents — loadParallelState/saveParallelState', () => {
  it('returns defaultParallelState when the file does not exist', () => {
    expect(loadParallelState(stateFile).runs).toEqual([]);
  });

  it('round-trips through saveParallelState → loadParallelState', () => {
    const s = defaultParallelState();
    s.runs.push({
      id: 'run-1',
      scheduled_at: '2026-01-01T00:00:00Z',
      context: { foo: 'bar' },
      agents: [],
      reconciliation: null,
      status: 'pending',
    });
    saveParallelState(s, stateFile);
    const reloaded = loadParallelState(stateFile);
    expect(reloaded.runs).toHaveLength(1);
    expect(reloaded.runs[0]?.id).toBe('run-1');
    expect(reloaded.last_updated).not.toBeNull();
  });

  it('falls back to defaultParallelState on malformed JSON', () => {
    writeFileSync(stateFile, '{not-json');
    const s = loadParallelState(stateFile);
    expect(s.runs).toEqual([]);
  });

  it('M3 hardening: rejects __proto__ payload', () => {
    writeFileSync(stateFile, '{"__proto__":{"polluted":true},"runs":[{"id":"r"}]}');
    const s = loadParallelState(stateFile);
    expect(s.runs).toEqual([]);
  });

  it('M3 hardening: rejects constructor payload', () => {
    writeFileSync(stateFile, '{"constructor":{"x":1},"runs":[{"id":"r"}]}');
    const s = loadParallelState(stateFile);
    expect(s.runs).toEqual([]);
  });
});

describe('parallel-agents — scheduleRun', () => {
  it('schedules with all 5 agents when list is empty', () => {
    const r = scheduleRun([], { root: tmpDir }, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.run_id).toMatch(/^run-\d+$/);
      expect(r.agents).toHaveLength(SIDECAR_AGENTS.length);
    }
  });

  it('schedules with all 5 when agents is null/undefined', () => {
    const r = scheduleRun(null, null, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.agents).toHaveLength(SIDECAR_AGENTS.length);
  });

  it('accepts a subset of agents', () => {
    const r = scheduleRun(['security', 'qa'], { root: tmpDir }, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.agents).toEqual(['security', 'qa']);
  });

  it('rejects an all-unknown agent list', () => {
    const r = scheduleRun(['wizard'], { root: tmpDir }, { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/No valid agents/);
  });

  it('persists the run on disk', () => {
    scheduleRun(['security'], { root: tmpDir }, { stateFile });
    const reloaded = loadParallelState(stateFile);
    expect(reloaded.runs).toHaveLength(1);
    expect(reloaded.runs[0]?.agents[0]?.name).toBe('security');
  });
});

describe('parallel-agents — recordAgentFindings', () => {
  it('records findings + marks agent completed', () => {
    const run = scheduleRun(['security'], { root: tmpDir }, { stateFile });
    if (!run.success) throw new Error('setup');
    const findings = [{ type: 'vuln', message: 'SQLi', severity: 'error', file: 'src/db.js' }];
    const r = recordAgentFindings(run.run_id, 'security', findings, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.findings_count).toBe(1);
  });

  it('marks the run completed once every agent has reported', () => {
    const run = scheduleRun(['security', 'qa'], { root: tmpDir }, { stateFile });
    if (!run.success) throw new Error('setup');
    recordAgentFindings(run.run_id, 'security', [], { stateFile });
    let reloaded = loadParallelState(stateFile);
    expect(reloaded.runs[0]?.status).toBe('pending');
    recordAgentFindings(run.run_id, 'qa', [], { stateFile });
    reloaded = loadParallelState(stateFile);
    expect(reloaded.runs[0]?.status).toBe('completed');
  });

  it('rejects unknown run id', () => {
    const r = recordAgentFindings('bad-run', 'security', [], { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects unknown agent name', () => {
    const run = scheduleRun(['security'], { root: tmpDir }, { stateFile });
    if (!run.success) throw new Error('setup');
    const r = recordAgentFindings(run.run_id, 'wizard', [], { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Agent not found/);
  });

  it('tolerates null findings', () => {
    const run = scheduleRun(['security'], { root: tmpDir }, { stateFile });
    if (!run.success) throw new Error('setup');
    const r = recordAgentFindings(run.run_id, 'security', null, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.findings_count).toBe(0);
  });
});

describe('parallel-agents — reconcileRun', () => {
  it('merges findings across agents', () => {
    const run = scheduleRun(['security', 'qa'], { root: tmpDir }, { stateFile });
    if (!run.success) throw new Error('setup');
    recordAgentFindings(
      run.run_id,
      'security',
      [{ type: 'vuln', message: 'A', severity: 'error', file: 'a.js' }],
      { stateFile }
    );
    recordAgentFindings(
      run.run_id,
      'qa',
      [{ type: 'flaky', message: 'B', severity: 'warn', file: 'b.js' }],
      { stateFile }
    );
    const r = reconcileRun(run.run_id, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.reconciliation.total_findings).toBe(2);
      expect(r.reconciliation.merged_findings).toHaveLength(2);
    }
  });

  it('detects severity disagreements on the same key', () => {
    const run = scheduleRun(['security', 'qa'], { root: tmpDir }, { stateFile });
    if (!run.success) throw new Error('setup');
    recordAgentFindings(
      run.run_id,
      'security',
      [{ type: 'vuln', file: 'a.js', severity: 'error', message: 'sec view' }],
      { stateFile }
    );
    recordAgentFindings(
      run.run_id,
      'qa',
      [{ type: 'vuln', file: 'a.js', severity: 'warn', message: 'qa view' }],
      { stateFile }
    );
    const r = reconcileRun(run.run_id, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.reconciliation.conflicts).toBe(1);
      expect(r.reconciliation.conflict_list[0]?.agents).toEqual(['security', 'qa']);
    }
  });

  it('rejects unknown run id', () => {
    const r = reconcileRun('bad-run', { stateFile });
    expect(r.success).toBe(false);
  });
});

describe('parallel-agents — getRunStatus', () => {
  it('returns canonical shape for an existing run', () => {
    const run = scheduleRun(['security'], { root: tmpDir }, { stateFile });
    if (!run.success) throw new Error('setup');
    const r = getRunStatus(run.run_id, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.run_id).toBe(run.run_id);
      expect(r.status).toBe('pending');
      expect(r.agents).toHaveLength(1);
      expect(r.agents[0]?.name).toBe('security');
    }
  });

  it('rejects unknown run id', () => {
    const r = getRunStatus('bad-run', { stateFile });
    expect(r.success).toBe(false);
  });
});

describe('parallel-agents — listRuns', () => {
  it('returns empty list initially', () => {
    const r = listRuns({ stateFile });
    expect(r.total).toBe(0);
    expect(r.runs).toEqual([]);
  });

  it('lists all scheduled runs', () => {
    scheduleRun(['security'], { root: tmpDir }, { stateFile });
    scheduleRun(['qa'], { root: tmpDir }, { stateFile });
    const r = listRuns({ stateFile });
    expect(r.total).toBe(2);
    expect(r.runs[0]?.agent_count).toBe(1);
  });
});
