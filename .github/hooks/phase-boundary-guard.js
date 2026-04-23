#!/usr/bin/env node
/**
 * Hook #9 — PreToolUse: Phase boundary guard
 *
 * During Phase 4, deny code-writing or command-execution actions when the
 * required upstream specs are missing or unapproved. This keeps the developer
 * session aligned with AutoNav's sequential phase gates.
 */

const path = require('path');
const fs = require('fs');
const {
  runCli,
  loadState,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  recordToolObservation,
  extractTargetPath,
  extractCommandString,
  extractSessionId,
  getPhaseGateApproval,
} = require('./lib/common');

const REQUIRED_UPSTREAM_ARTIFACTS = [
  'specs/prd.md',
  'specs/architecture.md',
  'specs/implementation-plan.md',
];

function isDeveloperGuardActive(state) {
  if (!state) return false;
  return state.current_phase === 4 || state.current_agent === 'developer';
}

function isProtectedDeveloperAction(input) {
  const target = extractTargetPath(input.tool_input);
  const command = extractCommandString(input.tool_input);
  if (command) return true;
  if (!target) return false;
  const normalized = target.replace(/\\/g, '/');
  return !normalized.startsWith('specs/');
}

function isApprovedArtifact(fullPath) {
  if (!fs.existsSync(fullPath)) return false;
  const content = fs.readFileSync(fullPath, 'utf8');
  return getPhaseGateApproval(content).approved;
}

function collectArtifactStatus(root) {
  return REQUIRED_UPSTREAM_ARTIFACTS.map(relPath => {
    const fullPath = path.join(root, relPath);
    return {
      path: relPath,
      exists: fs.existsSync(fullPath),
      approved: isApprovedArtifact(fullPath),
    };
  });
}

function summarizeMissingStatuses(statuses) {
  return statuses
    .filter(item => !item.exists || !item.approved)
    .map(item => {
      if (!item.exists) return `${item.path} (missing)`;
      return `${item.path} (unapproved)`;
    });
}

function handle(input, ctx) {
  const sid = extractSessionId(input) || 'default';
  const state = loadState(ctx.root);
  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now, {
    phase: state ? state.current_phase : null,
  });
  const { toolName, target } = recordToolObservation(session, input, ctx.now);

  if (!isDeveloperGuardActive(state) || !isProtectedDeveloperAction(input)) {
    saveHookState(ctx.root, hookState);
    return { exitCode: 0 };
  }

  const statuses = collectArtifactStatus(ctx.root);
  const blockedBy = summarizeMissingStatuses(statuses);
  if (blockedBy.length === 0) {
    saveHookState(ctx.root, hookState);
    return { exitCode: 0 };
  }

  const attemptedAction = target || extractCommandString(input.tool_input) || toolName;
  session.blocked_actions.push({
    at: ctx.now.toISOString(),
    tool: toolName,
    target: attemptedAction,
    reason: 'missing_or_unapproved_upstream_specs',
    blocked_by: blockedBy,
  });
  saveHookState(ctx.root, hookState);

  const reason =
    `[AutoNav PreToolUse] Phase boundary guard blocked \`${attemptedAction}\`. ` +
    `Phase 4 work requires approved upstream artifacts first: ${blockedBy.join(', ')}. ` +
    'Complete or approve the missing spec artifacts before editing implementation files.';

  return {
    exitCode: 2,
    stdout: JSON.stringify({
      decision: 'block',
      reason,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
        additionalContext: `Blocked by phase gate: ${blockedBy.join(', ')}`,
      },
    }) + '\n',
    stderr: reason + '\n',
  };
}

module.exports = {
  handle,
  REQUIRED_UPSTREAM_ARTIFACTS,
  isDeveloperGuardActive,
  isProtectedDeveloperAction,
  isApprovedArtifact,
  collectArtifactStatus,
  summarizeMissingStatuses,
};

if (require.main === module) {
  runCli(handle);
}
