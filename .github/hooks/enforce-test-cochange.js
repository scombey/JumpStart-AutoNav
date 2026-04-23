#!/usr/bin/env node
/**
 * Hook #7 — PostToolUse: Enforce test co-change during Phase 4
 *
 * When the agent edits a file under `src/` or `bin/` during Phase 4
 * (Developer), require at least one corresponding edit under `tests/` within
 * the same session. If the session ends with src/ edits but no tests/ edits,
 * Stop will surface the gap; meanwhile this hook warns after each
 * src/ edit that the test obligation is still open.
 *
 * Active only when `workflow.current_phase` is 4 OR
 * `roadmap.test_drive_mandate` is true (read from .jumpstart/config.yaml).
 *
 * This is a *warning* not a *block* — blocking every src edit would be too
 * disruptive. The PR/CI gate is the hard enforcement point; this hook is the
 * in-session reminder.
 */

const path = require('path');
const fs = require('fs');
const {
  runCli,
  loadState,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  extractTargetPath,
  extractSessionId,
  pathMatchesAny,
  readTextSafe,
} = require('./lib/common');

const SOURCE_PREFIXES = ['src/', 'bin/', 'lib/'];
const TEST_PREFIXES = ['tests/', 'test/', '__tests__/'];

function isSourceEdit(p) {
  return pathMatchesAny(p, SOURCE_PREFIXES);
}

function isTestEdit(p) {
  const n = p.replace(/\\/g, '/');
  return pathMatchesAny(n, TEST_PREFIXES) ||
         /\.test\.(js|ts|jsx|tsx|py|go|rb)$/.test(n) ||
         /\.spec\.(js|ts|jsx|tsx)$/.test(n);
}

function configSaysTddMandate(root) {
  const cfg = readTextSafe(path.join(root, '.jumpstart', 'config.yaml'));
  if (!cfg) return false;
  const m = cfg.match(/test_drive_mandate:\s*(true|false)/i);
  return m ? m[1].toLowerCase() === 'true' : false;
}

function handle(input, ctx) {
  const target = extractTargetPath(input.tool_input);
  if (!target) return { exitCode: 0 };

  const state = loadState(ctx.root);
  const inPhase4 = state && state.current_phase === 4;
  const tddMandate = configSaysTddMandate(ctx.root);

  // Track edits per session so Stop can audit.
  const hookState = loadHookState(ctx.root);
  const sid = extractSessionId(input) || 'default';
  const session = ensureSessionRecord(hookState, sid, ctx.now, {
    phase: state ? state.current_phase : null,
  });
  session.edits.push({
    at: ctx.now.toISOString(),
    path: target,
    kind: isTestEdit(target) ? 'test' : (isSourceEdit(target) ? 'source' : 'other'),
  });
  saveHookState(ctx.root, hookState);

  if (!inPhase4 && !tddMandate) return { exitCode: 0 };

  // If this edit was a source file and we have no test edits yet → warn.
  if (!isSourceEdit(target)) return { exitCode: 0 };
  const edits = session.edits;
  const hasTestEdit = edits.some(e => e.kind === 'test');
  if (hasTestEdit) return { exitCode: 0 };

  const msg =
    `[AutoNav PostToolUse] Phase 4 quality gate reminder: you modified ` +
    `\`${target}\` but have not edited any test file yet in this session. ` +
    'Roadmap Article III (test_drive_mandate) requires tests to accompany ' +
    'source changes. Add or update a test under tests/ before finalising.';

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: msg,
      },
      additionalContext: msg,
    }) + '\n',
    stderr: msg + '\n',
  };
}

module.exports = {
  handle,
  isSourceEdit,
  isTestEdit,
  SOURCE_PREFIXES,
  TEST_PREFIXES,
};

if (require.main === module) {
  runCli(handle);
}
