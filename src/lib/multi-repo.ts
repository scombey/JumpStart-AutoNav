/**
 * multi-repo.ts — Multi-Repo Program Orchestration port (M11 batch 4).
 *
 * Pure-library port of `bin/lib/multi-repo.js`. Public surface
 * preserved verbatim by name + signature:
 *
 *   - `defaultMultiRepoState()` => MultiRepoState
 *   - `loadMultiRepoState(stateFile?)` => MultiRepoState
 *   - `saveMultiRepoState(state, stateFile?)` => void
 *   - `initProgram(programName, options?)` => InitProgramResult
 *   - `linkRepo(repoUrl, role, options?)` => LinkRepoResult
 *   - `addSharedSpec(specPath, repoIds, options?)` => AddSharedSpecResult
 *   - `addDependency(fromRepoId, toRepoId, dependencyType, options?)`
 *       => AddDependencyResult
 *   - `getProgramStatus(options?)` => GetProgramStatusResult
 *   - `setReleasePlan(milestones, options?)` => SetReleasePlanResult
 *
 * Behavior parity:
 *   - Default state file: `.jumpstart/state/multi-repo.json`.
 *   - Valid roles: frontend, backend, infra, data, docs, other (others
 *     normalized to lowercase before comparison).
 *   - linkRepo rejects duplicates by URL.
 *   - initProgram resets the entire state — overwrites existing file.
 *   - M3 hardening: shape-validated JSON; rejects __proto__/constructor/
 *     prototype keys recursively; defaultState fallback on parse failure.
 *
 * Path-safety note: this lib does NOT walk the filesystem — it stores
 * `repoUrl` strings (which may be HTTPS git URLs OR local paths). The
 * caller is responsible for asserting any local path is safe before
 * passing it in. The state file path itself goes through the standard
 * JSON-state pattern.
 *
 * @see bin/lib/multi-repo.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'multi-repo.json');

const VALID_ROLES = ['frontend', 'backend', 'infra', 'data', 'docs', 'other'] as const;
export type RepoRole = (typeof VALID_ROLES)[number];

export interface RepoEntry {
  id: string;
  url: string;
  role: string;
  linked_at: string;
  specs: string[];
  status: string;
}

export interface SharedSpec {
  id: string;
  path: string;
  repos: string[];
  added_at: string;
}

export interface Dependency {
  id: string;
  from: string;
  to: string;
  type: string;
  created_at: string;
}

export interface Milestone {
  id: string;
  name: string;
  target_date: string | null;
  repos: string[];
  status: string;
}

export interface MilestoneInput {
  name?: string | undefined;
  target_date?: string | null | undefined;
  repos?: string[] | undefined;
  status?: string | undefined;
}

export interface ReleasePlan {
  milestones: Milestone[];
  current_milestone: string | null;
}

export interface MultiRepoState {
  version: string;
  program_name: string | null;
  created_at: string;
  last_updated: string | null;
  repos: RepoEntry[];
  shared_specs: SharedSpec[];
  dependencies: Dependency[];
  release_plan: ReleasePlan;
}

export interface BaseOptions {
  stateFile?: string | undefined;
}

export type InitProgramResult =
  | { success: true; program_name: string; state_file: string; message: string }
  | { success: false; error: string };

export type LinkRepoResult =
  | { success: true; repo: RepoEntry; total_repos: number }
  | { success: false; error: string };

export type AddSharedSpecResult =
  | { success: true; spec: SharedSpec; total_shared_specs: number }
  | { success: false; error: string };

export type AddDependencyResult =
  | { success: true; dependency: Dependency }
  | { success: false; error: string };

export interface GetProgramStatusResult {
  program_name: string | null;
  initialized: boolean;
  repo_count: number;
  shared_spec_count: number;
  dependency_count: number;
  role_breakdown: Record<string, number>;
  repos: RepoEntry[];
  release_plan: ReleasePlan;
  last_updated: string | null;
}

export type SetReleasePlanResult =
  | { success: true; milestone_count: number; release_plan: ReleasePlan }
  | { success: false; error: string };

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

export function defaultMultiRepoState(): MultiRepoState {
  return {
    version: '1.0.0',
    program_name: null,
    created_at: new Date().toISOString(),
    last_updated: null,
    repos: [],
    shared_specs: [],
    dependencies: [],
    release_plan: {
      milestones: [],
      current_milestone: null,
    },
  };
}

export function loadMultiRepoState(stateFile?: string | undefined): MultiRepoState {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(filePath)) return defaultMultiRepoState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return defaultMultiRepoState();
  }
  if (!isPlainObject(parsed) || hasForbiddenKey(parsed)) return defaultMultiRepoState();
  return parsed as unknown as MultiRepoState;
}

export function saveMultiRepoState(state: MultiRepoState, stateFile?: string | undefined): void {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Initialize a multi-repo program. Resets state — caller-supplied
 * options replace any prior state file.
 */
export function initProgram(programName: string, options: BaseOptions = {}): InitProgramResult {
  if (typeof programName !== 'string' || !programName.trim()) {
    return { success: false, error: 'Program name is required' };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = defaultMultiRepoState();
  state.program_name = programName.trim();

  saveMultiRepoState(state, stateFile);

  return {
    success: true,
    program_name: state.program_name,
    state_file: stateFile,
    message: `Program "${state.program_name}" initialized`,
  };
}

export function linkRepo(repoUrl: string, role: string, options: BaseOptions = {}): LinkRepoResult {
  if (!repoUrl || typeof repoUrl !== 'string') {
    return { success: false, error: 'repoUrl is required' };
  }

  const normalizedRole = (role || 'other').toLowerCase();
  if (!(VALID_ROLES as readonly string[]).includes(normalizedRole)) {
    return { success: false, error: `role must be one of: ${VALID_ROLES.join(', ')}` };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadMultiRepoState(stateFile);

  const existing = state.repos.find((r) => r.url === repoUrl);
  if (existing) {
    return { success: false, error: `Repo already linked: ${repoUrl}` };
  }

  const entry: RepoEntry = {
    id: `repo-${Date.now()}`,
    url: repoUrl,
    role: normalizedRole,
    linked_at: new Date().toISOString(),
    specs: [],
    status: 'active',
  };

  state.repos.push(entry);
  saveMultiRepoState(state, stateFile);

  return { success: true, repo: entry, total_repos: state.repos.length };
}

export function addSharedSpec(
  specPath: string,
  repoIds: string[] | undefined | null,
  options: BaseOptions = {}
): AddSharedSpecResult {
  if (!specPath || typeof specPath !== 'string') {
    return { success: false, error: 'specPath is required' };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadMultiRepoState(stateFile);

  const entry: SharedSpec = {
    id: `spec-${Date.now()}`,
    path: specPath,
    repos: Array.isArray(repoIds) ? repoIds.filter((s): s is string => typeof s === 'string') : [],
    added_at: new Date().toISOString(),
  };

  state.shared_specs.push(entry);
  saveMultiRepoState(state, stateFile);

  return { success: true, spec: entry, total_shared_specs: state.shared_specs.length };
}

export function addDependency(
  fromRepoId: string,
  toRepoId: string,
  dependencyType: string | undefined | null,
  options: BaseOptions = {}
): AddDependencyResult {
  if (!fromRepoId || !toRepoId) {
    return { success: false, error: 'fromRepoId and toRepoId are required' };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadMultiRepoState(stateFile);

  const dep: Dependency = {
    id: `dep-${Date.now()}`,
    from: fromRepoId,
    to: toRepoId,
    type: dependencyType ?? 'other',
    created_at: new Date().toISOString(),
  };

  state.dependencies.push(dep);
  saveMultiRepoState(state, stateFile);

  return { success: true, dependency: dep };
}

export function getProgramStatus(options: BaseOptions = {}): GetProgramStatusResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadMultiRepoState(stateFile);

  const roleBreakdown: Record<string, number> = {};
  for (const repo of state.repos) {
    roleBreakdown[repo.role] = (roleBreakdown[repo.role] ?? 0) + 1;
  }

  return {
    program_name: state.program_name,
    initialized: !!state.program_name,
    repo_count: state.repos.length,
    shared_spec_count: state.shared_specs.length,
    dependency_count: state.dependencies.length,
    role_breakdown: roleBreakdown,
    repos: state.repos,
    release_plan: state.release_plan,
    last_updated: state.last_updated,
  };
}

export function setReleasePlan(
  milestones: MilestoneInput[],
  options: BaseOptions = {}
): SetReleasePlanResult {
  if (!Array.isArray(milestones)) {
    return { success: false, error: 'milestones must be an array' };
  }

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadMultiRepoState(stateFile);

  state.release_plan.milestones = milestones.map(
    (m, i): Milestone => ({
      id: `milestone-${i + 1}`,
      name: m.name ?? `Milestone ${i + 1}`,
      target_date: m.target_date ?? null,
      repos: Array.isArray(m.repos)
        ? m.repos.filter((s): s is string => typeof s === 'string')
        : [],
      status: m.status ?? 'planned',
    })
  );

  if (state.release_plan.milestones.length > 0) {
    state.release_plan.current_milestone = state.release_plan.milestones[0]?.id ?? null;
  }

  saveMultiRepoState(state, stateFile);

  return {
    success: true,
    milestone_count: state.release_plan.milestones.length,
    release_plan: state.release_plan,
  };
}
