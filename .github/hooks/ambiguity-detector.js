#!/usr/bin/env node
/**
 * Hook #18 — UserPromptSubmit: Ambiguity detector
 *
 * Flags vague prompts and injects a NEEDS CLARIFICATION reminder before the
 * agent acts, reinforcing the framework's "Never Guess" rule.
 */

const {
  runCli,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  extractSessionId,
} = require('./lib/common');

const FILE_REFERENCE_HINT_RE = /[`/]|\.md|\.js|\.ts|specs\/|src\//i;
const SCOPE_HINT_RE = /\b(test|hook|spec|timeline|qa-log|manifest|graph|state|phase|session|file|path|readme)\b/i;

function detectAmbiguity(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return { ambiguous: false, reasons: [] };

  const reasons = [];
  if (text.length < 25) reasons.push('prompt is very short');
  if (/\b(it|this|that|thing|stuff|issue)\b/i.test(text) && !FILE_REFERENCE_HINT_RE.test(text)) {
    reasons.push('uses pronouns without a concrete target');
  }
  if (/\b(fix|update|change|do|handle|improve)\b/i.test(text) &&
      !SCOPE_HINT_RE.test(text)) {
    reasons.push('asks for action without naming a concrete artifact or outcome');
  }
  if (!/[?`/]|\.md|\.js|\.ts|phase|session|hook|spec|timeline/i.test(text) && text.split(/\s+/).length < 8) {
    reasons.push('lacks scope or acceptance details');
  }

  return { ambiguous: reasons.length > 0, reasons };
}

function handle(input, ctx) {
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!prompt.trim()) return { exitCode: 0 };

  const result = detectAmbiguity(prompt);
  const sid = extractSessionId(input) || 'default';
  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now);
  session.prompts.push({
    at: ctx.now.toISOString(),
    text: prompt.trim(),
    ambiguous: result.ambiguous,
    ambiguity_reasons: result.reasons,
    source: 'ambiguity-detector',
  });
  saveHookState(ctx.root, hookState);

  if (!result.ambiguous) return { exitCode: 0 };

  const additionalContext =
    `[NEEDS CLARIFICATION: ${result.reasons.join('; ')}] ` +
    'The user prompt appears underspecified; clarify the target artifact, desired outcome, or acceptance criteria before acting.';

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext,
      },
      additionalContext,
    }) + '\n',
  };
}

module.exports = {
  handle,
  detectAmbiguity,
  FILE_REFERENCE_HINT_RE,
  SCOPE_HINT_RE,
};

if (require.main === module) {
  runCli(handle);
}
