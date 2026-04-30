/**
 * requirements-baseline.ts — Requirements Baseline & Change Control port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/requirements-baseline.js` (CJS) to a typed
 * ES module. Public surface preserved verbatim by name + signature.
 *
 * M3 hardening:
 *   - `loadBaseline` runs `rejectPollutionKeys` on parsed JSON before use.
 *   - On parse failure or pollution detection, returns `defaultBaseline()`.
 *
 * Path-safety per ADR-009:
 *   - Receives `root` from CLI wiring which routes through assertUserPath.
 *
 * @see bin/lib/requirements-baseline.js (legacy reference)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const DEFAULT_BASELINE_FILE = join('.jumpstart', 'state', 'requirements-baseline.json');

export const ARTIFACT_TYPES = [
  'challenger-brief',
  'product-brief',
  'prd',
  'architecture',
  'implementation-plan',
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface BaselineSnapshot {
  type: ArtifactType;
  path: string;
  hash: string;
  requirement_ids: string[];
  frozen_at: string;
}

export interface BaselineEntry {
  id: string;
  frozen_at: string;
  frozen_by: string;
  snapshots: BaselineSnapshot[];
  total_requirements: number;
}

export interface ChangeRequest {
  id: string;
  artifact: string;
  artifact_type: ArtifactType;
  requested_at: string;
  impact_level: string;
  added_requirements: string[];
  removed_requirements: string[];
  downstream_artifacts: ArtifactType[];
  status: string;
}

export interface Baseline {
  version: string;
  created_at: string;
  last_updated: string | null;
  frozen: boolean;
  baselines: BaselineEntry[];
  change_requests: ChangeRequest[];
}

function rejectPollutionKeys(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') return;
  const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (forbidden.has(key)) throw new Error(`Prototype-pollution key detected: "${key}"`);
    rejectPollutionKeys((obj as Record<string, unknown>)[key]);
  }
}

export function defaultBaseline(): Baseline {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    frozen: false,
    baselines: [],
    change_requests: [],
  };
}

export function loadBaseline(baselineFile?: string): Baseline {
  const filePath = baselineFile ?? DEFAULT_BASELINE_FILE;
  if (!existsSync(filePath)) return defaultBaseline();
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    rejectPollutionKeys(parsed);
    return parsed as Baseline;
  } catch {
    return defaultBaseline();
  }
}

export function saveBaseline(baseline: Baseline, baselineFile?: string): void {
  const filePath = baselineFile ?? DEFAULT_BASELINE_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  baseline.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function extractRequirementIds(content: string): string[] {
  const patterns = [
    /\b(REQ-\d+)\b/g,
    /\b(E\d+-S\d+)\b/g,
    /\b(NFR-\d+)\b/g,
    /\b(UC-\d+)\b/g,
    /\b(FR-\d+)\b/g,
    /\b(AC-\d+)\b/g,
  ];
  const ids = new Set<string>();
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const id = match[1];
      if (id) ids.add(id);
    }
  }
  return [...ids].sort();
}

export interface FreezeResult {
  success: boolean;
  baseline_id?: string | undefined;
  artifacts_frozen?: number | undefined;
  total_requirements?: number | undefined;
  snapshots?: Array<{ type: ArtifactType; path: string; requirements: number }> | undefined;
  error?: string | undefined;
}

export function freezeBaseline(
  root: string,
  options: { baselineFile?: string | undefined; approver?: string | undefined } = {}
): FreezeResult {
  const baselineFile = options.baselineFile ?? join(root, DEFAULT_BASELINE_FILE);
  const baseline = loadBaseline(baselineFile);

  const specsDir = join(root, 'specs');
  if (!existsSync(specsDir)) {
    return { success: false, error: 'specs/ directory not found' };
  }

  const snapshots: BaselineSnapshot[] = [];
  const artifactMap: Record<string, ArtifactType> = {
    'specs/challenger-brief.md': 'challenger-brief',
    'specs/product-brief.md': 'product-brief',
    'specs/prd.md': 'prd',
    'specs/architecture.md': 'architecture',
    'specs/implementation-plan.md': 'implementation-plan',
  };

  for (const [relPath, type] of Object.entries(artifactMap)) {
    const fullPath = join(root, relPath);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8');
      snapshots.push({
        type,
        path: relPath,
        hash: hashContent(content),
        requirement_ids: extractRequirementIds(content),
        frozen_at: new Date().toISOString(),
      });
    }
  }

  if (snapshots.length === 0) {
    return { success: false, error: 'No spec artifacts found to freeze' };
  }

  const baselineEntry: BaselineEntry = {
    id: `baseline-${Date.now()}`,
    frozen_at: new Date().toISOString(),
    frozen_by: options.approver ?? 'system',
    snapshots,
    total_requirements: snapshots.reduce((sum, s) => sum + s.requirement_ids.length, 0),
  };

  baseline.baselines.push(baselineEntry);
  baseline.frozen = true;
  saveBaseline(baseline, baselineFile);

  return {
    success: true,
    baseline_id: baselineEntry.id,
    artifacts_frozen: snapshots.length,
    total_requirements: baselineEntry.total_requirements,
    snapshots: snapshots.map((s) => ({
      type: s.type,
      path: s.path,
      requirements: s.requirement_ids.length,
    })),
  };
}

export interface ChangeInfo {
  type: ArtifactType;
  path: string;
  change: string;
  severity: string;
  added_requirements?: string[] | undefined;
  removed_requirements?: string[] | undefined;
}

export interface CheckBaselineResult {
  success: true;
  frozen: boolean;
  baseline_id?: string | undefined;
  frozen_at?: string | undefined;
  drifted?: boolean | undefined;
  changes?: ChangeInfo[] | undefined;
  unchanged?: Array<{ type: ArtifactType; path: string }> | undefined;
  summary?:
    | {
        total_artifacts: number;
        changed: number;
        unchanged: number;
        critical: number;
      }
    | undefined;
  message?: string | undefined;
}

export function checkBaseline(
  root: string,
  options: { baselineFile?: string | undefined } = {}
): CheckBaselineResult {
  const baselineFile = options.baselineFile ?? join(root, DEFAULT_BASELINE_FILE);
  const baseline = loadBaseline(baselineFile);

  if (!baseline.frozen || baseline.baselines.length === 0) {
    return { success: true, frozen: false, message: 'No frozen baseline found' };
  }

  const latestBaseline = baseline.baselines[baseline.baselines.length - 1];
  if (!latestBaseline) return { success: true, frozen: false, message: 'No frozen baseline found' };

  const changes: ChangeInfo[] = [];
  const unchanged: Array<{ type: ArtifactType; path: string }> = [];

  for (const snapshot of latestBaseline.snapshots) {
    const fullPath = join(root, snapshot.path);
    if (!existsSync(fullPath)) {
      changes.push({
        type: snapshot.type,
        path: snapshot.path,
        change: 'deleted',
        severity: 'critical',
      });
      continue;
    }

    const content = readFileSync(fullPath, 'utf8');
    const currentHash = hashContent(content);

    if (currentHash !== snapshot.hash) {
      const currentIds = extractRequirementIds(content);
      const addedIds = currentIds.filter((id) => !snapshot.requirement_ids.includes(id));
      const removedIds = snapshot.requirement_ids.filter((id) => !currentIds.includes(id));

      changes.push({
        type: snapshot.type,
        path: snapshot.path,
        change: 'modified',
        severity: removedIds.length > 0 ? 'critical' : addedIds.length > 0 ? 'warning' : 'info',
        added_requirements: addedIds,
        removed_requirements: removedIds,
      });
    } else {
      unchanged.push({ type: snapshot.type, path: snapshot.path });
    }
  }

  return {
    success: true,
    frozen: true,
    baseline_id: latestBaseline.id,
    frozen_at: latestBaseline.frozen_at,
    drifted: changes.length > 0,
    changes,
    unchanged,
    summary: {
      total_artifacts: latestBaseline.snapshots.length,
      changed: changes.length,
      unchanged: unchanged.length,
      critical: changes.filter((c) => c.severity === 'critical').length,
    },
  };
}

export interface ImpactResult {
  success: true;
  impact: string;
  change_request_id?: string | undefined;
  artifact?: string | undefined;
  assessment?:
    | {
        change_type: string;
        affected_requirements?: string[] | undefined;
        downstream_artifacts: ArtifactType[];
        added_requirements?: string[] | undefined;
        removed_requirements?: string[] | undefined;
        unchanged_requirements?: number | undefined;
        requires_re_approval?: boolean | undefined;
      }
    | undefined;
  message?: string | undefined;
}

export function assessImpact(
  artifactPath: string,
  root: string,
  options: { baselineFile?: string | undefined } = {}
): ImpactResult {
  const baselineFile = options.baselineFile ?? join(root, DEFAULT_BASELINE_FILE);
  const baseline = loadBaseline(baselineFile);

  if (!baseline.frozen || baseline.baselines.length === 0) {
    return {
      success: true,
      impact: 'none',
      message: 'No frozen baseline — changes are unconstrained',
    };
  }

  const relPath = relative(root, resolve(root, artifactPath)).replace(/\\/g, '/');
  const latestBaseline = baseline.baselines[baseline.baselines.length - 1];
  if (!latestBaseline)
    return { success: true, impact: 'none', message: 'No frozen baseline found' };

  const snapshot = latestBaseline.snapshots.find((s) => s.path === relPath);

  if (!snapshot) {
    return {
      success: true,
      impact: 'none',
      message: `${relPath} is not part of the frozen baseline`,
    };
  }

  const fullPath = join(root, relPath);
  if (!existsSync(fullPath)) {
    const downstreamTypes = ARTIFACT_TYPES.filter((t) => t !== snapshot.type) as ArtifactType[];
    return {
      success: true,
      impact: 'critical',
      artifact: relPath,
      assessment: {
        change_type: 'deletion',
        affected_requirements: snapshot.requirement_ids,
        downstream_artifacts: downstreamTypes,
      },
    };
  }

  const content = readFileSync(fullPath, 'utf8');
  const currentHash = hashContent(content);

  if (currentHash === snapshot.hash) {
    return { success: true, impact: 'none', message: 'Artifact matches frozen baseline' };
  }

  const currentIds = extractRequirementIds(content);
  const addedIds = currentIds.filter((id) => !snapshot.requirement_ids.includes(id));
  const removedIds = snapshot.requirement_ids.filter((id) => !currentIds.includes(id));
  const unchangedIds = currentIds.filter((id) => snapshot.requirement_ids.includes(id));

  const typeIndex = ARTIFACT_TYPES.indexOf(snapshot.type);
  const downstreamTypes = (
    typeIndex >= 0 ? ARTIFACT_TYPES.slice(typeIndex + 1) : []
  ) as ArtifactType[];

  const impactLevel =
    removedIds.length > 0
      ? 'critical'
      : addedIds.length > 3
        ? 'high'
        : addedIds.length > 0
          ? 'medium'
          : 'low';

  const changeRequest: ChangeRequest = {
    id: `cr-${Date.now()}`,
    artifact: relPath,
    artifact_type: snapshot.type,
    requested_at: new Date().toISOString(),
    impact_level: impactLevel,
    added_requirements: addedIds,
    removed_requirements: removedIds,
    downstream_artifacts: downstreamTypes,
    status: 'pending_review',
  };

  baseline.change_requests.push(changeRequest);
  saveBaseline(baseline, baselineFile);

  return {
    success: true,
    impact: impactLevel,
    change_request_id: changeRequest.id,
    artifact: relPath,
    assessment: {
      change_type: removedIds.length > 0 ? 'breaking' : 'additive',
      added_requirements: addedIds,
      removed_requirements: removedIds,
      unchanged_requirements: unchangedIds.length,
      downstream_artifacts: downstreamTypes,
      requires_re_approval: impactLevel === 'critical' || impactLevel === 'high',
    },
  };
}

export interface BaselineStatusResult {
  success: true;
  frozen: boolean;
  total_baselines: number;
  total_change_requests: number;
  pending_change_requests: number;
  latest_baseline: BaselineEntry | null;
}

export function getBaselineStatus(
  options: { baselineFile?: string | undefined } = {}
): BaselineStatusResult {
  const baselineFile = options.baselineFile ?? DEFAULT_BASELINE_FILE;
  const baseline = loadBaseline(baselineFile);

  return {
    success: true,
    frozen: baseline.frozen,
    total_baselines: baseline.baselines.length,
    total_change_requests: baseline.change_requests.length,
    pending_change_requests: baseline.change_requests.filter((cr) => cr.status === 'pending_review')
      .length,
    latest_baseline:
      baseline.baselines.length > 0
        ? (baseline.baselines[baseline.baselines.length - 1] ?? null)
        : null,
  };
}
