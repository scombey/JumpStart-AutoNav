/**
 * uat-coverage.ts -- Automated User Acceptance Testing (UAT) Alignment.
 *
 * Extends coverage.ts to verify that PRD acceptance criteria (Gherkin-style
 * Given/When/Then or plain-text AC) are actually covered by the generated
 * test suite.
 *
 * M3 hardening: no JSON state -- pure text processing.
 * ADR-009: prdPath/testDir must be pre-validated by caller.
 * ADR-006: no process.exit.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface StoryAC {
  story_id: string;
  criteria: string[];
  gherkin: string[];
}

export interface StoryCoverageEntry {
  files: string[];
  keywords: string[];
}

export interface CriterionResult {
  story_id: string;
  criterion: string;
  covered: boolean;
  test_files: string[];
}

export interface StoryDetail {
  story_id: string;
  criteria_count: number;
  test_files: string[];
}

export interface UATCoverageResult {
  total_stories: number;
  covered_stories: number;
  story_coverage_pct: number;
  total_criteria: number;
  covered_criteria: number;
  criteria_coverage_pct: number;
  story_details: StoryDetail[];
  criteria_details: CriterionResult[];
  pass: boolean;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const TEST_PATTERNS = ['.test.', '.spec.', '_test.', '_spec.', '.feature'];

function walkTestFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string): void {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          walk(fullPath);
        }
      } else {
        const isTestFile = TEST_PATTERNS.some(p => entry.name.includes(p));
        if (isTestFile) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

export { walkTestFiles };

// ─── extractAcceptanceCriteria ───────────────────────────────────────────────

/**
 * Extract acceptance criteria from a PRD document.
 */
export function extractAcceptanceCriteria(prdContent: string): StoryAC[] {
  const stories: StoryAC[] = [];
  const storyPattern = /\b(E\d+-S\d+)\b/g;
  const storyIds = Array.from(new Set(prdContent.match(storyPattern) ?? []));

  for (const storyId of storyIds) {
    const escapedId = storyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionRegex = new RegExp(
      `${escapedId}[\\s\\S]*?(?=E\\d+-S\\d+|## |$)`,
      'g'
    );
    const section = sectionRegex.exec(prdContent);

    if (!section) {
      stories.push({ story_id: storyId, criteria: [], gherkin: [] });
      continue;
    }

    const sectionText = section[0];

    // Extract Gherkin blocks
    const gherkinLines: string[] = [];
    const gherkinPattern = /^\s*(Given|When|Then|And|But)\s+(.+)/gm;
    let gherkinMatch: RegExpExecArray | null;
    while ((gherkinMatch = gherkinPattern.exec(sectionText)) !== null) {
      gherkinLines.push(`${gherkinMatch[1] ?? ''} ${(gherkinMatch[2] ?? '').trim()}`);
    }

    // Extract bullet-point acceptance criteria
    const criteria: string[] = [];
    const acSection = sectionText.match(
      /(?:acceptance\s+criteria|AC|criteria)[:\s]*\n([\s\S]*?)(?=\n(?:#{1,3}\s|\n\n)|$)/i
    );

    if (acSection) {
      const bulletPattern = /^\s*[-*]\s+(.+)/gm;
      let bulletMatch: RegExpExecArray | null;
      while ((bulletMatch = bulletPattern.exec(acSection[1] ?? '')) !== null) {
        criteria.push((bulletMatch[1] ?? '').trim());
      }
    }

    if (criteria.length === 0) {
      const bulletPattern = /^\s*[-*]\s+(.+)/gm;
      let bulletMatch: RegExpExecArray | null;
      while ((bulletMatch = bulletPattern.exec(sectionText)) !== null) {
        const text = (bulletMatch[1] ?? '').trim();
        if (text.length > 10 && !text.startsWith('#') && !text.startsWith('|')) {
          criteria.push(text);
        }
      }
    }

    stories.push({ story_id: storyId, criteria, gherkin: gherkinLines });
  }

  return stories;
}

// ─── scanTestCoverage ─────────────────────────────────────────────────────────

/**
 * Scan test files for references to story IDs.
 */
export function scanTestCoverage(testDir: string, storyIds: string[]): Map<string, StoryCoverageEntry> {
  const coverage = new Map<string, StoryCoverageEntry>();
  for (const id of storyIds) {
    coverage.set(id, { files: [], keywords: [] });
  }

  if (!fs.existsSync(testDir)) {
    return coverage;
  }

  const testFiles = walkTestFiles(testDir);

  for (const testFile of testFiles) {
    let content: string;
    try {
      content = fs.readFileSync(testFile, 'utf8');
    } catch {
      continue;
    }

    for (const storyId of storyIds) {
      const entry = coverage.get(storyId);
      if (!entry) continue;

      if (content.includes(storyId)) {
        entry.files.push(path.relative(testDir, testFile));
      }

      const escapedId = storyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const testBlockPattern = new RegExp(
        `(?:describe|it|test)\\s*\\(\\s*['"\`].*${escapedId}.*['"\`]`,
        'i'
      );
      if (testBlockPattern.test(content)) {
        const relFile = path.relative(testDir, testFile);
        if (!entry.files.includes(relFile)) {
          entry.files.push(relFile);
        }
      }
    }
  }

  return coverage;
}

// ─── extractKeywords ─────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could', 'and', 'but', 'or',
  'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
  'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
  'such', 'than', 'too', 'very', 'just', 'that', 'this', 'these',
  'those', 'with', 'from', 'into', 'for', 'about', 'given', 'when',
  'then', 'user', 'system'
]);

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
}

// ─── matchCriteriaToTests ────────────────────────────────────────────────────

export function matchCriteriaToTests(storyCriteria: StoryAC[], testDir: string): CriterionResult[] {
  const results: CriterionResult[] = [];

  if (!fs.existsSync(testDir)) {
    for (const story of storyCriteria) {
      const allCriteria = [...story.criteria, ...story.gherkin];
      for (const criterion of allCriteria) {
        results.push({ story_id: story.story_id, criterion, covered: false, test_files: [] });
      }
    }
    return results;
  }

  const testFiles = walkTestFiles(testDir);
  const testContents = new Map<string, string>();
  for (const file of testFiles) {
    try {
      testContents.set(file, fs.readFileSync(file, 'utf8').toLowerCase());
    } catch {
      // skip
    }
  }

  for (const story of storyCriteria) {
    const allCriteria = [...story.criteria, ...story.gherkin];

    for (const criterion of allCriteria) {
      const keywords = extractKeywords(criterion);
      const matchingFiles: string[] = [];

      testContents.forEach((content, file) => {
        const hasStoryRef = content.includes(story.story_id.toLowerCase());

        const keywordHits = keywords.filter(k => content.includes(k.toLowerCase()));
        const keywordCoverage = keywords.length > 0
          ? keywordHits.length / keywords.length
          : 0;

        if (hasStoryRef || keywordCoverage >= 0.5) {
          matchingFiles.push(path.relative(testDir, file));
        }
      });

      results.push({
        story_id: story.story_id,
        criterion,
        covered: matchingFiles.length > 0,
        test_files: Array.from(new Set(matchingFiles))
      });
    }
  }

  return results;
}

// ─── computeUATCoverage ──────────────────────────────────────────────────────

export function computeUATCoverage(prdPath: string, testDir: string): UATCoverageResult {
  if (!fs.existsSync(prdPath)) {
    throw new Error(`PRD not found: ${prdPath}`);
  }

  const prdContent = fs.readFileSync(prdPath, 'utf8');
  const storyCriteria = extractAcceptanceCriteria(prdContent);
  const storyIds = storyCriteria.map(s => s.story_id);

  const storyCoverage = scanTestCoverage(testDir, storyIds);
  const criteriaResults = matchCriteriaToTests(storyCriteria, testDir);

  const totalCriteria = criteriaResults.length;
  const coveredCriteria = criteriaResults.filter(r => r.covered).length;
  const criteriaCoveragePct = totalCriteria > 0
    ? Math.round((coveredCriteria / totalCriteria) * 100)
    : 100;

  const totalStories = storyIds.length;
  const coveredStories = storyIds.filter(id => {
    const entry = storyCoverage.get(id);
    return entry && entry.files.length > 0;
  });
  const storyCoveragePct = totalStories > 0
    ? Math.round((coveredStories.length / totalStories) * 100)
    : 100;

  return {
    total_stories: totalStories,
    covered_stories: coveredStories.length,
    story_coverage_pct: storyCoveragePct,
    total_criteria: totalCriteria,
    covered_criteria: coveredCriteria,
    criteria_coverage_pct: criteriaCoveragePct,
    story_details: storyCriteria.map(s => ({
      story_id: s.story_id,
      criteria_count: s.criteria.length + s.gherkin.length,
      test_files: (storyCoverage.get(s.story_id) ?? { files: [] }).files
    })),
    criteria_details: criteriaResults,
    pass: criteriaCoveragePct >= 80
  };
}

// ─── generateUATReport ───────────────────────────────────────────────────────

export function generateUATReport(prdPath: string, testDir: string): string {
  const result = computeUATCoverage(prdPath, testDir);

  let report = `# UAT Coverage Report: Acceptance Criteria -> Tests\n\n`;
  report += `**Story Coverage:** ${result.story_coverage_pct}% (${result.covered_stories}/${result.total_stories} stories)\n`;
  report += `**Criteria Coverage:** ${result.criteria_coverage_pct}% (${result.covered_criteria}/${result.total_criteria} criteria)\n`;
  report += `**Status:** ${result.pass ? 'PASS' : 'FAIL'} (threshold: 80%)\n\n`;

  report += `## Story Summary\n\n`;
  report += `| Story | Criteria | Test Files | Status |\n`;
  report += `|-------|----------|------------|--------|\n`;

  for (const story of result.story_details) {
    const status = story.test_files.length > 0 ? 'PASS' : 'FAIL';
    const files = story.test_files.length > 0
      ? story.test_files.join(', ')
      : '_none_';
    report += `| ${story.story_id} | ${story.criteria_count} | ${files} | ${status} |\n`;
  }

  const uncovered = result.criteria_details.filter(c => !c.covered);
  if (uncovered.length > 0) {
    report += `\n## Uncovered Acceptance Criteria\n\n`;
    for (const item of uncovered) {
      report += `- **${item.story_id}**: ${item.criterion}\n`;
    }
  }

  const covered = result.criteria_details.filter(c => c.covered);
  if (covered.length > 0) {
    report += `\n## Covered Acceptance Criteria\n\n`;
    for (const item of covered) {
      report += `- **${item.story_id}**: ${item.criterion} -> ${item.test_files.join(', ')}\n`;
    }
  }

  return report;
}
