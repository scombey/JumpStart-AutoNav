#!/usr/bin/env node
/**
 * Hook #6 — PreToolUse: Retry-loop escalation
 *
 * Watches Bash/terminal tool calls. If the agent re-issues the same command
 * three or more times within a short window, emit a block + escalation entry
 * into `.jumpstart/correction-log.md` so the pattern is captured for future
 * sessions (Roadmap §Additional Constraints — Ambiguity Handling).
 *
 * State is persisted in `.jumpstart/state/hook-state.json` so the counter
 * survives tool-call boundaries within a session.
 */

const path = require('path');
const {
  runCli,
  loadHookState,
  saveHookState,
  appendFileSafe,
  extractCommandString,
  extractSessionId,
} = require('./lib/common');

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LIMIT = 3;                   // 3 identical commands → escalate

function normalizeCommand(cmd) {
  if (!cmd) return null;
  return cmd.trim().replace(/\s+/g, ' ').slice(0, 500);
}

function handle(input, ctx) {
  const cmd = normalizeCommand(extractCommandString(input.tool_input));
  if (!cmd) return { exitCode: 0 };

  const state = loadHookState(ctx.root);
  state.recent_tool_calls = (state.recent_tool_calls || []).filter(
    c => ctx.now.getTime() - new Date(c.at).getTime() < WINDOW_MS
  );

  state.recent_tool_calls.push({
    at: ctx.now.toISOString(),
    command: cmd,
    session: extractSessionId(input),
  });

  const identical = state.recent_tool_calls.filter(c => c.command === cmd);
  saveHookState(ctx.root, state);

  if (identical.length < LIMIT) return { exitCode: 0 };

  // Escalate — append to correction log and block this tool call.
  const logPath = path.join(ctx.root, '.jumpstart', 'correction-log.md');
  const entry = [
     '',
     `### ${ctx.now.toISOString()} — Retry-loop detected (hook)`,
     `- Session: \`${extractSessionId(input) || 'n/a'}\``,
     `- Command repeated ${identical.length} times within ${WINDOW_MS / 60000} minutes:`,
    '  ```',
    `  ${cmd}`,
    '  ```',
    '- Action: hook blocked further retries. Agent must diagnose root cause or',
    '  ask the human for clarification instead of re-running the same command.',
    '',
  ].join('\n');

  try { appendFileSafe(logPath, entry); } catch { /* fail-safe */ }

  const reason =
    `[AutoNav PreToolUse] Retry-loop detected — command was issued ${identical.length} ` +
    `times in ${WINDOW_MS / 60000} minutes. Stop, diagnose root cause, or ask the human. ` +
    'An entry has been added to .jumpstart/correction-log.md.';

  return {
    exitCode: 2,
    stdout: JSON.stringify({
      decision: 'block',
      reason,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
    stderr: reason + '\n',
  };
}

module.exports = { handle, normalizeCommand, WINDOW_MS, LIMIT };

if (require.main === module) {
  runCli(handle);
}
