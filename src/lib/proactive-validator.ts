/**
 * proactive-validator.ts — Proactive Validation & Suggestion Engine port (M11 batch 5).
 *
 * Pure-library port of `bin/lib/proactive-validator.js` (CJS) to a typed
 * ES module. Public surface preserved verbatim by name + signature:
 *
 *   - `DIAGNOSTIC_CODES` (frozen-shape constant)
 *   - `validateArtifactProactive(filePath, options?)` => FileValidationResult
 *   - `validateAllArtifacts(specsDir, options?)` => Promise<ValidateAllResult>
 *   - `formatDiagnostic(diag, file?)` => string
 *   - `renderValidationReport(result)` => string
 *   - `inferSchemaName(basename)` => string | null
 *
 * Behavior parity:
 *   - Single-file pipeline: spec-tester (5 checks) → smell-detector →
 *     validator (schema + approval).
 *   - Cross-file pipeline: spec-drift, crossref, coverage, traceability.
 *   - Pass threshold: 70 (default) or 100 (strict).
 *   - All diagnostics conform to LSP-style `{line, column, severity,
 *     code, message, suggestion, source}`.
 *
 * Module dependencies:
 *   - `spec-tester`: still legacy CJS (`bin/lib/spec-tester.js`); loaded
 *     via `createRequire` since no TS port exists yet.
 *   - `coverage`: still legacy CJS (`bin/lib/coverage.js`); same.
 *   - `smell-detector`, `validator`, `spec-drift`, `crossref`,
 *     `traceability`: all TS-ported, imported as ES modules.
 *
 * Path-safety per ADR-009:
 *   - `validateArtifactProactive(filePath, opts)` accepts a caller-supplied
 *     filePath that the cluster constructs via `safeJoin(deps, ...)`.
 *     The library does not gate again — paths are pre-validated upstream.
 *   - `validateAllArtifacts(specsDir, opts)` walks one directory level
 *     using `fs.readdirSync` then `path.join(specsDir, entry)`. The
 *     `specsDir` is gated by the cluster.
 *
 * No JSON parse path in this module — all checks operate on Markdown
 * content. M3 hardening notes are documented per-helper for the rare
 * cases where we serialize an issue payload.
 *
 * @see bin/lib/proactive-validator.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, basename as pathBasename } from 'node:path';
import { validateCrossRefs } from './crossref.js';
import {
  runAllChecks as specTesterRunAllChecks,
  checkGWTFormat as specTesterCheckGWT,
  checkMetricCoverage as specTesterCheckMetrics,
  checkGuessingLanguage as specTesterCheckGuessing,
} from './spec-tester.js';
import { computeCoverage as coverageComputeCoverage } from './coverage.js';
import { detectSmells } from './smell-detector.js';
import { checkSpecDrift } from './spec-drift.js';
import { buildNFRMap } from './traceability.js';
import { checkApproval, validateArtifact } from './validator.js';

const require = createRequire(import.meta.url);

// ─── Sibling-loader for legacy CJS modules without TS ports ──────────────────

interface SpecTesterModule {
  checkAmbiguity(content: string): {
    issues: { word: string; line: number; context: string }[];
    count: number;
  };
  checkPassiveVoice(content: string): {
    issues: { pattern: string; line: number; context: string }[];
    count: number;
  };
  checkGuessingLanguage(content: string): {
    issues: { word: string; line: number; context: string }[];
    count: number;
  };
  checkGWTFormat(content: string): {
    issues: { line: number; criterion: string }[];
    count: number;
  };
  checkMetricCoverage(content: string): {
    gaps: { line?: number; requirement?: string }[];
    coverage: number;
  };
  runAllChecks(
    content: string,
    options?: Record<string, unknown>
  ): { score: number; [key: string]: unknown };
}

interface CoverageModule {
  computeCoverage(
    prdPath: string,
    planPath: string
  ): {
    covered: string[];
    uncovered: string[];
    total_stories: number;
    total_tasks: number;
    coverage_pct: number;
  };
}

// M11 batch7: spec-tester and coverage are now TS ports -- wire directly.
function loadSpecTester(): SpecTesterModule {
  return {
    checkAmbiguity: (content) => specTesterRunAllChecks(content).ambiguity,
    checkPassiveVoice: (content) => specTesterRunAllChecks(content).passive_voice,
    checkGWTFormat: (content) => {
      const r = specTesterCheckGWT(content);
      return { issues: r.issues.map(i => ({ line: i.line, criterion: i.context })), count: r.issues.length };
    },
    checkMetricCoverage: (content) => {
      const r = specTesterCheckMetrics(content);
      return { gaps: r.gaps.map(g => ({ requirement: g })), coverage: r.coverage_pct };
    },
    checkGuessingLanguage: (content) => {
      const r = specTesterCheckGuessing(content);
      return { issues: r.issues, count: r.count };
    },
    runAllChecks: (content, options) => specTesterRunAllChecks(content, options) as unknown as { score: number; [key: string]: unknown },
  };
}

function loadCoverage(): CoverageModule {
  return { computeCoverage: coverageComputeCoverage };
}

// ─── Diagnostic codes ────────────────────────────────────────────────────────

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticCodeEntry {
  severity: DiagnosticSeverity;
  description: string;
}

export const DIAGNOSTIC_CODES: Record<string, DiagnosticCodeEntry> = {
  VAGUE_ADJ: { severity: 'warning', description: 'Vague adjective without measurable metric' },
  PASSIVE_VOICE: {
    severity: 'info',
    description: 'Passive voice construction — prefer active voice',
  },
  GUESSING_LANG: { severity: 'warning', description: 'Hedging/guessing language detected' },
  GWT_FORMAT: {
    severity: 'info',
    description: 'Acceptance criteria not in Given/When/Then format',
  },
  METRIC_GAP: {
    severity: 'warning',
    description: 'Requirement lacks quantified acceptance metric',
  },
  SPEC_SMELL: { severity: 'warning', description: 'Spec smell detected' },
  SCHEMA_ERROR: { severity: 'error', description: 'Schema/structural validation error' },
  MISSING_SECTION: { severity: 'error', description: 'Required Markdown section missing' },
  APPROVAL_PENDING: {
    severity: 'info',
    description: 'Artifact Phase Gate not yet approved',
  },
  PLACEHOLDER: { severity: 'warning', description: 'Unresolved placeholder found' },
  BROKEN_LINK: { severity: 'error', description: 'Cross-reference link target not found' },
  SPEC_DRIFT: { severity: 'warning', description: 'Specification drift between artifacts' },
  COVERAGE_GAP: {
    severity: 'warning',
    description: 'User story not covered by implementation tasks',
  },
  UNMAPPED_NFR: {
    severity: 'warning',
    description: 'Non-functional requirement not mapped to architecture',
  },
};

// ─── Diagnostic shape ────────────────────────────────────────────────────────

export interface Diagnostic {
  line: number;
  column: number;
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  suggestion: string | null;
  source: string;
}

export interface FileValidationResult {
  file: string;
  score: number;
  pass: boolean;
  diagnostics: Diagnostic[];
}

export interface CrossFileFinding {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  source: string;
}

export interface CrossFileResults {
  drift: CrossFileFinding[] | null;
  broken_links: CrossFileFinding[] | null;
  coverage_gaps: CrossFileFinding[] | null;
  unmapped_nfrs: CrossFileFinding[] | null;
}

export interface ValidateSummary {
  total_files: number;
  total_diagnostics: number;
  pass_count: number;
  fail_count: number;
  avg_score: number | null;
}

export interface ValidateAllResult {
  files: FileValidationResult[];
  cross_file: CrossFileResults;
  summary: ValidateSummary;
}

export interface ValidateArtifactOptions {
  schema?: string | undefined;
  schemas_dir?: string | undefined;
  strict?: boolean | undefined;
}

export interface ValidateAllOptions extends ValidateArtifactOptions {
  root?: string | undefined;
}

// ─── Schema name inference ───────────────────────────────────────────────────

const SCHEMA_NAME_MAP: Record<string, string> = {
  'challenger-brief.md': 'challenger-brief',
  'product-brief.md': 'product-brief',
  'prd.md': 'prd',
  'architecture.md': 'architecture',
  'implementation-plan.md': 'implementation-plan',
  'codebase-context.md': 'codebase-context',
};

/**
 * Infer schema name from artifact filename. Returns null for unknown
 * filenames.
 */
export function inferSchemaName(basename: string): string | null {
  return SCHEMA_NAME_MAP[basename] ?? null;
}

// ─── Single-file validation ──────────────────────────────────────────────────

/**
 * Run all relevant checks on a single artifact file and return
 * diagnostics in a unified LSP-style format.
 */
export function validateArtifactProactive(
  filePath: string,
  options: ValidateArtifactOptions = {}
): FileValidationResult {
  const diagnostics: Diagnostic[] = [];
  const basename = pathBasename(filePath);
  const relPath = filePath; // Caller can pass relative.

  if (!existsSync(filePath)) {
    return {
      file: relPath,
      score: 0,
      pass: false,
      diagnostics: [
        {
          line: 0,
          column: 0,
          severity: 'error',
          code: 'SCHEMA_ERROR',
          message: `File not found: ${filePath}`,
          suggestion: 'Create the artifact using the appropriate template.',
          source: 'validator',
        },
      ],
    };
  }

  const content = readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    return {
      file: relPath,
      score: 0,
      pass: false,
      diagnostics: [
        {
          line: 0,
          column: 0,
          severity: 'error',
          code: 'SCHEMA_ERROR',
          message: 'Artifact is empty.',
          suggestion: 'Populate using the template from .jumpstart/templates/.',
          source: 'validator',
        },
      ],
    };
  }

  const specTester = loadSpecTester();

  // 1. Spec-tester checks
  const ambiguity = specTester.checkAmbiguity(content);
  for (const issue of ambiguity.issues) {
    diagnostics.push({
      line: issue.line,
      column: 0,
      severity: 'warning',
      code: 'VAGUE_ADJ',
      message: `Vague adjective "${issue.word}" without measurable metric`,
      suggestion: `Add a quantified metric after "${issue.word}" (e.g., "${issue.word} — under 200ms p95").`,
      source: 'spec-tester',
    });
  }

  const passive = specTester.checkPassiveVoice(content);
  for (const issue of passive.issues) {
    diagnostics.push({
      line: issue.line,
      column: 0,
      severity: 'info',
      code: 'PASSIVE_VOICE',
      message: `Passive voice: "${issue.context.substring(0, 80)}"`,
      suggestion: 'Rewrite in active voice with a clear subject.',
      source: 'spec-tester',
    });
  }

  const guessing = specTester.checkGuessingLanguage(content);
  for (const issue of guessing.issues) {
    diagnostics.push({
      line: issue.line,
      column: 0,
      severity: 'warning',
      code: 'GUESSING_LANG',
      message: `Guessing language: "${issue.word}"`,
      suggestion: 'Replace with researched facts or tag with [NEEDS CLARIFICATION].',
      source: 'spec-tester',
    });
  }

  const gwt = specTester.checkGWTFormat(content);
  for (const issue of gwt.issues) {
    diagnostics.push({
      line: issue.line,
      column: 0,
      severity: 'info',
      code: 'GWT_FORMAT',
      message: 'Acceptance criterion not in Given/When/Then format',
      suggestion: 'Rewrite as: Given [context], When [action], Then [outcome].',
      source: 'spec-tester',
    });
  }

  const metrics = specTester.checkMetricCoverage(content);
  for (const gap of metrics.gaps ?? []) {
    diagnostics.push({
      line: gap.line ?? 0,
      column: 0,
      severity: 'warning',
      code: 'METRIC_GAP',
      message: gap.requirement
        ? `Requirement missing metric: "${gap.requirement.substring(0, 80)}"`
        : 'Requirement missing quantified metric',
      suggestion: 'Add a measurable acceptance criterion with numeric targets.',
      source: 'spec-tester',
    });
  }

  // Quality score from spec-tester
  const allChecks = specTester.runAllChecks(content);
  const score = allChecks.score;
  const passThreshold = options.strict ? 100 : 70;

  // 2. Smell detection
  const smells = detectSmells(content);
  for (const smell of smells.smells) {
    diagnostics.push({
      line: smell.line,
      column: 0,
      severity: smell.severity === 'major' ? 'warning' : 'info',
      code: 'SPEC_SMELL',
      message: `Spec smell (${smell.type}): "${smell.text.substring(0, 80)}"`,
      suggestion: smell.description || `Address the ${smell.type} pattern.`,
      source: 'smell-detector',
    });
  }

  // 3. Schema/structural validation
  const schemaName = options.schema ?? inferSchemaName(basename);
  if (schemaName) {
    try {
      const vResult = validateArtifact(filePath, schemaName, options.schemas_dir);
      for (const err of vResult.errors) {
        diagnostics.push({
          line: 0,
          column: 0,
          severity: 'error',
          code: 'SCHEMA_ERROR',
          // Validator error shape: ValidationOutcome.errors is string[]
          message: typeof err === 'string' ? err : JSON.stringify(err),
          suggestion: 'Fix the frontmatter or structure to match the schema.',
          source: 'validator',
        });
      }
      for (const warn of vResult.warnings) {
        const code = warn.includes('placeholder')
          ? 'PLACEHOLDER'
          : warn.includes('Phase Gate')
            ? 'MISSING_SECTION'
            : 'SCHEMA_ERROR';
        diagnostics.push({
          line: 0,
          column: 0,
          severity: 'warning',
          code,
          message: warn,
          suggestion: warn.includes('placeholder')
            ? 'Replace all [PLACEHOLDER] tags with real content.'
            : 'Add the missing section.',
          source: 'validator',
        });
      }
    } catch {
      // Schema not available — skip
    }
  }

  // 4. Approval check
  const approval = checkApproval(filePath);
  if (!approval.approved) {
    diagnostics.push({
      line: 0,
      column: 0,
      severity: 'info',
      code: 'APPROVAL_PENDING',
      message:
        'Artifact has not been approved (Phase Gate checkboxes incomplete or approver pending).',
      suggestion: 'Complete the Phase Gate Approval section and mark checkboxes [x].',
      source: 'validator',
    });
  }

  return {
    file: relPath,
    score,
    pass: score >= passThreshold,
    diagnostics,
  };
}

// ─── Directory-wide validation ───────────────────────────────────────────────

/**
 * Validate all artifacts in a specs directory plus cross-file checks.
 */
export async function validateAllArtifacts(
  specsDir: string,
  options: ValidateAllOptions = {}
): Promise<ValidateAllResult> {
  const root = options.root ?? dirname(specsDir);
  const files: FileValidationResult[] = [];
  const crossFile: CrossFileResults = {
    drift: null,
    broken_links: null,
    coverage_gaps: null,
    unmapped_nfrs: null,
  };

  // Per-file validation
  if (existsSync(specsDir)) {
    const entries = readdirSync(specsDir).filter((f) => f.endsWith('.md'));
    for (const entry of entries) {
      const filePath = join(specsDir, entry);
      const opts: ValidateArtifactOptions = {};
      if (options.schemas_dir !== undefined) opts.schemas_dir = options.schemas_dir;
      if (options.strict !== undefined) opts.strict = options.strict;
      const result = validateArtifactProactive(filePath, opts);
      // Normalize the file path to relative
      result.file = `specs/${entry}`;
      files.push(result);
    }
  }

  // Cross-file: Spec drift
  try {
    const driftResult = checkSpecDrift(specsDir);
    if (driftResult.drifts.length > 0) {
      crossFile.drift = driftResult.drifts.map((d) => ({
        severity: 'warning',
        code: 'SPEC_DRIFT',
        message: d.detail || `${d.type}: ${d.source} → ${d.target}`,
        source: 'spec-drift',
      }));
    }
  } catch {
    // spec-drift not applicable
  }

  // Cross-file: Broken links
  try {
    const crossResult = validateCrossRefs(specsDir, root);
    if (crossResult.broken_links.length > 0) {
      crossFile.broken_links = crossResult.broken_links.map((link) => ({
        severity: 'error',
        code: 'BROKEN_LINK',
        message: `Broken link to ${link.target} in ${link.source}:${link.line}`,
        source: 'crossref',
      }));
    }
  } catch {
    // crossref not applicable
  }

  // Cross-file: Coverage gaps
  const prdPath = join(specsDir, 'prd.md');
  const planPath = join(specsDir, 'implementation-plan.md');
  if (existsSync(prdPath) && existsSync(planPath)) {
    try {
      const coverageMod = loadCoverage();
      const covResult = coverageMod.computeCoverage(prdPath, planPath);
      if (covResult.uncovered && covResult.uncovered.length > 0) {
        crossFile.coverage_gaps = covResult.uncovered.map((id) => ({
          severity: 'warning',
          code: 'COVERAGE_GAP',
          message: `User story ${id} is not covered by any implementation task`,
          source: 'coverage',
        }));
      }
    } catch {
      // coverage not applicable
    }
  }

  // Cross-file: Unmapped NFRs
  try {
    const nfrResult = buildNFRMap(root);
    if (nfrResult.mapping) {
      // The TS-ported traceability uses `status: 'unmapped'`; the legacy
      // module used `mapped_to`. Either way, we filter "unmapped" entries.
      const unmapped = nfrResult.mapping.filter((m) => m.status === 'unmapped');
      if (unmapped.length > 0) {
        crossFile.unmapped_nfrs = unmapped.map((m) => ({
          severity: 'warning',
          code: 'UNMAPPED_NFR',
          message: `NFR ${m.nfr} is not mapped to any architecture component`,
          source: 'traceability',
        }));
      }
    }
  } catch {
    // traceability not applicable
  }

  // Summary
  const totalDiagnostics =
    files.reduce((sum, f) => sum + f.diagnostics.length, 0) +
    (crossFile.drift?.length ?? 0) +
    (crossFile.broken_links?.length ?? 0) +
    (crossFile.coverage_gaps?.length ?? 0) +
    (crossFile.unmapped_nfrs?.length ?? 0);

  const passCount = files.filter((f) => f.pass).length;
  const failCount = files.filter((f) => !f.pass).length;
  const avgScore =
    files.length > 0 ? Math.round(files.reduce((sum, f) => sum + f.score, 0) / files.length) : null;

  return {
    files,
    cross_file: crossFile,
    summary: {
      total_files: files.length,
      total_diagnostics: totalDiagnostics,
      pass_count: passCount,
      fail_count: failCount,
      avg_score: avgScore,
    },
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * Format a single diagnostic as an LSP-style string.
 */
export function formatDiagnostic(diag: Diagnostic, file?: string): string {
  const loc = file ? `${file}:${diag.line}:${diag.column}` : `line ${diag.line}`;
  const sev = diag.severity.toUpperCase().padEnd(7);
  const suggest = diag.suggestion ? ` — ${diag.suggestion}` : '';
  return `${loc} ${sev} [${diag.code}] ${diag.message}${suggest}`;
}

/**
 * Render a full validation report as Markdown.
 */
export function renderValidationReport(result: ValidateAllResult): string {
  const lines: string[] = [];
  lines.push('# Proactive Validation Report\n');
  lines.push(`**Files scanned:** ${result.summary.total_files}`);
  lines.push(`**Total diagnostics:** ${result.summary.total_diagnostics}`);
  lines.push(
    `**Passing:** ${result.summary.pass_count} | **Failing:** ${result.summary.fail_count}`
  );
  if (result.summary.avg_score !== null) {
    lines.push(`**Average quality score:** ${result.summary.avg_score}/100`);
  }
  lines.push('');

  // Per-file sections
  for (const file of result.files) {
    const statusIcon = file.pass ? '✅' : '❌';
    lines.push(`## ${statusIcon} ${file.file} (score: ${file.score}/100)\n`);
    if (file.diagnostics.length === 0) {
      lines.push('No issues found.\n');
    } else {
      lines.push('| Line | Severity | Code | Message | Suggestion |');
      lines.push('|------|----------|------|---------|------------|');
      for (const d of file.diagnostics) {
        lines.push(
          `| ${d.line} | ${d.severity} | ${d.code} | ${d.message.substring(0, 80)} | ${(d.suggestion ?? '').substring(0, 60)} |`
        );
      }
      lines.push('');
    }
  }

  // Cross-file section
  const crossEntries: { key: string; items: CrossFileFinding[] }[] = [];
  if (result.cross_file.drift?.length) {
    crossEntries.push({ key: 'drift', items: result.cross_file.drift });
  }
  if (result.cross_file.broken_links?.length) {
    crossEntries.push({ key: 'broken_links', items: result.cross_file.broken_links });
  }
  if (result.cross_file.coverage_gaps?.length) {
    crossEntries.push({ key: 'coverage_gaps', items: result.cross_file.coverage_gaps });
  }
  if (result.cross_file.unmapped_nfrs?.length) {
    crossEntries.push({ key: 'unmapped_nfrs', items: result.cross_file.unmapped_nfrs });
  }
  if (crossEntries.length > 0) {
    lines.push('## Cross-File Analysis\n');
    for (const { key, items } of crossEntries) {
      const heading = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`### ${heading} (${items.length})\n`);
      for (const item of items) {
        lines.push(`- **[${item.code}]** ${item.message}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
