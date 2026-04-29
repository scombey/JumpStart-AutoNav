/**
 * adr-index.ts — searchable ADR index port (T4.2.5).
 *
 * Pure-library port of `bin/lib/adr-index.mjs`. Public surface preserved
 * verbatim by name + signature:
 *
 *   - `parseADR(filePath)` => ADREntry | null
 *   - `buildIndex(root)`   => BuildIndexResult
 *   - `searchIndex(root, criteria)` => SearchIndexResult
 *
 * Behavior parity:
 *   - Title: first H1 or H2 in the file; falls back to filename stem.
 *   - Status, Date, Tags, Components: bold-prefixed `**Status:** x`
 *     OR plain-prefixed `Status: x`. Tags split on `,` and lowercased.
 *     Date falls back to first `YYYY-MM-DD` in content.
 *   - Decision/Context: text after `## Decision`/`## Context`,
 *     truncated to 500 chars.
 *   - Sort: newest date first, ties broken by ID.
 *   - searchIndex auto-builds the on-disk index if missing.
 *
 * @see bin/lib/adr-index.mjs (legacy reference)
 * @see specs/implementation-plan.md T4.2.5
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

// Public types

export interface ADREntry {
  id: string;
  file: string;
  title: string;
  status: string;
  date: string | null;
  tags: string[];
  components: string[];
  decision: string;
  context: string;
  indexed_at: string;
}

export interface ADRIndex {
  version: string;
  built_at: string;
  count: number;
  entries: ADREntry[];
}

export interface BuildIndexResult {
  indexed: number;
  index_path: string;
}

export interface SearchCriteria {
  query?: string | undefined;
  tag?: string | undefined;
  component?: string | undefined;
  status?: string | undefined;
}

export interface SearchIndexResult {
  results: ADREntry[];
  total: number;
  error?: string | undefined;
}

// Implementation

/** Parse a single ADR markdown file into a structured entry. Returns
 *  null on read/parse failure (legacy soft-fail). */
export function parseADR(filePath: string): ADREntry | null {
  try {
    const content = readFileSync(filePath, 'utf8');
    const name = path.basename(filePath, '.md');

    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch?.[1] !== undefined ? titleMatch[1].trim() : name;

    const statusMatch =
      content.match(/\*\*Status:\*\*\s*(.+)/i) || content.match(/Status:\s*(.+)/i);
    const status = statusMatch?.[1] !== undefined ? statusMatch[1].trim() : 'unknown';

    const dateMatch =
      content.match(/\*\*Date:\*\*\s*(.+)/i) ||
      content.match(/Date:\s*(.+)/i) ||
      content.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch?.[1] !== undefined ? dateMatch[1].trim() : null;

    const tagMatch = content.match(/\*\*Tags:\*\*\s*(.+)/i) || content.match(/Tags:\s*(.+)/i);
    const tags =
      tagMatch?.[1] !== undefined ? tagMatch[1].split(',').map((t) => t.trim().toLowerCase()) : [];

    const componentMatch =
      content.match(/\*\*Components?:\*\*\s*(.+)/i) || content.match(/Components?:\s*(.+)/i);
    const components =
      componentMatch?.[1] !== undefined ? componentMatch[1].split(',').map((c) => c.trim()) : [];

    const decisionMatch = content.match(/##\s+Decision\s*\n+([\s\S]*?)(?=\n##|\n---|$)/i);
    const decision = decisionMatch?.[1] !== undefined ? decisionMatch[1].trim().slice(0, 500) : '';

    const contextMatch = content.match(/##\s+Context\s*\n+([\s\S]*?)(?=\n##|\n---|$)/i);
    const context = contextMatch?.[1] !== undefined ? contextMatch[1].trim().slice(0, 500) : '';

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
      indexed_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Build (and persist) the ADR index from `<root>/specs/decisions/`. */
export function buildIndex(root: string): BuildIndexResult {
  const decisionsDir = path.join(root, 'specs', 'decisions');
  const indexPath = path.join(root, '.jumpstart', 'state', 'adr-index.json');

  const entries: ADREntry[] = [];

  if (existsSync(decisionsDir)) {
    for (const file of readdirSync(decisionsDir)) {
      if (!file.endsWith('.md')) continue;
      const parsed = parseADR(path.join(decisionsDir, file));
      if (parsed) entries.push(parsed);
    }
  }

  // Sort: newest date first, then by ID
  entries.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return a.id.localeCompare(b.id);
  });

  const index: ADRIndex = {
    version: '1.0.0',
    built_at: new Date().toISOString(),
    count: entries.length,
    entries,
  };

  const stateDir = path.dirname(indexPath);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');

  return { indexed: entries.length, index_path: indexPath };
}

/** Search the ADR index. Auto-builds the on-disk index if missing. */
export function searchIndex(root: string, criteria: SearchCriteria): SearchIndexResult {
  const indexPath = path.join(root, '.jumpstart', 'state', 'adr-index.json');

  if (!existsSync(indexPath)) {
    buildIndex(root);
  }

  let index: ADRIndex;
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8')) as ADRIndex;
  } catch {
    return { results: [], total: 0, error: 'Index not found or corrupt' };
  }

  let results = index.entries;

  if (criteria.tag) {
    const tag = criteria.tag.toLowerCase();
    results = results.filter((e) => e.tags.includes(tag));
  }

  if (criteria.component) {
    const comp = criteria.component.toLowerCase();
    results = results.filter((e) => e.components.some((c) => c.toLowerCase().includes(comp)));
  }

  if (criteria.status) {
    const status = criteria.status.toLowerCase();
    results = results.filter((e) => e.status.toLowerCase() === status);
  }

  if (criteria.query) {
    const q = criteria.query.toLowerCase();
    results = results.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.decision.toLowerCase().includes(q) ||
        e.context.toLowerCase().includes(q) ||
        e.tags.some((t) => t.includes(q)) ||
        e.id.toLowerCase().includes(q)
    );
  }

  return { results, total: results.length };
}
