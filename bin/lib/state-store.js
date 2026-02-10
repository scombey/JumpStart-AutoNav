/**
 * state-store.js — Stateful Workflow Persistence (Item 39)
 *
 * Maintains workflow state across interruptions. Persists current phase,
 * active artifacts, last completed step, and resume context.
 *
 * Usage:
 *   echo '{"action":"save","phase":2,"step":3}' | node bin/lib/state-store.js
 *   echo '{"action":"load"}' | node bin/lib/state-store.js
 *   echo '{"action":"reset"}' | node bin/lib/state-store.js
 *
 * Output (stdout JSON):
 *   { "success": true, "state": { ... } }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { join, dirname } = require('path');

const DEFAULT_STATE_PATH = '.jumpstart/state/state.json';

/**
 * Default state structure.
 * @returns {object}
 */
function defaultState() {
  return {
    version: '1.0.0',
    current_phase: null,
    current_agent: null,
    current_step: null,
    last_completed_step: null,
    active_artifacts: [],
    approved_artifacts: [],
    phase_history: [],
    last_updated: null,
    resume_context: null
  };
}

/**
 * Load state from disk.
 * @param {string} [statePath] - Path to state file
 * @returns {object}
 */
export function loadState(statePath) {
  const path = statePath || DEFAULT_STATE_PATH;
  if (!existsSync(path)) {
    return defaultState();
  }
  try {
    const content = readFileSync(path, 'utf8');
    return JSON.parse(content);
  } catch {
    return defaultState();
  }
}

/**
 * Save state to disk.
 * @param {object} state - State to persist
 * @param {string} [statePath] - Path to state file
 * @returns {{ success: boolean }}
 */
export function saveState(state, statePath) {
  const path = statePath || DEFAULT_STATE_PATH;
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  state.last_updated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return { success: true };
}

/**
 * Update state with new phase/step information.
 * @param {object} updates - Fields to update
 * @param {string} [statePath] - Path to state file
 * @returns {{ success: boolean, state: object }}
 */
export function updateState(updates, statePath) {
  const state = loadState(statePath);

  if (updates.phase !== undefined) {
    if (state.current_phase !== null && state.current_phase !== updates.phase) {
      state.phase_history.push({
        phase: state.current_phase,
        agent: state.current_agent,
        completed_at: new Date().toISOString()
      });
    }
    state.current_phase = updates.phase;
  }

  if (updates.agent !== undefined) state.current_agent = updates.agent;
  if (updates.step !== undefined) state.current_step = updates.step;
  if (updates.last_completed_step !== undefined) state.last_completed_step = updates.last_completed_step;
  if (updates.active_artifacts) state.active_artifacts = updates.active_artifacts;
  if (updates.resume_context) state.resume_context = updates.resume_context;

  if (updates.approved_artifact) {
    if (!state.approved_artifacts.includes(updates.approved_artifact)) {
      state.approved_artifacts.push(updates.approved_artifact);
    }
  }

  saveState(state, statePath);
  return { success: true, state };
}

/**
 * Reset state to default.
 * @param {string} [statePath] - Path to state file
 * @returns {{ success: boolean, state: object }}
 */
export function resetState(statePath) {
  const state = defaultState();
  saveState(state, statePath);
  return { success: true, state };
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('state-store.js')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input || '{}');
      const action = data.action || 'load';
      let result;

      switch (action) {
        case 'save':
          result = updateState(data, data.state_path);
          break;
        case 'load':
          result = { success: true, state: loadState(data.state_path) };
          break;
        case 'reset':
          result = resetState(data.state_path);
          break;
        default:
          result = { error: `Unknown action: ${action}` };
      }

      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (err) {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(1);
    }
  });
}
