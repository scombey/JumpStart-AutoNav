/**
 * locks.js — Conflict Detection and File Locking (Item 45)
 *
 * Prevents two agents from editing the same "living" file concurrently.
 * Uses a simple lock file mechanism.
 *
 * Usage:
 *   echo '{"action":"acquire","file":"specs/prd.md","agent":"pm"}' | node bin/lib/locks.js
 *   echo '{"action":"release","file":"specs/prd.md","agent":"pm"}' | node bin/lib/locks.js
 *   echo '{"action":"status","file":"specs/prd.md"}' | node bin/lib/locks.js
 *   echo '{"action":"list"}' | node bin/lib/locks.js
 *
 * Output (stdout JSON):
 *   { "success": true, "lock": { ... } }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readFileSync, writeFileSync, unlinkSync, readdirSync, mkdirSync, existsSync } = require('fs');
const { join, basename } = require('path');

const DEFAULT_LOCKS_DIR = '.jumpstart/state/locks';

/**
 * Generate a lock file path from a target file path.
 * @param {string} filePath
 * @param {string} locksDir
 * @returns {string}
 */
function lockPath(filePath, locksDir) {
  const sanitized = filePath.replace(/[/\\]/g, '__').replace(/\.\./g, '_');
  return join(locksDir, `${sanitized}.lock`);
}

/**
 * Acquire a lock on a file.
 * @param {string} filePath - File to lock
 * @param {string} agent - Agent acquiring the lock
 * @param {string} [locksDir] - Locks directory
 * @returns {object}
 */
export function acquireLock(filePath, agent, locksDir) {
  const dir = locksDir || DEFAULT_LOCKS_DIR;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const lp = lockPath(filePath, dir);

  // Check if already locked
  if (existsSync(lp)) {
    try {
      const existing = JSON.parse(readFileSync(lp, 'utf8'));
      return {
        success: false,
        error: `File is already locked by ${existing.agent} since ${existing.acquired_at}`,
        lock: existing
      };
    } catch {
      // Corrupt lock file — overwrite
    }
  }

  const lock = {
    file: filePath,
    agent: agent,
    acquired_at: new Date().toISOString(),
    pid: process.pid
  };

  writeFileSync(lp, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  return { success: true, lock };
}

/**
 * Release a lock on a file.
 * @param {string} filePath - File to unlock
 * @param {string} agent - Agent releasing the lock (must match acquirer)
 * @param {string} [locksDir] - Locks directory
 * @returns {object}
 */
export function releaseLock(filePath, agent, locksDir) {
  const dir = locksDir || DEFAULT_LOCKS_DIR;
  const lp = lockPath(filePath, dir);

  if (!existsSync(lp)) {
    return { success: true, message: 'No lock to release' };
  }

  try {
    const existing = JSON.parse(readFileSync(lp, 'utf8'));
    if (existing.agent !== agent) {
      return {
        success: false,
        error: `Lock is held by ${existing.agent}, not ${agent}. Cannot release.`
      };
    }
  } catch {
    // Corrupt lock — remove anyway
  }

  unlinkSync(lp);
  return { success: true, message: `Lock released on ${filePath}` };
}

/**
 * Check lock status of a file.
 * @param {string} filePath
 * @param {string} [locksDir]
 * @returns {object}
 */
export function lockStatus(filePath, locksDir) {
  const dir = locksDir || DEFAULT_LOCKS_DIR;
  const lp = lockPath(filePath, dir);

  if (!existsSync(lp)) {
    return { locked: false, file: filePath };
  }

  try {
    const lock = JSON.parse(readFileSync(lp, 'utf8'));
    return { locked: true, file: filePath, lock };
  } catch {
    return { locked: false, file: filePath, error: 'Corrupt lock file' };
  }
}

/**
 * List all active locks.
 * @param {string} [locksDir]
 * @returns {object}
 */
export function listLocks(locksDir) {
  const dir = locksDir || DEFAULT_LOCKS_DIR;
  if (!existsSync(dir)) {
    return { locks: [] };
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.lock'));
  const locks = files.map(f => {
    try {
      return JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      return { file: f, error: 'corrupt' };
    }
  });

  return { locks };
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('locks.js')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input || '{}');
      const action = data.action || 'status';
      let result;

      switch (action) {
        case 'acquire':
          result = acquireLock(data.file, data.agent, data.locks_dir);
          break;
        case 'release':
          result = releaseLock(data.file, data.agent, data.locks_dir);
          break;
        case 'status':
          result = lockStatus(data.file, data.locks_dir);
          break;
        case 'list':
          result = listLocks(data.locks_dir);
          break;
        default:
          result = { error: `Unknown action: ${action}` };
      }

      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (err) {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(1);
    }
  });
}
