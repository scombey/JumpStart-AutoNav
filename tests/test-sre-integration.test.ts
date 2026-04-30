/**
 * tests/test-sre-integration.test.ts — SRE Integration port tests (M11 batch 6).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ALERT_SEVERITIES,
  MONITOR_TYPES,
  configureErrorBudget,
  defaultState,
  generateAlert,
  generateMonitor,
  generateReport,
  generateRunbook,
  loadState,
  saveState,
} from '../src/lib/sre-integration.js';

let tmpDir: string;
beforeEach(() => { tmpDir = join(tmpdir(), `test-sre-${Date.now()}`); mkdirSync(tmpDir, { recursive: true }); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('defaultState', () => {
  it('returns empty state', () => {
    const s = defaultState();
    expect(s.monitors).toEqual([]);
    expect(s.alerts).toEqual([]);
    expect(s.runbooks).toEqual([]);
    expect(s.error_budgets).toEqual([]);
  });
});

describe('loadState', () => {
  it('returns defaultState for missing file', () => {
    const s = loadState(join(tmpDir, 'missing.json'));
    expect(s.monitors).toEqual([]);
  });

  it('rejects __proto__ pollution key', () => {
    const f = join(tmpDir, 'polluted.json');
    writeFileSync(f, '{"__proto__":{"x":1},"version":"1.0.0","monitors":[],"alerts":[],"runbooks":[],"error_budgets":[],"last_updated":null}');
    const s = loadState(f);
    expect(s.monitors).toEqual([]);
  });

  it('rejects constructor pollution key', () => {
    const f = join(tmpDir, 'polluted2.json');
    writeFileSync(f, '{"constructor":{},"version":"1.0.0","monitors":[],"alerts":[],"runbooks":[],"error_budgets":[],"last_updated":null}');
    const s = loadState(f);
    expect(s.monitors).toEqual([]);
  });
});

describe('generateMonitor', () => {
  it('requires name and type', () => {
    const r = generateMonitor('', 'uptime', { stateFile: join(tmpDir, 's.json') });
    expect(r.success).toBe(false);
  });

  it('rejects unknown type', () => {
    const r = generateMonitor('My Monitor', 'badtype', { stateFile: join(tmpDir, 's.json') });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown type/);
  });

  it('creates monitor with valid inputs', () => {
    const f = join(tmpDir, 's.json');
    const r = generateMonitor('API uptime', 'uptime', { stateFile: f });
    expect(r.success).toBe(true);
    expect(r.monitor?.id).toMatch(/^MON-/);
  });
});

describe('generateAlert', () => {
  it('rejects unknown severity', () => {
    const r = generateAlert('Alert', 'unknown', { stateFile: join(tmpDir, 's.json') });
    expect(r.success).toBe(false);
  });

  it('creates alert with critical severity', () => {
    const f = join(tmpDir, 's.json');
    const r = generateAlert('CPU Alert', 'critical', { stateFile: f });
    expect(r.success).toBe(true);
    expect(r.alert?.id).toMatch(/^ALERT-/);
  });
});

describe('generateRunbook', () => {
  it('requires name and steps', () => {
    const r = generateRunbook('', null, { stateFile: join(tmpDir, 's.json') });
    expect(r.success).toBe(false);
  });

  it('creates runbook with steps', () => {
    const f = join(tmpDir, 's.json');
    const r = generateRunbook('Restart Service', ['Stop the pod', 'Scale down', 'Scale up'], { stateFile: f });
    expect(r.success).toBe(true);
    expect(r.runbook?.steps.length).toBe(3);
  });
});

describe('configureErrorBudget', () => {
  it('requires service and slo', () => {
    const r = configureErrorBudget('', undefined as unknown as number, { stateFile: join(tmpDir, 's.json') });
    expect(r.success).toBe(false);
  });

  it('creates error budget', () => {
    const f = join(tmpDir, 's.json');
    const r = configureErrorBudget('api', 99.9, { stateFile: f });
    expect(r.success).toBe(true);
    expect(r.error_budget?.id).toMatch(/^EB-/);
  });
});

describe('generateReport', () => {
  it('returns counts for empty state', () => {
    const f = join(tmpDir, 's.json');
    const r = generateReport({ stateFile: f });
    expect(r.total_monitors).toBe(0);
    expect(r.total_alerts).toBe(0);
    expect(r.total_runbooks).toBe(0);
  });
});

describe('MONITOR_TYPES / ALERT_SEVERITIES', () => {
  it('MONITOR_TYPES contains uptime', () => expect(MONITOR_TYPES).toContain('uptime'));
  it('ALERT_SEVERITIES contains critical', () => expect(ALERT_SEVERITIES).toContain('critical'));
});
