/**
 * test-framework-manifest.test.ts — T4.1.11 unit tests.
 *
 * Pin the file-classification rules + manifest round-trip + diff math.
 *
 * @see src/lib/framework-manifest.ts
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectUserModifications,
  diffManifest,
  FRAMEWORK_OWNED_PATTERNS,
  generateManifest,
  getPackageVersion,
  hashFile,
  isFrameworkOwned,
  isUserOwned,
  type Manifest,
  readFrameworkManifest,
  USER_OWNED_PATHS,
  writeFrameworkManifest,
} from '../src/lib/framework-manifest.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'fw-manifest-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeAt(relPath: string, body: string): string {
  const full = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body, 'utf8');
  return full;
}

describe('FRAMEWORK_OWNED_PATTERNS + USER_OWNED_PATHS', () => {
  it('exports the canonical framework-owned patterns', () => {
    expect(FRAMEWORK_OWNED_PATTERNS).toContain('.jumpstart/agents/');
    expect(FRAMEWORK_OWNED_PATTERNS).toContain('CLAUDE.md');
    expect(FRAMEWORK_OWNED_PATTERNS).toContain('.cursorrules');
  });
  it('exports the canonical user-owned paths', () => {
    expect(USER_OWNED_PATHS).toContain('.jumpstart/config.yaml');
    expect(USER_OWNED_PATHS).toContain('specs/');
    expect(USER_OWNED_PATHS).toContain('.jumpstart/state/');
  });
});

describe('isUserOwned', () => {
  it('returns true for prefix-matching directory paths', () => {
    expect(isUserOwned('specs/architecture.md')).toBe(true);
    expect(isUserOwned('.jumpstart/state/state.json')).toBe(true);
  });
  it('returns true for the directory itself (without trailing slash)', () => {
    expect(isUserOwned('specs')).toBe(true);
  });
  it('returns true for exact matches', () => {
    expect(isUserOwned('.jumpstart/config.yaml')).toBe(true);
  });
  it('returns false for non-matching paths', () => {
    expect(isUserOwned('.jumpstart/agents/scout.md')).toBe(false);
    expect(isUserOwned('CLAUDE.md')).toBe(false);
  });
  it('normalizes Windows backslash paths', () => {
    expect(isUserOwned('specs\\architecture.md')).toBe(true);
  });
});

describe('isFrameworkOwned (user-owned takes precedence)', () => {
  it('returns true for framework-owned patterns', () => {
    expect(isFrameworkOwned('.jumpstart/agents/scout.md')).toBe(true);
    expect(isFrameworkOwned('.jumpstart/templates/prd.md')).toBe(true);
    expect(isFrameworkOwned('CLAUDE.md')).toBe(true);
  });
  it('returns false for user-owned even if framework patterns might overlap', () => {
    expect(isFrameworkOwned('.jumpstart/config.yaml')).toBe(false);
    expect(isFrameworkOwned('specs/anything.md')).toBe(false);
  });
  it('returns false for unknown paths', () => {
    expect(isFrameworkOwned('random/file.md')).toBe(false);
    expect(isFrameworkOwned('node_modules/foo')).toBe(false);
  });

  it('returns true for the directory itself (no trailing slash) — Pit Crew M2-Final QA F7', () => {
    // Asymmetry vs isUserOwned was fixed: an empty framework-owned
    // directory is now classified as framework-owned, so the upgrade
    // flow's generateManifest can detect missing dirs.
    expect(isFrameworkOwned('.jumpstart/templates')).toBe(true);
    expect(isFrameworkOwned('.jumpstart/agents')).toBe(true);
    expect(isFrameworkOwned('.github/agents')).toBe(true);
  });

  it('user-owned wins over framework-owned for paths nested under user-owned prefix', () => {
    // Hypothetical user-created file at a name that COULD collide
    // with a framework path — user-owned prefix `.jumpstart/state/`
    // wins over the absence of any framework match.
    expect(isUserOwned('.jumpstart/state/agents/scout.md')).toBe(true);
    expect(isFrameworkOwned('.jumpstart/state/agents/scout.md')).toBe(false);
  });
});

describe('hashFile', () => {
  it('returns a 64-char hex SHA-256', () => {
    const file = writeAt('a.txt', 'hello');
    expect(hashFile(file)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic across reads', () => {
    const file = writeAt('a.txt', 'same content');
    expect(hashFile(file)).toBe(hashFile(file));
  });
  it('reads as binary (not utf8) so different line-endings hash differently', () => {
    const lf = writeAt('lf.txt', 'one\ntwo\n');
    const crlf = writeAt('crlf.txt', 'one\r\ntwo\r\n');
    expect(hashFile(lf)).not.toBe(hashFile(crlf));
  });
});

describe('generateManifest', () => {
  it('walks .jumpstart/ + .github/ + top-level files filtering to framework-owned', () => {
    writeAt('.jumpstart/agents/scout.md', 'agent');
    writeAt('.jumpstart/templates/prd.md', 'template');
    writeAt('.jumpstart/config.yaml', 'config'); // user-owned, excluded
    writeAt('CLAUDE.md', 'integration');
    writeAt('specs/something.md', 'user-owned, excluded');
    const manifest = generateManifest(tmpDir, { version: '1.2.3' });
    const files = Object.keys(manifest.files);
    expect(files).toContain('.jumpstart/agents/scout.md');
    expect(files).toContain('.jumpstart/templates/prd.md');
    expect(files).toContain('CLAUDE.md');
    expect(files).not.toContain('.jumpstart/config.yaml');
    expect(files).not.toContain('specs/something.md');
    expect(manifest.frameworkVersion).toBe('1.2.3');
    expect(typeof manifest.generatedAt).toBe('string');
  });
  it('honors allFiles=true to include user-owned + unrecognized paths', () => {
    writeAt('.jumpstart/config.yaml', 'config');
    writeAt('.jumpstart/agents/scout.md', 'agent');
    const manifest = generateManifest(tmpDir, { allFiles: true });
    expect(Object.keys(manifest.files)).toContain('.jumpstart/config.yaml');
    expect(Object.keys(manifest.files)).toContain('.jumpstart/agents/scout.md');
  });
  it('returns empty files map when nothing matches', () => {
    writeAt('random/file.md', 'unmatched');
    const manifest = generateManifest(tmpDir);
    expect(manifest.files).toEqual({});
  });
});

describe('diffManifest', () => {
  it('reports added / removed / changed / unchanged correctly', () => {
    const oldM: Manifest = {
      frameworkVersion: '1.0.0',
      generatedAt: 't0',
      files: { a: 'h1', b: 'h2', c: 'h3' },
    };
    const newM: Manifest = {
      frameworkVersion: '1.1.0',
      generatedAt: 't1',
      files: { a: 'h1', b: 'changed', d: 'h4' },
    };
    const result = diffManifest(oldM, newM);
    expect(result.unchanged).toEqual(['a']);
    expect(result.changed).toEqual(['b']);
    expect(result.removed).toEqual(['c']);
    expect(result.added).toEqual(['d']);
  });
  it('handles empty manifests', () => {
    const empty: Manifest = { frameworkVersion: '0.0.0', generatedAt: 't', files: {} };
    expect(diffManifest(empty, empty)).toEqual({
      added: [],
      removed: [],
      changed: [],
      unchanged: [],
    });
  });
});

describe('detectUserModifications', () => {
  it('classifies files as modified / unmodified / missing', () => {
    const stableFile = writeAt('.jumpstart/agents/scout.md', 'unchanged');
    const _modifiedFile = writeAt('.jumpstart/agents/architect.md', 'NEW VERSION');
    const installedManifest: Manifest = {
      frameworkVersion: '1.0.0',
      generatedAt: 't',
      files: {
        '.jumpstart/agents/scout.md': hashFile(stableFile),
        '.jumpstart/agents/architect.md': 'old-hash-of-old-content',
        '.jumpstart/agents/missing.md': 'never-existed',
      },
    };
    const result = detectUserModifications(tmpDir, installedManifest);
    expect(result.unmodified).toEqual(['.jumpstart/agents/scout.md']);
    expect(result.modified).toEqual(['.jumpstart/agents/architect.md']);
    expect(result.missing).toEqual(['.jumpstart/agents/missing.md']);
  });
});

describe('readFrameworkManifest + writeFrameworkManifest', () => {
  it('round-trips the manifest object', () => {
    const manifest: Manifest = {
      frameworkVersion: '2.0.0',
      generatedAt: '2026-04-27T00:00:00.000Z',
      files: { 'CLAUDE.md': 'abc123' },
    };
    writeFrameworkManifest(tmpDir, manifest);
    expect(readFrameworkManifest(tmpDir)).toEqual(manifest);
  });
  it('writes a trailing newline (legacy emit shape)', () => {
    writeFrameworkManifest(tmpDir, {
      frameworkVersion: '1.0.0',
      generatedAt: 't',
      files: {},
    });
    const raw = readFileSync(path.join(tmpDir, '.jumpstart', 'framework-manifest.json'), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('  "frameworkVersion"'); // pretty-printed indent
  });
  it('readFrameworkManifest returns null on missing file', () => {
    expect(readFrameworkManifest(tmpDir)).toBeNull();
  });
  it('readFrameworkManifest returns null on malformed JSON (legacy soft-fail)', () => {
    mkdirSync(path.join(tmpDir, '.jumpstart'), { recursive: true });
    writeFileSync(path.join(tmpDir, '.jumpstart', 'framework-manifest.json'), 'not-json{', 'utf8');
    expect(readFrameworkManifest(tmpDir)).toBeNull();
  });
});

describe('Adv-3: path-traversal defense (Pit Crew M2-Final)', () => {
  // Confirmed exploit pre-fix: a manifest containing a relPath like
  // '../../etc/passwd' would feed `hashFile(join(projectRoot,
  // relPath))` outside the boundary, leaking file hashes. Post-fix:
  // assertInsideRoot rejects with ValidationError BEFORE any fs read.

  it('detectUserModifications throws ValidationError on traversal-shaped relPath', () => {
    const malicious: Manifest = {
      frameworkVersion: '1.0.0',
      generatedAt: 't',
      files: { '../../etc/passwd': 'attacker-supplied-hash' },
    };
    expect(() => detectUserModifications(tmpDir, malicious)).toThrow(/Path traversal rejected/);
  });

  it('detectUserModifications throws ValidationError on null-byte injection', () => {
    const malicious: Manifest = {
      frameworkVersion: '1.0.0',
      generatedAt: 't',
      files: { [`safe.txt${String.fromCharCode(0)}../etc/passwd`]: 'h' },
    };
    expect(() => detectUserModifications(tmpDir, malicious)).toThrow(/null byte/);
  });

  it('diffManifest throws ValidationError if either manifest carries traversal-shaped relPath', () => {
    const safe: Manifest = {
      frameworkVersion: '1.0.0',
      generatedAt: 't',
      files: { 'CLAUDE.md': 'h1' },
    };
    const evilOld: Manifest = {
      frameworkVersion: '0.9.0',
      generatedAt: 't0',
      files: { '../../escape.md': 'h0' },
    };
    expect(() => diffManifest(evilOld, safe)).toThrow(/Path traversal rejected/);
    expect(() => diffManifest(safe, evilOld)).toThrow(/Path traversal rejected/);
  });

  it('readFrameworkManifest soft-fails (returns null) when on-disk manifest carries traversal-shaped relPath', () => {
    // Write a malicious manifest directly (simulating corrupt or
    // attacker-influenced file). readFrameworkManifest must surface
    // null so callers can treat "missing-or-corrupt" uniformly.
    mkdirSync(path.join(tmpDir, '.jumpstart'), { recursive: true });
    writeFileSync(
      path.join(tmpDir, '.jumpstart', 'framework-manifest.json'),
      JSON.stringify({
        frameworkVersion: '1.0.0',
        generatedAt: 't',
        files: { '../../etc/passwd': 'leaked-hash' },
      }),
      'utf8'
    );
    expect(readFrameworkManifest(tmpDir)).toBeNull();
  });

  it('readFrameworkManifest soft-fails on top-level non-object', () => {
    mkdirSync(path.join(tmpDir, '.jumpstart'), { recursive: true });
    writeFileSync(
      path.join(tmpDir, '.jumpstart', 'framework-manifest.json'),
      JSON.stringify(['not', 'an', 'object']),
      'utf8'
    );
    expect(readFrameworkManifest(tmpDir)).toBeNull();
  });
});

describe('Adv-7: framework-manifest.json classification (Pit Crew M2-Final)', () => {
  it('classifies .jumpstart/framework-manifest.json as USER-owned', () => {
    expect(isUserOwned('.jumpstart/framework-manifest.json')).toBe(true);
    expect(isFrameworkOwned('.jumpstart/framework-manifest.json')).toBe(false);
  });

  it('USER_OWNED_PATHS includes .jumpstart/framework-manifest.json', () => {
    expect(USER_OWNED_PATHS).toContain('.jumpstart/framework-manifest.json');
  });

  it('generateManifest does NOT include .jumpstart/framework-manifest.json (user-owned wins)', () => {
    writeAt('.jumpstart/framework-manifest.json', '{}');
    writeAt('.jumpstart/agents/scout.md', 'agent');
    const m = generateManifest(tmpDir);
    expect(Object.keys(m.files)).not.toContain('.jumpstart/framework-manifest.json');
    expect(Object.keys(m.files)).toContain('.jumpstart/agents/scout.md');
  });
});

describe('getPackageVersion', () => {
  it('reads pkg.version from package.json', () => {
    writeAt('package.json', JSON.stringify({ name: 'x', version: '3.4.5' }));
    expect(getPackageVersion(tmpDir)).toBe('3.4.5');
  });
  it('returns 0.0.0 when package.json is missing', () => {
    expect(getPackageVersion(tmpDir)).toBe('0.0.0');
  });
  it('returns 0.0.0 when package.json is malformed', () => {
    writeAt('package.json', '{not-json');
    expect(getPackageVersion(tmpDir)).toBe('0.0.0');
  });
  it('returns 0.0.0 when version field is missing', () => {
    writeAt('package.json', JSON.stringify({ name: 'x' }));
    expect(getPackageVersion(tmpDir)).toBe('0.0.0');
  });
});
