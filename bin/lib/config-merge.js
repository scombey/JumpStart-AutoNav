/**
 * config-merge.js — Three-Way YAML Config Merge for Framework Upgrades
 *
 * Performs a three-way merge of config.yaml during upgrades:
 *   oldDefault (what shipped with the installed version)
 *   newDefault (what ships with the new version)
 *   userCurrent (what the user has now — may include customizations)
 *
 * Strategy:
 *   - If user changed a key from oldDefault → keep user's value
 *   - If user kept oldDefault and newDefault changed it → adopt newDefault
 *   - New keys in newDefault → add to merged result
 *   - Keys removed in newDefault → preserve if user modified, remove if unchanged
 *   - The "hooks:" section is ALWAYS preserved from user (never overwritten)
 *
 * Usage:
 *   import { mergeConfigs, parseYamlPreservingComments } from './config-merge.js';
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');

/**
 * Simple YAML parser that handles the subset used by config.yaml.
 * Returns a flat map of dotted key paths to values.
 * Handles nested objects, arrays (as full value), and inline comments.
 *
 * @param {string} yamlStr — YAML content string
 * @returns {Record<string, string>} Flat map of key paths to raw value strings
 */
export function flattenYaml(yamlStr) {
  const result = {};
  const lines = yamlStr.split('\n');
  const stack = []; // { indent, key }

  for (const line of lines) {
    // Skip empty lines and comment-only lines
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;

    // Match key: value lines
    const match = line.match(/^(\s*)([\w][\w.-]*)\s*:\s*(.*)/);
    if (!match) continue;

    const indent = match[1].length;
    const key = match[2];
    let rawValue = match[3];

    // Strip inline comments (but not inside quotes)
    const valueWithoutComment = rawValue.replace(/\s+#.*$/, '').trim();

    // Pop stack to find parent
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    // Build full key path
    const parentPath = stack.map(s => s.key).join('.');
    const fullKey = parentPath ? `${parentPath}.${key}` : key;

    // If the value is empty, this is a parent node — push to stack
    if (valueWithoutComment === '' || valueWithoutComment === '|' || valueWithoutComment === '>') {
      stack.push({ indent, key });
    } else {
      // Store as leaf value
      result[fullKey] = valueWithoutComment;
      // Also push to stack in case there are nested keys at deeper indent
      stack.push({ indent, key });
    }
  }

  return result;
}

/**
 * Three-way merge of config values.
 *
 * @param {string} oldDefaultYaml — Config YAML from the previously installed version
 * @param {string} newDefaultYaml — Config YAML from the version being upgraded to
 * @param {string} userCurrentYaml — User's current config YAML
 * @returns {{ mergedYaml: string, conflicts: Array<{key: string, oldDefault: string, newDefault: string, userValue: string}>, newKeys: string[], preservedKeys: string[] }}
 */
export function mergeConfigs(oldDefaultYaml, newDefaultYaml, userCurrentYaml) {
  const oldDefaults = flattenYaml(oldDefaultYaml);
  const newDefaults = flattenYaml(newDefaultYaml);
  const userValues = flattenYaml(userCurrentYaml);

  const conflicts = [];
  const newKeys = [];
  const preservedKeys = [];

  // Protected sections — never overwrite these
  const protectedPrefixes = ['hooks.', 'project.name', 'project.description', 'project.approver'];

  // Start with the user's current YAML as the base
  let mergedYaml = userCurrentYaml;

  // PASS 1: Identify conflicts and values to update
  for (const [key, newValue] of Object.entries(newDefaults)) {
    // Skip protected sections
    if (protectedPrefixes.some(p => key.startsWith(p))) {
      continue;
    }

    const oldValue = oldDefaults[key];
    const userValue = userValues[key];

    if (oldValue === undefined && userValue === undefined) {
      // New key that doesn't exist in old or user → will be added
      newKeys.push(key);
    } else if (oldValue === undefined && userValue !== undefined) {
      // Key exists in user but not old default — user added it, preserve
      preservedKeys.push(key);
    } else if (userValue === undefined) {
      // Key was in old default but user removed it — respect user's deletion
      preservedKeys.push(key);
    } else if (userValue !== oldValue && userValue !== newValue) {
      // User changed from old default, and new default also changed → conflict
      if (oldValue !== newValue) {
        conflicts.push({ key, oldDefault: oldValue, newDefault: newValue, userValue });
      }
      // If old === new, no action needed (user's change stands)
      preservedKeys.push(key);
    } else if (userValue === oldValue && newValue !== oldValue) {
      // User kept default, but new version changed it → adopt new default
      mergedYaml = replaceYamlValue(mergedYaml, key, oldValue, newValue);
    }
    // else: user and new both same, or user changed but new didn't → no action
  }

  // PASS 2: Append new keys at the end of the file
  if (newKeys.length > 0) {
    const newKeyBlock = buildNewKeysBlock(newKeys, newDefaults, newDefaultYaml);
    if (newKeyBlock) {
      mergedYaml = mergedYaml.trimEnd() + '\n\n' + newKeyBlock + '\n';
    }
  }

  return { mergedYaml, conflicts, newKeys, preservedKeys };
}

/**
 * Replace a YAML value in the raw YAML string.
 * Attempts to find the key and replace its value while preserving formatting.
 *
 * @param {string} yamlStr — Raw YAML string
 * @param {string} dottedKey — Dotted key path (e.g. "ceremony.profile")
 * @param {string} oldValue — The value to find
 * @param {string} newValue — The value to replace with
 * @returns {string} Updated YAML string
 */
function replaceYamlValue(yamlStr, dottedKey, oldValue, newValue) {
  const keyParts = dottedKey.split('.');
  const leafKey = keyParts[keyParts.length - 1];

  // Build a regex that matches the leaf key with its value
  // Account for optional inline comments
  const escapedOld = oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `^(\\s*${leafKey}\\s*:\\s*)${escapedOld}(\\s*(?:#.*)?)$`,
    'm'
  );

  const replaced = yamlStr.replace(pattern, `$1${newValue}$2`);

  // If regex didn't match (complex value), return unchanged
  return replaced;
}

/**
 * Build a YAML block for new keys that need to be appended.
 * Extracts the relevant lines from the new default YAML.
 *
 * @param {string[]} newKeys — Dotted key paths of new keys
 * @param {Record<string,string>} newDefaults — Flat key-value map
 * @param {string} newDefaultYaml — Full new default YAML for context extraction
 * @returns {string} YAML block to append
 */
function buildNewKeysBlock(newKeys, newDefaults, newDefaultYaml) {
  const lines = [];
  lines.push('# ---------------------------------------------------------------------------');
  lines.push('# New settings added by framework upgrade');
  lines.push('# ---------------------------------------------------------------------------');

  // Group keys by their top-level section
  const sections = {};
  for (const key of newKeys) {
    const topLevel = key.split('.')[0];
    if (!sections[topLevel]) sections[topLevel] = [];
    sections[topLevel].push(key);
  }

  // For each section, extract the relevant YAML block from the new default
  for (const [section, keys] of Object.entries(sections)) {
    // Try to find the section in newDefaultYaml and extract it
    const sectionBlock = extractSectionFromYaml(newDefaultYaml, section);
    if (sectionBlock) {
      lines.push('');
      lines.push(sectionBlock);
    } else {
      // Fallback: reconstruct from flat values
      lines.push('');
      lines.push(`${section}:`);
      for (const key of keys) {
        const leafKey = key.split('.').slice(1).join('.');
        const value = newDefaults[key];
        if (leafKey) {
          lines.push(`  ${leafKey}: ${value}`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Extract a top-level section (and its children) from raw YAML.
 *
 * @param {string} yamlStr — Full YAML string
 * @param {string} sectionName — Top-level key name
 * @returns {string|null} The section block or null if not found
 */
function extractSectionFromYaml(yamlStr, sectionName) {
  const lines = yamlStr.split('\n');
  let capturing = false;
  let capturedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!capturing) {
      // Look for the section start (no indent, key:)
      const match = line.match(new RegExp(`^${sectionName}\\s*:`));
      if (match) {
        capturing = true;
        // Include preceding comment lines
        let j = i - 1;
        const precedingComments = [];
        while (j >= 0 && /^\s*#/.test(lines[j])) {
          precedingComments.unshift(lines[j]);
          j--;
        }
        capturedLines.push(...precedingComments);
        capturedLines.push(line);
      }
    } else {
      // Continue capturing until we hit another top-level key or end
      if (/^[a-zA-Z]/.test(line) && !line.startsWith('#')) {
        break; // New top-level section
      }
      capturedLines.push(line);
    }
  }

  if (capturedLines.length === 0) return null;

  // Trim trailing empty lines
  while (capturedLines.length > 0 && capturedLines[capturedLines.length - 1].trim() === '') {
    capturedLines.pop();
  }

  return capturedLines.join('\n');
}

/**
 * Read config.yaml from a directory.
 * @param {string} dir — Directory containing config.yaml
 * @returns {string|null} YAML content or null
 */
export function readConfig(dir) {
  const configPath = join(dir, '.jumpstart', 'config.yaml');
  if (!existsSync(configPath)) return null;
  return readFileSync(configPath, 'utf8');
}

/**
 * Write config.yaml to a directory.
 * @param {string} dir — Directory containing config.yaml
 * @param {string} yamlContent — YAML content to write
 */
export function writeConfig(dir, yamlContent) {
  const configPath = join(dir, '.jumpstart', 'config.yaml');
  writeFileSync(configPath, yamlContent, 'utf8');
}

/**
 * Write conflicts to a companion file for manual resolution.
 * @param {string} dir — Project root directory
 * @param {Array<{key: string, oldDefault: string, newDefault: string, userValue: string}>} conflicts
 * @param {string} oldVersion — Previous framework version
 * @param {string} newVersion — New framework version
 */
export function writeConflictsFile(dir, conflicts, oldVersion, newVersion) {
  const conflictPath = join(dir, '.jumpstart', 'config.yaml.conflicts');
  const lines = [
    `# Config Merge Conflicts — Framework Upgrade ${oldVersion} → ${newVersion}`,
    `# Generated: ${new Date().toISOString()}`,
    '#',
    '# The following keys had conflicting changes. Your customization was preserved',
    '# in config.yaml, but the framework also changed the default value.',
    '# Review each conflict and update config.yaml if needed.',
    '#',
    '# After resolving, delete this file.',
    '',
  ];

  for (const c of conflicts) {
    lines.push(`## ${c.key}`);
    lines.push(`# Your value (preserved):    ${c.userValue}`);
    lines.push(`# Old default:               ${c.oldDefault}`);
    lines.push(`# New default (recommended):  ${c.newDefault}`);
    lines.push('');
  }

  writeFileSync(conflictPath, lines.join('\n'), 'utf8');
}
