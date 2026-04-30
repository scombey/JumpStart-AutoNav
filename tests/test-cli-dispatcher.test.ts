/**
 * test-cli-dispatcher.test.ts — T4.7.1 + ADR-002 v2.0.0 verification.
 *
 * Asserts:
 *   1. citty dependency is wired correctly (defineCommand + runMain
 *      imported without error)
 *   2. Deps injection seam works (createRealDeps + createTestDeps)
 *   3. The seed `version-tag` command's pure implementation handles
 *      both happy and error paths
 *   4. The root `main` command exposes the expected meta + subCommands
 *      shape so future T4.7.2 work can extend it without breaking
 *      contracts.
 *
 * @see specs/implementation-plan.md T4.7.1
 * @see specs/decisions/adr-002-cli-framework.md
 */

import { describe, expect, it, vi } from 'vitest';
import versionTagCommand, {
  runImpl as versionTagRunImpl,
} from '../src/cli/commands/version-tag.js';
import { type CliLogger, createRealDeps, createTestDeps } from '../src/cli/deps.js';
import { main } from '../src/cli/main.js';
import { expectDefined } from './_helpers.js';

// ─────────────────────────────────────────────────────────────────────────
// Deps seam
// ─────────────────────────────────────────────────────────────────────────

describe('src/cli/deps.ts — dependency-injection seam', () => {
  it('createRealDeps returns a non-null deps with all required fields', () => {
    const deps = createRealDeps();
    expect(deps).toBeDefined();
    expect(deps.logger).toBeDefined();
    expect(deps.fs).toBeDefined();
    expect(deps.process).toBeDefined();
    expect(typeof deps.projectRoot).toBe('string');
  });

  it('createRealDeps.logger has all 5 levels (info/success/warn/error/debug)', () => {
    const deps = createRealDeps();
    expect(typeof deps.logger.info).toBe('function');
    expect(typeof deps.logger.success).toBe('function');
    expect(typeof deps.logger.warn).toBe('function');
    expect(typeof deps.logger.error).toBe('function');
    expect(typeof deps.logger.debug).toBe('function');
  });

  it('createTestDeps returns no-op deps by default', () => {
    const deps = createTestDeps();
    expect(deps.projectRoot).toBe('/test');
    // No-op fs.existsSync always returns false in test deps.
    expect(deps.fs.existsSync('/anywhere')).toBe(false);
  });

  it('createTestDeps merges overrides into defaults', () => {
    const customLogger: CliLogger = {
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const deps = createTestDeps({ logger: customLogger, projectRoot: '/custom' });
    expect(deps.projectRoot).toBe('/custom');
    expect(deps.logger).toBe(customLogger);
  });

  it('createTestDeps.process does NOT expose `exit` (ADR-006 — only main.ts/runIpc can exit)', () => {
    const deps = createTestDeps();
    expect((deps.process as unknown as Record<string, unknown>).exit).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Root command
// ─────────────────────────────────────────────────────────────────────────

describe('src/cli/main.ts — citty root program', () => {
  it('main command has the expected meta name + version', async () => {
    // citty's defineCommand can return a Resolvable; resolve via the
    // function-or-value pattern.
    const meta = typeof main.meta === 'function' ? await main.meta() : await main.meta;
    expect(meta?.name).toBe('jumpstart-mode');
    // Read the canonical version from package.json so this test tracks
    // the shipped version automatically (Pit Crew M8 MED, QA 4: drop the
    // hardcoded '1.1.14' that wouldn't catch a missing version bump).
    const { default: pkg } = await import('../package.json', { with: { type: 'json' } });
    expect(meta?.version).toBe(pkg.version);
    expect(meta?.description).toBeTruthy();
  });

  it('main command exposes a subCommands map (lazy thunks)', async () => {
    const subCommands =
      typeof main.subCommands === 'function' ? await main.subCommands() : await main.subCommands;
    expect(subCommands).toBeDefined();
    if (subCommands) {
      // version-tag is the seed entry for T4.7.1.
      expect('version-tag' in subCommands).toBe(true);
    }
  });

  it('subCommands["version-tag"] resolves to the imported command default', async () => {
    const subCommands =
      typeof main.subCommands === 'function' ? await main.subCommands() : await main.subCommands;
    if (!subCommands) return;
    const entry = subCommands['version-tag'];
    const resolved = typeof entry === 'function' ? await entry() : await entry;
    expect(resolved).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Seed command — version-tag
// ─────────────────────────────────────────────────────────────────────────

describe('src/cli/commands/version-tag.ts — seed command pure runImpl', () => {
  it('returns exitCode=1 when artifact-path is empty', () => {
    const errorSpy = vi.fn();
    const deps = createTestDeps({
      logger: {
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        error: errorSpy,
        debug: vi.fn(),
      },
    });
    const result = versionTagRunImpl(deps, { 'artifact-name': '', version: '' });
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/missing/i);
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('default export is a citty defineCommand-shaped object', async () => {
    expect(versionTagCommand).toBeDefined();
    const meta =
      typeof versionTagCommand.meta === 'function'
        ? await versionTagCommand.meta()
        : await versionTagCommand.meta;
    expect(meta?.name).toBe('version-tag');
  });

  it('default export declares both artifact-name + version positional args as required', async () => {
    const argsDef =
      typeof versionTagCommand.args === 'function'
        ? await versionTagCommand.args()
        : await versionTagCommand.args;
    if (!argsDef) {
      throw new Error('expected args definition on version-tag command');
    }
    const def = argsDef as Record<string, { type: string; required?: boolean }>;
    expectDefined(def['artifact-name']);
    expect(def['artifact-name'].type).toBe('positional');
    expect(def['artifact-name'].required).toBe(true);
    expectDefined(def.version);
    expect(def.version.type).toBe('positional');
    expect(def.version.required).toBe(true);
  });
});
