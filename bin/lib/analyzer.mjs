/**
 * analyzer.js — Consistency Analysis (Item 64)
 *
 * Detects mismatches between PRD, architecture, implementation plan,
 * and contracts. Reports contradictions and missing coverage.
 *
 * Usage:
 *   echo '{"specs_dir":"specs/"}' | node bin/lib/analyzer.js
 *
 * Input (stdin JSON):
 *   {
 *     "specs_dir": "specs/",
 *     "root": "."
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "contradictions": [...],
 *     "missing_coverage": [...],
 *     "terminology_drift": [...],
 *     "score": 85,
 *     "pass": true
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Extract defined terms from a markdown document.
 * Looks for bold terms, heading terms, and table first-column terms.
 *
 * @param {string} content - Markdown content.
 * @returns {Map<string, string>} Map of lowercase term → original term.
 */
function extractTerms(content) {
  const terms = new Map();

  // Bold terms: **Term**
  const boldRegex = /\*\*([A-Z][a-zA-Z\s]+)\*\*/g;
  let match;
  while ((match = boldRegex.exec(content)) !== null) {
    const term = match[1].trim();
    if (term.length > 2 && term.length < 50) {
      terms.set(term.toLowerCase(), term);
    }
  }

  // Heading terms
  const headingRegex = /^#{1,4}\s+(?:.*?:\s*)?(.+)$/gm;
  while ((match = headingRegex.exec(content)) !== null) {
    const term = match[1].trim();
    if (term.length > 2 && term.length < 60) {
      terms.set(term.toLowerCase(), term);
    }
  }

  return terms;
}

/**
 * Extract story IDs from content (pattern: E##-S##).
 *
 * @param {string} content - Markdown content.
 * @returns {string[]} Array of story IDs.
 */
function extractStoryIds(content) {
  const matches = content.match(/\bE\d+-S\d+\b/g) || [];
  return [...new Set(matches)];
}

/**
 * Extract task IDs from content (pattern: M##-T##).
 *
 * @param {string} content - Markdown content.
 * @returns {string[]} Array of task IDs.
 */
function extractTaskIds(content) {
  const matches = content.match(/\bM\d+-T\d+\b/g) || [];
  return [...new Set(matches)];
}

/**
 * Extract NFR IDs from content (pattern: NFR-XXX-##).
 *
 * @param {string} content - Markdown content.
 * @returns {string[]} Array of NFR IDs.
 */
function extractNfrIds(content) {
  const matches = content.match(/\bNFR-[A-Z]+-\d+\b/g) || [];
  return [...new Set(matches)];
}

/**
 * Read a file safely — returns empty string if file doesn't exist.
 *
 * @param {string} filePath - Path to file.
 * @returns {string} File content or empty string.
 */
function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Run consistency analysis across spec artifacts.
 *
 * @param {object} input - Analysis options.
 * @param {string} input.specs_dir - Path to specs directory.
 * @param {string} [input.root] - Project root.
 * @returns {object} Analysis results.
 */
function analyze(input) {
  const { specs_dir = 'specs/', root = '.' } = input;
  const specsPath = path.resolve(root, specs_dir);

  const artifacts = {
    prd: safeRead(path.join(specsPath, 'prd.md')),
    architecture: safeRead(path.join(specsPath, 'architecture.md')),
    plan: safeRead(path.join(specsPath, 'implementation-plan.md')),
    contracts: safeRead(path.join(specsPath, 'contracts.md')),
    dataModel: safeRead(path.join(specsPath, 'data-model.md')),
    brief: safeRead(path.join(specsPath, 'product-brief.md')),
    challenger: safeRead(path.join(specsPath, 'challenger-brief.md'))
  };

  const contradictions = [];
  const missingCoverage = [];
  const terminologyDrift = [];
  let artifactCount = 0;

  // Count present artifacts
  for (const [, content] of Object.entries(artifacts)) {
    if (content.trim()) artifactCount++;
  }

  // 1. Story coverage: PRD stories must appear in plan
  if (artifacts.prd && artifacts.plan) {
    const prdStories = extractStoryIds(artifacts.prd);
    const planStories = extractStoryIds(artifacts.plan);

    for (const story of prdStories) {
      if (!planStories.includes(story)) {
        missingCoverage.push({
          source: 'prd.md',
          id: story,
          missing_from: 'implementation-plan.md',
          type: 'story_not_in_plan'
        });
      }
    }
  }

  // 2. Story coverage: PRD stories should appear in architecture
  if (artifacts.prd && artifacts.architecture) {
    const prdStories = extractStoryIds(artifacts.prd);
    const archStories = extractStoryIds(artifacts.architecture);

    for (const story of prdStories) {
      if (!archStories.includes(story)) {
        missingCoverage.push({
          source: 'prd.md',
          id: story,
          missing_from: 'architecture.md',
          type: 'story_not_in_architecture'
        });
      }
    }
  }

  // 3. Task coverage: plan tasks should reference stories
  if (artifacts.plan && artifacts.prd) {
    const planTasks = extractTaskIds(artifacts.plan);
    const prdStories = extractStoryIds(artifacts.prd);

    for (const task of planTasks) {
      // Find the line containing this task and check for story references
      const taskLines = artifacts.plan.split('\n').filter(l => l.includes(task));
      const hasStory = taskLines.some(l => prdStories.some(s => l.includes(s)));
      if (!hasStory) {
        missingCoverage.push({
          source: 'implementation-plan.md',
          id: task,
          missing_from: 'prd.md',
          type: 'orphan_task'
        });
      }
    }
  }

  // 4. NFR coverage: PRD NFRs should appear in architecture
  if (artifacts.prd && artifacts.architecture) {
    const prdNfrs = extractNfrIds(artifacts.prd);
    const archNfrs = extractNfrIds(artifacts.architecture);

    for (const nfr of prdNfrs) {
      if (!archNfrs.includes(nfr)) {
        missingCoverage.push({
          source: 'prd.md',
          id: nfr,
          missing_from: 'architecture.md',
          type: 'nfr_not_in_architecture'
        });
      }
    }
  }

  // 5. Terminology drift: compare terms across artifacts
  const termSources = {
    'prd.md': artifacts.prd,
    'architecture.md': artifacts.architecture,
    'product-brief.md': artifacts.brief
  };

  const allTermsBySource = {};
  for (const [name, content] of Object.entries(termSources)) {
    if (content) {
      allTermsBySource[name] = extractTerms(content);
    }
  }

  // Simple drift detection: find terms that appear in only one artifact
  // but have similar terms in others (basic Levenshtein check is too expensive,
  // so we look for substring relationships)
  const sourceNames = Object.keys(allTermsBySource);
  if (sourceNames.length >= 2) {
    for (let i = 0; i < sourceNames.length; i++) {
      const srcA = sourceNames[i];
      const termsA = allTermsBySource[srcA];
      for (const [keyA, termA] of termsA) {
        for (let j = i + 1; j < sourceNames.length; j++) {
          const srcB = sourceNames[j];
          const termsB = allTermsBySource[srcB];
          // Look for near-matches (one contains the other, or differs by common suffixes)
          for (const [keyB, termB] of termsB) {
            if (keyA !== keyB &&
              keyA.length > 4 && keyB.length > 4 &&
              (keyA.includes(keyB) || keyB.includes(keyA)) &&
              Math.abs(keyA.length - keyB.length) <= 5) {
              terminologyDrift.push({
                term_a: termA,
                source_a: srcA,
                term_b: termB,
                source_b: srcB
              });
            }
          }
        }
      }
    }
  }

  // 6. Contract-data model alignment
  if (artifacts.contracts && artifacts.dataModel) {
    // Check that entity names in data model appear in contracts
    const entityRegex = /###\s+Entity:\s+(\w+)/g;
    const entities = [];
    let m;
    while ((m = entityRegex.exec(artifacts.dataModel)) !== null) {
      entities.push(m[1]);
    }

    for (const entity of entities) {
      if (!artifacts.contracts.toLowerCase().includes(entity.toLowerCase())) {
        contradictions.push({
          artifact_a: 'data-model.md',
          artifact_b: 'contracts.md',
          description: `Entity "${entity}" defined in data model but not referenced in contracts`,
          severity: 'major'
        });
      }
    }
  }

  // Score calculation
  const totalChecks = Math.max(1,
    missingCoverage.length + contradictions.length + terminologyDrift.length + artifactCount);
  const issues = missingCoverage.length + contradictions.length + terminologyDrift.length;
  const score = Math.max(0, Math.round(((totalChecks - issues) / totalChecks) * 100));

  return {
    artifacts_analyzed: artifactCount,
    contradictions,
    missing_coverage: missingCoverage,
    terminology_drift: terminologyDrift,
    score,
    pass: score >= 70
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (process.argv[1] && (
  process.argv[1].endsWith('analyzer.mjs') ||
  process.argv[1].endsWith('analyzer')
)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const parsed = input.trim() ? JSON.parse(input) : {};
      const result = analyze(parsed);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.pass ? 0 : 1);
    } catch (err) {
      process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });

  if (process.stdin.isTTY) {
    const result = analyze({});
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.pass ? 0 : 1);
  }
}

export { analyze, extractTerms, extractStoryIds, extractTaskIds, extractNfrIds };
