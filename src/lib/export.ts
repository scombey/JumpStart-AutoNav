/**
 * export.ts -- Portable Handoff Package (UX Feature 14).
 *
 * Generates a self-contained handoff package with all approved specs,
 * key decisions, implementation status, and coverage data.
 *
 * ADR-006: no process.exit.
 * ADR-009: root/output paths validated by caller.
 * M3 hardening: state.json parse failure → defaultState fallback.
 *               assertNoPollution() applied before using parsed state.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { summarizeArtifact } from './context-summarizer.js';
import { computeCoverage } from './coverage.js';

// ─── M3 Hardening ─────────────────────────────────────────────────────────────

const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertNoPollution(obj: unknown, depth = 0): void {
  if (depth > 10 || typeof obj !== 'object' || obj === null) return;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (POLLUTION_KEYS.has(key)) throw new Error(`Prototype pollution key: "${key}"`);
    assertNoPollution((obj as Record<string, unknown>)[key], depth + 1);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhaseEntry {
  phase: number;
  name: string;
  artifact: string | null;
}

export interface PhaseStatus {
  phase: number;
  name: string;
  status: string;
  artifact: string | null;
}

export interface ArtifactSummaryEntry {
  file: string;
  phase: number;
  phase_name: string;
  approved: boolean;
  frontmatter?: Record<string, unknown>;
  sections?: unknown[];
  structured_data?: Record<string, unknown>;
  error?: string | undefined;
}

export interface DecisionEntry {
  file: string;
  title: string;
  status: string;
}

export interface CoverageData {
  covered?: string[] | undefined;
  uncovered?: string[] | undefined;
  total_stories?: number | undefined;
  coverage_pct?: number | null | undefined;
}

export interface OpenItem {
  file: string;
  tag: string;
}

export interface ImplementationStatus {
  current_phase: unknown;
  current_agent?: unknown;
  phase_history: unknown[];
  resume_context: unknown;
}

export interface HandoffData {
  project_name: string;
  exported_at: string;
  phases: PhaseStatus[];
  approved_artifacts: string[];
  summaries: ArtifactSummaryEntry[];
  decisions: DecisionEntry[];
  coverage: CoverageData | null;
  open_items: OpenItem[];
  implementation_status: ImplementationStatus;
}

export interface ExportHandoffOptions {
  root?: string | undefined;
  output?: string | undefined;
  json?: boolean | undefined;
  specsDir?: string | undefined;
}

export interface ExportHandoffResult {
  success: boolean;
  output_path: string;
  stats: {
    phases: number;
    approved: number;
    summaries: number;
    decisions: number;
    open_items: number;
    has_coverage: boolean;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PHASES: PhaseEntry[] = [
  { phase: -1, name: 'Scout', artifact: 'specs/codebase-context.md' },
  { phase: 0, name: 'Challenger', artifact: 'specs/challenger-brief.md' },
  { phase: 1, name: 'Analyst', artifact: 'specs/product-brief.md' },
  { phase: 2, name: 'PM', artifact: 'specs/prd.md' },
  { phase: 3, name: 'Architect', artifact: 'specs/architecture.md' },
  { phase: 4, name: 'Developer', artifact: null },
];

export const SECONDARY_ARTIFACTS: string[] = ['specs/implementation-plan.md'];

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Check if a file contains an approved Phase Gate section.
 */
export function isApproved(content: string): boolean {
  if (!content) return false;
  if (!/## Phase Gate Approval/i.test(content)) return false;
  const match = content.match(/\*\*Approved by:\*\*\s*(.+)/i);
  if (!match || (match[1] ?? '').trim().toLowerCase() === 'pending') return false;
  const gateSection = content.split(/## Phase Gate Approval/i)[1] ?? '';
  const unchecked = gateSection.match(/- \[ \]/g);
  return !unchecked || unchecked.length === 0;
}

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

interface StateShape {
  current_phase: unknown;
  current_agent?: unknown;
  approved_artifacts: string[];
  phase_history: unknown[];
  resume_context: unknown;
}

function defaultState(): StateShape {
  return { current_phase: null, approved_artifacts: [], phase_history: [], resume_context: null };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Gather all data needed for the handoff package.
 */
export function gatherHandoffData(options: ExportHandoffOptions = {}): HandoffData {
  const root = options.root ?? process.cwd();
  const specsDir = options.specsDir ?? path.join(root, 'specs');

  // Load state with M3 hardening
  let state: StateShape = defaultState();
  try {
    const statePath = path.join(root, '.jumpstart', 'state', 'state.json');
    if (fs.existsSync(statePath)) {
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as unknown;
      assertNoPollution(raw);
      state = raw as StateShape;
    }
  } catch {
    state = defaultState();
  }

  // Load project name from config.yaml
  let projectName = path.basename(root);
  try {
    const configPath = path.join(root, '.jumpstart', 'config.yaml');
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const nameMatch = configContent.match(/name:\s*['"]?([^'"\n]+)/);
      if (nameMatch) projectName = (nameMatch[1] ?? '').trim();
    }
  } catch {
    /* use default */
  }

  // Gather phase status and summaries
  const phases: PhaseStatus[] = [];
  const summaries: ArtifactSummaryEntry[] = [];
  const approvedArtifacts: string[] = [];

  for (const p of PHASES) {
    if (!p.artifact) {
      phases.push({ phase: p.phase, name: p.name, status: 'n/a', artifact: null });
      continue;
    }

    const artifactPath = path.join(root, p.artifact);
    let status = 'not-started';
    let approved = false;

    if (fs.existsSync(artifactPath)) {
      const content = fs.readFileSync(artifactPath, 'utf8');
      approved = isApproved(content);
      status = approved ? 'approved' : 'draft';

      if (approved) approvedArtifacts.push(p.artifact);

      try {
        const summary = summarizeArtifact(artifactPath, p.artifact);
        if (summary) {
          summaries.push({
            file: p.artifact,
            phase: p.phase,
            phase_name: p.name,
            approved,
            frontmatter: (summary.frontmatter ?? {}) as Record<string, unknown>,
            sections: summary.sections ?? [],
            structured_data: (summary.structured_data ?? {}) as Record<string, unknown>,
          });
        }
      } catch {
        summaries.push({
          file: p.artifact,
          phase: p.phase,
          phase_name: p.name,
          approved,
          error: 'Could not summarize',
        });
      }
    }

    phases.push({ phase: p.phase, name: p.name, status, artifact: p.artifact });
  }

  // Check secondary artifacts (implementation-plan.md)
  for (const sa of SECONDARY_ARTIFACTS) {
    const saPath = path.join(root, sa);
    if (fs.existsSync(saPath)) {
      const content = fs.readFileSync(saPath, 'utf8');
      const approved = isApproved(content);
      if (approved) approvedArtifacts.push(sa);
      try {
        const summary = summarizeArtifact(saPath, sa);
        if (summary) {
          summaries.push({
            file: sa,
            phase: 3,
            phase_name: 'Architect',
            approved,
            frontmatter: (summary.frontmatter ?? {}) as Record<string, unknown>,
            sections: summary.sections ?? [],
            structured_data: (summary.structured_data ?? {}) as Record<string, unknown>,
          });
        }
      } catch {
        /* skip */
      }
    }
  }

  // Gather ADRs from specs/decisions/
  const decisions: DecisionEntry[] = [];
  const decisionsDir = path.join(specsDir, 'decisions');
  if (fs.existsSync(decisionsDir)) {
    try {
      const files = fs.readdirSync(decisionsDir).filter((f) => f.endsWith('.md'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(decisionsDir, f), 'utf8');
        const titleMatch = content.match(/^#\s+(.+)/m);
        const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/i);
        decisions.push({
          file: `specs/decisions/${f}`,
          title: titleMatch ? (titleMatch[1] ?? f) : f,
          status: statusMatch ? (statusMatch[1] ?? 'Unknown').trim() : 'Unknown',
        });
      }
    } catch {
      /* skip */
    }
  }

  // Coverage data
  let coverage: CoverageData | null = null;
  const prdPath = path.join(root, 'specs/prd.md');
  const planPath = path.join(root, 'specs/implementation-plan.md');
  if (fs.existsSync(prdPath) && fs.existsSync(planPath)) {
    try {
      coverage = computeCoverage(prdPath, planPath);
    } catch {
      /* skip */
    }
  }

  // Open clarifications
  const openItems: OpenItem[] = [];
  for (const s of summaries) {
    const sd = s.structured_data ?? {};
    const clarifications = sd.clarifications;
    if (Array.isArray(clarifications)) {
      for (const c of clarifications) {
        openItems.push({ file: s.file, tag: String(c) });
      }
    }
  }

  // Scan for [NEEDS CLARIFICATION] in all spec files
  if (fs.existsSync(specsDir)) {
    try {
      const specFiles = walkFiles(specsDir).filter((f) => f.endsWith('.md'));
      for (const sf of specFiles) {
        const content = fs.readFileSync(sf, 'utf8');
        const matches = content.match(/\[NEEDS CLARIFICATION[^\]]*\]/g);
        if (matches) {
          const relPath = path.relative(root, sf).replace(/\\/g, '/');
          for (const m of matches) {
            if (!openItems.find((o) => o.file === relPath && o.tag === m)) {
              openItems.push({ file: relPath, tag: m });
            }
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  return {
    project_name: projectName,
    exported_at: new Date().toISOString(),
    phases,
    approved_artifacts: approvedArtifacts,
    summaries,
    decisions,
    coverage,
    open_items: openItems,
    implementation_status: {
      current_phase: state.current_phase,
      current_agent: state.current_agent,
      phase_history: state.phase_history ?? [],
      resume_context: state.resume_context,
    },
  };
}

/**
 * Render handoff data as a self-contained Markdown document.
 */
export function renderHandoffMarkdown(data: HandoffData): string {
  const lines: string[] = [];

  lines.push(`# Handoff Package — ${data.project_name}`);
  lines.push('');
  lines.push(`> Exported: ${data.exported_at}`);
  lines.push('');

  // Phase Status Table
  lines.push('## Phase Status');
  lines.push('');
  lines.push('| Phase | Name | Status | Artifact |');
  lines.push('|-------|------|--------|----------|');
  for (const p of data.phases) {
    const statusIcon =
      p.status === 'approved'
        ? '✅'
        : p.status === 'draft'
          ? '📝'
          : p.status === 'n/a'
            ? '—'
            : '⬜';
    lines.push(`| ${p.phase} | ${p.name} | ${statusIcon} ${p.status} | ${p.artifact ?? '—'} |`);
  }
  lines.push('');

  // Approved Artifacts
  if (data.approved_artifacts.length > 0) {
    lines.push('## Approved Artifacts');
    lines.push('');
    for (const a of data.approved_artifacts) {
      lines.push(`- ✅ ${a}`);
    }
    lines.push('');
  }

  // Summaries
  if (data.summaries.length > 0) {
    lines.push('## Artifact Summaries');
    lines.push('');
    for (const s of data.summaries) {
      lines.push(`### ${s.phase_name} — ${s.file}`);
      lines.push('');
      if (s.error) {
        lines.push(`_${s.error}_`);
      } else {
        const sections = s.sections ?? [];
        if (Array.isArray(sections) && sections.length > 0) {
          for (const sec of sections) {
            const secRecord = sec as Record<string, unknown>;
            lines.push(`**${String(secRecord.heading ?? '')}**`);
            if (secRecord.summary) lines.push(String(secRecord.summary));
            lines.push('');
          }
        }
        const sd = s.structured_data ?? {};
        if (Array.isArray(sd.user_stories) && (sd.user_stories as unknown[]).length > 0) {
          lines.push(`**User Stories:** ${(sd.user_stories as unknown[]).length} stories`);
        }
        if (Array.isArray(sd.nfrs) && (sd.nfrs as unknown[]).length > 0) {
          lines.push(`**NFRs:** ${(sd.nfrs as unknown[]).length} requirements`);
        }
        if (Array.isArray(sd.components) && (sd.components as unknown[]).length > 0) {
          lines.push(`**Components:** ${(sd.components as unknown[]).join(', ')}`);
        }
        if (Array.isArray(sd.tech_stack) && (sd.tech_stack as unknown[]).length > 0) {
          lines.push(`**Tech Stack:** ${(sd.tech_stack as unknown[]).join(', ')}`);
        }
      }
      lines.push('');
    }
  }

  // Decisions
  if (data.decisions.length > 0) {
    lines.push('## Architecture Decisions');
    lines.push('');
    for (const d of data.decisions) {
      lines.push(`- **${d.title}** — _${d.status}_ (${d.file})`);
    }
    lines.push('');
  }

  // Coverage
  if (data.coverage) {
    const cov = data.coverage;
    lines.push('## Coverage');
    lines.push('');
    lines.push(
      `- **Stories covered:** ${Array.isArray(cov.covered) ? cov.covered.length : 0} / ${cov.total_stories ?? 0}`
    );
    lines.push(
      `- **Coverage:** ${cov.coverage_pct != null ? `${String(cov.coverage_pct)}%` : 'N/A'}`
    );
    if (Array.isArray(cov.uncovered) && cov.uncovered.length > 0) {
      lines.push(`- **Uncovered:** ${cov.uncovered.join(', ')}`);
    }
    lines.push('');
  }

  // Open Items
  if (data.open_items.length > 0) {
    lines.push('## Open Clarifications');
    lines.push('');
    for (const item of data.open_items) {
      lines.push(`- ${item.file}: ${item.tag}`);
    }
    lines.push('');
  }

  // Implementation Status
  lines.push('## Implementation Status');
  lines.push('');
  const is = data.implementation_status;
  lines.push(
    `- **Current Phase:** ${is.current_phase !== null ? String(is.current_phase) : 'Not started'}`
  );
  lines.push(`- **Current Agent:** ${String(is.current_agent ?? 'None')}`);
  if (Array.isArray(is.phase_history) && is.phase_history.length > 0) {
    lines.push(`- **Completed Phases:** ${is.phase_history.length}`);
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('_Generated by JumpStart `/jumpstart.handoff`_');
  lines.push('');

  return lines.join('\n');
}

/**
 * Export a complete handoff package to a file.
 */
export function exportHandoffPackage(options: ExportHandoffOptions = {}): ExportHandoffResult {
  const root = options.root ?? process.cwd();
  const data = gatherHandoffData({ root, specsDir: path.join(root, 'specs') });

  const outputPath = options.output ?? path.join(root, 'specs', 'handoff-package.md');
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let content: string;
  if (options.json) {
    content = `${JSON.stringify(data, null, 2)}\n`;
  } else {
    content = renderHandoffMarkdown(data);
  }

  fs.writeFileSync(outputPath, content, 'utf8');

  return {
    success: true,
    output_path: outputPath,
    stats: {
      phases: data.phases.length,
      approved: data.approved_artifacts.length,
      summaries: data.summaries.length,
      decisions: data.decisions.length,
      open_items: data.open_items.length,
      has_coverage: data.coverage !== null,
    },
  };
}
