/**
 * focus.js — Phase Focus Mode
 *
 * Allows users to focus on particular phases of the Jump Start workflow
 * instead of running the full sequential pipeline. Useful for role-based
 * workflows (e.g., Business Analysts focusing on Analyst + PM phases)
 * or converting existing artifacts (e.g., importing an existing PRD).
 *
 * Usage:
 *   echo '{"action":"list"}' | node bin/lib/focus.js
 *   echo '{"action":"set","preset":"business-analyst"}' | node bin/lib/focus.js
 *   echo '{"action":"set","start_phase":1,"end_phase":2}' | node bin/lib/focus.js
 *   echo '{"action":"clear"}' | node bin/lib/focus.js
 *   echo '{"action":"status"}' | node bin/lib/focus.js
 *
 * Output (stdout JSON):
 *   { "ok": true, ... }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');

/**
 * Phase names for display.
 */
const PHASE_NAMES = {
  '-1': 'Scout',
  '0': 'Challenger',
  '1': 'Analyst',
  '2': 'PM',
  '3': 'Architect',
  '4': 'Developer'
};

/**
 * Phase-to-slash-command map.
 */
const AGENT_COMMANDS = {
  '-1': '/jumpstart.scout',
  '0': '/jumpstart.challenge',
  '1': '/jumpstart.analyze',
  '2': '/jumpstart.plan',
  '3': '/jumpstart.architect',
  '4': '/jumpstart.build'
};

/**
 * Predefined focus presets for common role-based workflows.
 *
 * Each preset defines a start phase, end phase, description, and
 * the typical role that would use it.
 */
const PRESETS = {
  full: {
    description: 'Full workflow — all phases from Challenger through Developer. This is the default.',
    start_phase: 0,
    end_phase: 4,
    role: 'Full Team',
    phases: ['Challenger', 'Analyst', 'PM', 'Architect', 'Developer']
  },
  'business-analyst': {
    description: 'Business Analyst focus — challenge assumptions, define personas and user journeys, then write the PRD with user stories and acceptance criteria.',
    start_phase: 0,
    end_phase: 2,
    role: 'Business Analyst',
    phases: ['Challenger', 'Analyst', 'PM']
  },
  'prd-ready': {
    description: 'PRD conversion — focus only on the PM phase to convert an existing PRD into a JumpStart-ready format with structured user stories, acceptance criteria, and NFRs.',
    start_phase: 2,
    end_phase: 2,
    role: 'Product Manager',
    phases: ['PM']
  },
  discovery: {
    description: 'Discovery focus — challenge assumptions and analyze the problem space without committing to a PRD or architecture.',
    start_phase: 0,
    end_phase: 1,
    role: 'Product / Strategy',
    phases: ['Challenger', 'Analyst']
  },
  'technical-lead': {
    description: 'Technical Lead focus — design architecture and plan implementation tasks from an existing PRD. Assumes PRD is already available.',
    start_phase: 3,
    end_phase: 3,
    role: 'Technical Lead / Architect',
    phases: ['Architect']
  },
  'developer-only': {
    description: 'Developer focus — build from existing specs. Assumes architecture and implementation plan are already available.',
    start_phase: 4,
    end_phase: 4,
    role: 'Developer',
    phases: ['Developer']
  }
};

/**
 * Valid preset names.
 */
export const VALID_PRESETS = Object.keys(PRESETS);

/**
 * Valid phase numbers.
 */
const VALID_PHASES = [-1, 0, 1, 2, 3, 4];

/**
 * Get details for a specific preset.
 *
 * @param {string} presetName - Name of the preset.
 * @returns {object} Preset definition.
 * @throws {Error} If preset is invalid.
 */
export function getPreset(presetName) {
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(
      `Unknown focus preset: "${presetName}". Valid presets: ${VALID_PRESETS.join(', ')}`
    );
  }
  return { name: presetName, ...preset };
}

/**
 * List all available presets with descriptions.
 *
 * @returns {object[]} Array of preset summaries.
 */
export function listPresets() {
  return VALID_PRESETS.map(name => ({
    name,
    description: PRESETS[name].description,
    start_phase: PRESETS[name].start_phase,
    end_phase: PRESETS[name].end_phase,
    role: PRESETS[name].role,
    phases: PRESETS[name].phases
  }));
}

/**
 * Validate a phase range.
 *
 * @param {number} startPhase - Start phase number.
 * @param {number} endPhase - End phase number.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePhaseRange(startPhase, endPhase) {
  if (!VALID_PHASES.includes(startPhase)) {
    return { valid: false, error: `Invalid start phase: ${startPhase}. Valid phases: ${VALID_PHASES.join(', ')}` };
  }
  if (!VALID_PHASES.includes(endPhase)) {
    return { valid: false, error: `Invalid end phase: ${endPhase}. Valid phases: ${VALID_PHASES.join(', ')}` };
  }
  if (startPhase > endPhase) {
    return { valid: false, error: `Start phase (${startPhase}) cannot be after end phase (${endPhase})` };
  }
  return { valid: true };
}

/**
 * Check whether a given phase is within the active focus range.
 *
 * @param {number} phase - Phase number to check.
 * @param {object} focusConfig - Focus configuration with start_phase and end_phase.
 * @returns {boolean} True if the phase is within focus range.
 */
export function isPhaseInFocus(phase, focusConfig) {
  if (!focusConfig || !focusConfig.enabled) {
    return true; // No focus restriction — all phases are in range
  }
  const start = focusConfig.start_phase;
  const end = focusConfig.end_phase;
  if (start === undefined || start === null || end === undefined || end === null) {
    return true;
  }
  return phase >= start && phase <= end;
}

/**
 * Get the phases included in a focus range.
 *
 * @param {number} startPhase - Start phase.
 * @param {number} endPhase - End phase.
 * @returns {object[]} Array of { phase, name, command }.
 */
export function getPhasesInRange(startPhase, endPhase) {
  const phases = [];
  for (const p of VALID_PHASES) {
    if (p >= startPhase && p <= endPhase) {
      phases.push({
        phase: p,
        name: PHASE_NAMES[String(p)],
        command: AGENT_COMMANDS[String(p)]
      });
    }
  }
  return phases;
}

/**
 * Build the focus configuration object from a preset or custom range.
 *
 * @param {object} options - Either { preset } or { start_phase, end_phase }.
 * @returns {object} Focus configuration.
 * @throws {Error} If preset is invalid or range is invalid.
 */
export function buildFocusConfig(options) {
  if (options.preset) {
    const preset = getPreset(options.preset);
    return {
      enabled: options.preset !== 'full',
      preset: options.preset,
      start_phase: preset.start_phase,
      end_phase: preset.end_phase,
      description: preset.description,
      role: preset.role,
      phases: getPhasesInRange(preset.start_phase, preset.end_phase)
    };
  }

  const start = options.start_phase;
  const end = options.end_phase;
  const validation = validatePhaseRange(start, end);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const phases = getPhasesInRange(start, end);
  return {
    enabled: !(start === 0 && end === 4),
    preset: null,
    start_phase: start,
    end_phase: end,
    description: `Custom focus: Phase ${start} (${PHASE_NAMES[String(start)]}) through Phase ${end} (${PHASE_NAMES[String(end)]})`,
    role: 'Custom',
    phases
  };
}

/**
 * Read focus configuration from config.yaml.
 *
 * @param {string} configPath - Path to config.yaml.
 * @returns {object|null} Focus config or null if not set.
 */
export function readFocusFromConfig(configPath) {
  if (!existsSync(configPath)) return null;
  try {
    const content = readFileSync(configPath, 'utf8');
    const lines = content.split('\n');

    // Find the focus: section and extract its indented children
    let inFocus = false;
    const focusLines = [];
    for (const line of lines) {
      if (/^focus:\s*$/.test(line)) {
        inFocus = true;
        continue;
      }
      if (inFocus) {
        // Stop at next top-level key or end of file
        if (/^\S/.test(line) && line.trim() !== '') {
          break;
        }
        focusLines.push(line);
      }
    }

    if (focusLines.length === 0) return null;

    const section = focusLines.join('\n');
    const enabled = /^\s+enabled:\s*true/m.test(section);
    if (!enabled) return null;

    const presetMatch = section.match(/^\s+preset:\s*(\S+)/m);
    const startMatch = section.match(/^\s+start_phase:\s*(-?\d+)/m);
    const endMatch = section.match(/^\s+end_phase:\s*(-?\d+)/m);

    const preset = presetMatch ? presetMatch[1] : null;
    const startPhase = startMatch ? parseInt(startMatch[1], 10) : null;
    const endPhase = endMatch ? parseInt(endMatch[1], 10) : null;

    if (preset && preset !== 'null') {
      try {
        return buildFocusConfig({ preset });
      } catch {
        return null;
      }
    }

    if (startPhase !== null && endPhase !== null) {
      try {
        return buildFocusConfig({ start_phase: startPhase, end_phase: endPhase });
      } catch {
        return null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Write focus configuration to config.yaml.
 *
 * Inserts or updates the focus: section in the config file.
 *
 * @param {string} configPath - Path to config.yaml.
 * @param {object} focusConfig - Focus config from buildFocusConfig().
 * @returns {{ success: boolean, error?: string }}
 */
export function writeFocusToConfig(configPath, focusConfig) {
  if (!existsSync(configPath)) {
    return { success: false, error: 'Config file not found. Run jumpstart-mode init first.' };
  }

  let content = readFileSync(configPath, 'utf8');

  const focusYaml = [
    'focus:',
    `  enabled: ${focusConfig.enabled}`,
    `  preset: ${focusConfig.preset || 'null'}`,
    `  start_phase: ${focusConfig.start_phase}`,
    `  end_phase: ${focusConfig.end_phase}`
  ].join('\n');

  // Check if focus section already exists
  const focusPattern = /^focus:\s*\n(?:(?:[ \t]+\S.*|[ \t]*)?\n?)*/m;
  if (focusPattern.test(content)) {
    content = content.replace(focusPattern, focusYaml + '\n\n');
  } else {
    // Insert before the workflow: section (or at end)
    const workflowIndex = content.indexOf('\nworkflow:');
    if (workflowIndex !== -1) {
      const insertComment = '\n# ---------------------------------------------------------------------------\n# Focus Mode — Restrict workflow to specific phases\n# ---------------------------------------------------------------------------\n';
      content = content.slice(0, workflowIndex) + insertComment + focusYaml + '\n' + content.slice(workflowIndex);
    } else {
      content += '\n' + focusYaml + '\n';
    }
  }

  writeFileSync(configPath, content, 'utf8');
  return { success: true };
}

/**
 * Clear focus configuration (reset to full workflow).
 *
 * @param {string} configPath - Path to config.yaml.
 * @returns {{ success: boolean, error?: string }}
 */
export function clearFocusFromConfig(configPath) {
  return writeFocusToConfig(configPath, {
    enabled: false,
    preset: 'full',
    start_phase: 0,
    end_phase: 4
  });
}

/**
 * Get current focus status for a project.
 *
 * @param {object} options - { root }
 * @returns {object} Status object.
 */
export function getFocusStatus(options = {}) {
  const root = options.root || '.';
  const configPath = join(root, '.jumpstart', 'config.yaml');

  if (!existsSync(configPath)) {
    return { active: false, message: 'Project not initialized.' };
  }

  const focusConfig = readFocusFromConfig(configPath);
  if (!focusConfig || !focusConfig.enabled) {
    return {
      active: false,
      message: 'No focus restriction — full workflow is active.',
      preset: 'full',
      phases: getPhasesInRange(0, 4)
    };
  }

  return {
    active: true,
    preset: focusConfig.preset || 'custom',
    start_phase: focusConfig.start_phase,
    end_phase: focusConfig.end_phase,
    description: focusConfig.description,
    role: focusConfig.role,
    phases: focusConfig.phases,
    message: `Focus mode active: ${focusConfig.description}`
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (process.argv[1] && (
  process.argv[1].endsWith('focus.js') ||
  process.argv[1].endsWith('focus')
)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const parsed = input.trim() ? JSON.parse(input) : {};
      const action = parsed.action || 'list';
      let result;

      if (action === 'list') {
        result = { presets: listPresets() };
      } else if (action === 'set') {
        if (parsed.preset) {
          result = buildFocusConfig({ preset: parsed.preset });
        } else {
          result = buildFocusConfig({ start_phase: parsed.start_phase, end_phase: parsed.end_phase });
        }
      } else if (action === 'clear') {
        const root = parsed.root || '.';
        const configPath = join(root, '.jumpstart', 'config.yaml');
        result = clearFocusFromConfig(configPath);
      } else if (action === 'status') {
        result = getFocusStatus({ root: parsed.root || '.' });
      } else {
        process.stderr.write(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }) + '\n');
        process.exit(2);
        return;
      }

      process.stdout.write(JSON.stringify({ ok: true, timestamp: new Date().toISOString(), ...result }, null, 2) + '\n');
    } catch (err) {
      process.stderr.write(JSON.stringify({ ok: false, error: err.message }) + '\n');
      process.exit(2);
    }
  });

  if (process.stdin.isTTY) {
    const presets = listPresets();
    process.stdout.write(JSON.stringify({ ok: true, timestamp: new Date().toISOString(), presets }, null, 2) + '\n');
  }
}
