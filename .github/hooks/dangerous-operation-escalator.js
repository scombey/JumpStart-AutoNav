#!/usr/bin/env node
/**
 * Hook #20 — PreToolUse: Dangerous operation escalator
 *
 * Blocks destructive shell and file operations until the human explicitly asks
 * for them, using the existing tool guardrails heuristics.
 */

const {
  runCli,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  extractTargetPath,
  extractCommandString,
  extractSessionId,
} = require('./lib/common');
const { checkOperation, validateFileOperation } = require('../../bin/lib/tool-guardrails.js');

function inferFileAction(input) {
  const toolName = String(input.tool_name || '').toLowerCase();
  const toolInput = input.tool_input || {};
  if (String(toolInput.action || '').toLowerCase() === 'delete') return 'delete';
  if (String(toolInput.op || '').toLowerCase() === 'delete') return 'delete';
  if (/delete|remove/.test(toolName)) return 'delete';
  return null;
}

function handle(input, ctx) {
  const sid = extractSessionId(input) || 'default';
  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now);

  const command = extractCommandString(input.tool_input);
  const target = extractTargetPath(input.tool_input);
  let reason = null;

  if (command) {
    const result = checkOperation(command);
    if (!result.allowed || result.requires_approval) {
      reason =
        `[AutoNav PreToolUse] Dangerous operation requires explicit human approval: ` +
        `\`${command}\` (${result.risk_level} risk). Ask the user before proceeding.`;
    }
  } else {
    const action = inferFileAction(input);
    if (action && target) {
      const result = validateFileOperation(action, target);
      if (!result.allowed || result.requires_review) {
        reason =
          `[AutoNav PreToolUse] ${action} of \`${target}\` requires explicit human approval. ` +
          'Ask the user before proceeding.';
      }
    }
  }

  if (!reason) {
    saveHookState(ctx.root, hookState);
    return { exitCode: 0 };
  }

  session.blocked_actions.push({
    at: ctx.now.toISOString(),
    tool: input.tool_name || 'unknown',
    target: command || target || 'unknown',
    reason: 'dangerous-operation',
  });
  saveHookState(ctx.root, hookState);

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

module.exports = {
  handle,
  inferFileAction,
};

if (require.main === module) {
  runCli(handle);
}
