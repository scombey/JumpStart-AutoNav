/**
 * spec-maturity.ts — Spec Maturity Model port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/spec-maturity.js` (CJS). Public surface:
 *   - `runMaturityChecks(content)` => MaturityChecks
 *   - `assessMaturity(content, options?)` => MaturityResult
 *   - `assessFile(filePath, options?)` => MaturityResult
 *   - `assessProject(root, options?)` => ProjectMaturityResult
 *   - `MATURITY_LEVELS`
 *   - `MATURITY_CRITERIA`
 *
 * M3 hardening: No JSON state paths. Not applicable.
 * Path-safety per ADR-009: `assessFile`/`assessProject` paths come from CLI.
 *
 * @see bin/lib/spec-maturity.js (legacy reference)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MaturityLevel {
  level: number;
  name: string;
  min_score: number;
  description: string;
}

export const MATURITY_LEVELS: MaturityLevel[] = [
  {
    level: 1,
    name: 'Draft',
    min_score: 0,
    description: 'Initial capture, may contain placeholders and gaps',
  },
  { level: 2, name: 'Reviewed', min_score: 30, description: 'Peer-reviewed, major gaps addressed' },
  {
    level: 3,
    name: 'Approved',
    min_score: 55,
    description: 'Stakeholder-approved, phase gate passed',
  },
  {
    level: 4,
    name: 'Implementation-Ready',
    min_score: 75,
    description: 'Detailed enough for developers to implement',
  },
  {
    level: 5,
    name: 'Production-Ready',
    min_score: 90,
    description: 'Complete, validated, enterprise-ready',
  },
];

export interface CriterionDef {
  id: string;
  description: string;
}

export interface CriteriaCategory {
  weight: number;
  checks: CriterionDef[];
}

export const MATURITY_CRITERIA: Record<string, CriteriaCategory> = {
  structure: {
    weight: 0.15,
    checks: [
      { id: 'has_frontmatter', description: 'YAML frontmatter present' },
      { id: 'has_toc', description: 'Table of contents present' },
      { id: 'has_sections', description: 'Proper heading hierarchy' },
      { id: 'no_empty_sections', description: 'No empty sections' },
    ],
  },
  completeness: {
    weight: 0.25,
    checks: [
      { id: 'no_placeholders', description: 'No TODO/TBD/placeholder markers' },
      { id: 'no_clarifications', description: 'No [NEEDS CLARIFICATION] tags' },
      { id: 'sufficient_length', description: 'Sufficient content (>1000 chars)' },
      { id: 'has_detail', description: 'Detailed descriptions (avg paragraph >50 words)' },
    ],
  },
  traceability: {
    weight: 0.15,
    checks: [
      { id: 'has_requirement_ids', description: 'Contains requirement/story IDs' },
      { id: 'has_cross_refs', description: 'Cross-references to other artifacts' },
      { id: 'has_version', description: 'Version information present' },
    ],
  },
  quality: {
    weight: 0.2,
    checks: [
      { id: 'has_acceptance_criteria', description: 'Acceptance criteria defined' },
      { id: 'has_diagrams', description: 'Diagrams included (Mermaid/images)' },
      { id: 'has_examples', description: 'Examples or code samples' },
      { id: 'low_ambiguity', description: 'Low ambiguity (minimal should/might/could)' },
    ],
  },
  governance: {
    weight: 0.15,
    checks: [
      { id: 'has_approval', description: 'Phase gate approval section' },
      { id: 'is_approved', description: 'Actually approved (checkboxes checked)' },
      { id: 'has_dates', description: 'Dates and timestamps present' },
    ],
  },
  enterprise: {
    weight: 0.1,
    checks: [
      { id: 'has_nfrs', description: 'Non-functional requirements addressed' },
      { id: 'has_security', description: 'Security considerations' },
      { id: 'has_compliance', description: 'Compliance/regulatory mentions' },
    ],
  },
};

export type MaturityChecks = Record<string, boolean>;

export function runMaturityChecks(content: string): MaturityChecks {
  const results: MaturityChecks = {};
  const lines = content.split('\n');

  results.has_frontmatter = content.startsWith('---');
  results.has_toc = /table of contents|## contents|## toc/i.test(content);
  const headings = lines.filter((l) => /^#{1,4}\s+/.test(l));
  results.has_sections = headings.length >= 3;

  let emptyCount = 0;
  let currentHeading: string | null = null;
  let hasContentAfterHeading = false;
  for (const line of lines) {
    if (/^#{1,4}\s+/.test(line)) {
      if (currentHeading && !hasContentAfterHeading) emptyCount++;
      currentHeading = line;
      hasContentAfterHeading = false;
    } else if (line.trim().length > 0 && currentHeading) {
      hasContentAfterHeading = true;
    }
  }
  results.no_empty_sections = emptyCount === 0;

  results.no_placeholders = !/\[TODO\]|\[TBD\]|\[PLACEHOLDER\]/i.test(content);
  results.no_clarifications = !/\[NEEDS CLARIFICATION/i.test(content);
  results.sufficient_length = content.length > 1000;

  const paragraphs = content
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 0 && !/^#/.test(p.trim()));
  const avgWords =
    paragraphs.length > 0
      ? paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0) / paragraphs.length
      : 0;
  results.has_detail = avgWords > 20;

  results.has_requirement_ids =
    /\b(REQ-\d+|E\d+-S\d+|NFR-\d+|UC-\d+|FR-\d+|AC-\d+|M\d+-T\d+)\b/.test(content);
  results.has_cross_refs = /\[.*\]\(.*\.md\)/.test(content);
  results.has_version = /version[:\s]+\d+/i.test(content) || /^version:/m.test(content);

  results.has_acceptance_criteria = /acceptance\s+criteria/i.test(content);
  results.has_diagrams = /```mermaid|flowchart|sequenceDiagram|classDiagram|!\[.*\]\(.*\)/i.test(
    content
  );
  results.has_examples = /```\w+/.test(content) || /example[:\s]/i.test(content);

  const ambiguousTerms = [
    'should',
    'might',
    'could',
    'may',
    'possibly',
    'potentially',
    'TBD',
    'TBA',
  ];
  let ambiguousCount = 0;
  for (const term of ambiguousTerms) {
    const pattern = new RegExp(`\\b${term}\\b`, 'gi');
    ambiguousCount += (content.match(pattern) ?? []).length;
  }
  const wordCount = content.split(/\s+/).length;
  results.low_ambiguity = wordCount > 0 ? ambiguousCount / wordCount < 0.02 : true;

  results.has_approval = /Phase Gate Approval/i.test(content);
  results.is_approved = /- \[x\]/i.test(content) && /Approved by[:\s]+(?!Pending)/i.test(content);
  results.has_dates = /\d{4}-\d{2}-\d{2}/.test(content);

  results.has_nfrs = /non-functional|NFR|performance|scalab|availab/i.test(content);
  results.has_security = /security|auth|encryption|OWASP/i.test(content);
  results.has_compliance = /compliance|regulatory|GDPR|HIPAA|SOC|audit/i.test(content);

  return results;
}

export interface Gap {
  category: string;
  check: string;
  description: string;
}

export interface CategoryScore {
  score: number;
  passed: number;
  total: number;
  weight: number;
}

export interface MaturityResult {
  success: boolean;
  overall_score?: number | undefined;
  maturity_level?: number | undefined;
  maturity_name?: string | undefined;
  maturity_description?: string | undefined;
  category_scores?: Record<string, CategoryScore> | undefined;
  gaps?: Gap[] | undefined;
  next_level?:
    | {
        level: number;
        name: string;
        points_needed: number;
        description: string;
      }
    | null
    | undefined;
  total_checks?: number | undefined;
  checks_passed?: number | undefined;
  file?: string | undefined;
  error?: string | undefined;
}

export function assessMaturity(
  content: string,
  _options: Record<string, unknown> = {}
): MaturityResult {
  const checkResults = runMaturityChecks(content);
  const categoryScores: Record<string, CategoryScore> = {};
  let totalWeightedScore = 0;
  const gaps: Gap[] = [];

  for (const [category, config] of Object.entries(MATURITY_CRITERIA)) {
    const passed = config.checks.filter((c) => checkResults[c.id]);
    const score =
      config.checks.length > 0 ? Math.round((passed.length / config.checks.length) * 100) : 0;

    categoryScores[category] = {
      score,
      passed: passed.length,
      total: config.checks.length,
      weight: config.weight,
    };
    totalWeightedScore += score * config.weight;

    for (const check of config.checks) {
      if (!checkResults[check.id]) {
        gaps.push({ category, check: check.id, description: check.description });
      }
    }
  }

  const overallScore = Math.round(totalWeightedScore);
  const fallbackLevel: MaturityLevel = MATURITY_LEVELS[0] ?? {
    level: 1,
    name: 'Unknown',
    min_score: 0,
    description: 'Unknown maturity',
  };
  const maturityLevel =
    [...MATURITY_LEVELS].reverse().find((l) => overallScore >= l.min_score) ?? fallbackLevel;

  const nextLevel = MATURITY_LEVELS.find((l) => l.min_score > overallScore);

  return {
    success: true,
    overall_score: overallScore,
    maturity_level: maturityLevel.level,
    maturity_name: maturityLevel.name,
    maturity_description: maturityLevel.description,
    category_scores: categoryScores,
    gaps,
    next_level: nextLevel
      ? {
          level: nextLevel.level,
          name: nextLevel.name,
          points_needed: nextLevel.min_score - overallScore,
          description: nextLevel.description,
        }
      : null,
    total_checks: Object.values(MATURITY_CRITERIA).reduce((sum, c) => sum + c.checks.length, 0),
    checks_passed: Object.values(MATURITY_CRITERIA).reduce(
      (sum, c) => sum + c.checks.filter((ck) => checkResults[ck.id]).length,
      0
    ),
  };
}

export function assessFile(
  filePath: string,
  options: Record<string, unknown> = {}
): MaturityResult {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }
  const content = readFileSync(filePath, 'utf8');
  const result = assessMaturity(content, options);
  result.file = filePath;
  return result;
}

export interface ArtifactMaturityResult extends MaturityResult {
  artifact: string;
}

export interface ProjectMaturityResult {
  success: boolean;
  project_score?: number | undefined;
  project_maturity?: string | undefined;
  project_level?: number | undefined;
  artifacts?: ArtifactMaturityResult[] | undefined;
  summary?:
    | {
        artifacts_assessed: number;
        average_score: number;
        production_ready: number;
        draft: number;
      }
    | undefined;
  error?: string | undefined;
}

export function assessProject(
  root: string,
  options: Record<string, unknown> = {}
): ProjectMaturityResult {
  const specsDir = join(root, 'specs');
  if (!existsSync(specsDir)) {
    return { success: false, error: 'specs/ directory not found' };
  }

  const artifacts = [
    'challenger-brief.md',
    'product-brief.md',
    'prd.md',
    'architecture.md',
    'implementation-plan.md',
  ];
  const results: ArtifactMaturityResult[] = [];

  for (const artifact of artifacts) {
    const fullPath = join(specsDir, artifact);
    if (existsSync(fullPath)) {
      const result = assessFile(fullPath, options);
      results.push({ artifact, ...result });
    }
  }

  const avgScore =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.overall_score ?? 0), 0) / results.length)
      : 0;

  const avgFallback: MaturityLevel = MATURITY_LEVELS[0] ?? {
    level: 1,
    name: 'Unknown',
    min_score: 0,
    description: 'Unknown maturity',
  };
  const avgLevel =
    [...MATURITY_LEVELS].reverse().find((l) => avgScore >= l.min_score) ?? avgFallback;

  return {
    success: true,
    project_score: avgScore,
    project_maturity: avgLevel.name,
    project_level: avgLevel.level,
    artifacts: results,
    summary: {
      artifacts_assessed: results.length,
      average_score: avgScore,
      production_ready: results.filter((r) => (r.maturity_level ?? 0) >= 5).length,
      draft: results.filter((r) => (r.maturity_level ?? 0) <= 1).length,
    },
  };
}
