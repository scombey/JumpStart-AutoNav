#!/usr/bin/env node
/**
 * Hook #15 — SessionStart: Phase-gate status injector
 *
 * Summarises which upstream artifacts are approved, pending, or missing so the
 * agent sees workflow readiness immediately on session start.
 */

const fs = require('fs');
const path = require('path');
const {
  runCli,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  extractSessionId,
  getPhaseGateApproval,
} = require('./lib/common');

const PHASE_ARTIFACTS = [
  { phase: 'Scout', path: 'specs/codebase-context.md' },
  { phase: 'Challenger', path: 'specs/challenger-brief.md' },
  { phase: 'Analyst', path: 'specs/product-brief.md' },
  { phase: 'PM', path: 'specs/prd.md' },
  { phase: 'Architect', path: 'specs/architecture.md' },
  { phase: 'Architect', path: 'specs/implementation-plan.md' },
];

function readApprovalStatus(root, relPath) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) return { state: 'missing', path: relPath };
  const content = fs.readFileSync(fullPath, 'utf8');
  const approval = getPhaseGateApproval(content);
  if (approval.approved) {
    return { state: 'approved', path: relPath };
  }
  return { state: 'pending', path: relPath };
}

function collectPhaseGateStatuses(root) {
  return PHASE_ARTIFACTS.map(item => ({
    ...item,
    ...readApprovalStatus(root, item.path),
  }));
}

function handle(input, ctx) {
  const sid = extractSessionId(input) || 'default';
  const statuses = collectPhaseGateStatuses(ctx.root);
  const approved = statuses.filter(s => s.state === 'approved');
  const pending = statuses.filter(s => s.state === 'pending');
  const missing = statuses.filter(s => s.state === 'missing');

  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now);
  session.startup_context.push({
    type: 'phase-gate-status',
    at: ctx.now.toISOString(),
    value: statuses,
  });
  saveHookState(ctx.root, hookState);

  const additionalContext = [
    '[AutoNav Phase Gate Status]',
    `Approved artifacts (${approved.length}): ${approved.length ? approved.map(a => a.path).join(', ') : 'none'}`,
    `Pending artifacts (${pending.length}): ${pending.length ? pending.map(a => a.path).join(', ') : 'none'}`,
    `Missing artifacts (${missing.length}): ${missing.length ? missing.map(a => a.path).join(', ') : 'none'}`,
  ].join('\n');

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

module.exports = {
  handle,
  collectPhaseGateStatuses,
  readApprovalStatus,
  PHASE_ARTIFACTS,
};

if (require.main === module) {
  runCli(handle);
}
