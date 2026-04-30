/**
 * tests/test-scanner.test.ts — Scanner port tests (M11 batch 6).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  countDebtMarkers,
  detectStack,
  identifyRisks,
  scan,
  scanDir,
} from '../src/lib/scanner.js';

let tmpDir: string;
beforeEach(() => { tmpDir = join(tmpdir(), `test-scanner-${Date.now()}`); mkdirSync(tmpDir, { recursive: true }); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('scanDir', () => {
  it('returns empty for nonexistent dir', () => {
    const r = scanDir(join(tmpDir, 'nope'), [], tmpDir);
    expect(r.files).toEqual([]);
    expect(r.dirs).toEqual([]);
  });

  it('finds files in directory', () => {
    writeFileSync(join(tmpDir, 'foo.ts'), '// content');
    const r = scanDir(tmpDir, [], tmpDir);
    expect(r.files).toContain('foo.ts');
  });

  it('skips ignored directories', () => {
    mkdirSync(join(tmpDir, 'node_modules'));
    writeFileSync(join(tmpDir, 'node_modules', 'pkg.js'), '');
    const r = scanDir(tmpDir, ['node_modules'], tmpDir);
    expect(r.files.some(f => f.includes('node_modules'))).toBe(false);
  });

  it('skips dotfiles except .env.example', () => {
    writeFileSync(join(tmpDir, '.env'), 'SECRET=x');
    writeFileSync(join(tmpDir, '.env.example'), 'SECRET=');
    const r = scanDir(tmpDir, [], tmpDir);
    expect(r.files).toContain('.env.example');
    expect(r.files).not.toContain('.env');
  });
});

describe('detectStack', () => {
  it('detects TypeScript from package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: { typescript: '^5.0.0' } }));
    const s = detectStack(tmpDir, ['index.ts']);
    expect(s.language).toBe('TypeScript');
    expect(s.runtime).toBe('Node.js');
  });

  it('detects pnpm from lockfile', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), '');
    const s = detectStack(tmpDir, []);
    expect(s.package_manager).toBe('pnpm');
  });

  it('detects Python from requirements.txt', () => {
    const s = detectStack(tmpDir, ['requirements.txt']);
    expect(s.language).toBe('Python');
  });

  it('detects Go from go.mod', () => {
    const s = detectStack(tmpDir, ['go.mod']);
    expect(s.language).toBe('Go');
  });

  it('handles invalid package.json gracefully', () => {
    writeFileSync(join(tmpDir, 'package.json'), 'not json');
    const s = detectStack(tmpDir, []);
    expect(s.language).toBeNull();
  });
});

describe('countDebtMarkers', () => {
  it('counts TODO markers', () => {
    writeFileSync(join(tmpDir, 'app.ts'), '// TODO: fix this\nconst x = 1; // TODO: cleanup');
    const d = countDebtMarkers(tmpDir, ['app.ts']);
    expect(d.TODO).toBe(2);
  });

  it('counts FIXME markers', () => {
    writeFileSync(join(tmpDir, 'src.js'), '// FIXME: broken');
    const d = countDebtMarkers(tmpDir, ['src.js']);
    expect(d.FIXME).toBe(1);
  });

  it('ignores non-source files', () => {
    writeFileSync(join(tmpDir, 'README.md'), 'TODO: update docs');
    const d = countDebtMarkers(tmpDir, ['README.md']);
    expect(d.TODO).toBe(0);
  });
});

describe('identifyRisks', () => {
  it('identifies no-test risk', () => {
    const risks = identifyRisks(tmpDir, ['src/app.ts'], { runtime: 'Node.js', language: 'TypeScript', language_version: null, runtime_version: null, framework: null, framework_version: null, package_manager: 'npm', test_framework: null, database: null });
    expect(risks.some(r => r.risk.includes('test'))).toBe(true);
  });

  it('identifies .env risk', () => {
    const risks = identifyRisks(tmpDir, ['.env', 'src/app.ts'], { runtime: 'Node.js', language: 'TypeScript', language_version: null, runtime_version: null, framework: null, framework_version: null, package_manager: 'npm', test_framework: null, database: null });
    expect(risks.some(r => r.risk.includes('.env'))).toBe(true);
  });
});

describe('scan', () => {
  it('returns full scan result', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }));
    writeFileSync(join(tmpDir, 'app.test.ts'), 'it("ok", () => {})');
    const r = scan({ root: tmpDir });
    expect(r.scanned_at).toBeTruthy();
    expect(r.stack).toBeTruthy();
    expect(r.stats.files).toBeGreaterThan(0);
  });

  it('uses default ignore list', () => {
    mkdirSync(join(tmpDir, 'dist'));
    writeFileSync(join(tmpDir, 'dist', 'bundle.js'), '');
    const r = scan({ root: tmpDir });
    expect(r.structure.top_level).not.toContain('dist/');
  });

  it('detects test framework from devDeps', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' } }));
    const r = scan({ root: tmpDir });
    expect(r.stack.test_framework).toBe('Vitest');
  });
});
