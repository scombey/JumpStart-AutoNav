/**
 * test-regression.test.js — Layer 5: Golden Master Regression Tests
 * 
 * Tests that verify the structural diff and regression suite machinery
 * works correctly with golden master artifacts.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extractStructure, structuralDiff, computeSimilarityScore, loadGoldenMaster, runRegressionSuite } = require('../bin/lib/regression');

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const GOLDEN_MASTERS_DIR = path.join(__dirname, 'golden-masters');

// ─── Structure Extraction ────────────────────────────────────────────────────

describe('Structure Extraction', () => {
  it('extracts frontmatter fields', () => {
    const content = `---
id: test-doc
phase: 1
status: approved
---

# Document
`;
    const struct = extractStructure(content);
    expect(struct.frontmatter).not.toBeNull();
    expect(struct.frontmatter.id).toBe('test-doc');
    expect(struct.frontmatter.phase).toBe(1);
  });

  it('extracts section headings', () => {
    const content = `
## Section One
Content.

## Section Two
Content.

### Subsection A
Details.
`;
    const struct = extractStructure(content);
    expect(struct.sections).toContain('Section One');
    expect(struct.sections).toContain('Section Two');
    expect(struct.sections).toContain('Subsection A');
  });

  it('counts stories and components', () => {
    const content = `
#### E01-S01: Story One
#### E01-S02: Story Two
#### E02-S01: Story Three

### Component: API Server
### Component: Database
`;
    const struct = extractStructure(content);
    expect(struct.storyCount).toBe(3);
    expect(struct.componentCount).toBe(2);
  });

  it('counts tables and code blocks', () => {
    const content = `
| Col1 | Col2 |
|------|------|
| a    | b    |

\`\`\`js
console.log('hello');
\`\`\`
`;
    const struct = extractStructure(content);
    expect(struct.tables).toBeGreaterThan(0);
    expect(struct.codeBlocks).toBe(1);
  });
});

// ─── Structural Diff ─────────────────────────────────────────────────────────

describe('Structural Diff', () => {
  it('returns 100% similarity for identical documents', () => {
    const doc = `---
id: test
phase: 1
---

## Section A
Content.

## Section B
More content.
`;
    const diff = structuralDiff(doc, doc);
    expect(diff.similarity).toBe(100);
    expect(diff.differences).toHaveLength(0);
  });

  it('detects missing sections', () => {
    const expected = `## Section A\n\n## Section B\n\n## Section C\n`;
    const actual = `## Section A\n\n## Section B\n`;
    
    const diff = structuralDiff(actual, expected);
    expect(diff.similarity).toBeLessThan(100);
    expect(diff.differences.some(d => d.includes('Section C'))).toBe(true);
  });

  it('detects missing frontmatter fields', () => {
    const expected = `---\nid: test\nphase: 1\nstatus: approved\n---\n\n## Content\n`;
    const actual = `---\nid: test\n---\n\n## Content\n`;
    
    const diff = structuralDiff(actual, expected);
    expect(diff.differences.some(d => d.includes('phase'))).toBe(true);
  });

  it('allows ±20% variance on metrics', () => {
    // 3 stories expected, 3 actual (exact match)
    const expected = `#### E01-S01: A\n#### E01-S02: B\n#### E01-S03: C\n`;
    const actual = `#### E01-S01: A\n#### E01-S02: B\n#### E01-S03: C\n`;
    
    const diff = structuralDiff(actual, expected);
    expect(diff.matches.some(m => m.includes('storyCount'))).toBe(true);
  });
});

// ─── Similarity Score ────────────────────────────────────────────────────────

describe('Similarity Score', () => {
  it('returns 100 for identical content', () => {
    const content = `---\nid: x\n---\n\n## A\n\n## B\n`;
    expect(computeSimilarityScore(content, content)).toBe(100);
  });

  it('returns less than 100 for different content', () => {
    const a = `---\nid: x\nphase: 1\n---\n\n## Section A\n\n## Section B\n`;
    const b = `---\nid: x\nphase: 1\n---\n\n## Section A\n\n## Section B\n\n## Section C\n`;
    
    const score = computeSimilarityScore(a, b);
    expect(score).toBeGreaterThan(50);  // Mostly similar
    expect(score).toBeLessThan(100);     // But not identical
  });
});

// ─── Golden Master Loading ───────────────────────────────────────────────────

describe('Golden Master Loading', () => {
  it('loads the todo-app golden master', () => {
    const master = loadGoldenMaster('todo-app', GOLDEN_MASTERS_DIR);
    expect(master.input).toContain('Challenger Brief');
    expect(master.expected).toContain('Product Brief');
  });

  it('throws for nonexistent golden master', () => {
    expect(() => loadGoldenMaster('nonexistent', GOLDEN_MASTERS_DIR))
      .toThrow('No golden master input found');
  });
});

// ─── Regression Suite ────────────────────────────────────────────────────────

describe('Regression Suite', () => {
  it('runs against golden masters directory', () => {
    const result = runRegressionSuite(GOLDEN_MASTERS_DIR);
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('pass');
  });

  it('passes for nonexistent directory', () => {
    const result = runRegressionSuite('/nonexistent/path');
    expect(result.pass).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it('respects threshold parameter', () => {
    const result = runRegressionSuite(GOLDEN_MASTERS_DIR, { threshold: 50 });
    // With a low threshold, golden masters comparing against themselves should pass
    expect(result.pass).toBe(true);
  });
});

// ─── Coverage Module ─────────────────────────────────────────────────────────

describe('Coverage Module', () => {
  const { extractStoryIds, extractTaskMappings, computeCoverage } = require('../bin/lib/coverage');

  it('extracts story IDs from PRD content', () => {
    const content = `
#### E01-S01: Create user
#### E01-S02: Delete user
#### E02-S01: List widgets
    `;
    const ids = extractStoryIds(content);
    expect(ids).toContain('E01-S01');
    expect(ids).toContain('E01-S02');
    expect(ids).toContain('E02-S01');
    expect(ids).toHaveLength(3);
  });

  it('extracts task mappings with story references', () => {
    const content = `
M1-T01: Implement user registration (E01-S01)
M1-T02: Implement user login (E01-S02)
M2-T01: Build widget list (E02-S01)
    `;
    const mappings = extractTaskMappings(content);
    expect(mappings.size).toBe(3);
    expect(mappings.get('M1-T01')).toContain('E01-S01');
  });

  it('computes coverage between PRD and plan', () => {
    const fixturesDir = path.join(__dirname, 'fixtures', 'valid');
    const prdPath = path.join(fixturesDir, 'prd.md');
    
    // Create a temporary plan that references the PRD stories
    const prdContent = fs.readFileSync(prdPath, 'utf8');
    const storyIds = extractStoryIds(prdContent);
    
    // Build a fake plan referencing all stories
    let planContent = '# Implementation Plan\n\n';
    storyIds.forEach((id, i) => {
      planContent += `M1-T0${i + 1}: Implement ${id}\n`;
    });
    
    const tmpPlanPath = path.join(__dirname, 'tmp-coverage-plan.md');
    fs.writeFileSync(tmpPlanPath, planContent);
    
    try {
      const result = computeCoverage(prdPath, tmpPlanPath);
      expect(result.coverage_pct).toBe(100);
      expect(result.uncovered).toHaveLength(0);
    } finally {
      fs.unlinkSync(tmpPlanPath);
    }
  });

  it('throws for missing PRD', () => {
    expect(() => computeCoverage('/nonexistent.md', '/also-missing.md'))
      .toThrow('PRD not found');
  });
});
