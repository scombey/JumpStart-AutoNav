/**
 * sre-integration.ts — SRE Integration port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/sre-integration.js` (CJS). Public surface:
 *   - `generateMonitor(name, type, options?)` => MonitorResult
 *   - `generateAlert(name, severity, options?)` => AlertResult
 *   - `generateRunbook(name, steps, options?)` => RunbookResult
 *   - `configureErrorBudget(service, slo, options?)` => ErrorBudgetResult
 *   - `generateReport(options?)` => SreReport
 *   - `loadState(stateFile?)` => SreState
 *   - `saveState(state, stateFile?)` => void
 *   - `defaultState()` => SreState
 *   - `MONITOR_TYPES`
 *   - `ALERT_SEVERITIES`
 *
 * M3 hardening:
 *   - `loadState` runs `rejectPollutionKeys` on parsed JSON.
 *
 * @see bin/lib/sre-integration.js (legacy reference)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'sre-integration.json');

export const MONITOR_TYPES = ['uptime', 'latency', 'error-rate', 'saturation', 'custom'] as const;
export const ALERT_SEVERITIES = ['critical', 'warning', 'info'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface Monitor {
  id: string;
  name: string;
  type: string;
  threshold: unknown;
  interval: string;
  service: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  name: string;
  severity: AlertSeverity;
  condition: unknown;
  notification_channels: unknown[];
  runbook_id: string | null;
  created_at: string;
}

export interface RunbookStep {
  order: number;
  action: string;
}

export interface Runbook {
  id: string;
  name: string;
  steps: RunbookStep[];
  service: string | null;
  created_at: string;
}

export interface ErrorBudget {
  id: string;
  service: string;
  slo_target: number;
  budget_remaining: number;
  window: string;
  created_at: string;
}

export interface SreState {
  version: string;
  monitors: Monitor[];
  alerts: Alert[];
  runbooks: Runbook[];
  error_budgets: ErrorBudget[];
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

export function defaultState(): SreState {
  return {
    version: '1.0.0',
    monitors: [],
    alerts: [],
    runbooks: [],
    error_budgets: [],
    last_updated: null,
  };
}

export function loadState(stateFile?: string): SreState {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(fp)) return defaultState();
  try {
    const parsed: unknown = JSON.parse(readFileSync(fp, 'utf8'));
    rejectPollutionKeys(parsed);
    return parsed as SreState;
  } catch {
    return defaultState();
  }
}

export function saveState(state: SreState, stateFile?: string): void {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(fp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(fp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export interface MonitorResult {
  success: boolean;
  monitor?: Monitor | undefined;
  error?: string | undefined;
}

export function generateMonitor(
  name: string,
  type: string,
  options: {
    stateFile?: string | undefined;
    threshold?: unknown;
    interval?: string | undefined;
    service?: string | undefined;
  } = {}
): MonitorResult {
  if (!name || !type) return { success: false, error: 'name and type are required' };
  if (!MONITOR_TYPES.includes(type as (typeof MONITOR_TYPES)[number])) {
    return { success: false, error: `Unknown type: ${type}. Valid: ${MONITOR_TYPES.join(', ')}` };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const monitor: Monitor = {
    id: `MON-${Date.now()}`,
    name,
    type,
    threshold: options.threshold ?? null,
    interval: options.interval ?? '60s',
    service: options.service ?? null,
    created_at: new Date().toISOString(),
  };

  state.monitors.push(monitor);
  saveState(state, stateFile);
  return { success: true, monitor };
}

export interface AlertResult {
  success: boolean;
  alert?: Alert | undefined;
  error?: string | undefined;
}

export function generateAlert(
  name: string,
  severity: string,
  options: {
    stateFile?: string | undefined;
    condition?: unknown;
    channels?: unknown[];
    runbook_id?: string | undefined;
  } = {}
): AlertResult {
  if (!name || !severity) return { success: false, error: 'name and severity are required' };
  if (!ALERT_SEVERITIES.includes(severity as AlertSeverity)) {
    return {
      success: false,
      error: `Unknown severity: ${severity}. Valid: ${ALERT_SEVERITIES.join(', ')}`,
    };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const alert: Alert = {
    id: `ALERT-${Date.now()}`,
    name,
    severity: severity as AlertSeverity,
    condition: options.condition ?? null,
    notification_channels: options.channels ?? [],
    runbook_id: options.runbook_id ?? null,
    created_at: new Date().toISOString(),
  };

  state.alerts.push(alert);
  saveState(state, stateFile);
  return { success: true, alert };
}

export interface RunbookResult {
  success: boolean;
  runbook?: Runbook | undefined;
  error?: string | undefined;
}

export function generateRunbook(
  name: string,
  steps: unknown,
  options: { stateFile?: string | undefined; service?: string | undefined } = {}
): RunbookResult {
  if (!name || !steps) return { success: false, error: 'name and steps are required' };

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const runbook: Runbook = {
    id: `RB-${Date.now()}`,
    name,
    steps: Array.isArray(steps) ? steps.map((s, i) => ({ order: i + 1, action: String(s) })) : [],
    service: options.service ?? null,
    created_at: new Date().toISOString(),
  };

  state.runbooks.push(runbook);
  saveState(state, stateFile);
  return { success: true, runbook };
}

export interface ErrorBudgetResult {
  success: boolean;
  error_budget?: ErrorBudget | undefined;
  error?: string | undefined;
}

export function configureErrorBudget(
  service: string,
  slo: number,
  options: {
    stateFile?: string | undefined;
    remaining?: number | undefined;
    window?: string | undefined;
  } = {}
): ErrorBudgetResult {
  if (!service || slo === undefined)
    return { success: false, error: 'service and slo are required' };

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const budget: ErrorBudget = {
    id: `EB-${Date.now()}`,
    service,
    slo_target: slo,
    budget_remaining: options.remaining ?? 100,
    window: options.window ?? '30d',
    created_at: new Date().toISOString(),
  };

  state.error_budgets.push(budget);
  saveState(state, stateFile);
  return { success: true, error_budget: budget };
}

export interface SreReport {
  success: true;
  total_monitors: number;
  total_alerts: number;
  total_runbooks: number;
  total_error_budgets: number;
  monitors: Monitor[];
  alerts: Alert[];
  runbooks: Runbook[];
  error_budgets: ErrorBudget[];
}

export function generateReport(options: { stateFile?: string | undefined } = {}): SreReport {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  return {
    success: true,
    total_monitors: state.monitors.length,
    total_alerts: state.alerts.length,
    total_runbooks: state.runbooks.length,
    total_error_budgets: state.error_budgets.length,
    monitors: state.monitors,
    alerts: state.alerts,
    runbooks: state.runbooks,
    error_budgets: state.error_budgets,
  };
}
