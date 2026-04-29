/**
 * test-cli-lifecycle.test.ts — T4.7.2 batch 2 (lifecycle/state cluster).
 *
 * Smoke + dispatcher coverage for the eleven `src/cli/commands/lifecycle.ts`
 * commands. Per the seed pattern in `test-cli-dispatcher.test.ts`, this
 * file only validates:
 *
 *   1. Each `<name>Command` has the expected `meta.name`.
 *   2. Each `<name>Impl(testDeps, {})` returns `exitCode: 1` when called
 *      with empty/missing-required args (smoke test only — full coverage
 *      lives with the underlying lib in tests/test-state-cluster.test.ts
 *      and tests/test-ux-cluster.test.ts).
 *   3. `main.subCommands` exposes the new lazy thunks and they resolve.
 *
 * @see src/cli/commands/lifecycle.ts
 * @see specs/implementation-plan.md T4.7.2
 */

import { describe, expect, it } from 'vitest';
import {
  agentCheckpointCommand,
  agentCheckpointImpl,
  approveCommand,
  checkpointCommand,
  checkpointImpl,
  focusCommand,
  initCommand,
  lockCommand,
  lockImpl,
  memoryCommand,
  memoryImpl,
  nextCommand,
  planExecutorCommand,
  rejectCommand,
  rewindCommand,
  rewindImpl,
} from '../src/cli/commands/lifecycle.js';
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

describe('lifecycle cluster — defineCommand meta.name', () => {
  const cases: [string, { meta?: unknown }][] = [
    ['approve', approveCommand],
    ['reject', rejectCommand],
    ['checkpoint', checkpointCommand],
    ['agent-checkpoint', agentCheckpointCommand],
    ['focus', focusCommand],
    ['init', initCommand],
    ['lock', lockCommand],
    ['memory', memoryCommand],
    ['rewind', rewindCommand],
    ['next', nextCommand],
    ['plan-executor', planExecutorCommand],
  ];
  for (const [expected, cmd] of cases) {
    it(`${expected}Command.meta.name === '${expected}'`, async () => {
      expect(await metaName(cmd)).toBe(expected);
    });
  }
});

describe('lifecycle cluster — Impl missing-required-args smoke', () => {
  it('rewindImpl returns exitCode=1 when phase is undefined', () => {
    const deps = createTestDeps();
    const r = rewindImpl(deps, {});
    expect(r.exitCode).toBe(1);
  });

  it('rewindImpl returns exitCode=1 when phase is non-numeric', () => {
    const deps = createTestDeps();
    const r = rewindImpl(deps, { phase: 'banana' });
    expect(r.exitCode).toBe(1);
  });

  it('checkpointImpl returns exitCode=1 for restore without an id', () => {
    const deps = createTestDeps();
    const r = checkpointImpl(deps, { action: 'restore' });
    expect(r.exitCode).toBe(1);
  });

  it('checkpointImpl returns exitCode=1 for unknown action', () => {
    const deps = createTestDeps();
    const r = checkpointImpl(deps, { action: 'florp' });
    expect(r.exitCode).toBe(1);
  });

  it('lockImpl returns exitCode=1 for acquire without a file', () => {
    const deps = createTestDeps();
    const r = lockImpl(deps, { action: 'acquire' });
    expect(r.exitCode).toBe(1);
  });

  it('memoryImpl returns exitCode=1 for add without --title/--content', () => {
    const deps = createTestDeps();
    const r = memoryImpl(deps, { action: 'add', rest: [] });
    expect(r.exitCode).toBe(1);
  });

  it('agentCheckpointImpl returns exitCode=1 for restore without an id', () => {
    // agent-checkpoint runs through legacyRequire, which in test deps
    // attempts to load bin/lib/agent-checkpoint.js relative to
    // process.cwd(). It's a CJS module, so it loads fine; we still
    // exit 1 on missing id BEFORE invoking it.
    const deps = createTestDeps({ projectRoot: process.cwd() });
    const r = agentCheckpointImpl(deps, { action: 'restore' });
    expect(r.exitCode).toBe(1);
  });
});

describe('lifecycle cluster — main.subCommands wiring', () => {
  it('main.subCommands contains every lifecycle command name', async () => {
    const subs =
      typeof main.subCommands === 'function' ? await main.subCommands() : await main.subCommands;
    expect(subs).toBeDefined();
    if (!subs) return;
    const expected = [
      'approve',
      'reject',
      'checkpoint',
      'agent-checkpoint',
      'focus',
      'init',
      'lock',
      'memory',
      'rewind',
      'next',
      'plan-executor',
    ];
    for (const name of expected) {
      expect(name in subs).toBe(true);
    }
  });
});
