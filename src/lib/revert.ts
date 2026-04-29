/**
 * revert.ts — Rollback workflow port (M11 batch 1).
 *
 * Pure-library port of `bin/lib/revert.mjs` (legacy ESM). Public surface
 * preserved verbatim by name + signature:
 *
 *   - `archiveFilename(originalPath)` => string
 *   - `revertArtifact(options)` => RevertResult
 *
 * Behavior parity:
 *   - Default archive directory: `.jumpstart/archive`.
 *   - Archive filename format: `<basename>.<ISO-timestamp>.<ext>` with
 *     colons + dots in the timestamp replaced by hyphens.
 *   - Writes a `.meta.json` sidecar with reason + original path next to
 *     each archive copy.
 *   - Attempts `git show HEAD:<artifact>` first; if successful, runs
 *     `git checkout HEAD -- <artifact>` to restore. If git fails (no
 *     prior version, not in a repo, etc.), `restored_from` is null but
 *     the archive copy + metadata are still produced.
 *
 * Hardening (over legacy):
 *   - Legacy used a string-form invocation that interpolates the
 *     artifact path into a shell command. The TS port uses the
 *     array-args form from node:child_process so arguments pass to git
 *     directly without shell interpretation. Same approach used in
 *     src/lib/versioning.ts. ADR-009 path-safety remains the caller's
 *     responsibility (the cluster wrapper routes args.artifact through
 *     assertUserPath).
 *
 * @see bin/lib/revert.mjs (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 */

import * as cp from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const DEFAULT_ARCHIVE_DIR = '.jumpstart/archive';

export interface RevertOptions {
  artifact: string;
  reason?: string;
  archive_dir?: string;
}

export interface RevertResultSuccess {
  success: true;
  archived_to: string;
  restored_from: string | null;
  reason: string;
}
export interface RevertResultFailure {
  success: false;
  error: string;
}
export type RevertResult = RevertResultSuccess | RevertResultFailure;

/**
 * Generate a timestamped archive filename.
 *
 * Format: `<basename>.<YYYY-MM-DDTHH-MM-SS>.<ext>`. The timestamp is the
 * ISO 8601 string with colons and the millisecond-separator dot replaced
 * by hyphens (so the result is filesystem-safe on Windows + POSIX).
 */
export function archiveFilename(originalPath: string): string {
  const ext = extname(originalPath);
  const base = basename(originalPath, ext);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${base}.${timestamp}${ext}`;
}

/**
 * Archive a file and attempt to restore the last committed version from
 * git. Returns the archive path + restore status; never throws on the
 * git error path (returns `restored_from: null` so the caller can render
 * a partial-success message).
 */
export function revertArtifact(options: RevertOptions): RevertResult {
  const { artifact, reason } = options;
  const archiveDir = options.archive_dir || DEFAULT_ARCHIVE_DIR;

  if (!existsSync(artifact)) {
    return { success: false, error: `Artifact not found: ${artifact}` };
  }

  // Ensure archive directory exists
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  // Archive the current version
  const archiveName = archiveFilename(artifact);
  const archivePath = join(archiveDir, archiveName);
  copyFileSync(artifact, archivePath);

  // Write archive metadata
  const metaPath = `${archivePath}.meta.json`;
  const metadata = {
    original_path: artifact,
    archived_at: new Date().toISOString(),
    reason: reason || 'No reason provided',
    archived_to: archivePath,
  };
  writeFileSync(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  // Try to restore from git. Use the array-args form so the artifact
  // path can't smuggle shell metacharacters into git's argv (defense in
  // depth — the cluster wrapper already guards via assertUserPath).
  let restoredFrom: string | null = null;
  try {
    cp.execFileSync('git', ['show', `HEAD:${artifact}`], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    cp.execFileSync('git', ['checkout', 'HEAD', '--', artifact], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    restoredFrom = 'git:HEAD';
  } catch {
    // If git restore fails (no prior version, not a repo, etc.), keep
    // the archive + metadata; just signal that no restore happened.
    restoredFrom = null;
  }

  return {
    success: true,
    archived_to: archivePath,
    restored_from: restoredFrom,
    reason: reason || 'No reason provided',
  };
}
