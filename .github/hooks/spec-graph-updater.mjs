#!/usr/bin/env node
/**
 * Hook #12 — PostToolUse: Spec-graph updater
 *
 * Rebuilds `.jumpstart/spec-graph.json` from the current specs and annotates it
 * with touched implementation files so traceability stays fresh during editing.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  runCli,
  extractTargetPath,
  TASK_ID_RE,
  STORY_ID_RE,
} from './lib/common.mjs';
import {buildFromSpecs, addNode, addEdge, saveGraph} from '../../dist/lib/graph.mjs';

const WATCHED_PREFIXES = ['specs/', 'src/', 'tests/', 'bin/'];

function isWatchedPath(relPath) {
  return WATCHED_PREFIXES.some(prefix => relPath === prefix.slice(0, -1) || relPath.startsWith(prefix));
}

function readMatches(text, regex) {
  const matches = new Set();
  let match;
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    matches.add(match[1]);
  }
  return [...matches];
}

function annotateTouchedFile(graph, root, relPath, now) {
  if (!fs.existsSync(path.join(root, relPath))) return;
  const normalized = relPath.replace(/\\/g, '/');
  const nodeType = normalized.startsWith('tests/') || /\.test\./.test(normalized) || /\.spec\./.test(normalized)
    ? 'test'
    : 'file';
  addNode(graph, normalized, nodeType, {
    lastTouchedAt: now.toISOString(),
    observedBy: 'spec-graph-updater',
  });

  const text = fs.readFileSync(path.join(root, normalized), 'utf8');
  for (const taskId of readMatches(text, TASK_ID_RE)) {
    addNode(graph, taskId, 'task', {});
    addEdge(graph, taskId, normalized, nodeType === 'test' ? 'tests' : 'creates');
  }
  for (const storyId of readMatches(text, STORY_ID_RE)) {
    addNode(graph, storyId, 'story', {});
    addEdge(graph, storyId, normalized, nodeType === 'test' ? 'tests' : 'implements');
  }
}

function handle(input, ctx) {
  const target = extractTargetPath(input.tool_input);
  if (!target) return { exitCode: 0 };
  const relPath = target.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!isWatchedPath(relPath)) return { exitCode: 0 };

  const graph = buildFromSpecs(path.join(ctx.root, 'specs'));
  annotateTouchedFile(graph, ctx.root, relPath, ctx.now);
  const graphPath = path.join(ctx.root, '.jumpstart', 'spec-graph.json');
  saveGraph(graphPath, graph);

  const summary =
    `[AutoNav PostToolUse] Spec graph refreshed at .jumpstart/spec-graph.json ` +
    `(${Object.keys(graph.nodes || {}).length} nodes / ${(graph.edges || []).length} edges).`;

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

export {
  handle,
  annotateTouchedFile,
  isWatchedPath,
  readMatches,
  WATCHED_PREFIXES,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
