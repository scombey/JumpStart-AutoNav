/**
 * adr-index.js — Searchable ADR Index (Item 51)
 *
 * Builds and searches an index of Architecture Decision Records (ADRs).
 * Supports querying by tag, date, component, and free text.
 *
 * Usage:
 *   echo '{"action":"build","root":"."}' | node bin/lib/adr-index.js
 *   echo '{"action":"search","query":"database","root":"."}' | node bin/lib/adr-index.js
 *
 * Input (stdin JSON):
 *   action: "build" | "search"
 *   root: project root path
 *   query: search term (for search action)
 *   tag: filter by tag (for search action)
 *   component: filter by component (for search action)
 *
 * Output (stdout JSON):
 *   For build: { "indexed": N, "index_path": "..." }
 *   For search: { "results": [...], "total": N }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Parse an ADR markdown file to extract metadata.
 *
 * @param {string} filePath - Path to ADR file.
 * @returns {object|null} Parsed ADR metadata.
 */
function parseADR(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const name = path.basename(filePath, '.md');

    // Extract title (first H1 or H2)
    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : name;

    // Extract status
    const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/i) ||
                        content.match(/Status:\s*(.+)/i);
    const status = statusMatch ? statusMatch[1].trim() : 'unknown';

    // Extract date
    const dateMatch = content.match(/\*\*Date:\*\*\s*(.+)/i) ||
                      content.match(/Date:\s*(.+)/i) ||
                      content.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1].trim() : null;

    // Extract tags (look for Tags: or labels)
    const tagMatch = content.match(/\*\*Tags:\*\*\s*(.+)/i) ||
                     content.match(/Tags:\s*(.+)/i);
    const tags = tagMatch
      ? tagMatch[1].split(',').map(t => t.trim().toLowerCase())
      : [];

    // Extract components mentioned
    const componentMatch = content.match(/\*\*Components?:\*\*\s*(.+)/i) ||
                           content.match(/Components?:\s*(.+)/i);
    const components = componentMatch
      ? componentMatch[1].split(',').map(c => c.trim())
      : [];

    // Extract decision text (first paragraph after "## Decision")
    const decisionMatch = content.match(/##\s+Decision\s*\n+([\s\S]*?)(?=\n##|\n---|\Z)/i);
    const decision = decisionMatch ? decisionMatch[1].trim().slice(0, 500) : '';

    // Extract context text
    const contextMatch = content.match(/##\s+Context\s*\n+([\s\S]*?)(?=\n##|\n---|\Z)/i);
    const context = contextMatch ? contextMatch[1].trim().slice(0, 500) : '';

    return {
      id: name,
      file: path.relative('.', filePath).replace(/\\/g, '/'),
      title,
      status,
      date,
      tags,
      components,
      decision,
      context,
      indexed_at: new Date().toISOString()
    };
  } catch (_) {
    return null;
  }
}

/**
 * Build or rebuild the ADR index.
 *
 * @param {string} root - Project root.
 * @returns {{ indexed: number, index_path: string, entries: object[] }}
 */
function buildIndex(root) {
  const decisionsDir = path.join(root, 'specs', 'decisions');
  const indexPath = path.join(root, '.jumpstart', 'state', 'adr-index.json');

  const entries = [];

  if (fs.existsSync(decisionsDir)) {
    for (const file of fs.readdirSync(decisionsDir)) {
      if (!file.endsWith('.md')) continue;
      const parsed = parseADR(path.join(decisionsDir, file));
      if (parsed) entries.push(parsed);
    }
  }

  // Sort by date (newest first), then by ID
  entries.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return a.id.localeCompare(b.id);
  });

  const index = {
    version: '1.0.0',
    built_at: new Date().toISOString(),
    count: entries.length,
    entries
  };

  // Ensure state directory exists
  const stateDir = path.dirname(indexPath);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');

  return { indexed: entries.length, index_path: indexPath };
}

/**
 * Search the ADR index.
 *
 * @param {string} root - Project root.
 * @param {object} criteria - Search criteria.
 * @param {string} [criteria.query] - Free text search.
 * @param {string} [criteria.tag] - Filter by tag.
 * @param {string} [criteria.component] - Filter by component.
 * @param {string} [criteria.status] - Filter by status.
 * @returns {{ results: object[], total: number }}
 */
function searchIndex(root, criteria) {
  const indexPath = path.join(root, '.jumpstart', 'state', 'adr-index.json');

  // Build index if it doesn't exist
  if (!fs.existsSync(indexPath)) {
    buildIndex(root);
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (_) {
    return { results: [], total: 0, error: 'Index not found or corrupt' };
  }

  let results = index.entries;

  // Filter by tag
  if (criteria.tag) {
    const tag = criteria.tag.toLowerCase();
    results = results.filter(e => e.tags.includes(tag));
  }

  // Filter by component
  if (criteria.component) {
    const comp = criteria.component.toLowerCase();
    results = results.filter(e =>
      e.components.some(c => c.toLowerCase().includes(comp))
    );
  }

  // Filter by status
  if (criteria.status) {
    const status = criteria.status.toLowerCase();
    results = results.filter(e => e.status.toLowerCase() === status);
  }

  // Free text search across title, decision, context, tags
  if (criteria.query) {
    const q = criteria.query.toLowerCase();
    results = results.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.decision.toLowerCase().includes(q) ||
      e.context.toLowerCase().includes(q) ||
      e.tags.some(t => t.includes(q)) ||
      e.id.toLowerCase().includes(q)
    );
  }

  return { results, total: results.length };
}

// --- CLI entry point ---
if (process.argv[1] && process.argv[1].endsWith('adr-index.js')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const opts = JSON.parse(input || '{}');
      const root = opts.root || '.';
      const action = opts.action || 'search';

      let result;
      if (action === 'build') {
        result = buildIndex(root);
      } else {
        result = searchIndex(root, opts);
      }

      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });
}

export { parseADR, buildIndex, searchIndex };
