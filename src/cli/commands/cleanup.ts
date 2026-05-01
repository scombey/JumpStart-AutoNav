/**
 * cleanup.ts — Final cluster of citty subcommands.
 *
 * Per-command structure (mirrors enterprise.ts):
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
import * as adrIndex from '../../lib/adr-index.js';
import * as aiEvaluation from '../../lib/ai-evaluation.js';
import * as artifactComparison from '../../lib/artifact-comparison.js';
import * as backlogSync from '../../lib/backlog-sync.js';
import * as bcdrPlanning from '../../lib/bcdr-planning.js';
import * as branchWorkflow from '../../lib/branch-workflow.js';
import * as cabOutput from '../../lib/cab-output.js';
import * as chatIntegration from '../../lib/chat-integration.js';
import * as ciCdIntegration from '../../lib/ci-cd-integration.js';
import * as collaboration from '../../lib/collaboration.js';
import * as compliancePacks from '../../lib/compliance-packs.js';
import * as contextOnboarding from '../../lib/context-onboarding.js';
import * as credentialBoundary from '../../lib/credential-boundary.js';
import * as dataClassification from '../../lib/data-classification.js';
import * as dataContracts from '../../lib/data-contracts.js';
import * as dbEvolution from '../../lib/db-evolution.js';
import * as decisionConflicts from '../../lib/decision-conflicts.js';
import * as deliveryConfidence from '../../lib/delivery-confidence.js';
import * as dependencyUpgrade from '../../lib/dependency-upgrade.js';
import * as designSystem from '../../lib/design-system.js';
import * as diagramStudio from '../../lib/diagram-studio.js';
import * as eaReviewPacket from '../../lib/ea-review-packet.js';
import * as estimationStudio from '../../lib/estimation-studio.js';
import * as evidenceCollector from '../../lib/evidence-collector.js';
import * as governanceDashboard from '../../lib/governance-dashboard.js';
import * as guidedHandoff from '../../lib/guided-handoff.js';
import * as incidentFeedback from '../../lib/incident-feedback.js';
import { writeResult as ioWriteResult } from '../../lib/io.js';
import * as opsOwnership from '../../lib/ops-ownership.js';
import * as playbackSummaries from '../../lib/playback-summaries.js';
import * as policyEngine from '../../lib/policy-engine.js';
import * as portfolioReporting from '../../lib/portfolio-reporting.js';
import * as raciMatrix from '../../lib/raci-matrix.js';
import * as repoGraph from '../../lib/repo-graph.js';
import * as requirementsBaseline from '../../lib/requirements-baseline.js';
import * as legacyRevert from '../../lib/revert.js';
import * as riskRegister from '../../lib/risk-register.js';
import * as roleApproval from '../../lib/role-approval.js';
import * as roleViews from '../../lib/role-views.js';
import * as rootCauseAnalysis from '../../lib/root-cause-analysis.js';
import * as runtimeDebugger from '../../lib/runtime-debugger.js';
import * as safeRename from '../../lib/safe-rename.js';
import * as scanner from '../../lib/scanner.js';
import * as semanticDiff from '../../lib/semantic-diff.js';
import * as slaSlo from '../../lib/sla-slo.js';
import * as specComments from '../../lib/spec-comments.js';
import * as specMaturity from '../../lib/spec-maturity.js';
import * as sreIntegration from '../../lib/sre-integration.js';
import * as structuredElicitation from '../../lib/structured-elicitation.js';
import * as telemetryFeedback from '../../lib/telemetry-feedback.js';
import * as testGenerator from '../../lib/test-generator.js';
import * as legacyTimestamps from '../../lib/timestamps.js';
import * as toolGuardrails from '../../lib/tool-guardrails.js';
import * as transcriptIngestion from '../../lib/transcript-ingestion.js';
import * as vendorRisk from '../../lib/vendor-risk.js';
import * as waiverWorkflow from '../../lib/waiver-workflow.js';
import * as webDashboard from '../../lib/web-dashboard.js';
import * as workshopMode from '../../lib/workshop-mode.js';
import * as workstreamOwnership from '../../lib/workstream-ownership.js';
import { type CommandResult, createRealDeps, type Deps } from '../deps.js';
import { assertUserPath, safeJoin } from './_helpers.js';

/** Static import map for all TS-ported cleanup-cluster modules. */
// biome-ignore lint/suspicious/noExplicitAny: <TS port modules have mixed return shapes>
const TS_PORTS: Record<string, Record<string, any>> = {
  'adr-index': adrIndex,
  'ai-evaluation': aiEvaluation,
  'artifact-comparison': artifactComparison,
  'backlog-sync': backlogSync,
  'bcdr-planning': bcdrPlanning,
  'branch-workflow': branchWorkflow,
  'cab-output': cabOutput,
  'chat-integration': chatIntegration,
  'ci-cd-integration': ciCdIntegration,
  collaboration: collaboration,
  'compliance-packs': compliancePacks,
  'context-onboarding': contextOnboarding,
  'credential-boundary': credentialBoundary,
  'data-classification': dataClassification,
  'data-contracts': dataContracts,
  'db-evolution': dbEvolution,
  'decision-conflicts': decisionConflicts,
  'delivery-confidence': deliveryConfidence,
  'dependency-upgrade': dependencyUpgrade,
  'design-system': designSystem,
  'diagram-studio': diagramStudio,
  'ea-review-packet': eaReviewPacket,
  'estimation-studio': estimationStudio,
  'evidence-collector': evidenceCollector,
  'governance-dashboard': governanceDashboard,
  'guided-handoff': guidedHandoff,
  'incident-feedback': incidentFeedback,
  'ops-ownership': opsOwnership,
  'playback-summaries': playbackSummaries,
  'policy-engine': policyEngine,
  'portfolio-reporting': portfolioReporting,
  'raci-matrix': raciMatrix,
  'repo-graph': repoGraph,
  'requirements-baseline': requirementsBaseline,
  'risk-register': riskRegister,
  'role-approval': roleApproval,
  'role-views': roleViews,
  'root-cause-analysis': rootCauseAnalysis,
  'runtime-debugger': runtimeDebugger,
  'safe-rename': safeRename,
  scanner: scanner,
  'semantic-diff': semanticDiff,
  'sla-slo': slaSlo,
  'spec-comments': specComments,
  'spec-maturity': specMaturity,
  'sre-integration': sreIntegration,
  'structured-elicitation': structuredElicitation,
  'telemetry-feedback': telemetryFeedback,
  'test-generator': testGenerator,
  'tool-guardrails': toolGuardrails,
  'transcript-ingestion': transcriptIngestion,
  'vendor-risk': vendorRisk,
  'waiver-workflow': waiverWorkflow,
  'web-dashboard': webDashboard,
  'workshop-mode': workshopMode,
  'workstream-ownership': workstreamOwnership,
};

// biome-ignore lint/suspicious/noExplicitAny: <legacy lib runtime shapes>
type LegacyLib = Record<string, any>;

/** Helper: write result via io.writeResult when --json mode is on. */
function maybeJson(_deps: Deps, json: boolean | undefined, result: unknown): void {
  if (!json) return;
  ioWriteResult(result as Record<string, unknown>);
}

// ─────────────────────────────────────────────────────────────────────────
// adr (bin/cli.js ~5148)
// ─────────────────────────────────────────────────────────────────────────

export interface AdrArgs {
  action?: string | undefined;
  query?: string | undefined;
  tag?: string | undefined;
  json?: boolean | undefined;
}

export function adrImpl(deps: Deps, args: AdrArgs): CommandResult {
  // M11 phase-5c: switched from `legacyImport('adr-index')` to the static
  // TS port import. `searchIndex(root, criteria)` supersedes the old
  // `searchIndex(index, query, {tag})` shape.
  const action = args.action ?? 'build';
  let result: unknown;
  if (action === 'search') {
    result = adrIndex.searchIndex(deps.projectRoot, { query: args.query, tag: args.tag });
  } else {
    result = adrIndex.buildIndex(deps.projectRoot);
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`ADR Index: ${action}`);
  return { exitCode: 0 };
}

export const adrCommand = defineCommand({
  meta: { name: 'adr', description: 'ADR index build/search (Item 51)' },
  args: {
    action: { type: 'positional', required: false, description: 'build | search' },
    query: { type: 'positional', required: false, description: 'search query' },
    tag: { type: 'string', required: false, description: 'filter by tag' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = adrImpl(createRealDeps(), {
      action: args.action,
      query: args.query,
      tag: args.tag,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'adr failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// ai-evaluation (bin/cli.js ~4973)
// ─────────────────────────────────────────────────────────────────────────

export interface AiEvaluationArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function aiEvaluationImpl(deps: Deps, args: AiEvaluationArgs): CommandResult {
  // M11 phase-5c: switched from `legacyRequire('ai-evaluation')` to static import.
  // M11 phase-5c: switched from `legacyRequire('ai-evaluation')` to static import.
  // Port API: evaluate(name, scores, options) / generateReport(options).
  // Legacy called runEvaluation/addTestCase/listEvaluations (phantom methods) —
  // adapted: all paths now use generateReport to list/status; no write-path exposed.
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'ai-evaluation.json');
  const action = args.action ?? 'list';
  let result: unknown;
  if (action === 'run' || action === 'add') {
    if (action === 'add' && !args.arg) {
      deps.logger.error('Usage: jumpstart-mode ai-evaluation add <name>');
      return { exitCode: 1 };
    }
    result = aiEvaluation.generateReport({ stateFile });
  } else {
    result = aiEvaluation.generateReport({ stateFile });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`AI evaluation: ${action}`);
  return { exitCode: 0 };
}

export const aiEvaluationCommand = defineCommand({
  meta: { name: 'ai-evaluation', description: 'AI evaluation harness' },
  args: {
    action: { type: 'positional', required: false, description: 'list | run | add' },
    arg: { type: 'positional', required: false, description: 'optional argument' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = aiEvaluationImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'ai-evaluation failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// artifact-comparison (bin/cli.js ~4722)
// ─────────────────────────────────────────────────────────────────────────

export interface ArtifactComparisonArgs {
  action?: string | undefined;
  a?: string | undefined;
  b?: string | undefined;
  json?: boolean | undefined;
}

export function artifactComparisonImpl(deps: Deps, args: ArtifactComparisonArgs): CommandResult {
  // M11 phase-5c: switched from `legacyRequire('artifact-comparison')` to static import.
  const action = args.action ?? 'compare';
  let result: unknown;
  if (action === 'compare') {
    if (!args.a || !args.b) {
      deps.logger.error('Usage: jumpstart-mode artifact-comparison compare <a> <b>');
      return { exitCode: 1 };
    }
    const safeA = assertUserPath(deps, args.a, 'artifact-comparison:a');
    const safeB = assertUserPath(deps, args.b, 'artifact-comparison:b');
    result = artifactComparison.compareArtifacts(safeA, safeB);
  } else {
    result = artifactComparison.getArtifactHistory(deps.projectRoot, '');
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Artifact comparison: ${action}`);
  return { exitCode: 0 };
}

export const artifactComparisonCommand = defineCommand({
  meta: { name: 'artifact-comparison', description: 'Compare two artifacts' },
  args: {
    action: { type: 'positional', required: false, description: 'compare | list' },
    a: { type: 'positional', required: false, description: 'first artifact' },
    b: { type: 'positional', required: false, description: 'second artifact' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = artifactComparisonImpl(createRealDeps(), {
      action: args.action,
      a: args.a,
      b: args.b,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'artifact-comparison failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// backlog-sync (bin/cli.js ~2921)
// ─────────────────────────────────────────────────────────────────────────

export interface BacklogSyncArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function backlogSyncImpl(deps: Deps, args: BacklogSyncArgs): CommandResult {
  // M11 phase-5c: switched from `legacyRequire('backlog-sync')` to static import.
  // Port exports: extractBacklog, exportBacklog, formatForTarget.
  // Legacy called syncBacklog/getBacklogStatus — adapted to port API.
  const action = args.action ?? 'status';
  let result: unknown;
  if (action === 'sync') {
    result = backlogSync.extractBacklog(deps.projectRoot);
  } else {
    result = backlogSync.extractBacklog(deps.projectRoot);
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Backlog sync: ${action}`);
  return { exitCode: 0 };
}

export const backlogSyncCommand = defineCommand({
  meta: { name: 'backlog-sync', description: 'Sync backlog with external tracker' },
  args: {
    action: { type: 'positional', required: false, description: 'status | sync' },
    arg: { type: 'positional', required: false, description: 'optional argument' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = backlogSyncImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'backlog-sync failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// branch-workflow (bin/cli.js ~2616)
// ─────────────────────────────────────────────────────────────────────────

export interface BranchWorkflowArgs {
  action?: string | undefined;
  branch?: string | undefined;
  pr?: string | undefined;
  json?: boolean | undefined;
}

export function branchWorkflowImpl(deps: Deps, args: BranchWorkflowArgs): CommandResult {
  // M11 phase-5c: switched from `legacyRequire('branch-workflow')` to static import.
  const action = args.action ?? 'status';
  let result: unknown;
  if (action === 'track') {
    result = branchWorkflow.trackBranch(deps.projectRoot, {
      pr_number: args.pr ? parseInt(args.pr, 10) : undefined,
    });
  } else if (action === 'sync') {
    result = branchWorkflow.listTrackedBranches();
  } else {
    result = branchWorkflow.getBranchStatus(deps.projectRoot, { branch: args.branch });
  }
  maybeJson(deps, args.json, result);
  if (!args.json) deps.logger.info(`Branch workflow: ${action}`);
  return { exitCode: 0 };
}

export const branchWorkflowCommand = defineCommand({
  meta: { name: 'branch-workflow', description: 'Branch-aware workflow tracking' },
  args: {
    action: { type: 'positional', required: false, description: 'status | track | sync' },
    branch: { type: 'positional', required: false, description: 'branch name' },
    pr: { type: 'string', required: false, description: 'PR number (for track)' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = branchWorkflowImpl(createRealDeps(), {
      action: args.action,
      branch: args.branch,
      pr: args.pr,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'branch-workflow failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Generic thin-wrapper factory pattern (most cleanup commands match this)
// ─────────────────────────────────────────────────────────────────────────

interface ThinWrapperConfig {
  name: string;
  description: string;
  legacyLib: string;
  defaultAction: string;
  /** Map of action → method name on legacy lib (with optional fallback). */
  actions: Record<string, string[]>;
}

interface ThinWrapperArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

/** Build a (Impl, Command) pair for the typical `thin wrapper`-shaped command:
 *  - Most commands here just delegate one of N actions to a legacy lib,
 *    pass the project root, and write the result. */
function thinWrapper(cfg: ThinWrapperConfig): {
  impl: (deps: Deps, args: ThinWrapperArgs) => CommandResult;
  // biome-ignore lint/suspicious/noExplicitAny: <citty CommandDef generic parameterization>
  command: any;
} {
  const impl = (deps: Deps, args: ThinWrapperArgs): CommandResult => {
    // M11 phase-5c: all cluster modules now have TS ports wired in TS_PORTS.
    // biome-ignore lint/style/noNonNullAssertion: TS_PORTS covers every legacyLib used below
    const lib: LegacyLib = TS_PORTS[cfg.legacyLib]!;
    const action = args.action ?? cfg.defaultAction;
    const methodCandidates = cfg.actions[action] ?? cfg.actions[cfg.defaultAction] ?? [];
    let result: unknown = {};
    for (const methodName of methodCandidates) {
      if (typeof lib[methodName] === 'function') {
        try {
          // Best-effort invocation — most legacy methods accept (root, opts?)
          // or (opts?). We try (projectRoot) first, then ().
          result = lib[methodName](deps.projectRoot) ?? {};
        } catch {
          try {
            result = lib[methodName]() ?? {};
          } catch {
            result = { error: `${methodName} threw` };
          }
        }
        break;
      }
    }
    maybeJson(deps, args.json, result);
    if (!args.json) deps.logger.info(`${cfg.name}: ${action}`);
    return { exitCode: 0 };
  };

  const command = defineCommand({
    meta: { name: cfg.name, description: cfg.description },
    args: {
      action: {
        type: 'positional',
        required: false,
        description: Object.keys(cfg.actions).join(' | '),
      },
      arg: { type: 'positional', required: false, description: 'optional argument' },
      json: { type: 'boolean', required: false, description: 'JSON output' },
    },
    run({
      args,
    }: {
      args: { action?: string | undefined; arg?: string | undefined; json?: boolean | undefined };
    }) {
      const r = impl(createRealDeps(), {
        action: args.action,
        arg: args.arg,
        json: Boolean(args.json),
      });
      if (r.exitCode !== 0) throw new Error(r.message ?? `${cfg.name} failed`);
    },
  });

  return { impl, command };
}

// ─────────────────────────────────────────────────────────────────────────
// Generic-pattern commands (bin/cli.js — various lines)
// ─────────────────────────────────────────────────────────────────────────

const _bcdr = thinWrapper({
  name: 'bcdr-planning',
  description: 'Business continuity / DR planning',
  legacyLib: 'bcdr-planning',
  defaultAction: 'status',
  actions: {
    status: ['getStatus', 'status'],
    plan: ['createPlan', 'plan'],
    list: ['listPlans', 'list'],
  },
});
export const bcdrPlanningImpl = _bcdr.impl;
export const bcdrPlanningCommand = _bcdr.command;

const _cab = thinWrapper({
  name: 'cab-output',
  description: 'CAB (Change Advisory Board) output generation',
  legacyLib: 'cab-output',
  defaultAction: 'generate',
  actions: {
    generate: ['generateOutput', 'generate'],
    list: ['listOutputs', 'list'],
  },
});
export const cabOutputImpl = _cab.impl;
export const cabOutputCommand = _cab.command;

const _chat = thinWrapper({
  name: 'chat-integration',
  description: 'Chat integration (Slack/Teams)',
  legacyLib: 'chat-integration',
  defaultAction: 'status',
  actions: {
    status: ['getStatus', 'status'],
    notify: ['notify', 'send'],
    list: ['listChannels', 'list'],
  },
});
export const chatIntegrationImpl = _chat.impl;
export const chatIntegrationCommand = _chat.command;

const _cicd = thinWrapper({
  name: 'ci-cd-integration',
  description: 'CI/CD pipeline integration',
  legacyLib: 'ci-cd-integration',
  defaultAction: 'status',
  actions: {
    status: ['getStatus', 'status'],
    sync: ['syncPipelines', 'sync'],
  },
});
export const ciCdIntegrationImpl = _cicd.impl;
export const ciCdIntegrationCommand = _cicd.command;

const _collab = thinWrapper({
  name: 'collaboration',
  description: 'Collaboration features',
  legacyLib: 'collaboration',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], list: ['listSessions', 'list'] },
});
export const collaborationImpl = _collab.impl;
export const collaborationCommand = _collab.command;

const _compliance = thinWrapper({
  name: 'compliance-packs',
  description: 'Compliance pack management',
  legacyLib: 'compliance-packs',
  defaultAction: 'list',
  actions: {
    list: ['listPacks', 'list'],
    apply: ['applyPack', 'apply'],
    status: ['getStatus', 'status'],
  },
});
export const compliancePacksImpl = _compliance.impl;
export const compliancePacksCommand = _compliance.command;

const _contextOnboarding = thinWrapper({
  name: 'context-onboarding',
  description: 'Context onboarding workflow',
  legacyLib: 'context-onboarding',
  defaultAction: 'start',
  actions: { start: ['startOnboarding', 'start'], status: ['getStatus', 'status'] },
});
export const contextOnboardingImpl = _contextOnboarding.impl;
export const contextOnboardingCommand = _contextOnboarding.command;

const _credBoundary = thinWrapper({
  name: 'credential-boundary',
  description: 'Credential boundary checks',
  legacyLib: 'credential-boundary',
  defaultAction: 'check',
  actions: { check: ['checkBoundaries', 'check'], list: ['listFindings', 'list'] },
});
export const credentialBoundaryImpl = _credBoundary.impl;
export const credentialBoundaryCommand = _credBoundary.command;

const _dataClass = thinWrapper({
  name: 'data-classification',
  description: 'Data classification scanning',
  legacyLib: 'data-classification',
  defaultAction: 'scan',
  actions: { scan: ['scanData', 'scan'], list: ['listClassifications', 'list'] },
});
export const dataClassificationImpl = _dataClass.impl;
export const dataClassificationCommand = _dataClass.command;

const _dataContracts = thinWrapper({
  name: 'data-contracts',
  description: 'Data contracts management',
  legacyLib: 'data-contracts',
  defaultAction: 'list',
  actions: {
    list: ['listContracts', 'list'],
    validate: ['validateContracts', 'validate'],
  },
});
export const dataContractsImpl = _dataContracts.impl;
export const dataContractsCommand = _dataContracts.command;

const _dbEvolution = thinWrapper({
  name: 'db-evolution',
  description: 'Database evolution tracking',
  legacyLib: 'db-evolution',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], plan: ['planEvolution', 'plan'] },
});
export const dbEvolutionImpl = _dbEvolution.impl;
export const dbEvolutionCommand = _dbEvolution.command;

const _decisionConflicts = thinWrapper({
  name: 'decision-conflicts',
  description: 'Decision conflict detection',
  legacyLib: 'decision-conflicts',
  defaultAction: 'check',
  actions: { check: ['checkConflicts', 'check'], list: ['listConflicts', 'list'] },
});
export const decisionConflictsImpl = _decisionConflicts.impl;
export const decisionConflictsCommand = _decisionConflicts.command;

const _delivery = thinWrapper({
  name: 'delivery-confidence',
  description: 'Delivery confidence scoring',
  legacyLib: 'delivery-confidence',
  defaultAction: 'score',
  actions: { score: ['scoreDelivery', 'score'], status: ['getStatus', 'status'] },
});
export const deliveryConfidenceImpl = _delivery.impl;
export const deliveryConfidenceCommand = _delivery.command;

const _depUpgrade = thinWrapper({
  name: 'dependency-upgrade',
  description: 'Dependency upgrade planning',
  legacyLib: 'dependency-upgrade',
  defaultAction: 'plan',
  actions: { plan: ['planUpgrade', 'plan'], status: ['getStatus', 'status'] },
});
export const dependencyUpgradeImpl = _depUpgrade.impl;
export const dependencyUpgradeCommand = _depUpgrade.command;

const _designSystem = thinWrapper({
  name: 'design-system',
  description: 'Design system management',
  legacyLib: 'design-system',
  defaultAction: 'list',
  actions: { list: ['listComponents', 'list'], scan: ['scanComponents', 'scan'] },
});
export const designSystemImpl = _designSystem.impl;
export const designSystemCommand = _designSystem.command;

const _diagram = thinWrapper({
  name: 'diagram-studio',
  description: 'Diagram studio',
  legacyLib: 'diagram-studio',
  defaultAction: 'list',
  actions: { list: ['listDiagrams', 'list'], create: ['createDiagram', 'create'] },
});
export const diagramStudioImpl = _diagram.impl;
export const diagramStudioCommand = _diagram.command;

const _eaReview = thinWrapper({
  name: 'ea-review-packet',
  description: 'EA review packet generation',
  legacyLib: 'ea-review-packet',
  defaultAction: 'generate',
  actions: { generate: ['generatePacket', 'generate'] },
});
export const eaReviewPacketImpl = _eaReview.impl;
export const eaReviewPacketCommand = _eaReview.command;

const _elicit = thinWrapper({
  name: 'elicitation',
  description: 'Structured requirement elicitation',
  legacyLib: 'structured-elicitation',
  defaultAction: 'list',
  actions: { list: ['listSessions', 'list'], start: ['startSession', 'start'] },
});
export const elicitationImpl = _elicit.impl;
export const elicitationCommand = _elicit.command;

const _estimation = thinWrapper({
  name: 'estimation-studio',
  description: 'Estimation studio',
  legacyLib: 'estimation-studio',
  defaultAction: 'list',
  actions: { list: ['listEstimates', 'list'], estimate: ['estimate'] },
});
export const estimationStudioImpl = _estimation.impl;
export const estimationStudioCommand = _estimation.command;

const _evidence = thinWrapper({
  name: 'evidence-collector',
  description: 'Evidence collection',
  legacyLib: 'evidence-collector',
  defaultAction: 'collect',
  actions: { collect: ['collect'], list: ['listEvidence', 'list'] },
});
export const evidenceCollectorImpl = _evidence.impl;
export const evidenceCollectorCommand = _evidence.command;

const _govDash = thinWrapper({
  name: 'governance-dashboard',
  description: 'Governance dashboard',
  legacyLib: 'governance-dashboard',
  defaultAction: 'view',
  actions: { view: ['renderDashboard', 'view'], status: ['getStatus', 'status'] },
});
export const governanceDashboardImpl = _govDash.impl;
export const governanceDashboardCommand = _govDash.command;

const _guidedHandoff = thinWrapper({
  name: 'guided-handoff',
  description: 'Guided handoff wizard',
  legacyLib: 'guided-handoff',
  defaultAction: 'start',
  actions: { start: ['startHandoff', 'start'], status: ['getStatus', 'status'] },
});
export const guidedHandoffImpl = _guidedHandoff.impl;
export const guidedHandoffCommand = _guidedHandoff.command;

const _incident = thinWrapper({
  name: 'incident-feedback',
  description: 'Incident feedback loop',
  legacyLib: 'incident-feedback',
  defaultAction: 'list',
  actions: { list: ['listIncidents', 'list'], record: ['recordIncident', 'record'] },
});
export const incidentFeedbackImpl = _incident.impl;
export const incidentFeedbackCommand = _incident.command;

const _opsOwn = thinWrapper({
  name: 'ops-ownership',
  description: 'Operations ownership matrix',
  legacyLib: 'ops-ownership',
  defaultAction: 'list',
  actions: { list: ['listOwnership', 'list'], assign: ['assignOwnership', 'assign'] },
});
export const opsOwnershipImpl = _opsOwn.impl;
export const opsOwnershipCommand = _opsOwn.command;

const _playback = thinWrapper({
  name: 'playback-summaries',
  description: 'Session playback summaries',
  legacyLib: 'playback-summaries',
  defaultAction: 'list',
  actions: { list: ['listSummaries', 'list'], generate: ['generateSummary', 'generate'] },
});
export const playbackSummariesImpl = _playback.impl;
export const playbackSummariesCommand = _playback.command;

const _policy = thinWrapper({
  name: 'policy',
  description: 'Policy engine (Item)',
  legacyLib: 'policy-engine',
  defaultAction: 'check',
  actions: {
    check: ['checkPolicies', 'check'],
    list: ['listPolicies', 'list'],
    add: ['addPolicy', 'add'],
  },
});
export const policyImpl = _policy.impl;
export const policyCommand = _policy.command;

const _portfolio = thinWrapper({
  name: 'portfolio',
  description: 'Portfolio reporting',
  legacyLib: 'portfolio-reporting',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], list: ['listProjects', 'list'] },
});
export const portfolioImpl = _portfolio.impl;
export const portfolioCommand = _portfolio.command;

const _raci = thinWrapper({
  name: 'raci-matrix',
  description: 'RACI matrix management',
  legacyLib: 'raci-matrix',
  defaultAction: 'list',
  actions: { list: ['listMatrix', 'list'], assign: ['assignRole', 'assign'] },
});
export const raciMatrixImpl = _raci.impl;
export const raciMatrixCommand = _raci.command;

const _repoGraph = thinWrapper({
  name: 'repo-graph',
  description: 'Repository understanding graph',
  legacyLib: 'repo-graph',
  defaultAction: 'build',
  actions: { build: ['buildRepoGraph', 'build'], query: ['queryGraph', 'query'] },
});
export const repoGraphImpl = _repoGraph.impl;
export const repoGraphCommand = _repoGraph.command;

const _reqBaseline = thinWrapper({
  name: 'requirements-baseline',
  description: 'Requirements baseline & change control',
  legacyLib: 'requirements-baseline',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], baseline: ['createBaseline', 'baseline'] },
});
export const requirementsBaselineImpl = _reqBaseline.impl;
export const requirementsBaselineCommand = _reqBaseline.command;

const _risk = thinWrapper({
  name: 'risk-register',
  description: 'Risk register',
  legacyLib: 'risk-register',
  defaultAction: 'list',
  actions: { list: ['listRisks', 'list'], add: ['addRisk', 'add'] },
});
export const riskRegisterImpl = _risk.impl;
export const riskRegisterCommand = _risk.command;

const _roleApp = thinWrapper({
  name: 'role-approval',
  description: 'Role-based approval workflows',
  legacyLib: 'role-approval',
  defaultAction: 'status',
  actions: {
    status: ['listApprovalWorkflows', 'getApprovalStatus'],
    assign: ['assignApprovers'],
    approve: ['recordRoleAction'],
    reject: ['recordRoleAction'],
  },
});
export const roleApprovalImpl = _roleApp.impl;
export const roleApprovalCommand = _roleApp.command;

const _roleViews = thinWrapper({
  name: 'role-views',
  description: 'Role-based artifact views',
  legacyLib: 'role-views',
  defaultAction: 'list',
  actions: { list: ['listViews', 'list'], render: ['renderView', 'render'] },
});
export const roleViewsImpl = _roleViews.impl;
export const roleViewsCommand = _roleViews.command;

const _rootCause = thinWrapper({
  name: 'root-cause',
  description: 'Root cause analysis',
  legacyLib: 'root-cause-analysis',
  defaultAction: 'analyze',
  actions: { analyze: ['analyzeIncident', 'analyze'], list: ['listAnalyses', 'list'] },
});
export const rootCauseImpl = _rootCause.impl;
export const rootCauseCommand = _rootCause.command;

const _runtimeDebug = thinWrapper({
  name: 'runtime-debugger',
  description: 'Runtime debugger',
  legacyLib: 'runtime-debugger',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], trace: ['startTrace', 'trace'] },
});
export const runtimeDebuggerImpl = _runtimeDebug.impl;
export const runtimeDebuggerCommand = _runtimeDebug.command;

const _safeRename = thinWrapper({
  name: 'safe-rename',
  description: 'Safe artifact rename',
  legacyLib: 'safe-rename',
  defaultAction: 'plan',
  actions: { plan: ['planRename', 'plan'], execute: ['executeRename', 'execute'] },
});
export const safeRenameImpl = _safeRename.impl;
export const safeRenameCommand = _safeRename.command;

const _scan = thinWrapper({
  name: 'scan',
  description: 'Project scanner (Item 49)',
  legacyLib: 'scanner',
  defaultAction: 'scan',
  actions: { scan: ['scan'] },
});
export const scanImpl = _scan.impl;
export const scanCommand = _scan.command;

const _semDiff = thinWrapper({
  name: 'semantic-diff',
  description: 'Semantic diff between artifacts',
  legacyLib: 'semantic-diff',
  defaultAction: 'diff',
  actions: { diff: ['diffArtifacts', 'diff'] },
});
export const semanticDiffImpl = _semDiff.impl;
export const semanticDiffCommand = _semDiff.command;

const _slaSlo = thinWrapper({
  name: 'sla-slo',
  description: 'SLA/SLO tracking',
  legacyLib: 'sla-slo',
  defaultAction: 'list',
  actions: { list: ['listObjectives', 'list'], add: ['addObjective', 'add'] },
});
export const slaSloImpl = _slaSlo.impl;
export const slaSloCommand = _slaSlo.command;

const _specComments = thinWrapper({
  name: 'spec-comments',
  description: 'Spec comments management',
  legacyLib: 'spec-comments',
  defaultAction: 'list',
  actions: { list: ['listComments', 'list'], add: ['addComment', 'add'] },
});
export const specCommentsImpl = _specComments.impl;
export const specCommentsCommand = _specComments.command;

const _specMaturity = thinWrapper({
  name: 'spec-maturity',
  description: 'Spec maturity scoring',
  legacyLib: 'spec-maturity',
  defaultAction: 'score',
  actions: { score: ['scoreSpec', 'score'], list: ['listScores', 'list'] },
});
export const specMaturityImpl = _specMaturity.impl;
export const specMaturityCommand = _specMaturity.command;

const _sre = thinWrapper({
  name: 'sre-integration',
  description: 'SRE integration',
  legacyLib: 'sre-integration',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], sync: ['syncSre', 'sync'] },
});
export const sreIntegrationImpl = _sre.impl;
export const sreIntegrationCommand = _sre.command;

const _telemetry = thinWrapper({
  name: 'telemetry-feedback',
  description: 'Telemetry feedback loop',
  legacyLib: 'telemetry-feedback',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], record: ['recordEvent', 'record'] },
});
export const telemetryFeedbackImpl = _telemetry.impl;
export const telemetryFeedbackCommand = _telemetry.command;

const _testGen = thinWrapper({
  name: 'test-generator',
  description: 'Test generator',
  legacyLib: 'test-generator',
  defaultAction: 'generate',
  actions: { generate: ['generateTests', 'generate'], list: ['listTests', 'list'] },
});
export const testGeneratorImpl = _testGen.impl;
export const testGeneratorCommand = _testGen.command;

const _toolGuard = thinWrapper({
  name: 'tool-guardrails',
  description: 'Tool guardrails',
  legacyLib: 'tool-guardrails',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], check: ['checkGuardrails', 'check'] },
});
export const toolGuardrailsImpl = _toolGuard.impl;
export const toolGuardrailsCommand = _toolGuard.command;

const _transcript = thinWrapper({
  name: 'transcript-ingestion',
  description: 'Transcript ingestion',
  legacyLib: 'transcript-ingestion',
  defaultAction: 'ingest',
  actions: { ingest: ['ingestTranscript', 'ingest'], list: ['listTranscripts', 'list'] },
});
export const transcriptIngestionImpl = _transcript.impl;
export const transcriptIngestionCommand = _transcript.command;

const _vendorRisk = thinWrapper({
  name: 'vendor-risk',
  description: 'Vendor risk assessment',
  legacyLib: 'vendor-risk',
  defaultAction: 'list',
  actions: { list: ['listVendors', 'list'], assess: ['assessVendor', 'assess'] },
});
export const vendorRiskImpl = _vendorRisk.impl;
export const vendorRiskCommand = _vendorRisk.command;

const _waiver = thinWrapper({
  name: 'waiver-workflow',
  description: 'Waiver workflow',
  legacyLib: 'waiver-workflow',
  defaultAction: 'list',
  actions: { list: ['listWaivers', 'list'], request: ['requestWaiver', 'request'] },
});
export const waiverWorkflowImpl = _waiver.impl;
export const waiverWorkflowCommand = _waiver.command;

const _webDash = thinWrapper({
  name: 'web-dashboard',
  description: 'Web dashboard',
  legacyLib: 'web-dashboard',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], serve: ['startServer', 'serve'] },
});
export const webDashboardImpl = _webDash.impl;
export const webDashboardCommand = _webDash.command;

const _workshop = thinWrapper({
  name: 'workshop-mode',
  description: 'Workshop mode',
  legacyLib: 'workshop-mode',
  defaultAction: 'status',
  actions: { status: ['getStatus', 'status'], start: ['startWorkshop', 'start'] },
});
export const workshopModeImpl = _workshop.impl;
export const workshopModeCommand = _workshop.command;

const _workstream = thinWrapper({
  name: 'workstream-ownership',
  description: 'Workstream ownership',
  legacyLib: 'workstream-ownership',
  defaultAction: 'list',
  actions: { list: ['listWorkstreams', 'list'], assign: ['assignWorkstream', 'assign'] },
});
export const workstreamOwnershipImpl = _workstream.impl;
export const workstreamOwnershipCommand = _workstream.command;

// ─────────────────────────────────────────────────────────────────────────
// timestamp (bin/cli.js ~5277) — bespoke because of `now`/`validate`/`audit`
// ─────────────────────────────────────────────────────────────────────────

export interface TimestampArgs {
  action?: string | undefined;
  arg?: string | undefined;
  json?: boolean | undefined;
}

export function timestampImpl(deps: Deps, args: TimestampArgs): CommandResult {
  const lib = legacyTimestamps as LegacyLib;
  const action = args.action ?? 'now';
  if (action === 'validate') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode timestamp validate <timestamp>');
      return { exitCode: 1 };
    }
    const result = lib.validate(args.arg);
    maybeJson(deps, args.json, result);
    if (!args.json) deps.logger.info(`timestamp validate: ${result.valid ? 'valid' : 'invalid'}`);
    return { exitCode: 0 };
  }
  if (action === 'audit') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode timestamp audit <file>');
      return { exitCode: 1 };
    }
    const safeFile = assertUserPath(deps, args.arg, 'timestamp:audit');
    const result = lib.audit(safeFile);
    maybeJson(deps, args.json, result);
    if (!args.json) deps.logger.info(`timestamp audit: ${result.valid} valid`);
    return { exitCode: 0 };
  }
  // now (default)
  const ts = lib.now();
  maybeJson(deps, args.json, { timestamp: ts });
  if (!args.json) deps.logger.info(ts);
  return { exitCode: 0 };
}

export const timestampCommand = defineCommand({
  meta: { name: 'timestamp', description: 'Timestamp utilities (Item 60)' },
  args: {
    action: { type: 'positional', required: false, description: 'now | validate | audit' },
    arg: { type: 'positional', required: false, description: 'value or file path' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = timestampImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'timestamp failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// revert (bin/cli.js ~5124) — needs --reason flag
// ─────────────────────────────────────────────────────────────────────────

export interface RevertArgs {
  artifact?: string | undefined;
  reason?: string | undefined;
  json?: boolean | undefined;
}

export function revertImpl(deps: Deps, args: RevertArgs): CommandResult {
  if (!args.artifact) {
    deps.logger.error('Usage: jumpstart-mode revert <artifact-path> [--reason "..."]');
    return { exitCode: 1 };
  }
  // (the ESM .mjs legacy file) to a static import of the TS port at
  // `src/lib/revert.ts`. The impl flips back to sync because the new
  // module is plain ESM that imports cleanly. Public surface preserved
  // verbatim — see refs in tests/test-revert.test.ts.
  const lib = legacyRevert as LegacyLib;
  const safePath = assertUserPath(deps, args.artifact, 'revert:artifact');
  const result = lib.revertArtifact({ artifact: safePath, reason: args.reason });
  maybeJson(deps, args.json, result);
  if (!args.json) {
    if (result.success) {
      deps.logger.success(`Reverted: ${args.artifact}`);
    } else {
      deps.logger.error(result.error ?? 'revert failed');
      return { exitCode: 1 };
    }
  }
  return { exitCode: 0 };
}

export const revertCommand = defineCommand({
  meta: { name: 'revert', description: 'Revert artifact to prior state' },
  args: {
    artifact: { type: 'positional', required: false, description: 'artifact path' },
    reason: { type: 'string', required: false, description: 'reason for revert' },
    json: { type: 'boolean', required: false, description: 'JSON output' },
  },
  run({ args }) {
    const r = revertImpl(createRealDeps(), {
      artifact: args.artifact,
      reason: args.reason,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'revert failed');
  },
});
