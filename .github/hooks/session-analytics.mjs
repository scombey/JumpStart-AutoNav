#!/usr/bin/env node
/**
 * Hook #13 — Stop: Session analytics report
 *
 * Writes a compact analytics report for the just-finished session, summarising
 * tool usage, prompt volume, validation outcomes, file hotspots, and blocked or
 * retried actions. The report lives under `.jumpstart/state/session-analytics/`.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  runCli,
  loadHookState,
  saveHookState,
  extractSessionId,
} from './lib/common.mjs';

function formatDateIsoYearMonthDay(d) {
  return d.toISOString().slice(0, 10);
}

function safeSessionFileName(sessionId, now) {
  const normalized = (sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const hash = crypto.createHash('sha256').update(String(sessionId || 'default')).digest('hex').slice(0, 8);
  return `${formatDateIsoYearMonthDay(now)}-${normalized}-${hash}.md`;
}

function countItemsByKey(items, keyFn) {
  const out = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    out.set(key, (out.get(key) || 0) + 1);
  }
  return out;
}

function buildAnalyticsReport({ sessionId, session, recentToolCalls, now }) {
  const hotspotCounts = countItemsByKey(session.tool_targets || [], item => {
    const normalized = (item.path || 'unknown').replace(/\\/g, '/');
    return normalized.split('/').slice(0, 2).join('/') || normalized;
  });
  const validationTotals = {
    passed: (session.validations || []).filter(v => v.valid).length,
    failed: (session.validations || []).filter(v => !v.valid).length,
  };

  const lines = [
    `# Session analytics — ${formatDateIsoYearMonthDay(now)}`,
    '',
    `- Session: \`${sessionId}\``,
    `- Phase: ${session.phase ?? 'n/a'}`,
    `- Started: ${session.started_at || 'n/a'}`,
    `- Ended: ${now.toISOString()}`,
    `- Prompt entries: ${(session.prompts || []).length}`,
    `- Tool invocations: ${Object.values(session.tool_counts || {}).reduce((sum, count) => sum + count, 0)}`,
    `- File targets: ${(session.tool_targets || []).length}`,
    `- Recorded edits: ${(session.edits || []).length}`,
    `- Retry-prone commands: ${recentToolCalls.length}`,
    `- Validation results: ${validationTotals.passed} passed / ${validationTotals.failed} failed`,
    `- Blocked actions: ${(session.blocked_actions || []).length}`,
    '',
    '## Tool usage',
    '',
  ];

  const toolEntries = Object.entries(session.tool_counts || {}).sort((a, b) => b[1] - a[1]);
  if (toolEntries.length === 0) {
    lines.push('- None recorded');
  } else {
    for (const [tool, count] of toolEntries) lines.push(`- \`${tool}\`: ${count}`);
  }

  lines.push('', '## Hotspots', '');
  const hotspots = [...hotspotCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (hotspots.length === 0) {
    lines.push('- None recorded');
  } else {
    for (const [prefix, count] of hotspots) lines.push(`- \`${prefix}\`: ${count}`);
  }

  lines.push('', '## Validation outcomes', '');
  if ((session.validations || []).length === 0) {
    lines.push('- None recorded');
  } else {
    for (const item of session.validations.slice(-5)) {
      lines.push(`- [${item.valid ? 'pass' : 'fail'}] \`${item.path}\`${item.schema ? ` (${item.schema})` : ''}`);
    }
  }

  lines.push('', '## Blocked or escalated actions', '');
  if ((session.blocked_actions || []).length === 0) {
    lines.push('- None recorded');
  } else {
    for (const item of session.blocked_actions.slice(-5)) {
      lines.push(`- \`${item.tool}\` → \`${item.target}\` (${item.reason})`);
    }
  }

  return lines.join('\n') + '\n';
}

function handle(input, ctx) {
  const sid = extractSessionId(input) || 'default';
  const hookState = loadHookState(ctx.root);
  const session = (hookState.sessions || {})[sid];
  if (!session) return { exitCode: 0 };

  const recentToolCalls = (hookState.recent_tool_calls || []).filter(call => call.session === sid);
  const reportPath = path.join(
    ctx.root,
    '.jumpstart',
    'state',
    'session-analytics',
    safeSessionFileName(sid, ctx.now)
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    buildAnalyticsReport({ sessionId: sid, session, recentToolCalls, now: ctx.now }),
    'utf8'
  );

  session.generated_reports = session.generated_reports || [];
  session.generated_reports.push({
    type: 'session-analytics',
    path: path.relative(ctx.root, reportPath).replace(/\\/g, '/'),
    at: ctx.now.toISOString(),
  });
  saveHookState(ctx.root, hookState);

  const summary =
    `[AutoNav Stop] Session analytics written to ${path.relative(ctx.root, reportPath)} ` +
    `(${Object.keys(session.tool_counts || {}).length} tool types, ${(session.validations || []).length} validations).`;

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: summary,
      },
      additionalContext: summary,
    }) + '\n',
  };
}

export {
  handle,
  buildAnalyticsReport,
  countItemsByKey,
  formatDateIsoYearMonthDay,
  safeSessionFileName,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
