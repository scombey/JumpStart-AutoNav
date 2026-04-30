/**
 * test-generator.ts — Test Generation Tied to Acceptance Criteria port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/test-generator.js` (CJS). Public surface:
 *   - `extractCriteria(content)` => Criterion[]
 *   - `generateTestStubs(criteria, options?)` => StubResult
 *   - `checkCoverage(root, options?)` => CoverageResult
 *   - `TEST_TYPES`
 *   - `TEST_FRAMEWORKS`
 *
 * M3 hardening: No JSON state paths. Not applicable.
 * Path-safety per ADR-009: `checkCoverage` uses project root from CLI wiring.
 *
 * @see bin/lib/test-generator.js (legacy reference)
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const TEST_TYPES = ['unit', 'integration', 'api', 'ui', 'contract', 'e2e'] as const;

export interface TestFrameworkConfig {
  framework: string;
  extension: string;
  import: string;
}

export const TEST_FRAMEWORKS: Record<string, TestFrameworkConfig> = {
  javascript: {
    framework: 'vitest',
    extension: '.test.js',
    import: "import { describe, it, expect } from 'vitest';",
  },
  typescript: {
    framework: 'vitest',
    extension: '.test.ts',
    import: "import { describe, it, expect } from 'vitest';",
  },
  python: {
    framework: 'pytest',
    extension: '_test.py',
    import: 'import pytest',
  },
};

export interface Criterion {
  story: string | null;
  criterion: string;
  type: 'given' | 'when' | 'then' | 'acceptance';
}

export function extractCriteria(content: string): Criterion[] {
  const criteria: Criterion[] = [];
  const lines = content.split('\n');
  let currentStory: string | null = null;

  for (const line of lines) {
    const storyMatch = line.match(/\*\*(E\d+-S\d+)\*\*/);
    if (storyMatch) currentStory = storyMatch[1] ?? null;

    const givenMatch = line.match(/^\s*[-*]\s*(Given\s+.+)/i);
    const whenMatch = line.match(/^\s*[-*]\s*(When\s+.+)/i);
    const thenMatch = line.match(/^\s*[-*]\s*(Then\s+.+)/i);
    const acMatch = line.match(/^\s*[-*]\s*AC\d*:\s*(.+)/i);

    const matched = givenMatch ?? whenMatch ?? thenMatch ?? acMatch;
    if (matched) {
      const criterion = matched[1];
      if (!criterion) continue;
      criteria.push({
        story: currentStory,
        criterion: criterion.trim(),
        type: givenMatch ? 'given' : whenMatch ? 'when' : thenMatch ? 'then' : 'acceptance',
      });
    }
  }

  return criteria;
}

export interface TestFileStub {
  fileName: string;
  content: string;
  story: string;
  test_count: number;
}

export interface StubResult {
  success: boolean;
  total_criteria?: number | undefined;
  test_files?: number | undefined;
  files?: TestFileStub[] | undefined;
  framework?: string | undefined;
  error?: string | undefined;
}

export function generateTestStubs(
  criteria: Criterion[],
  options: { language?: string | undefined } = {},
): StubResult {
  const language = options.language ?? 'javascript';
  const fwConfig = TEST_FRAMEWORKS[language];
  if (!fwConfig) {
    return { success: false, error: `Unsupported language: ${language}` };
  }

  const byStory: Record<string, Criterion[]> = {};
  for (const c of criteria) {
    const story = c.story ?? 'general';
    byStory[story] = byStory[story] ?? [];
    byStory[story]!.push(c);
  }

  const testFiles: TestFileStub[] = [];
  for (const [story, storyCriteria] of Object.entries(byStory)) {
    const fileName = `${story.toLowerCase().replace(/[^a-z0-9]/g, '-')}${fwConfig.extension}`;
    const tests = storyCriteria.map(c => {
      const testName = c.criterion.replace(/'/g, "\\'").substring(0, 100);
      return `  it('${testName}', () => {\n    // TODO: Implement test for ${c.type}\n    expect(true).toBe(true);\n  });`;
    });

    const fileContent = `${fwConfig.import}\n\ndescribe('${story}', () => {\n${tests.join('\n\n')}\n});\n`;
    testFiles.push({ fileName, content: fileContent, story, test_count: storyCriteria.length });
  }

  return {
    success: true,
    total_criteria: criteria.length,
    test_files: testFiles.length,
    files: testFiles,
    framework: fwConfig.framework,
  };
}

export interface CoverageResult {
  success: boolean;
  total_criteria?: number | undefined;
  covered?: number | undefined;
  coverage?: number | undefined;
  uncovered?: Criterion[] | undefined;
  error?: string | undefined;
}

export function checkCoverage(root: string, _options: Record<string, unknown> = {}): CoverageResult {
  const prdFile = join(root, 'specs', 'prd.md');
  if (!existsSync(prdFile)) {
    return { success: false, error: 'PRD not found at specs/prd.md' };
  }

  const prdContent = readFileSync(prdFile, 'utf8');
  const criteria = extractCriteria(prdContent);

  const testDir = join(root, 'tests');
  let testContent = '';
  if (existsSync(testDir)) {
    for (const entry of readdirSync(testDir)) {
      if (entry.endsWith('.test.js') || entry.endsWith('.test.ts')) {
        try {
          testContent += readFileSync(join(testDir, entry), 'utf8') + '\n';
        } catch { /* skip */ }
      }
    }
  }

  const covered = criteria.filter(c => {
    const terms = c.criterion.toLowerCase().split(/\s+/).filter(t => t.length > 3);
    return terms.some(t => testContent.toLowerCase().includes(t));
  });

  return {
    success: true,
    total_criteria: criteria.length,
    covered: covered.length,
    coverage: criteria.length > 0 ? Math.round((covered.length / criteria.length) * 100) : 0,
    uncovered: criteria.filter(c => !covered.includes(c)),
  };
}
