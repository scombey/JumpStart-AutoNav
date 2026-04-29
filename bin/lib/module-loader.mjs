#!/usr/bin/env node

/**
 * module-loader.js — Pluggable Module System for Jump Start (Item 91).
 *
 * Loads add-on modules from `.jumpstart/modules/`. Each module can provide
 * additional agents, templates, commands, and quality checks.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Discover all modules in the modules directory.
 *
 * @param {string} modulesDir - Path to `.jumpstart/modules/`.
 * @returns {Array<{name: string, path: string, manifest: object}>}
 */
export function discoverModules(modulesDir) {
  if (!fs.existsSync(modulesDir)) return [];

  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  const modules = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'README.md') continue;

    const modDir = path.join(modulesDir, entry.name);
    const manifestPath = path.join(modDir, 'module.json');

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      modules.push({
        name: manifest.name || entry.name,
        path: modDir,
        manifest
      });
    } catch (err) {
      // Skip modules with invalid manifests
    }
  }

  return modules;
}

/**
 * Validate a module manifest against the schema.
 *
 * @param {object} manifest - Parsed module.json content.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifest(manifest) {
  const errors = [];

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
  for (const key of ['agents', 'templates', 'commands', 'checks', 'skills']) {
    if (manifest[key] && !Array.isArray(manifest[key])) {
      errors.push(`"${key}" must be an array`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load a specific module by name from the enabled list.
 *
 * @param {string} modulesDir - Path to `.jumpstart/modules/`.
 * @param {string} moduleName - Name of the module to load.
 * @returns {{ loaded: boolean, module: object|null, error: string|null }}
 */
export function loadModule(modulesDir, moduleName) {
  const modDir = path.join(modulesDir, moduleName);

  if (!fs.existsSync(modDir)) {
    return { loaded: false, module: null, error: `Module directory not found: ${moduleName}` };
  }

  const manifestPath = path.join(modDir, 'module.json');
  if (!fs.existsSync(manifestPath)) {
    return { loaded: false, module: null, error: `No module.json found in ${moduleName}` };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const validation = validateManifest(manifest);

    if (!validation.valid) {
      return { loaded: false, module: null, error: `Invalid manifest: ${validation.errors.join('; ')}` };
    }

    // Resolve resource paths
    const resolve = (arr) => (arr || []).map(f => path.join(modDir, f)).filter(f => fs.existsSync(f));

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
        manifest
      },
      error: null
    };
  } catch (err) {
    return { loaded: false, module: null, error: `Failed to load ${moduleName}: ${err.message}` };
  }
}

/**
 * Load all enabled modules.
 *
 * @param {string} modulesDir - Path to `.jumpstart/modules/`.
 * @param {string[]} [enabledList] - List of module names to load. If null, loads all discovered.
 * @returns {{ modules: object[], errors: string[] }}
 */
export function loadAllModules(modulesDir, enabledList = null) {
  const discovered = discoverModules(modulesDir);
  const errors = [];
  const modules = [];

  const toLoad = enabledList
    ? discovered.filter(m => enabledList.includes(m.name))
    : discovered;

  for (const mod of toLoad) {
    const result = loadModule(modulesDir, mod.name);
    if (result.loaded) {
      modules.push(result.module);
    } else {
      errors.push(result.error);
    }
  }

  return { modules, errors };
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('module-loader.mjs')) {
  const modulesDir = process.argv[2] || path.join(process.cwd(), '.jumpstart', 'modules');
  const result = loadAllModules(modulesDir);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
