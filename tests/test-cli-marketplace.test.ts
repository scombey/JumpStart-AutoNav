/**
 * test-cli-marketplace.test.ts — T4.7.2 batch 3 (marketplace cluster).
 *
 * Smoke + dispatcher coverage for the six `src/cli/commands/marketplace.ts`
 * commands. Per the seed pattern in `test-cli-lifecycle.test.ts`, this
 * file only validates:
 *
 *   1. Each `<name>Command` has the expected `meta.name`.
 *   2. Each `<name>Impl(testDeps, {})` returns `exitCode: 1` when called
 *      with empty/missing-required args (smoke test only — full coverage
 *      lives with the underlying lib in tests/test-install.test.ts,
 *      tests/test-integrate.test.ts, tests/test-upgrade.test.ts).
 *   3. `main.subCommands` exposes the new lazy thunks.
 *
 * @see src/cli/commands/marketplace.ts
 * @see specs/implementation-plan.md T4.7.2
 */

import { describe, expect, it } from 'vitest';
import {
  installCommand,
  installImpl,
  integrateCommand,
  statusCommand,
  uninstallCommand,
  uninstallImpl,
  updateCommand,
  upgradeCommand,
} from '../src/cli/commands/marketplace.js';
import { createTestDeps } from '../src/cli/deps.js';
import { main } from '../src/cli/main.js';

// citty's CommandDef is heavily generic-parameterized; we narrow to a
// minimal "has meta" shape via `unknown` cast for the tabular test.
async function metaName(cmd: { meta?: unknown }): Promise<string | undefined> {
  const m = cmd.meta;
  const resolved =
    typeof m === 'function'
      ? await (m as () => Promise<{ name?: string } | undefined>)()
      : await (m as Promise<{ name?: string } | undefined> | { name?: string } | undefined);
  return resolved?.name;
}

describe('marketplace cluster — defineCommand meta.name', () => {
  const cases: [string, { meta?: unknown }][] = [
    ['install', installCommand],
    ['uninstall', uninstallCommand],
    ['status', statusCommand],
    ['integrate', integrateCommand],
    ['update', updateCommand],
    ['upgrade', upgradeCommand],
  ];
  for (const [expected, cmd] of cases) {
    it(`${expected}Command.meta.name === '${expected}'`, async () => {
      expect(await metaName(cmd)).toBe(expected);
    });
  }
});

describe('marketplace cluster — Impl missing-required-args smoke', () => {
  it('installImpl returns exitCode=1 when itemId and search are absent', async () => {
    const deps = createTestDeps();
    const r = await installImpl(deps, {});
    expect(r.exitCode).toBe(1);
  });

  it('uninstallImpl returns exitCode=1 when itemId is absent', () => {
    const deps = createTestDeps();
    const r = uninstallImpl(deps, {});
    expect(r.exitCode).toBe(1);
  });

  it('uninstallImpl returns exitCode=1 when itemId cannot be normalized', () => {
    // Empty string + undefined name → normalizeItemId returns null.
    const deps = createTestDeps();
    const r = uninstallImpl(deps, { itemId: '..' });
    // `..` is rejected by normalizeItemId (see install.ts) → null →
    // we surface exitCode=1.
    expect(r.exitCode).toBe(1);
  });
});

describe('marketplace cluster — main.subCommands wiring', () => {
  it('main.subCommands contains every marketplace command name', async () => {
    const subs =
      typeof main.subCommands === 'function' ? await main.subCommands() : await main.subCommands;
    expect(subs).toBeDefined();
    if (!subs) return;
    const expected = ['install', 'uninstall', 'status', 'integrate', 'update', 'upgrade'];
    for (const name of expected) {
      expect(name in subs).toBe(true);
    }
  });
});
