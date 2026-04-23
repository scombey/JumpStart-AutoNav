#!/usr/bin/env node
/**
 * Hook #4 — PreToolUse: Inject relevant ADR context
 *
 * When the agent is about to edit a file under `src/`, `specs/`, or `tests/`,
 * look up ADRs from `.jumpstart/state/adr-index.json` and `specs/decisions/`
 * that are relevant to the target path or its module. Inject a short summary
 * as additionalContext so the agent respects prior architectural decisions
 * (Roadmap §IV Upstream Traceability).
 */

const fs = require('fs');
const path = require('path');
const {
  runCli,
  readJsonSafe,
  readTextSafe,
  extractTargetPath,
  pathMatchesAny,
} = require('./lib/common');

const WATCHED_PREFIXES = ['src/', 'specs/', 'tests/', 'bin/'];

function loadAdrIndex(root) {
  const idx = readJsonSafe(
    path.join(root, '.jumpstart', 'state', 'adr-index.json'),
    null
  );
  if (idx && Array.isArray(idx.entries)) return idx.entries;
  return [];
}

function scanDecisionsDir(root) {
  const dir = path.join(root, 'specs', 'decisions');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return []; }
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    const full = path.join(dir, name);
    const text = readTextSafe(full);
    if (!text) continue;
    const titleMatch = text.match(/^#\s+(.+)$/m);
    const statusMatch = text.match(/status:\s*([^\n]+)/i);
    out.push({
      id: name.replace(/\.md$/, ''),
      file: `specs/decisions/${name}`,
      title: titleMatch ? titleMatch[1].trim() : name,
      status: statusMatch ? statusMatch[1].trim() : 'unknown',
      body: text,
    });
  }
  return out;
}

function tokenize(str) {
  return (str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2);
}

function scoreAdrRelevance(adr, targetPath) {
  const tokens = new Set([
    ...tokenize(targetPath),
    ...tokenize(path.basename(targetPath, path.extname(targetPath))),
  ]);
  const hay = `${adr.title || ''} ${adr.tags || ''} ${adr.affected_paths || ''} ${adr.body || ''}`.toLowerCase();
  let score = 0;
  for (const t of tokens) if (hay.includes(t)) score += 1;
  // Explicit path listing wins.
  if (adr.affected_paths && typeof adr.affected_paths === 'string' &&
      pathMatchesAny(targetPath, [adr.affected_paths])) {
    score += 10;
  }
  if (Array.isArray(adr.affected_paths) &&
      pathMatchesAny(targetPath, adr.affected_paths)) {
    score += 10;
  }
  return score;
}

function handle(input, ctx) {
  const target = extractTargetPath(input.tool_input);
  if (!target) return { exitCode: 0 };

  const normalized = target.replace(/\\/g, '/');
  if (!pathMatchesAny(normalized, WATCHED_PREFIXES)) {
    return { exitCode: 0 };
  }

  const indexed = loadAdrIndex(ctx.root);
  const scanned = scanDecisionsDir(ctx.root);
  // Merge, preferring scanned (has body) when IDs collide.
  const byId = new Map();
  for (const adr of indexed) byId.set(adr.id || adr.file, adr);
  for (const adr of scanned) byId.set(adr.id || adr.file, { ...byId.get(adr.id) || {}, ...adr });

  const all = Array.from(byId.values());
  if (all.length === 0) return { exitCode: 0 };

  const ranked = all
    .map(adr => ({ adr, score: scoreAdrRelevance(adr, normalized) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) return { exitCode: 0 };

  const summary = [
    `[AutoNav ADR Context] ${ranked.length} relevant ADR(s) for ${target}:`,
    ...ranked.map(r => {
      const { adr } = r;
      return `- ${adr.id || adr.file}: ${adr.title || '(no title)'} [${adr.status || 'unknown'}]`;
    }),
    'Read the linked ADR before proposing changes that diverge from it.',
  ].join('\n');

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: summary,
      },
      additionalContext: summary,
    }) + '\n',
  };
}

module.exports = { handle, scoreAdrRelevance, WATCHED_PREFIXES };

if (require.main === module) {
  runCli(handle);
}
