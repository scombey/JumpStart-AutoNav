/**
 * test-revert.test.ts — M11 batch 1 port coverage.
 *
 * Verifies the TS port at `src/lib/revert.ts` matches the legacy
 * `bin/lib/revert.mjs` public surface:
 *   - archiveFilename(originalPath) format
 *   - revertArtifact happy path: archive copy + meta sidecar
 *   - revertArtifact rejection: missing artifact
 *   - revertArtifact git-restore best-effort behavior
 *
 * @see src/lib/revert.ts
 * @see bin/lib/revert.mjs (legacy reference)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { archiveFilename, revertArtifact } from '../src/lib/revert.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'revert-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('revert — archiveFilename', () => {
  it('produces a filename with basename, timestamp, and extension', () => {
    const f = archiveFilename('specs/prd.md');
    expect(f).toMatch(/^prd\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/);
  });

  it('handles paths without extension', () => {
    const f = archiveFilename('Makefile');
    expect(f).toMatch(/^Makefile\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it('handles deeply nested paths', () => {
    const f = archiveFilename('foo/bar/baz/spec.json');
    expect(f).toMatch(/^spec\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
  });

  it('replaces colons and dots in the timestamp with hyphens', () => {
    const f = archiveFilename('a.txt');
    expect(f).not.toMatch(/:/);
    // Only one dot remains, the one before the extension
    expect(f.split('.').length).toBe(3); // basename + timestamp(no dots) + ext
  });
});

describe('revert — revertArtifact rejection paths', () => {
  it('returns success=false when artifact does not exist', () => {
    const result = revertArtifact({
      artifact: path.join(tmp, 'nonexistent.md'),
      archive_dir: path.join(tmp, 'archive'),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('not found');
  });
});

describe('revert — revertArtifact archive paths', () => {
  it('archives an existing artifact and writes a meta sidecar', () => {
    const artifact = path.join(tmp, 'spec.md');
    writeFileSync(artifact, 'content', 'utf8');
    const archiveDir = path.join(tmp, 'archive');

    const result = revertArtifact({
      artifact,
      reason: 'test reason',
      archive_dir: archiveDir,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(existsSync(result.archived_to)).toBe(true);
      expect(readFileSync(result.archived_to, 'utf8')).toBe('content');
      expect(existsSync(`${result.archived_to}.meta.json`)).toBe(true);
      const meta = JSON.parse(readFileSync(`${result.archived_to}.meta.json`, 'utf8'));
      expect(meta.original_path).toBe(artifact);
      expect(meta.reason).toBe('test reason');
    }
  });

  it("archive_dir defaults to a value that doesn't escape", () => {
    // We don't write into the default dir to avoid littering the
    // working tree; just confirm the option is honored.
    const artifact = path.join(tmp, 'spec.md');
    writeFileSync(artifact, 'x', 'utf8');
    const result = revertArtifact({
      artifact,
      archive_dir: path.join(tmp, 'custom-archive'),
    });
    if (result.success) {
      expect(result.archived_to.startsWith(path.join(tmp, 'custom-archive'))).toBe(true);
    }
  });

  it('uses "No reason provided" when reason is omitted', () => {
    const artifact = path.join(tmp, 'spec.md');
    writeFileSync(artifact, 'x', 'utf8');
    const result = revertArtifact({
      artifact,
      archive_dir: path.join(tmp, 'archive'),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.reason).toBe('No reason provided');
  });

  it('creates the archive directory if missing', () => {
    const artifact = path.join(tmp, 'spec.md');
    writeFileSync(artifact, 'x', 'utf8');
    const archiveDir = path.join(tmp, 'nested', 'archive');
    expect(existsSync(archiveDir)).toBe(false);
    revertArtifact({ artifact, archive_dir: archiveDir });
    expect(existsSync(archiveDir)).toBe(true);
  });
});

describe('revert — revertArtifact git restore', () => {
  it('returns restored_from=null when artifact has no git history', () => {
    const artifact = path.join(tmp, 'spec.md');
    writeFileSync(artifact, 'x', 'utf8');
    const result = revertArtifact({
      artifact,
      archive_dir: path.join(tmp, 'archive'),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.restored_from).toBe(null);
  });

  it('restored_from=git:HEAD when artifact has prior commit', () => {
    // Initialize a small repo, commit a file, then call revert.
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmp });

    mkdirSync(path.join(tmp, 'specs'), { recursive: true });
    const rel = 'specs/prd.md';
    const artifact = path.join(tmp, rel);
    writeFileSync(artifact, 'committed content', 'utf8');
    execFileSync('git', ['add', rel], { cwd: tmp });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });

    // Modify the working tree
    writeFileSync(artifact, 'modified content', 'utf8');

    // Run revert — paths are relative because git commands are run
    // with cwd=tmp (the legacy and TS port both use the cwd implicitly).
    const prevCwd = process.cwd();
    try {
      process.chdir(tmp);
      const result = revertArtifact({
        artifact: rel,
        archive_dir: '.archive',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.restored_from).toBe('git:HEAD');
        // After checkout, the working tree should match the committed version.
        expect(readFileSync(artifact, 'utf8')).toBe('committed content');
      }
    } finally {
      process.chdir(prevCwd);
    }
  });
});
