/**
 * handoff.ts — Handoff & contract validation cluster (T4.7.2).
 *
 * Ports the following bin/cli.js subcommands:
 *   - handoff-check  (handoff-validator.generateHandoffReport)
 *   - coverage       (coverage.generateCoverageReport)
 *   - consistency    (analyzer.analyze)
 *   - lint           (lint-runner.runLint)
 *   - contracts      (contract-checker.validateContracts)
 *   - regulatory     (regulatory-gate.evaluateRegulatory)
 *   - boundaries     (boundary-check.checkBoundaries)
 *   - task-deps      (graph.auditTaskDependencies)
 *   - diff           (diff.generateDiff)
 *   - modules        (module-loader.loadAllModules)
 *   - validate-module (registry.validateForPublishing)
 *   - handoff        (export.exportHandoffPackage)
 *
 * @see bin/cli.js (lines 1217–1349 + 2309–2329 — legacy reference)
 */

import { existsSync } from 'node:fs';
import { defineCommand } from 'citty';
import { writeResult } from '../../../bin/lib-ts/io.js';
import { type CommandResult, createRealDeps, type Deps } from '../deps.js';
import { assertUserPath, hasFlag, legacyRequire, parseFlag, safeJoin } from './_helpers.js';

// ─────────────────────────────────────────────────────────────────────────
// handoff-check
// ─────────────────────────────────────────────────────────────────────────

export interface HandoffCheckArgs {
  path: string;
  toPhase?: string;
}

export function handoffCheckImpl(deps: Deps, args: HandoffCheckArgs): CommandResult {
  if (!args.path) {
    deps.logger.error('Usage: jumpstart-mode handoff-check <artifact-path> [target-phase]');
    deps.logger.error('  target-phase: architect | dev | qa');
    return { exitCode: 1 };
  }
  // Pit Crew M8 BLOCKER (Adversary 2): containment on user path.
  const safePath = assertUserPath(deps, args.path, 'handoff-check');
  if (!existsSync(safePath)) {
    deps.logger.error(`File not found: ${args.path}`);
    return { exitCode: 1 };
  }
  const handoff = legacyRequire<{
    generateHandoffReport: (
      filePath: string,
      phase: string,
      toPhase: string
    ) => { valid: boolean; errors: string[] };
  }>('handoff-validator');
  const toPhase = args.toPhase ?? 'architect';
  const report = handoff.generateHandoffReport(safePath, 'upstream', toPhase);
  if (report.valid) {
    deps.logger.success(`Handoff contract valid for transition to ${toPhase}.`);
    return { exitCode: 0 };
  }
  deps.logger.error('Handoff contract violations:');
  for (const e of report.errors) deps.logger.warn(`  - ${e}`);
  return { exitCode: 1 };
}

export const handoffCheckCommand = defineCommand({
  meta: { name: 'handoff-check', description: 'Validate handoff contract from artifact' },
  args: {
    path: { type: 'positional', description: 'Artifact path', required: true },
    toPhase: { type: 'positional', description: 'architect | dev | qa', required: false },
  },
  run({ args }) {
    const r = handoffCheckImpl(createRealDeps(), { path: args.path, toPhase: args.toPhase });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'handoff-check failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// coverage
// ─────────────────────────────────────────────────────────────────────────

export interface CoverageArgs {
  prdPath: string;
  planPath: string;
}

export function coverageImpl(deps: Deps, args: CoverageArgs): CommandResult {
  if (!args.prdPath || !args.planPath) {
    deps.logger.error('Usage: jumpstart-mode coverage <prd-path> <plan-path>');
    return { exitCode: 1 };
  }
  // Pit Crew M8 BLOCKER (Adversary 2): containment on both user paths.
  const safePrd = assertUserPath(deps, args.prdPath, 'coverage:prd');
  const safePlan = assertUserPath(deps, args.planPath, 'coverage:plan');
  const coverageMod = legacyRequire<{
    generateCoverageReport: (prdPath: string, planPath: string) => string;
  }>('coverage');
  deps.logger.info(coverageMod.generateCoverageReport(safePrd, safePlan));
  return { exitCode: 0 };
}

export const coverageCommand = defineCommand({
  meta: { name: 'coverage', description: 'Check story-to-task coverage' },
  args: {
    prdPath: { type: 'positional', description: 'PRD path', required: true },
    planPath: { type: 'positional', description: 'Plan path', required: true },
  },
  run({ args }) {
    const r = coverageImpl(createRealDeps(), { prdPath: args.prdPath, planPath: args.planPath });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'coverage failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// consistency
// ─────────────────────────────────────────────────────────────────────────

export interface ConsistencyArgs {
  specsDir?: string;
}

export function consistencyImpl(deps: Deps, args: ConsistencyArgs): CommandResult {
  // The TS-ported analyzer takes { specs_dir, root }; passes through to
  // the legacy bin/lib/analyzer.js. The legacy bin/cli.js call passed
  // only specs_dir as a string — we map that here.
  const { analyze } =
    require('../../../bin/lib-ts/analyzer.js') as typeof import('../../../bin/lib-ts/analyzer.js');
  const specsDir = args.specsDir ?? safeJoin(deps, 'specs');
  const result = analyze({ specs_dir: specsDir, root: deps.projectRoot });
  writeResult(result as unknown as Record<string, unknown>);
  return { exitCode: 0 };
}

export const consistencyCommand = defineCommand({
  meta: { name: 'consistency', description: 'Run cross-artifact consistency analysis' },
  args: {
    specsDir: { type: 'positional', description: 'Specs directory', required: false },
  },
  run({ args }) {
    consistencyImpl(createRealDeps(), { specsDir: args.specsDir });
  },
});

// ─────────────────────────────────────────────────────────────────────────
// lint
// ─────────────────────────────────────────────────────────────────────────

export interface LintArgs {
  targetDir?: string;
}

export async function lintImpl(deps: Deps, args: LintArgs): Promise<CommandResult> {
  const { runLint } = legacyRequire<{
    runLint: (dir: string) => Promise<Record<string, unknown> & { ok?: boolean; pass?: boolean }>;
  }>('lint-runner');
  // Pit Crew M8 HIGH (Adversary 5 + Reviewer 2): containment on
  // user-supplied targetDir.
  const safeDir = args.targetDir
    ? assertUserPath(deps, args.targetDir, 'lint:targetDir')
    : deps.projectRoot;
  const result = await runLint(safeDir);
  writeResult(result);
  // Pit Crew M8 MED (Reviewer 5): pre-fix discarded result; lint
  // failures invisible to CI exit code. Post-fix: respect ok/pass.
  const passed = result.ok !== false && result.pass !== false;
  return { exitCode: passed ? 0 : 1 };
}

export const lintCommand = defineCommand({
  meta: { name: 'lint', description: 'Auto-detect and run project linter' },
  args: {
    targetDir: { type: 'positional', description: 'Target directory', required: false },
  },
  async run({ args }) {
    const r = await lintImpl(createRealDeps(), { targetDir: args.targetDir });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'lint failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// contracts
// ─────────────────────────────────────────────────────────────────────────

export function contractsImpl(deps: Deps): CommandResult {
  const { validateContracts } =
    require('../../../bin/lib-ts/contract-checker.js') as typeof import('../../../bin/lib-ts/contract-checker.js');
  const specsDir = safeJoin(deps, 'specs');
  const result = validateContracts({ root: specsDir });
  writeResult(result as unknown as Record<string, unknown>);
  return { exitCode: 0 };
}

export const contractsCommand = defineCommand({
  meta: { name: 'contracts', description: 'Validate API contracts vs data model' },
  args: {},
  run() {
    contractsImpl(createRealDeps());
  },
});

// ─────────────────────────────────────────────────────────────────────────
// regulatory
// ─────────────────────────────────────────────────────────────────────────

export function regulatoryImpl(deps: Deps): CommandResult {
  // Legacy bin/lib/regulatory-gate.js consumed the config-path string;
  // the TS port consumes a parsed RegulatoryInput. Both paths exist
  // during the strangler phase. We use the legacy lib because the
  // CLI layer is meant to be as thin as possible — config parsing
  // belongs upstream of the gate.
  const lib = legacyRequire<{
    evaluateRegulatory: (configPath: string) => Record<string, unknown>;
  }>('regulatory-gate');
  const configPath = safeJoin(deps, '.jumpstart', 'config.yaml');
  const result = lib.evaluateRegulatory(configPath);
  writeResult(result);
  return { exitCode: 0 };
}

export const regulatoryCommand = defineCommand({
  meta: { name: 'regulatory', description: 'Run regulatory compliance gate' },
  args: {},
  run() {
    regulatoryImpl(createRealDeps());
  },
});

// ─────────────────────────────────────────────────────────────────────────
// boundaries
// ─────────────────────────────────────────────────────────────────────────

export function boundariesImpl(deps: Deps): CommandResult {
  const { checkBoundaries } = legacyRequire<{
    checkBoundaries: (specsDir: string) => Record<string, unknown>;
  }>('boundary-check');
  const specsDir = safeJoin(deps, 'specs');
  const result = checkBoundaries(specsDir);
  writeResult(result);
  return { exitCode: 0 };
}

export const boundariesCommand = defineCommand({
  meta: { name: 'boundaries', description: 'Validate plan against product-brief boundaries' },
  args: {},
  run() {
    boundariesImpl(createRealDeps());
  },
});

// ─────────────────────────────────────────────────────────────────────────
// task-deps
// ─────────────────────────────────────────────────────────────────────────

export function taskDepsImpl(deps: Deps): CommandResult {
  const graph = legacyRequire<{
    loadGraph: (graphPath: string) => unknown;
    auditTaskDependencies: (graph: unknown) => Record<string, unknown>;
  }>('graph');
  const graphPath = safeJoin(deps, '.jumpstart', 'spec-graph.json');
  if (!existsSync(graphPath)) {
    deps.logger.error('No spec graph found. Run: jumpstart-mode graph build');
    return { exitCode: 1 };
  }
  const graphData = graph.loadGraph(graphPath);
  const audit = graph.auditTaskDependencies(graphData);
  writeResult(audit);
  return { exitCode: 0 };
}

export const taskDepsCommand = defineCommand({
  meta: { name: 'task-deps', description: 'Audit task dependency graph' },
  args: {},
  run() {
    const r = taskDepsImpl(createRealDeps());
    if (r.exitCode !== 0) throw new Error(r.message ?? 'task-deps failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// diff
// ─────────────────────────────────────────────────────────────────────────

export interface DiffArgs {
  path?: string;
}

export function diffImpl(deps: Deps, args: DiffArgs): CommandResult {
  const lib = legacyRequire<{
    generateDiff: (target: string) => Record<string, unknown>;
  }>('diff');
  // Pit Crew M8 HIGH (Adversary 5): pre-fix `target = args.path ?? root`
  // forwarded raw user input to generateDiff which then walked the
  // attacker-chosen directory. Post-fix: gate via assertUserPath.
  const target = args.path ? assertUserPath(deps, args.path, 'diff:path') : deps.projectRoot;
  const result = lib.generateDiff(target);
  writeResult(result);
  return { exitCode: 0 };
}

export const diffCommand = defineCommand({
  meta: { name: 'diff', description: 'Show dry-run diff summary' },
  args: {
    path: { type: 'positional', description: 'Target path', required: false },
  },
  run({ args }) {
    diffImpl(createRealDeps(), { path: args.path });
  },
});

// ─────────────────────────────────────────────────────────────────────────
// modules
// ─────────────────────────────────────────────────────────────────────────

export function modulesImpl(deps: Deps): CommandResult {
  const { loadAllModules } = legacyRequire<{
    loadAllModules: (dir: string) => Record<string, unknown>;
  }>('module-loader');
  const modulesDir = safeJoin(deps, '.jumpstart', 'modules');
  const result = loadAllModules(modulesDir);
  writeResult(result);
  return { exitCode: 0 };
}

export const modulesCommand = defineCommand({
  meta: { name: 'modules', description: 'Load and list installed modules' },
  args: {},
  run() {
    modulesImpl(createRealDeps());
  },
});

// ─────────────────────────────────────────────────────────────────────────
// validate-module
// ─────────────────────────────────────────────────────────────────────────

export interface ValidateModuleArgs {
  moduleDir: string;
}

export function validateModuleImpl(deps: Deps, args: ValidateModuleArgs): CommandResult {
  if (!args.moduleDir) {
    deps.logger.error('Usage: jumpstart-mode validate-module <module-dir>');
    return { exitCode: 1 };
  }
  // Pit Crew M8 BLOCKER (Reviewer 2 + Adversary 4, confirmed exploit):
  // pre-fix `path.resolve(args.moduleDir)` forwarded an absolute
  // attacker-supplied path (e.g. "/etc") directly to validateForPublishing
  // which walked the host filesystem. Post-fix: gate via assertUserPath.
  const safeDir = assertUserPath(deps, args.moduleDir, 'validate-module:moduleDir');
  const { validateForPublishing } =
    require('../../../bin/lib-ts/registry.js') as typeof import('../../../bin/lib-ts/registry.js');
  const result = validateForPublishing(safeDir);
  writeResult(result as unknown as Record<string, unknown>);
  return { exitCode: 0 };
}

export const validateModuleCommand = defineCommand({
  meta: { name: 'validate-module', description: 'Validate module for marketplace publishing' },
  args: {
    moduleDir: { type: 'positional', description: 'Module directory', required: true },
  },
  run({ args }) {
    const r = validateModuleImpl(createRealDeps(), { moduleDir: args.moduleDir });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'validate-module failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// handoff (export package)
// ─────────────────────────────────────────────────────────────────────────

export interface HandoffArgs {
  rest: string[];
}

export function handoffImpl(deps: Deps, args: HandoffArgs): CommandResult {
  const { exportHandoffPackage } = legacyRequire<{
    exportHandoffPackage: (opts: { root: string; outputPath?: string }) => {
      success: boolean;
      output_path?: string;
      stats?: Record<string, number>;
      error?: string;
    };
  }>('export');
  const outputPath = parseFlag(args.rest, 'output');
  const jsonMode = hasFlag(args.rest, 'json');
  const result = exportHandoffPackage({ root: deps.projectRoot, outputPath });
  if (jsonMode) {
    writeResult(result as unknown as Record<string, unknown>);
    return { exitCode: 0 };
  }
  if (result.success) {
    deps.logger.success(`Handoff package exported: ${result.output_path}`);
    if (result.stats) {
      deps.logger.info(
        `   Phases: ${result.stats.phases} | Approved: ${result.stats.approved} | Decisions: ${result.stats.decisions} | Open items: ${result.stats.open_items}`
      );
    }
    return { exitCode: 0 };
  }
  deps.logger.error(result.error ?? 'handoff failed');
  return { exitCode: 1 };
}

export const handoffCommand = defineCommand({
  meta: { name: 'handoff', description: 'Export portable handoff package' },
  args: {
    rest: { type: 'positional', description: 'Optional flags', required: false },
  },
  run({ args }) {
    const rest: string[] = Array.isArray(args.rest)
      ? args.rest.map((v) => String(v))
      : args.rest
        ? [String(args.rest)]
        : [];
    const r = handoffImpl(createRealDeps(), { rest });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'handoff failed');
  },
});
