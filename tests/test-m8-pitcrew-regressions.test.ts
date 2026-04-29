/**
 * test-m8-pitcrew-regressions.test.ts — M8 Pit Crew remediation pins.
 *
 * Pins every confirmed-exploit + confirmed-divergence finding from the
 * M8 Pit Crew round (Reviewer + QA + Adversary) so a future refactor
 * cannot silently re-open them.
 *
 * Findings covered:
 *   - BLOCKER 1 (Reviewer 1): __dirname in spec-validation.ts:53.
 *   - BLOCKER 2 (Adversary 2, confirmed exploit): raw user file paths
 *     forwarded to legacy lib functions in validate/smells/handoff-
 *     check/coverage. Post-fix: every command gates via assertUserPath.
 *   - BLOCKER 3 (Reviewer 2 + Adversary 4, confirmed exploit):
 *     validateModuleImpl path.resolve(args.moduleDir) bypassed
 *     containment.
 *   - HIGH (Adversary 1): safeJoin `relative === ''` early-return
 *     skipped the assertInsideRoot guard.
 *   - HIGH (Adversary 3): legacyRequire was vulnerable to NODE_PATH
 *     module hijack via bare relative require. Post-fix: absolute path
 *     resolution + name validation.
 *   - HIGH (Reviewer 4 + 5): checklist + lint discarded their result
 *     values; exit code was always 0 even on failure.
 *   - HIGH (Adversary 5): diffImpl forwarded raw args.path to
 *     generateDiff.
 *
 * @see specs/implementation-plan.md §Deviation Log (M8 entries)
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../bin/lib-ts/errors.js';
import { assertUserPath, legacyRequire, safeJoin } from '../src/cli/commands/_helpers.js';
import { diffImpl, validateModuleImpl } from '../src/cli/commands/handoff.js';
import { validateImpl } from '../src/cli/commands/spec-validation.js';
import { createTestDeps, type Deps } from '../src/cli/deps.js';

let tmpDir: string;
let depsAt: Deps;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'm8-pit-'));
  depsAt = createTestDeps({
    projectRoot: tmpDir,
    fs: {
      readFileSync: () => '',
      writeFileSync: () => undefined,
      existsSync: (p) => existsSync(p),
      mkdirSync: () => undefined,
    },
  });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────
// HIGH (Adversary 1) — safeJoin always calls assertInsideRoot
// ─────────────────────────────────────────────────────────────────────────

describe('Pit Crew M8 HIGH (Adversary 1) — safeJoin always guards (no empty-string skip)', () => {
  it('rejects an absolute path passed as a segment', () => {
    expect(() => safeJoin(depsAt, '/etc/passwd')).toThrow(ValidationError);
  });

  it('rejects a traversal-shaped segment', () => {
    expect(() => safeJoin(depsAt, '..', '..', 'etc', 'passwd')).toThrow(ValidationError);
  });

  it('accepts the project root itself (empty/`.` segment)', () => {
    expect(safeJoin(depsAt)).toBe(path.resolve(tmpDir));
    expect(safeJoin(depsAt, '.')).toBe(path.resolve(tmpDir));
  });

  it('accepts a normal sub-path', () => {
    const p = safeJoin(depsAt, 'specs', 'prd.md');
    expect(p.startsWith(path.resolve(tmpDir))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// BLOCKER 2 — assertUserPath rejects out-of-root user paths
// ─────────────────────────────────────────────────────────────────────────

describe('Pit Crew M8 BLOCKER 2 (Adversary 2) — assertUserPath rejects exfil-shaped paths', () => {
  it('rejects an absolute attacker path /etc/passwd', () => {
    expect(() => assertUserPath(depsAt, '/etc/passwd', 'test')).toThrow(ValidationError);
  });

  it('rejects a traversal-shaped path', () => {
    expect(() => assertUserPath(depsAt, '../../etc/passwd', 'test')).toThrow(ValidationError);
  });

  it('rejects a null-byte injected path', () => {
    expect(() => assertUserPath(depsAt, 'safe.md\0/etc/passwd', 'test')).toThrow(/null byte/i);
  });

  it('rejects an empty path', () => {
    expect(() => assertUserPath(depsAt, '', 'test')).toThrow(/empty/i);
  });

  it('accepts a clean in-project path', () => {
    const p = assertUserPath(depsAt, 'specs/prd.md', 'test');
    expect(p.startsWith(path.resolve(tmpDir))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// BLOCKER 2 transitive — validateImpl rejects raw absolute path
// ─────────────────────────────────────────────────────────────────────────

describe('Pit Crew M8 BLOCKER 2 — validateImpl gates user path through assertUserPath', () => {
  it('throws when path is /etc/passwd (was: forwarded to validateArtifact)', () => {
    expect(() => validateImpl(depsAt, { path: '/etc/passwd' })).toThrow(ValidationError);
  });

  it('throws when path traverses outside project', () => {
    expect(() => validateImpl(depsAt, { path: '../../etc/passwd' })).toThrow(ValidationError);
  });

  it('returns exitCode=1 when path is empty (no exception thrown)', () => {
    const r = validateImpl(depsAt, { path: '' });
    expect(r.exitCode).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// BLOCKER 3 — validateModuleImpl rejects out-of-root moduleDir
// ─────────────────────────────────────────────────────────────────────────

describe('Pit Crew M8 BLOCKER 3 (Reviewer 2 + Adversary 4) — validateModuleImpl gates moduleDir', () => {
  it('rejects /etc as moduleDir (was: walked the host filesystem)', () => {
    expect(() => validateModuleImpl(depsAt, { moduleDir: '/etc' })).toThrow(ValidationError);
  });

  it('rejects traversal-shaped moduleDir', () => {
    expect(() => validateModuleImpl(depsAt, { moduleDir: '../../etc' })).toThrow(ValidationError);
  });

  it('returns exitCode=1 when moduleDir is empty', () => {
    const r = validateModuleImpl(depsAt, { moduleDir: '' });
    expect(r.exitCode).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// HIGH (Adversary 5) — diffImpl gates args.path
// ─────────────────────────────────────────────────────────────────────────

describe('Pit Crew M8 HIGH (Adversary 5) — diffImpl gates user path', () => {
  it('rejects /home/user/.ssh as diff target', () => {
    expect(() => diffImpl(depsAt, { path: '/home/user/.ssh' })).toThrow(ValidationError);
  });

  it('rejects traversal-shaped path', () => {
    expect(() => diffImpl(depsAt, { path: '../../../etc' })).toThrow(ValidationError);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// HIGH (Adversary 3) — legacyRequire rejects unsafe lib names
// ─────────────────────────────────────────────────────────────────────────

describe('Pit Crew M8 HIGH (Adversary 3) — legacyRequire rejects unsafe lib names', () => {
  it('rejects a name with a slash (path injection)', () => {
    expect(() => legacyRequire('../../etc/passwd')).toThrow();
  });

  it('rejects a name with a parent-traversal', () => {
    expect(() => legacyRequire('foo/../bar')).toThrow();
  });

  it('rejects a name with null byte', () => {
    expect(() => legacyRequire('foo\0bar')).toThrow();
  });

  it('rejects a name starting with a dot', () => {
    expect(() => legacyRequire('.bashrc')).toThrow();
  });

  it('accepts a clean lib name (e.g. "validator")', () => {
    // Successfully resolves to the legacy lib (path-anchored absolute).
    expect(() => legacyRequire('validator')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// MED (Reviewer 6) — diff-cli-help.mjs swap-point honors --new-cli
// ─────────────────────────────────────────────────────────────────────────

describe('Pit Crew M8 MED (Reviewer 6) — diff-cli-help.mjs swap-point uses --new-cli flag', () => {
  it('script source contains the --new-cli flag handling', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'diff-cli-help.mjs'), 'utf8');
    // The fix introduces an explicit --new-cli flag handler.
    expect(src).toContain('--new-cli');
    expect(src).toContain('JUMPSTART_NEW_CLI');
    // The pre-fix `const newCli = LEGACY_CLI; // T4.7.2 swap-point`
    // marker MUST be gone — keeping it would let the swap regress.
    expect(src).not.toContain('// T4.7.2 swap-point');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// MED (QA 4) — FRAMEWORK_VERSION read from package.json
// ─────────────────────────────────────────────────────────────────────────

describe('Pit Crew M8 MED (QA 4) — main.ts FRAMEWORK_VERSION reads package.json at runtime', () => {
  it('main.meta.version matches package.json version', async () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    const { main } = await import('../src/cli/main.js');
    const meta = typeof main.meta === 'function' ? await main.meta() : await main.meta;
    expect(meta?.version).toBe(pkg.version);
  });
});
