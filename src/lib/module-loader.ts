/**
 * module-loader.ts -- Pluggable Module System for Jump Start (Item 91).
 *
 * Loads add-on modules from `.jumpstart/modules/`. Each module can provide
 * additional agents, templates, commands, and quality checks.
 *
 * M3 hardening: assertNoPollution() applied to all parsed module.json before
 * use — rejects __proto__/constructor/prototype keys.
 * ADR-006: no process.exit.
 * ADR-009: modulesDir validated by caller.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModuleManifest {
  name: string;
  version: string;
  description: string;
  agents?: string[] | undefined;
  templates?: string[] | undefined;
  commands?: string[] | undefined;
  checks?: string[] | undefined;
  skills?: string[] | undefined;
  [key: string]: unknown;
}

export interface DiscoveredModule {
  name: string;
  path: string;
  manifest: ModuleManifest;
}

export interface LoadedModule {
  name: string;
  version: string;
  description: string;
  path: string;
  agents: string[];
  templates: string[];
  commands: string[];
  checks: string[];
  skills: string[];
  manifest: ModuleManifest;
}

export interface LoadModuleResult {
  loaded: boolean;
  module: LoadedModule | null;
  error: string | null;
}

export interface LoadAllModulesResult {
  modules: LoadedModule[];
  errors: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── M3 Hardening ─────────────────────────────────────────────────────────────

const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertNoPollution(obj: unknown, depth = 0): void {
  if (depth > 10 || typeof obj !== 'object' || obj === null) return;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (POLLUTION_KEYS.has(key)) {
      throw new Error(`Prototype pollution key detected: "${key}"`);
    }
    assertNoPollution((obj as Record<string, unknown>)[key], depth + 1);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Discover all modules in the modules directory.
 */
export function discoverModules(modulesDir: string): DiscoveredModule[] {
  if (!fs.existsSync(modulesDir)) return [];

  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  const modules: DiscoveredModule[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'README.md') continue;

    const modDir = path.join(modulesDir, entry.name);
    const manifestPath = path.join(modDir, 'module.json');

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
      assertNoPollution(raw);
      const manifest = raw as ModuleManifest;
      modules.push({
        name: (manifest.name as string | undefined) || entry.name,
        path: modDir,
        manifest,
      });
    } catch {
      // Skip modules with invalid or dangerous manifests
    }
  }

  return modules;
}

/**
 * Validate a module manifest against the schema.
 */
export function validateManifest(manifest: ModuleManifest): ValidationResult {
  const errors: string[] = [];

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Missing or invalid "name" field');
  } else if (!/^[a-z][a-z0-9-]*$/.test(manifest.name)) {
    errors.push('"name" must be lowercase kebab-case');
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('Missing or invalid "version" field');
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('"version" must follow semver (e.g., 1.0.0)');
  }

  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push('Missing or invalid "description" field');
  } else if (manifest.description.length < 10) {
    errors.push('"description" must be at least 10 characters');
  }

  // Validate resource arrays
  const resourceKeys: string[] = ['agents', 'templates', 'commands', 'checks', 'skills'];
  for (const key of resourceKeys) {
    const val = manifest[key];
    if (val !== undefined && !Array.isArray(val)) {
      errors.push(`"${key}" must be an array`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load a specific module by name.
 */
export function loadModule(modulesDir: string, moduleName: string): LoadModuleResult {
  const modDir = path.join(modulesDir, moduleName);

  if (!fs.existsSync(modDir)) {
    return { loaded: false, module: null, error: `Module directory not found: ${moduleName}` };
  }

  const manifestPath = path.join(modDir, 'module.json');
  if (!fs.existsSync(manifestPath)) {
    return { loaded: false, module: null, error: `No module.json found in ${moduleName}` };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
    assertNoPollution(raw);
    const manifest = raw as ModuleManifest;
    const validation = validateManifest(manifest);

    if (!validation.valid) {
      return {
        loaded: false,
        module: null,
        error: `Invalid manifest: ${validation.errors.join('; ')}`,
      };
    }

    // Resolve resource paths — only include files that actually exist
    const resolve = (arr: string[] | undefined): string[] =>
      (arr ?? []).map((f) => path.join(modDir, f)).filter((f) => fs.existsSync(f));

    return {
      loaded: true,
      module: {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        path: modDir,
        agents: resolve(manifest.agents),
        templates: resolve(manifest.templates),
        commands: resolve(manifest.commands),
        checks: resolve(manifest.checks),
        skills: resolve(manifest.skills),
        manifest,
      },
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { loaded: false, module: null, error: `Failed to load ${moduleName}: ${msg}` };
  }
}

/**
 * Load all enabled modules.
 * If enabledList is null/undefined, loads all discovered modules.
 */
export function loadAllModules(
  modulesDir: string,
  enabledList?: string[] | null
): LoadAllModulesResult {
  const discovered = discoverModules(modulesDir);
  const errors: string[] = [];
  const modules: LoadedModule[] = [];

  const toLoad = enabledList ? discovered.filter((m) => enabledList.includes(m.name)) : discovered;

  for (const mod of toLoad) {
    const result = loadModule(modulesDir, mod.name);
    if (result.loaded && result.module) {
      modules.push(result.module);
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return { modules, errors };
}
