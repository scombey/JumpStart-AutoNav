/**
 * test-locks.test.ts — T4.1.4 unit tests for the locks.ts port.
 *
 * Tests pin: discriminated-union Lock shape (Pit Crew Reviewer H1),
 * hash-based filename derivation + collision-defense (Pit Crew
 * Adversary 1), and the atomic-acquire path (Pit Crew QA F7).
 *
 * @see src/lib/locks.ts
 * @see bin/lib/locks.mjs (legacy reference)
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireLock, listLocks, lockStatus, releaseLock } from '../src/lib/locks.js';

let locksDir: string;

beforeEach(() => {
  locksDir = mkdtempSync(path.join(tmpdir(), 'locks-test-'));
});

afterEach(() => {
  rmSync(locksDir, { recursive: true, force: true });
});

/** Find the single lock file in the test's locks dir (hash-based name). */
function singleLockFilename(): string {
  const files = readdirSync(locksDir).filter((f) => f.endsWith('.lock'));
  if (files.length !== 1) {
    throw new Error(`expected 1 lock file in ${locksDir}, got ${files.length}`);
  }
  const [name] = files;
  if (name === undefined) {
    throw new Error(`unexpected empty filename in ${locksDir}`);
  }
  return name;
}

describe('acquireLock', () => {
  it('writes a lock file with the documented shape', () => {
    const result = acquireLock('specs/prd.md', 'pm', locksDir);
    expect(result.success).toBe(true);
    if (!result.lock?.ok) throw new Error('expected ok lock');
    expect(result.lock.file).toBe('specs/prd.md');
    expect(result.lock.agent).toBe('pm');
    expect(typeof result.lock.acquired_at).toBe('string');
    expect(typeof result.lock.pid).toBe('number');
  });

  it('refuses to acquire when the file is already locked, returning the existing holder', () => {
    acquireLock('specs/prd.md', 'pm', locksDir);
    const second = acquireLock('specs/prd.md', 'architect', locksDir);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already locked by pm/);
    if (!second.lock?.ok) throw new Error('expected lock entry');
    expect(second.lock.agent).toBe('pm');
  });

  it('overwrites a corrupt lock file silently (legacy fix-by-clobber)', () => {
    // Pre-acquire to compute the hashed filename, then clobber its content.
    acquireLock('specs/prd.md', 'pm', locksDir);
    const lockFile = singleLockFilename();
    writeFileSync(path.join(locksDir, lockFile), 'not-json{', 'utf8');

    // Re-acquire — corrupt-lock fix-by-clobber kicks in.
    const result = acquireLock('specs/prd.md', 'architect', locksDir);
    expect(result.success).toBe(true);
    if (!result.lock?.ok) throw new Error('expected ok lock');
    expect(result.lock.agent).toBe('architect');
  });

  it('creates the locks dir if it does not exist', () => {
    rmSync(locksDir, { recursive: true, force: true });
    const result = acquireLock('a.md', 'pm', locksDir);
    expect(result.success).toBe(true);
  });
});

describe('releaseLock', () => {
  it('returns success=true with the no-op message when no lock exists', () => {
    const result = releaseLock('specs/prd.md', 'pm', locksDir);
    expect(result.success).toBe(true);
    expect(result.message).toBe('No lock to release');
  });

  it('removes the lock file when the agent matches', () => {
    acquireLock('specs/prd.md', 'pm', locksDir);
    const result = releaseLock('specs/prd.md', 'pm', locksDir);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Lock released on specs/prd.md');
    expect(lockStatus('specs/prd.md', locksDir).locked).toBe(false);
  });

  it('refuses to release a lock held by a different agent', () => {
    acquireLock('specs/prd.md', 'pm', locksDir);
    const result = releaseLock('specs/prd.md', 'architect', locksDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/held by pm, not architect/);
    // Lock still in place.
    expect(lockStatus('specs/prd.md', locksDir).locked).toBe(true);
  });

  it('removes a corrupt lock file regardless of agent', () => {
    acquireLock('specs/prd.md', 'pm', locksDir);
    const lockFile = singleLockFilename();
    writeFileSync(path.join(locksDir, lockFile), '{not json', 'utf8');
    const result = releaseLock('specs/prd.md', 'anyone', locksDir);
    expect(result.success).toBe(true);
  });
});

describe('lockStatus', () => {
  it('reports unlocked for a fresh file', () => {
    expect(lockStatus('specs/prd.md', locksDir)).toEqual({
      locked: false,
      file: 'specs/prd.md',
    });
  });

  it('reports locked + the lock entry when locked', () => {
    acquireLock('specs/prd.md', 'pm', locksDir);
    const status = lockStatus('specs/prd.md', locksDir);
    expect(status.locked).toBe(true);
    if (!status.lock?.ok) throw new Error('expected lock entry');
    expect(status.lock.agent).toBe('pm');
  });

  it('reports the corrupt-lock fallthrough (locked=false, error="Corrupt lock file")', () => {
    acquireLock('specs/prd.md', 'pm', locksDir);
    const lockFile = singleLockFilename();
    writeFileSync(path.join(locksDir, lockFile), '{', 'utf8');
    const status = lockStatus('specs/prd.md', locksDir);
    expect(status.locked).toBe(false);
    expect(status.error).toBe('Corrupt lock file');
  });
});

describe('listLocks', () => {
  it('returns an empty array when the locks dir does not exist', () => {
    rmSync(locksDir, { recursive: true, force: true });
    expect(listLocks(locksDir)).toEqual({ locks: [] });
  });

  it('returns every lock entry — corrupt ones surface as { ok: false, error: "corrupt" }', () => {
    acquireLock('a.md', 'pm', locksDir);
    acquireLock('b.md', 'architect', locksDir);
    writeFileSync(path.join(locksDir, 'corrupt.lock'), 'bad', 'utf8');

    const result = listLocks(locksDir);
    expect(result.locks).toHaveLength(3);
    // Discriminated union: narrow via `lock.ok` before reading agent.
    const healthyAgents = result.locks.flatMap((l) => (l.ok ? [l.agent] : []));
    const corrupt = result.locks.filter((l) => !l.ok);
    expect(healthyAgents.sort()).toEqual(['architect', 'pm']);
    expect(corrupt).toHaveLength(1);
  });
});

describe('lock-file derivation (hash-based naming, Adversary 1 fix)', () => {
  it('writes a hashed filename under the locks dir', () => {
    acquireLock('specs/prd.md', 'pm', locksDir);
    const lockFile = singleLockFilename();
    // 16 hex chars + '.lock' suffix per locks.ts contract.
    expect(lockFile).toMatch(/^[0-9a-f]{16}\.lock$/);
  });

  it('writes the lock JSON with a trailing newline (legacy emit shape)', () => {
    const result = acquireLock('a.md', 'pm', locksDir);
    expect(result.success).toBe(true);
    const raw = readFileSync(path.join(locksDir, singleLockFilename()), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('"file": "a.md"');
  });
});

describe('hash-collision defense (Adversary 1 — confirmed exploit before the fix)', () => {
  it('does NOT confuse paths that the legacy sanitizer would have aliased', () => {
    // Pre-fix: `specs/prd.md` and `specs__prd.md` collided on `specs__prd.md.lock`.
    acquireLock('specs/prd.md', 'pm', locksDir);
    const aliased = acquireLock('specs__prd.md', 'attacker', locksDir);
    // Both succeed because the hashed filenames differ.
    expect(aliased.success).toBe(true);
    expect(readdirSync(locksDir).filter((f) => f.endsWith('.lock'))).toHaveLength(2);
  });

  it('refuses release when the lock-file holds a different `file` than the caller passed', () => {
    // Synthesize a hand-crafted collision: both calls hash to the same
    // file name? Astronomically unlikely with 64 bits, so simulate by
    // tampering with the on-disk lock to look like a collision.
    acquireLock('a.md', 'pm', locksDir);
    const lockFile = singleLockFilename();
    const lp = path.join(locksDir, lockFile);
    const tampered = JSON.parse(readFileSync(lp, 'utf8'));
    tampered.file = 'b.md'; // Pretend the lock is for a different artifact.
    writeFileSync(lp, JSON.stringify(tampered), 'utf8');

    const result = releaseLock('a.md', 'pm', locksDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/holds "b\.md" not "a\.md"/);
  });
});

describe('concurrent acquire (QA F7 — atomic write via O_EXCL)', () => {
  it('only one of two concurrent acquires reports success', async () => {
    // Same module instance, simulated interleaving via Promise.all.
    // Without the wx-flag write, the second call could see existsSync()
    // return false and then overwrite. With wx, only one wins.
    const results = await Promise.all([
      Promise.resolve().then(() => acquireLock('shared.md', 'pm', locksDir)),
      Promise.resolve().then(() => acquireLock('shared.md', 'architect', locksDir)),
    ]);
    const successes = results.filter((r) => r.success);
    expect(successes).toHaveLength(1);
  });
});
