#!/usr/bin/env node
/**
 * Hook #3 — PreToolUse: Block self-modification of agent persona files
 *
 * Prevents any agent from editing the scripts that govern its own behaviour.
 * Exit code 2 is the documented VS Code Copilot signal to block a tool call.
 *
 * Protected paths:
 *   - .jumpstart/agents/**      (canonical agent personas)
 *   - .github/agents/**         (VS Code-native agent definitions)
 *   - .jumpstart/roadmap.md     (non-negotiable project roadmap)
 *   - .jumpstart/invariants.md  (environment invariants)
 *   - .github/hooks/**          (workspace hook scripts + registration)
 *
 * Override: set JUMPSTART_HOOK_ALLOW_AGENT_EDITS=1 when a human operator
 * intentionally wants to let the agent modify these files.
 */

import {runCli, extractTargetPath, pathMatchesAny} from './lib/common.mjs';

const PROTECTED_PREFIXES = [
  '.jumpstart/agents',
  '.github/agents',
  '.github/hooks',
];

const PROTECTED_FILES = ['.jumpstart/roadmap.md', '.jumpstart/invariants.md'];

function handle(input) {
  if (process.env.JUMPSTART_HOOK_ALLOW_AGENT_EDITS === '1') {
    return { exitCode: 0 };
  }

  const target = extractTargetPath(input.tool_input);
  if (!target) return { exitCode: 0 };

  const normalized = target.replace(/\\/g, '/');
  const isProtected =
    pathMatchesAny(normalized, PROTECTED_PREFIXES) ||
    PROTECTED_FILES.some(f => normalized === f || normalized.endsWith('/' + f));

  if (!isProtected) return { exitCode: 0 };

  const reason =
    `[AutoNav PreToolUse] BLOCKED: '${target}' is an agent-governance file ` +
    'that must not be modified by an AI agent (Roadmap §Stay in Lane; VS Code ' +
    'hooks safety guidance). If you are a human operator who needs to edit ' +
    'this, set JUMPSTART_HOOK_ALLOW_AGENT_EDITS=1 in your shell before ' +
    'starting the session, or edit the file outside the agent.';

  // Emit structured JSON for agents that understand it, and also stderr +
  // exit 2 for agents that use the exit-code convention.
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

export {handle, PROTECTED_PREFIXES, PROTECTED_FILES};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
