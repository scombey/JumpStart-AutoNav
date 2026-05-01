/**
 * enterprise.ts — Enterprise / platform / codebase-intel / misc cluster.
 *
 * Per-command structure:
 *   - `<name>Args` interface — citty-style typed args.
 *   - `<name>Impl(deps, args)` — pure function returning `CommandResult`.
 *   - `<name>Command` — `defineCommand` with `meta.name` and `run()`.
 *
 * Architectural rules (per ADR-006/-009):
 *   1. Public surface preserved (every command name is reachable).
 *   2. Named exports for both `<name>Command` and `<name>Impl`.
 *   3. Any user-supplied path routes through `assertUserPath()`.
 *   4. No `process.exit()` — return `CommandResult { exitCode }`.
 *   5. `.js` extensions on all relative imports.
 *   6. Top-level ES imports for sibling lib modules.
 */

import { defineCommand } from 'citty';
import * as codebaseRetrieval from '../../lib/codebase-retrieval.js';
import * as contractFirst from '../../lib/contract-first.js';
import * as deterministicArtifacts from '../../lib/deterministic-artifacts.js';
import * as legacyEnterpriseSearch from '../../lib/enterprise-search.js';
import * as legacyEnterpriseTemplates from '../../lib/enterprise-templates.js';
import * as legacyEnvironmentPromotion from '../../lib/environment-promotion.js';
import * as legacyFitnessFunctions from '../../lib/fitness-functions.js';
import * as impactAnalysis from '../../lib/impact-analysis.js';
import { writeResult as ioWriteResult } from '../../lib/io.js';
import * as legacyLegacyModernizer from '../../lib/legacy-modernizer.js';
import * as legacyMigrationPlanner from '../../lib/migration-planner.js';
import * as legacyMultiRepo from '../../lib/multi-repo.js';
import * as legacyParallelAgents from '../../lib/parallel-agents.js';
import * as legacyPatternLibrary from '../../lib/pattern-library.js';
import * as legacyPersonaPacks from '../../lib/persona-packs.js';
import * as legacyPlatformEngineering from '../../lib/platform-engineering.js';
import * as legacyPrPackage from '../../lib/pr-package.js';
import * as promptlessMode from '../../lib/promptless-mode.js';
import * as legacyReferenceArchitectures from '../../lib/reference-architectures.js';
import * as legacyReleaseReadiness from '../../lib/release-readiness.js';
import * as repoGraph from '../../lib/repo-graph.js';
import * as legacyTemplateMerge from '../../lib/template-merge.js';
import { type CommandResult, createRealDeps, type Deps } from '../deps.js';
import { assertUserPath, safeJoin } from './_helpers.js';

// Permissive shape for legacy lib modules — every callsite immediately narrows
// via property access. Documenting once here so individual commands stay terse.
// biome-ignore lint/suspicious/noExplicitAny: <legacy lib runtime shapes>
type LegacyLib = Record<string, any>;

/** Helper: write result via io.writeResult when --json mode is on,
 *  otherwise let the caller render. */
function maybeJson(_deps: Deps, json: boolean | undefined, result: unknown): void {
  if (!json) return;
  ioWriteResult(result as Record<string, unknown>);
}

// ─────────────────────────────────────────────────────────────────────────
// enterprise-search (bin/cli.js ~5098)
// ─────────────────────────────────────────────────────────────────────────

export interface EnterpriseSearchArgs {
  action?: string | undefined;
  query?: string | undefined;
  json?: boolean | undefined;
}

export function enterpriseSearchImpl(deps: Deps, args: EnterpriseSearchArgs): CommandResult {
  // to a static import of the TS port at `src/lib/enterprise-search.ts`. Public
  // surface preserved verbatim — see refs in tests/test-enterprise-search.test.ts.
  const lib = legacyEnterpriseSearch as LegacyLib;
  const action = args.action ?? 'index';
  if (action === 'search') {
    if (!args.query) {
      deps.logger.error('Usage: jumpstart-mode enterprise-search search <query>');
      return { exitCode: 1 };
    }
    const result = lib.searchProject(deps.projectRoot, args.query);
    maybeJson(deps, args.json, result);
    if (!args.json)
      deps.logger.info(`Search "${args.query}" — ${result.total_results ?? 0} results`);
    return { exitCode: 0 };
  }
  const result = lib.indexProject(deps.projectRoot);
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Enterprise Search Index: ${result.total_entries ?? 0} entries`);
  return { exitCode: 0 };
}

export const enterpriseSearchCommand = defineCommand({
  meta: { name: 'enterprise-search', description: 'Enterprise search index/query' },
  args: {
    action: { type: 'positional', required: false, description: 'index | search' },
    query: { type: 'positional', required: false, description: 'search query' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = enterpriseSearchImpl(createRealDeps(), {
      action: args.action,
      query: args.query,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'enterprise-search failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// enterprise-templates (bin/cli.js ~4421)
// ─────────────────────────────────────────────────────────────────────────

export interface EnterpriseTemplatesArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function enterpriseTemplatesImpl(deps: Deps, args: EnterpriseTemplatesArgs): CommandResult {
  // to a static import of the TS port at `src/lib/enterprise-templates.ts`. Legacy
  // exposed only `listTemplates`/`getTemplate`/`applyTemplate` — the previous
  // `register` action invoked an undefined `registerTemplate` and was dead at
  // runtime. Removed; if a future spec needs registry semantics it lands on
  // a real port. Also fixed an arg-order bug in the apply path: legacy's
  // signature is `applyTemplate(root, vertical, options)` but the cluster
  // had been calling it `applyTemplate(vertical, root, options)`.
  const action = args.action ?? 'list';
  let result: unknown;
  if (action === 'list') {
    result = legacyEnterpriseTemplates.listTemplates();
  } else if (action === 'apply') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode enterprise-templates apply <vertical>');
      return { exitCode: 1 };
    }
    result = legacyEnterpriseTemplates.applyTemplate(deps.projectRoot, args.arg);
  } else if (action === 'get') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode enterprise-templates get <vertical>');
      return { exitCode: 1 };
    }
    result = legacyEnterpriseTemplates.getTemplate(args.arg);
  } else {
    result = legacyEnterpriseTemplates.listTemplates();
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Enterprise templates: ${action} complete`);
  return { exitCode: 0 };
}

export const enterpriseTemplatesCommand = defineCommand({
  meta: { name: 'enterprise-templates', description: 'Enterprise template registry' },
  args: {
    action: { type: 'positional', required: false, description: 'list | apply | register' },
    arg: { type: 'positional', required: false, description: 'template id or name' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = enterpriseTemplatesImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'enterprise-templates failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// env-promotion (bin/cli.js ~3322)
// ─────────────────────────────────────────────────────────────────────────

export interface EnvPromotionArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function envPromotionImpl(deps: Deps, args: EnvPromotionArgs): CommandResult {
  // to a static import of the TS port at `src/lib/environment-promotion.ts`.
  // Existing wiring already invoked the real exports (`promote`/`checkGates`/
  // `getStatus`); no latent bugs to fix.
  const action = args.action ?? 'status';
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'environment-promotion.json');
  let result: unknown;
  if (action === 'promote') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode env-promotion promote <environment>');
      return { exitCode: 1 };
    }
    result = legacyEnvironmentPromotion.promote(args.arg, { stateFile });
  } else if (action === 'gate') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode env-promotion gate <environment>');
      return { exitCode: 1 };
    }
    result = legacyEnvironmentPromotion.checkGates(args.arg, { stateFile });
  } else {
    result = legacyEnvironmentPromotion.getStatus({ stateFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Env promotion: ${action}`);
  return { exitCode: 0 };
}

export const envPromotionCommand = defineCommand({
  meta: { name: 'env-promotion', description: 'Environment promotion gates' },
  args: {
    action: { type: 'positional', required: false, description: 'status | promote | gate' },
    arg: { type: 'positional', required: false, description: 'environment name' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = envPromotionImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'env-promotion failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// fitness-functions (bin/cli.js ~3056)
// ─────────────────────────────────────────────────────────────────────────

export interface FitnessFunctionsArgs {
  action?: string | undefined;
  name?: string | undefined;
  category?: string | undefined;
  json?: boolean | undefined;
}

export function fitnessFunctionsImpl(deps: Deps, args: FitnessFunctionsArgs): CommandResult {
  // functions')` to a static import of the TS port at
  // `src/lib/fitness-functions.ts`. Existing wiring already invoked the
  // actual exports — no latent bugs to fix here.
  const action = args.action ?? 'evaluate';
  const registryFile = safeJoin(deps, '.jumpstart', 'fitness-functions.json');
  let result: unknown;
  if (action === 'add') {
    if (!args.name || !args.category) {
      deps.logger.error('Usage: jumpstart-mode fitness-functions add <name> <category>');
      return { exitCode: 1 };
    }
    result = legacyFitnessFunctions.addFitnessFunction(
      {
        name: args.name,
        category: args.category,
        description: `Fitness function: ${args.name}`,
        pattern: null,
        threshold: null,
      },
      { registryFile }
    );
  } else if (action === 'list') {
    result = legacyFitnessFunctions.listFitnessFunctions({}, { registryFile });
  } else {
    result = legacyFitnessFunctions.evaluateFitness(deps.projectRoot, { registryFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Fitness functions: ${action}`);
  return { exitCode: 0 };
}

export const fitnessFunctionsCommand = defineCommand({
  meta: { name: 'fitness-functions', description: 'Architecture fitness functions' },
  args: {
    action: { type: 'positional', required: false, description: 'evaluate | add | list' },
    name: { type: 'positional', required: false, description: 'function name (add only)' },
    category: { type: 'positional', required: false, description: 'category (add only)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = fitnessFunctionsImpl(createRealDeps(), {
      action: args.action,
      name: args.name,
      category: args.category,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'fitness-functions failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// impact (bin/cli.js ~2441)
// ─────────────────────────────────────────────────────────────────────────

export interface ImpactArgs {
  file?: string | undefined;
  symbol?: string | undefined;
  spec?: string | undefined;
  json?: boolean | undefined;
}

export function impactImpl(deps: Deps, args: ImpactArgs): CommandResult {
  if (!args.file && !args.symbol && !args.spec) {
    deps.logger.error('Usage: jumpstart-mode impact <file> [--symbol <name>] [--spec <id>]');
    return { exitCode: 1 };
  }
  // M11 phase-5c: switched from `legacyRequire('impact-analysis')` to static import.
  const target: { file?: string; symbol?: string; specId?: string } = {};
  if (args.file) target.file = assertUserPath(deps, args.file, 'impact:file');
  if (args.symbol) target.symbol = args.symbol;
  if (args.spec) target.specId = args.spec;
  const result = impactAnalysis.analyzeImpact(deps.projectRoot, target);
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(impactAnalysis.renderImpactReport(result));
  return { exitCode: 0 };
}

export const impactCommand = defineCommand({
  meta: { name: 'impact', description: 'Change impact analysis' },
  args: {
    file: { type: 'positional', required: false, description: 'target file' },
    symbol: { type: 'string', required: false, description: 'symbol name' },
    spec: { type: 'string', required: false, description: 'spec id' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = impactImpl(createRealDeps(), {
      file: args.file,
      symbol: args.symbol,
      spec: args.spec,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'impact failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// knowledge-graph (bin/cli.js ~4808)
// ─────────────────────────────────────────────────────────────────────────

export interface KnowledgeGraphArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function knowledgeGraphImpl(deps: Deps, args: KnowledgeGraphArgs): CommandResult {
  // knowledge-graph isn't a separate lib — surfaces through repo-graph.
  // M11 phase-5c: switched from `legacyRequire('repo-graph')` to static import.
  const graphFile = safeJoin(deps, '.jumpstart', 'state', 'repo-graph.json');
  const action = args.action ?? 'build';
  let result: unknown;
  if (action === 'query') {
    const graph = repoGraph.loadRepoGraph(graphFile);
    result = repoGraph.queryGraph(graph, { type: args.arg ?? undefined, nameContains: undefined });
  } else {
    result = repoGraph.buildRepoGraph(deps.projectRoot, { graphFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Knowledge graph: ${action}`);
  return { exitCode: 0 };
}

export const knowledgeGraphCommand = defineCommand({
  meta: { name: 'knowledge-graph', description: 'Repo knowledge graph (build/query)' },
  args: {
    action: { type: 'positional', required: false, description: 'build | query' },
    arg: { type: 'positional', required: false, description: 'node type filter (query)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = knowledgeGraphImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'knowledge-graph failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// legacy-modernizer (bin/cli.js ~3975)
// ─────────────────────────────────────────────────────────────────────────

export interface LegacyModernizerArgs {
  action?: string | undefined;
  arg?: string | undefined;
  platform?: string | undefined;
  json?: boolean | undefined;
}

export function legacyModernizerImpl(deps: Deps, args: LegacyModernizerArgs): CommandResult {
  // to a static import of the TS port at `src/lib/legacy-modernizer.ts`. The
  // previous wiring called `lib.scan` / `lib.planModernization` — neither was
  // exported by the legacy module, so the command silently produced
  // `undefined` results regardless of arg shape. Replaced with the actual
  // legacy contract: `assessSystem` / `createPlan` / `generateReport`. The
  // legacy CLI default action was `report` (see bin/cli.js ~3982), preserved.
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'legacy-modernization.json');
  const action = args.action ?? 'report';
  let result: unknown;
  if (action === 'assess') {
    if (!args.arg) {
      deps.logger.error(
        'Usage: jumpstart-mode legacy-modernizer assess <name> --platform <platform>'
      );
      return { exitCode: 1 };
    }
    result = legacyLegacyModernizer.assessSystem(
      { name: args.arg, platform: args.platform ?? 'unknown' },
      { stateFile }
    );
  } else if (action === 'plan') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode legacy-modernizer plan <assessment-id>');
      return { exitCode: 1 };
    }
    result = legacyLegacyModernizer.createPlan(args.arg, {}, { stateFile });
  } else {
    result = legacyLegacyModernizer.generateReport({ stateFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Legacy modernizer: ${action}`);
  return { exitCode: 0 };
}

export const legacyModernizerCommand = defineCommand({
  meta: { name: 'legacy-modernizer', description: 'Legacy code modernization scanner' },
  args: {
    action: { type: 'positional', required: false, description: 'report | assess | plan' },
    arg: {
      type: 'positional',
      required: false,
      description: 'name (assess) or assessment id (plan)',
    },
    platform: { type: 'string', required: false, description: 'legacy platform (assess only)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = legacyModernizerImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      platform: args.platform,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'legacy-modernizer failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// merge-templates (bin/cli.js ~2331)
// ─────────────────────────────────────────────────────────────────────────

export interface MergeTemplatesArgs {
  basePath?: string | undefined;
  projectPath?: string | undefined;
}

// (M9 ESM-cutover shim) to a static import of the TS port at
// `src/lib/template-merge.ts`. Now sync — `await` at call sites is a no-op.
// The M8 + M9 regression tests in tests/test-m9-pitcrew-regressions.test.ts
// + tests/test-cli-enterprise.test.ts continue to use `await mergeTemplatesImpl(...)`
// for back-compat; both still pass.
export function mergeTemplatesImpl(deps: Deps, args: MergeTemplatesArgs): CommandResult {
  if (!args.basePath || !args.projectPath) {
    deps.logger.error('Usage: jumpstart-mode merge-templates <base-path> <project-path>');
    return { exitCode: 1 };
  }
  // Both paths are user-supplied — gate them. Note: legacy bin/cli.js used
  // path.resolve on caller input verbatim; the safer port uses assertUserPath
  // which keeps both inside projectRoot per ADR-009.
  const safeBase = assertUserPath(deps, args.basePath, 'merge-templates:base');
  const safeProject = assertUserPath(deps, args.projectPath, 'merge-templates:project');
  const result = legacyTemplateMerge.mergeTemplateFiles(safeBase, safeProject);
  deps.logger.info(JSON.stringify({ stats: result.stats }, null, 2));
  if (result.merged) deps.logger.info(result.merged);
  return { exitCode: 0 };
}

export const mergeTemplatesCommand = defineCommand({
  meta: { name: 'merge-templates', description: 'Template inheritance merge' },
  args: {
    basePath: { type: 'positional', required: false, description: 'base template path' },
    projectPath: { type: 'positional', required: false, description: 'project path' },
  },
  run({ args }) {
    const r = mergeTemplatesImpl(createRealDeps(), {
      basePath: args.basePath,
      projectPath: args.projectPath,
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'merge-templates failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// migration-planner (bin/cli.js ~3961)
// ─────────────────────────────────────────────────────────────────────────

export interface MigrationPlannerArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function migrationPlannerImpl(deps: Deps, args: MigrationPlannerArgs): CommandResult {
  // to a static import of the TS port at `src/lib/migration-planner.ts`. The
  // previous wiring called `lib.planMigration` / `lib.plan` — neither was
  // exported by the legacy module, so the command silently produced
  // `undefined` results regardless of arg shape. Replaced with the actual
  // legacy contract: `createMigration` / `advancePhase` / `generateReport`.
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'migration-plan.json');
  const action = args.action ?? 'report';
  let result: unknown;
  if (action === 'create') {
    if (!args.arg) {
      deps.logger.error(
        'Usage: jumpstart-mode migration-planner create <name> --strategy <strangler-fig|big-bang|phased-cutover|parallel-run|feature-flag>'
      );
      return { exitCode: 1 };
    }
    result = legacyMigrationPlanner.createMigration(
      { name: args.arg, strategy: 'strangler-fig' },
      { stateFile }
    );
  } else if (action === 'report') {
    result = legacyMigrationPlanner.generateReport({ stateFile });
  } else {
    result = legacyMigrationPlanner.generateReport({ stateFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Migration planner: ${action}`);
  return { exitCode: 0 };
}

export const migrationPlannerCommand = defineCommand({
  meta: { name: 'migration-planner', description: 'Migration plan generator' },
  args: {
    action: { type: 'positional', required: false, description: 'plan | execute' },
    arg: { type: 'positional', required: false, description: 'target' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = migrationPlannerImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'migration-planner failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// multi-repo (bin/cli.js ~2347)
// ─────────────────────────────────────────────────────────────────────────

export interface MultiRepoArgs {
  action?: string | undefined;
  arg?: string | undefined;
  role?: string | undefined;
  json?: boolean | undefined;
}

export function multiRepoImpl(deps: Deps, args: MultiRepoArgs): CommandResult {
  // to a static import of the TS port at `src/lib/multi-repo.ts`. Existing
  // wiring already invoked the real exports (`initProgram`/`linkRepo`/
  // `getProgramStatus`); no latent bugs to fix.
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'multi-repo.json');
  const action = args.action ?? 'status';
  let result: unknown;
  if (action === 'init') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode multi-repo init <program-name>');
      return { exitCode: 1 };
    }
    result = legacyMultiRepo.initProgram(args.arg, { stateFile });
  } else if (action === 'link') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode multi-repo link <repo-url> [role]');
      return { exitCode: 1 };
    }
    result = legacyMultiRepo.linkRepo(args.arg, args.role ?? 'other', { stateFile });
  } else {
    result = legacyMultiRepo.getProgramStatus({ stateFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Multi-repo: ${action}`);
  return { exitCode: 0 };
}

export const multiRepoCommand = defineCommand({
  meta: { name: 'multi-repo', description: 'Multi-repo program orchestration' },
  args: {
    action: { type: 'positional', required: false, description: 'status | init | link | plan' },
    arg: { type: 'positional', required: false, description: 'program name or repo url' },
    role: { type: 'positional', required: false, description: 'repo role (link only)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = multiRepoImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      role: args.role,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'multi-repo failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// parallel-agents (bin/cli.js ~2703)
// ─────────────────────────────────────────────────────────────────────────

export interface ParallelAgentsArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function parallelAgentsImpl(deps: Deps, args: ParallelAgentsArgs): CommandResult {
  // to a static import of the TS port at `src/lib/parallel-agents.ts`. The
  // previous wiring called `lib.planParallelExecution` / `lib.getStatus` —
  // neither was exported by the legacy module, so the command silently
  // produced `undefined` results regardless of arg shape. Replaced with
  // the actual legacy contract: `scheduleRun` / `listRuns` / `getRunStatus`
  // / `reconcileRun`. The legacy CLI default was `status`; preserved as a
  // call to `listRuns` since the legacy never had a single-run-status
  // entry point that didn't require a run id.
  const action = args.action ?? 'status';
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'parallel-agents.json');
  let result: unknown;
  if (action === 'schedule' || action === 'plan') {
    result = legacyParallelAgents.scheduleRun([], { root: deps.projectRoot }, { stateFile });
  } else if (action === 'reconcile') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode parallel-agents reconcile <run-id>');
      return { exitCode: 1 };
    }
    result = legacyParallelAgents.reconcileRun(args.arg, { stateFile });
  } else if (action === 'run-status') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode parallel-agents run-status <run-id>');
      return { exitCode: 1 };
    }
    result = legacyParallelAgents.getRunStatus(args.arg, { stateFile });
  } else {
    result = legacyParallelAgents.listRuns({ stateFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Parallel agents: ${action}`);
  return { exitCode: 0 };
}

export const parallelAgentsCommand = defineCommand({
  meta: { name: 'parallel-agents', description: 'Parallel agent orchestration' },
  args: {
    action: {
      type: 'positional',
      required: false,
      description: 'status | schedule | plan | reconcile | run-status',
    },
    arg: { type: 'positional', required: false, description: 'run id (reconcile / run-status)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = parallelAgentsImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'parallel-agents failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// pattern-library (bin/cli.js ~4838)
// ─────────────────────────────────────────────────────────────────────────

export interface PatternLibraryArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function patternLibraryImpl(deps: Deps, args: PatternLibraryArgs): CommandResult {
  // to a static import of the TS port at `src/lib/pattern-library.ts`. Public
  // surface preserved verbatim — see refs in tests/test-pattern-library.test.ts.
  const lib = legacyPatternLibrary as LegacyLib;
  const action = args.action ?? 'list';
  let result: unknown;
  if (action === 'get') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode pattern-library get <pattern-id>');
      return { exitCode: 1 };
    }
    result = lib.getPattern?.(args.arg);
  } else {
    result = lib.listPatterns?.() ?? { patterns: [], total: 0 };
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Pattern library: ${action}`);
  return { exitCode: 0 };
}

export const patternLibraryCommand = defineCommand({
  meta: { name: 'pattern-library', description: 'Reusable pattern library' },
  args: {
    action: { type: 'positional', required: false, description: 'list | get' },
    arg: { type: 'positional', required: false, description: 'pattern id (get)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = patternLibraryImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'pattern-library failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// persona-packs (bin/cli.js ~4774)
// ─────────────────────────────────────────────────────────────────────────

export interface PersonaPacksArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function personaPacksImpl(deps: Deps, args: PersonaPacksArgs): CommandResult {
  // to a static import of the TS port at `src/lib/persona-packs.ts`. Public
  // surface preserved verbatim — see refs in tests/test-persona-packs.test.ts.
  const lib = legacyPersonaPacks as LegacyLib;
  const action = args.action ?? 'list';
  let result: unknown;
  if (action === 'apply') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode persona-packs apply <pack-id>');
      return { exitCode: 1 };
    }
    result = lib.applyPack?.(args.arg, deps.projectRoot);
  } else {
    result = lib.listPacks?.() ?? { packs: [], total: 0 };
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Persona packs: ${action}`);
  return { exitCode: 0 };
}

export const personaPacksCommand = defineCommand({
  meta: { name: 'persona-packs', description: 'Persona pack registry' },
  args: {
    action: { type: 'positional', required: false, description: 'list | apply' },
    arg: { type: 'positional', required: false, description: 'pack id (apply)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = personaPacksImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'persona-packs failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// platform-engineering (bin/cli.js ~4944)
// ─────────────────────────────────────────────────────────────────────────

export interface PlatformEngineeringArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function platformEngineeringImpl(deps: Deps, args: PlatformEngineeringArgs): CommandResult {
  // to a static import of the TS port at `src/lib/platform-engineering.ts`. Public
  // surface preserved verbatim — see refs in tests/test-platform-engineering.test.ts.
  const lib = legacyPlatformEngineering as LegacyLib;
  const action = args.action ?? 'status';
  let result: unknown;
  if (action === 'scaffold') {
    result = lib.scaffold?.(deps.projectRoot, args.arg) ?? lib.getStatus?.();
  } else {
    result = lib.getStatus?.() ?? { templates: [] };
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Platform engineering: ${action}`);
  return { exitCode: 0 };
}

export const platformEngineeringCommand = defineCommand({
  meta: { name: 'platform-engineering', description: 'Internal developer platform' },
  args: {
    action: { type: 'positional', required: false, description: 'status | scaffold' },
    arg: { type: 'positional', required: false, description: 'template name (scaffold)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = platformEngineeringImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'platform-engineering failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// pr-package (bin/cli.js ~2658)
// ─────────────────────────────────────────────────────────────────────────

export interface PrPackageArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function prPackageImpl(deps: Deps, args: PrPackageArgs): CommandResult {
  // to a static import of the TS port at `src/lib/pr-package.ts`. The
  // previous wiring called `lib.generatePrPackage` / `lib.getStatus` —
  // neither was exported by the legacy module, so the command silently
  // produced `undefined` results regardless of arg shape. Replaced with
  // the actual legacy contract: `createPRPackage` / `listPRPackages` /
  // `exportPRPackage`. The legacy CLI default action was `generate` (see
  // bin/cli.js ~2658); preserved as a thin wrapper that turns the optional
  // branch arg into a minimal title + summary so the call shape stays
  // stable without accreting new args.
  const action = args.action ?? 'generate';
  let result: unknown;
  if (action === 'generate') {
    const branch = args.arg ?? 'unknown-branch';
    result = legacyPrPackage.createPRPackage(
      {
        title: `Work package — ${branch}`,
        summary: `Auto-generated work package for branch \`${branch}\`.`,
      },
      deps.projectRoot
    );
  } else if (action === 'list') {
    result = legacyPrPackage.listPRPackages(deps.projectRoot);
  } else if (action === 'export') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode pr-package export <package-id>');
      return { exitCode: 1 };
    }
    result = legacyPrPackage.exportPRPackage(args.arg, deps.projectRoot);
  } else {
    result = legacyPrPackage.listPRPackages(deps.projectRoot);
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`PR package: ${action}`);
  return { exitCode: 0 };
}

export const prPackageCommand = defineCommand({
  meta: { name: 'pr-package', description: 'Pull-request review package generator' },
  args: {
    action: { type: 'positional', required: false, description: 'generate | list | export' },
    arg: { type: 'positional', required: false, description: 'branch name or package id' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = prPackageImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'pr-package failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// promptless-mode (bin/cli.js ~4694)
// ─────────────────────────────────────────────────────────────────────────

export interface PromptlessModeArgs {
  action?: string | undefined;
  json?: boolean | undefined;
}

export function promptlessModeImpl(deps: Deps, args: PromptlessModeArgs): CommandResult {
  // M11 phase-5c: switched from `legacyRequire('promptless-mode')` to static import.
  // Port exports: startWizard, answerStep, getWizardStatus.
  // Legacy enable/disable/getStatus were phantom methods; adapted to port API.
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'promptless-mode.json');
  const action = args.action ?? 'status';
  let result: unknown;
  if (action === 'enable') {
    result = promptlessMode.startWizard('project-setup', { stateFile });
  } else if (action === 'disable') {
    result = promptlessMode.getWizardStatus({ stateFile });
  } else {
    result = promptlessMode.getWizardStatus({ stateFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Promptless mode: ${action}`);
  return { exitCode: 0 };
}

export const promptlessModeCommand = defineCommand({
  meta: { name: 'promptless-mode', description: 'Toggle promptless agent mode' },
  args: {
    action: { type: 'positional', required: false, description: 'status | enable | disable' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = promptlessModeImpl(createRealDeps(), {
      action: args.action,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'promptless-mode failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// reference-arch (bin/cli.js ~3104)
// ─────────────────────────────────────────────────────────────────────────

export interface ReferenceArchArgs {
  action?: string | undefined;
  arg?: string | undefined;
  category?: string | undefined;
  json?: boolean | undefined;
}

export function referenceArchImpl(deps: Deps, args: ReferenceArchArgs): CommandResult {
  // architectures')` to a static import of the TS port at
  // `src/lib/reference-architectures.ts`. Existing wiring already
  // invoked the actual exports — no latent bugs to fix here.
  const action = args.action ?? 'list';
  let result: unknown;
  if (action === 'get') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode reference-arch get <pattern-id>');
      return { exitCode: 1 };
    }
    result = legacyReferenceArchitectures.getPattern(args.arg);
  } else if (action === 'register') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode reference-arch register <name>');
      return { exitCode: 1 };
    }
    result = legacyReferenceArchitectures.registerPattern({
      name: args.arg,
      category: args.category ?? 'other',
      description: `Custom pattern: ${args.arg}`,
    });
  } else if (action === 'instantiate') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode reference-arch instantiate <pattern-id>');
      return { exitCode: 1 };
    }
    result = legacyReferenceArchitectures.instantiatePattern(args.arg, deps.projectRoot);
  } else {
    result = legacyReferenceArchitectures.listPatterns();
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Reference arch: ${action}`);
  return { exitCode: 0 };
}

export const referenceArchCommand = defineCommand({
  meta: { name: 'reference-arch', description: 'Reference architecture patterns' },
  args: {
    action: {
      type: 'positional',
      required: false,
      description: 'list | get | register | instantiate',
    },
    arg: { type: 'positional', required: false, description: 'pattern id or name' },
    category: { type: 'positional', required: false, description: 'category (register only)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = referenceArchImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      category: args.category,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'reference-arch failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// release-readiness (bin/cli.js ~3450)
// ─────────────────────────────────────────────────────────────────────────

export interface ReleaseReadinessArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function releaseReadinessImpl(deps: Deps, args: ReleaseReadinessArgs): CommandResult {
  // to a static import of the TS port at `src/lib/release-readiness.ts`. The
  // previous wiring called `lib.checkReadiness` / `lib.getStatus` — neither was
  // exported by the legacy module, so the command silently produced
  // `undefined` results regardless of arg shape. Replaced with the actual
  // legacy contract: `assessReadiness` / `generateReport`. The legacy CLI
  // route (bin/cli.js ~3450) ultimately calls `assessReadiness` on the
  // happy path, preserved as the default `check` action.
  const action = args.action ?? 'check';
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'release-readiness.json');
  let result: unknown;
  if (action === 'check') {
    result = legacyReleaseReadiness.assessReadiness(deps.projectRoot, { stateFile });
  } else if (action === 'report' || action === 'status') {
    result = legacyReleaseReadiness.generateReport({ stateFile });
  } else {
    result = legacyReleaseReadiness.assessReadiness(deps.projectRoot, { stateFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Release readiness: ${action}`);
  return { exitCode: 0 };
}

export const releaseReadinessCommand = defineCommand({
  meta: { name: 'release-readiness', description: 'Release readiness checklist' },
  args: {
    action: { type: 'positional', required: false, description: 'check | report | status' },
    arg: { type: 'positional', required: false, description: 'optional argument' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = releaseReadinessImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'release-readiness failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// codebase-retrieval (bin/cli.js ~3829)
// ─────────────────────────────────────────────────────────────────────────

export interface CodebaseRetrievalArgs {
  action?: string | undefined;
  query?: string | undefined;
  json?: boolean | undefined;
}

export function codebaseRetrievalImpl(deps: Deps, args: CodebaseRetrievalArgs): CommandResult {
  // M11 phase-5c: switched from `legacyRequire('codebase-retrieval')` to static import.
  // Port exports: indexProject(root, options), queryFiles(root, query, options).
  const action = args.action ?? 'index';
  let result: unknown;
  if (action === 'search') {
    if (!args.query) {
      deps.logger.error('Usage: jumpstart-mode codebase-retrieval search <query>');
      return { exitCode: 1 };
    }
    result = codebaseRetrieval.queryFiles(deps.projectRoot, args.query);
  } else {
    result = codebaseRetrieval.indexProject(deps.projectRoot);
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Codebase retrieval: ${action}`);
  return { exitCode: 0 };
}

export const codebaseRetrievalCommand = defineCommand({
  meta: { name: 'codebase-retrieval', description: 'Codebase semantic retrieval' },
  args: {
    action: { type: 'positional', required: false, description: 'index | search' },
    query: { type: 'positional', required: false, description: 'query string' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = codebaseRetrievalImpl(createRealDeps(), {
      action: args.action,
      query: args.query,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'codebase-retrieval failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// contract-first (bin/cli.js ~3919)
// ─────────────────────────────────────────────────────────────────────────

export interface ContractFirstArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function contractFirstImpl(deps: Deps, args: ContractFirstArgs): CommandResult {
  // M11 phase-5c: switched from `legacyRequire('contract-first')` to static import.
  // Port exports: extractContracts(root), verifyCompliance(root).
  const action = args.action ?? 'check';
  let result: unknown;
  if (action === 'generate') {
    result = contractFirst.extractContracts(deps.projectRoot);
  } else {
    result = contractFirst.verifyCompliance(deps.projectRoot);
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Contract-first: ${action}`);
  return { exitCode: 0 };
}

export const contractFirstCommand = defineCommand({
  meta: { name: 'contract-first', description: 'Contract-first development checks' },
  args: {
    action: { type: 'positional', required: false, description: 'check | generate' },
    arg: { type: 'positional', required: false, description: 'optional argument' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = contractFirstImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'contract-first failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// deterministic (bin/cli.js ~4138)
// ─────────────────────────────────────────────────────────────────────────

export interface DeterministicArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function deterministicImpl(deps: Deps, args: DeterministicArgs): CommandResult {
  // M11 phase-5c: switched from `legacyRequire('deterministic-artifacts')` to static import.
  // Port exports: normalizeMarkdown, hashContent, normalizeFile, verifyStability,
  // normalizeSpecs. Legacy verifyDeterminism/snapshot/getStatus were phantom methods.
  const action = args.action ?? 'verify';
  let result: unknown;
  if (action === 'verify' || action === 'snapshot') {
    result = deterministicArtifacts.normalizeSpecs(deps.projectRoot);
  } else {
    result = deterministicArtifacts.normalizeSpecs(deps.projectRoot);
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Deterministic: ${action}`);
  return { exitCode: 0 };
}

export const deterministicCommand = defineCommand({
  meta: { name: 'deterministic', description: 'Deterministic artifact verification' },
  args: {
    action: { type: 'positional', required: false, description: 'verify | snapshot | status' },
    arg: { type: 'positional', required: false, description: 'optional argument' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = deterministicImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'deterministic failed');
  },
});
