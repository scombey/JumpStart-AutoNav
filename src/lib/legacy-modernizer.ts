/**
 * legacy-modernizer.ts — Legacy Code Modernization Mode port (M11 batch 3).
 *
 * Pure-library port of `bin/lib/legacy-modernizer.js`. Public surface
 * preserved verbatim by name + signature:
 *
 *   - `defaultState()` => LegacyModernizerState
 *   - `loadState(stateFile?)` => LegacyModernizerState
 *   - `saveState(state, stateFile?)` => void
 *   - `assessSystem(system, options?)` => AssessSystemResult
 *   - `createPlan(assessmentId, plan, options?)` => CreatePlanResult
 *   - `generateReport(options?)` => LegacyModernizerReport
 *   - `LEGACY_PLATFORMS`, `MODERNIZATION_PATTERNS`
 *
 * Behavior parity:
 *   - Default state file: `.jumpstart/state/legacy-modernization.json`.
 *   - 8 known platforms (cobol, dotnet-framework, java-monolith, ssis,
 *     angular-legacy, react-legacy, jquery, php-legacy). Unknown platforms
 *     fall back to medium-risk + phased-cutover.
 *   - 5 modernization patterns.
 *   - M3 hardening: shape-validated JSON; rejects __proto__/constructor/
 *     prototype keys; defaultState fallback on parse failure.
 *
 * @see bin/lib/legacy-modernizer.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'legacy-modernization.json');

export interface LegacyPlatformInfo {
  risk: 'low' | 'medium' | 'high';
  strategy: string;
  estimated_effort: 'low' | 'medium' | 'high' | 'very-high';
}

export const LEGACY_PLATFORMS: Record<string, LegacyPlatformInfo> = {
  cobol: { risk: 'high', strategy: 'strangler-fig', estimated_effort: 'very-high' },
  'dotnet-framework': { risk: 'medium', strategy: 'phased-cutover', estimated_effort: 'high' },
  'java-monolith': { risk: 'medium', strategy: 'strangler-fig', estimated_effort: 'high' },
  ssis: { risk: 'medium', strategy: 'phased-cutover', estimated_effort: 'medium' },
  'angular-legacy': { risk: 'low', strategy: 'phased-cutover', estimated_effort: 'medium' },
  'react-legacy': { risk: 'low', strategy: 'in-place', estimated_effort: 'low' },
  jquery: { risk: 'low', strategy: 'phased-cutover', estimated_effort: 'medium' },
  'php-legacy': { risk: 'medium', strategy: 'strangler-fig', estimated_effort: 'high' },
};

export const MODERNIZATION_PATTERNS = [
  'strangler-fig',
  'phased-cutover',
  'big-bang',
  'in-place',
  'rewrite',
] as const;

export type ModernizationPattern = (typeof MODERNIZATION_PATTERNS)[number];

export interface LegacyAssessment {
  id: string;
  name: string;
  platform: string;
  age_years: number | null;
  loc: number | null;
  risk_level: string;
  recommended_strategy: string;
  estimated_effort: string;
  modernization_targets: string[];
  assessed_at: string;
}

export interface ModernizationPhase {
  order: number;
  name: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface ModernizationPlan {
  id: string;
  assessment_id: string;
  source_platform: string;
  target_platform: string;
  strategy: string;
  phases: ModernizationPhase[];
  timeline: string | null;
  created_at: string;
}

export interface LegacyModernizerState {
  version: string;
  created_at: string;
  last_updated: string | null;
  assessments: LegacyAssessment[];
  modernization_plans: ModernizationPlan[];
}

export interface AssessSystemInput {
  name: string;
  platform: string;
  age_years?: number | null | undefined;
  loc?: number | null | undefined;
  modernization_targets?: string[] | undefined;
}

export interface AssessSystemOptions {
  stateFile?: string | undefined;
}

export type AssessSystemResult =
  | { success: true; assessment: LegacyAssessment }
  | { success: false; error: string };

export interface CreatePlanInput {
  target_platform?: string | undefined;
  phases?: Array<string | { name: string }> | undefined;
  timeline?: string | null | undefined;
}

export interface CreatePlanOptions {
  stateFile?: string | undefined;
}

export type CreatePlanResult =
  | { success: true; plan: ModernizationPlan }
  | { success: false; error: string };

export interface GenerateReportOptions {
  stateFile?: string | undefined;
}

export interface LegacyModernizerReport {
  success: true;
  total_assessments: number;
  total_plans: number;
  by_platform: Record<string, number>;
  by_risk: Record<string, number>;
  assessments: LegacyAssessment[];
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    for (const item of value) if (hasForbiddenKey(item)) return true;
    return false;
  }
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKey(value[key])) return true;
  }
  return false;
}

export function defaultState(): LegacyModernizerState {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    assessments: [],
    modernization_plans: [],
  };
}

export function loadState(stateFile?: string | undefined): LegacyModernizerState {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(filePath)) return defaultState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return defaultState();
  }
  if (!isPlainObject(parsed) || hasForbiddenKey(parsed)) return defaultState();
  return parsed as unknown as LegacyModernizerState;
}

export function saveState(state: LegacyModernizerState, stateFile?: string | undefined): void {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Assess a legacy system for modernization.
 *
 * Mirrors legacy `assessSystem` shape verbatim. Unknown platforms fall
 * back to medium-risk / phased-cutover / medium-effort, matching the
 * legacy `||` defaulting.
 */
export function assessSystem(
  system: AssessSystemInput | null | undefined,
  options: AssessSystemOptions = {}
): AssessSystemResult {
  if (!system?.name || !system.platform) {
    return { success: false, error: 'name and platform are required' };
  }

  const platform = system.platform.toLowerCase();
  const platformInfo: LegacyPlatformInfo = LEGACY_PLATFORMS[platform] ?? {
    risk: 'medium',
    strategy: 'phased-cutover',
    estimated_effort: 'medium',
  };

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const assessment: LegacyAssessment = {
    id: `LEG-${(state.assessments.length + 1).toString().padStart(3, '0')}`,
    name: system.name,
    platform,
    age_years: system.age_years ?? null,
    loc: system.loc ?? null,
    risk_level: platformInfo.risk,
    recommended_strategy: platformInfo.strategy,
    estimated_effort: platformInfo.estimated_effort,
    modernization_targets: system.modernization_targets ?? [],
    assessed_at: new Date().toISOString(),
  };

  state.assessments.push(assessment);
  saveState(state, stateFile);

  return { success: true, assessment };
}

/**
 * Create a modernization plan for an existing assessment. Returns
 * `success: false` if the assessment id can't be found in the state.
 */
export function createPlan(
  assessmentId: string,
  plan: CreatePlanInput,
  options: CreatePlanOptions = {}
): CreatePlanResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const assessment = state.assessments.find((a) => a.id === assessmentId);
  if (!assessment) {
    return { success: false, error: `Assessment not found: ${assessmentId}` };
  }

  const phasesInput = plan.phases ?? ['assess', 'plan', 'implement', 'validate', 'cutover'];
  const phases: ModernizationPhase[] = phasesInput.map((p, i) => ({
    order: i + 1,
    name: typeof p === 'string' ? p : p.name,
    status: 'pending',
  }));

  const modPlan: ModernizationPlan = {
    id: `MOD-${(state.modernization_plans.length + 1).toString().padStart(3, '0')}`,
    assessment_id: assessmentId,
    source_platform: assessment.platform,
    target_platform: plan.target_platform ?? 'modern-stack',
    strategy: assessment.recommended_strategy,
    phases,
    timeline: plan.timeline ?? null,
    created_at: new Date().toISOString(),
  };

  state.modernization_plans.push(modPlan);
  saveState(state, stateFile);

  return { success: true, plan: modPlan };
}

/**
 * Generate a modernization report aggregating assessments by platform
 * + risk level. Mirrors legacy reduce logic verbatim.
 */
export function generateReport(options: GenerateReportOptions = {}): LegacyModernizerReport {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const byPlatform: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  for (const a of state.assessments) {
    byPlatform[a.platform] = (byPlatform[a.platform] ?? 0) + 1;
    byRisk[a.risk_level] = (byRisk[a.risk_level] ?? 0) + 1;
  }

  return {
    success: true,
    total_assessments: state.assessments.length,
    total_plans: state.modernization_plans.length,
    by_platform: byPlatform,
    by_risk: byRisk,
    assessments: state.assessments,
  };
}
