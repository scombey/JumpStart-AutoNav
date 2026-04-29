/**
 * release-readiness.ts — Release Readiness Reviews port (M11 batch 3).
 *
 * Pure-library port of `bin/lib/release-readiness.js`. Public surface
 * preserved verbatim by name + signature:
 *
 *   - `defaultState()` => ReleaseReadinessState
 *   - `loadState(stateFile?)` => ReleaseReadinessState
 *   - `saveState(state, stateFile?)` => void
 *   - `assessReadiness(root, options?)` => AssessReadinessResult
 *   - `generateReport(options?)` => GenerateReportResult
 *   - `READINESS_CATEGORIES`, `READINESS_LEVELS`
 *
 * Behavior parity:
 *   - 8 readiness categories: quality, security, performance, dependencies,
 *     documentation, rollback, monitoring, compliance.
 *   - 4 readiness levels keyed by score floor (>=90 ready, >=70 conditional,
 *     >=50 not-ready, <50 blocked).
 *   - Scoring heuristics applied via filesystem probes from `root` (test
 *     directories, specs, secret-scan-results, policies, package-lock,
 *     README, compliance state, NFR mention in architecture.md).
 *   - State file: caller passes via options; in legacy fallback was
 *     `path.join(root, '.jumpstart/state/release-readiness.json')` for
 *     `assessReadiness` and `path.join('.jumpstart/state/release-readiness.json')`
 *     (cwd-relative) for `generateReport`. Preserved verbatim.
 *   - M3 hardening: shape-validated JSON; rejects __proto__/constructor/
 *     prototype keys recursively; defaultState fallback on parse failure.
 *   - Path-safety: `assessReadiness` calls `assertInsideRoot` on the root
 *     argument before any fs probe.
 *
 * @see bin/lib/release-readiness.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assertInsideRoot } from './path-safety.js';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'release-readiness.json');

export const READINESS_CATEGORIES = [
  'quality',
  'security',
  'performance',
  'dependencies',
  'documentation',
  'rollback',
  'monitoring',
  'compliance',
] as const;

export type ReadinessCategory = (typeof READINESS_CATEGORIES)[number];

export interface ReadinessLevel {
  min: number;
  label: string;
  emoji: string;
  recommendation: string;
}

export const READINESS_LEVELS: ReadinessLevel[] = [
  { min: 90, label: 'Ready', emoji: '🟢', recommendation: 'go' },
  { min: 70, label: 'Conditionally Ready', emoji: '🟡', recommendation: 'conditional-go' },
  { min: 50, label: 'Not Ready', emoji: '🟠', recommendation: 'no-go' },
  { min: 0, label: 'Blocked', emoji: '🔴', recommendation: 'blocked' },
];

export interface ReadinessAssessment {
  id: string;
  assessed_at: string;
  scores: Record<string, number>;
  total_score: number;
  level: string;
  recommendation: string;
  blockers: string[];
  risks: string[];
}

export interface ReleaseReadinessState {
  version: string;
  created_at: string;
  last_updated: string | null;
  assessments: ReadinessAssessment[];
  current_readiness: ReadinessAssessment | null;
}

export interface AssessReadinessOptions {
  stateFile?: string | undefined;
}

export interface AssessReadinessResult extends ReadinessAssessment {
  success: true;
}

export interface GenerateReportOptions {
  stateFile?: string | undefined;
}

export interface ReportCategory {
  name: string;
  score: number;
  status: 'pass' | 'warning' | 'fail';
}

export type GenerateReportResult =
  | {
      success: true;
      recommendation: string;
      total_score: number;
      level: string;
      categories: ReportCategory[];
      blockers: string[];
      risks: string[];
      assessed_at: string;
    }
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

export function defaultState(): ReleaseReadinessState {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    assessments: [],
    current_readiness: null,
  };
}

export function loadState(stateFile?: string | undefined): ReleaseReadinessState {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(filePath)) return defaultState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return defaultState();
  }
  if (!isPlainObject(parsed) || hasForbiddenKey(parsed)) return defaultState();
  return parsed as unknown as ReleaseReadinessState;
}

export function saveState(state: ReleaseReadinessState, stateFile?: string | undefined): void {
  const filePath = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Assess release readiness across all 8 categories.
 *
 * Score heuristics (preserved verbatim from legacy):
 *   - quality: tests + specs → 80, tests only → 60, neither → 30
 *   - security: secret-scan + policies → 85, policies only → 60, neither → 40
 *   - performance: NFR mention in architecture.md → 75, else 40
 *   - dependencies: package-lock or yarn.lock → 80, else 50
 *   - documentation: README + specs → 85, README only → 60, neither → 30
 *   - rollback: 50 (default; needs manual assessment)
 *   - monitoring: 50 (default; needs manual assessment)
 *   - compliance: compliance.json → 70, else 40
 *
 * State file fallback `path.join(root, DEFAULT_STATE_FILE)` matches
 * legacy bin/lib/release-readiness.js:122.
 */
export function assessReadiness(
  root: string,
  options: AssessReadinessOptions = {}
): AssessReadinessResult {
  // Path-safety: gate root before any fs probe. Per ADR-009, every
  // user-supplied path through the trust boundary must be confirmed
  // inside its declared root. For assessReadiness `root` IS the
  // declared root, so the check is self-referential — succeeds for
  // any valid filesystem path that's its own canonical root.
  assertInsideRoot(root, root, { schemaId: 'release-readiness:assessReadiness:root' });

  const scores: Record<string, number> = {};

  // Quality: check if tests exist and specs are approved
  const hasTests = existsSync(join(root, 'tests')) || existsSync(join(root, 'test'));
  const hasSpecs = existsSync(join(root, 'specs'));
  scores.quality = hasTests && hasSpecs ? 80 : hasTests ? 60 : 30;

  // Security: check for secret scanner results, policy engine
  const hasSecurityScan = existsSync(join(root, '.jumpstart', 'state', 'secret-scan-results.json'));
  const hasPolicies = existsSync(join(root, '.jumpstart', 'policies.json'));
  scores.security = hasSecurityScan && hasPolicies ? 85 : hasPolicies ? 60 : 40;

  // Performance: check for NFR documentation
  const archFile = join(root, 'specs', 'architecture.md');
  let hasNFRs = false;
  if (existsSync(archFile)) {
    try {
      const content = readFileSync(archFile, 'utf8');
      hasNFRs = /\bNFR\b|non-functional|performance/i.test(content);
    } catch {
      /* ignore */
    }
  }
  scores.performance = hasNFRs ? 75 : 40;

  // Dependencies: check for lock file
  const hasLockFile =
    existsSync(join(root, 'package-lock.json')) || existsSync(join(root, 'yarn.lock'));
  scores.dependencies = hasLockFile ? 80 : 50;

  // Documentation
  const hasReadme = existsSync(join(root, 'README.md'));
  scores.documentation = hasReadme && hasSpecs ? 85 : hasReadme ? 60 : 30;

  // Rollback: defaults — needs manual assessment.
  scores.rollback = 50;

  // Monitoring: defaults — needs manual assessment.
  scores.monitoring = 50;

  // Compliance: check for compliance state
  const hasCompliance = existsSync(join(root, '.jumpstart', 'state', 'compliance.json'));
  scores.compliance = hasCompliance ? 70 : 40;

  const totalScore = Math.round(
    Object.values(scores).reduce((sum, s) => sum + s, 0) / READINESS_CATEGORIES.length
  );

  // Find the highest-floor level the score satisfies. Defensive fallback
  // to the lowest band ('Blocked') if levels happen to be empty.
  const level: ReadinessLevel = READINESS_LEVELS.find((l) => totalScore >= l.min) ??
    READINESS_LEVELS[READINESS_LEVELS.length - 1] ?? {
      min: 0,
      label: 'Blocked',
      emoji: '🔴',
      recommendation: 'blocked',
    };

  const assessment: ReadinessAssessment = {
    id: `rr-${Date.now()}`,
    assessed_at: new Date().toISOString(),
    scores,
    total_score: totalScore,
    level: level.label,
    recommendation: level.recommendation,
    blockers: Object.entries(scores)
      .filter(([, v]) => v < 50)
      .map(([k]) => k),
    risks: Object.entries(scores)
      .filter(([, v]) => v >= 50 && v < 70)
      .map(([k]) => k),
  };

  const stateFile = options.stateFile ?? join(root, DEFAULT_STATE_FILE);
  const state = loadState(stateFile);
  state.assessments.push(assessment);
  state.current_readiness = assessment;
  saveState(state, stateFile);

  return { success: true, ...assessment };
}

/**
 * Generate a go/no-go report. Returns success: false if no current
 * readiness assessment exists in the state file.
 */
export function generateReport(options: GenerateReportOptions = {}): GenerateReportResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  if (!state.current_readiness) {
    return { success: false, error: 'No readiness assessment found. Run assess first.' };
  }

  const r = state.current_readiness;

  return {
    success: true,
    recommendation: r.recommendation,
    total_score: r.total_score,
    level: r.level,
    categories: Object.entries(r.scores).map(
      ([name, score]): ReportCategory => ({
        name,
        score,
        status: score >= 70 ? 'pass' : score >= 50 ? 'warning' : 'fail',
      })
    ),
    blockers: r.blockers,
    risks: r.risks,
    assessed_at: r.assessed_at,
  };
}
