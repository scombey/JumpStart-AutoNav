#!/usr/bin/env node
/**
 * Hook #22 — PreToolUse: Secrets-path blocker
 *
 * Blocks reads or writes that target sensitive credential material, restricted
 * environment files, or deploy keys.
 */

const {
  runCli,
  extractTargetPath,
  extractCommandString,
} = require('./lib/common');

const SENSITIVE_PATH_PATTERNS = [
  /\.env(?:\.[^/]+)?$/i,
  /(?:^|\/)\.aws\/credentials$/i,
  /(?:^|\/)\.npmrc$/i,
  /(?:^|\/)(?:id_rsa|id_dsa|known_hosts)$/i,
  /\.(?:pem|key|p12|pfx)$/i,
  /deploy[_-]?key/i,
  /(?:^|\/)\.kube\/config$/i,
];

function matchesSensitivePath(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  return SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(normalized));
}

function handle(input) {
  const target = extractTargetPath(input.tool_input);
  const command = extractCommandString(input.tool_input);
  const candidate = target || command;
  if (!candidate || !matchesSensitivePath(candidate)) return { exitCode: 0 };

  const reason =
    `[AutoNav PreToolUse] BLOCKED: \`${candidate}\` appears to target sensitive credential material or a restricted environment file. ` +
    'Handle secrets outside the agent session and use redacted/example files instead.';

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
  matchesSensitivePath,
  SENSITIVE_PATH_PATTERNS,
};

if (require.main === module) {
  runCli(handle);
}
