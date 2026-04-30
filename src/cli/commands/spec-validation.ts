/**
 * spec-validation.ts — Spec validation & integrity cluster (T4.7.2).
 *
 * Ports the following bin/cli.js subcommands into citty `defineCommand`s:
 *   - validate           (validator.validateArtifact)
 *   - spec-drift         (spec-drift.checkSpecDrift)
 *   - hash               (hashing.registerArtifact / verifyAll)
 *   - graph              (graph.buildFromSpecs / getCoverage)
 *   - simplicity         (simplicity-gate.check)
 *   - scan-wrappers      (anti-abstraction.scanDirectory)
 *   - invariants         (invariants-check.generateReport)
 *   - template-check     (template-watcher.checkForChanges)
 *   - freshness-audit    (freshness-gate.generateAuditReport)
 *   - shard              (sharder.shouldShard / extractEpics / generateShard)
 *   - checklist          (spec-tester.runAllChecks)
 *   - smells             (smell-detector.generateSmellReport)
 *
 * Pattern: each leaf command is a `defineCommand` exported as
 * `<name>Command`. Pure logic lives in `<name>Impl(deps, args)`.
 *
 * @see bin/cli.js (lines 979–1215 — legacy reference)
 * @see specs/implementation-plan.md T4.7.2
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { defineCommand } from 'citty';
import { generateAuditReport } from '../../lib/freshness-gate.js';
import { generateReport as generateInvariantsReport } from '../../lib/invariants-check.js';
import { writeResult } from '../../lib/io.js';
import { extractEpics, generateIndex, generateShard, shouldShard } from '../../lib/sharder.js';
import { check as simplicityCheck } from '../../lib/simplicity-gate.js';
import {
  generateReport as specTesterGenerateReport,
  runAllChecks as specTesterRunAllChecks,
} from '../../lib/spec-tester.js';
import { checkForChanges as templateCheckForChanges } from '../../lib/template-watcher.js';
import { type CommandResult, createRealDeps, type Deps } from '../deps.js';
import { assertUserPath, legacyRequire, safeJoin } from './_helpers.js';

// ─────────────────────────────────────────────────────────────────────────
// validate
// ─────────────────────────────────────────────────────────────────────────

export interface ValidateArgs {
  path: string;
}

export function validateImpl(deps: Deps, args: ValidateArgs): CommandResult {
  if (!args.path) {
    deps.logger.error('Usage: jumpstart-mode validate <artifact-path>');
    return { exitCode: 1 };
  }
  // Pit Crew M8 BLOCKER (Adversary 2): pre-fix passed `args.path`
  // verbatim to validator.validateArtifact. AI agents with prompt-
  // injected arguments could exfiltrate any project-readable file.
  // Post-fix: gate via assertUserPath so the path is provably inside
  // the project root.
  const safePath = assertUserPath(deps, args.path, 'validate');
  const validator = legacyRequire<{
    validateArtifact: (
      filePath: string,
      schemasDir: string
    ) => { valid: boolean; errors: string[] };
  }>('validator');
  // Pit Crew M8 BLOCKER (Reviewer 1): pre-fix used `__dirname` to
  // compute packageRoot. `__dirname` is undefined under ESM and
  // resolves to dist/ paths under build, both wrong. Post-fix: anchor
  // schemas dir at deps.projectRoot — the documented invariant.
  const schemasDir = path.join(deps.projectRoot, '.jumpstart', 'schemas');
  const result = validator.validateArtifact(safePath, schemasDir);
  if (result.valid) {
    deps.logger.success('Artifact is valid.');
    return { exitCode: 0 };
  }
  deps.logger.error('Validation errors:');
  for (const e of result.errors) deps.logger.warn(`  - ${e}`);
  return { exitCode: 1 };
}

export const validateCommand = defineCommand({
  meta: { name: 'validate', description: 'Validate artifact against JSON schema (Item 5)' },
  args: {
    path: { type: 'positional', description: 'Path to artifact', required: true },
  },
  run({ args }) {
    const r = validateImpl(createRealDeps(), { path: args.path });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'validate failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// spec-drift
// ─────────────────────────────────────────────────────────────────────────

export interface SpecDriftArgs {
  specsDir?: string | undefined;
  srcDir?: string | undefined;
}

export function specDriftImpl(_deps: Deps, args: SpecDriftArgs): CommandResult {
  const specDrift = legacyRequire<{
    checkSpecDrift: (specsDir: string, srcDir: string) => Record<string, unknown>;
  }>('spec-drift');
  const result = specDrift.checkSpecDrift(args.specsDir ?? 'specs', args.srcDir ?? 'src');
  writeResult(result as Record<string, unknown>);
  return { exitCode: 0 };
}

export const specDriftCommand = defineCommand({
  meta: { name: 'spec-drift', description: 'Detect drift between specs and code (Item 4)' },
  args: {
    specsDir: { type: 'positional', description: 'Specs directory', required: false },
    srcDir: { type: 'positional', description: 'Source directory', required: false },
  },
  run({ args }) {
    specDriftImpl(createRealDeps(), { specsDir: args.specsDir, srcDir: args.srcDir });
  },
});

// ─────────────────────────────────────────────────────────────────────────
// hash
// ─────────────────────────────────────────────────────────────────────────

export interface HashArgs {
  action: string;
  filePath?: string | undefined;
}

export function hashImpl(deps: Deps, args: HashArgs): CommandResult {
  const hashing = legacyRequire<{
    registerArtifact: (filePath: string, manifestPath: string) => { hash: string };
    verifyAll: (manifestPath: string) => { valid: boolean; path: string; reason?: string }[];
  }>('hashing');
  const manifestPath = safeJoin(deps, '.jumpstart', 'manifest.json');
  if (args.action === 'register') {
    if (!args.filePath) {
      deps.logger.error('Usage: jumpstart-mode hash register <file-path>');
      return { exitCode: 1 };
    }
    const result = hashing.registerArtifact(args.filePath, manifestPath);
    deps.logger.success(`Registered: ${result.hash.substring(0, 12)}...`);
    return { exitCode: 0 };
  }
  if (args.action === 'verify') {
    const results = hashing.verifyAll(manifestPath);
    const failed = results.filter((r) => !r.valid);
    if (failed.length === 0) {
      deps.logger.success(`All ${results.length} artifact(s) verified.`);
      return { exitCode: 0 };
    }
    deps.logger.error(`${failed.length} artifact(s) failed verification:`);
    for (const f of failed) deps.logger.warn(`  - ${f.path}: ${f.reason ?? 'unknown'}`);
    return { exitCode: 1 };
  }
  deps.logger.info('Usage: jumpstart-mode hash <register|verify> [file-path]');
  return { exitCode: 0 };
}

export const hashCommand = defineCommand({
  meta: { name: 'hash', description: 'Content-addressable spec integrity (Item 12)' },
  args: {
    action: { type: 'positional', description: 'register | verify', required: true },
    filePath: { type: 'positional', description: 'Path (for register)', required: false },
  },
  run({ args }) {
    const r = hashImpl(createRealDeps(), { action: args.action, filePath: args.filePath });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'hash failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// graph
// ─────────────────────────────────────────────────────────────────────────

export interface GraphArgs {
  action: string;
}

export function graphImpl(deps: Deps, args: GraphArgs): CommandResult {
  const graph = legacyRequire<{
    buildFromSpecs: (specsDir: string, graphPath: string) => { nodes: unknown[]; edges: unknown[] };
    getCoverage: (graphPath: string) => {
      total: number;
      withEdges: number;
      orphans: number;
      coverage: number;
    };
  }>('graph');
  const graphPath = safeJoin(deps, '.jumpstart', 'spec-graph.json');
  const specsDir = safeJoin(deps, 'specs');
  if (args.action === 'build') {
    const result = graph.buildFromSpecs(specsDir, graphPath);
    deps.logger.success(`Graph built: ${result.nodes.length} nodes, ${result.edges.length} edges.`);
    return { exitCode: 0 };
  }
  if (args.action === 'coverage') {
    const result = graph.getCoverage(graphPath);
    deps.logger.info('Dependency Coverage:');
    deps.logger.info(`  Total nodes: ${result.total}`);
    deps.logger.info(`  With outgoing edges: ${result.withEdges}`);
    deps.logger.info(`  Orphans: ${result.orphans}`);
    deps.logger.info(`  Coverage: ${result.coverage}%`);
    return { exitCode: 0 };
  }
  deps.logger.info('Usage: jumpstart-mode graph <build|coverage>');
  return { exitCode: 0 };
}

export const graphCommand = defineCommand({
  meta: { name: 'graph', description: 'Build/query spec dependency graph (Item 13)' },
  args: {
    action: { type: 'positional', description: 'build | coverage', required: true },
  },
  run({ args }) {
    graphImpl(createRealDeps(), { action: args.action });
  },
});

// ─────────────────────────────────────────────────────────────────────────
// simplicity
// ─────────────────────────────────────────────────────────────────────────

export interface SimplicityArgs {
  targetDir?: string | undefined;
}

export function simplicityImpl(deps: Deps, args: SimplicityArgs): CommandResult {
  const targetDir = args.targetDir ?? 'src';
  const result = simplicityCheck({ projectDir: targetDir });
  if (result.passed) {
    deps.logger.success(`Simplicity gate passed (${result.count} top-level dirs).`);
    return { exitCode: 0 };
  }
  deps.logger.error(result.message);
  deps.logger.warn('  Add a justification section to the Architecture Document.');
  return { exitCode: 1 };
}

export const simplicityCommand = defineCommand({
  meta: {
    name: 'simplicity',
    description: 'Check simplicity gate on directory structure (Item 9)',
  },
  args: {
    targetDir: {
      type: 'positional',
      description: 'Target directory (default: src)',
      required: false,
    },
  },
  run({ args }) {
    const r = simplicityImpl(createRealDeps(), { targetDir: args.targetDir });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'simplicity failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// scan-wrappers
// ─────────────────────────────────────────────────────────────────────────

export interface ScanWrappersArgs {
  targetDir?: string | undefined;
}

export function scanWrappersImpl(deps: Deps, args: ScanWrappersArgs): CommandResult {
  const antiAbstraction = legacyRequire<{
    scanDirectory: (dir: string) => { file: string; line: number; pattern: string }[];
  }>('anti-abstraction');
  const results = antiAbstraction.scanDirectory(args.targetDir ?? 'src');
  if (results.length === 0) {
    deps.logger.success('No wrapper patterns detected.');
    return { exitCode: 0 };
  }
  deps.logger.warn(`${results.length} potential wrapper pattern(s) found:`);
  for (const r of results) deps.logger.warn(`  ${r.file}:${r.line} - ${r.pattern}`);
  return { exitCode: 0 };
}

export const scanWrappersCommand = defineCommand({
  meta: { name: 'scan-wrappers', description: 'Scan for unnecessary wrapper patterns (Item 10)' },
  args: {
    targetDir: {
      type: 'positional',
      description: 'Target directory (default: src)',
      required: false,
    },
  },
  run({ args }) {
    scanWrappersImpl(createRealDeps(), { targetDir: args.targetDir });
  },
});

// ─────────────────────────────────────────────────────────────────────────
// invariants
// ─────────────────────────────────────────────────────────────────────────

export function invariantsImpl(deps: Deps): CommandResult {
  const invariantsPath = safeJoin(deps, '.jumpstart', 'invariants.md');
  const specsDir = safeJoin(deps, 'specs');
  const report = generateInvariantsReport(invariantsPath, specsDir);
  writeResult(report as unknown as Record<string, unknown>);
  return { exitCode: 0 };
}

export const invariantsCommand = defineCommand({
  meta: {
    name: 'invariants',
    description: 'Check architecture against environment invariants (Item 15)',
  },
  args: {},
  run() {
    invariantsImpl(createRealDeps());
  },
});

// ─────────────────────────────────────────────────────────────────────────
// template-check
// ─────────────────────────────────────────────────────────────────────────

export function templateCheckImpl(deps: Deps): CommandResult {
  const templatesDir = safeJoin(deps, '.jumpstart', 'templates');
  const snapshotPath = safeJoin(deps, '.jumpstart', 'state', 'template-snapshot.json');
  const result = templateCheckForChanges(templatesDir, snapshotPath);
  if (!result.changed) {
    deps.logger.success('All templates unchanged.');
    return { exitCode: 0 };
  }
  deps.logger.warn(`${result.warnings.length} template(s) changed:`);
  for (const w of result.warnings) deps.logger.warn(`  ${w}`);
  return { exitCode: 0 };
}

export const templateCheckCommand = defineCommand({
  meta: {
    name: 'template-check',
    description: 'Detect template changes since last snapshot (Item 14)',
  },
  args: {},
  run() {
    templateCheckImpl(createRealDeps());
  },
});

// ─────────────────────────────────────────────────────────────────────────
// freshness-audit
// ─────────────────────────────────────────────────────────────────────────

export function freshnessAuditImpl(deps: Deps): CommandResult {
  const specsDir = safeJoin(deps, 'specs');
  const report = generateAuditReport(specsDir);
  deps.logger.info(report);
  return { exitCode: 0 };
}

export const freshnessAuditCommand = defineCommand({
  meta: {
    name: 'freshness-audit',
    description: 'Run Context7 documentation freshness audit (Item 101)',
  },
  args: {},
  run() {
    freshnessAuditImpl(createRealDeps());
  },
});

// ─────────────────────────────────────────────────────────────────────────
// shard
// ─────────────────────────────────────────────────────────────────────────

export interface ShardArgs {
  prdPath?: string | undefined;
}

export function shardImpl(deps: Deps, args: ShardArgs): CommandResult {
  const prdPath = args.prdPath ?? safeJoin(deps, 'specs', 'prd.md');
  if (!existsSync(prdPath)) {
    deps.logger.error(`PRD not found: ${prdPath}`);
    return { exitCode: 1 };
  }
  const content = readFileSync(prdPath, 'utf8');
  const shardDecision = shouldShard(content);
  if (!shardDecision.shouldShard) {
    deps.logger.success('PRD is within context window limits. No sharding needed.');
    return { exitCode: 0 };
  }
  const epics = extractEpics(content);
  deps.logger.info(`Found ${epics.length} epic(s). Generating shards...`);
  const shardDir = safeJoin(deps, 'specs', 'prd');
  if (!existsSync(shardDir)) mkdirSync(shardDir, { recursive: true });
  const shardDescriptors = [];
  for (let i = 0; i < epics.length; i++) {
    const epic = epics[i];
    if (epic === undefined) continue;
    const shard = generateShard(content, [epic.id], i + 1);
    const shardFile = `prd-${String(i + 1).padStart(3, '0')}-${epic.id.toLowerCase()}.md`;
    const shardPath = path.join(shardDir, shardFile);
    writeFileSync(shardPath, shard, 'utf8');
    deps.logger.success(`  ${shardPath}`);
    shardDescriptors.push({ index: i + 1, epicIds: [epic.id], filePath: `specs/prd/${shardFile}` });
  }
  const index = generateIndex(shardDescriptors);
  writeFileSync(path.join(shardDir, 'index.md'), index, 'utf8');
  deps.logger.success('  Index generated.');
  return { exitCode: 0 };
}

export const shardCommand = defineCommand({
  meta: { name: 'shard', description: 'Shard a large PRD into per-epic files (Item 8)' },
  args: {
    prdPath: {
      type: 'positional',
      description: 'Path to PRD (default: specs/prd.md)',
      required: false,
    },
  },
  run({ args }) {
    const r = shardImpl(createRealDeps(), { prdPath: args.prdPath });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'shard failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// checklist
// ─────────────────────────────────────────────────────────────────────────

export interface ChecklistArgs {
  path: string;
}

export function checklistImpl(deps: Deps, args: ChecklistArgs): CommandResult {
  if (!args.path) {
    deps.logger.error('Usage: jumpstart-mode checklist <spec-file>');
    return { exitCode: 1 };
  }
  // Pit Crew M8 BLOCKER (Adversary 2): user path needs containment.
  const safePath = assertUserPath(deps, args.path, 'checklist');
  if (!existsSync(safePath)) {
    deps.logger.error(`File not found: ${args.path}`);
    return { exitCode: 1 };
  }
  const content = readFileSync(safePath, 'utf8');
  // Pit Crew M8 HIGH (Reviewer 4): pre-fix `void specTester.runAllChecks(...)`
  // discarded the result -- exit code was always 0 even when checks failed.
  // Post-fix: capture result, exit non-zero on `pass === false`.
  const result = specTesterRunAllChecks(content, { specsDir: safeJoin(deps, 'specs') });
  deps.logger.info(specTesterGenerateReport(safePath));
  return { exitCode: result.pass ? 0 : 1 };
}

export const checklistCommand = defineCommand({
  meta: { name: 'checklist', description: 'Run spec quality checklist on an artifact' },
  args: {
    path: { type: 'positional', description: 'Path to spec file', required: true },
  },
  run({ args }) {
    const r = checklistImpl(createRealDeps(), { path: args.path });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'checklist failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// smells
// ─────────────────────────────────────────────────────────────────────────

export interface SmellsArgs {
  path: string;
}

export function smellsImpl(deps: Deps, args: SmellsArgs): CommandResult {
  if (!args.path) {
    deps.logger.error('Usage: jumpstart-mode smells <spec-file>');
    return { exitCode: 1 };
  }
  // Pit Crew M8 BLOCKER (Adversary 2): user path needs containment.
  const safePath = assertUserPath(deps, args.path, 'smells');
  if (!existsSync(safePath)) {
    deps.logger.error(`File not found: ${args.path}`);
    return { exitCode: 1 };
  }
  const smellDetector = legacyRequire<{
    generateSmellReport: (filePath: string) => string;
  }>('smell-detector');
  deps.logger.info(smellDetector.generateSmellReport(safePath));
  return { exitCode: 0 };
}

export const smellsCommand = defineCommand({
  meta: { name: 'smells', description: 'Detect spec smells in an artifact' },
  args: {
    path: { type: 'positional', description: 'Path to spec file', required: true },
  },
  run({ args }) {
    const r = smellsImpl(createRealDeps(), { path: args.path });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'smells failed');
  },
});
