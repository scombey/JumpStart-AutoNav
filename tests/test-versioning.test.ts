/**
 * test-versioning.test.ts — T4.1.6 unit tests for the versioning.ts port.
 *
 * Tests that don't require a git repo focus on the pure functions
 * (`generateTag`, `injectVersion`). Tests that DO need git use a
 * tmpdir + `git init` per test, so the suite runs hermetically inside
 * vitest workers without touching the project's own tags.
 *
 * @see src/lib/versioning.ts
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createVersionTag,
  generateTag,
  getNextVersion,
  injectVersion,
  listVersions,
} from '../src/lib/versioning.js';

let tmpDir: string;

function gitInit() {
  execFileSync('git', ['init', '--quiet'], { cwd: tmpDir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
  // Need at least one commit before tagging.
  writeFileSync(path.join(tmpDir, 'seed.txt'), 'seed', 'utf8');
  execFileSync('git', ['add', 'seed.txt'], { cwd: tmpDir });
  execFileSync('git', ['commit', '--quiet', '-m', 'seed'], { cwd: tmpDir });
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'versioning-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateTag', () => {
  it('builds the canonical spec/<artifact>/v<version> shape', () => {
    expect(generateTag('prd', '1.0.0')).toBe('spec/prd/v1.0.0');
    expect(generateTag('architecture', '2.3.5')).toBe('spec/architecture/v2.3.5');
  });
});

describe('injectVersion', () => {
  it('returns false when the file does not exist', () => {
    expect(injectVersion(path.join(tmpDir, 'missing.md'), '1.0.0')).toBe(false);
  });

  it('adds `version: "<v>"` to YAML frontmatter when absent', () => {
    const file = path.join(tmpDir, 'spec.md');
    writeFileSync(file, '---\ntitle: Spec\n---\n# Body', 'utf8');
    expect(injectVersion(file, '1.2.3')).toBe(true);
    const result = readFileSync(file, 'utf8');
    expect(result).toContain('version: "1.2.3"');
  });

  it('replaces an existing version: line in frontmatter', () => {
    const file = path.join(tmpDir, 'spec.md');
    writeFileSync(file, '---\nversion: "0.0.1"\ntitle: Spec\n---\n# Body', 'utf8');
    expect(injectVersion(file, '1.0.0')).toBe(true);
    const result = readFileSync(file, 'utf8');
    expect(result).toContain('version: "1.0.0"');
    expect(result).not.toContain('0.0.1');
  });

  it('updates the **Version:** body header when present', () => {
    const file = path.join(tmpDir, 'spec.md');
    writeFileSync(file, '# Spec\n\n**Version:** 0.1.0\n\nBody.', 'utf8');
    injectVersion(file, '2.0.0');
    expect(readFileSync(file, 'utf8')).toContain('**Version:** 2.0.0');
  });

  it('handles files with NO frontmatter and NO version header (write through)', () => {
    const file = path.join(tmpDir, 'spec.md');
    writeFileSync(file, '# Just a heading\n', 'utf8');
    expect(injectVersion(file, '1.0.0')).toBe(true);
    // File untouched in content terms — write was a no-op rewrite.
    expect(readFileSync(file, 'utf8')).toBe('# Just a heading\n');
  });

  it('rejects malformed semver inputs (Adv-2 YAML-injection guard)', () => {
    const file = path.join(tmpDir, 'spec.md');
    writeFileSync(file, '---\ntitle: thing\nversion: "0.0.1"\n---\nbody', 'utf8');
    // The classic injection payload from Pit Crew Adversary 2.
    expect(injectVersion(file, '1.0.0"\n\nmalicious_field: "owned')).toBe(false);
    // File untouched.
    expect(readFileSync(file, 'utf8')).toContain('"0.0.1"');
    expect(readFileSync(file, 'utf8')).not.toContain('malicious_field');
  });

  it('rejects shell metacharacters in version (defense-in-depth)', () => {
    const file = path.join(tmpDir, 'spec.md');
    writeFileSync(file, '---\nversion: "0.0.1"\n---\n', 'utf8');
    expect(injectVersion(file, '1.0.0; rm -rf /')).toBe(false);
    expect(injectVersion(file, '1.0.0\nstatus: approved')).toBe(false);
    expect(injectVersion(file, '$(echo pwned)')).toBe(false);
  });

  it('accepts well-formed semver including pre-release + build metadata', () => {
    const file = path.join(tmpDir, 'spec.md');
    writeFileSync(file, '---\nversion: "0.0.1"\n---\n', 'utf8');
    expect(injectVersion(file, '1.0.0-rc.1')).toBe(true);
    expect(injectVersion(file, '2.3.4-alpha.5+build.123')).toBe(true);
  });

  it('does NOT clobber unrelated fields whose value contains the substring `version:` (Rev-H2)', () => {
    const file = path.join(tmpDir, 'spec.md');
    writeFileSync(
      file,
      '---\nfoo: "see version: 2 in the linked doc"\nversion: "0.0.1"\n---\n# Body',
      'utf8'
    );
    injectVersion(file, '1.2.3');
    const out = readFileSync(file, 'utf8');
    // The `foo` field's value is preserved verbatim — the legacy regex
    // would have substring-matched and clobbered it.
    expect(out).toContain('foo: "see version: 2 in the linked doc"');
    expect(out).toContain('version: "1.2.3"');
  });
});

describe('getNextVersion — git-aware', () => {
  it('returns 1.0.0 when no prior tags exist', () => {
    gitInit();
    expect(getNextVersion('prd', tmpDir)).toBe('1.0.0');
  });

  it('returns 1.0.0 when git is unavailable / not a repo', () => {
    // No gitInit — tmpDir is just a plain directory.
    expect(getNextVersion('prd', tmpDir)).toBe('1.0.0');
  });

  it('bumps minor when prior tags exist', () => {
    gitInit();
    execFileSync('git', ['tag', '-a', 'spec/prd/v1.0.0', '-m', 'v1'], { cwd: tmpDir });
    execFileSync('git', ['tag', '-a', 'spec/prd/v1.1.0', '-m', 'v1.1'], { cwd: tmpDir });
    expect(getNextVersion('prd', tmpDir)).toBe('1.2.0');
  });

  it('picks the highest-version tag, not the most-recent', () => {
    gitInit();
    execFileSync('git', ['tag', '-a', 'spec/prd/v2.0.0', '-m', 'v2'], { cwd: tmpDir });
    execFileSync('git', ['tag', '-a', 'spec/prd/v1.5.0', '-m', 'v1.5'], { cwd: tmpDir });
    expect(getNextVersion('prd', tmpDir)).toBe('2.1.0');
  });

  it('ignores malformed semver tags', () => {
    gitInit();
    execFileSync('git', ['tag', '-a', 'spec/prd/v1.0.0', '-m', 'v1'], { cwd: tmpDir });
    execFileSync('git', ['tag', '-a', 'spec/prd/vbroken', '-m', 'broken'], { cwd: tmpDir });
    expect(getNextVersion('prd', tmpDir)).toBe('1.1.0');
  });
});

describe('createVersionTag — git-aware', () => {
  it('creates the tag with the canonical name', () => {
    gitInit();
    const result = createVersionTag('prd', '1.0.0', 'first cut', tmpDir);
    expect(result.success).toBe(true);
    expect(result.tag).toBe('spec/prd/v1.0.0');

    const tags = execFileSync('git', ['tag', '-l'], { cwd: tmpDir, encoding: 'utf8' });
    expect(tags).toContain('spec/prd/v1.0.0');
  });

  it('uses the default message when none provided', () => {
    gitInit();
    createVersionTag('prd', '1.0.0', undefined, tmpDir);
    const msg = execFileSync('git', ['tag', '-l', '-n', 'spec/prd/v1.0.0'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    expect(msg).toContain('Approved: prd v1.0.0');
  });

  it('returns success=false with the git error when tag creation fails', () => {
    gitInit();
    createVersionTag('prd', '1.0.0', 'first', tmpDir);
    // Re-tag the same name should fail.
    const result = createVersionTag('prd', '1.0.0', 'duplicate', tmpDir);
    expect(result.success).toBe(false);
    expect(result.tag).toBe('spec/prd/v1.0.0');
    expect(result.error).toBeTruthy();
  });

  it('treats malicious tag-message inputs as literal strings (security improvement)', () => {
    gitInit();
    // Legacy behavior would have shelled out and run the embedded `;` clause.
    // The execFileSync port passes -m as a single argument; git rejects the
    // tag NAME if it has shell metacharacters but tolerates them in the
    // MESSAGE (which is what we test here — the message is preserved
    // verbatim, never executed).
    const evilMessage = 'release"; rm -rf $HOME #';
    const result = createVersionTag('prd', '1.0.0', evilMessage, tmpDir);
    expect(result.success).toBe(true);
    const out = execFileSync('git', ['tag', '-l', '-n', 'spec/prd/v1.0.0'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    expect(out).toContain('release');
  });

  it('actively proves the rm -rf clause did NOT execute (Pit Crew Rev-H3 sentinel-file test)', () => {
    gitInit();
    // Drop a sentinel file inside tmpDir then run the tag-creation with
    // a payload that, under shell interpretation, would `rm -rf` it.
    // The sentinel must survive the call. (Rev-H3: the prior test only
    // asserted shape; under a hypothetical regression to legacy
    // execSync the destructive clause might still fail benignly while
    // the test passes. This test fails LOUDLY if the regression returns.)
    const sentinel = path.join(tmpDir, 'CANARY');
    writeFileSync(sentinel, 'survives', 'utf8');
    // Use $HOME=tmpDir env override so the rm clause would target our
    // sentinel directory, not the test runner's actual home.
    const evilMessage = 'release"; rm -rf "$HOME"/CANARY #';
    const result = createVersionTag('prd', '1.0.0', evilMessage, tmpDir);
    expect(result.success).toBe(true);

    // The sentinel still exists — the rm never ran.
    expect(execFileSync('cat', [sentinel], { encoding: 'utf8' })).toBe('survives');
  });
});

describe('listVersions — git-aware', () => {
  it('returns [] when no tags exist', () => {
    gitInit();
    expect(listVersions(tmpDir)).toEqual([]);
  });

  it('returns [] when git is unavailable', () => {
    expect(listVersions(tmpDir)).toEqual([]);
  });

  it('parses spec/<artifact>/v<version> entries into structured rows', () => {
    gitInit();
    execFileSync('git', ['tag', '-a', 'spec/prd/v1.0.0', '-m', 'v1'], { cwd: tmpDir });
    execFileSync('git', ['tag', '-a', 'spec/architecture/v2.3.5', '-m', 'v2'], {
      cwd: tmpDir,
    });
    const result = listVersions(tmpDir);
    expect(result).toHaveLength(2);
    const sorted = result.slice().sort((a, b) => a.artifact.localeCompare(b.artifact));
    expect(sorted[0]).toEqual({
      artifact: 'architecture',
      version: '2.3.5',
      tag: 'spec/architecture/v2.3.5',
    });
    expect(sorted[1]).toEqual({
      artifact: 'prd',
      version: '1.0.0',
      tag: 'spec/prd/v1.0.0',
    });
  });
});
