#!/usr/bin/env node
/**
 * Hook #5 — PreToolUse: Capture planned steps into the phase design log
 *
 * Before each edit/write tool call, append a compact entry to the current
 * phase's insights file (specs/insights/{phase}-insights.md). The entry
 * records what the agent was about to do — producing an auditable design log
 * that complements AutoNav's correction-log and usage-log.
 *
 * Best-effort: append during Phase 3/4, or to an already-existing insights
 * file for earlier phases. This avoids creating new hook logs during early
 * spec phases while still preserving continuity when an insights file exists.
 */

const path = require('path');
const fs = require('fs');
const {
  runCli,
  loadState,
  appendFileSafe,
  extractTargetPath,
  extractSessionId,
} = require('./lib/common');

const PHASE_FILES = {
  0: 'challenger-insights.md',
  1: 'analyst-insights.md',
  2: 'pm-insights.md',
  3: 'architect-insights.md',
  4: 'developer-insights.md',
};

function pickInsightsFile(root, state) {
  const dir = path.join(root, 'specs', 'insights');
  const fallback = path.join(dir, 'hook-design-log.md');
  if (!state) return fallback;
  const name = PHASE_FILES[state.current_phase];
  if (!name) return fallback;
  const candidate = path.join(dir, name);
  return fs.existsSync(candidate) ? candidate : fallback;
}

function summarizeToolInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '(no input)';
  const keys = ['file_path', 'path', 'command', 'description', 'instructions'];
  const parts = [];
  for (const k of keys) {
    if (toolInput[k]) {
      const v = String(toolInput[k]);
      parts.push(`${k}=${v.length > 120 ? v.slice(0, 120) + '…' : v}`);
    }
  }
  return parts.length ? parts.join(' | ') : '(no summary)';
}

function handle(input, ctx) {
  const target = extractTargetPath(input.tool_input);
  // Skip if there's nothing useful to log (for example, non-file tools).
  if (!target) return { exitCode: 0 };

  const state = loadState(ctx.root);
  const file = pickInsightsFile(ctx.root, state);

  const entry = [
    '',
     `### ${ctx.now.toISOString()} — Hook: PreToolUse`,
     `- Tool: \`${input.tool_name || 'unknown'}\``,
     `- Target: \`${target || 'n/a'}\``,
     `- Session: \`${extractSessionId(input) || 'n/a'}\``,
     `- Phase: ${state ? state.current_phase : 'n/a'}`,
     `- Summary: ${summarizeToolInput(input.tool_input)}`,
     '',
  ].join('\n');

  try {
    // Only append for Phase 3/4, or when the selected insights file already
    // exists. This avoids creating new insights logs during earlier phases
    // while still allowing best-effort appends to established files.
    const phase = state ? state.current_phase : null;
    const isPhase3Or4 = phase === 3 || phase === 4;
    const insightsFileExists = fs.existsSync(file);
    if (!isPhase3Or4 && !insightsFileExists) {
      return { exitCode: 0 };
    }
    appendFileSafe(file, entry);
  } catch {
    // fail-safe — hooks never break the session.
  }

  return { exitCode: 0 };
}

module.exports = { handle, pickInsightsFile, summarizeToolInput };

if (require.main === module) {
  runCli(handle);
}
