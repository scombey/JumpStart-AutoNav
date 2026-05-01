#!/usr/bin/env node
/**
 * Hook #17 — UserPromptSubmit: Prompt classifier
 *
 * Tags each meaningful prompt as discovery, planning, build, debug, review, or
 * general and records the classification in hook state.
 */

import {
  runCli,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  extractSessionId,
  promptMatchesSignal,
} from './lib/common.mjs';

function classifyPrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (promptMatchesSignal(text, ['debug'])) return 'debug';
  if (promptMatchesSignal(text, ['review'])) return 'review';
  if (promptMatchesSignal(text, ['planning'])) return 'planning';
  if (promptMatchesSignal(text, ['implementation'])) return 'build';
  if (promptMatchesSignal(text, ['discovery', 'clarification'])) return 'discovery';
  return 'general';
}

function handle(input, ctx) {
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!prompt.trim()) return { exitCode: 0 };

  const sid = extractSessionId(input) || 'default';
  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now);
  const classification = classifyPrompt(prompt);
  session.prompts.push({
    at: ctx.now.toISOString(),
    text: prompt.trim(),
    classification,
    source: 'prompt-classifier',
  });
  saveHookState(ctx.root, hookState);

  const additionalContext =
    `[AutoNav UserPromptSubmit] Prompt classified as \`${classification}\`.`;

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

export {
  handle,
  classifyPrompt,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
