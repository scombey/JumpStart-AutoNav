/**
 * platform-engineering.ts — Platform engineering integration port.
 *
 * Public surface
 * preserved verbatim by name + signature:
 *
 *   - `defaultState()` => PlatformEngineeringState
 *   - `loadState(stateFile?)` => PlatformEngineeringState
 *   - `saveState(state, stateFile?)` => void
 *   - `registerTemplate(name, type, options?)` => RegisterTemplateResult
 *   - `listTemplates(options?)` => ListTemplatesResult
 *   - `instantiateTemplate(templateId, projectName, options?)` => InstantiateTemplateResult
 *   - `generateReport(options?)` => PlatformReport
 *   - `TEMPLATE_TYPES`, `GOLDEN_PATH_STAGES`
 *
 * Invariants:
 *   - Default state file: `.jumpstart/state/platform-engineering.json`.
 *   - 5 template types: service, library, worker, api-gateway, frontend.
 *   - 5 golden path stages: scaffold, ci-cd, observability, security, deployment.
 *   - M3 hardening: shape-validated JSON; rejects __proto__/constructor/prototype.
 *
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'platform-engineering.json');

export const TEMPLATE_TYPES = ['service', 'library', 'worker', 'api-gateway', 'frontend'] as const;
export const GOLDEN_PATH_STAGES = [
  'scaffold',
  'ci-cd',
  'observability',
  'security',
  'deployment',
] as const;

export interface PlatformTemplate {
  id: string;
  name: string;
  type: string;
  tech_stack: string[];
  golden_path_stages: string[];
  version: string;
  created_at: string;
}

export interface PlatformInstance {
  id: string;
  template_id: string;
  template_name: string;
  project_name: string;
  status: string;
  created_at: string;
}

export interface PlatformEngineeringState {
  version: string;
  templates: PlatformTemplate[];
  golden_paths: unknown[];
  instances: PlatformInstance[];
  last_updated: string | null;
}

export interface RegisterTemplateOptions {
  stateFile?: string;
  tech_stack?: string[];
  stages?: string[];
  version?: string;
}

export interface ListTemplatesOptions {
  stateFile?: string;
  type?: string;
}

export interface StateOptions {
  stateFile?: string;
}

export interface RegisterTemplateResultSuccess {
  success: true;
  template: PlatformTemplate;
}
export interface RegisterTemplateResultFailure {
  success: false;
  error: string;
}
export type RegisterTemplateResult = RegisterTemplateResultSuccess | RegisterTemplateResultFailure;

export interface ListTemplatesResult {
  success: true;
  total: number;
  templates: PlatformTemplate[];
}

export interface InstantiateTemplateResultSuccess {
  success: true;
  instance: PlatformInstance;
}
export interface InstantiateTemplateResultFailure {
  success: false;
  error: string;
}
export type InstantiateTemplateResult =
  | InstantiateTemplateResultSuccess
  | InstantiateTemplateResultFailure;

export interface PlatformReport {
  success: true;
  total_templates: number;
  total_instances: number;
  by_type: Record<string, number>;
  templates: PlatformTemplate[];
  instances: PlatformInstance[];
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function safeParseState(raw: string): PlatformEngineeringState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  for (const key of Object.keys(parsed)) {
    if (FORBIDDEN_KEYS.has(key)) return null;
  }
  const data = parsed as Partial<PlatformEngineeringState>;
  return {
    version: typeof data.version === 'string' ? data.version : '1.0.0',
    templates: Array.isArray(data.templates) ? (data.templates as PlatformTemplate[]) : [],
    golden_paths: Array.isArray(data.golden_paths) ? data.golden_paths : [],
    instances: Array.isArray(data.instances) ? (data.instances as PlatformInstance[]) : [],
    last_updated: typeof data.last_updated === 'string' ? data.last_updated : null,
  };
}

export function defaultState(): PlatformEngineeringState {
  return {
    version: '1.0.0',
    templates: [],
    golden_paths: [],
    instances: [],
    last_updated: null,
  };
}

export function loadState(stateFile?: string): PlatformEngineeringState {
  const fp = stateFile || DEFAULT_STATE_FILE;
  if (!existsSync(fp)) return defaultState();
  const parsed = safeParseState(readFileSync(fp, 'utf8'));
  return parsed ?? defaultState();
}

export function saveState(state: PlatformEngineeringState, stateFile?: string): void {
  const fp = stateFile || DEFAULT_STATE_FILE;
  const dir = dirname(fp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(fp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function registerTemplate(
  name: string,
  type: string,
  options: RegisterTemplateOptions = {}
): RegisterTemplateResult {
  if (!name || !type) return { success: false, error: 'name and type are required' };
  if (!(TEMPLATE_TYPES as readonly string[]).includes(type)) {
    return {
      success: false,
      error: `Unknown type: ${type}. Valid: ${TEMPLATE_TYPES.join(', ')}`,
    };
  }

  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const template: PlatformTemplate = {
    id: `PLAT-${Date.now()}`,
    name,
    type,
    tech_stack: options.tech_stack || [],
    golden_path_stages: options.stages || [...GOLDEN_PATH_STAGES],
    version: options.version || '1.0.0',
    created_at: new Date().toISOString(),
  };

  state.templates.push(template);
  saveState(state, stateFile);

  return { success: true, template };
}

export function listTemplates(options: ListTemplatesOptions = {}): ListTemplatesResult {
  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  let templates = state.templates;
  if (options.type) {
    const t = options.type;
    templates = templates.filter((tpl) => tpl.type === t);
  }

  return { success: true, total: templates.length, templates };
}

export function instantiateTemplate(
  templateId: string,
  projectName: string,
  options: StateOptions = {}
): InstantiateTemplateResult {
  if (!templateId || !projectName) {
    return { success: false, error: 'templateId and projectName are required' };
  }

  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const template = state.templates.find((t) => t.id === templateId);
  if (!template) return { success: false, error: `Template ${templateId} not found` };

  const instance: PlatformInstance = {
    id: `INST-${Date.now()}`,
    template_id: templateId,
    template_name: template.name,
    project_name: projectName,
    status: 'created',
    created_at: new Date().toISOString(),
  };

  state.instances.push(instance);
  saveState(state, stateFile);

  return { success: true, instance };
}

export function generateReport(options: StateOptions = {}): PlatformReport {
  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const byType: Record<string, number> = {};
  for (const t of state.templates) {
    byType[t.type] = (byType[t.type] || 0) + 1;
  }

  return {
    success: true,
    total_templates: state.templates.length,
    total_instances: state.instances.length,
    by_type: byType,
    templates: state.templates,
    instances: state.instances,
  };
}
