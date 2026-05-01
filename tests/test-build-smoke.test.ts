/**
 * test-build-smoke.test.ts — tsdown build pipeline acceptance gate.
 *
 * Asserts the build emits the load-bearing artifacts that npm consumers
 * receive when they install the published tarball:
 *
 *   1. `dist/cli/bin.mjs` with the shebang preserved (npm-bin entry).
 *   2. `dist/cli/main.mjs` (citty dispatcher) with `.d.mts` + `.mjs.map`.
 *   3. A representative library module — `dist/lib/io.ts` — round-trips
 *      through the build (proves source → emit → import works for the
 *      `./lib/*` exports map).
 *
 * @see specs/decisions/adr-001-build-tool.md
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');

function exists(rel: string): boolean {
  return fs.existsSync(path.join(distDir, rel));
}

describe('build smoke (tsdown emit pipeline)', () => {
  beforeAll(() => {
    // execFileSync (not execSync) avoids shell interpolation — safe per
    // the codebase's child_process pattern guidance.
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

  it('emits dist/lib/io.mjs + d.mts + sourcemap (representative lib module)', () => {
    expect(exists('lib/io.mjs')).toBe(true);
    expect(exists('lib/io.d.mts')).toBe(true);
    expect(exists('lib/io.mjs.map')).toBe(true);
  });

  it('lib type declarations include the public surface', () => {
    const dts = fs.readFileSync(path.join(distDir, 'lib/io.d.mts'), 'utf8');
    expect(dts).toContain('writeResult');
    expect(dts).toContain('writeError');
  });

  it('compiled output is importable and round-trips through the build', async () => {
    const built = await import(path.join(distDir, 'lib/io.mjs'));
    expect(typeof built.writeResult).toBe('function');
    expect(typeof built.writeError).toBe('function');
  });
});
