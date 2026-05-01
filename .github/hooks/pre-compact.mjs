#!/usr/bin/env node
/**
 * Hook #2 — PreCompact
 *
 * Runs immediately before the agent compacts its conversation context.
 * Preserves critical state that would otherwise be lost:
 *   1. Current phase/agent/step from state.json (refreshes resume_context)
 *   2. Any `[NEEDS CLARIFICATION: …]` markers found in the session transcript
 *      or in-flight spec artifacts.
 *   3. Unresolved questions from specs/qa-log.md (if present).
 *
 * The hook writes these into `.jumpstart/state/state.json#resume_context` so
 * that subsequent SessionStart invocations can re-inject them.
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  runCli,
  loadState,
  writeJsonSafe,
  readTextSafe,
} from './lib/common.mjs';

const NEEDS_CLARIFICATION_RE = /\[NEEDS CLARIFICATION:([^\]]+)\]/g;

function collectClarificationsFromSpecs(root) {
  const specsDir = path.join(root, 'specs');
  if (!fs.existsSync(specsDir)) return [];
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.md')) continue;
      const text = readTextSafe(full);
      if (!text) continue;
      let m;
      NEEDS_CLARIFICATION_RE.lastIndex = 0;
      while ((m = NEEDS_CLARIFICATION_RE.exec(text)) !== null) {
        out.push({
          file: path.relative(root, full).replace(/\\/g, '/'),
          note: m[1].trim(),
        });
      }
    }
  };
  walk(specsDir);
  return out;
}

function collectTranscriptClarifications(input) {
  const transcript =
    input.transcript || input.messages || input.conversation || '';
  const text =
    typeof transcript === 'string' ? transcript : JSON.stringify(transcript);
  const out = [];
  let m;
  NEEDS_CLARIFICATION_RE.lastIndex = 0;
  while ((m = NEEDS_CLARIFICATION_RE.exec(text)) !== null) {
    out.push({ file: '<transcript>', note: m[1].trim() });
  }
  return out;
}

function handle(input, ctx) {
  const statePath = path.join(ctx.root, '.jumpstart', 'state', 'state.json');
  const state = loadState(ctx.root) || {
    version: '1.0.0',
    description: 'Workflow state persistence for Jump Start framework.',
    current_phase: null,
    current_agent: null,
    current_step: null,
    last_completed_step: null,
    active_artifacts: [],
    approved_artifacts: [],
    phase_history: [],
    resume_context: null,
    last_updated: null,
  };

  const clarifications = [
    ...collectTranscriptClarifications(input),
    ...collectClarificationsFromSpecs(ctx.root),
  ];

  // De-duplicate by note text
  const seen = new Set();
  const unique = clarifications.filter(c => {
    const key = `${c.file}|${c.note}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  const resumeContext = {
    saved_at: ctx.now.toISOString(),
    reason: 'pre-compact',
    phase: state.current_phase,
    agent: state.current_agent,
    step: state.current_step,
    last_completed_step: state.last_completed_step,
    active_artifacts: state.active_artifacts || [],
    unresolved_clarifications: unique,
    note:
      'Auto-captured by PreCompact hook. Restore via SessionStart hook or `/jumpstart.resume`.',
  };

  state.resume_context = resumeContext;
  state.last_updated = ctx.now.toISOString();
  writeJsonSafe(statePath, state);

  const summary =
    `[AutoNav PreCompact] Saved resume_context with ${unique.length} unresolved clarification(s). ` +
    `Phase=${state.current_phase ?? 'n/a'}, Step=${state.current_step ?? 'n/a'}.`;

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreCompact',
        additionalContext: summary,
      },
      additionalContext: summary,
    }) + '\n',
  };
}

export {handle};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
