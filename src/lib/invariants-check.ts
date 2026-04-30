/**
 * invariants-check.ts — Environment Invariants ("Roadmapal Invariants") (Item 15).
 *
 * Non-negotiable rules (encryption-at-rest, audit logging, etc.)
 * enforced pre-implementation.
 *
 * M3 hardening: no JSON state — reads .md files only, no persist paths.
 * ADR-009: paths must be pre-validated by caller (assertInsideRoot / safeJoin).
 * ADR-006: no process.exit.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Invariant {
  id: string;
  name: string;
  category: string;
  requirement: string;
  verification: string;
}

export interface ArchCoverage {
  passed: Array<Invariant & { coverage: number }>;
  failed: Array<Invariant & { coverage: number }>;
  warnings: string[];
}

export interface PlanCoverage {
  addressed: string[];
  unaddressed: string[];
}

export interface InvariantsReport {
  invariantCount: number;
  archCoverage: ArchCoverage | null;
  planCoverage: PlanCoverage | null;
  summary: string;
}

/**
 * Load invariants from the invariants file.
 */
export function loadInvariants(invariantsPath: string): Invariant[] {
  if (!fs.existsSync(invariantsPath)) {
    return [];
  }

  const content = fs.readFileSync(invariantsPath, 'utf8');
  const invariants: Invariant[] = [];

  const tableMatch = content.match(/\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|/gm);
  if (!tableMatch) return invariants;

  const rows = tableMatch.filter((row) => !row.includes('---') && !row.includes('Category'));

  for (const row of rows) {
    const cells = row
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c);
    if (cells.length >= 4) {
      const id = cells[0] ?? '';
      const name = cells[1] ?? '';
      const category = cells[2] ?? '';
      const requirement = cells[3] ?? '';
      const verification = cells[4] ?? 'Manual review';
      invariants.push({ id, name, category, requirement, verification });
    }
  }

  return invariants;
}

/**
 * Check architecture document against invariants.
 */
export function checkAgainstArchitecture(
  archContent: string,
  invariants: Invariant[]
): ArchCoverage {
  const passed: Array<Invariant & { coverage: number }> = [];
  const failed: Array<Invariant & { coverage: number }> = [];
  const warnings: string[] = [];

  const contentLower = archContent.toLowerCase();

  for (const inv of invariants) {
    const keywords = inv.requirement
      .toLowerCase()
      .split(/[\s,;.]+/)
      .filter((w) => w.length > 4);

    const keywordHits = keywords.filter((kw) => contentLower.includes(kw));
    const coverage = keywords.length > 0 ? keywordHits.length / keywords.length : 0;

    if (coverage >= 0.3) {
      passed.push({ ...inv, coverage: Math.round(coverage * 100) });
    } else {
      failed.push({ ...inv, coverage: Math.round(coverage * 100) });
      warnings.push(
        `Invariant "${inv.name}" (${inv.id}) — ${inv.category}: ` +
          `Architecture document may not address: "${inv.requirement}"`
      );
    }
  }

  return { passed, failed, warnings };
}

/**
 * Check implementation plan against invariants.
 */
export function checkAgainstPlan(planContent: string, invariants: Invariant[]): PlanCoverage {
  const addressed: string[] = [];
  const unaddressed: string[] = [];
  const contentLower = planContent.toLowerCase();

  for (const inv of invariants) {
    const nameWords = inv.name.toLowerCase().split(/\s+/);
    const found = nameWords.some((w) => w.length > 3 && contentLower.includes(w));

    if (found) {
      addressed.push(inv.id);
    } else {
      unaddressed.push(inv.id);
    }
  }

  return { addressed, unaddressed };
}

/**
 * Generate a compliance report for all invariants.
 */
export function generateReport(invariantsPath: string, specsDir: string): InvariantsReport {
  const invariants = loadInvariants(invariantsPath);

  if (invariants.length === 0) {
    return {
      invariantCount: 0,
      archCoverage: null,
      planCoverage: null,
      summary: 'No invariants defined.',
    };
  }

  let archCoverage: ArchCoverage | null = null;
  const archPath = path.join(specsDir, 'architecture.md');
  if (fs.existsSync(archPath)) {
    const archContent = fs.readFileSync(archPath, 'utf8');
    archCoverage = checkAgainstArchitecture(archContent, invariants);
  }

  let planCoverage: PlanCoverage | null = null;
  const planPath = path.join(specsDir, 'implementation-plan.md');
  if (fs.existsSync(planPath)) {
    const planContent = fs.readFileSync(planPath, 'utf8');
    planCoverage = checkAgainstPlan(planContent, invariants);
  }

  const failedCount = archCoverage ? archCoverage.failed.length : invariants.length;
  const summary =
    failedCount === 0
      ? `All ${invariants.length} invariant(s) addressed in architecture.`
      : `${failedCount}/${invariants.length} invariant(s) may not be addressed in architecture.`;

  return { invariantCount: invariants.length, archCoverage, planCoverage, summary };
}
