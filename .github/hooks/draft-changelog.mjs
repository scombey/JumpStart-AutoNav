#!/usr/bin/env node
/**
 * Hook #8 — Stop: Draft a changelog from multi-file session edits
 *
 * When a session ends, scan the per-session edit log captured by
 * `enforce-test-cochange.js` / `capture-plan.js`. If ≥ 2 files were edited,
 * write a session-specific draft to
 * `specs/changelog-drafts/{date}-{session}.md` that the human can review and
 * fold into CHANGELOG.md or the PR description.
 *
 * Also surfaces a Phase 4 test-coverage warning if source files were edited
 * without corresponding test edits.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  runCli,
  loadState,
  loadHookState,
  saveHookState,
  extractSessionId,
} from './lib/common.mjs';

function formatDate(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildChangelog({ date, sessionId, phase, edits, sourceEdits, testEdits }) {
  const lines = [
    `# Changelog draft — ${date}`,
    '',
    `- Session: \`${sessionId}\``,
    `- Phase: ${phase ?? 'n/a'}`,
    `- Files edited: ${edits.length}`,
    `- Source files: ${sourceEdits.length}`,
    `- Test files: ${testEdits.length}`,
    '',
    '## Changes',
    '',
  ];
  // Group by top-level directory for readability.
  const byDir = new Map();
  for (const e of edits) {
    const top = (e.path.replace(/\\/g, '/').split('/')[0]) || 'root';
    if (!byDir.has(top)) byDir.set(top, []);
    byDir.get(top).push(e.path);
  }
  for (const [dir, files] of [...byDir.entries()].sort()) {
    lines.push(`### \`${dir}/\``);
    for (const f of [...new Set(files)].sort()) lines.push(`- \`${f}\``);
    lines.push('');
  }

  if (sourceEdits.length > 0 && testEdits.length === 0 && Number(phase) === 4) {
    lines.push('## ⚠️ Test coverage gap');
    lines.push('');
    lines.push(
      'Source files were modified in this Phase 4 session but no test files ' +
      'were added or updated. Review Article III (test-first development) ' +
      'before opening a PR.'
    );
    lines.push('');
  }

  lines.push('## Next steps');
  lines.push('');
  lines.push('- [ ] Review and edit this draft.');
  lines.push('- [ ] Fold relevant items into `CHANGELOG.md` or PR description.');
  lines.push('- [ ] Delete this draft once incorporated.');
  lines.push('');
  return lines.join('\n');
}

function handle(input, ctx) {
  const sid = extractSessionId(input) || 'default';
  const hookState = loadHookState(ctx.root);
  const session = (hookState.sessions || {})[sid];
  if (!session || !Array.isArray(session.edits) || session.edits.length < 2) {
    return { exitCode: 0 };
  }

  const state = loadState(ctx.root);
  const phase = state ? state.current_phase : null;
  const edits = session.edits;
  const sourceEdits = edits.filter(e => e.kind === 'source');
  const testEdits = edits.filter(e => e.kind === 'test');

  const date = formatDate(ctx.now);
  const safeSid = sid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const draftPath = path.join(
    ctx.root,
    'specs',
    'changelog-drafts',
    `${date}-${safeSid}.md`
  );

  try {
    fs.mkdirSync(path.dirname(draftPath), { recursive: true });
    // Don't overwrite an existing draft — let the human see accumulated state.
    if (!fs.existsSync(draftPath)) {
      fs.writeFileSync(
        draftPath,
        buildChangelog({ date, sessionId: sid, phase, edits, sourceEdits, testEdits }),
        'utf8'
      );
    }
  } catch { /* fail-safe */ }

  // Clean up the session from hook-state to prevent unbounded growth.
  delete hookState.sessions[sid];
  try { saveHookState(ctx.root, hookState); } catch { /* noop */ }

  const summary =
    `[AutoNav Stop] Changelog draft written to ${path.relative(ctx.root, draftPath)} ` +
    `(${edits.length} file edits, ${sourceEdits.length} source / ${testEdits.length} test).`;

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

export {handle, buildChangelog, formatDate};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(handle);
}
