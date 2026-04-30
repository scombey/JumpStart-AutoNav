/**
 * telemetry-feedback.ts — Production Telemetry Feedback Loop port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/telemetry-feedback.js` (CJS). Public surface:
 *   - `ingestMetric(name, type, value, options?)` => IngestResult
 *   - `analyzeMetrics(options?)` => AnalysisResult
 *   - `generateFeedbackReport(options?)` => FeedbackReport
 *   - `loadState(stateFile?)` => TelemetryState
 *   - `saveState(state, stateFile?)` => void
 *   - `defaultState()` => TelemetryState
 *   - `METRIC_TYPES`
 *
 * M3 hardening:
 *   - `loadState` runs `rejectPollutionKeys` on parsed JSON.
 *
 * @see bin/lib/telemetry-feedback.js (legacy reference)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'telemetry-feedback.json');

export const METRIC_TYPES = ['latency', 'error-rate', 'throughput', 'availability', 'saturation', 'cost'] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export interface Metric {
  id: string;
  name: string;
  type: string;
  value: unknown;
  unit: string | null;
  service: string | null;
  timestamp: string;
}

export interface TelemetryState {
  version: string;
  metrics: Metric[];
  insights: unknown[];
  last_updated: string | null;
}

function rejectPollutionKeys(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') return;
  const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (forbidden.has(key)) throw new Error(`Prototype-pollution key detected: "${key}"`);
    rejectPollutionKeys((obj as Record<string, unknown>)[key]);
  }
}

export function defaultState(): TelemetryState {
  return { version: '1.0.0', metrics: [], insights: [], last_updated: null };
}

export function loadState(stateFile?: string): TelemetryState {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(fp)) return defaultState();
  try {
    const parsed: unknown = JSON.parse(readFileSync(fp, 'utf8'));
    rejectPollutionKeys(parsed);
    return parsed as TelemetryState;
  } catch {
    return defaultState();
  }
}

export function saveState(state: TelemetryState, stateFile?: string): void {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(fp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(fp, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export interface IngestResult {
  success: boolean;
  metric?: Metric | undefined;
  error?: string | undefined;
}

export function ingestMetric(
  name: string,
  type: string,
  value: unknown,
  options: { stateFile?: string | undefined; unit?: string | undefined; service?: string | undefined } = {},
): IngestResult {
  if (!name || !type) return { success: false, error: 'name and type are required' };
  if (!METRIC_TYPES.includes(type as MetricType)) {
    return { success: false, error: `Unknown type: ${type}. Valid: ${METRIC_TYPES.join(', ')}` };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const metric: Metric = {
    id: `TEL-${Date.now()}`,
    name,
    type,
    value,
    unit: options.unit ?? null,
    service: options.service ?? null,
    timestamp: new Date().toISOString(),
  };

  state.metrics.push(metric);
  saveState(state, stateFile);
  return { success: true, metric };
}

export interface MetricStats {
  count: number;
  avg: number;
  min: number;
  max: number;
}

export interface AnalysisResult {
  success: true;
  total_metrics: number;
  analysis: Record<string, MetricStats>;
}

export function analyzeMetrics(options: { stateFile?: string | undefined } = {}): AnalysisResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const byType: Record<string, unknown[]> = {};
  for (const m of state.metrics) {
    byType[m.type] = byType[m.type] ?? [];
    byType[m.type]!.push(m.value);
  }

  const analysis: Record<string, MetricStats> = {};
  for (const [type, values] of Object.entries(byType)) {
    const nums = values.filter((v): v is number => typeof v === 'number');
    if (nums.length > 0) {
      const sum = nums.reduce((a, b) => a + b, 0);
      analysis[type] = {
        count: nums.length,
        avg: Math.round((sum / nums.length) * 100) / 100,
        min: Math.min(...nums),
        max: Math.max(...nums),
      };
    }
  }

  return { success: true, total_metrics: state.metrics.length, analysis };
}

export interface FeedbackReport {
  success: true;
  total_metrics: number;
  total_insights: number;
  analysis: Record<string, MetricStats>;
  recommendations: string[];
}

export function generateFeedbackReport(options: { stateFile?: string | undefined } = {}): FeedbackReport {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);
  const { analysis } = analyzeMetrics(options);

  const recommendations: string[] = [];
  const latencyStats = analysis['latency'];
  const errorStats = analysis['error-rate'];
  if (latencyStats && latencyStats.avg > 500) {
    recommendations.push('High average latency detected — consider caching or query optimization');
  }
  if (errorStats && errorStats.avg > 5) {
    recommendations.push('Elevated error rate — review error handling and resilience patterns');
  }

  return {
    success: true,
    total_metrics: state.metrics.length,
    total_insights: state.insights.length,
    analysis,
    recommendations,
  };
}
