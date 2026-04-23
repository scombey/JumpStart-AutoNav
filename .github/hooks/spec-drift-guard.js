#!/usr/bin/env node
/**
 * Hook #19 — PreToolUse: Spec-drift guard
 *
 * Warns when code changes appear tied to traced stories/tasks but the current
 * session has not touched any governing spec artifact and the tool request does
 * not cite the traced identifiers.
 */

const path = require('path');
const {
  runCli,
  readJsonSafe,
  loadHookState,
  ensureSessionRecord,
  saveHookState,
  extractTargetPath,
  extractSessionId,
  TRACE_ID_RE,
} = require('./lib/common');

function normalizeGraph(raw) {
  const nodes = Array.isArray(raw && raw.nodes)
    ? Object.fromEntries(raw.nodes.filter(n => n && n.id).map(n => [n.id, n]))
    : ((raw && raw.nodes) || {});
  return {
    nodes,
    edges: Array.isArray(raw && raw.edges) ? raw.edges : [],
  };
}

function collectRelatedTraceIds(graph, targetPath) {
  const related = new Set();
  for (const edge of graph.edges) {
    if (edge.from === targetPath && TRACE_ID_RE.test(edge.to || '')) related.add(edge.to);
    if (edge.to === targetPath && TRACE_ID_RE.test(edge.from || '')) related.add(edge.from);
    TRACE_ID_RE.lastIndex = 0;
  }
  return [...related];
}

function sessionTouchedSpecs(session) {
  return (session.tool_targets || []).some(entry => String(entry.path || '').replace(/\\/g, '/').startsWith('specs/'));
}

function inputMentionsTraceIds(toolInput, ids) {
  const text = JSON.stringify(toolInput || {});
  return ids.some(id => text.includes(id));
}

function handle(input, ctx) {
  const target = extractTargetPath(input.tool_input);
  if (!target) return { exitCode: 0 };
  const normalized = target.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!/^(src|tests|bin)\//.test(normalized)) return { exitCode: 0 };

  const sid = extractSessionId(input) || 'default';
  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now);
  const graph = normalizeGraph(
    readJsonSafe(path.join(ctx.root, '.jumpstart', 'spec-graph.json'), { nodes: {}, edges: [] })
  );
  const relatedIds = collectRelatedTraceIds(graph, normalized);
  if (relatedIds.length === 0 || sessionTouchedSpecs(session) || inputMentionsTraceIds(input.tool_input, relatedIds)) {
    saveHookState(ctx.root, hookState);
    return { exitCode: 0 };
  }

  const additionalContext =
    `[AutoNav PreToolUse] Spec-drift warning: \`${normalized}\` is traced to ${relatedIds.join(', ')} ` +
    'but this session has not touched a governing spec artifact yet. Read or cite the relevant spec before editing code.';

  saveHookState(ctx.root, hookState);
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

module.exports = {
  handle,
  normalizeGraph,
  collectRelatedTraceIds,
  sessionTouchedSpecs,
  inputMentionsTraceIds,
};

if (require.main === module) {
  runCli(handle);
}
