/**
 * framework-manifest.ts — file ownership classification + manifests (T4.1.11).
 *
 * Pure-library port of `bin/lib/framework-manifest.js`. The classification
 * lists drive `bin/upgrade.js`'s "what's safe to overwrite vs what's
 * the user's customization?" decision; the manifest functions hash every
 * framework-owned file at install time so subsequent upgrades can do a
 * three-way diff.
 *
 * **Eleven exports preserved verbatim by name + signature:**
 *   - `FRAMEWORK_OWNED_PATTERNS` (constant array)
 *   - `USER_OWNED_PATHS` (constant array)
 *   - `isUserOwned(relPath)` → boolean
 *   - `isFrameworkOwned(relPath)` → boolean
 *   - `hashFile(absPath)` → hex SHA-256
 *   - `generateManifest(rootDir, options?)` → manifest
 *   - `diffManifest(old, new)` → { added, removed, changed, unchanged }
 *   - `detectUserModifications(projectRoot, installedManifest)`
 *   - `readFrameworkManifest(projectRoot)` → manifest | null
 *   - `writeFrameworkManifest(projectRoot, manifest)`
 *   - `getPackageVersion(packageRoot)` → string
 *
 * Behavior parity:
 *   - User-owned takes precedence over framework-owned (legacy
 *     `isFrameworkOwned` returns false if `isUserOwned` is true).
 *   - Pattern matching is forward-slash-normalized; trailing-slash
 *     patterns match prefix; bare patterns match exactly.
 *   - Manifest JSON is pretty-printed with trailing newline + parent
 *     directory auto-created on write.
 *
 * Note: this module computes SHA-256 directly via `node:crypto` rather
 * than reusing `bin/lib-ts/hashing.ts`'s `hashFile` because the legacy
 * function reads the file as a Buffer (`readFileSync(filePath)` with
 * no encoding — binary read), while `hashing.ts` uses `'utf8'`. The
 * binary read is correct for arbitrary file types under
 * `.jumpstart/templates/` (which can be markdown, JSON, YAML, or
 * binary blobs in the future). Preserved verbatim.
 *
 * @see bin/lib/framework-manifest.js (legacy reference)
 * @see bin/upgrade.js (caller — drives the three-way diff during npm upgrade)
 * @see specs/implementation-plan.md T4.1.11
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { ValidationError } from './errors.js';
import { assertInsideRoot } from './path-safety.js';

// ─────────────────────────────────────────────────────────────────────────
// Classification rules
// ─────────────────────────────────────────────────────────────────────────

/**
 * Glob-style path patterns for framework-owned files. These are shipped
 * with the npm package and are safe to overwrite on upgrade. List
 * order matches legacy verbatim.
 */
export const FRAMEWORK_OWNED_PATTERNS: readonly string[] = [
  '.jumpstart/agents/',
  '.jumpstart/templates/',
  '.jumpstart/schemas/',
  '.jumpstart/guides/',
  '.jumpstart/handoffs/',
  '.jumpstart/compat/',
  '.jumpstart/commands/',
  '.jumpstart/base/',
  '.jumpstart/modules/README.md',
  '.jumpstart/roadmap.md',
  '.jumpstart/invariants.md',
  '.jumpstart/domain-complexity.csv',
  '.jumpstart/glossary.md',
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.github/agents/',
  '.github/instructions/specs.instructions.md',
  '.github/prompts/',
  '.github/copilot-instructions.md',
];

/**
 * Paths that are always user-owned and must NEVER be overwritten.
 * These take precedence over framework patterns where they overlap.
 *
 * Pit Crew M2-Final Adversary 7: `.jumpstart/framework-manifest.json`
 * is generated AT INSTALL TIME from the user's site (writeFramework-
 * Manifest writes hashes of the actually-installed files). Treating
 * it as framework-owned would cause `bin/upgrade.js`'s safe-overwrite
 * pass to clobber the legitimate per-install record with a stale
 * package-shipped placeholder. Classify as user-owned so upgrade
 * leaves it alone (and the regenerate path is the only mutator).
 */
export const USER_OWNED_PATHS: readonly string[] = [
  '.jumpstart/config.yaml',
  '.jumpstart/state/',
  '.jumpstart/installed.json',
  '.jumpstart/manifest.json',
  '.jumpstart/framework-manifest.json',
  '.jumpstart/spec-graph.json',
  '.jumpstart/usage-log.json',
  '.jumpstart/correction-log.md',
  '.jumpstart/archive/',
  '.jumpstart/skills/',
  '.jumpstart/integration-log.json',
  'specs/',
  'src/',
  'tests/',
];

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

/** Manifest shape: framework version + per-file SHA-256 map. */
export interface Manifest {
  frameworkVersion: string;
  generatedAt: string;
  files: Record<string, string>;
}

/** Options for `generateManifest`. */
export interface GenerateManifestOptions {
  /** Framework version to stamp on the manifest. Defaults to `'0.0.0'`. */
  version?: string;
  /** Include all files under .jumpstart/, .github/, and top-level rather
   *  than filtering to framework-owned. Useful for snapshotting test
   *  fixtures. */
  allFiles?: boolean;
}

/** Result of `diffManifest`. */
export interface ManifestDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
}

/** Result of `detectUserModifications`. */
export interface UserModifications {
  modified: string[];
  unmodified: string[];
  missing: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Classification helpers
// ─────────────────────────────────────────────────────────────────────────

/** True if `relPath` is in the user-owned allowlist (protected from upgrade). */
export function isUserOwned(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  for (const pattern of USER_OWNED_PATHS) {
    if (pattern.endsWith('/')) {
      if (normalized.startsWith(pattern) || normalized === pattern.slice(0, -1)) {
        return true;
      }
    } else if (normalized === pattern) {
      return true;
    }
  }
  return false;
}

/** True if `relPath` is framework-owned and safe to upgrade. User-owned
 *  takes precedence — `isFrameworkOwned` returns false even for an
 *  exact match in `FRAMEWORK_OWNED_PATTERNS` if `isUserOwned` says
 *  user-owned.
 *
 *  Trailing-slash handling matches `isUserOwned`: a directory pattern
 *  `'.jumpstart/agents/'` matches both prefix paths
 *  (`'.jumpstart/agents/scout.md'`) AND the directory itself with no
 *  trailing slash (`'.jumpstart/agents'`). Pit Crew M2-Final QA F7 —
 *  prior to this fix `isUserOwned` had the equality branch but
 *  `isFrameworkOwned` did not, leaving empty framework-owned
 *  directories invisible to `generateManifest`/`detectUserModifications`.
 */
export function isFrameworkOwned(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (isUserOwned(normalized)) return false;
  for (const pattern of FRAMEWORK_OWNED_PATTERNS) {
    if (pattern.endsWith('/')) {
      if (normalized.startsWith(pattern) || normalized === pattern.slice(0, -1)) {
        return true;
      }
    } else if (normalized === pattern) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────
// Hashing + walking
// ─────────────────────────────────────────────────────────────────────────

/**
 * SHA-256 hex digest of a file's contents. Reads as Buffer (no
 * encoding) so the digest is binary-safe — matches legacy semantics
 * verbatim and produces consistent hashes across line-ending platforms.
 */
export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/** Recursively collect file paths under `dir`, returning forward-slash
 *  paths relative to `rootDir`. */
function walkDir(dir: string, rootDir: string = dir): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, rootDir));
    } else {
      const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');
      results.push(relPath);
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// Manifest generation + diff
// ─────────────────────────────────────────────────────────────────────────

/**
 * Walk `rootDir` for framework-owned files and produce a manifest with
 * version stamp + per-file SHA-256 map. Walks `.jumpstart/` and
 * `.github/` plus the top-level integration files (`AGENTS.md`,
 * `CLAUDE.md`, `.cursorrules`).
 */
export function generateManifest(rootDir: string, options: GenerateManifestOptions = {}): Manifest {
  const version = options.version || '0.0.0';
  const allFiles = options.allFiles || false;

  const manifest: Manifest = {
    frameworkVersion: version,
    generatedAt: new Date().toISOString(),
    files: {},
  };

  const jumpstartDir = join(rootDir, '.jumpstart');
  if (existsSync(jumpstartDir)) {
    for (const relPath of walkDir(jumpstartDir, rootDir)) {
      if (allFiles || isFrameworkOwned(relPath)) {
        manifest.files[relPath] = hashFile(join(rootDir, relPath));
      }
    }
  }

  const githubDir = join(rootDir, '.github');
  if (existsSync(githubDir)) {
    for (const relPath of walkDir(githubDir, rootDir)) {
      if (allFiles || isFrameworkOwned(relPath)) {
        manifest.files[relPath] = hashFile(join(rootDir, relPath));
      }
    }
  }

  const topLevelFiles = ['AGENTS.md', 'CLAUDE.md', '.cursorrules'];
  for (const file of topLevelFiles) {
    const fullPath = join(rootDir, file);
    if (existsSync(fullPath) && (allFiles || isFrameworkOwned(file))) {
      manifest.files[file] = hashFile(fullPath);
    }
  }

  return manifest;
}

/**
 * Three-bucket diff between two manifests.
 *
 * Pit Crew M2-Final Adversary 3 (path-traversal disclosure): a
 * malicious manifest can contain crafted relPaths like `../../etc/passwd`.
 * `diffManifest` itself is purely lexical (no fs access), so the
 * traversal can't read anything HERE — but the buckets feed downstream
 * fs-touching consumers (e.g. `bin/upgrade.js` walks the `changed`
 * list and reads each file). We therefore reject traversal-shaped
 * relPaths at this boundary so the disclosure can't propagate.
 *
 * Both manifests' file maps must contain only relPaths that lexically
 * resolve under the current working directory (the most permissive
 * boundary that still blocks `..` escape). Per ADR-009 we throw
 * ValidationError on the first traversal-shaped key.
 */
export function diffManifest(oldManifest: Manifest, newManifest: Manifest): ManifestDiff {
  const oldFiles = oldManifest.files || {};
  const newFiles = newManifest.files || {};

  // Layer 1 boundary check — every relPath must lexically resolve under
  // the cwd. Adversary 3 confirmed exploit: a crafted manifest with
  // `../../etc/passwd` would feed the path into upgrade.js which then
  // reads + reports its hash. Reject at the boundary before any
  // downstream fs access.
  for (const filePath of Object.keys(oldFiles)) {
    assertInsideRoot(filePath, process.cwd(), { schemaId: 'diffManifest.oldFiles' });
  }
  for (const filePath of Object.keys(newFiles)) {
    assertInsideRoot(filePath, process.cwd(), { schemaId: 'diffManifest.newFiles' });
  }

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];

  for (const [filePath, hash] of Object.entries(newFiles)) {
    if (!(filePath in oldFiles)) {
      added.push(filePath);
    } else if (oldFiles[filePath] !== hash) {
      changed.push(filePath);
    } else {
      unchanged.push(filePath);
    }
  }

  for (const filePath of Object.keys(oldFiles)) {
    if (!(filePath in newFiles)) {
      removed.push(filePath);
    }
  }

  return { added, removed, changed, unchanged };
}

/** Compare every file recorded in the installed manifest against its
 *  current on-disk hash. Reports modified / unmodified / missing
 *  buckets.
 *
 *  Pit Crew M2-Final Adversary 3 (path-traversal disclosure): a
 *  malicious manifest could carry a relPath like `../../etc/passwd`,
 *  causing `hashFile(join(projectRoot, relPath))` to read outside the
 *  project root and emit the hash to the user — a confidentiality
 *  leak. We gate every relPath through `assertInsideRoot(relPath,
 *  projectRoot)` BEFORE any fs access. Throws ValidationError (exit 2)
 *  on the first traversal-shaped key per ADR-009.
 */
export function detectUserModifications(
  projectRoot: string,
  installedManifest: Manifest
): UserModifications {
  const files = installedManifest.files || {};
  const modified: string[] = [];
  const unmodified: string[] = [];
  const missing: string[] = [];

  for (const [relPath, originalHash] of Object.entries(files)) {
    // Adversary 3 fix: defense-in-depth path check. `relPath` originates
    // from disk (`.jumpstart/framework-manifest.json`) which is user-
    // owned — an attacker who controls the manifest controls the keys.
    // assertInsideRoot rejects `..` traversal AND null-byte injection
    // before `hashFile` ever sees the path.
    assertInsideRoot(relPath, projectRoot, { schemaId: 'detectUserModifications.relPath' });

    const fullPath = join(projectRoot, relPath);
    if (!existsSync(fullPath)) {
      missing.push(relPath);
      continue;
    }
    const currentHash = hashFile(fullPath);
    if (currentHash !== originalHash) {
      modified.push(relPath);
    } else {
      unmodified.push(relPath);
    }
  }

  return { modified, unmodified, missing };
}

// ─────────────────────────────────────────────────────────────────────────
// Manifest persistence + version helpers
// ─────────────────────────────────────────────────────────────────────────

/** Read `<projectRoot>/.jumpstart/framework-manifest.json` or null.
 *
 *  Pit Crew M2-Final Adversary 3: every relPath in the loaded manifest
 *  is pre-validated against `projectRoot`. A manifest containing
 *  `'../../etc/passwd': '<hash>'` (e.g. corruption or attacker
 *  influence) would otherwise propagate to `detectUserModifications`
 *  / `diffManifest` consumers. We surface validation errors as `null`
 *  here (matching the existing legacy soft-fail pattern for malformed
 *  JSON) so callers can treat "missing-or-corrupt" uniformly without
 *  changing their try/catch shape. The structured ValidationError is
 *  preserved at lower fs-touching layers (`detectUserModifications`)
 *  for callers that opt into strict mode by passing an externally-
 *  acquired manifest.
 */
export function readFrameworkManifest(projectRoot: string): Manifest | null {
  const manifestPath = join(projectRoot, '.jumpstart', 'framework-manifest.json');
  if (!existsSync(manifestPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
  // Shape check — must be a plain object with a `files` mapping.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const m = parsed as Manifest;
  const files = m.files || {};
  // Adversary 3 fix: validate every relPath against the project root
  // boundary at load time. If any key is traversal-shaped, soft-fail
  // to null (legacy malformed-manifest semantics) rather than throwing.
  // Strict callers go through `detectUserModifications` which throws.
  for (const relPath of Object.keys(files)) {
    try {
      assertInsideRoot(relPath, projectRoot, { schemaId: 'readFrameworkManifest.relPath' });
    } catch (err) {
      if (err instanceof ValidationError) return null;
      throw err;
    }
  }
  return m;
}

/** Write `<projectRoot>/.jumpstart/framework-manifest.json`, creating
 *  the parent directory if needed. Pretty-printed JSON + trailing
 *  newline (legacy emit shape). */
export function writeFrameworkManifest(projectRoot: string, manifest: Manifest): void {
  const manifestPath = join(projectRoot, '.jumpstart', 'framework-manifest.json');
  const dir = dirname(manifestPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/** Read the npm package version from `<packageRoot>/package.json`.
 *  Returns `'0.0.0'` on missing file or parse failure (legacy
 *  fallback for fresh installs). */
export function getPackageVersion(packageRoot: string): string {
  const pkgPath = join(packageRoot, 'package.json');
  if (!existsSync(pkgPath)) return '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
