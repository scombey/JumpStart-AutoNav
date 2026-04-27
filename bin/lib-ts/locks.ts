/**
 * locks.ts — file-lock primitives (T4.1.4 port).
 *
 * Pure-library port of `bin/lib/locks.js`. Four exports preserved
 * verbatim: `acquireLock`, `releaseLock`, `lockStatus`, `listLocks`.
 *
 * Behavior parity with the legacy module:
 *   - Lock file path derivation identical: `<filePath>` with `/` and
 *     `\\` rewritten to `__` and any `..` rewritten to `_`, suffixed
 *     with `.lock`, joined under the locks dir.
 *   - Default locks dir: `.jumpstart/state/locks`.
 *   - On-disk lock JSON shape: `{ file, agent, acquired_at, pid }`,
 *     pretty-printed with trailing newline.
 *   - Result shapes (`{ success, lock?, error?, message? }`) preserved
 *     across every branch — agent-mismatch refuses release, corrupt
 *     locks are silently overwritten on acquire / removed on release,
 *     missing locks return `{ success: true, message: 'No lock to release' }`.
 *
 * The legacy CLI driver (the `if (process.argv[1].endsWith('locks.js'))`
 * tail block) is intentionally NOT ported. Subprocess invocations
 * continue to hit `bin/lib/locks.js` until M5's `runIpc` lands.
 *
 * @see bin/lib/locks.js (legacy reference)
 * @see specs/decisions/adr-005-module-layout.md (strangler-fig)
 * @see specs/implementation-plan.md T4.1.4
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const DEFAULT_LOCKS_DIR = '.jumpstart/state/locks';

/** On-disk lock entry. The pid is the acquirer's process id at write time. */
export interface Lock {
  file: string;
  agent: string;
  acquired_at: string;
  pid: number;
  /** Optional sentinel a corrupt lock survives with — not part of the legitimate contract. */
  error?: string;
}

/**
 * Result of `acquireLock` / `releaseLock`. Exactly one of `lock`,
 * `error`, or `message` will typically be set, but the legacy module
 * occasionally combines them (e.g. an `error` plus the `lock` of the
 * existing holder); the type allows that.
 */
export interface LockResult {
  success: boolean;
  lock?: Lock;
  error?: string;
  message?: string;
}

/** Result of `lockStatus`. */
export interface LockStatusResult {
  locked: boolean;
  file: string;
  lock?: Lock;
  error?: string;
}

/** Result of `listLocks`. */
export interface ListLocksResult {
  locks: Lock[];
}

/**
 * Lock-file path derivation. Sanitizes `/`, `\`, and `..` from the file
 * path so the resulting lock filename is filesystem-safe. The
 * substitution is irreversible — different originals can collide
 * (legacy behavior; consumers are expected to use repo-relative paths).
 */
function lockPath(filePath: string, locksDir: string): string {
  const sanitized = filePath.replace(/[/\\]/g, '__').replace(/\.\./g, '_');
  return join(locksDir, `${sanitized}.lock`);
}

/**
 * Acquire a lock on `filePath`. Returns success + the lock entry on
 * fresh acquire; failure + the existing lock on conflict. A corrupt
 * lock file (unreadable JSON) is silently overwritten — matching the
 * legacy "fix-it-by-clobbering" semantics so a botched write doesn't
 * brick all future acquires.
 */
export function acquireLock(filePath: string, agent: string, locksDir?: string): LockResult {
  const dir = locksDir || DEFAULT_LOCKS_DIR;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const lp = lockPath(filePath, dir);

  if (existsSync(lp)) {
    try {
      const existing = JSON.parse(readFileSync(lp, 'utf8')) as Lock;
      return {
        success: false,
        error: `File is already locked by ${existing.agent} since ${existing.acquired_at}`,
        lock: existing,
      };
    } catch {
      // Corrupt lock — fall through and overwrite.
    }
  }

  const lock: Lock = {
    file: filePath,
    agent,
    acquired_at: new Date().toISOString(),
    pid: process.pid,
  };

  writeFileSync(lp, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  return { success: true, lock };
}

/**
 * Release a lock. Refuses if the agent doesn't match the holder. A
 * corrupt lock file is silently removed (legacy behavior — preserves
 * forward progress on bad on-disk state).
 */
export function releaseLock(filePath: string, agent: string, locksDir?: string): LockResult {
  const dir = locksDir || DEFAULT_LOCKS_DIR;
  const lp = lockPath(filePath, dir);

  if (!existsSync(lp)) {
    return { success: true, message: 'No lock to release' };
  }

  try {
    const existing = JSON.parse(readFileSync(lp, 'utf8')) as Lock;
    if (existing.agent !== agent) {
      return {
        success: false,
        error: `Lock is held by ${existing.agent}, not ${agent}. Cannot release.`,
      };
    }
  } catch {
    // Corrupt lock — remove anyway (matches legacy).
  }

  unlinkSync(lp);
  return { success: true, message: `Lock released on ${filePath}` };
}

/** Read-only check of whether `filePath` is currently locked. */
export function lockStatus(filePath: string, locksDir?: string): LockStatusResult {
  const dir = locksDir || DEFAULT_LOCKS_DIR;
  const lp = lockPath(filePath, dir);

  if (!existsSync(lp)) {
    return { locked: false, file: filePath };
  }

  try {
    const lock = JSON.parse(readFileSync(lp, 'utf8')) as Lock;
    return { locked: true, file: filePath, lock };
  } catch {
    return { locked: false, file: filePath, error: 'Corrupt lock file' };
  }
}

/**
 * List every active lock under the given directory. Corrupt entries
 * surface as `{ file: <basename>, error: 'corrupt' }` items rather
 * than crashing the listing (legacy behavior — best-effort enumeration).
 */
export function listLocks(locksDir?: string): ListLocksResult {
  const dir = locksDir || DEFAULT_LOCKS_DIR;
  if (!existsSync(dir)) {
    return { locks: [] };
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.lock'));
  const locks = files.map((f): Lock => {
    try {
      return JSON.parse(readFileSync(join(dir, f), 'utf8')) as Lock;
    } catch {
      return { file: f, error: 'corrupt' } as Lock;
    }
  });

  return { locks };
}
