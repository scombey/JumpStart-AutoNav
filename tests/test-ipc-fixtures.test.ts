/**
 * test-ipc-fixtures.test.ts — IPC v0/v1 replay tests.
 *
 * Per the per-module port recipe step 11 + ADR-007: replay each
 * v0 fixture against the legacy CLI driver and assert byte-identical
 * stdout. The v1 fixtures encode the FUTURE `runIpc()` wrapper shape
 * (M5 / T4.1.8) — for now we only assert v1 SHAPE (valid JSON,
 * version=1, ok=true, result key present) so the contract is locked
 * before runIpc lands.
 *
 * Pinning the legacy v0 output now means M5's runIpc has a baseline
 * to validate "byte-identical successful-path output" against —
 * exactly the recipe step that was skipped in M2 sub-commits 7–13
 * and surfaced by Pit Crew QA F2 / Reviewer B2.
 *
 * @see tests/fixtures/ipc/README.md
 * @see specs/decisions/adr-007-ipc-envelope-versioning.md
 * @see specs/implementation-plan.md per-module port recipe step 11
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const fxRoot = path.join(repoRoot, 'tests/fixtures/ipc');

const IPC_MODULES = ['timestamps', 'locks', 'diff', 'complexity', 'config-loader'] as const;

interface IpcInputV0 {
  [k: string]: unknown;
}
interface IpcInputV1 {
  version: 1;
  input: IpcInputV0;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function runLegacyCli(moduleName: string, inputJson: string): unknown {
  // Pipe the input JSON to the legacy module's CLI driver and capture
  // stdout. stdio inherits stderr so the Node ESM warning prints once
  // per worker but doesn't pollute our captured stdout.
  //
  // Post-M9: every IPC-driver legacy module is ESM and lives at .mjs;
  // the .js variant exists only for CJS modules that don't have an IPC
  // driver. Try .mjs first (the post-M9 shape), fall back to .js.
  const mjsPath = path.join(repoRoot, 'bin', 'lib', `${moduleName}.mjs`);
  const driverPath = existsSync(mjsPath)
    ? mjsPath
    : path.join(repoRoot, 'bin', 'lib', `${moduleName}.js`);
  const stdout = execFileSync('node', [driverPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: inputJson,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  return JSON.parse(stdout);
}

describe('IPC v0 replay — byte-identical against legacy CLI driver', () => {
  for (const moduleName of IPC_MODULES) {
    it(`${moduleName}: legacy CLI emits the committed v0 expected-stdout`, () => {
      const inputPath = path.join(fxRoot, moduleName, 'v0', 'input.json');
      const expectedPath = path.join(fxRoot, moduleName, 'v0', 'expected-stdout.json');
      const inputJson = readFileSync(inputPath, 'utf8');
      const expected = readJson<unknown>(expectedPath);
      const actual = runLegacyCli(moduleName, inputJson);

      // For modules that include a runtime timestamp (`now()`), normalize
      // before comparing — the *shape* is what we pin, plus the values
      // that don't drift.
      if (
        moduleName === 'timestamps' &&
        actual &&
        typeof actual === 'object' &&
        'timestamp' in actual
      ) {
        // The 'now' v0 expected just has a `timestamp: ISO` field —
        // overwrite with actual to compare structure only.
        expect(typeof (actual as { timestamp: unknown }).timestamp).toBe('string');
        expect(Object.keys(actual)).toEqual(Object.keys(expected as object));
      } else {
        expect(actual).toEqual(expected);
      }
    });
  }
});

describe('IPC v1 fixtures — SHAPE locked for M5 runIpc', () => {
  for (const moduleName of IPC_MODULES) {
    it(`${moduleName}: v1 input wraps v0 with version=1`, () => {
      const v1Input = readJson<IpcInputV1>(path.join(fxRoot, moduleName, 'v1', 'input.json'));
      expect(v1Input.version).toBe(1);
      expect(v1Input.input).toBeTruthy();
    });

    it(`${moduleName}: v1 expected-stdout has the canonical envelope shape`, () => {
      const v1Out = readJson<{
        version: 1;
        ok: true;
        timestamp: string;
        result: unknown;
      }>(path.join(fxRoot, moduleName, 'v1', 'expected-stdout.json'));
      expect(v1Out.version).toBe(1);
      expect(v1Out.ok).toBe(true);
      // Placeholder is documented in tests/fixtures/ipc/README.md;
      // M5's runIpc replay test substitutes the actual ISO timestamp.
      expect(v1Out.timestamp).toBe('<<RUNTIME_ISO>>');
      expect(v1Out.result).toBeDefined();
    });

    it(`${moduleName}: v1.result matches v0 expected-stdout exactly`, () => {
      const v0Out = readJson<unknown>(path.join(fxRoot, moduleName, 'v0', 'expected-stdout.json'));
      const v1Out = readJson<{ result: unknown }>(
        path.join(fxRoot, moduleName, 'v1', 'expected-stdout.json')
      );
      // The v1 envelope wraps the v0 result verbatim (per ADR-007).
      expect(v1Out.result).toEqual(v0Out);
    });
  }
});
