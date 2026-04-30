/**
 * _helpers.ts — Shared utilities for the cluster-file commands (T4.7.2).
 *
 * Each cluster file in `src/cli/commands/*.ts` contains MULTIPLE related
 * commands. They share these helpers to avoid copying boilerplate:
 *
 *   - `safeJoin(deps, ...segments)` — `path.join(deps.projectRoot, ...)`
 *     with the result gated by `assertInsideRoot` from path-safety. Per
 *     ADR-009, every fs-path constructed from caller-supplied input must
 *     be inside the project boundary.
 *   - `assertUserPath(deps, userPath, schemaId)` — like `safeJoin` but
 *     specifically for user-supplied positional path arguments. Rejects
 *     absolute paths, traversal segments, and null bytes.
 *   - `parseFlag(args, name)` — read a `--flag value` style arg from a
 *     citty positional rest array.
 *   - `asRest(value)` — coerce citty's rest-arg shape to `string[]`.
 *   - `jsonLine(value)` — format a JSON-mode result.
 *
 * **M11 phase 5e**: `legacyRequire` and `legacyImport` are gone. All
 * 38 callers in src/cli/commands/* were converted to direct ESM imports
 * of the typed `src/lib/*` ports in #58 (phase 5c), and `bin/lib/*` was
 * deleted in this phase. The path-safety helpers stay; the dynamic
 * legacy-loader is no longer needed.
 *
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 * @see specs/implementation-plan.md T4.7.2, M11 phase 5
 */

import * as path from 'node:path';
import { assertInsideRoot } from '../../lib/path-safety.js';
import type { Deps } from '../deps.js';

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
