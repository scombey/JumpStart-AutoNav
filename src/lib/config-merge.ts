/**
 * config-merge.ts — three-way YAML merge for framework upgrades (T4.1.10 port).
 *
 * Pure-library port of `bin/lib/config-merge.mjs` (5 exports preserved
 * verbatim: `flattenYaml`, `mergeConfigs`, `readConfig`, `writeConfig`,
 * `writeConflictsFile`). The merge logic is the load-bearing piece for
 * `bin/upgrade.js`'s "framework version bump preserves user
 * customizations" workflow — every branch is preserved bit-for-bit so
 * upgrade-time semantics don't drift.
 *
 * **Note on `flattenYaml`.** The legacy module ships its own indentation-
 * based YAML flattener that produces a `Record<string, rawValueString>`
 * with dotted-key paths. This is DIFFERENT from `parseSimpleYaml` (which
 * T4.1.9 deleted) — `flattenYaml` returns RAW VALUE STRINGS (with
 * type-coercion deferred to the caller) rather than fully parsed
 * objects. The merge math depends on raw-string equality (`oldValue !==
 * newValue` compares strings, not parsed values), so we preserve
 * `flattenYaml` verbatim. It's a different beast from `parseSimpleYaml`.
 *
 * **The hooks: section preservation is a hard contract.** Per legacy
 * line 94, four prefixes are NEVER overwritten: `hooks.`,
 * `project.name`, `project.description`, `project.approver`. If you
 * change the prefix list you change framework-upgrade behavior for
 * every existing project.
 *
 * @see bin/lib/config-merge.mjs (legacy reference)
 * @see bin/upgrade.js (caller — drives the three-way merge during npm upgrade)
 * @see specs/implementation-plan.md T4.1.10
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Conflict record produced by `mergeConfigs` for keys where both the
 * user and the framework changed the default. */
export interface ConfigConflict {
  key: string;
  oldDefault: string;
  newDefault: string;
  userValue: string;
}

/** Result of `mergeConfigs`. */
export interface MergeResult {
  mergedYaml: string;
  conflicts: ConfigConflict[];
  newKeys: string[];
  preservedKeys: string[];
}

/**
 * Flatten a YAML config into dotted-key → raw-value-string map.
 * Indentation-based parser (NOT a full YAML 1.2 parser); preserved
 * verbatim from legacy because the merge math relies on this exact
 * output shape including its quirks (empty-value parents are still
 * pushed onto the stack so deeper-indent keys nest correctly).
 *
 * Inline comments after a value are stripped; comment-only lines are
 * skipped.
 */
export function flattenYaml(yamlStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = yamlStr.split('\n');
  const stack: Array<{ indent: number; key: string }> = [];

  for (const line of lines) {
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;

    const match = line.match(/^(\s*)([\w][\w.-]*)\s*:\s*(.*)/);
    if (!match || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
      continue;
    }

    const indent = match[1].length;
    const key = match[2];
    const rawValue = match[3];

    const valueWithoutComment = rawValue.replace(/\s+#.*$/, '').trim();

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top === undefined || top.indent < indent) break;
      stack.pop();
    }

    const parentPath = stack.map((s) => s.key).join('.');
    const fullKey = parentPath ? `${parentPath}.${key}` : key;

    if (valueWithoutComment === '' || valueWithoutComment === '|' || valueWithoutComment === '>') {
      stack.push({ indent, key });
    } else {
      result[fullKey] = valueWithoutComment;
      stack.push({ indent, key });
    }
  }

  return result;
}

/**
 * Three-way merge of config values per the legacy contract:
 *   - User changed from oldDefault → preserve user's value
 *   - User kept oldDefault and newDefault changed → adopt newDefault
 *   - Both user AND newDefault changed in different ways → conflict
 *   - New keys in newDefault → append at end
 *   - Removed keys → preserved if user modified, dropped if unchanged
 *   - Protected prefixes (`hooks.`, `project.name`, `project.description`,
 *     `project.approver`) → NEVER touched
 */
export function mergeConfigs(
  oldDefaultYaml: string,
  newDefaultYaml: string,
  userCurrentYaml: string
): MergeResult {
  const oldDefaults = flattenYaml(oldDefaultYaml);
  const newDefaults = flattenYaml(newDefaultYaml);
  const userValues = flattenYaml(userCurrentYaml);

  const conflicts: ConfigConflict[] = [];
  const newKeys: string[] = [];
  const preservedKeys: string[] = [];

  const protectedPrefixes = ['hooks.', 'project.name', 'project.description', 'project.approver'];

  let mergedYaml = userCurrentYaml;

  for (const [key, newValue] of Object.entries(newDefaults)) {
    if (protectedPrefixes.some((p) => key.startsWith(p))) continue;

    const oldValue = oldDefaults[key];
    const userValue = userValues[key];

    if (oldValue === undefined && userValue === undefined) {
      newKeys.push(key);
    } else if (oldValue === undefined && userValue !== undefined) {
      preservedKeys.push(key);
    } else if (userValue === undefined) {
      preservedKeys.push(key);
    } else if (userValue !== oldValue && userValue !== newValue) {
      if (oldValue !== undefined && oldValue !== newValue) {
        conflicts.push({ key, oldDefault: oldValue, newDefault: newValue, userValue });
      }
      preservedKeys.push(key);
    } else if (userValue === oldValue && newValue !== oldValue && oldValue !== undefined) {
      mergedYaml = replaceYamlValue(mergedYaml, key, oldValue, newValue);
    }
  }

  if (newKeys.length > 0) {
    const newKeyBlock = buildNewKeysBlock(newKeys, newDefaults, newDefaultYaml);
    if (newKeyBlock) {
      mergedYaml = `${mergedYaml.trimEnd()}\n\n${newKeyBlock}\n`;
    }
  }

  return { mergedYaml, conflicts, newKeys, preservedKeys };
}

/**
 * Replace a YAML value in the raw string.
 *
 * Pit Crew M2-Final Adversary 1 + 2 (HIGH, confirmed exploits) closed:
 *   - Adv-1: prior version split off the LEAF key and matched any
 *     line ending with that name, regardless of indentation. A user
 *     with `version: 1.0` at the top AND `framework.version: 1.0`
 *     nested would have the TOP key clobbered when the framework
 *     upgrade targeted `framework.version`. Fix: anchor the regex to
 *     the expected indent (2-space-per-level by convention).
 *   - Adv-2: prior version interpolated `newValue` into the regex
 *     replacement template, so values containing `$&` / `$1` / `` $` ``
 *     were re-interpreted by `String.replace`. Fix: use the function
 *     form of `replace` which does NOT interpret `$N` patterns.
 *
 * Returns the input unchanged if the regex doesn't match (defensive
 * pass-through for complex multi-line values; legacy behavior).
 */
function replaceYamlValue(
  yamlStr: string,
  dottedKey: string,
  oldValue: string,
  newValue: string
): string {
  const keyParts = dottedKey.split('.');
  const leafKey = keyParts[keyParts.length - 1];
  if (leafKey === undefined) return yamlStr;

  const escapedOld = oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedLeaf = leafKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Indent anchoring: top-level keys (depth 1) match at column 0;
  // each nesting level adds two spaces (the convention every
  // jumpstart-mode config and the legacy flattenYaml produce).
  const expectedIndent = '\\s'.repeat(Math.max(0, (keyParts.length - 1) * 2));
  const pattern = new RegExp(
    `^(${expectedIndent}${escapedLeaf}\\s*:\\s*)${escapedOld}(\\s*(?:#.*)?)$`,
    'm'
  );

  // Function-form replace: `$N` / `$&` in the returned string are
  // taken literally, never re-interpreted as backreferences.
  return yamlStr.replace(
    pattern,
    (_match, prefix: string, suffix: string) => `${prefix}${newValue}${suffix}`
  );
}

/**
 * Build the YAML block for new keys appended after upgrade. Groups
 * keys by top-level section + tries to extract the section from the
 * new-default YAML (preserving its comments). Falls back to a flat
 * `section: {leaf}: {value}` reconstruction if the section can't be
 * found.
 */
function buildNewKeysBlock(
  newKeys: string[],
  newDefaults: Record<string, string>,
  newDefaultYaml: string
): string {
  const lines: string[] = [];
  lines.push('# ---------------------------------------------------------------------------');
  lines.push('# New settings added by framework upgrade');
  lines.push('# ---------------------------------------------------------------------------');

  const sections: Record<string, string[]> = {};
  for (const key of newKeys) {
    const topLevel = key.split('.')[0];
    if (topLevel === undefined) continue;
    if (!sections[topLevel]) sections[topLevel] = [];
    sections[topLevel].push(key);
  }

  for (const [section, keys] of Object.entries(sections)) {
    const sectionBlock = extractSectionFromYaml(newDefaultYaml, section);
    if (sectionBlock) {
      lines.push('');
      lines.push(sectionBlock);
    } else {
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
 * Extract a top-level section + its descendants from raw YAML. Includes
 * preceding comment block (so framework upgrades can carry forward
 * their explanatory comments). Returns null if the section isn't found.
 */
function extractSectionFromYaml(yamlStr: string, sectionName: string): string | null {
  const lines = yamlStr.split('\n');
  let capturing = false;
  const capturedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (!capturing) {
      const match = line.match(new RegExp(`^${sectionName}\\s*:`));
      if (match) {
        capturing = true;
        let j = i - 1;
        const precedingComments: string[] = [];
        while (j >= 0) {
          const prev = lines[j];
          if (prev === undefined || !/^\s*#/.test(prev)) break;
          precedingComments.unshift(prev);
          j--;
        }
        capturedLines.push(...precedingComments);
        capturedLines.push(line);
      }
    } else {
      if (/^[a-zA-Z]/.test(line) && !line.startsWith('#')) break;
      capturedLines.push(line);
    }
  }

  if (capturedLines.length === 0) return null;

  while (capturedLines.length > 0) {
    const last = capturedLines[capturedLines.length - 1];
    if (last === undefined || last.trim() !== '') break;
    capturedLines.pop();
  }

  return capturedLines.join('\n');
}

/** Read `<dir>/.jumpstart/config.yaml`, returning the contents or null. */
export function readConfig(dir: string): string | null {
  const configPath = join(dir, '.jumpstart', 'config.yaml');
  if (!existsSync(configPath)) return null;
  return readFileSync(configPath, 'utf8');
}

/** Write `<dir>/.jumpstart/config.yaml`. */
export function writeConfig(dir: string, yamlContent: string): void {
  const configPath = join(dir, '.jumpstart', 'config.yaml');
  writeFileSync(configPath, yamlContent, 'utf8');
}

/**
 * Write `<dir>/.jumpstart/config.yaml.conflicts` for manual resolution
 * after an upgrade. Format matches legacy verbatim — downstream
 * tooling (or a human) reads the structured `## key` blocks.
 */
export function writeConflictsFile(
  dir: string,
  conflicts: ConfigConflict[],
  oldVersion: string,
  newVersion: string
): void {
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
