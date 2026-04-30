/**
 * tests/test-simplicity-gate.test.ts -- vitest suite for src/lib/simplicity-gate.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  EXCLUDED_DIRS,
  countTopLevelDirs,
  extractPlannedDirs,
  check,
} from '../src/lib/simplicity-gate.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplicity-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function mkdir(name: string) {
  const p = path.join(tmpDir, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

// ─── EXCLUDED_DIRS export ────────────────────────────────────────────────────

describe('EXCLUDED_DIRS', () => {
  it('is a Set containing standard excluded directories', () => {
    expect(EXCLUDED_DIRS).toBeInstanceOf(Set);
    expect(EXCLUDED_DIRS.has('node_modules')).toBe(true);
    expect(EXCLUDED_DIRS.has('.git')).toBe(true);
    expect(EXCLUDED_DIRS.has('dist')).toBe(true);
  });
});

// ─── countTopLevelDirs ───────────────────────────────────────────────────────

describe('countTopLevelDirs', () => {
  it('returns 0 for non-existent directory', () => {
    const result = countTopLevelDirs('/nonexistent/dir');
    expect(result.count).toBe(0);
    expect(result.directories).toEqual([]);
  });

  it('counts non-excluded directories', () => {
    mkdir('src');
    mkdir('tests');
    mkdir('node_modules'); // should be excluded
    const result = countTopLevelDirs(tmpDir);
    expect(result.count).toBe(2);
    expect(result.directories).toContain('src');
    expect(result.directories).toContain('tests');
    expect(result.directories).not.toContain('node_modules');
  });

  it('does not count files', () => {
    mkdir('src');
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Readme');
    const result = countTopLevelDirs(tmpDir);
    expect(result.count).toBe(1);
  });

  it('excludes all entries in EXCLUDED_DIRS', () => {
    mkdir('src');
    mkdir('dist'); // excluded
    mkdir('.git'); // excluded
    const result = countTopLevelDirs(tmpDir);
    expect(result.directories).not.toContain('dist');
    expect(result.directories).not.toContain('.git');
    expect(result.count).toBe(1);
  });
});

// ─── extractPlannedDirs ──────────────────────────────────────────────────────

describe('extractPlannedDirs', () => {
  it('returns empty array for content with no structure block', () => {
    expect(extractPlannedDirs('No structure here')).toEqual([]);
  });
});

// ─── check ───────────────────────────────────────────────────────────────────

describe('check', () => {
  it('passes when no options provided (no dirs to count)', () => {
    const result = check({});
    expect(result.passed).toBe(true);
    expect(result.count).toBe(0);
  });

  it('passes when directories are within limit', () => {
    mkdir('src');
    mkdir('tests');
    const result = check({ projectDir: tmpDir, maxDirs: 3 });
    expect(result.passed).toBe(true);
    expect(result.justificationRequired).toBe(false);
  });

  it('fails when directories exceed limit', () => {
    mkdir('src');
    mkdir('tests');
    mkdir('docs-extra');
    mkdir('extra');
    const result = check({ projectDir: tmpDir, maxDirs: 2 });
    expect(result.passed).toBe(false);
    expect(result.justificationRequired).toBe(true);
    expect(result.message).toContain('FAILED');
  });

  it('message uses singular "directory" for count of 1', () => {
    mkdir('src');
    const result = check({ projectDir: tmpDir, maxDirs: 3 });
    expect(result.passed).toBe(true);
    expect(result.message).toContain('1 top-level directory');
  });

  it('message uses plural "directories" for count of 2', () => {
    mkdir('src');
    mkdir('tests');
    const result = check({ projectDir: tmpDir, maxDirs: 5 });
    expect(result.passed).toBe(true);
    expect(result.message).toContain('directories');
  });

  it('default maxDirs is 3', () => {
    mkdir('a');
    mkdir('b');
    mkdir('c');
    mkdir('d');
    const result = check({ projectDir: tmpDir });
    expect(result.passed).toBe(false);
  });

  it('uses archContent when provided', () => {
    const result = check({ archContent: 'No structure block here' });
    expect(result.count).toBe(0);
    expect(result.passed).toBe(true);
  });
});

// ─── pollution-key safety (no JSON state) ───────────────────────────────────

describe('pollution-key safety', () => {
  it('countTopLevelDirs does not crash on __proto__ bytes in path', () => {
    expect(() => countTopLevelDirs(Buffer.from('{"__proto__":{"evil":1}}').toString())).not.toThrow();
  });

  it('extractPlannedDirs does not crash on constructor key in content', () => {
    const content = Buffer.from('{"constructor":{"prototype":{}}} No structure').toString();
    expect(() => extractPlannedDirs(content)).not.toThrow();
  });
});
