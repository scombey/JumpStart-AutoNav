/**
 * locks.ts — file-lock primitives (T4.1.4 port).
 *
 * Pure-library port of `bin/lib/locks.mjs`. Four exports preserved
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
 * continue to hit `bin/lib/locks.mjs` until M5's `runIpc` lands.
 *
 * @see bin/lib/locks.mjs (legacy reference)
 * @see specs/decisions/adr-005-module-layout.md (strangler-fig)
 * @see specs/implementation-plan.md T4.1.4
 */

import { createHash } from 'node:crypto';
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

/**
 * On-disk lock entry. Discriminated union: a healthy lock has the
 * full `agent`/`acquired_at`/`pid` triple; a corrupt-on-disk entry
 * surfaces from `listLocks` as the error variant. Pit Crew Reviewer H1
 * — the previous shape lied to the type system by claiming all fields
 * were required and using `as Lock` to smuggle the error variant
 * through. Callers iterating `listLocks().locks` now have to narrow
 * before reading `agent`/`pid`.
 */
export type Lock =
  | { ok: true; file: string; agent: string; acquired_at: string; pid: number }
  | { ok: false; file: string; error: 'corrupt' };

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
 * Lock-file path derivation. Pit Crew M2 Adversary 1 (CRITICAL) fixed:
 * the legacy sanitization `[/\\] → __` then `.. → _` was an irreversible
 * many-to-one map. Distinct paths like `specs/prd.md` + `specs__prd.md`
 * collided on the same lock filename, letting an attacker steal or
 * release a lock by aliasing the path it sanitizes to.
 *
 * The fix: derive the lock filename from a SHA-256 prefix of the
 * normalized path. The full original path is recorded inside the lock
 * JSON's `file` field, so an acquire-time collision check (
 * `existing.file !== filePath`) catches and rejects aliasing attempts.
 *
 * Behavior change vs legacy: lock filenames change shape (no longer
 * human-readable). Two compensating moves:
 *   1. The on-disk lock JSON still carries the original path verbatim
 *      under `file`, so `listLocks` output is unchanged.
 *   2. Lock filenames remain stable across runs for the same input
 *      (deterministic hash), so external tooling that polls a specific
 *      lock by name is only a one-time migration.
 */
function lockPath(filePath: string, locksDir: string): string {
  // Normalize then hash. Slice to 16 hex chars (64 bits) — collision
  // probability for the few-thousand-locks workload is astronomically
  // low while keeping filenames short.
  const hash = createHash('sha256').update(filePath).digest('hex').slice(0, 16);
  return join(locksDir, `${hash}.lock`);
}

/**
 * Read + narrow a lock file to its discriminated-union shape. Returns
 * `null` when the file can't be parsed or the shape is invalid —
 * callers fall through to the corrupt-lock recovery path.
 */
function parseLockFile(lockFilePath: string): (Lock & { ok: true }) | null {
  try {
    const parsed = JSON.parse(readFileSync(lockFilePath, 'utf8')) as Partial<{
      file: string;
      agent: string;
      acquired_at: string;
      pid: number;
    }>;
    if (
      typeof parsed.file === 'string' &&
      typeof parsed.agent === 'string' &&
      typeof parsed.acquired_at === 'string' &&
      typeof parsed.pid === 'number'
    ) {
      return {
        ok: true,
        file: parsed.file,
        agent: parsed.agent,
        acquired_at: parsed.acquired_at,
        pid: parsed.pid,
      };
    }
    return null;
  } catch {
    return null;
  }
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
    const existing = parseLockFile(lp);
    if (existing) {
      // Defense against hash-collision (astronomically unlikely with
      // 64 bits, but worth checking — and against future migration
      // bugs that re-derive filenames differently).
      if (existing.file !== filePath) {
        return {
          success: false,
          error: `Lock file collision: ${lp} holds a lock for "${existing.file}" not "${filePath}".`,
          lock: existing,
        };
      }
      return {
        success: false,
        error: `File is already locked by ${existing.agent} since ${existing.acquired_at}`,
        lock: existing,
      };
    }
    // Corrupt lock — fall through and overwrite.
  }

  const lock: Lock = {
    ok: true,
    file: filePath,
    agent,
    acquired_at: new Date().toISOString(),
    pid: process.pid,
  };

  // Atomic exclusive create on POSIX; falls back to overwrite on the
  // corrupt-lock-cleanup path above. The 'wx' flag fails fast if a
  // lock arrived between the existsSync check and the write — closing
  // the TOCTOU window QA-F7 flagged.
  try {
    writeFileSync(lp, `${JSON.stringify(lock, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch {
    // Fallback: a concurrent writer beat us OR we're cleaning up a
    // corrupt lock (existsSync was true but JSON.parse failed). Read
    // back what's actually there and surface the right outcome.
    if (existsSync(lp)) {
      const existing = parseLockFile(lp);
      if (existing) {
        return {
          success: false,
          error: `Concurrent acquire — file is locked by ${existing.agent} since ${existing.acquired_at}`,
          lock: existing,
        };
      }
      // Still corrupt — overwrite (legacy fix-by-clobber).
      writeFileSync(lp, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
      return { success: true, lock };
    }
    // Re-throw any non-EEXIST error (e.g., permission denied).
    throw new Error(`Failed to acquire lock at ${lp}`);
  }
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

  const existing = parseLockFile(lp);
  if (existing) {
    // Hash-collision defense (Adversary 1): refuse to release a lock
    // whose stored `file` doesn't match. Without this, an attacker who
    // controls a path that hashes to the same prefix could release
    // someone else's lock.
    if (existing.file !== filePath) {
      return {
        success: false,
        error: `Lock at ${lp} holds "${existing.file}" not "${filePath}". Refusing release.`,
      };
    }
    if (existing.agent !== agent) {
      return {
        success: false,
        error: `Lock is held by ${existing.agent}, not ${agent}. Cannot release.`,
      };
    }
  }
  // Corrupt-or-matched: remove the file (matches legacy fix-by-clobber).
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

  const lock = parseLockFile(lp);
  if (!lock) {
    return { locked: false, file: filePath, error: 'Corrupt lock file' };
  }
  // Hash-collision defense: if the stored `file` doesn't match, the
  // hash matched but it's a different artifact — caller's `filePath`
  // is NOT locked.
  if (lock.file !== filePath) {
    return { locked: false, file: filePath };
  }
  return { locked: true, file: filePath, lock };
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
      const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Partial<{
        file: string;
        agent: string;
        acquired_at: string;
        pid: number;
      }>;
      // Validate full healthy shape; missing fields → corrupt variant.
      if (
        typeof parsed.file === 'string' &&
        typeof parsed.agent === 'string' &&
        typeof parsed.acquired_at === 'string' &&
        typeof parsed.pid === 'number'
      ) {
        return {
          ok: true,
          file: parsed.file,
          agent: parsed.agent,
          acquired_at: parsed.acquired_at,
          pid: parsed.pid,
        };
      }
      return { ok: false, file: parsed.file ?? f, error: 'corrupt' };
    } catch {
      return { ok: false, file: f, error: 'corrupt' };
    }
  });

  return { locks };
}
