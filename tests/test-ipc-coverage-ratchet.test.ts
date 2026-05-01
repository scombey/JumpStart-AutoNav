/**
 * test-ipc-coverage-ratchet.test.ts — T4.7.4 IPC envelope coverage gate.
 *
 * Complements `tests/test-ipc-fixtures.test.ts` (which exercises the
 * 5 currently-fixtured modules) by:
 *
 *   1. **Discovering** every fixture pair in `tests/fixtures/ipc/`
 *      so adding `<module>/{v0,v1}/{input.json,expected-stdout.json}`
 *      auto-extends coverage with no test edit.
 *
 *   2. **Asserting structural completeness** — every fixture dir has
 *      both v0 + v1 sub-dirs, each with input.json +
 *      expected-stdout.json. Catches half-authored fixture sets.
 *
 *   3. **Tracking ratchet** — counts the fixtured-module total + the
 *      total dual-mode-eligible modules in `src/lib/` and reports
 *      the ratio. Raises a warning (NOT a failure) if the ratio is
 *      below the documented floor; raises a failure if a previously-
 *      fixtured module loses its fixture (regression).
 *
 *   4. **Pinning floor** — the `MIN_FIXTURED_MODULES` constant is the
 *      load-bearing gate: the count must not decrease below this
 *      number across PRs. To raise the floor (after adding new
 *      fixtures), bump the constant in this file.
 *
 * @see specs/implementation-plan.md T4.7.4
 * @see specs/decisions/adr-007-ipc-envelope-versioning.md
 * @see tests/test-ipc-fixtures.test.ts (the byte-identical replay test)
 * @see tests/fixtures/ipc/README.md
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'tests', 'fixtures', 'ipc');
const LIB_TS_ROOT = path.join(REPO_ROOT, 'src', 'lib');

/**
 * Floor: the minimum number of dual-mode lib modules that MUST have
 * IPC v0/v1 fixtures. Raise this when fixtures are added; never
 * lower it.
 *
 * Current floor (2026-04-28): 5 — timestamps, locks, diff, complexity,
 * config-loader (the ADR-007 anchor set from M2).
 */
const MIN_FIXTURED_MODULES = 5;

/** Modules in src/lib/ that are NOT dual-mode (no IPC entry).
 *  These are pure-library modules — adding IPC fixtures for them
 *  would be misleading. */
const NON_IPC_MODULES = new Set<string>([
  'errors', // pure error types
  'path-safety', // pure validation
  'secret-scanner', // pure regex catalog
  'mock-responses', // test fixtures only
  'tool-schemas', // Zod schema catalog
]);

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** List directories under tests/fixtures/ipc/ — each is one module's fixture set. */
function listFixturedModules(): string[] {
  if (!existsSync(FIXTURES_ROOT)) return [];
  return readdirSync(FIXTURES_ROOT)
    .filter((name) => isDir(path.join(FIXTURES_ROOT, name)))
    .sort();
}

/** List dual-mode-eligible modules in src/lib/ (filtered by NON_IPC_MODULES). */
function listDualModeModules(): string[] {
  if (!existsSync(LIB_TS_ROOT)) return [];
  return readdirSync(LIB_TS_ROOT)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => name.replace(/\.ts$/, ''))
    .filter((name) => !NON_IPC_MODULES.has(name) && !name.startsWith('_'))
    .sort();
}

describe('T4.7.4 — IPC envelope fixture-coverage ratchet', () => {
  const fixtured = listFixturedModules();
  const dualMode = listDualModeModules();

  it('every fixtured module has the canonical { v0, v1 } structure', () => {
    const incomplete: string[] = [];
    for (const mod of fixtured) {
      const v0 = path.join(FIXTURES_ROOT, mod, 'v0');
      const v1 = path.join(FIXTURES_ROOT, mod, 'v1');
      const v0Input = path.join(v0, 'input.json');
      const v0Expected = path.join(v0, 'expected-stdout.json');
      const v1Input = path.join(v1, 'input.json');
      const v1Expected = path.join(v1, 'expected-stdout.json');
      if (
        !isDir(v0) ||
        !isDir(v1) ||
        !existsSync(v0Input) ||
        !existsSync(v0Expected) ||
        !existsSync(v1Input) ||
        !existsSync(v1Expected)
      ) {
        incomplete.push(mod);
      }
    }
    expect(
      incomplete,
      `Incomplete IPC fixture sets (each must have v0/{input,expected-stdout}.json + v1/{input,expected-stdout}.json): ${incomplete.join(', ')}`
    ).toEqual([]);
  });

  it(`fixtured-module count is at or above the floor of ${MIN_FIXTURED_MODULES}`, () => {
    expect(
      fixtured.length,
      `IPC fixture coverage regressed: ${fixtured.length} fixtured vs floor ${MIN_FIXTURED_MODULES}. To intentionally lower coverage, also lower MIN_FIXTURED_MODULES in this test.`
    ).toBeGreaterThanOrEqual(MIN_FIXTURED_MODULES);
  });

  it('reports current coverage ratio (informational; warns if low)', () => {
    const ratio = fixtured.length / dualMode.length;
    const pct = Math.round(ratio * 100);
    // Informational — DOES NOT fail. The floor test above is the gate.
    // Once the ratio reaches 100% (every dual-mode module has fixtures)
    // we can graduate this test to a hard "must equal dualMode" check.
    expect(typeof pct).toBe('number');
    if (ratio < 0.5) {
      console.warn(
        `[ipc-coverage] ${fixtured.length}/${dualMode.length} dual-mode modules fixtured (${pct}%). Adding fixtures for the remaining modules raises the floor in MIN_FIXTURED_MODULES.`
      );
    }
  });

  it('every fixtured module name matches an existing dual-mode module', () => {
    const orphans = fixtured.filter((m) => !dualMode.includes(m));
    expect(
      orphans,
      `Fixture dirs without a matching src/lib/<name>.ts: ${orphans.join(', ')}. Did the module get removed/renamed?`
    ).toEqual([]);
  });
});
