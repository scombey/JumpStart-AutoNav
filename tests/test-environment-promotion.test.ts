/**
 * test-environment-promotion.test.ts — M11 batch 4 port coverage.
 *
 * Verifies the TS port at `src/lib/environment-promotion.ts` matches
 * the legacy `bin/lib/environment-promotion.js` public surface:
 *   - ENVIRONMENTS / DEFAULT_GATES constants byte-identical
 *   - defaultState shape (dev=active, others=pending)
 *   - loadState/saveState round-trip + M3 hardening
 *   - checkGates with passing/failing gates + invalid env rejection
 *   - recordGateResult (success + invalid env + unknown gate)
 *   - promote happy path + backward-promotion rejection + gate-fail
 *   - getStatus shape
 *
 * @see src/lib/environment-promotion.ts
 * @see bin/lib/environment-promotion.js (legacy reference)
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkGates,
  DEFAULT_GATES,
  defaultState,
  ENVIRONMENTS,
  getStatus,
  loadState,
  promote,
  recordGateResult,
  saveState,
} from '../src/lib/environment-promotion.js';

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'env-promotion-'));
  stateFile = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('environment-promotion — constants', () => {
  it('exposes the 4 documented environments', () => {
    expect(ENVIRONMENTS).toEqual(['dev', 'test', 'staging', 'prod']);
  });

  it('defines default gates for every environment', () => {
    for (const env of ENVIRONMENTS) {
      expect(DEFAULT_GATES[env]).toBeDefined();
      expect(Array.isArray(DEFAULT_GATES[env])).toBe(true);
      expect((DEFAULT_GATES[env] ?? []).length).toBeGreaterThan(0);
    }
  });
});

describe('environment-promotion — defaultState', () => {
  it('returns dev=active and the rest pending', () => {
    const s = defaultState();
    expect(s.current_environment).toBe('dev');
    expect(s.environments).toHaveLength(4);
    expect(s.environments[0]?.status).toBe('active');
    expect(s.environments[1]?.status).toBe('pending');
    expect(s.environments[2]?.status).toBe('pending');
    expect(s.environments[3]?.status).toBe('pending');
  });

  it('seeds gates in unpassed state', () => {
    const s = defaultState();
    for (const env of s.environments) {
      for (const g of env.gates) {
        expect(g.passed).toBe(false);
        expect(g.checked_at).toBeNull();
      }
    }
  });
});

describe('environment-promotion — loadState/saveState', () => {
  it('returns defaultState when the file does not exist', () => {
    const s = loadState(stateFile);
    expect(s.current_environment).toBe('dev');
  });

  it('round-trips through saveState → loadState', () => {
    const s = defaultState();
    s.current_environment = 'test';
    saveState(s, stateFile);
    const reloaded = loadState(stateFile);
    expect(reloaded.current_environment).toBe('test');
    expect(reloaded.last_updated).not.toBeNull();
  });

  it('falls back to defaultState on malformed JSON', () => {
    writeFileSync(stateFile, '{not-json');
    const s = loadState(stateFile);
    expect(s.version).toBe('1.0.0');
  });

  it('M3 hardening: rejects __proto__', () => {
    writeFileSync(stateFile, '{"__proto__":{"polluted":true},"current_environment":"prod"}');
    const s = loadState(stateFile);
    expect(s.current_environment).toBe('dev');
  });

  it('M3 hardening: rejects constructor', () => {
    writeFileSync(stateFile, '{"constructor":{"x":1},"current_environment":"prod"}');
    const s = loadState(stateFile);
    expect(s.current_environment).toBe('dev');
  });

  it('M3 hardening: rejects prototype', () => {
    writeFileSync(stateFile, '{"prototype":{"x":1},"current_environment":"prod"}');
    const s = loadState(stateFile);
    expect(s.current_environment).toBe('dev');
  });
});

describe('environment-promotion — checkGates', () => {
  it('reports all gates pending for fresh state', () => {
    saveState(defaultState(), stateFile);
    const r = checkGates('dev', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.all_passed).toBe(false);
      expect(r.pending.length).toBeGreaterThan(0);
      expect(r.ready_to_promote).toBe(false);
    }
  });

  it('rejects invalid environment', () => {
    const r = checkGates('invalid-env', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Invalid environment');
  });

  it('reports all_passed=true once every gate passes', () => {
    const s = defaultState();
    const dev = s.environments[0];
    if (!dev) throw new Error('setup');
    for (const g of dev.gates) g.passed = true;
    saveState(s, stateFile);
    const r = checkGates('dev', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.all_passed).toBe(true);
      expect(r.ready_to_promote).toBe(true);
      expect(r.pending).toHaveLength(0);
    }
  });
});

describe('environment-promotion — recordGateResult', () => {
  it('records a passing gate', () => {
    saveState(defaultState(), stateFile);
    const r = recordGateResult('dev', 'unit-tests', true, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.gate).toBe('unit-tests');
      expect(r.passed).toBe(true);
    }
  });

  it('rejects invalid environment', () => {
    const r = recordGateResult('bogus', 'unit-tests', true, { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects unknown gate name', () => {
    saveState(defaultState(), stateFile);
    const r = recordGateResult('dev', 'nonexistent-gate', true, { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Gate not found');
  });

  it('persists gate result to disk', () => {
    saveState(defaultState(), stateFile);
    recordGateResult('dev', 'lint', true, { stateFile });
    const reloaded = loadState(stateFile);
    const dev = reloaded.environments.find((e) => e.name === 'dev');
    const lint = dev?.gates.find((g) => g.name === 'lint');
    expect(lint?.passed).toBe(true);
    expect(lint?.checked_at).toBeTruthy();
  });
});

describe('environment-promotion — promote', () => {
  it('promotes from dev to test when all dev gates pass', () => {
    const s = defaultState();
    const dev = s.environments[0];
    if (!dev) throw new Error('setup');
    for (const g of dev.gates) g.passed = true;
    saveState(s, stateFile);
    const r = promote('test', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.from).toBe('dev');
      expect(r.to).toBe('test');
    }
  });

  it('rejects promotion when source gates are unpassed', () => {
    saveState(defaultState(), stateFile);
    const r = promote('test', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Gates not passed');
  });

  it('rejects backward promotion', () => {
    const s = defaultState();
    s.current_environment = 'staging';
    saveState(s, stateFile);
    const r = promote('dev', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Cannot promote backward');
  });

  it('rejects invalid target environment', () => {
    const r = promote('nonexistent', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Invalid environment');
  });

  it('records promotion history with promotedBy', () => {
    const s = defaultState();
    const dev = s.environments[0];
    if (!dev) throw new Error('setup');
    for (const g of dev.gates) g.passed = true;
    saveState(s, stateFile);
    promote('test', { stateFile, promotedBy: 'user@example.com' });
    const reloaded = loadState(stateFile);
    expect(reloaded.promotion_history).toHaveLength(1);
    expect(reloaded.promotion_history[0]?.from).toBe('dev');
    expect(reloaded.promotion_history[0]?.to).toBe('test');
    expect(reloaded.promotion_history[0]?.promoted_by).toBe('user@example.com');
  });

  it('promotedBy defaults to null when omitted', () => {
    const s = defaultState();
    const dev = s.environments[0];
    if (!dev) throw new Error('setup');
    for (const g of dev.gates) g.passed = true;
    saveState(s, stateFile);
    promote('test', { stateFile });
    const reloaded = loadState(stateFile);
    expect(reloaded.promotion_history[0]?.promoted_by).toBeNull();
  });

  it('rejects multi-step promotion when intermediate gates fail', () => {
    // dev passes, but test fails — promoting straight to staging must fail.
    const s = defaultState();
    const dev = s.environments[0];
    if (!dev) throw new Error('setup');
    for (const g of dev.gates) g.passed = true;
    saveState(s, stateFile);
    const r = promote('staging', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Gates not passed for test/);
  });
});

describe('environment-promotion — getStatus', () => {
  it('returns canonical shape from fresh state', () => {
    const r = getStatus({ stateFile });
    expect(r.success).toBe(true);
    expect(r.current_environment).toBe('dev');
    expect(r.environments).toHaveLength(4);
    expect(r.promotion_history).toEqual([]);
  });

  it('reports gates_passed/gates_total per env', () => {
    const s = defaultState();
    const dev = s.environments[0];
    if (!dev) throw new Error('setup');
    const firstGate = dev.gates[0];
    if (!firstGate) throw new Error('setup');
    firstGate.passed = true;
    saveState(s, stateFile);
    const r = getStatus({ stateFile });
    const devEntry = r.environments.find((e) => e.name === 'dev');
    expect(devEntry?.gates_passed).toBe(1);
    expect(devEntry?.gates_total).toBe(DEFAULT_GATES.dev.length);
  });
});
