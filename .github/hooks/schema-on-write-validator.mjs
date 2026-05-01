#!/usr/bin/env node
/**
 * Hook #11 — PostToolUse: Schema-on-write validator
 *
 * Validates modified spec artifacts immediately after a successful tool call.
 * Emits a warning-only validation result when the artifact is structurally invalid.
 */

import path from 'node:path';
import {
  runCli,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  extractTargetPath,
  extractSessionId,
} from './lib/common.mjs';
// NOTE (M11 phase 5e): bin/lib/* was almost entirely deleted, but
// `bin/lib/validator.js` (and 3 sibling files used by other hooks) was
// kept because converting these hooks to load the TS port requires
// async/dynamic-import refactoring that breaks the sync test contract
// in tests/test-hooks.test.js. Tracked as a follow-up cleanup task.
import {validateArtifact} from '../../dist/lib/validator.mjs';

const SCHEMA_MAP = [
  { pattern: /^specs\/prd\.md$/, schema: 'prd.schema.json' },
  { pattern: /^specs\/architecture\.md$/, schema: 'architecture.schema.json' },
  { pattern: /^specs\/implementation-plan\.md$/, schema: 'tasks.schema.json' },
  { pattern: /^specs\/decisions\/.+\.md$/, schema: 'adr.schema.json' },
];

function resolveSchema(relPath) {
  return (SCHEMA_MAP.find(entry => entry.pattern.test(relPath)) || {}).schema || null;
}

function shouldBlock(result) {
  return result.errors.length > 0 || result.warnings.some(w =>
    /No YAML frontmatter|Missing "Phase Gate Approval"|unresolved placeholder/i.test(w)
  );
}

function summariseValidation(relPath, schemaName, result) {
  const parts = [];
  if (result.errors.length) parts.push(`errors: ${result.errors.slice(0, 3).join('; ')}`);
  if (result.warnings.length) parts.push(`warnings: ${result.warnings.slice(0, 3).join('; ')}`);
  return `[AutoNav PostToolUse] Spec validation ${shouldBlock(result) ? 'failed' : 'passed'} for ${relPath}` +
    `${schemaName ? ` (${schemaName})` : ''}` +
    `${parts.length ? ` — ${parts.join(' | ')}` : '.'}`;
}

function handle(input, ctx) {
  const target = extractTargetPath(input.tool_input);
  if (!target) return { exitCode: 0 };
  const relPath = target.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!/^specs\/.+\.md$/.test(relPath)) return { exitCode: 0 };

  const schemaName = resolveSchema(relPath);
  const result = validateArtifact(path.join(ctx.root, relPath), schemaName);
  const summary = summariseValidation(relPath, schemaName, result);

  const sid = extractSessionId(input) || 'default';
  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now);
  session.validations.push({
    at: ctx.now.toISOString(),
    path: relPath,
    schema: schemaName,
    valid: !shouldBlock(result),
    errors: result.errors,
    warnings: result.warnings,
  });
  saveHookState(ctx.root, hookState);

  if (!shouldBlock(result)) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: summary,
        },
        additionalContext: summary,
      }) + '\n',
    };
  }

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      reason: summary,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: summary,
      },
    }) + '\n',
    stderr: summary + '\n',
  };
}

export {
  handle,
  resolveSchema,
  shouldBlock,
  summariseValidation,
  SCHEMA_MAP,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
