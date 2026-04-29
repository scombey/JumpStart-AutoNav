/**
 * test-build-smoke.test.ts — T2.1 / M9 acceptance gate.
 *
 * Asserts the tsdown build pipeline produces, for the post-M9 layout
 * (rootDir = src/, dist tree mirrors the source tree minus that prefix):
 *   1. CLI runner (dist/cli/bin.mjs) with shebang preserved
 *   2. CLI dispatcher (dist/cli/main.mjs) with .d.mts + sourcemap
 *   3. Smoke library module (dist/lib/_smoke.mjs) with .d.mts + sourcemap
 *   4. Importable + executable output that round-trips through the build
 *
 * @see specs/decisions/adr-001-build-tool.md
 * @see specs/implementation-plan.md T2.1, T5.1 (M9 cutover)
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// We resolve paths from `process.cwd()` rather than `import.meta.url` because
// vitest always launches from the repo root, so `process.cwd()` is a sound
// substitute and works whether the test is type-checked under NodeNext-CJS
// (pre-M9) or NodeNext-ESM (post-M9).
const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');

function exists(rel: string): boolean {
  return fs.existsSync(path.join(distDir, rel));
}

describe('build smoke (T2.1 / M9 acceptance gate)', () => {
  beforeAll(() => {
    // execFileSync (not execSync) avoids shell interpolation — safe per the
    // codebase's child_process pattern guidance.
    execFileSync('npx', ['tsdown'], { cwd: repoRoot, stdio: 'pipe' });
  }, 60_000);

  it('emits dist/cli/bin.mjs with shebang preserved', () => {
    expect(exists('cli/bin.mjs')).toBe(true);
    const compiled = fs.readFileSync(path.join(distDir, 'cli/bin.mjs'), 'utf8');
    expect(compiled.startsWith('#!')).toBe(true);
  });

  it('emits dist/cli/main.mjs (citty dispatcher) + d.mts + sourcemap', () => {
    expect(exists('cli/main.mjs')).toBe(true);
    expect(exists('cli/main.d.mts')).toBe(true);
    expect(exists('cli/main.mjs.map')).toBe(true);
  });

  it('emits dist/lib/_smoke.mjs (compiled ES module)', () => {
    expect(exists('lib/_smoke.mjs')).toBe(true);
  });

  it('emits dist/lib/_smoke.d.mts (type declarations)', () => {
    expect(exists('lib/_smoke.d.mts')).toBe(true);
    const dts = fs.readFileSync(path.join(distDir, 'lib/_smoke.d.mts'), 'utf8');
    expect(dts).toContain('smokeIdentity');
    expect(dts).toContain('strictCheck');
  });

  it('emits dist/lib/_smoke.mjs.map source map', () => {
    expect(exists('lib/_smoke.mjs.map')).toBe(true);
  });

  it('compiled output is importable + behaves identically to source', async () => {
    const built = await import(path.join(distDir, 'lib/_smoke.mjs'));
    const id = built.smokeIdentity();
    expect(id).toEqual({ phase: 'strangler-ts', version: 1 });
    expect(built.strictCheck({ alpha: 1 })).toBe('alpha');
  });
});
