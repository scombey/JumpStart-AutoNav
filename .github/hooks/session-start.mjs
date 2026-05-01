#!/usr/bin/env node
/**
 * Hook #1 — SessionStart
 *
 * Reads `.jumpstart/state/state.json` and injects current phase context into
 * the new agent session. Eliminates the need to run `/jumpstart.resume` on
 * every new session when `session_briefing.auto_trigger` is set in config.
 *
 * Output: JSON `additionalContext` describing current phase, active artifacts,
 * approved artifacts, and resume_context if present.
 */

import path from 'node:path';
import {
  runCli,
  loadState,
  readJsonSafe,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  extractSessionId,
} from './lib/common.mjs';

function handle(input, ctx) {
  const state = loadState(ctx.root);
  const config = readJsonSafe(
    path.join(ctx.root, '.jumpstart', 'state', 'config-snapshot.json'),
    null
  );

  const sessionId = extractSessionId(input);

  // Track this session so Stop knows what started.
  if (sessionId) {
    const hookState = loadHookState(ctx.root);
    const session = ensureSessionRecord(hookState, sessionId, ctx.now, {
      phase: state ? state.current_phase : null,
    });
    session.phase = state ? state.current_phase : null;
    saveHookState(ctx.root, hookState);
  }

  if (!state) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        additionalContext:
          '[AutoNav] No .jumpstart/state/state.json found — framework not initialised yet. Run `npx jumpstart-mode init` to begin.',
      }),
    };
  }

  const lines = ['[AutoNav Session Briefing]'];
  lines.push(`Current phase: ${state.current_phase ?? 'not started'}`);
  if (state.current_agent) lines.push(`Current agent: ${state.current_agent}`);
  if (state.current_step) lines.push(`Current step: ${state.current_step}`);
  if (state.last_completed_step) {
    lines.push(`Last completed: ${state.last_completed_step}`);
  }
  if (Array.isArray(state.active_artifacts) && state.active_artifacts.length) {
    lines.push(`Active artifacts: ${state.active_artifacts.join(', ')}`);
  }
  if (Array.isArray(state.approved_artifacts) && state.approved_artifacts.length) {
    lines.push(`Approved artifacts: ${state.approved_artifacts.join(', ')}`);
  }
  if (state.resume_context) {
    const preview =
      typeof state.resume_context === 'string'
        ? state.resume_context
        : JSON.stringify(state.resume_context);
    lines.push('');
    lines.push('Resume context (where you left off):');
    lines.push(preview.length > 1500 ? preview.slice(0, 1500) + '…' : preview);
  }

  const additionalContext = lines.join('\n');
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
      additionalContext,
    }) + '\n',
  };
}

export {handle};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
