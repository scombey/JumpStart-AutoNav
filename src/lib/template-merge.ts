/**
 * template-merge.ts — Template Inheritance System port (M11 batch 3).
 *
 * Pure-library port of `bin/lib/template-merge.mjs` (ESM legacy). Public
 * surface preserved verbatim by name + signature:
 *
 *   - `parseSections(content)` => ParsedSections
 *   - `mergeTemplates(baseContent, projectContent, options?)` => MergeResult
 *   - `mergeTemplateFiles(basePath, projectPath, options?)` => MergeResult
 *
 * Behavior parity:
 *   - H2 (`## Header`)-based section keying. Project sections win over
 *     base sections on conflict (default `strategy: 'project-wins'`).
 *   - Frontmatter (YAML between `---` fences) preserved from project
 *     when present, else base.
 *   - Preamble (content above first H2) preserved from project when
 *     present, else base.
 *   - `mergeTemplateFiles` returns the lone file's content if only one
 *     side exists; empty merged + zeroed stats if neither exists.
 *
 * Path-safety: `mergeTemplateFiles` does not call `assertInsideRoot`
 * directly — its callers (cluster wiring) gate paths through
 * `assertUserPath` before invoking. The library remains a pure helper.
 *
 * @see bin/lib/template-merge.mjs (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, readFileSync } from 'node:fs';

export interface ParsedSections {
  frontmatter: string | null;
  preamble: string;
  sections: Map<string, string>;
}

export interface MergeStats {
  base_only: number;
  project_only: number;
  overridden: number;
  total: number;
}

export interface MergeResult {
  merged: string;
  stats: MergeStats;
}

export interface MergeOptions {
  strategy?: 'project-wins' | 'base-wins' | undefined;
}

/**
 * Parse a markdown document into sections keyed by H2 headers.
 *
 * Frontmatter detection requires the document to start with a `---`
 * fence on line 0. Anything between H1 (or other content) and the
 * first H2 is preserved as `preamble`.
 *
 * Returns a Map (insertion-ordered) so reconstruction preserves
 * section order from the source document — important for human-readable
 * output diffs.
 */
export function parseSections(content: string): ParsedSections {
  const lines = content.split('\n');
  let frontmatter: string | null = null;
  let preamble = '';
  const sections = new Map<string, string>();

  let currentSection: string | null = null;
  let currentContent: string[] = [];
  let inFrontmatter = false;
  const frontmatterLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue; // defensive (noUncheckedIndexedAccess-friendly)

    // Track frontmatter
    if (i === 0 && line.trim() === '---') {
      inFrontmatter = true;
      frontmatterLines.push(line);
      continue;
    }
    if (inFrontmatter) {
      frontmatterLines.push(line);
      if (line.trim() === '---') {
        frontmatter = frontmatterLines.join('\n');
        inFrontmatter = false;
      }
      continue;
    }

    // Detect H2 sections
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      // Save previous section
      if (currentSection) {
        sections.set(currentSection, currentContent.join('\n'));
      } else if (currentContent.length > 0) {
        preamble = currentContent.join('\n');
      }
      currentSection = (h2Match[1] ?? '').trim();
      currentContent = [line];
      continue;
    }

    currentContent.push(line);
  }

  // Save last section
  if (currentSection) {
    sections.set(currentSection, currentContent.join('\n'));
  } else if (currentContent.length > 0) {
    preamble += (preamble ? '\n' : '') + currentContent.join('\n');
  }

  return { frontmatter, preamble, sections };
}

/**
 * Merge a base template with project overrides. Project sections win
 * on conflict by default (`strategy: 'project-wins'`); base sections
 * not present in project are kept; project-only sections are appended.
 *
 * Stats:
 *   - `base_only`: count of sections in base but not project
 *   - `project_only`: count of sections in project but not base
 *   - `overridden`: count of sections present in both (project won)
 *   - `total`: total sections in the merged output
 */
export function mergeTemplates(
  baseContent: string,
  projectContent: string,
  options: MergeOptions = {}
): MergeResult {
  const strategy = options.strategy ?? 'project-wins';

  const base = parseSections(baseContent);
  const project = parseSections(projectContent);

  const stats: MergeStats = { base_only: 0, project_only: 0, overridden: 0, total: 0 };

  // Use project frontmatter if available, else base
  const frontmatter = project.frontmatter ?? base.frontmatter;
  const preamble = project.preamble || base.preamble;

  // Merge sections
  const mergedSections = new Map<string, string>();

  // Start with base sections
  for (const [key, value] of base.sections) {
    mergedSections.set(key, value);
  }

  // Override/add project sections
  for (const [key, value] of project.sections) {
    if (mergedSections.has(key)) {
      if (strategy === 'project-wins') {
        mergedSections.set(key, value);
        stats.overridden++;
      }
      // 'base-wins' would keep the base version
    } else {
      mergedSections.set(key, value);
      stats.project_only++;
    }
  }

  // Count base-only sections
  for (const key of base.sections.keys()) {
    if (!project.sections.has(key)) {
      stats.base_only++;
    }
  }

  stats.total = mergedSections.size;

  // Reconstruct document
  const parts: string[] = [];
  if (frontmatter) parts.push(frontmatter);
  if (preamble.trim()) parts.push(preamble);
  for (const [, value] of mergedSections) {
    parts.push(value);
  }

  return { merged: parts.join('\n\n'), stats };
}

/**
 * Merge template files from disk. Either side may be missing — the
 * non-empty side is returned verbatim if exactly one exists; empty
 * `merged` + zeroed stats if neither exists.
 */
export function mergeTemplateFiles(
  basePath: string,
  projectPath: string,
  options: MergeOptions = {}
): MergeResult {
  const baseContent = existsSync(basePath) ? readFileSync(basePath, 'utf8') : '';
  const projectContent = existsSync(projectPath) ? readFileSync(projectPath, 'utf8') : '';

  if (!baseContent && !projectContent) {
    return { merged: '', stats: { base_only: 0, project_only: 0, overridden: 0, total: 0 } };
  }

  if (!baseContent) {
    return {
      merged: projectContent,
      stats: { base_only: 0, project_only: 0, overridden: 0, total: 0 },
    };
  }
  if (!projectContent) {
    return {
      merged: baseContent,
      stats: { base_only: 0, project_only: 0, overridden: 0, total: 0 },
    };
  }

  return mergeTemplates(baseContent, projectContent, options);
}
