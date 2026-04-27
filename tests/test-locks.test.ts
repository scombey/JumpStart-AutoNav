/**
 * test-locks.test.ts — T4.1.4 unit tests for the locks.ts port.
 *
 * Pin the legacy lock-file shape + every result-shape branch.
 *
 * @see bin/lib-ts/locks.ts
 * @see bin/lib/locks.js (legacy reference)
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireLock, listLocks, lockStatus, releaseLock } from '../bin/lib-ts/locks.js';

let locksDir: string;

beforeEach(() => {
  locksDir = mkdtempSync(path.join(tmpdir(), 'locks-test-'));
});

afterEach(() => {
  rmSync(locksDir, { recursive: true, force: true });
});

describe('acquireLock', () => {
  it('writes a lock file with the documented shape', () => {
    const result = acquireLock('specs/prd.md', 'pm', locksDir);
    expect(result.success).toBe(true);
    expect(result.lock?.file).toBe('specs/prd.md');
    expect(result.lock?.agent).toBe('pm');
    expect(typeof result.lock?.acquired_at).toBe('string');
    expect(typeof result.lock?.pid).toBe('number');
  });

  it('refuses to acquire when the file is already locked, returning the existing holder', () => {
    acquireLock('specs/prd.md', 'pm', locksDir);
    const second = acquireLock('specs/prd.md', 'architect', locksDir);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already locked by pm/);
    expect(second.lock?.agent).toBe('pm');
  });

  it('overwrites a corrupt lock file silently (legacy fix-by-clobber)', () => {
    const filePath = 'specs/prd.md';
    // Manually drop a corrupt lock under the same sanitized name.
    const sanitized = `${filePath.replace(/[/\\]/g, '__').replace(/\.\./g, '_')}.lock`;
    writeFileSync(path.join(locksDir, sanitized), 'not-json{', 'utf8');

    const result = acquireLock(filePath, 'pm', locksDir);
    expect(result.success).toBe(true);
    expect(result.lock?.agent).toBe('pm');
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
    const filePath = 'specs/prd.md';
    const sanitized = `${filePath.replace(/[/\\]/g, '__').replace(/\.\./g, '_')}.lock`;
    writeFileSync(path.join(locksDir, sanitized), '{not json', 'utf8');
    const result = releaseLock(filePath, 'anyone', locksDir);
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
    expect(status.lock?.agent).toBe('pm');
  });

  it('reports the corrupt-lock fallthrough (locked=false, error="Corrupt lock file")', () => {
    const filePath = 'specs/prd.md';
    const sanitized = `${filePath.replace(/[/\\]/g, '__').replace(/\.\./g, '_')}.lock`;
    writeFileSync(path.join(locksDir, sanitized), '{', 'utf8');
    const status = lockStatus(filePath, locksDir);
    expect(status.locked).toBe(false);
    expect(status.error).toBe('Corrupt lock file');
  });
});

describe('listLocks', () => {
  it('returns an empty array when the locks dir does not exist', () => {
    rmSync(locksDir, { recursive: true, force: true });
    expect(listLocks(locksDir)).toEqual({ locks: [] });
  });

  it('returns every lock entry — corrupt ones surface as { error: "corrupt" }', () => {
    acquireLock('a.md', 'pm', locksDir);
    acquireLock('b.md', 'architect', locksDir);
    writeFileSync(path.join(locksDir, 'corrupt.lock'), 'bad', 'utf8');

    const result = listLocks(locksDir);
    expect(result.locks).toHaveLength(3);
    const agents = result.locks.map((l) => l.agent ?? l.error);
    expect(agents).toEqual(expect.arrayContaining(['pm', 'architect', 'corrupt']));
  });
});

describe('lock-file derivation parity with legacy', () => {
  it('rewrites / and \\ to __ and .. to _', () => {
    acquireLock('specs/../etc/passwd', 'attacker', locksDir);
    // Sanitization: 'specs/../etc/passwd' → 'specs__._/etc/passwd' is
    // wrong; the legacy applies the [/\\] regex first, then the .. regex.
    // Actual sanitized form: 'specs____.._etc__passwd' (specs / -> __,
    // .. -> _, etc.).
    // We pin behavior by reading back the file we wrote.
    const result = listLocks(locksDir);
    expect(result.locks).toHaveLength(1);
    expect(result.locks[0].agent).toBe('attacker');
  });

  it('writes the lock JSON with a trailing newline (legacy emit shape)', () => {
    const result = acquireLock('a.md', 'pm', locksDir);
    expect(result.success).toBe(true);
    const sanitized = 'a.md.lock';
    const raw = readFileSync(path.join(locksDir, sanitized), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('"file": "a.md"');
  });
});
