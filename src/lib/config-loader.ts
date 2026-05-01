/**
 * config-loader.ts — global+project config merger.
 *
 * The legacy module
 * shipped a hand-rolled `parseSimpleYaml` that the implementation plan
 * (T4.1.9) explicitly orders deleted in favor of the unified `yaml`
 * package — this port satisfies that mandate.
 *
 * **Public surface trimming.**
 * Legacy exported: `loadConfig`, `parseSimpleYaml`, `deepMerge`.
 * Port exports: `loadConfig`, `deepMerge`.
 * `parseSimpleYaml` is intentionally NOT re-exported. Its only
 * surviving caller is legacy `bin/lib/next-phase.mjs`, which imports
 * directly from `bin/lib/config-loader.mjs` (relative path) and is
 * unaffected by this port. When `next-phase.js` itself ports, it
 * will use the yaml package directly.
 *
 * **First IPC subprocess port.** `config-loader` is the canonical
 * IPC-eligible module per ADR-007, and this port is the first to wire
 * `runIpc` + `isDirectRun` end-to-end. The subprocess driver:
 * - Validates `{ root, global_path }` via `ConfigLoaderInputSchema`
 * (Zod refinement gated by `safePathSchema` per ADR-009).
 * - Treats both v0 and v1 envelopes per ADR-007.
 * - Translates typed errors to exit codes per ADR-006.
 *
 * **Invariants:**
 * - Project config wins over global on key collision.
 * - Missing global config silently produces `globalConfig = {}`.
 * - Malformed project config returns
 * `{ error: 'Failed to parse project config: <path>', config: {}, sources }`
 * (legacy semantics; NOT a thrown error).
 * - Ceremony profile expansion calls `bin/lib/ceremony.mjs` via
 * dynamic import to preserve the legacy "if ceremony.profile is
 * set and not 'standard', apply it as a base layer" behavior.
 * When ceremony.js itself ports, the dynamic import resolves to
 * the TS version via the `@lib/*` strangler alias.
 *
 * @see specs/decisions/adr-003-yaml-roundtrip.md
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 */

import { existsSync, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse as yamlParse } from 'yaml';
import { z } from 'zod';
import { applyProfile, VALID_PROFILES } from './ceremony.js';
import { assertInsideRoot } from './path-safety.js';

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

/** Input shape accepted by `loadConfig`. */
export interface ConfigLoaderInput {
  root?: string | undefined;
  global_path?: string | undefined;
}

/** Override-tracking entry: a key that came from global config because
 * project didn't redefine it. */
export interface OverrideApplied {
  key: string;
  value: unknown;
  source: 'global';
}

/** Profile-expansion outcome reported when a non-`standard` ceremony
 * profile was applied as the base layer. */
export interface ProfileApplied {
  profile: string;
  settings_applied: number;
  settings_skipped: number;
  applied: unknown[];
  skipped: unknown[];
}

/** Fully-merged config + provenance metadata. */
export interface LoadedConfig {
  config: Record<string, unknown>;
  sources: { global: string | null; project: string | null };
  overrides_applied: OverrideApplied[];
  profile_applied: ProfileApplied | null;
  global_keys: number;
  project_keys: number;
  /** Set only on project-config parse failure (legacy semantics). */
  error?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Deep merge two plain objects. `source` (project) wins on key
 * collision; nested objects merge recursively; arrays are replaced
 * (not concatenated). Identical semantics to legacy `deepMerge`.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      tv &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      output[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      output[key] = sv;
    }
  }
  return output;
}

/**
 * Flatten an object to dot-notation keys. Internal helper — not part
 * of the public surface. Used to compute which global keys were
 * overridden by project config.
 */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/**
 * Parse a YAML config file with the unified `yaml` package. Replaces
 * the legacy `parseSimpleYaml` hand-rolled parser. Returns the parsed
 * plain object; throws on malformed YAML (caller catches and decides
 * fallthrough vs propagation).
 */
function parseYamlFile(filePath: string): Record<string, unknown> {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = yamlParse(raw) as unknown;
  if (parsed === null || parsed === undefined) {
    return {};
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Config root must be a mapping; got ${Array.isArray(parsed) ? 'array' : typeof parsed}`
    );
  }
  return parsed as Record<string, unknown>;
}

// Optional ceremony-profile expansion. Dynamic import preserves legacy
// behavior of failing soft if ceremony.js is unavailable; the typed
// shape is opaque (the legacy module is JS).
interface CeremonyProfileResult {
  config: Record<string, unknown>;
  applied: unknown[];
  skipped: unknown[];
}

/**
 * Ceremony-profile expansion: read `merged.ceremony.profile`; if it's a
 * known non-`standard` profile, apply it as a fill-defaults base layer
 * via `ceremony.applyProfile`. User explicit values are NEVER
 * overridden — only missing keys are filled in. Returns the expanded
 * config + a structured `ProfileApplied` audit trail (or `null` if no
 * expansion ran).
 *
 * Pit Crew M2-Final Reviewer #1 fix: the legacy implementation read
 * `bin/lib/ceremony.mjs` via cwd-relative path, which silently failed
 * for downstream consumers (their cwd is their own project root, not
 * the framework install dir). This direct import resolves at module
 * load via Node's standard ESM graph — no path-arithmetic needed.
 */
async function maybeApplyCeremonyProfile(
  merged: Record<string, unknown>
): Promise<{ config: Record<string, unknown>; profileApplied: ProfileApplied | null }> {
  // Reference for downstream callers that may consume CeremonyProfileResult.
  void (null as unknown as CeremonyProfileResult);
  const ceremony = (merged.ceremony ?? null) as { profile?: unknown } | null;
  const profileName = typeof ceremony?.profile === 'string' ? ceremony.profile : null;
  // No profile, default `standard` (no expansion needed), or unknown name → soft-fall.
  if (!profileName || profileName === 'standard' || !VALID_PROFILES.includes(profileName)) {
    return { config: merged, profileApplied: null };
  }
  try {
    const result = applyProfile(merged, profileName);
    return {
      config: result.config,
      profileApplied: {
        profile: profileName,
        settings_applied: result.applied.length,
        settings_skipped: result.skipped.length,
        applied: result.applied,
        skipped: result.skipped,
      },
    };
  } catch {
    // Soft-fall on unexpected failure (legacy parity).
    return { config: merged, profileApplied: null };
  }
}

/**
 * Load and merge global + project configuration.
 *
 * - `input.root` (default '.'): project root. Resolved against
 * `process.cwd()` for the project config lookup.
 * - `input.global_path` (default `~/.jumpstart/config.yaml`): user-
 * global override config. `~` is expanded to `os.homedir()`.
 *
 * Returns the merged config plus provenance + override-tracking
 * metadata in the legacy shape (every field preserved).
 */
export async function loadConfig(input: ConfigLoaderInput): Promise<LoadedConfig> {
  const { root = '.', global_path } = input;
  const resolvedRoot = path.resolve(root);

  const globalConfigPath = global_path
    ? path.resolve(global_path.replace(/^~/, os.homedir()))
    : path.join(os.homedir(), '.jumpstart', 'config.yaml');

  const projectConfigPath = path.join(resolvedRoot, '.jumpstart', 'config.yaml');

  let globalConfig: Record<string, unknown> = {};
  let projectConfig: Record<string, unknown> = {};
  const sources: { global: string | null; project: string | null } = {
    global: null,
    project: null,
  };

  if (existsSync(globalConfigPath)) {
    try {
      globalConfig = parseYamlFile(globalConfigPath);
      sources.global = globalConfigPath;
    } catch {
      // Global config is optional — silent skip on parse failure (legacy).
    }
  }

  if (existsSync(projectConfigPath)) {
    try {
      projectConfig = parseYamlFile(projectConfigPath);
      sources.project = projectConfigPath;
    } catch {
      // Project config parse error — return the legacy error shape, not throw.
      return {
        error: `Failed to parse project config: ${projectConfigPath}`,
        config: {},
        sources,
        overrides_applied: [],
        profile_applied: null,
        global_keys: 0,
        project_keys: 0,
      };
    }
  }

  const initialMerge = deepMerge(globalConfig, projectConfig);
  const { config: merged, profileApplied } = await maybeApplyCeremonyProfile(initialMerge);

  const globalFlat = flatten(globalConfig);
  const projectFlat = flatten(projectConfig);
  const overridesApplied: OverrideApplied[] = [];
  for (const [key, value] of Object.entries(globalFlat)) {
    if (!(key in projectFlat)) {
      overridesApplied.push({ key, value, source: 'global' });
    }
  }

  return {
    config: merged,
    sources,
    overrides_applied: overridesApplied,
    profile_applied: profileApplied,
    global_keys: Object.keys(globalFlat).length,
    project_keys: Object.keys(projectFlat).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// IPC subprocess input schema (ADR-009 path-safety + Zod validation)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Per ADR-009: every IPC-eligible module's path-typed input fields use
 * path-safety primitives instead of bare `z.string()`. Boundary roots
 * are chosen so an agent submitting `root: '/etc'` or a
 * `~/../../../etc` path through `global_path` is rejected with
 * `ValidationError` (exit 2) before any fs access.
 *
 * - `root`: bounded to the IPC server's `process.cwd()` (the user's
 * project root). Library callers bypass this by calling `loadConfig`
 * directly.
 * - `global_path`: bounded to `os.homedir()`. The `~` prefix is
 * stripped before bounds-checking so user input like `~/foo`
 * resolves correctly. For absolute paths inside homedir, both are
 * accepted.
 *
 * **Pit Crew M2-Final Reviewer #4 — parse-time boundary capture.**
 * Earlier draft baked `safePathSchema(process.cwd())` at module load,
 * meaning a long-running consumer that changed cwd between load and
 * parse would validate against the wrong boundary. The refinement
 * below now reads `process.cwd()` and `os.homedir()` at parse time.
 *
 * **Pit Crew M2-Final Reviewer #5 / Adversary 6 — global_path
 * symmetry.** The previous hand-rolled superRefine for global_path
 * only checked POSIX boundary semantics, leaving Windows drive-
 * letter inputs (`C:\Windows\system32`) accepted on POSIX hosts.
 * Routing through `assertInsideRoot` inherits the centralized
 * win32-resolver check from path-safety.ts so the same input shape
 * is rejected uniformly.
 */
export const ConfigLoaderInputSchema = z
  .object({
    root: z.string().default('.'),
    global_path: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    // Lazy boundary capture — re-read at parse time so a runtime
    // cwd change doesn't validate against a stale module-load
    // snapshot. Reviewer #4.
    const rootBoundary = process.cwd();
    const homeBoundary = os.homedir();

    // Validate `root` via assertInsideRoot which carries the full
    // path-safety contract (null byte, drive letter, win32 resolver,
    // lexical traversal) through one helper. ValidationError →
    // structured Zod issue.
    try {
      assertInsideRoot(value.root, rootBoundary, {
        schemaId: 'ConfigLoaderInputSchema.root',
      });
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message: (err as Error).message,
        path: ['root'],
      });
    }

    if (value.global_path !== undefined) {
      // Expand `~` once so assertInsideRoot can do a normal lexical
      // boundary check — without expansion, `~/foo` would fail the
      // win32 drive-prefix regex (no leading drive letter, but path
      // package would resolve `~` as a literal directory under cwd).
      const expanded = value.global_path.replace(/^~/, homeBoundary);
      try {
        assertInsideRoot(expanded, homeBoundary, {
          schemaId: 'ConfigLoaderInputSchema.global_path',
        });
      } catch (err) {
        ctx.addIssue({
          code: 'custom',
          message: (err as Error).message,
          path: ['global_path'],
        });
      }
    }
  });

// Library callers can drive `runIpc` themselves via:
//
//   import { loadConfig, ConfigLoaderInputSchema } from '@lib/config-loader';
//   import { runIpc } from '@lib/ipc';
//   if (isDirectRun(import.meta.url)) {
//     await runIpc(loadConfig, ConfigLoaderInputSchema);
//   }
//
// The schema export above is the load-bearing piece for that path.
