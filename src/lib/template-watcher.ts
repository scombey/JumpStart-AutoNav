/**
 * template-watcher.ts -- Artifact Hot-Reloading (Item 14).
 *
 * Detects template changes and prompts spec updates.
 *
 * M3 hardening: snapshot files are plain JSON dicts with string values
 *   (filename -> hash). assertNoPollution() validates before use.
 * ADR-009: templatesDir/snapshotPath must be pre-validated by caller.
 * ADR-006: no process.exit.
 * defaultState fallback: loadSnapshot returns null on missing file (first run).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Snapshot = Record<string, string>;

export interface SnapshotChanges {
  added: string[];
  modified: string[];
  removed: string[];
}

export interface WatchResult {
  changed: boolean;
  changes: SnapshotChanges;
  warnings: string[];
}

/** Dangerous keys that must never appear in parsed JSON objects */
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertNoPollution(obj: unknown, p = ''): void {
  if (obj === null || typeof obj !== 'object') return;
  for (const key of Object.keys(obj as object)) {
    if (BLOCKED_KEYS.has(key)) {
      throw new Error(`Prototype pollution key detected at ${p}.${key}`);
    }
    assertNoPollution((obj as Record<string, unknown>)[key], `${p}.${key}`);
  }
}

/**
 * Compute a SHA-256 hash for a file.
 */
export function fileHash(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Build a snapshot of all template files and their hashes.
 */
export function buildSnapshot(templatesDir: string): Snapshot {
  const snapshot: Snapshot = {};

  if (!fs.existsSync(templatesDir)) {
    return snapshot;
  }

  const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    snapshot[file] = fileHash(path.join(templatesDir, file));
  }

  return snapshot;
}

/**
 * Load the previous template snapshot from disk.
 * Returns null on first run or missing file.
 */
export function loadSnapshot(snapshotPath: string): Snapshot | null {
  if (!fs.existsSync(snapshotPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    assertNoPollution(raw);
    return raw as Snapshot;
  } catch {
    return null;
  }
}

/**
 * Save a template snapshot to disk.
 */
export function saveSnapshot(snapshotPath: string, snapshot: Snapshot): void {
  const dir = path.dirname(snapshotPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
}

/**
 * Compare two template snapshots and identify changes.
 */
export function compareSnapshots(previous: Snapshot, current: Snapshot): SnapshotChanges {
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const [file, hash] of Object.entries(current)) {
    if (!(file in previous)) {
      added.push(file);
    } else if (previous[file] !== hash) {
      modified.push(file);
    }
  }

  for (const file of Object.keys(previous)) {
    if (!(file in current)) {
      removed.push(file);
    }
  }

  return { added, modified, removed };
}

const TEMPLATE_TO_SPEC: Record<string, string> = {
  'prd.md': 'specs/prd.md',
  'architecture.md': 'specs/architecture.md',
  'implementation-plan.md': 'specs/implementation-plan.md',
  'product-brief.md': 'specs/product-brief.md',
  'challenger-brief.md': 'specs/challenger-brief.md',
  'codebase-context.md': 'specs/codebase-context.md',
  'adr.md': 'specs/decisions/',
  'insights.md': 'specs/insights/',
  'qa-log.md': 'specs/qa-log.md',
};

/**
 * Map template files to their corresponding spec artifacts.
 */
export function templateToSpec(templateName: string): string {
  return TEMPLATE_TO_SPEC[templateName] ?? `specs/${templateName}`;
}

/**
 * Check for template changes and generate warnings.
 */
export function checkForChanges(templatesDir: string, snapshotPath: string): WatchResult {
  const current = buildSnapshot(templatesDir);
  const previous = loadSnapshot(snapshotPath);
  const warnings: string[] = [];

  if (!previous) {
    // First run -- save baseline
    saveSnapshot(snapshotPath, current);
    return { changed: false, changes: { added: [], modified: [], removed: [] }, warnings };
  }

  const changes = compareSnapshots(previous, current);
  const changed =
    changes.added.length > 0 || changes.modified.length > 0 || changes.removed.length > 0;

  if (changed) {
    for (const file of changes.modified) {
      const specPath = templateToSpec(file);
      warnings.push(`Template '${file}' has changed. Spec '${specPath}' may need regeneration.`);
    }
    for (const file of changes.added) {
      warnings.push(`New template '${file}' added. Consider generating corresponding spec.`);
    }
    for (const file of changes.removed) {
      warnings.push(`Template '${file}' was removed. Check if corresponding specs are orphaned.`);
    }

    // Update snapshot
    saveSnapshot(snapshotPath, current);
  }

  return { changed, changes, warnings };
}
