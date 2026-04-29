#!/usr/bin/env node
/**
 * check-dist-exports.mjs — build-output integrity gate (QA finding).
 *
 * Asserts that tsdown's emitted dist/ matches the contract of the source:
 *   1. For every entry in tsdown.config.ts (globs expanded), dist/ contains:
 *        - <entry-relative-to-rootDir>.mjs
 *        - <entry-relative-to-rootDir>.d.mts
 *        - <entry-relative-to-rootDir>.mjs.map
 *      where rootDir is the longest common prefix of all entries
 *      (= `src/` for the post-M9 layout).
 *   2. For every named export in the source, the .d.mts exports the same name.
 *      (Catches "tsdown silently dropped a symbol" regressions that otherwise
 *      only surface when a downstream consumer fails to resolve an import.)
 *   3. Shebang preservation on CLI entries (anything matching cli|main|bin).
 *
 * This is the killer QA gate: without it, a tsdown bug or a misconfigured
 * `entry` array could ship a stripped d.ts to npm and we'd find out when a
 * Claude Code agent's `import { ... } from '@scombey/jumpstart-mode'` fails
 * at runtime in a customer environment.
 *
 * @see specs/decisions/adr-001-build-tool.md
 * @see specs/architecture.md SEC-005 (post-build assertion)
 * @see specs/implementation-plan.md T2.1 + T5.1 (M9 cutover)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = process.cwd();
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const TSDOWN_CONFIG = path.join(REPO_ROOT, 'tsdown.config.ts');

if (!existsSync(DIST_DIR)) {
  console.log('[check-dist-exports] dormant: dist/ not built yet (run `npm run build`).');
  process.exit(0);
}

if (!existsSync(TSDOWN_CONFIG)) {
  console.error('[check-dist-exports] FAIL: tsdown.config.ts not found.');
  process.exit(1);
}

// Parse entry list out of tsdown.config.ts via regex — we deliberately don't
// import the config (that would require ts-node or compiled config). The
// regex matches the literal-string entries inside the entry: [ ... ] block.
//
// We strip line- and block-comments first so commented-out future entries
// (e.g. "// 'src/cli/main.ts',") don't get treated as live. This is
// regex-grade not parser-grade: a string literal containing a literal "//"
// would lose tail content, but the tsdown config never contains those.
const configRaw = readFileSync(TSDOWN_CONFIG, 'utf8');
const config = configRaw
  .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (preserve URLs after `:`)

const entryBlock = config.match(/entry:\s*\[([\s\S]*?)\]/);
if (!entryBlock) {
  console.error(
    '[check-dist-exports] FAIL: could not locate `entry: [ ... ]` in tsdown.config.ts.'
  );
  process.exit(1);
}

const rawEntries = [...entryBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);

// Expand single-level globs (e.g. `src/lib/*.ts`) to concrete file paths.
// Multi-level globs (`**`) are NOT supported here — tsdown's own resolver
// handles them, but we'd need a real glob lib for that. For now the config
// only uses single-level patterns under flat dirs.
function expandGlob(pattern) {
  if (!pattern.includes('*')) return [pattern];
  // Pattern shape we support: `<dir>/*.<ext>`.
  const match = pattern.match(/^([^*]+)\/\*\.(\w+)$/);
  if (!match) {
    console.error(
      `[check-dist-exports] FAIL: unsupported glob pattern in tsdown.config.ts: ${pattern}`
    );
    process.exit(1);
  }
  const [, dir, ext] = match;
  const absDir = path.join(REPO_ROOT, dir);
  if (!existsSync(absDir)) return [];
  return readdirSync(absDir)
    .filter(
      (f) =>
        f.endsWith(`.${ext}`) &&
        !f.endsWith(`.d.${ext}`) &&
        !f.endsWith(`.test.${ext}`) &&
        statSync(path.join(absDir, f)).isFile()
    )
    .map((f) => path.posix.join(dir, f));
}

const entries = rawEntries.flatMap(expandGlob);

if (entries.length === 0) {
  console.log('[check-dist-exports] dormant: tsdown.config.ts entry list is empty.');
  process.exit(0);
}

// Determine the shared rootDir by computing the longest path prefix that
// every entry shares. tsdown strips this prefix when emitting to dist/, so
// `src/cli/main.ts` with rootDir `src/` lands at `dist/cli/main.mjs`.
function commonPrefixDir(paths) {
  if (paths.length === 0) return '';
  const split = paths.map((p) => p.split('/'));
  const min = Math.min(...split.map((s) => s.length));
  const out = [];
  for (let i = 0; i < min; i++) {
    const seg = split[0][i];
    if (split.every((s) => s[i] === seg)) out.push(seg);
    else break;
  }
  // Trim the final segment if it's a filename (to keep only the dir prefix).
  if (out.length > 0 && /\.[a-z]+$/.test(out[out.length - 1])) out.pop();
  return out.join('/');
}

const rootDir = commonPrefixDir(entries);

function distRelativeOf(entry) {
  const stripped =
    rootDir && entry.startsWith(`${rootDir}/`) ? entry.slice(rootDir.length + 1) : entry;
  return stripped.replace(/\.ts$/, '');
}

const failures = [];

for (const entry of entries) {
  const sourcePath = path.join(REPO_ROOT, entry);
  const distRel = distRelativeOf(entry);
  const mjsPath = path.join(DIST_DIR, `${distRel}.mjs`);
  const dtsPath = path.join(DIST_DIR, `${distRel}.d.mts`);
  const mapPath = path.join(DIST_DIR, `${distRel}.mjs.map`);

  if (!existsSync(sourcePath)) {
    failures.push(`source missing: ${entry}`);
    continue;
  }
  if (!existsSync(mjsPath)) {
    failures.push(`compiled module missing: dist/${distRel}.mjs (entry: ${entry})`);
    continue;
  }
  if (!existsSync(dtsPath)) {
    failures.push(`type declaration missing: dist/${distRel}.d.mts (entry: ${entry})`);
    continue;
  }
  if (!existsSync(mapPath)) {
    failures.push(`sourcemap missing: dist/${distRel}.mjs.map (entry: ${entry})`);
    continue;
  }

  // Extract named exports from source. This is regex-grade not parser-grade
  // — sufficient for the contract we care about (named exports, exported
  // function/const/class/type/interface declarations).
  //
  // We strip line- and block-comments first so trailing-comment text like
  // `// Report / export` followed by `const result = ...` doesn't get
  // glued together into a phantom `export const result` match. (Live bug
  // observed in src/cli/commands/deferred.ts.) Replace comment bodies
  // with whitespace of equal length so reported indices stay aligned.
  const rawSource = readFileSync(sourcePath, 'utf8');
  const source = rawSource
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (full, prefix) => prefix + ' '.repeat(full.length - prefix.length)
    );
  const sourceExports = new Set();
  for (const m of source.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
  )) {
    sourceExports.add(m[1]);
  }
  for (const m of source.matchAll(/export\s*\{\s*([^}]+)\s*\}/g)) {
    for (const name of m[1].split(',')) {
      const trimmed = name
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (trimmed) sourceExports.add(trimmed);
    }
  }

  if (sourceExports.size === 0) continue; // no named exports to verify

  const dts = readFileSync(dtsPath, 'utf8');
  for (const name of sourceExports) {
    // Match: `export ... <name>` or `export { ..., <name>, ... }` or
    //        `<name>` appearing after `declare`. The d.ts may rename or
    //        wrap, but the symbol must appear somewhere in an export
    //        position.
    const exportRe = new RegExp(
      `export\\s+(?:declare\\s+)?(?:async\\s+)?(?:function|const|let|var|class|type|interface|\\{[^}]*\\b${name}\\b)`,
      'g'
    );
    if (!exportRe.test(dts) || !dts.includes(name)) {
      failures.push(
        `export drift: source ${entry} exports \`${name}\` but dist/${distRel}.d.mts does not.`
      );
    }
  }

  // Shebang preservation for CLI-flagged entries (cli/bin/main/bootstrap).
  if (/(?:^|\/)(?:cli|main|bin|bootstrap)\b/.test(entry)) {
    const sourceShebang = source.startsWith('#!');
    if (sourceShebang) {
      const compiled = readFileSync(mjsPath, 'utf8');
      if (!compiled.startsWith('#!')) {
        failures.push(
          `shebang stripped: ${entry} starts with #! but dist/${distRel}.mjs does not.`
        );
      }
    }
  }
}

if (failures.length === 0) {
  console.log(
    `[check-dist-exports] OK: ${entries.length} entries verified (rootDir="${rootDir}"; mjs + d.mts + map present, exports match, shebangs preserved).`
  );
  process.exit(0);
}

console.error('[check-dist-exports] FAIL: dist/ does not match source contract.');
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
