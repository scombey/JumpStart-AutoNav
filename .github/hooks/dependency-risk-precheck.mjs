#!/usr/bin/env node
/**
 * Hook #21 — PreToolUse: Dependency risk precheck
 *
 * Detects dependency add/update operations and injects a reminder to perform
 * advisory/security review before executing them.
 */

import {
  runCli,
  extractTargetPath,
  extractCommandString,
} from './lib/common.mjs';

const DEPENDENCY_COMMAND_RE = /\b(?:npm\s+(?:install|update)|yarn\s+(?:add|upgrade)|pnpm\s+(?:add|update)|pip\s+install|go\s+get|cargo\s+add)\b/i;
const DEPENDENCY_FILES = ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'requirements.txt', 'go.mod', 'Cargo.toml'];

function isDependencyChange(input) {
  const command = extractCommandString(input.tool_input);
  if (command && DEPENDENCY_COMMAND_RE.test(command)) return true;
  const target = extractTargetPath(input.tool_input);
  if (!target) return false;
  const normalized = target.replace(/\\/g, '/');
  return DEPENDENCY_FILES.some(name => normalized === name || normalized.endsWith('/' + name));
}

function handle(input) {
  if (!isDependencyChange(input)) return { exitCode: 0 };
  const additionalContext =
    '[AutoNav PreToolUse] Dependency change detected. Before executing package add/update operations, ' +
    'review dependency risk, advisory exposure, and lockfile impact for the affected ecosystem.';

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext,
      },
      additionalContext,
    }) + '\n',
  };
}

export {
  handle,
  isDependencyChange,
  DEPENDENCY_FILES,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
