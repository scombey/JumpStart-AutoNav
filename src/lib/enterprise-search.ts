/**
 * enterprise-search.ts — Enterprise Search Over Artifacts port (M11 batch 2).
 *
 * Pure-library port of `bin/lib/enterprise-search.js`. Public surface
 * preserved verbatim by name + signature:
 *
 *   - `indexProject(root, options?)` => IndexProjectResult
 *   - `searchProject(root, query, options?)` => SearchProjectResult
 *   - `SEARCHABLE_TYPES`
 *
 * Behavior parity:
 *   - Indexes specs/, specs/decisions/, src/ (filtered extensions),
 *     and `.jumpstart/config.yaml`.
 *   - Recursive file scan skips dotfiles and `node_modules`/`.git`/`dist`.
 *   - Search returns up to `maxResults` (default 20) entries, each with
 *     up to 3 preview lines.
 *
 * @see bin/lib/enterprise-search.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

export const SEARCHABLE_TYPES = ['spec', 'code', 'adr', 'incident', 'release', 'config'] as const;

export interface IndexEntry {
  type: string;
  path: string;
  name?: string;
  size: number;
}

export interface ProjectIndex {
  root: string;
  indexed_at: string;
  entries: IndexEntry[];
}

export interface IndexProjectResult {
  success: true;
  total_entries: number;
  index: ProjectIndex;
}

export interface IndexProjectOptions {
  // reserved for future extension; legacy accepted but ignored.
  [k: string]: unknown;
}

export interface SearchProjectOptions {
  maxResults?: number | undefined;
}

export interface SearchPreviewLine {
  line: number;
  text: string;
}

export interface SearchResultEntry {
  type: string;
  path: string;
  matches: number;
  preview: SearchPreviewLine[];
}

export interface SearchProjectResultSuccess {
  success: true;
  query: string;
  total_results: number;
  results: SearchResultEntry[];
}

export interface SearchProjectResultFailure {
  success: false;
  error: string;
}

export type SearchProjectResult = SearchProjectResultSuccess | SearchProjectResultFailure;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

function indexDirectory(
  dir: string,
  type: string,
  root: string,
  entries: IndexEntry[],
  extensions?: readonly string[]
): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (extensions && !extensions.includes(ext)) continue;
      if (entry.name.startsWith('.')) continue;
      const fp = join(dir, entry.name);
      const relPath = relative(root, fp).replace(/\\/g, '/');
      entries.push({ type, path: relPath, name: entry.name, size: statSync(fp).size });
    } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      indexDirectory(join(dir, entry.name), type, root, entries, extensions);
    }
  }
}

export function indexProject(root: string, _options: IndexProjectOptions = {}): IndexProjectResult {
  const index: ProjectIndex = {
    root,
    indexed_at: new Date().toISOString(),
    entries: [],
  };

  // Index specs
  const specsDir = join(root, 'specs');
  if (existsSync(specsDir)) {
    indexDirectory(specsDir, 'spec', root, index.entries);
  }

  // Index decisions
  const decisionsDir = join(root, 'specs', 'decisions');
  if (existsSync(decisionsDir)) {
    indexDirectory(decisionsDir, 'adr', root, index.entries);
  }

  // Index source
  const srcDir = join(root, 'src');
  if (existsSync(srcDir)) {
    indexDirectory(srcDir, 'code', root, index.entries, ['.js', '.ts', '.py', '.java', '.go']);
  }

  // Index config
  const configFile = join(root, '.jumpstart', 'config.yaml');
  if (existsSync(configFile)) {
    index.entries.push({
      type: 'config',
      path: '.jumpstart/config.yaml',
      size: statSync(configFile).size,
    });
  }

  return { success: true, total_entries: index.entries.length, index };
}

function searchInDirectory(
  dir: string,
  query: string,
  type: string,
  root: string,
  results: SearchResultEntry[],
  maxResults: number
): void {
  if (!existsSync(dir) || results.length >= maxResults) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (results.length >= maxResults) return;
    if (entry.isFile() && !entry.name.startsWith('.')) {
      try {
        const fp = join(dir, entry.name);
        const content = readFileSync(fp, 'utf8');
        if (content.toLowerCase().includes(query)) {
          const relPath = relative(root, fp).replace(/\\/g, '/');
          const lines = content.split('\n');
          const matchingLines: SearchPreviewLine[] = lines
            .map((l, i) => ({ line: i + 1, text: l.trim() }))
            .filter((l) => l.text.toLowerCase().includes(query))
            .slice(0, 3);

          results.push({
            type,
            path: relPath,
            matches: matchingLines.length,
            preview: matchingLines,
          });
        }
      } catch {
        /* skip binary/unreadable */
      }
    } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      searchInDirectory(join(dir, entry.name), query, type, root, results, maxResults);
    }
  }
}

export function searchProject(
  root: string,
  query: string | undefined | null,
  options: SearchProjectOptions = {}
): SearchProjectResult {
  if (!query) return { success: false, error: 'Search query is required' };

  const q = query.toLowerCase();
  const results: SearchResultEntry[] = [];
  const maxResults = options.maxResults ?? 20;
  const searchDirs: ReadonlyArray<{ dir: string; type: string }> = [
    { dir: join(root, 'specs'), type: 'spec' },
    { dir: join(root, 'specs', 'decisions'), type: 'adr' },
    { dir: join(root, 'src'), type: 'code' },
  ];

  for (const { dir, type } of searchDirs) {
    if (!existsSync(dir)) continue;
    searchInDirectory(dir, q, type, root, results, maxResults);
  }

  return {
    success: true,
    query,
    total_results: results.length,
    results: results.slice(0, maxResults),
  };
}
