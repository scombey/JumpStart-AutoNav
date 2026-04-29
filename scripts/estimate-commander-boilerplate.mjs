#!/usr/bin/env node
/**
 * estimate-commander-boilerplate.mjs — T4.7.0 [Blocker] for M8.
 *
 * ADR-002 depth-cost analysis: enumerate the 4–5-level subcommand tree
 * from `bin/cli.js`'s `subcommand === '...'` branches and compute the
 * line-count delta between two CLI framework choices:
 *
 *   - **commander v14**: explicit `.command(name).description(...).option(...).action(fn)`
 *     chain registrations in `src/cli/commands/*.ts`. Boilerplate scales
 *     linearly with subcommand count + nested depth.
 *   - **citty**: lazy `subCommands` map — each entry is a single line
 *     pointing at a dynamically-imported command module. Boilerplate is
 *     near-constant; nested groups add one map per group, not per leaf.
 *
 * Output: `.jumpstart/metrics/cli-framework-cost.json` containing:
 *   {
 *     "subcommand_count": <int>,         // total leaf subcommands
 *     "nested_groups": <int>,            // 2nd-level groups (hash/graph/cab/...)
 *     "options_count": <int>,            // total --flag instances
 *     "commander_lines": <int>,          // estimated boilerplate
 *     "citty_lines": <int>,              // estimated boilerplate
 *     "delta": <int>,                    // commander_lines - citty_lines
 *     "decision": "commander" | "citty",
 *     "rationale": "..."
 *   }
 *
 * Decision criterion (per ADR-002): if `delta > 1000`, switch to citty
 * AND coordinate a sweep across architecture.md + Technology Stack +
 * C4 diagram + earlier implementation-plan references BEFORE T4.7.1.
 *
 * Usage:
 *   node scripts/estimate-commander-boilerplate.mjs
 *
 * @see specs/decisions/adr-002-cli-framework.md
 * @see specs/implementation-plan.md T4.7.0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const CLI_PATH = join(REPO_ROOT, 'bin', 'cli.js');
const OUTPUT_PATH = join(REPO_ROOT, '.jumpstart', 'metrics', 'cli-framework-cost.json');

// ─────────────────────────────────────────────────────────────────────────
// Boilerplate cost model (per-subcommand)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Commander v14 cost model. For every subcommand the registration looks
 * like:
 *
 *   subprogram
 *     .command('name')
 *     .description('one-line description')
 *     .option('--flag <value>', 'description')
 *     .option(...)                          // one line per option
 *     .action(async (opts, cmd) => {
 *       const deps = createRealDeps();
 *       await runImpl(deps, opts, cmd.args);
 *     });
 *
 * Lines per subcommand:
 *   1 (blank separator)
 *   1 (subprogram reference)
 *   1 (.command)
 *   1 (.description)
 *   N (.option × per-option count)
 *   3 (.action open + body line + close)
 *   1 (semicolon line)
 *   = 8 + N
 *
 * Plus the per-command MODULE in src/cli/commands/<name>.ts (5 lines of
 * boilerplate: import, type, export — same in citty so we exclude it
 * from the DELTA).
 */
const COMMANDER_LINES_PER_SUBCOMMAND_BASE = 8;
const COMMANDER_LINES_PER_OPTION = 1;

/**
 * Citty cost model. Subcommands are a lazy map:
 *
 *   const subCommands = {
 *     verify: () => import('./commands/verify.js').then((m) => m.default),
 *     validate: () => import('./commands/validate.js').then((m) => m.default),
 *     ...
 *   };
 *
 * Lines per subcommand: 1 (the map entry).
 *
 * Nested groups add a single sub-map (no per-leaf registration).
 *
 * Plus the per-command MODULE — same as commander, excluded from delta.
 */
const CITTY_LINES_PER_SUBCOMMAND = 1;

// Top-level scaffolding: commander needs ~30 lines (program init,
// global options, version flag, error handler), citty ~25 lines.
// Negligible vs the per-leaf delta.
const COMMANDER_SCAFFOLD_LINES = 30;
const CITTY_SCAFFOLD_LINES = 25;

// ─────────────────────────────────────────────────────────────────────────
// CLI source parser
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse `bin/cli.js` and extract the subcommand tree.
 *
 * Strategy:
 *   1. Match every `if (subcommand === '<name>')` line. These are the
 *      first-level subcommand entries.
 *   2. For each entry, walk forward to the matching `}` and collect:
 *      - Body line count (rough — used for nesting depth heuristic)
 *      - Sub-subcommand patterns (`subSubcommand === '<name>'` or
 *        `process.argv[3]`-driven dispatch)
 *      - --flag option counts (`arg === '--<name>'`)
 */
function parseCli(content) {
  const lines = content.split('\n');
  const subcommands = [];

  let currentSubcommand = null;
  let depth = 0;
  let bodyStartLine = 0;
  let optionsInBody = 0;
  let nestedSubcommandsInBody = 0;

  const subcommandStart = /^\s*if\s+\(subcommand\s*===\s*['"]([\w-]+)['"]\)\s*\{/;
  const nestedStart =
    /(?:if\s+\([^)]*=== ['"][\w-]+['"]\))|(?:process\.argv\[3\]\s*===\s*['"][\w-]+['"])/;
  const optionFlag = /arg\s*===\s*['"]--[\w-]+['"]/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (currentSubcommand === null) {
      const match = line.match(subcommandStart);
      if (match) {
        currentSubcommand = match[1];
        depth = 1;
        bodyStartLine = i;
        optionsInBody = 0;
        nestedSubcommandsInBody = 0;
      }
      continue;
    }

    // Track depth via { and } counts (rough — string literals can
    // confuse this, but for boilerplate-cost ESTIMATION the noise is
    // acceptable. The script outputs a confidence note in the JSON.)
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }

    // Count options + nested subcommands inside the body.
    const optionMatches = line.match(optionFlag);
    if (optionMatches) optionsInBody += optionMatches.length;
    if (nestedStart.test(line) && i !== bodyStartLine) nestedSubcommandsInBody++;

    if (depth === 0) {
      subcommands.push({
        name: currentSubcommand,
        startLine: bodyStartLine + 1,
        endLine: i + 1,
        bodyLines: i - bodyStartLine,
        options: optionsInBody,
        nestedSubcommands: nestedSubcommandsInBody,
      });
      currentSubcommand = null;
    }
  }

  return subcommands;
}

// ─────────────────────────────────────────────────────────────────────────
// Cost computation
// ─────────────────────────────────────────────────────────────────────────

function computeCost(subcommands) {
  let commanderLines = COMMANDER_SCAFFOLD_LINES;
  let cittyLines = CITTY_SCAFFOLD_LINES;
  let totalOptions = 0;
  let nestedGroups = 0;

  for (const sub of subcommands) {
    totalOptions += sub.options;
    commanderLines +=
      COMMANDER_LINES_PER_SUBCOMMAND_BASE + sub.options * COMMANDER_LINES_PER_OPTION;
    cittyLines += CITTY_LINES_PER_SUBCOMMAND;

    if (sub.nestedSubcommands > 0) {
      nestedGroups++;
      // Commander needs each nested leaf registered too — full chain
      // per nested entry.
      commanderLines +=
        sub.nestedSubcommands * (COMMANDER_LINES_PER_SUBCOMMAND_BASE + 1) /* avg options */;
      // Citty: just one extra map line per nested leaf.
      cittyLines += sub.nestedSubcommands * CITTY_LINES_PER_SUBCOMMAND;
    }
  }

  return {
    subcommand_count: subcommands.length,
    nested_groups: nestedGroups,
    options_count: totalOptions,
    commander_lines: commanderLines,
    citty_lines: cittyLines,
    delta: commanderLines - cittyLines,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Decision logic
// ─────────────────────────────────────────────────────────────────────────

function decide(metrics) {
  const THRESHOLD = 1000;
  if (metrics.delta > THRESHOLD) {
    return {
      decision: 'citty',
      rationale: `Commander adds ${metrics.delta} lines of boilerplate over citty (>${THRESHOLD} threshold per ADR-002). Coordinated sweep required across architecture.md + Technology Stack + C4 diagram BEFORE T4.7.1.`,
    };
  }
  return {
    decision: 'commander',
    rationale: `Commander boilerplate delta is ${metrics.delta} lines (≤${THRESHOLD} threshold per ADR-002). Proceed with commander v14 as documented in specs/decisions/adr-002-cli-framework.md.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

if (!existsSync(CLI_PATH)) {
  console.error(`error: ${CLI_PATH} not found`);
  process.exit(1);
}

const content = readFileSync(CLI_PATH, 'utf8');
const subcommands = parseCli(content);
const metrics = computeCost(subcommands);
const decision = decide(metrics);

const report = {
  generated_at: new Date().toISOString(),
  source_file: 'bin/cli.js',
  source_lines: content.split('\n').length,
  ...metrics,
  ...decision,
  notes: [
    'Per-subcommand cost models live at the top of this script.',
    'Body line counts use a rough { } depth tracker — string literals can introduce small noise.',
    'Both frameworks share the per-command-module boilerplate (5 lines of imports/exports per file); excluded from the delta.',
    `Decision criterion: delta > 1000 lines → citty (per ADR-002).`,
  ],
  per_subcommand: subcommands,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

// Concise stdout summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('ADR-002 depth-cost analysis (T4.7.0)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Source:           bin/cli.js (${report.source_lines} lines)`);
console.log(`Subcommands:      ${metrics.subcommand_count}`);
console.log(`Nested groups:    ${metrics.nested_groups}`);
console.log(`Total options:    ${metrics.options_count}`);
console.log('─────────────────────────────────────────────────');
console.log(`Commander lines:  ${metrics.commander_lines}`);
console.log(`Citty lines:      ${metrics.citty_lines}`);
console.log(`Delta:            ${metrics.delta}`);
console.log('─────────────────────────────────────────────────');
console.log(`Decision:         ${decision.decision.toUpperCase()}`);
console.log(`Rationale:        ${decision.rationale}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`\nFull report: ${OUTPUT_PATH}`);
