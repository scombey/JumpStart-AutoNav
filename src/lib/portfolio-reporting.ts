/**
 * portfolio-reporting.ts — Portfolio Reporting Layer port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/portfolio-reporting.js` (CJS) to a typed ES
 * module. Public surface preserved verbatim by name + signature:
 *
 *   - `defaultPortfolio()` => Portfolio
 *   - `loadPortfolio(portfolioFile?)` => Portfolio
 *   - `savePortfolio(portfolio, portfolioFile?)` => void
 *   - `analyzeProject(projectRoot)` => ProjectAnalysis
 *   - `registerInitiative(initiative, options?)` => RegisterResult
 *   - `refreshInitiative(initiativeId, options?)` => RefreshResult
 *   - `getPortfolioStatus(options?)` => PortfolioStatusResult
 *   - `removeInitiative(initiativeId, options?)` => RemoveResult
 *   - `takeSnapshot(options?)` => SnapshotResult
 *   - `PORTFOLIO_STATUSES` (frozen list)
 *   - `PHASES` (frozen list)
 *
 * M3 hardening:
 *   - `loadPortfolio` runs `rejectPollutionKeys` on parsed JSON before use.
 *   - On parse failure or pollution detection, returns `defaultPortfolio()`.
 *
 * Path-safety per ADR-009:
 *   - `analyzeProject(projectRoot)` is called internally via stored
 *     `initiative.path` values (not directly from user CLI input). No
 *     `assertInsideRoot` needed; the path is loaded from stored state.
 *
 * @see bin/lib/portfolio-reporting.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_PORTFOLIO_FILE = join('.jumpstart', 'state', 'portfolio.json');

export const PORTFOLIO_STATUSES = [
  'on-track',
  'at-risk',
  'blocked',
  'completed',
  'paused',
  'cancelled',
] as const;

export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];

export const PHASES = [
  { id: 'scout', name: 'Scout', order: -1 },
  { id: 'phase-0', name: 'Challenge', order: 0 },
  { id: 'phase-1', name: 'Analyze', order: 1 },
  { id: 'phase-2', name: 'Plan', order: 2 },
  { id: 'phase-3', name: 'Architect', order: 3 },
  { id: 'phase-4', name: 'Build', order: 4 },
] as const;

export interface PortfolioInitiative {
  id: string;
  name: string;
  path: string | null;
  owner: string | null;
  budget: number | null;
  target_date: string | null;
  status: PortfolioStatus;
  registered_at: string;
  last_checked: string | null;
  current_phase: string | null;
  phase_progress: number;
  readiness: string;
  blockers: string[];
  risks: string[];
  spend: number;
  notes: unknown[];
  artifacts_completed?: number | undefined;
}

export interface PortfolioSnapshot {
  taken_at: string;
  total_initiatives: number;
  status_summary: Record<string, number>;
  avg_progress: number;
}

export interface Portfolio {
  version: string;
  created_at: string;
  last_updated: string | null;
  initiatives: PortfolioInitiative[];
  snapshots: PortfolioSnapshot[];
}

/** M3: recursively reject prototype-pollution keys. */
function rejectPollutionKeys(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') return;
  const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (forbidden.has(key)) throw new Error(`Prototype-pollution key detected: "${key}"`);
    rejectPollutionKeys((obj as Record<string, unknown>)[key]);
  }
}

export function defaultPortfolio(): Portfolio {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    initiatives: [],
    snapshots: [],
  };
}

export function loadPortfolio(portfolioFile?: string): Portfolio {
  const filePath = portfolioFile ?? DEFAULT_PORTFOLIO_FILE;
  if (!existsSync(filePath)) return defaultPortfolio();
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    rejectPollutionKeys(parsed);
    return parsed as Portfolio;
  } catch {
    return defaultPortfolio();
  }
}

export function savePortfolio(portfolio: Portfolio, portfolioFile?: string): void {
  const filePath = portfolioFile ?? DEFAULT_PORTFOLIO_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  portfolio.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(portfolio, null, 2)}\n`, 'utf8');
}

export interface ProjectAnalysis {
  current_phase: string | null;
  phase_progress: number;
  artifacts_completed: number;
  total_artifacts: number;
  blockers: string[];
  risks: string[];
  readiness: string;
}

export function analyzeProject(projectRoot: string): ProjectAnalysis {
  const result: ProjectAnalysis = {
    current_phase: null,
    phase_progress: 0,
    artifacts_completed: 0,
    total_artifacts: 5,
    blockers: [],
    risks: [],
    readiness: 'unknown',
  };

  const stateFile = join(projectRoot, '.jumpstart', 'state', 'state.json');
  if (existsSync(stateFile)) {
    try {
      const state = JSON.parse(readFileSync(stateFile, 'utf8')) as Record<string, unknown>;
      if (typeof state.current_phase === 'string') {
        result.current_phase = state.current_phase;
      }
    } catch {
      // ignore parse errors
    }
  }

  const artifactMap: Record<string, string> = {
    'specs/challenger-brief.md': 'phase-0',
    'specs/product-brief.md': 'phase-1',
    'specs/prd.md': 'phase-2',
    'specs/architecture.md': 'phase-3',
    'specs/implementation-plan.md': 'phase-3',
  };

  let completed = 0;
  let latestPhase: string | null = null;

  for (const [relPath, phase] of Object.entries(artifactMap)) {
    const fullPath = join(projectRoot, relPath);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8');
      const isApproved = /- \[x\]/i.test(content) && /Approved by[:\s]+(?!Pending)/i.test(content);
      if (isApproved) {
        completed++;
        latestPhase = phase;
      }

      const blockerMatches = content.match(/\[BLOCKER[:\s]*([^\]]*)\]/gi);
      if (blockerMatches) {
        result.blockers.push(
          ...blockerMatches.map((b) => b.replace(/\[BLOCKER[:\s]*/i, '').replace(/\]/g, ''))
        );
      }

      const clarificationMatches = content.match(/\[NEEDS CLARIFICATION[:\s]*([^\]]*)\]/gi);
      if (clarificationMatches) {
        result.risks.push(
          ...clarificationMatches.map(
            (c) => `Unresolved: ${c.replace(/\[NEEDS CLARIFICATION[:\s]*/i, '').replace(/\]/g, '')}`
          )
        );
      }
    }
  }

  result.artifacts_completed = completed;
  result.phase_progress = Math.round((completed / result.total_artifacts) * 100);

  if (!result.current_phase && latestPhase) {
    const phaseObj = PHASES.find((p) => p.id === latestPhase);
    const nextPhase = phaseObj ? PHASES.find((p) => p.order === phaseObj.order + 1) : undefined;
    result.current_phase = nextPhase ? nextPhase.id : latestPhase;
  }

  if (completed >= 5) result.readiness = 'production-ready';
  else if (completed >= 3) result.readiness = 'implementation-ready';
  else if (completed >= 1) result.readiness = 'in-progress';
  else result.readiness = 'not-started';

  return result;
}

export interface RegisterInitiativeInput {
  id?: string | undefined;
  name: string;
  path?: string | undefined;
  owner?: string | undefined;
  budget?: number | undefined;
  target_date?: string | undefined;
}

export interface RegisterResult {
  success: boolean;
  initiative?: PortfolioInitiative | undefined;
  error?: string | undefined;
}

export function registerInitiative(
  initiative: RegisterInitiativeInput,
  options: { portfolioFile?: string | undefined } = {}
): RegisterResult {
  if (!initiative?.name) {
    return { success: false, error: 'initiative.name is required' };
  }

  const portfolioFile = options.portfolioFile ?? DEFAULT_PORTFOLIO_FILE;
  const portfolio = loadPortfolio(portfolioFile);

  const id = initiative.id ?? initiative.name.toLowerCase().replace(/\s+/g, '-');
  if (portfolio.initiatives.find((i) => i.id === id)) {
    return { success: false, error: `Initiative "${id}" already exists` };
  }

  const newInitiative: PortfolioInitiative = {
    id,
    name: initiative.name.trim(),
    path: initiative.path ?? null,
    owner: initiative.owner ?? null,
    budget: initiative.budget ?? null,
    target_date: initiative.target_date ?? null,
    status: 'on-track',
    registered_at: new Date().toISOString(),
    last_checked: null,
    current_phase: null,
    phase_progress: 0,
    readiness: 'not-started',
    blockers: [],
    risks: [],
    spend: 0,
    notes: [],
  };

  portfolio.initiatives.push(newInitiative);
  savePortfolio(portfolio, portfolioFile);

  return { success: true, initiative: newInitiative };
}

export interface RefreshResult {
  success: boolean;
  initiative?: PortfolioInitiative | undefined;
  error?: string | undefined;
}

export function refreshInitiative(
  initiativeId: string,
  options: { portfolioFile?: string | undefined } = {}
): RefreshResult {
  const portfolioFile = options.portfolioFile ?? DEFAULT_PORTFOLIO_FILE;
  const portfolio = loadPortfolio(portfolioFile);

  const initiative = portfolio.initiatives.find((i) => i.id === initiativeId);
  if (!initiative) {
    return { success: false, error: `Initiative not found: ${initiativeId}` };
  }

  if (initiative.path && existsSync(initiative.path)) {
    const analysis = analyzeProject(initiative.path);
    initiative.current_phase = analysis.current_phase;
    initiative.phase_progress = analysis.phase_progress;
    initiative.readiness = analysis.readiness;
    initiative.blockers = analysis.blockers;
    initiative.risks = analysis.risks;
    initiative.artifacts_completed = analysis.artifacts_completed;

    if (analysis.blockers.length > 0) {
      initiative.status = 'blocked';
    } else if (analysis.risks.length > 3) {
      initiative.status = 'at-risk';
    } else if (analysis.phase_progress >= 100) {
      initiative.status = 'completed';
    }
  }

  initiative.last_checked = new Date().toISOString();
  savePortfolio(portfolio, portfolioFile);

  return { success: true, initiative };
}

export interface PortfolioStatusResult {
  success: true;
  total_initiatives: number;
  status_counts: Record<string, number>;
  average_progress: number;
  budget: { total: number; spent: number; remaining: number };
  blockers: Array<{ initiative: string; blocker: string }>;
  initiatives: Array<{
    id: string;
    name: string;
    status: PortfolioStatus;
    phase: string | null;
    progress: number;
    readiness: string;
    owner: string | null;
    blockers: number;
    risks: number;
  }>;
}

export function getPortfolioStatus(
  options: { portfolioFile?: string | undefined } = {}
): PortfolioStatusResult {
  const portfolioFile = options.portfolioFile ?? DEFAULT_PORTFOLIO_FILE;
  const portfolio = loadPortfolio(portfolioFile);

  const statusCounts: Record<string, number> = {};
  for (const status of PORTFOLIO_STATUSES) {
    statusCounts[status] = portfolio.initiatives.filter((i) => i.status === status).length;
  }

  const totalBudget = portfolio.initiatives.reduce((sum, i) => sum + (i.budget ?? 0), 0);
  const totalSpend = portfolio.initiatives.reduce((sum, i) => sum + (i.spend ?? 0), 0);

  const allBlockers = portfolio.initiatives.flatMap((i) =>
    (i.blockers ?? []).map((b) => ({ initiative: i.name, blocker: b }))
  );

  const avgProgress =
    portfolio.initiatives.length > 0
      ? Math.round(
          portfolio.initiatives.reduce((sum, i) => sum + (i.phase_progress ?? 0), 0) /
            portfolio.initiatives.length
        )
      : 0;

  return {
    success: true,
    total_initiatives: portfolio.initiatives.length,
    status_counts: statusCounts,
    average_progress: avgProgress,
    budget: { total: totalBudget, spent: totalSpend, remaining: totalBudget - totalSpend },
    blockers: allBlockers,
    initiatives: portfolio.initiatives.map((i) => ({
      id: i.id,
      name: i.name,
      status: i.status,
      phase: i.current_phase,
      progress: i.phase_progress,
      readiness: i.readiness,
      owner: i.owner,
      blockers: (i.blockers ?? []).length,
      risks: (i.risks ?? []).length,
    })),
  };
}

export interface RemoveResult {
  success: boolean;
  removed?: string | undefined;
  error?: string | undefined;
}

export function removeInitiative(
  initiativeId: string,
  options: { portfolioFile?: string | undefined } = {}
): RemoveResult {
  const portfolioFile = options.portfolioFile ?? DEFAULT_PORTFOLIO_FILE;
  const portfolio = loadPortfolio(portfolioFile);

  const index = portfolio.initiatives.findIndex((i) => i.id === initiativeId);
  if (index === -1) {
    return { success: false, error: `Initiative not found: ${initiativeId}` };
  }

  const removed = portfolio.initiatives.splice(index, 1)[0];
  savePortfolio(portfolio, portfolioFile);

  return { success: true, removed: removed?.name };
}

export interface SnapshotResult {
  success: true;
  snapshot: PortfolioSnapshot;
}

export function takeSnapshot(options: { portfolioFile?: string | undefined } = {}): SnapshotResult {
  const portfolioFile = options.portfolioFile ?? DEFAULT_PORTFOLIO_FILE;
  const portfolio = loadPortfolio(portfolioFile);

  const statusSummary: Record<string, number> = {};
  for (const status of PORTFOLIO_STATUSES) {
    statusSummary[status] = portfolio.initiatives.filter((i) => i.status === status).length;
  }

  const snapshot: PortfolioSnapshot = {
    taken_at: new Date().toISOString(),
    total_initiatives: portfolio.initiatives.length,
    status_summary: statusSummary,
    avg_progress:
      portfolio.initiatives.length > 0
        ? Math.round(
            portfolio.initiatives.reduce((sum, i) => sum + (i.phase_progress ?? 0), 0) /
              portfolio.initiatives.length
          )
        : 0,
  };

  portfolio.snapshots.push(snapshot);
  if (portfolio.snapshots.length > 100) {
    portfolio.snapshots = portfolio.snapshots.slice(-100);
  }
  savePortfolio(portfolio, portfolioFile);

  return { success: true, snapshot };
}
