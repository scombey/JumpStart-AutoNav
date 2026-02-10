#!/usr/bin/env node

/**
 * coverage.js — Story-to-Task Coverage Validation
 * 
 * Part of Jump Start Framework (Item 67: Coverage Validation).
 * 
 * Ensures 100% of PRD stories are mapped to at least one
 * implementation task. Reports coverage gaps.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Extract all story IDs from a PRD document.
 * Matches patterns like E01-S01, E02-S03, etc.
 *
 * @param {string} prdContent - PRD markdown content.
 * @returns {string[]} Array of story IDs.
 */
function extractStoryIds(prdContent) {
  const matches = prdContent.match(/\bE\d+-S\d+\b/g) || [];
  return [...new Set(matches)];
}

/**
 * Extract task-to-story mappings from an implementation plan.
 * Returns a map of task IDs to the story IDs they reference.
 *
 * @param {string} planContent - Implementation plan markdown content.
 * @returns {Map<string, string[]>} Map of task ID → referenced story IDs.
 */
function extractTaskMappings(planContent) {
  const mappings = new Map();

  // Find all task IDs
  const taskPattern = /\b(M\d+-T\d+)\b/g;
  const tasks = [...new Set((planContent.match(taskPattern) || []))];

  for (const taskId of tasks) {
    // Find the section for this task and extract story references
    const taskRegex = new RegExp(`${taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=M\\d+-T\\d+|$)`, 'g');
    const section = taskRegex.exec(planContent);
    if (section) {
      const storyRefs = section[0].match(/\bE\d+-S\d+\b/g) || [];
      mappings.set(taskId, [...new Set(storyRefs)]);
    } else {
      mappings.set(taskId, []);
    }
  }

  return mappings;
}

/**
 * Compute coverage of PRD stories by implementation tasks.
 *
 * @param {string} prdPath - Path to the PRD file.
 * @param {string} planPath - Path to the implementation plan file.
 * @returns {{ covered: string[], uncovered: string[], total_stories: number, total_tasks: number, coverage_pct: number }}
 */
function computeCoverage(prdPath, planPath) {
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

  // Find all stories referenced in any task
  const coveredStories = new Set();
  for (const [, stories] of taskMappings) {
    for (const storyId of stories) {
      coveredStories.add(storyId);
    }
  }

  // Also check for direct story mentions in plan (not just inside task sections)
  const planStoryRefs = new Set(planContent.match(/\bE\d+-S\d+\b/g) || []);

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
 *
 * @param {string} prdPath - Path to the PRD file.
 * @param {string} planPath - Path to the implementation plan file.
 * @returns {string} Markdown coverage report.
 */
function generateCoverageReport(prdPath, planPath) {
  const result = computeCoverage(prdPath, planPath);

  let report = `# Coverage Report: PRD Stories → Implementation Tasks\n\n`;
  report += `**Coverage:** ${result.coverage_pct}% (${result.covered.length}/${result.total_stories} stories)\n`;
  report += `**Total Tasks:** ${result.total_tasks}\n\n`;

  if (result.coverage_pct === 100) {
    report += '✅ All PRD stories are covered by implementation tasks.\n';
  } else {
    report += '## Uncovered Stories\n\n';
    report += 'The following PRD stories have no corresponding implementation tasks:\n\n';
    for (const id of result.uncovered) {
      report += `- ❌ ${id}\n`;
    }
    report += '\n## Covered Stories\n\n';
    for (const id of result.covered) {
      report += `- ✅ ${id}\n`;
    }
  }

  return report;
}

module.exports = {
  extractStoryIds,
  extractTaskMappings,
  computeCoverage,
  generateCoverageReport
};
