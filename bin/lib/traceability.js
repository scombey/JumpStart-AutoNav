/**
 * traceability.js — Constraint Tracking & Traceability Matrix (Items 54/59)
 *
 * Builds a traceability chain from validation criteria through
 * stories, tasks, and tests. Also maps NFRs to architecture components.
 *
 * Usage:
 *   echo '{"root":".","action":"trace"}' | node bin/lib/traceability.js
 *   echo '{"root":".","action":"nfr-map"}' | node bin/lib/traceability.js
 *
 * Input (stdin JSON):
 *   action: "trace" | "nfr-map" | "coverage"
 *   root: project root path
 *
 * Output (stdout JSON):
 *   {
 *     "chains": [...],
 *     "coverage": { "stories_to_tasks": N%, ... },
 *     "gaps": [...]
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Extract story IDs from content.
 * Matches patterns like E1-S1, E2-S3, etc.
 *
 * @param {string} content - File content.
 * @returns {string[]}
 */
function extractStories(content) {
  const matches = content.match(/E\d+-S\d+/g);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract task IDs from content.
 * Matches patterns like M1-T01, T001, etc.
 *
 * @param {string} content - File content.
 * @returns {string[]}
 */
function extractTasks(content) {
  const patterns = [/M\d+-T\d+/g, /T\d{3}/g];
  const all = [];
  for (const pat of patterns) {
    const matches = content.match(pat);
    if (matches) all.push(...matches);
  }
  return [...new Set(all)];
}

/**
 * Extract NFR IDs from content.
 * Matches patterns like NFR-P01, NFR-S02, etc.
 *
 * @param {string} content - File content.
 * @returns {string[]}
 */
function extractNFRs(content) {
  const matches = content.match(/NFR-[A-Z]+\d+/g);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract validation criteria IDs.
 * Matches patterns like VC-01, VC-02, etc.
 *
 * @param {string} content - File content.
 * @returns {string[]}
 */
function extractValidationCriteria(content) {
  const matches = content.match(/VC-\d+/g);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Read a spec file safely.
 *
 * @param {string} filePath - Path to file.
 * @returns {string} File content or empty string.
 */
function readSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return '';
  }
}

/**
 * Build the full traceability chain.
 *
 * @param {string} root - Project root.
 * @returns {object} Traceability analysis result.
 */
function buildTraceabilityChain(root) {
  const specsDir = path.join(root, 'specs');

  const briefContent = readSafe(path.join(specsDir, 'challenger-brief.md'));
  const productContent = readSafe(path.join(specsDir, 'product-brief.md'));
  const prdContent = readSafe(path.join(specsDir, 'prd.md'));
  const archContent = readSafe(path.join(specsDir, 'architecture.md'));
  const implContent = readSafe(path.join(specsDir, 'implementation-plan.md'));

  // Extract IDs from each phase
  const validationCriteria = extractValidationCriteria(briefContent);
  const stories = extractStories(prdContent);
  const tasks = extractTasks(implContent);
  const nfrs = extractNFRs(prdContent);

  // Try to find test files and extract references
  const testDir = path.join(root, 'tests');
  const testStories = new Set();
  const testTasks = new Set();

  if (fs.existsSync(testDir)) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.test.js') || entry.name.endsWith('.spec.js') ||
                   entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) {
          const content = readSafe(full);
          extractStories(content).forEach(s => testStories.add(s));
          extractTasks(content).forEach(t => testTasks.add(t));
        }
      }
    };
    walk(testDir);
  }

  // Build chains
  const chains = stories.map(storyId => {
    const relatedTasks = tasks.filter(t => {
      // Check if the implementation plan links this task to this story
      // Simple heuristic: find task and story on nearby lines
      const lines = implContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(t)) {
          // Check surrounding lines for story reference
          const context = lines.slice(Math.max(0, i - 5), i + 5).join('\n');
          if (context.includes(storyId)) return true;
        }
      }
      return false;
    });

    return {
      story: storyId,
      tasks: relatedTasks,
      has_tests: testStories.has(storyId),
      coverage: relatedTasks.length > 0 ? 'partial' : 'gap'
    };
  });

  // Coverage summary
  const storiesWithTasks = chains.filter(c => c.tasks.length > 0).length;
  const storiesWithTests = chains.filter(c => c.has_tests).length;

  const coverage = {
    total_stories: stories.length,
    stories_with_tasks: storiesWithTasks,
    stories_with_tests: storiesWithTests,
    stories_to_tasks_pct: stories.length > 0 ? Math.round((storiesWithTasks / stories.length) * 100) : 0,
    stories_to_tests_pct: stories.length > 0 ? Math.round((storiesWithTests / stories.length) * 100) : 0,
    total_tasks: tasks.length,
    total_nfrs: nfrs.length
  };

  // Identify gaps
  const gaps = [];
  for (const chain of chains) {
    if (chain.tasks.length === 0) {
      gaps.push({ type: 'story_without_tasks', id: chain.story });
    }
    if (!chain.has_tests) {
      gaps.push({ type: 'story_without_tests', id: chain.story });
    }
  }

  return { chains, coverage, gaps };
}

/**
 * Build NFR-to-architecture mapping.
 *
 * @param {string} root - Project root.
 * @returns {object} NFR mapping result.
 */
function buildNFRMap(root) {
  const specsDir = path.join(root, 'specs');
  const prdContent = readSafe(path.join(specsDir, 'prd.md'));
  const archContent = readSafe(path.join(specsDir, 'architecture.md'));
  const implContent = readSafe(path.join(specsDir, 'implementation-plan.md'));

  const nfrs = extractNFRs(prdContent);
  const tasks = extractTasks(implContent);

  const mapping = nfrs.map(nfr => {
    // Check if NFR is referenced in architecture
    const inArch = archContent.includes(nfr);
    // Check if NFR is referenced in implementation plan
    const inImpl = implContent.includes(nfr);

    return {
      nfr,
      in_architecture: inArch,
      in_implementation: inImpl,
      status: inArch && inImpl ? 'fully_mapped' : inArch ? 'partial_arch' : inImpl ? 'partial_impl' : 'unmapped'
    };
  });

  const summary = {
    total: nfrs.length,
    fully_mapped: mapping.filter(m => m.status === 'fully_mapped').length,
    partial: mapping.filter(m => m.status.startsWith('partial')).length,
    unmapped: mapping.filter(m => m.status === 'unmapped').length
  };

  return { mapping, summary };
}

// --- CLI entry point ---
if (process.argv[1] && process.argv[1].endsWith('traceability.js')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const opts = JSON.parse(input || '{}');
      const root = opts.root || '.';
      const action = opts.action || 'trace';

      let result;
      switch (action) {
        case 'nfr-map':
          result = buildNFRMap(root);
          break;
        case 'coverage':
          result = buildTraceabilityChain(root).coverage;
          break;
        case 'trace':
        default:
          result = buildTraceabilityChain(root);
          break;
      }

      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });
}

export {
  extractStories,
  extractTasks,
  extractNFRs,
  extractValidationCriteria,
  buildTraceabilityChain,
  buildNFRMap
};
