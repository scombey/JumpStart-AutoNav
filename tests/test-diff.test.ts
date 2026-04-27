/**
 * test-diff.test.ts — T4.1.5 unit tests for the diff.ts port.
 *
 * @see bin/lib-ts/diff.ts
 * @see bin/lib/diff.js (legacy reference)
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateDiff, unifiedDiff } from '../bin/lib-ts/diff.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'diff-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('unifiedDiff', () => {
  it('emits the standard ---/+++ header with the file path on both sides', () => {
    const out = unifiedDiff('a\n', 'b\n', 'src/foo.ts');
    expect(out).toMatch(/^--- a\/src\/foo\.ts\n\+\+\+ b\/src\/foo\.ts/);
  });

  it('returns just the header when both sides are identical (no hunks)', () => {
    const same = 'unchanged\n';
    const out = unifiedDiff(same, same, 'a.txt');
    expect(out).toBe('--- a/a.txt\n+++ b/a.txt');
  });

  it('marks added lines with + and removed lines with -', () => {
    const out = unifiedDiff('one\ntwo\nthree', 'one\nTWO\nthree', 'a.txt');
    expect(out).toContain('-two');
    expect(out).toContain('+TWO');
  });

  it('emits a hunk header with the right line counts', () => {
    const out = unifiedDiff('a\nb\nc', 'a\nB\nc', 'a.txt');
    expect(out).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });
});

describe('generateDiff — create', () => {
  it('counts lines + builds the /dev/null header diff', () => {
    const result = generateDiff({
      changes: [{ type: 'create', path: 'new.txt', content: 'one\ntwo\nthree' }],
      root: tmpDir,
    });
    expect(result.summary.created).toBe(1);
    expect(result.summary.lines_added).toBe(3);
    expect(result.summary.modified).toBe(0);
    expect(result.summary.deleted).toBe(0);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].diff).toContain('--- /dev/null');
    expect(result.diffs[0].diff).toContain('+++ b/new.txt');
    expect(result.diffs[0].diff).toContain('+one');
    expect(result.diffs[0].diff).toContain('+two');
    expect(result.diffs[0].diff).toContain('+three');
  });

  it('handles empty content (1 line — the empty trailing string from split)', () => {
    const result = generateDiff({
      changes: [{ type: 'create', path: 'empty.txt' }],
      root: tmpDir,
    });
    expect(result.summary.lines_added).toBe(1);
    if (result.diffs[0].type === 'create') {
      expect(result.diffs[0].lines).toBe(1);
    }
  });
});

describe('generateDiff — modify', () => {
  it('uses change.old when provided', () => {
    const result = generateDiff({
      changes: [{ type: 'modify', path: 'a.txt', old: 'one\ntwo', new: 'one\nTWO' }],
      root: tmpDir,
    });
    expect(result.summary.modified).toBe(1);
    expect(result.diffs[0].diff).toContain('-two');
    expect(result.diffs[0].diff).toContain('+TWO');
  });

  it('falls back to reading the current file content when change.old is absent', () => {
    const filePath = path.join(tmpDir, 'a.txt');
    writeFileSync(filePath, 'on disk\nold', 'utf8');
    const result = generateDiff({
      changes: [{ type: 'modify', path: 'a.txt', new: 'on disk\nNEW' }],
      root: tmpDir,
    });
    expect(result.diffs[0].diff).toContain('-old');
    expect(result.diffs[0].diff).toContain('+NEW');
  });

  it('counts net lines added/removed via Math.max(0, ...)', () => {
    const result = generateDiff({
      changes: [
        {
          type: 'modify',
          path: 'a.txt',
          old: 'one\ntwo\nthree\nfour\nfive',
          new: 'one\nTWO\nFIVE',
        },
      ],
      root: tmpDir,
    });
    expect(result.summary.lines_added).toBe(0);
    expect(result.summary.lines_removed).toBe(2);
  });

  it('falls back to change.content when change.new is absent', () => {
    const result = generateDiff({
      changes: [{ type: 'modify', path: 'a.txt', old: 'old', content: 'new-via-content' }],
      root: tmpDir,
    });
    expect(result.diffs[0].diff).toContain('+new-via-content');
  });
});

describe('generateDiff — delete', () => {
  it('builds the dev/null right-side header diff with every line prefixed -', () => {
    const filePath = path.join(tmpDir, 'gone.txt');
    writeFileSync(filePath, 'a\nb\nc', 'utf8');
    const result = generateDiff({
      changes: [{ type: 'delete', path: 'gone.txt' }],
      root: tmpDir,
    });
    expect(result.summary.deleted).toBe(1);
    expect(result.summary.lines_removed).toBe(3);
    expect(result.diffs[0].diff).toContain('--- a/gone.txt');
    expect(result.diffs[0].diff).toContain('+++ /dev/null');
    expect(result.diffs[0].diff).toContain('-a');
    expect(result.diffs[0].diff).toContain('-b');
    expect(result.diffs[0].diff).toContain('-c');
  });

  it('handles deletion of a non-existent file gracefully', () => {
    const result = generateDiff({
      changes: [{ type: 'delete', path: 'never-existed.txt' }],
      root: tmpDir,
    });
    expect(result.summary.deleted).toBe(1);
    if (result.diffs[0].type === 'delete') {
      expect(result.diffs[0].lines).toBe(1); // empty string splits to one empty line
    }
  });
});

describe('generateDiff — aggregate', () => {
  it('joins per-change diffs into a single patch string', () => {
    const result = generateDiff({
      changes: [
        { type: 'create', path: 'a.txt', content: 'a' },
        { type: 'create', path: 'b.txt', content: 'b' },
      ],
      root: tmpDir,
    });
    expect(result.patch).toContain('+a');
    expect(result.patch).toContain('+b');
    expect(result.patch.split('\n\n')).toHaveLength(2);
  });

  it('reports total_changes equal to the input array length', () => {
    const result = generateDiff({
      changes: [
        { type: 'create', path: 'a.txt', content: 'a' },
        { type: 'modify', path: 'b.txt', old: 'old', new: 'new' },
        { type: 'delete', path: 'c.txt' },
      ],
      root: tmpDir,
    });
    expect(result.total_changes).toBe(3);
    expect(result.summary).toEqual({
      created: 1,
      modified: 1,
      deleted: 1,
      lines_added: 1,
      lines_removed: 1,
    });
  });

  it('returns a zero-summary for empty changes input', () => {
    const result = generateDiff({});
    expect(result.summary).toEqual({
      created: 0,
      modified: 0,
      deleted: 0,
      lines_added: 0,
      lines_removed: 0,
    });
    expect(result.diffs).toEqual([]);
    expect(result.patch).toBe('');
    expect(result.total_changes).toBe(0);
  });
});
