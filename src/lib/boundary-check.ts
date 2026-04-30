/**
 * boundary-check.ts -- Boundary Validation (Item 74).
 *
 * Validates that the implementation plan does not drift beyond the
 * "Constraints and Boundaries" defined in the product brief.
 *
 * M3 hardening: no JSON state -- pure text processing.
 * ADR-009: brief/plan paths must be pre-validated by caller.
 * ADR-006: no process.exit.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Boundary {
  type: string;
  statement: string;
}

export interface PlanTask {
  id: string;
  description: string;
  scope_terms: string[];
}

export interface Violation {
  boundary: string;
  boundary_type: string;
  excluded_term: string;
  found_in: string;
  severity: string;
}

export interface Warning {
  message: string;
  severity: string;
}

export interface BoundaryCheckResult {
  boundaries: Boundary[];
  violations: Violation[];
  warnings: Warning[];
  task_count: number;
  boundary_count: number;
  score: number;
  pass: boolean;
  error?: string | undefined;
}

export interface CheckBoundariesInput {
  brief?: string | undefined;
  plan?: string | undefined;
  root?: string | undefined;
}

const BOUNDARY_HEADERS: RegExp[] = [
  /^#{2,4}\s+(?:constraints?\s+(?:and\s+)?)?boundar(?:y|ies)/i,
  /^#{2,4}\s+out\s+of\s+scope/i,
  /^#{2,4}\s+exclusions?/i,
  /^#{2,4}\s+constraints?/i,
  /^#{2,4}\s+(?:what\s+(?:we|this)\s+(?:will\s+)?)?not\s+(?:do|build|include)/i,
  /^#{2,4}\s+limitations?/i,
  /^#{2,4}\s+scope\s+(?:boundaries|limits)/i,
];

/**
 * Extract boundary statements from the product brief.
 */
export function extractBoundaries(content: string): Boundary[] {
  const boundaries: Boundary[] = [];
  const lines = content.split('\n');
  let inBoundarySection = false;
  let sectionType = '';

  for (const line of lines) {
    for (const pattern of BOUNDARY_HEADERS) {
      if (pattern.test(line)) {
        inBoundarySection = true;
        sectionType = line.replace(/^#+\s+/, '').trim();
        break;
      }
    }

    if (inBoundarySection && /^#{1,4}\s+/.test(line) && !BOUNDARY_HEADERS.some(p => p.test(line))) {
      inBoundarySection = false;
      continue;
    }

    if (inBoundarySection) {
      const bulletMatch = line.match(/^\s*[-*+]\s+(.+)/);
      if (bulletMatch) {
        boundaries.push({ type: sectionType, statement: (bulletMatch[1] ?? '').trim() });
      }
      const numMatch = line.match(/^\s*\d+[.)]\s+(.+)/);
      if (numMatch) {
        boundaries.push({ type: sectionType, statement: (numMatch[1] ?? '').trim() });
      }
    }
  }

  return boundaries;
}

const TECH_REGEX = /\b((?:React|Angular|Vue|Svelte|Next|Nuxt|Express|Fastify|Django|Flask|Rails|Spring|Laravel|Prisma|Sequelize|TypeORM|MongoDB|PostgreSQL|MySQL|Redis|GraphQL|REST|gRPC|Docker|Kubernetes|AWS|Azure|GCP|Firebase|Supabase|Vercel|Netlify|Heroku)(?:\.js)?)\b/gi;

/**
 * Extract task descriptions and scope indicators from the implementation plan.
 */
export function extractPlanScope(content: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  const taskSections = content.split(/###\s+/);

  for (const section of taskSections) {
    const idMatch = section.match(/^(M\d+-T\d+)\s*[:\-—]\s*(.+)/);
    if (!idMatch) continue;

    const id = idMatch[1] ?? '';
    const description = (idMatch[2] ?? '').trim();

    const scopeTerms: string[] = [];
    TECH_REGEX.lastIndex = 0;
    let tm: RegExpExecArray | null;
    while ((tm = TECH_REGEX.exec(section)) !== null) {
      scopeTerms.push(tm[1] ?? '');
    }

    tasks.push({ id, description, scope_terms: Array.from(new Set(scopeTerms)) });
  }

  return tasks;
}

// Stop-words to skip when extracting key terms from exclusion phrases.
const STOP_WORDS = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but', 'not', 'use', 'using', 'with', 'from', 'any', 'this', 'that', 'it', 'its', 'be', 'is', 'are', 'was', 'been', 'our', 'we', 'will', 'do', 'as', 'no', 'into', 'all', 'within', 'without', 'should', 'must', 'only', 'also', 'when', 'implementation', 'codebase', 'project', 'solution', 'code', 'system', 'service', 'app']);

function extractKeyTerms(phrase: string): string[] {
  return phrase.split(/\s+/)
    .map(w => w.replace(/[^a-z0-9_\-]/g, '').toLowerCase())
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

/**
 * Check plan against boundaries.
 */
export function checkBoundaries(input: CheckBoundariesInput): BoundaryCheckResult {
  const {
    brief = 'specs/product-brief.md',
    plan = 'specs/implementation-plan.md',
    root = '.'
  } = input;

  const briefPath = path.resolve(root, brief);
  const planPath = path.resolve(root, plan);

  let briefContent = '';
  let planContent = '';

  try {
    briefContent = fs.readFileSync(briefPath, 'utf8');
  } catch {
    return { error: `Cannot read brief: ${briefPath}`, pass: false, score: 0, boundaries: [], violations: [], warnings: [], task_count: 0, boundary_count: 0 };
  }

  try {
    planContent = fs.readFileSync(planPath, 'utf8');
  } catch {
    return { error: `Cannot read plan: ${planPath}`, pass: false, score: 0, boundaries: [], violations: [], warnings: [], task_count: 0, boundary_count: 0 };
  }

  const boundaries = extractBoundaries(briefContent);
  const tasks = extractPlanScope(planContent);
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const planLower = planContent.toLowerCase();

  for (const boundary of boundaries) {
    const stmt = boundary.statement.toLowerCase();

    const exclusionPatterns = [
      /\bno\s+(\w+)/g,
      /\bnot\s+(?:include|build|implement|support|use)\s+(.+)/g,
      /\bexclude[sd]?\s+(.+)/g,
      /\bavoid\s+(.+)/g,
      /\bwithout\s+(.+)/g,
      /\bwill\s+not\s+(.+)/g,
      /\bdo\s+not\s+(?:use\s+)?(.+)/g,
    ];

    for (const pattern of exclusionPatterns) {
      let em: RegExpExecArray | null;
      while ((em = pattern.exec(stmt)) !== null) {
        const captured = (em[1] ?? '').trim().replace(/[.,;]$/, '');

        // For single-word captures (e.g. "no mongodb"), check the word directly.
        if (!captured.includes(' ') && captured.length > 3) {
          if (planLower.includes(captured)) {
            violations.push({
              boundary: boundary.statement,
              boundary_type: boundary.type,
              excluded_term: captured,
              found_in: 'implementation-plan.md',
              severity: 'major'
            });
          }
        } else {
          // For multi-word captures, extract meaningful tech keywords and check each.
          const keyTerms = extractKeyTerms(captured);
          for (const term of keyTerms) {
            if (planLower.includes(term)) {
              violations.push({
                boundary: boundary.statement,
                boundary_type: boundary.type,
                excluded_term: term,
                found_in: 'implementation-plan.md',
                severity: 'major'
              });
              break; // one violation per boundary statement per pattern match
            }
          }
        }
      }
    }
  }

  if (boundaries.length === 0) {
    warnings.push({
      message: 'No boundary statements found in product brief. Consider adding a "Constraints and Boundaries" section.',
      severity: 'minor'
    });
  }

  const totalChecks = Math.max(1, boundaries.length);
  const score = Math.max(0, Math.round(((totalChecks - violations.length) / totalChecks) * 100));

  return {
    boundaries,
    violations,
    warnings,
    task_count: tasks.length,
    boundary_count: boundaries.length,
    score,
    pass: violations.filter(v => v.severity === 'major').length === 0
  };
}
