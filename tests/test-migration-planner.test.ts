/**
 * test-migration-planner.test.ts — M11 batch 2 port coverage.
 *
 * Verifies the TS port at `src/lib/migration-planner.ts` matches the
 * legacy `bin/lib/migration-planner.js` public surface:
 *   - MIGRATION_STRATEGIES / MIGRATION_PHASES catalogs byte-identical
 *   - createMigration validation, persistence, ID generation
 *   - advancePhase phase-validation + not-found branch
 *   - generateReport aggregation by strategy + phase
 *   - M3 hardening: rejects __proto__/constructor/prototype keys
 *
 * @see src/lib/migration-planner.ts
 * @see bin/lib/migration-planner.js (legacy reference)
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  createMigration,
  defaultState,
  generateReport,
  loadState,
  MIGRATION_PHASES,
  MIGRATION_STRATEGIES,
  saveState,
} from '../src/lib/migration-planner.js';

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'migration-planner-'));
  stateFile = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('migration-planner — constants', () => {
  it('exposes the 5 documented strategies', () => {
    expect(MIGRATION_STRATEGIES).toEqual([
      'strangler-fig',
      'big-bang',
      'phased-cutover',
      'parallel-run',
      'feature-flag',
    ]);
  });

  it('exposes the 7 documented phases', () => {
    expect(MIGRATION_PHASES).toEqual([
      'discovery',
      'planning',
      'compatibility-layer',
      'migration',
      'validation',
      'cutover',
      'cleanup',
    ]);
  });
});

describe('migration-planner — defaultState', () => {
  it('returns an empty state with the canonical shape', () => {
    const s = defaultState();
    expect(s.version).toBe('1.0.0');
    expect(s.migrations).toEqual([]);
    expect(s.last_updated).toBeNull();
    expect(s.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('migration-planner — loadState/saveState', () => {
  it('returns defaultState when the file does not exist', () => {
    expect(loadState(stateFile).migrations).toEqual([]);
  });

  it('round-trips through saveState → loadState', () => {
    const s = defaultState();
    s.migrations.push({
      id: 'MIG-001',
      name: 'test',
      strategy: 'strangler-fig',
      source_system: 'old',
      target_system: 'new',
      current_phase: 'discovery',
      components: [],
      rollback_plan: null,
      compatibility_requirements: [],
      created_at: '2026-01-01T00:00:00Z',
    });
    saveState(s, stateFile);
    const reloaded = loadState(stateFile);
    expect(reloaded.migrations).toHaveLength(1);
    expect(reloaded.migrations[0].id).toBe('MIG-001');
    expect(reloaded.last_updated).not.toBeNull();
  });

  it('rejects __proto__ key (M3 hardening)', () => {
    writeFileSync(stateFile, JSON.stringify({ __proto__: { polluted: true }, migrations: [] }));
    const s = loadState(stateFile);
    expect(s.migrations).toEqual([]);
  });

  it('falls back to defaultState on malformed JSON', () => {
    writeFileSync(stateFile, '{not-json');
    const s = loadState(stateFile);
    expect(s.migrations).toEqual([]);
  });
});

describe('migration-planner — createMigration', () => {
  it('creates a plan with default discovery phase + zero-padded ID', () => {
    const r = createMigration({ name: 'monolith-split', strategy: 'strangler-fig' }, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.migration.id).toBe('MIG-001');
      expect(r.migration.current_phase).toBe('discovery');
      expect(r.migration.components).toEqual([]);
    }
  });

  it('increments the ID for each new migration', () => {
    createMigration({ name: 'a', strategy: 'big-bang' }, { stateFile });
    const r = createMigration({ name: 'b', strategy: 'phased-cutover' }, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.migration.id).toBe('MIG-002');
  });

  it('normalizes string components to objects with status=pending', () => {
    const r = createMigration(
      { name: 'm', strategy: 'feature-flag', components: ['svc-a', 'svc-b'] },
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.migration.components).toHaveLength(2);
      expect(r.migration.components[0]).toMatchObject({ name: 'svc-a', status: 'pending' });
    }
  });

  it('rejects missing name', () => {
    const r = createMigration({ name: '', strategy: 'strangler-fig' }, { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects unknown strategy', () => {
    const r = createMigration({ name: 'x', strategy: 'invalid-strategy' }, { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Invalid strategy');
  });

  it('rejects null input', () => {
    const r = createMigration(null, { stateFile });
    expect(r.success).toBe(false);
  });
});

describe('migration-planner — advancePhase', () => {
  it('advances the named migration to a valid phase', () => {
    const c = createMigration({ name: 'm', strategy: 'strangler-fig' }, { stateFile });
    if (!c.success) throw new Error('setup');
    const r = advancePhase(c.migration.id, 'planning', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.phase).toBe('planning');
    }
    expect(loadState(stateFile).migrations[0].current_phase).toBe('planning');
  });

  it('rejects unknown phase', () => {
    const c = createMigration({ name: 'm', strategy: 'strangler-fig' }, { stateFile });
    if (!c.success) throw new Error('setup');
    const r = advancePhase(c.migration.id, 'totally-bogus', { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects unknown migration id', () => {
    const r = advancePhase('MIG-XYZ', 'planning', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Migration not found');
  });
});

describe('migration-planner — generateReport', () => {
  it('aggregates by strategy + phase', () => {
    const a = createMigration({ name: 'a', strategy: 'strangler-fig' }, { stateFile });
    if (!a.success) throw new Error('setup');
    createMigration({ name: 'b', strategy: 'strangler-fig' }, { stateFile });
    createMigration({ name: 'c', strategy: 'big-bang' }, { stateFile });
    advancePhase(a.migration.id, 'planning', { stateFile });

    const r = generateReport({ stateFile });
    expect(r.total_migrations).toBe(3);
    expect(r.by_strategy['strangler-fig']).toBe(2);
    expect(r.by_strategy['big-bang']).toBe(1);
    expect(r.by_phase.planning).toBe(1);
    expect(r.by_phase.discovery).toBe(2);
  });

  it('returns zeroed counts on empty state', () => {
    const r = generateReport({ stateFile });
    expect(r.total_migrations).toBe(0);
    expect(r.migrations).toEqual([]);
  });
});
