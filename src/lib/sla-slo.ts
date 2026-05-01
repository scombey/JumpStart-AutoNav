/**
 * sla-slo.ts — SLA & SLO Specification Support.
 *
 * Public surface:
 *   - `defaultState()` => SlaState
 *   - `loadState(stateFile?)` => SlaState
 *   - `saveState(state, stateFile?)` => void
 *   - `defineSLO(slo, options?)` => DefineSLOResult
 *   - `applyTemplate(serviceName, templateType, options?)` => ApplyTemplateResult
 *   - `checkSLOCoverage(root, options?)` => CoverageResult
 *   - `generateReport(options?)` => SloReport
 *   - `SLO_TYPES`
 *   - `DEFAULT_SLO_TEMPLATES`
 *
 * Invariants:
 *   - `loadState` runs `rejectPollutionKeys` on parsed JSON before use;
 *     on parse failure or pollution, returns `defaultState()`.
 *   - No user-supplied paths reach the filesystem.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'sla-slo.json');

export const SLO_TYPES = [
  'availability',
  'latency',
  'throughput',
  'error-rate',
  'durability',
  'freshness',
] as const;
export type SloType = (typeof SLO_TYPES)[number];

export interface SloTemplate {
  type: string;
  target: number;
  unit: string;
  window: string;
  percentile?: string | undefined;
}

export const DEFAULT_SLO_TEMPLATES: Record<string, SloTemplate[]> = {
  'web-api': [
    { type: 'availability', target: 99.9, unit: 'percent', window: '30d' },
    { type: 'latency', target: 200, unit: 'ms', percentile: 'p99', window: '30d' },
    { type: 'error-rate', target: 0.1, unit: 'percent', window: '30d' },
  ],
  'batch-processing': [
    { type: 'availability', target: 99.5, unit: 'percent', window: '30d' },
    { type: 'throughput', target: 1000, unit: 'records/sec', window: '1h' },
    { type: 'freshness', target: 60, unit: 'minutes', window: '24h' },
  ],
  'data-pipeline': [
    { type: 'availability', target: 99.0, unit: 'percent', window: '30d' },
    { type: 'freshness', target: 15, unit: 'minutes', window: '24h' },
    { type: 'durability', target: 99.999, unit: 'percent', window: '30d' },
  ],
};

export interface SloEntry {
  id: string;
  name: string;
  service: string;
  type: string;
  target: number;
  unit: string;
  window: string;
  description: string;
  created_at: string;
}

export interface SlaEntry {
  id: string;
  name: string;
  service: string;
  [key: string]: unknown;
}

export interface SlaState {
  version: string;
  created_at: string;
  last_updated: string | null;
  slos: SloEntry[];
  slas: SlaEntry[];
  error_budgets: unknown[];
}

function rejectPollutionKeys(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') return;
  const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (forbidden.has(key)) throw new Error(`Prototype-pollution key detected: "${key}"`);
    rejectPollutionKeys((obj as Record<string, unknown>)[key]);
  }
}

export function defaultState(): SlaState {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    slos: [],
    slas: [],
    error_budgets: [],
  };
}

export function loadState(stateFile?: string): SlaState {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(fp)) return defaultState();
  try {
    const parsed: unknown = JSON.parse(readFileSync(fp, 'utf8'));
    rejectPollutionKeys(parsed);
    return parsed as SlaState;
  } catch {
    return defaultState();
  }
}

export function saveState(state: SlaState, stateFile?: string): void {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(fp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(fp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export interface DefineSLOInput {
  name: string;
  service: string;
  target: number;
  type?: string | undefined;
  unit?: string | undefined;
  window?: string | undefined;
  description?: string | undefined;
}

export interface DefineSLOResult {
  success: boolean;
  slo?: SloEntry | undefined;
  error?: string | undefined;
}

export function defineSLO(
  slo: DefineSLOInput,
  options: { stateFile?: string | undefined } = {}
): DefineSLOResult {
  if (!slo?.name || !slo.service || slo.target === undefined) {
    return { success: false, error: 'name, service, and target are required' };
  }

  const type = (slo.type ?? 'availability').toLowerCase();
  if (!SLO_TYPES.includes(type as SloType)) {
    return { success: false, error: `Invalid type. Must be one of: ${SLO_TYPES.join(', ')}` };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const newSLO: SloEntry = {
    id: `SLO-${Date.now().toString(36).toUpperCase()}`,
    name: slo.name,
    service: slo.service,
    type,
    target: slo.target,
    unit: slo.unit ?? 'percent',
    window: slo.window ?? '30d',
    description: slo.description ?? '',
    created_at: new Date().toISOString(),
  };

  state.slos.push(newSLO);
  saveState(state, stateFile);

  return { success: true, slo: newSLO };
}

export interface ApplyTemplateResult {
  success: boolean;
  service?: string | undefined;
  template?: string | undefined;
  slos_created?: number | undefined;
  error?: string | undefined;
}

export function applyTemplate(
  serviceName: string,
  templateType: string,
  options: { stateFile?: string | undefined } = {}
): ApplyTemplateResult {
  const template = DEFAULT_SLO_TEMPLATES[templateType];
  if (!template) {
    return {
      success: false,
      error: `Unknown template: ${templateType}. Available: ${Object.keys(DEFAULT_SLO_TEMPLATES).join(', ')}`,
    };
  }

  const results: DefineSLOResult[] = [];
  for (const t of template) {
    const result = defineSLO(
      {
        name: `${serviceName} ${t.type}`,
        service: serviceName,
        type: t.type,
        target: t.target,
        unit: t.unit,
        window: t.window,
      },
      options
    );
    results.push(result);
  }

  return {
    success: true,
    service: serviceName,
    template: templateType,
    slos_created: results.length,
  };
}

export interface CoverageResult {
  success: true;
  defined_slos: number;
  architecture_mentions_slo: boolean;
  prd_mentions_slo: boolean;
  coverage: string;
  recommendations: string[];
}

export function checkSLOCoverage(
  root: string,
  options: { stateFile?: string | undefined } = {}
): CoverageResult {
  const stateFile = options.stateFile ?? join(root, DEFAULT_STATE_FILE);
  const state = loadState(stateFile);

  const archFile = join(root, 'specs', 'architecture.md');
  const prdFile = join(root, 'specs', 'prd.md');

  let archHasSLO = false;
  let prdHasSLO = false;

  if (existsSync(archFile)) {
    try {
      const content = readFileSync(archFile, 'utf8');
      archHasSLO = /\bSL[OA]\b|service.level|availability|latency.target/i.test(content);
    } catch {
      /* ignore */
    }
  }

  if (existsSync(prdFile)) {
    try {
      const content = readFileSync(prdFile, 'utf8');
      prdHasSLO = /\bSL[OA]\b|service.level|availability|uptime/i.test(content);
    } catch {
      /* ignore */
    }
  }

  return {
    success: true,
    defined_slos: state.slos.length,
    architecture_mentions_slo: archHasSLO,
    prd_mentions_slo: prdHasSLO,
    coverage: state.slos.length > 0 ? 'defined' : 'missing',
    recommendations:
      state.slos.length === 0 ? ['Define SLOs using `jumpstart-mode sla-slo define`'] : [],
  };
}

export interface SloReport {
  success: true;
  slos: SloEntry[];
  slas: SlaEntry[];
  total_slos: number;
  total_slas: number;
  by_service: Record<string, SloEntry[]>;
  by_type: Record<string, number>;
}

export function generateReport(options: { stateFile?: string | undefined } = {}): SloReport {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  return {
    success: true,
    slos: state.slos,
    slas: state.slas,
    total_slos: state.slos.length,
    total_slas: state.slas.length,
    by_service: state.slos.reduce<Record<string, SloEntry[]>>((acc, s) => {
      acc[s.service] = acc[s.service] ?? [];
      acc[s.service]?.push(s);
      return acc;
    }, {}),
    by_type: state.slos.reduce<Record<string, number>>((acc, s) => {
      acc[s.type] = (acc[s.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
