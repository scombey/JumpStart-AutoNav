/**
 * coverage.ts — Story-to-Task Coverage Validation (Item 67).
 *
 * Ensures 100% of PRD stories are mapped to at least one implementation task.
 * Reports coverage gaps.
 *
 * M3 hardening: no JSON state — pure text processing, no persist paths.
 * ADR-009: no user-supplied paths gated here (callers use assertInsideRoot before calling).
 * ADR-006: no process.exit — throws Error on unreadable files.
 */

import * as fs from 'fs';

/**
 * Extract all story IDs from a PRD document.
 * Matches patterns like E01-S01, E02-S03, etc.
 */
export function extractStoryIds(prdContent: string): string[] {
  const matches = prdContent.match(/\bE\d+-S\d+\b/g) ?? [];
  return Array.from(new Set(matches));
}

/**
 * Extract task-to-story mappings from an implementation plan.
 * Returns a map of task IDs to the story IDs they reference.
 */
export function extractTaskMappings(planContent: string): Map<string, string[]> {
  const mappings = new Map<string, string[]>();

  const taskPattern = /\b(M\d+-T\d+)\b/g;
  const tasks = Array.from(new Set(planContent.match(taskPattern) ?? []));

  for (const taskId of tasks) {
    const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const taskRegex = new RegExp(`${escaped}[\\s\\S]*?(?=M\\d+-T\\d+|$)`, 'g');
    const section = taskRegex.exec(planContent);
    if (section) {
      const storyRefs = section[0].match(/\bE\d+-S\d+\b/g) ?? [];
      mappings.set(taskId, Array.from(new Set(storyRefs)));
    } else {
      mappings.set(taskId, []);
    }
  }

  return mappings;
}

export interface CoverageResult {
  covered: string[];
  uncovered: string[];
  total_stories: number;
  total_tasks: number;
  coverage_pct: number;
}

/**
 * Compute coverage of PRD stories by implementation tasks.
 * Paths must be pre-validated by the caller (assertInsideRoot / assertUserPath).
 */
export function computeCoverage(prdPath: string, planPath: string): CoverageResult {
  if (!fs.existsSync(prdPath)) {
    throw new Error(`PRD not found: ${prdPath}`);
  }
  if (!fs.existsSync(planPath)) {
    throw new Error(`Implementation plan not found: ${planPath}`);
  }

  const prdContent = fs.readFileSync(prdPath, 'utf8');
  const planContent = fs.readFileSync(planPath, 'utf8');

  const storyIds = extractStoryIds(prdContent);
  const taskMappings = extractTaskMappings(planContent);

  const coveredStories = new Set<string>();
  taskMappings.forEach((stories) => {
    for (const storyId of stories) {
      coveredStories.add(storyId);
    }
  });

  const planStoryRefsArr = planContent.match(/\bE\d+-S\d+\b/g) ?? [];
  const planStoryRefs = new Set<string>(planStoryRefsArr);

  const covered = storyIds.filter(id => coveredStories.has(id) || planStoryRefs.has(id));
  const uncovered = storyIds.filter(id => !coveredStories.has(id) && !planStoryRefs.has(id));

  const totalStories = storyIds.length;
  const coveragePct = totalStories > 0 ? Math.round((covered.length / totalStories) * 100) : 100;

  return {
    covered,
    uncovered,
    total_stories: totalStories,
    total_tasks: taskMappings.size,
    coverage_pct: coveragePct
  };
}

/**
 * Generate a coverage report in markdown format.
 */
export function generateCoverageReport(prdPath: string, planPath: string): string {
  const result = computeCoverage(prdPath, planPath);

  let report = `# Coverage Report: PRD Stories -> Implementation Tasks\n\n`;
  report += `**Coverage:** ${result.coverage_pct}% (${result.covered.length}/${result.total_stories} stories)\n`;
  report += `**Total Tasks:** ${result.total_tasks}\n\n`;

  if (result.coverage_pct === 100) {
    report += 'All PRD stories are covered by implementation tasks.\n';
  } else {
    report += '## Uncovered Stories\n\n';
    report += 'The following PRD stories have no corresponding implementation tasks:\n\n';
    for (const id of result.uncovered) {
      report += `- ${id}\n`;
    }
    report += '\n## Covered Stories\n\n';
    for (const id of result.covered) {
      report += `- ${id}\n`;
    }
  }

  return report;
}
