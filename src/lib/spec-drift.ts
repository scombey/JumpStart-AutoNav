/**
 * spec-drift.ts — drift detector port (T4.2.3).
 *
 * Public surface preserved
 * verbatim by name + signature:
 *
 *   - `extractStoryIds(content)`
 *   - `extractTaskIds(content)`
 *   - `extractComponents(content)`
 *   - `checkSpecDrift(specsDir)`
 *   - `checkCodeTraceability(sourceDir, planPath)`
 *
 * Invariants:
 *   - Story-id pattern: `/E\d+-S\d+/g`, deduped via `Set`.
 *   - Task-id pattern: `/M\d+-T\d+/g`.
 *   - Component header: `### Component: <name>` (trimmed).
 *   - Drift entries are object literals with `type='missing_reference'`,
 *     `source`, `target`, `detail` — same fields as legacy.
 *   - Orphan-task warning detected when `**Story Reference** | <ref>`
 *     is `None`, `[PRD`, or `-`.
 *   - `checkCodeTraceability` resolves planned files against
 *     `path.resolve(sourceDir, '..', file)` (legacy semantics: planned
 *     files are project-relative, sourceDir lives one level deep).
 *
 * The leaf-utility error policy (per ADR-006): no thrown errors. Returns
 * a `{drifts, warnings, summary}` plain object so callers decide how
 * to surface mismatches.
 *
 * @see specs/decisions/adr-006-error-model.md
 */

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

/** A single drift instance reported by `checkSpecDrift`. */
export interface SpecDrift {
  type: 'missing_reference';
  source: string;
  target: string;
  detail: string;
}

/** Result envelope for `checkSpecDrift`. */
export interface SpecDriftReport {
  drifts: SpecDrift[];
  warnings: string[];
  summary: string;
}

/** Result envelope for `checkCodeTraceability`. */
export interface CodeTraceabilityReport {
  unmapped: string[];
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Extract story IDs (pattern `E<num>-S<num>`) from the content. Dedupes
 * via Set, preserves first-seen order.
 */
export function extractStoryIds(content: string): string[] {
  const matches = content.match(/E\d+-S\d+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Extract task IDs (pattern `M<num>-T<num>`). Same dedupe behavior as
 * `extractStoryIds`.
 */
export function extractTaskIds(content: string): string[] {
  const matches = content.match(/M\d+-T\d+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Extract component names from architecture documents. Looks for
 * `### Component: <Name>` headings; the trailing whitespace + name
 * is trimmed.
 */
export function extractComponents(content: string): string[] {
  const matches = content.match(/### Component:\s*(.+)/g);
  return matches ? matches.map((m) => m.replace('### Component:', '').trim()) : [];
}

/**
 * Cross-reference PRD ↔ Architecture ↔ Implementation Plan and report
 * any missing-reference drift. Three checks per legacy:
 *   1. PRD stories must appear in Architecture
 *   2. PRD stories must appear in Implementation Plan
 *   3. Architecture components must appear in Implementation Plan
 *
 * Plus a warning sweep for orphan tasks (story-reference `None`/`[PRD`/`-`).
 */
export function checkSpecDrift(specsDir: string): SpecDriftReport {
  const drifts: SpecDrift[] = [];
  const warnings: string[] = [];

  const prdPath = path.join(specsDir, 'prd.md');
  const archPath = path.join(specsDir, 'architecture.md');
  const planPath = path.join(specsDir, 'implementation-plan.md');

  const files: Record<string, string> = {
    prd: prdPath,
    architecture: archPath,
    plan: planPath,
  };
  const contents: Record<string, string | undefined> = {};

  for (const [name, filePath] of Object.entries(files)) {
    if (!existsSync(filePath)) {
      warnings.push(`${name} not found at ${filePath}`);
    } else {
      contents[name] = readFileSync(filePath, 'utf8');
    }
  }

  // Cross-reference stories
  if (contents.prd) {
    const prdStories = extractStoryIds(contents.prd);

    if (contents.architecture) {
      const archStories = extractStoryIds(contents.architecture);
      for (const story of prdStories) {
        if (!archStories.includes(story)) {
          drifts.push({
            type: 'missing_reference',
            source: 'prd.md',
            target: 'architecture.md',
            detail: `Story ${story} from PRD not referenced in Architecture Document`,
          });
        }
      }
    }

    if (contents.plan) {
      const planStories = extractStoryIds(contents.plan);
      for (const story of prdStories) {
        if (!planStories.includes(story)) {
          drifts.push({
            type: 'missing_reference',
            source: 'prd.md',
            target: 'implementation-plan.md',
            detail: `Story ${story} from PRD not referenced in Implementation Plan`,
          });
        }
      }
    }
  }

  // Cross-reference components
  if (contents.architecture && contents.plan) {
    const archComponents = extractComponents(contents.architecture);
    for (const component of archComponents) {
      if (!contents.plan.includes(component)) {
        drifts.push({
          type: 'missing_reference',
          source: 'architecture.md',
          target: 'implementation-plan.md',
          detail: `Component "${component}" from Architecture not referenced in Implementation Plan`,
        });
      }
    }
  }

  // Orphan-task warnings
  if (contents.plan) {
    const taskBlocks =
      contents.plan.match(
        /### Task (M\d+-T\d+)[\s\S]*?(?=### Task|### Milestone|## Milestone|---\s*\n## |$)/g
      ) || [];
    for (const block of taskBlocks) {
      const taskIdMatch = block.match(/### Task (M\d+-T\d+)/);
      const storyRefMatch = block.match(/\*\*Story Reference\*\*\s*\|\s*(\S+)/);
      if (taskIdMatch && storyRefMatch) {
        const storyRef = storyRefMatch[1];
        if (storyRef === 'None' || storyRef === '[PRD' || storyRef === '-') {
          warnings.push(`Task ${taskIdMatch[1]} has no story reference`);
        }
      }
    }
  }

  const summary =
    drifts.length === 0
      ? 'No spec drift detected.'
      : `Found ${drifts.length} drift(s) between specifications.`;

  return { drifts, warnings, summary };
}

/**
 * Resolve every `**Files** | <list>` row in the implementation plan
 * and report files that don't yet exist on disk. The legacy resolution
 * walks `path.resolve(sourceDir, '..', file)` — i.e. file paths in
 * the plan are project-root-relative, NOT relative to `sourceDir`.
 */
export function checkCodeTraceability(sourceDir: string, planPath: string): CodeTraceabilityReport {
  const unmapped: string[] = [];

  if (!existsSync(sourceDir) || !existsSync(planPath)) {
    return { unmapped, summary: 'Source or plan not found.' };
  }

  const planContent = readFileSync(planPath, 'utf8');
  const plannedFiles: string[] = [];

  const fileMatches = planContent.match(/\*\*Files\*\*\s*\|\s*(.+)/g) || [];
  for (const match of fileMatches) {
    const files = match
      .replace(/\*\*Files\*\*\s*\|\s*/, '')
      .split(',')
      .map((f) => f.trim());
    plannedFiles.push(...files);
  }

  for (const file of plannedFiles) {
    if (file && file !== '-' && file !== 'None') {
      const fullPath = path.resolve(sourceDir, '..', file);
      if (!existsSync(fullPath)) {
        unmapped.push(file);
      }
    }
  }

  const summary =
    unmapped.length === 0
      ? 'All planned files are present.'
      : `${unmapped.length} planned file(s) not yet created.`;

  return { unmapped, summary };
}
