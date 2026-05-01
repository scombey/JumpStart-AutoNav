/**
 * test-agent-checkpoint.test.ts — M11 batch 3 port coverage.
 *
 * Verifies the TS port at `src/lib/agent-checkpoint.ts` matches the
 * legacy `bin/lib/agent-checkpoint.js` public surface:
 *   - CHECKPOINT_TYPES constant byte-identical
 *   - saveCheckpoint validation, ID format, default fields
 *   - restoreCheckpoint by-id / latest / not-found rejection
 *   - listCheckpoints filtering by agent/phase/type
 *   - cleanCheckpoints default-keep + removed/remaining math
 *   - Auto-trim to 50 on save
 *   - M3 hardening: rejects __proto__/constructor/prototype keys
 *
 * @see src/lib/agent-checkpoint.ts
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHECKPOINT_TYPES,
  cleanCheckpoints,
  defaultState,
  listCheckpoints,
  loadState,
  restoreCheckpoint,
  saveCheckpoint,
  saveState,
} from '../src/lib/agent-checkpoint.js';

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-checkpoint-'));
  stateFile = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('agent-checkpoint — constants', () => {
  it('exposes the 6 documented checkpoint types', () => {
    expect(CHECKPOINT_TYPES).toEqual([
      'phase-start',
      'phase-end',
      'task-start',
      'task-end',
      'error-recovery',
      'manual',
    ]);
  });
});

describe('agent-checkpoint — defaultState', () => {
  it('returns an empty state with the canonical shape', () => {
    const s = defaultState();
    expect(s.version).toBe('1.0.0');
    expect(s.checkpoints).toEqual([]);
    expect(s.recovery_log).toEqual([]);
    expect(s.last_updated).toBeNull();
    expect(s.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('agent-checkpoint — loadState/saveState', () => {
  it('returns defaultState when the file does not exist', () => {
    expect(loadState(stateFile).checkpoints).toEqual([]);
  });

  it('round-trips through saveState → loadState', () => {
    const s = defaultState();
    s.checkpoints.push({
      id: 'CP-ABC',
      agent: 'developer',
      phase: 'P3',
      task: 'task-1',
      type: 'manual',
      context: { foo: 'bar' },
      files_snapshot: ['src/x.ts'],
      saved_at: '2026-01-01T00:00:00Z',
    });
    saveState(s, stateFile);
    const reloaded = loadState(stateFile);
    expect(reloaded.checkpoints).toHaveLength(1);
    expect(reloaded.checkpoints[0]?.agent).toBe('developer');
    expect(reloaded.last_updated).not.toBeNull();
  });

  it('rejects __proto__ key (M3 hardening)', () => {
    writeFileSync(stateFile, JSON.stringify({ __proto__: { polluted: true }, checkpoints: [] }));
    const s = loadState(stateFile);
    expect(s.checkpoints).toEqual([]);
  });

  it('rejects constructor / prototype keys', () => {
    writeFileSync(stateFile, JSON.stringify({ constructor: { x: 1 }, checkpoints: [] }));
    const s = loadState(stateFile);
    expect(s.checkpoints).toEqual([]);
  });

  it('falls back to defaultState on malformed JSON', () => {
    writeFileSync(stateFile, '{not-json');
    const s = loadState(stateFile);
    expect(s.checkpoints).toEqual([]);
  });
});

describe('agent-checkpoint — saveCheckpoint', () => {
  it('creates a checkpoint with CP- prefix + base36 timestamp', () => {
    const r = saveCheckpoint({ agent: 'developer' }, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.checkpoint.id).toMatch(/^CP-[A-Z0-9]+$/);
      expect(r.checkpoint.agent).toBe('developer');
      expect(r.checkpoint.type).toBe('manual'); // default
      expect(r.checkpoint.phase).toBeNull();
      expect(r.checkpoint.task).toBeNull();
      expect(r.checkpoint.context).toEqual({});
      expect(r.checkpoint.files_snapshot).toEqual([]);
    }
  });

  it('honours all optional fields', () => {
    const r = saveCheckpoint(
      {
        agent: 'pm',
        phase: 'P2',
        task: 'task-7',
        type: 'phase-start',
        context: { stage: 'plan' },
        files_snapshot: ['specs/prd.md'],
      },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.checkpoint.phase).toBe('P2');
      expect(r.checkpoint.task).toBe('task-7');
      expect(r.checkpoint.type).toBe('phase-start');
      expect(r.checkpoint.context).toEqual({ stage: 'plan' });
      expect(r.checkpoint.files_snapshot).toEqual(['specs/prd.md']);
    }
  });

  it('rejects empty agent', () => {
    const r = saveCheckpoint({ agent: '' }, { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects null input', () => {
    const r = saveCheckpoint(null, { stateFile });
    expect(r.success).toBe(false);
  });

  it('persists to disk', () => {
    saveCheckpoint({ agent: 'a' }, { stateFile });
    saveCheckpoint({ agent: 'b' }, { stateFile });
    const reloaded = loadState(stateFile);
    expect(reloaded.checkpoints).toHaveLength(2);
  });

  it('auto-trims to last 50 checkpoints', () => {
    const s = defaultState();
    for (let i = 0; i < 55; i++) {
      s.checkpoints.push({
        id: `CP-${i}`,
        agent: 'a',
        phase: null,
        task: null,
        type: 'manual',
        context: {},
        files_snapshot: [],
        saved_at: '2026-01-01T00:00:00Z',
      });
    }
    saveState(s, stateFile);
    saveCheckpoint({ agent: 'final' }, { stateFile });
    const reloaded = loadState(stateFile);
    expect(reloaded.checkpoints).toHaveLength(50);
    // The newest entry should be the freshly-saved one.
    expect(reloaded.checkpoints[reloaded.checkpoints.length - 1]?.agent).toBe('final');
  });
});

describe('agent-checkpoint — restoreCheckpoint', () => {
  it('restores by id', () => {
    const a = saveCheckpoint({ agent: 'developer' }, { stateFile });
    if (!a.success) throw new Error('setup');
    const r = restoreCheckpoint(a.checkpoint.id, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.checkpoint.id).toBe(a.checkpoint.id);
      expect(r.agent).toBe('developer');
    }
  });

  it('restores latest when no id provided', () => {
    saveCheckpoint({ agent: 'a' }, { stateFile });
    saveCheckpoint({ agent: 'b' }, { stateFile });
    const r = restoreCheckpoint(undefined, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.agent).toBe('b');
  });

  it('appends to recovery_log on restore', () => {
    const a = saveCheckpoint({ agent: 'x' }, { stateFile });
    if (!a.success) throw new Error('setup');
    restoreCheckpoint(a.checkpoint.id, { stateFile });
    const reloaded = loadState(stateFile);
    expect(reloaded.recovery_log).toHaveLength(1);
    expect(reloaded.recovery_log[0]?.checkpoint_id).toBe(a.checkpoint.id);
  });

  it('rejects unknown id', () => {
    const r = restoreCheckpoint('CP-XYZ', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Checkpoint not found');
  });

  it('rejects when no checkpoints exist + no id provided', () => {
    const r = restoreCheckpoint(undefined, { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('No checkpoints');
  });
});

describe('agent-checkpoint — listCheckpoints', () => {
  beforeEach(() => {
    saveCheckpoint({ agent: 'developer', phase: 'P3', type: 'task-start' }, { stateFile });
    saveCheckpoint({ agent: 'developer', phase: 'P4', type: 'task-end' }, { stateFile });
    saveCheckpoint({ agent: 'pm', phase: 'P2', type: 'phase-start' }, { stateFile });
  });

  it('returns all when no filter', () => {
    const r = listCheckpoints({}, { stateFile });
    expect(r.total).toBe(3);
  });

  it('filters by agent', () => {
    const r = listCheckpoints({ agent: 'developer' }, { stateFile });
    expect(r.total).toBe(2);
  });

  it('filters by phase', () => {
    const r = listCheckpoints({ phase: 'P3' }, { stateFile });
    expect(r.total).toBe(1);
  });

  it('filters by type', () => {
    const r = listCheckpoints({ type: 'task-end' }, { stateFile });
    expect(r.total).toBe(1);
  });
});

describe('agent-checkpoint — cleanCheckpoints', () => {
  it('removes oldest checkpoints, keeps last `keep`', () => {
    for (let i = 0; i < 15; i++) saveCheckpoint({ agent: `a-${i}` }, { stateFile });
    const r = cleanCheckpoints({ stateFile, keep: 5 });
    expect(r.removed).toBe(10);
    expect(r.remaining).toBe(5);
    const reloaded = loadState(stateFile);
    expect(reloaded.checkpoints).toHaveLength(5);
    // Newest entries kept.
    expect(reloaded.checkpoints[reloaded.checkpoints.length - 1]?.agent).toBe('a-14');
  });

  it('defaults keep=10 (legacy parity)', () => {
    for (let i = 0; i < 12; i++) saveCheckpoint({ agent: `a-${i}` }, { stateFile });
    const r = cleanCheckpoints({ stateFile });
    expect(r.removed).toBe(2);
    expect(r.remaining).toBe(10);
  });

  it('removed=0 when below keep threshold', () => {
    saveCheckpoint({ agent: 'a' }, { stateFile });
    const r = cleanCheckpoints({ stateFile, keep: 10 });
    expect(r.removed).toBe(0);
    expect(r.remaining).toBe(1);
  });
});
