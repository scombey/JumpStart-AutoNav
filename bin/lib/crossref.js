/**
 * crossref.js — Bidirectional Cross-Reference Validation (Item 47)
 *
 * Validates that spec artifacts contain required cross-reference links
 * and that those links point to existing sections.
 *
 * Usage:
 *   echo '{"specs_dir":"specs/"}' | node bin/lib/crossref.js
 *
 * Input (stdin JSON):
 *   {
 *     "specs_dir": "specs/",
 *     "root": "."
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "total_links": 42,
 *     "valid_links": 38,
 *     "broken_links": [...],
 *     "orphan_sections": [...],
 *     "missing_backlinks": [...],
 *     "score": 90.5,
 *     "pass": true
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Extract markdown links from content.
 * Matches [text](target) and [text](target#anchor) patterns.
 *
 * @param {string} content - Markdown content.
 * @returns {Array<{text: string, target: string, anchor: string|null, line: number}>}
 */
function extractLinks(content) {
  const links = [];
  const lines = content.split('\n');
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  lines.forEach((line, idx) => {
    let match;
    while ((match = linkRegex.exec(line)) !== null) {
      const raw = match[2];
      // Skip external URLs and mailto
      if (/^https?:|^mailto:|^#/.test(raw)) continue;

      const parts = raw.split('#');
      links.push({
        text: match[1],
        target: parts[0],
        anchor: parts[1] || null,
        line: idx + 1
      });
    }
  });

  return links;
}

/**
 * Extract heading anchors from content (GitHub-style slugification).
 *
 * @param {string} content - Markdown content.
 * @returns {string[]} Array of anchor IDs.
 */
function extractAnchors(content) {
  const headingRegex = /^#+\s+(.+)$/gm;
  const anchors = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const slug = match[1]
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    anchors.push(slug);
  }

  return anchors;
}

/**
 * Validate cross-references across spec files.
 *
 * @param {string} specsDir - Path to specs directory.
 * @param {string} root - Project root path.
 * @returns {object} Validation results.
 */
function validateCrossRefs(specsDir, root) {
  const result = {
    total_links: 0,
    valid_links: 0,
    broken_links: [],
    orphan_sections: [],
    missing_backlinks: [],
    files_scanned: 0,
    score: 100,
    pass: true
  };

  // Collect all markdown files in specs
  const specFiles = [];
  const absSpecsDir = path.resolve(root, specsDir);

  if (!fs.existsSync(absSpecsDir)) {
    return { ...result, error: `Specs directory not found: ${absSpecsDir}` };
  }

  function collectFiles(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(full);
      } else if (entry.name.endsWith('.md')) {
        specFiles.push(full);
      }
    }
  }
  collectFiles(absSpecsDir);

  // Build file → anchors map
  const anchorMap = {};
  const contentMap = {};
  for (const file of specFiles) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    anchorMap[rel] = extractAnchors(content);
    contentMap[rel] = content;
  }

  // Build link graph: file → [links to other files]
  const linkGraph = {};

  for (const file of specFiles) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const content = contentMap[rel];
    const links = extractLinks(content);
    linkGraph[rel] = links;

    for (const link of links) {
      result.total_links++;

      // Resolve target relative to the source file's directory
      const sourceDir = path.dirname(rel);
      const resolvedTarget = path.posix.normalize(path.posix.join(sourceDir, link.target));

      // Check if target file exists
      const absTarget = path.resolve(root, resolvedTarget);
      if (!fs.existsSync(absTarget)) {
        result.broken_links.push({
          source: rel,
          line: link.line,
          target: link.target,
          reason: 'Target file not found'
        });
        continue;
      }

      // Check anchor if specified
      if (link.anchor) {
        const targetAnchors = anchorMap[resolvedTarget] || [];
        if (!targetAnchors.includes(link.anchor)) {
          result.broken_links.push({
            source: rel,
            line: link.line,
            target: `${link.target}#${link.anchor}`,
            reason: `Anchor not found: #${link.anchor}`
          });
          continue;
        }
      }

      result.valid_links++;
    }
  }

  // Check for missing backlinks (bidirectional requirement)
  const BIDIRECTIONAL_PAIRS = [
    ['specs/prd.md', 'specs/architecture.md'],
    ['specs/prd.md', 'specs/insights/prd-insights.md'],
    ['specs/architecture.md', 'specs/insights/architecture-insights.md'],
    ['specs/product-brief.md', 'specs/insights/product-brief-insights.md']
  ];

  for (const [fileA, fileB] of BIDIRECTIONAL_PAIRS) {
    if (linkGraph[fileA] && linkGraph[fileB]) {
      const aLinksToB = linkGraph[fileA].some(l => {
        const sourceDir = path.dirname(fileA);
        const resolved = path.posix.normalize(path.posix.join(sourceDir, l.target));
        return resolved === fileB;
      });
      const bLinksToA = linkGraph[fileB].some(l => {
        const sourceDir = path.dirname(fileB);
        const resolved = path.posix.normalize(path.posix.join(sourceDir, l.target));
        return resolved === fileA;
      });

      if (aLinksToB && !bLinksToA) {
        result.missing_backlinks.push({ from: fileA, to: fileB, missing_in: fileB });
      }
      if (bLinksToA && !aLinksToB) {
        result.missing_backlinks.push({ from: fileB, to: fileA, missing_in: fileA });
      }
    }
  }

  result.files_scanned = specFiles.length;

  // Score: percentage of valid links
  if (result.total_links > 0) {
    result.score = Math.round((result.valid_links / result.total_links) * 1000) / 10;
  }
  result.pass = result.broken_links.length === 0 && result.missing_backlinks.length === 0;

  return result;
}

// --- CLI entry point ---
if (process.argv[1] && process.argv[1].endsWith('crossref.js')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const opts = JSON.parse(input || '{}');
      const specsDir = opts.specs_dir || 'specs/';
      const root = opts.root || '.';
      const result = validateCrossRefs(specsDir, root);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.pass ? 0 : 1);
    } catch (err) {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });
}

export { extractLinks, extractAnchors, validateCrossRefs };
