/**
 * version-tag.ts — Seed command demonstrating the citty-port pattern (T4.7.1).
 *
 * Ported from `bin/cli.js` lines 1100–1111 (`subcommand === 'version-tag'`).
 *
 * **Deviation from legacy** (documented for the M8 Deviation Log):
 *   The legacy `bin/cli.js:1108` called
 *   `versioning.createVersionTag(filePath)` with a SINGLE argument,
 *   even though `versioning.createVersionTag` takes 4 args
 *   `(artifactName, version, message?, cwd?)` — meaning the legacy
 *   path produced a tag with `version === undefined` and a malformed
 *   tag string. The TS port surfaces this as a real bug and requires
 *   both `<artifact-name>` and `<version>` positional args.
 *
 * Public-surface contract preserved verbatim by command name + group;
 * the malformed-tag legacy behavior is a bug fix, not a regression.
 *
 * **Pattern T4.7.2 will replicate** for every command:
 *   1. Default-exported `defineCommand` object (citty entry).
 *   2. Named-exported `runImpl(deps, args)` function — pure of
 *      `process.cwd()` / global state — for direct test access.
 *   3. Type the `args` shape via citty's inference.
 *   4. Errors become `CommandResult { exitCode: N, message }` rather
 *      than `process.exit` calls per ADR-006.
 *
 * @see specs/decisions/adr-002-cli-framework.md
 * @see specs/implementation-plan.md T4.7.1
 * @see bin/cli.js (lines 1100–1111 — legacy reference, contains the bug)
 */

import { defineCommand } from 'citty';
import { createVersionTag } from '../../lib/versioning.js';
import { type CommandResult, createRealDeps, type Deps } from '../deps.js';

export interface VersionTagArgs {
  'artifact-name': string;
  version: string;
  message?: string;
}

/**
 * Pure implementation. Takes deps + parsed args, returns a
 * structured result. No `process.exit`, no `console.log` directly —
 * deps.logger handles the I/O; the top-level main.ts handles the
 * exit code.
 */
export function runImpl(deps: Deps, args: VersionTagArgs): CommandResult {
  if (!args['artifact-name']) {
    deps.logger.error(
      'Usage: jumpstart-mode version-tag <artifact-name> <version> [--message <text>]'
    );
    return { exitCode: 1, message: 'missing artifact-name' };
  }
  if (!args.version) {
    deps.logger.error(
      'Usage: jumpstart-mode version-tag <artifact-name> <version> [--message <text>]'
    );
    return { exitCode: 1, message: 'missing version' };
  }

  const result = createVersionTag(
    args['artifact-name'],
    args.version,
    args.message,
    deps.projectRoot
  );

  if (!result.success) {
    deps.logger.error(`Failed to create version tag: ${result.error ?? 'unknown error'}`);
    return { exitCode: 1, message: result.error };
  }

  deps.logger.success(`Version tag created: ${result.tag}`);
  return { exitCode: 0 };
}

/**
 * Citty entry. Constructs deps, parses positional args, invokes
 * `runImpl`. The top-level main.ts catches throws and translates
 * to exit codes per ADR-006.
 */
export default defineCommand({
  meta: {
    name: 'version-tag',
    description: 'Create a git version tag for an approved artifact.',
  },
  args: {
    'artifact-name': {
      type: 'positional',
      description: 'Name of the artifact (e.g., "prd", "architecture").',
      required: true,
    },
    version: {
      type: 'positional',
      description: 'Semver version string (e.g., "1.0.0").',
      required: true,
    },
    message: {
      type: 'string',
      description: 'Optional tag message (default: "Approved: <name> v<ver>").',
      required: false,
    },
  },
  run({ args }) {
    const deps = createRealDeps();
    const result = runImpl(deps, {
      'artifact-name': args['artifact-name'],
      version: args.version,
      message: args.message,
    });
    if (result.exitCode !== 0) {
      throw new Error(result.message ?? 'version-tag failed');
    }
  },
});
