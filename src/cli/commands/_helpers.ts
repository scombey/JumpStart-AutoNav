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
 * Mirrors how `bin/cli.js` does `require('./lib/<name>')`.
 *
 * Marked `any` because each lib module exports a runtime-shaped surface
 * we narrow at the call site. Cataloged in ADR-006's "DEFERRED M9 ESM
 * shape-narrowing" punch list.
 */
// biome-ignore lint/suspicious/noExplicitAny: <legacy-lib loader returns runtime-shaped exports — we narrow via per-call casts in the callers>
export function legacyRequire<T = any>(libName: string): T {
  // bin/lib/* is the legacy CJS path. Resolved relative to this file
  // (src/cli/commands/_helpers.ts → ../../../bin/lib/<name>.js).
  // Bare require() per the strangler-phase convention; M9 cutover
  // switches to createRequire(import.meta.url).
  return require(`../../../bin/lib/${libName}`) as T;
}

/**
 * Path-safety wrapper for path.join. Every constructed path in a
 * `runImpl` MUST go through this so `assertInsideRoot` rejects
 * traversal-shaped inputs at the trust boundary.
 */
export function safeJoin(deps: Deps, ...segments: string[]): string {
  const joined = path.join(deps.projectRoot, ...segments);
  // The relative form is what assertInsideRoot expects. Convert back.
  const relative = path.relative(deps.projectRoot, joined);
  if (relative !== '') {
    assertInsideRoot(relative, deps.projectRoot, { schemaId: 'cli.safeJoin' });
  }
  return joined;
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
