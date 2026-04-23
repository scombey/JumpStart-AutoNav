#!/usr/bin/env node
/**
 * Hook #10 — UserPromptSubmit: Prompt-to-QA-log capture
 *
 * Appends significant user prompts to specs/qa-log.md so the intent that drove
 * the session remains traceable even before an agent asks a follow-up question.
 */

const path = require('path');
const {
  runCli,
  loadState,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  appendFileSafe,
  readTextSafe,
  extractSessionId,
  promptMatchesSignal,
} = require('./lib/common');

function qaLogEnabled(root) {
  const configText = readTextSafe(path.join(root, '.jumpstart', 'config.yaml')) || '';
  const match = configText.match(/qa_log:\s*(true|false)/i);
  return match ? match[1].toLowerCase() === 'true' : true;
}

function extractProjectName(root) {
  const configText = readTextSafe(path.join(root, '.jumpstart', 'config.yaml')) || '';
  const match = configText.match(/^\s*name:\s*["']?([^"'\n]+)["']?\s*$/m);
  return match ? match[1].trim() : path.basename(root);
}

function ensureQaLogFile(root, now) {
  const qaPath = path.join(root, 'specs', 'qa-log.md');
  if (readTextSafe(qaPath)) return qaPath;
  const project = extractProjectName(root);
  const header = [
    '# Q&A Decision Log',
    '',
    `> **Project:** ${project}`,
    `> **Created:** ${now.toISOString().slice(0, 10)}`,
    `> **Last Updated:** ${now.toISOString().slice(0, 10)}`,
    '',
    '---',
    '',
    '## About This Document',
    '',
    'This is a **living log of every question asked by agents and the corresponding response from the human operator**. It serves as an audit trail of decisions, preferences, and clarifications that shaped the project throughout all phases.',
    '',
    '---',
    '',
    '## Decision Log',
    '',
    '<!-- Agents: Append new entries below this line. Use sequential numbering (Q-001, Q-002, etc.). -->',
    '<!-- Do NOT delete or modify previous entries. This is an append-only log. -->',
    '',
  ].join('\n');
  appendFileSafe(qaPath, header);
  return qaPath;
}

function nextQuestionId(existingText) {
  const matches = existingText.match(/### Q-(\d{3})/g) || [];
  const max = matches.reduce((acc, entry) => {
    const num = Number(entry.match(/Q-(\d{3})/)[1]);
    return Math.max(acc, num);
  }, 0);
  return `Q-${String(max + 1).padStart(3, '0')}`;
}

function isSignificantPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  const text = prompt.trim();
  if (text.length < 15) return false;
  return (
    text.includes('?') ||
    text.length >= 60 ||
    promptMatchesSignal(text, ['approval', 'planning', 'implementation', 'clarification'])
  );
}

function classifyPrompt(prompt) {
  const text = prompt.toLowerCase();
  if (promptMatchesSignal(text, ['approval'])) return 'approval';
  if (promptMatchesSignal(text, ['planning'])) return 'planning';
  if (promptMatchesSignal(text, ['implementation'])) return 'implementation';
  if (promptMatchesSignal(text, ['clarification'])) return 'clarification';
  return 'general';
}

function buildQaEntry({ qid, phase, agent, now, prompt, sessionId, classification }) {
  return [
    `### ${qid} | Phase ${phase ?? 'n/a'} — ${agent || 'User Prompt'} | ${now.toISOString().slice(0, 10)}`,
    '',
    '**Context:** Prompt captured automatically by the VS Code `UserPromptSubmit` hook before the agent responded.',
    '',
    '**Question:** What instruction or decision did the human submit to the agent?',
    '',
    `**Response:** ${prompt.trim()}`,
    '',
    `**Impact:** Captured as a ${classification} input for traceability at session start (\`${sessionId || 'n/a'}\`).`,
    '',
    '**Referenced in:** Pending — downstream artifacts or responses should cite this entry if it materially changes scope or execution.',
    '',
  ].join('\n');
}

function handle(input, ctx) {
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!qaLogEnabled(ctx.root) || !isSignificantPrompt(prompt)) {
    return { exitCode: 0 };
  }

  const sid = extractSessionId(input) || 'default';
  const state = loadState(ctx.root);
  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now, {
    phase: state ? state.current_phase : null,
  });
  const classification = classifyPrompt(prompt);
  session.prompts.push({
    at: ctx.now.toISOString(),
    text: prompt.trim(),
    classification,
  });
  saveHookState(ctx.root, hookState);

  const qaPath = ensureQaLogFile(ctx.root, ctx.now);
  const existing = readTextSafe(qaPath) || '';
  const qid = nextQuestionId(existing);
  appendFileSafe(
    qaPath,
    buildQaEntry({
      qid,
      phase: state ? state.current_phase : null,
      agent: state ? state.current_agent : null,
      now: ctx.now,
      prompt,
      sessionId: sid,
      classification,
    })
  );

  const summary = `[AutoNav UserPromptSubmit] Logged ${qid} to specs/qa-log.md (${classification}).`;
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: summary,
      },
      additionalContext: summary,
    }) + '\n',
  };
}

module.exports = {
  handle,
  qaLogEnabled,
  ensureQaLogFile,
  nextQuestionId,
  isSignificantPrompt,
  classifyPrompt,
  buildQaEntry,
};

if (require.main === module) {
  runCli(handle);
}
