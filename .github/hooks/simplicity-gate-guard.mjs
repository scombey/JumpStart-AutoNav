#!/usr/bin/env node
/**
 * Hook #23 — PreToolUse: Simplicity-gate guard
 *
 * Warns when a new file path would introduce a new counted top-level directory
 * beyond the configured simplicity-gate limit.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  runCli,
  extractTargetPath,
  readTextSafe,
} from './lib/common.mjs';
import {countTopLevelDirs, EXCLUDED_DIRS} from '../../dist/lib/simplicity-gate.mjs';

function readMaxDirs(root) {
  const config = readTextSafe(path.join(root, '.jumpstart', 'config.yaml')) || '';
  const match = config.match(/max_top_level_dirs:\s*(\d+)/i);
  return match ? Number(match[1]) : 3;
}

function analyzePath(root, relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = normalized.split('/');
  const topLevel = parts[0];
  if (!topLevel || parts.length < 2 || topLevel.startsWith('.') || EXCLUDED_DIRS.has(topLevel)) {
    return { warn: false, topLevel, existingCount: 0, maxDirs: readMaxDirs(root) };
  }

  const topLevelAbs = path.join(root, topLevel);
  const exists = fs.existsSync(topLevelAbs);
  const { count, directories } = countTopLevelDirs(root);
  const maxDirs = readMaxDirs(root);
  return {
    warn: !exists && count + 1 > maxDirs,
    topLevel,
    existingCount: count,
    directories,
    maxDirs,
  };
}

function handle(input, ctx) {
  const target = extractTargetPath(input.tool_input);
  if (!target) return { exitCode: 0 };
  const result = analyzePath(ctx.root, target);
  if (!result.warn) return { exitCode: 0 };

  const additionalContext =
    `[AutoNav PreToolUse] Simplicity gate warning: creating \`${result.topLevel}/\` would raise the counted ` +
    `top-level directory total from ${result.existingCount} to ${result.existingCount + 1} (max ${result.maxDirs}). ` +
    'Prefer reusing an existing module unless you have explicit architectural justification.';

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext,
      },
      additionalContext,
    }) + '\n',
    stderr: additionalContext + '\n',
  };
}

export {
  handle,
  analyzePath,
  readMaxDirs,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
