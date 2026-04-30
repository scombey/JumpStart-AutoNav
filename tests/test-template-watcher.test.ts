/**
 * tests/test-template-watcher.test.ts -- vitest suite for src/lib/template-watcher.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSnapshot,
  checkForChanges,
  compareSnapshots,
  fileHash,
  loadSnapshot,
  saveSnapshot,
  templateToSpec,
} from '../src/lib/template-watcher.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;
let templatesDir: string;
let snapshotPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
  templatesDir = path.join(tmpDir, 'templates');
  fs.mkdirSync(templatesDir);
  snapshotPath = path.join(tmpDir, 'snapshot.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTemplate(name: string, content: string) {
  fs.writeFileSync(path.join(templatesDir, name), content, 'utf8');
}

// ─── fileHash ────────────────────────────────────────────────────────────────

describe('fileHash', () => {
  it('returns a hex SHA-256 hash', () => {
    const fp = path.join(tmpDir, 'test.md');
    fs.writeFileSync(fp, 'hello world', 'utf8');
    const hash = fileHash(fp);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different content produces different hash', () => {
    const fp1 = path.join(tmpDir, 'a.md');
    const fp2 = path.join(tmpDir, 'b.md');
    fs.writeFileSync(fp1, 'content A', 'utf8');
    fs.writeFileSync(fp2, 'content B', 'utf8');
    expect(fileHash(fp1)).not.toBe(fileHash(fp2));
  });
});

// ─── buildSnapshot ───────────────────────────────────────────────────────────

describe('buildSnapshot', () => {
  it('returns empty object for non-existent directory', () => {
    expect(buildSnapshot('/nonexistent/dir')).toEqual({});
  });

  it('returns empty object for empty templates directory', () => {
    expect(buildSnapshot(templatesDir)).toEqual({});
  });

  it('includes md files with their hashes', () => {
    writeTemplate('prd.md', '# PRD');
    const snapshot = buildSnapshot(templatesDir);
    expect(Object.keys(snapshot)).toContain('prd.md');
    expect(typeof snapshot['prd.md']).toBe('string');
  });

  it('skips non-markdown files', () => {
    fs.writeFileSync(path.join(templatesDir, 'notes.txt'), 'notes');
    const snapshot = buildSnapshot(templatesDir);
    expect(Object.keys(snapshot)).not.toContain('notes.txt');
  });
});

// ─── loadSnapshot / saveSnapshot ─────────────────────────────────────────────

describe('loadSnapshot / saveSnapshot', () => {
  it('loadSnapshot returns null when file does not exist', () => {
    expect(loadSnapshot('/nonexistent/snap.json')).toBeNull();
  });

  it('round-trips through save/load', () => {
    const snap = { 'prd.md': 'abc123', 'arch.md': 'def456' };
    saveSnapshot(snapshotPath, snap);
    const loaded = loadSnapshot(snapshotPath);
    expect(loaded).toEqual(snap);
  });

  it('returns null for malformed JSON', () => {
    fs.writeFileSync(snapshotPath, 'NOT_JSON', 'utf8');
    expect(loadSnapshot(snapshotPath)).toBeNull();
  });

  it('returns null when snapshot contains __proto__ key', () => {
    fs.writeFileSync(snapshotPath, '{"__proto__":{"evil":1},"prd.md":"abc"}', 'utf8');
    expect(loadSnapshot(snapshotPath)).toBeNull();
  });

  it('returns null when snapshot contains constructor key', () => {
    fs.writeFileSync(snapshotPath, '{"constructor":{"prototype":{}},"prd.md":"abc"}', 'utf8');
    expect(loadSnapshot(snapshotPath)).toBeNull();
  });
});

// ─── compareSnapshots ────────────────────────────────────────────────────────

describe('compareSnapshots', () => {
  it('detects added files', () => {
    const prev = { 'a.md': 'hash1' };
    const curr = { 'a.md': 'hash1', 'b.md': 'hash2' };
    const changes = compareSnapshots(prev, curr);
    expect(changes.added).toContain('b.md');
    expect(changes.modified).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it('detects modified files', () => {
    const prev = { 'a.md': 'hash1' };
    const curr = { 'a.md': 'hash2' };
    const changes = compareSnapshots(prev, curr);
    expect(changes.modified).toContain('a.md');
  });

  it('detects removed files', () => {
    const prev = { 'a.md': 'hash1', 'b.md': 'hash2' };
    const curr = { 'a.md': 'hash1' };
    const changes = compareSnapshots(prev, curr);
    expect(changes.removed).toContain('b.md');
  });

  it('returns empty changes for identical snapshots', () => {
    const snap = { 'a.md': 'hash1' };
    const changes = compareSnapshots(snap, snap);
    expect(changes.added).toEqual([]);
    expect(changes.modified).toEqual([]);
    expect(changes.removed).toEqual([]);
  });
});

// ─── templateToSpec ──────────────────────────────────────────────────────────

describe('templateToSpec', () => {
  it('maps prd.md to specs/prd.md', () => {
    expect(templateToSpec('prd.md')).toBe('specs/prd.md');
  });

  it('maps unknown template to specs/<name>', () => {
    expect(templateToSpec('custom.md')).toBe('specs/custom.md');
  });
});

// ─── checkForChanges ─────────────────────────────────────────────────────────

describe('checkForChanges', () => {
  it('returns changed:false on first run (creates baseline)', () => {
    writeTemplate('prd.md', '# PRD');
    const result = checkForChanges(templatesDir, snapshotPath);
    expect(result.changed).toBe(false);
    expect(fs.existsSync(snapshotPath)).toBe(true);
  });

  it('detects modifications on second run', () => {
    writeTemplate('prd.md', '# PRD original');
    checkForChanges(templatesDir, snapshotPath); // first run -- baseline
    // Modify the template
    writeTemplate('prd.md', '# PRD updated');
    const result = checkForChanges(templatesDir, snapshotPath);
    expect(result.changed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('includes warning text about spec regeneration for modified template', () => {
    writeTemplate('prd.md', '# PRD original');
    checkForChanges(templatesDir, snapshotPath);
    writeTemplate('prd.md', '# PRD updated');
    const result = checkForChanges(templatesDir, snapshotPath);
    expect(result.warnings.some((w) => w.includes('prd.md'))).toBe(true);
  });
});
