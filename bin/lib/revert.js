/**
 * revert.js — Rollback Workflows (Item 40)
 *
 * Restores the last approved state of an artifact and archives the rejected draft.
 *
 * Usage:
 *   echo '{"artifact":"specs/prd.md","reason":"Scope was too broad"}' | node bin/lib/revert.js
 *
 * Input (stdin JSON):
 *   {
 *     "artifact": "specs/prd.md",
 *     "reason": "Rejected because scope was too broad",
 *     "archive_dir": ".jumpstart/archive"
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "success": true,
 *     "archived_to": ".jumpstart/archive/prd.2026-02-08T10-30-00.md",
 *     "restored_from": "git:HEAD~1",
 *     "reason": "..."
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } = require('fs');
const { join, dirname, basename, extname } = require('path');
const { execSync } = require('child_process');

const DEFAULT_ARCHIVE_DIR = '.jumpstart/archive';

/**
 * Generate a timestamped archive filename.
 * @param {string} originalPath - Original file path
 * @returns {string} Archive filename
 */
export function archiveFilename(originalPath) {
  const ext = extname(originalPath);
  const base = basename(originalPath, ext);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${base}.${timestamp}${ext}`;
}

/**
 * Archive a file and attempt to restore the last committed version.
 * @param {object} options
 * @param {string} options.artifact - Path to the artifact file
 * @param {string} [options.reason] - Reason for reverting
 * @param {string} [options.archive_dir] - Archive directory
 * @returns {object} Result
 */
export function revertArtifact(options) {
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
  const metaPath = archivePath + '.meta.json';
  const metadata = {
    original_path: artifact,
    archived_at: new Date().toISOString(),
    reason: reason || 'No reason provided',
    archived_to: archivePath
  };
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');

  // Try to restore from git
  let restoredFrom = null;
  try {
    execSync(`git show HEAD:${artifact}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    execSync(`git checkout HEAD -- ${artifact}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    restoredFrom = 'git:HEAD';
  } catch {
    // If git restore fails, just leave the archive and remove the file
    restoredFrom = null;
  }

  return {
    success: true,
    archived_to: archivePath,
    restored_from: restoredFrom,
    reason: reason || 'No reason provided'
  };
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('revert.js')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input || '{}');
      if (!data.artifact) {
        process.stderr.write(JSON.stringify({ error: 'Missing required field: artifact' }) + '\n');
        process.exit(1);
      }
      const result = revertArtifact(data);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (err) {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(1);
    }
  });
}
