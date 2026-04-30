/**
 * tests/test-telemetry-feedback.test.ts — Telemetry Feedback port tests.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  METRIC_TYPES,
  analyzeMetrics,
  defaultState,
  generateFeedbackReport,
  ingestMetric,
  loadState,
  saveState,
} from '../src/lib/telemetry-feedback.js';

let tmpDir: string;
beforeEach(() => { tmpDir = join(tmpdir(), `test-tel-${Date.now()}`); mkdirSync(tmpDir, { recursive: true }); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('defaultState', () => {
  it('returns empty metrics and insights', () => {
    const s = defaultState();
    expect(s.metrics).toEqual([]);
    expect(s.insights).toEqual([]);
  });
});

describe('loadState', () => {
  it('returns defaultState for missing file', () => {
    const s = loadState(join(tmpDir, 'missing.json'));
    expect(s.metrics).toEqual([]);
  });

  it('returns defaultState for invalid JSON', () => {
    const f = join(tmpDir, 'bad.json');
    writeFileSync(f, 'not valid');
    const s = loadState(f);
    expect(s.metrics).toEqual([]);
  });

  it('rejects __proto__ pollution key', () => {
    const f = join(tmpDir, 'polluted.json');
    writeFileSync(f, '{"__proto__":{"x":1},"version":"1.0.0","metrics":[],"insights":[],"last_updated":null}');
    const s = loadState(f);
    expect(s.metrics).toEqual([]);
  });

  it('rejects constructor pollution key', () => {
    const f = join(tmpDir, 'polluted2.json');
    writeFileSync(f, '{"constructor":{},"version":"1.0.0","metrics":[],"insights":[],"last_updated":null}');
    const s = loadState(f);
    expect(s.metrics).toEqual([]);
  });
});

describe('ingestMetric', () => {
  it('requires name and type', () => {
    const r = ingestMetric('', 'latency', 100, { stateFile: join(tmpDir, 's.json') });
    expect(r.success).toBe(false);
  });

  it('rejects unknown type', () => {
    const r = ingestMetric('metric', 'unknown', 10, { stateFile: join(tmpDir, 's.json') });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown type/);
  });

  it('creates metric with valid inputs', () => {
    const f = join(tmpDir, 's.json');
    const r = ingestMetric('api_latency', 'latency', 150, { stateFile: f });
    expect(r.success).toBe(true);
    expect(r.metric?.id).toMatch(/^TEL-/);
  });

  it('persists metric', () => {
    const f = join(tmpDir, 's.json');
    ingestMetric('m1', 'latency', 100, { stateFile: f });
    const s = loadState(f);
    expect(s.metrics.length).toBe(1);
  });
});

describe('analyzeMetrics', () => {
  it('returns empty analysis for no metrics', () => {
    const f = join(tmpDir, 's.json');
    const r = analyzeMetrics({ stateFile: f });
    expect(r.total_metrics).toBe(0);
    expect(r.analysis).toEqual({});
  });

  it('calculates avg, min, max', () => {
    const f = join(tmpDir, 's.json');
    ingestMetric('m', 'latency', 100, { stateFile: f });
    ingestMetric('m', 'latency', 200, { stateFile: f });
    const r = analyzeMetrics({ stateFile: f });
    const stats = r.analysis['latency'];
    expect(stats?.avg).toBe(150);
    expect(stats?.min).toBe(100);
    expect(stats?.max).toBe(200);
  });
});

describe('generateFeedbackReport', () => {
  it('returns success for empty state', () => {
    const f = join(tmpDir, 's.json');
    const r = generateFeedbackReport({ stateFile: f });
    expect(r.success).toBe(true);
    expect(r.recommendations).toEqual([]);
  });

  it('generates recommendation for high latency', () => {
    const f = join(tmpDir, 's.json');
    ingestMetric('api', 'latency', 600, { stateFile: f });
    const r = generateFeedbackReport({ stateFile: f });
    expect(r.recommendations.some(rec => rec.includes('latency'))).toBe(true);
  });

  it('generates recommendation for high error rate', () => {
    const f = join(tmpDir, 's.json');
    ingestMetric('api', 'error-rate', 10, { stateFile: f });
    const r = generateFeedbackReport({ stateFile: f });
    expect(r.recommendations.some(rec => rec.includes('error'))).toBe(true);
  });
});

describe('METRIC_TYPES', () => {
  it('includes latency and error-rate', () => {
    expect(METRIC_TYPES).toContain('latency');
    expect(METRIC_TYPES).toContain('error-rate');
  });
});
