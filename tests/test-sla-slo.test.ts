/**
 * tests/test-sla-slo.test.ts — SLA/SLO port tests (M11 batch 6).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyTemplate,
  checkSLOCoverage,
  DEFAULT_SLO_TEMPLATES,
  defaultState,
  defineSLO,
  generateReport,
  loadState,
  SLO_TYPES,
  saveState,
} from '../src/lib/sla-slo.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `test-sla-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('defaultState', () => {
  it('returns empty SLOs/SLAs', () => {
    const s = defaultState();
    expect(s.slos).toEqual([]);
    expect(s.slas).toEqual([]);
  });
});

describe('loadState', () => {
  it('returns defaultState for missing file', () => {
    const s = loadState(join(tmpDir, 'missing.json'));
    expect(s.slos).toEqual([]);
  });

  it('returns defaultState for invalid JSON', () => {
    const f = join(tmpDir, 'bad.json');
    writeFileSync(f, 'not json');
    const s = loadState(f);
    expect(s.slos).toEqual([]);
  });

  // Pollution key tests
  it('rejects __proto__ key in JSON', () => {
    const f = join(tmpDir, 'polluted.json');
    writeFileSync(
      f,
      '{"__proto__":{"x":1},"version":"1.0.0","created_at":"2024-01-01T00:00:00.000Z","last_updated":null,"slos":[],"slas":[],"error_budgets":[]}'
    );
    const s = loadState(f);
    expect(s.slos).toEqual([]);
  });

  it('rejects constructor key in JSON', () => {
    const f = join(tmpDir, 'polluted2.json');
    writeFileSync(
      f,
      '{"constructor":{},"version":"1.0.0","created_at":"2024-01-01T00:00:00.000Z","last_updated":null,"slos":[],"slas":[],"error_budgets":[]}'
    );
    const s = loadState(f);
    expect(s.slos).toEqual([]);
  });
});

describe('saveState / loadState round-trip', () => {
  it('saves and loads', () => {
    const f = join(tmpDir, 'state.json');
    const s = defaultState();
    saveState(s, f);
    const loaded = loadState(f);
    expect(loaded.version).toBe('1.0.0');
    expect(loaded.last_updated).toBeTruthy();
  });
});

describe('defineSLO', () => {
  it('requires name, service, target', () => {
    const f = join(tmpDir, 'state.json');
    const r = defineSLO({ name: '', service: 'api', target: 99 }, { stateFile: f });
    expect(r.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const f = join(tmpDir, 'state.json');
    const r = defineSLO(
      { name: 'SLO', service: 'api', target: 99, type: 'invalid' },
      { stateFile: f }
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Invalid type/);
  });

  it('creates SLO with valid inputs', () => {
    const f = join(tmpDir, 'state.json');
    const r = defineSLO(
      { name: 'API Availability', service: 'api', target: 99.9, type: 'availability' },
      { stateFile: f }
    );
    expect(r.success).toBe(true);
    expect(r.slo?.id).toMatch(/^SLO-/);
  });

  it('persists to state file', () => {
    const f = join(tmpDir, 'state.json');
    defineSLO({ name: 'SLO1', service: 'svc', target: 99 }, { stateFile: f });
    const state = loadState(f);
    expect(state.slos.length).toBe(1);
  });
});

describe('applyTemplate', () => {
  it('rejects unknown template', () => {
    const f = join(tmpDir, 'state.json');
    const r = applyTemplate('my-svc', 'unknown-template', { stateFile: f });
    expect(r.success).toBe(false);
  });

  it('creates SLOs from web-api template', () => {
    const f = join(tmpDir, 'state.json');
    const r = applyTemplate('my-api', 'web-api', { stateFile: f });
    expect(r.success).toBe(true);
    expect(r.slos_created ?? 0).toBeGreaterThan(0);
  });
});

describe('checkSLOCoverage', () => {
  it('returns coverage=missing when no SLOs defined', () => {
    const r = checkSLOCoverage(tmpDir);
    expect(r.success).toBe(true);
    expect(r.coverage).toBe('missing');
    expect(r.recommendations.length).toBeGreaterThan(0);
  });
});

describe('generateReport', () => {
  it('returns empty report for empty state', () => {
    const f = join(tmpDir, 'state.json');
    const r = generateReport({ stateFile: f });
    expect(r.total_slos).toBe(0);
    expect(r.by_service).toEqual({});
  });
});

describe('SLO_TYPES', () => {
  it('includes availability and latency', () => {
    expect(SLO_TYPES).toContain('availability');
    expect(SLO_TYPES).toContain('latency');
  });
});

describe('DEFAULT_SLO_TEMPLATES', () => {
  it('has web-api template', () => {
    expect(DEFAULT_SLO_TEMPLATES['web-api']).toBeTruthy();
    expect(DEFAULT_SLO_TEMPLATES['web-api']?.length).toBeGreaterThan(0);
  });
});
