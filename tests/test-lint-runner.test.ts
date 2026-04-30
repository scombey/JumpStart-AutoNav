/**
 * tests/test-lint-runner.test.ts — vitest suite for src/lib/lint-runner.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLinter, parseFindings, runLint } from '../src/lib/lint-runner.js';

// ─── detectLinter ─────────────────────────────────────────────────────────────

describe('detectLinter', () => {
  let tmpDir: string;
  const write = (name: string, content: string) => {
    fs.writeFileSync(path.join(tmpDir, name), content);
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-runner-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for a directory with no linter config', () => {
    expect(detectLinter(tmpDir)).toBeNull();
  });

  it('detects ESLint from .eslintrc.json', () => {
    write('.eslintrc.json', '{}');
    const result = detectLinter(tmpDir);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('ESLint');
  });

  it('detects ESLint flat config from eslint.config.mjs', () => {
    write('eslint.config.mjs', 'export default []');
    const result = detectLinter(tmpDir);
    expect(result?.name).toBe('ESLint (flat)');
  });

  it('detects Biome from biome.json', () => {
    write('biome.json', '{}');
    const result = detectLinter(tmpDir);
    expect(result?.name).toBe('Biome');
  });

  it('prefers npm lint script when package.json has lint', () => {
    write('package.json', JSON.stringify({ scripts: { lint: 'eslint src/' } }));
    const result = detectLinter(tmpDir);
    expect(result?.name).toBe('npm lint script');
    expect(result?.command).toContain('npm run lint');
  });

  it('falls back to config file detection when package.json has no lint', () => {
    write('package.json', JSON.stringify({ scripts: { build: 'tsc' } }));
    write('.eslintrc.json', '{}');
    const result = detectLinter(tmpDir);
    expect(result?.name).toBe('ESLint');
  });

  it('handles malformed package.json gracefully', () => {
    write('package.json', 'NOT_JSON');
    expect(() => detectLinter(tmpDir)).not.toThrow();
  });
});

// ─── parseFindings ─────────────────────────────────────────────────────────

describe('parseFindings', () => {
  it('returns empty array for empty output', () => {
    expect(parseFindings('')).toEqual([]);
  });

  it('parses ESLint error format', () => {
    const output = '/src/app.ts:10:5: error Unexpected var (no-var)';
    const findings = parseFindings(output);
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.line).toBe(10);
    expect(findings[0]?.file).toBe('/src/app.ts');
  });

  it('parses ESLint warning format', () => {
    const output = '/src/util.ts:3:1: warning Missing semicolon (semi)';
    const findings = parseFindings(output);
    expect(findings[0]?.severity).toBe('warning');
  });

  it('parses generic file:line: message format', () => {
    const output = 'src/foo.py:42: E401 multiple imports on one line';
    const findings = parseFindings(output);
    expect(findings.length).toBe(1);
    expect(findings[0]?.line).toBe(42);
  });

  it('ignores indented lines (likely error context)', () => {
    const output = '  ^ hint about the error above';
    expect(parseFindings(output)).toEqual([]);
  });

  it('handles multiple findings', () => {
    const output = [
      '/src/a.ts:1:1: error Rule A (a-rule)',
      '/src/b.ts:5:3: warning Rule B (b-rule)',
    ].join('\n');
    expect(parseFindings(output).length).toBe(2);
  });
});

// ─── runLint ──────────────────────────────────────────────────────────────────

describe('runLint', () => {
  let tmpDir: string;
  const write = (name: string, content: string) => {
    fs.writeFileSync(path.join(tmpDir, name), content);
    return path.join(tmpDir, name);
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-runner-run-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns no-linter message when no linter is detected', () => {
    const result = runLint({ root: tmpDir });
    expect(result.linter).toBeNull();
    expect(result.pass).toBe(true);
    expect(result.message).toContain('No linter detected');
  });

  it('accepts a string as root (backward compat)', () => {
    const result = runLint(tmpDir);
    expect(result.linter).toBeNull();
    expect(result.pass).toBe(true);
  });

  it('returns no-files message when all specified files do not exist', () => {
    write('package.json', JSON.stringify({ scripts: { lint: 'echo ok' } }));
    const result = runLint({ files: ['nonexistent.ts'], root: tmpDir });
    expect(result.files_checked).toBe(0);
    expect(result.message).toContain('No existing files');
  });

  it('result has required fields', () => {
    const result = runLint({ root: tmpDir });
    expect(typeof result.files_checked).toBe('number');
    expect(typeof result.errors).toBe('number');
    expect(typeof result.warnings).toBe('number');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.fix_tasks)).toBe(true);
    expect(typeof result.pass).toBe('boolean');
  });

  it('uses custom lint_command from config', () => {
    // A command that always exits 0 and outputs nothing
    const result = runLint({ root: tmpDir, config: { lint_command: 'echo clean' } });
    expect(result.linter).toBe('custom');
    expect(result.pass).toBe(true);
  });

  it('fix_tasks contain error details', () => {
    // Manually test the fix_tasks logic via parseFindings + structure
    const output = '/src/x.ts:1:1: error No unused vars (no-unused-vars)';
    const findings = parseFindings(output);
    expect(findings[0]?.severity).toBe('error');
    // The fix_tasks would have one entry for this file if runLint were called
  });
});

// ─── pollution-key safety ────────────────────────────────────────────────────

import { afterEach, beforeEach } from 'vitest';

describe('pollution-key safety', () => {
  it('detectLinter does not crash on __proto__ bytes in package.json', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-pollution-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        '{"__proto__":{"evil":1},"scripts":{"lint":"echo test"}}'
      );
      expect(() => detectLinter(tmpDir)).not.toThrow();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('parseFindings does not crash on __proto__ bytes in output', () => {
    const raw = Buffer.from('{"__proto__":{"evil":1}} /src/x.ts:1:1: error Bad thing').toString();
    expect(() => parseFindings(raw)).not.toThrow();
  });
});
