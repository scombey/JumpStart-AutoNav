/**
 * framework-manifest.js — Framework File Classification & Manifest Generation
 *
 * Classifies files as framework-owned vs user-owned and generates content-hash
 * manifests to enable safe upgrades that preserve user customizations.
 *
 * Usage:
 *   import { generateManifest, diffManifest, isFrameworkOwned } from './framework-manifest.js';
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } = require('fs');
const { join, relative, dirname, sep } = require('path');
const { createHash } = require('crypto');

/**
 * Glob-style path patterns for framework-owned files.
 * These are files shipped with the npm package and safe to overwrite on upgrade.
 */
export const FRAMEWORK_OWNED_PATTERNS = [
  // Agent personas
  '.jumpstart/agents/',
  // Templates
  '.jumpstart/templates/',
  // JSON Schemas
  '.jumpstart/schemas/',
  // Guides
  '.jumpstart/guides/',
  // Handoff schemas
  '.jumpstart/handoffs/',
  // Compatibility mapping
  '.jumpstart/compat/',
  // Commands reference
  '.jumpstart/commands/',
  // Template inheritance base
  '.jumpstart/base/',
  // Modules readme
  '.jumpstart/modules/README.md',
  // Framework docs
  '.jumpstart/roadmap.md',
  '.jumpstart/invariants.md',
  '.jumpstart/domain-complexity.csv',
  '.jumpstart/glossary.md',
  // Integration files
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  // GitHub Copilot integration
  '.github/agents/',
  '.github/instructions/specs.instructions.md',
  '.github/prompts/',
  '.github/copilot-instructions.md',
];

/**
 * Paths that are always user-owned and must NEVER be overwritten.
 * These take precedence over framework patterns if there's any overlap.
 */
export const USER_OWNED_PATHS = [
  '.jumpstart/config.yaml',
  '.jumpstart/state/',
  '.jumpstart/installed.json',
  '.jumpstart/manifest.json',
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

/**
 * Check if a relative path is user-owned (protected from upgrade).
 * @param {string} relPath — Path relative to project root, using forward slashes
 * @returns {boolean}
 */
export function isUserOwned(relPath) {
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

/**
 * Check if a relative path is framework-owned (safe to upgrade).
 * User-owned paths take precedence.
 * @param {string} relPath — Path relative to project root, using forward slashes
 * @returns {boolean}
 */
export function isFrameworkOwned(relPath) {
  const normalized = relPath.replace(/\\/g, '/');

  // User-owned takes precedence
  if (isUserOwned(normalized)) {
    return false;
  }

  for (const pattern of FRAMEWORK_OWNED_PATTERNS) {
    if (pattern.endsWith('/')) {
      if (normalized.startsWith(pattern)) {
        return true;
      }
    } else if (normalized === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Compute SHA-256 hash of a file's contents.
 * @param {string} filePath — Absolute path to the file
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function hashFile(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively walk a directory and collect all file paths.
 * @param {string} dir — Absolute directory path
 * @param {string} [rootDir] — Root for computing relative paths
 * @returns {string[]} Array of relative paths (forward slashes)
 */
function walkDir(dir, rootDir) {
  rootDir = rootDir || dir;
  const results = [];

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

/**
 * Generate a framework manifest from a directory.
 * Scans all files, filters to framework-owned, and hashes each one.
 *
 * @param {string} rootDir — Project or package root directory
 * @param {object} [options]
 * @param {string} [options.version] — Framework version to stamp
 * @param {boolean} [options.allFiles] — If true, include all files (not just framework-owned)
 * @returns {{ frameworkVersion: string, generatedAt: string, files: Record<string, string> }}
 */
export function generateManifest(rootDir, options = {}) {
  const version = options.version || '0.0.0';
  const allFiles = options.allFiles || false;

  const manifest = {
    frameworkVersion: version,
    generatedAt: new Date().toISOString(),
    files: {},
  };

  // Walk .jumpstart/
  const jumpstartDir = join(rootDir, '.jumpstart');
  if (existsSync(jumpstartDir)) {
    const files = walkDir(jumpstartDir, rootDir);
    for (const relPath of files) {
      if (allFiles || isFrameworkOwned(relPath)) {
        manifest.files[relPath] = hashFile(join(rootDir, relPath));
      }
    }
  }

  // Walk .github/
  const githubDir = join(rootDir, '.github');
  if (existsSync(githubDir)) {
    const files = walkDir(githubDir, rootDir);
    for (const relPath of files) {
      if (allFiles || isFrameworkOwned(relPath)) {
        manifest.files[relPath] = hashFile(join(rootDir, relPath));
      }
    }
  }

  // Check top-level integration files
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
 * Diff two manifests to determine what changed between versions.
 *
 * @param {object} oldManifest — Previous manifest (from installed version)
 * @param {object} newManifest — New manifest (from package being upgraded to)
 * @returns {{ added: string[], removed: string[], changed: string[], unchanged: string[] }}
 */
export function diffManifest(oldManifest, newManifest) {
  const oldFiles = oldManifest.files || {};
  const newFiles = newManifest.files || {};

  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  // Files in new but not old → added
  // Files in both but different hash → changed
  // Files in both with same hash → unchanged
  for (const [path, hash] of Object.entries(newFiles)) {
    if (!(path in oldFiles)) {
      added.push(path);
    } else if (oldFiles[path] !== hash) {
      changed.push(path);
    } else {
      unchanged.push(path);
    }
  }

  // Files in old but not new → removed
  for (const path of Object.keys(oldFiles)) {
    if (!(path in newFiles)) {
      removed.push(path);
    }
  }

  return { added, removed, changed, unchanged };
}

/**
 * Detect which framework-owned files the user has modified locally.
 * Compares user's current file hashes against the installed manifest.
 *
 * @param {string} projectRoot — Project root directory
 * @param {object} installedManifest — The manifest from when the framework was installed
 * @returns {{ modified: string[], unmodified: string[], missing: string[] }}
 */
export function detectUserModifications(projectRoot, installedManifest) {
  const files = installedManifest.files || {};
  const modified = [];
  const unmodified = [];
  const missing = [];

  for (const [relPath, originalHash] of Object.entries(files)) {
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

/**
 * Read the framework manifest from a project directory.
 * @param {string} projectRoot — Project root directory
 * @returns {object|null} The manifest object or null if not found
 */
export function readFrameworkManifest(projectRoot) {
  const manifestPath = join(projectRoot, '.jumpstart', 'framework-manifest.json');
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write the framework manifest to a project directory.
 * @param {string} projectRoot — Project root directory
 * @param {object} manifest — The manifest object
 */
export function writeFrameworkManifest(projectRoot, manifest) {
  const manifestPath = join(projectRoot, '.jumpstart', 'framework-manifest.json');
  const dir = dirname(manifestPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

/**
 * Get the framework version from the package.json in the npm package root.
 * @param {string} packageRoot — Root of the npm package
 * @returns {string} Version string
 */
export function getPackageVersion(packageRoot) {
  const pkgPath = join(packageRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    return '0.0.0';
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
