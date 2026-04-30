/**
 * tests/test-spec-comments.test.ts — Spec Comments port tests (M11 batch 6).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addComment,
  assignComment,
  COMMENT_STATUSES,
  defaultState,
  listComments,
  loadState,
  resolveComment,
} from '../src/lib/spec-comments.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `test-speccomm-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('defaultState', () => {
  it('returns empty comments array', () => {
    const s = defaultState();
    expect(s.comments).toEqual([]);
  });
});

describe('loadState', () => {
  it('returns defaultState for missing file', () => {
    const s = loadState(join(tmpDir, 'missing.json'));
    expect(s.comments).toEqual([]);
  });

  it('returns defaultState for invalid JSON', () => {
    const f = join(tmpDir, 'bad.json');
    writeFileSync(f, '{{}}');
    const s = loadState(f);
    expect(s.comments).toEqual([]);
  });

  it('rejects __proto__ pollution key', () => {
    const f = join(tmpDir, 'polluted.json');
    writeFileSync(
      f,
      '{"__proto__":{"evil":true},"version":"1.0.0","created_at":"2024-01-01T00:00:00.000Z","last_updated":null,"comments":[]}'
    );
    const s = loadState(f);
    expect(s.comments).toEqual([]);
  });

  it('rejects prototype pollution key', () => {
    const f = join(tmpDir, 'polluted2.json');
    writeFileSync(
      f,
      '{"prototype":{},"version":"1.0.0","created_at":"2024-01-01T00:00:00.000Z","last_updated":null,"comments":[]}'
    );
    const s = loadState(f);
    expect(s.comments).toEqual([]);
  });
});

describe('addComment', () => {
  it('requires artifact and text', () => {
    const f = join(tmpDir, 's.json');
    const r = addComment('', null, '', { stateFile: f });
    expect(r.success).toBe(false);
  });

  it('creates a comment', () => {
    const f = join(tmpDir, 's.json');
    const r = addComment('specs/prd.md', 'Section 1', 'Review needed', { stateFile: f });
    expect(r.success).toBe(true);
    expect(r.comment?.id).toMatch(/^C-/);
    expect(r.comment?.status).toBe('open');
  });

  it('persists to state', () => {
    const f = join(tmpDir, 's.json');
    addComment('prd.md', null, 'First comment', { stateFile: f });
    const s = loadState(f);
    expect(s.comments.length).toBe(1);
  });
});

describe('resolveComment', () => {
  it('requires commentId', () => {
    const f = join(tmpDir, 's.json');
    const r = resolveComment('', undefined, { stateFile: f });
    expect(r.success).toBe(false);
  });

  it('returns error for nonexistent comment', () => {
    const f = join(tmpDir, 's.json');
    const r = resolveComment('C-999', undefined, { stateFile: f });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not found/);
  });

  it('resolves an existing comment', () => {
    const f = join(tmpDir, 's.json');
    const added = addComment('prd.md', null, 'Fix this', { stateFile: f });
    const id = added.comment?.id ?? '';
    const resolved = resolveComment(id, 'Fixed it', { stateFile: f });
    expect(resolved.success).toBe(true);
    expect(resolved.comment?.status).toBe('resolved');
    expect(resolved.comment?.resolution).toBe('Fixed it');
  });
});

describe('listComments', () => {
  it('returns all comments when no filter', () => {
    const f = join(tmpDir, 's.json');
    addComment('a.md', null, 'c1', { stateFile: f });
    addComment('b.md', null, 'c2', { stateFile: f });
    const r = listComments({ stateFile: f });
    expect(r.total).toBe(2);
  });

  it('filters by artifact', () => {
    const f = join(tmpDir, 's.json');
    addComment('a.md', null, 'c1', { stateFile: f });
    addComment('b.md', null, 'c2', { stateFile: f });
    const r = listComments({ stateFile: f, artifact: 'a.md' });
    expect(r.total).toBe(1);
  });

  it('filters by status', () => {
    const f = join(tmpDir, 's.json');
    const added = addComment('a.md', null, 'c1', { stateFile: f });
    resolveComment(added.comment?.id ?? '', 'done', { stateFile: f });
    const r = listComments({ stateFile: f, status: 'resolved' });
    expect(r.total).toBe(1);
  });
});

describe('assignComment', () => {
  it('requires commentId and assignee', () => {
    const f = join(tmpDir, 's.json');
    const r = assignComment('', '', { stateFile: f });
    expect(r.success).toBe(false);
  });

  it('assigns comment to reviewer', () => {
    const f = join(tmpDir, 's.json');
    const added = addComment('prd.md', null, 'review needed', { stateFile: f });
    const r = assignComment(added.comment?.id ?? '', 'alice', { stateFile: f });
    expect(r.success).toBe(true);
    expect(r.comment?.assignee).toBe('alice');
  });
});

describe('COMMENT_STATUSES', () => {
  it('includes open and resolved', () => {
    expect(COMMENT_STATUSES).toContain('open');
    expect(COMMENT_STATUSES).toContain('resolved');
  });
});
