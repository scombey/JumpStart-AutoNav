/**
 * _helpers.ts — Shared utilities for the cluster-file commands (T4.7.2).
 *
 * Each cluster file in `src/cli/commands/*.ts` contains MULTIPLE related
 * commands. They share these helpers to avoid copying boilerplate:
 *
 *   - `legacyRequire(modulePath)` — load a `bin/lib/*.js` legacy module
 *     (CommonJS). Used until each underlying lib has a `bin/lib-ts/*.ts`
 *     port. The `.js` extension is preserved since lib paths are CJS.
 *   - `safeJoin(deps, ...segments)` — `path.join(deps.projectRoot, ...)`
 *     with the result gated by `assertInsideRoot` from path-safety. Per
 *     ADR-009, every fs-path constructed from caller-supplied input must
 *     be inside the project boundary.
 *   - `parseFlag(args, name)` — read a `--flag value` style arg from a
 *     citty positional rest array (we accept rest args as `string[]` and
 *     parse manually so the per-command `args` object stays small).
 *
 * **Strangler-phase note**: `legacyRequire()` uses bare `require()` — this
 * is the M4-M8 norm (see bin/lib-ts/dashboard.ts comment). At M9 ESM
 * cutover, callers switch to `import { createRequire } from 'node:module'`.
 *
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 * @see specs/implementation-plan.md T4.7.2
 */

import * as path from 'node:path';
import { assertInsideRoot } from '../../../bin/lib-ts/path-safety.js';
import type { Deps } from '../deps.js';

/**
 * Load a legacy CommonJS lib module from `bin/lib/<name>.js`.
 *
 * Pit Crew M8 Adversary 3 (HIGH) fix: pre-fix used a bare relative
 * `require('../../../bin/lib/<name>')` which Node could satisfy via
 * a `NODE_PATH=/tmp/evil/bin/lib/<name>.js` environment override —
 * RCE at command-dispatch time. Post-fix: resolve through the
 * package root deterministically by joining from a known anchor and
 * passing the absolute path. NODE_PATH is consulted only when a
 * `require()` argument is BARE (no `/` or `..`); supplying an
 * absolute path bypasses the NODE_PATH lookup entirely.
 *
 * The anchor is the `bin/lib/` directory under PACKAGE_ROOT, where
 * PACKAGE_ROOT is computed from `process.cwd()` (the project root
 * the CLI is invoked from) — same as the legacy `bin/cli.js`. At M9
 * ESM cutover this becomes `createRequire(import.meta.url)` rooted
 * at the dist artifact.
 */
const PACKAGE_ROOT = path.resolve(process.cwd());
const LEGACY_LIB_DIR = path.join(PACKAGE_ROOT, 'bin', 'lib');

// biome-ignore lint/suspicious/noExplicitAny: <legacy-lib loader returns runtime-shaped exports — we narrow via per-call casts in the callers>
export function legacyRequire<T = any>(libName: string): T {
  // Reject any lib name that could escape via path traversal, absolute
  // paths, or null bytes. Library names are expected to be simple
  // module identifiers (alphanumeric + hyphens).
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(libName)) {
    throw new Error(`Invalid legacy lib name: ${libName}`);
  }
  const absolutePath = path.join(LEGACY_LIB_DIR, libName);
  // Defense-in-depth: confirm resolution stays under LEGACY_LIB_DIR.
  assertInsideRoot(libName, LEGACY_LIB_DIR, { schemaId: 'cli.legacyRequire' });
  return require(absolutePath) as T;
}

/**
 * Path-safety wrapper for path.join. Every constructed path in a
 * `runImpl` MUST go through this so `assertInsideRoot` rejects
 * traversal-shaped inputs at the trust boundary.
 *
 * Pit Crew M8 Adversary 1 (HIGH) fix: pre-fix returned the joined
 * path WITHOUT calling `assertInsideRoot` when `relative === ''`
 * (the input was the project root itself). The early-return skipped
 * the only guard and could hand the project root to consumers that
 * then walked it as a file. Post-fix: the guard fires unconditionally
 * — the empty-string case is handled inside `assertInsideRoot` (which
 * accepts the root itself; only escapes throw).
 */
export function safeJoin(deps: Deps, ...segments: string[]): string {
  const joined = path.resolve(deps.projectRoot, ...segments);
  const relative = path.relative(deps.projectRoot, joined);
  // assertInsideRoot accepts an empty relative (= project root itself);
  // only ascending paths (`../...`) and absolute paths throw. Removing
  // the `relative !== ''` early-return closes the bypass.
  assertInsideRoot(relative === '' ? '.' : relative, deps.projectRoot, {
    schemaId: 'cli.safeJoin',
  });
  return joined;
}

/**
 * Path-safety wrapper for user-supplied file path arguments. Used by
 * commands that accept a positional file path (e.g. `validate <path>`).
 *
 * Pit Crew M8 Adversary 2 + 4 (BLOCKER, confirmed exploit) fix: pre-
 * fix paths like `/etc/passwd` were passed verbatim to legacy lib
 * functions like `validateArtifact(filePath, ...)`. AI agents that
 * receive prompt-injected arguments could exfiltrate any
 * project-readable file on disk via the various validate / hash /
 * smells / handoff-check paths.
 *
 * Post-fix: every command that takes a file path arg routes it through
 * `assertUserPath` which rejects absolute paths, traversal-shaped
 * paths, and null bytes — and resolves to a path GUARANTEED inside
 * the project root.
 *
 * Returns the resolved absolute path on success; throws ValidationError
 * on any escape attempt.
 */
export function assertUserPath(deps: Deps, userPath: string, schemaId: string): string {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new Error(`${schemaId}: empty path`);
  }
  if (userPath.includes('\0')) {
    throw new Error(`${schemaId}: null byte in path`);
  }
  // safeJoin already calls assertInsideRoot under the hood; passing
  // a user path through it both validates and resolves.
  return safeJoin(deps, userPath);
}

/**
 * Parse a `--flag value` style argument from a rest-positional `string[]`.
 * Returns undefined if the flag isn't present. Used by commands that
 * accept many optional flags — citty's `args` schema would balloon if we
 * declared each one explicitly.
 */
export function parseFlag(rest: string[], flagName: string): string | undefined {
  const idx = rest.indexOf(`--${flagName}`);
  if (idx === -1 || idx === rest.length - 1) return undefined;
  return rest[idx + 1];
}

/** Returns true if the rest array contains the bare flag (no value). */
export function hasFlag(rest: string[], flagName: string): boolean {
  return rest.includes(`--${flagName}`);
}

/**
 * Coerce citty's `string[] | string | boolean | undefined` rest-arg
 * shape into a plain `string[]`. citty stores positional rest as either
 * an array or a single string depending on count.
 */
export function asRest(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') return [value];
  return [];
}

/** Format a JSON-mode result as a single-line stringify (matches io.writeResult). */
export function jsonLine(value: unknown): string {
  return `${JSON.stringify({ ok: true, timestamp: new Date().toISOString(), ...(value as Record<string, unknown>) })}\n`;
}
