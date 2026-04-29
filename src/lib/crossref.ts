/**
 * crossref.ts — bidirectional cross-reference validator port (T4.2.4).
 *
 * Pure-library port of `bin/lib/crossref.mjs`. Public surface preserved:
 *
 *   - `extractLinks(content)` => MarkdownLink[]
 *   - `extractAnchors(content)` => string[]
 *   - `validateCrossRefs(specsDir, root)` => CrossRefReport
 *
 * Behavior parity:
 *   - External URLs (http/https/mailto) and pure-anchor links (`#x`)
 *     are skipped.
 *   - Anchor slugification: lowercase, strip non-word/space/hyphen,
 *     collapse spaces to hyphens, dedupe consecutive hyphens, trim.
 *     (GitHub-style — exact match with legacy.)
 *   - Bidirectional pairs: PRD <-> Architecture, PRD <-> insights/prd,
 *     Arch <-> insights/architecture, brief <-> insights/brief.
 *   - Score = round(valid/total * 1000) / 10 (one decimal place).
 *   - pass = no broken_links AND no missing_backlinks.
 *   - Walks specsDir recursively.
 *
 * @see bin/lib/crossref.mjs (legacy reference)
 * @see specs/implementation-plan.md T4.2.4
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

// Public types

export interface MarkdownLink {
  text: string;
  target: string;
  anchor: string | null;
  line: number;
}

export interface BrokenLinkEntry {
  source: string;
  line: number;
  target: string;
  reason: string;
}

export interface MissingBacklinkEntry {
  from: string;
  to: string;
  missing_in: string;
}

export interface CrossRefReport {
  total_links: number;
  valid_links: number;
  broken_links: BrokenLinkEntry[];
  orphan_sections: string[];
  missing_backlinks: MissingBacklinkEntry[];
  files_scanned: number;
  score: number;
  pass: boolean;
  error?: string | undefined;
}

// Implementation

/**
 * Extract all relative-path markdown links from `content`. Skips
 * external URLs (http/https/mailto) and pure-anchor links (`#section`).
 * Returns one entry per link occurrence (not deduped) with line numbers.
 */
export function extractLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const lines = content.split('\n');
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

  lines.forEach((line, idx) => {
    const matches = line.matchAll(linkPattern);
    for (const m of matches) {
      const raw = m[2];
      const text = m[1];
      if (raw === undefined || text === undefined) continue;
      if (/^https?:|^mailto:|^#/.test(raw)) continue;
      const parts = raw.split('#');
      const target = parts[0];
      if (target === undefined) continue;
      links.push({
        text,
        target,
        anchor: parts[1] || null,
        line: idx + 1,
      });
    }
  });

  return links;
}

/**
 * Extract heading anchors using GitHub-style slugification:
 *   1. lowercase
 *   2. strip everything except `\w`, whitespace, hyphen
 *   3. collapse runs of whitespace to a single hyphen
 *   4. collapse runs of hyphens to a single hyphen
 *   5. trim leading/trailing whitespace
 */
export function extractAnchors(content: string): string[] {
  const anchors: string[] = [];
  const headings = content.matchAll(/^#+\s+(.+)$/gm);
  for (const m of headings) {
    if (m[1] === undefined) continue;
    const slug = m[1]
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
 * Validate cross-references across every markdown file under
 * `<root>/<specsDir>` (walked recursively).
 */
export function validateCrossRefs(specsDir: string, root: string): CrossRefReport {
  const result: CrossRefReport = {
    total_links: 0,
    valid_links: 0,
    broken_links: [],
    orphan_sections: [],
    missing_backlinks: [],
    files_scanned: 0,
    score: 100,
    pass: true,
  };

  const specFiles: string[] = [];
  const absSpecsDir = path.resolve(root, specsDir);

  if (!existsSync(absSpecsDir)) {
    return { ...result, error: `Specs directory not found: ${absSpecsDir}` };
  }

  function collectFiles(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(full);
      } else if (entry.name.endsWith('.md')) {
        specFiles.push(full);
      }
    }
  }
  collectFiles(absSpecsDir);

  const anchorMap: Record<string, string[]> = {};
  const contentMap: Record<string, string> = {};
  for (const file of specFiles) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const content = readFileSync(file, 'utf8');
    anchorMap[rel] = extractAnchors(content);
    contentMap[rel] = content;
  }

  const linkGraph: Record<string, MarkdownLink[]> = {};

  for (const file of specFiles) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const content = contentMap[rel];
    if (content === undefined) continue;
    const links = extractLinks(content);
    linkGraph[rel] = links;

    for (const link of links) {
      result.total_links++;

      const sourceDir = path.dirname(rel);
      const resolvedTarget = path.posix.normalize(path.posix.join(sourceDir, link.target));

      const absTarget = path.resolve(root, resolvedTarget);
      if (!existsSync(absTarget)) {
        result.broken_links.push({
          source: rel,
          line: link.line,
          target: link.target,
          reason: 'Target file not found',
        });
        continue;
      }

      if (link.anchor) {
        const targetAnchors = anchorMap[resolvedTarget] || [];
        if (!targetAnchors.includes(link.anchor)) {
          result.broken_links.push({
            source: rel,
            line: link.line,
            target: `${link.target}#${link.anchor}`,
            reason: `Anchor not found: #${link.anchor}`,
          });
          continue;
        }
      }

      result.valid_links++;
    }
  }

  // Bidirectional pairs (preserved verbatim from legacy)
  const BIDIRECTIONAL_PAIRS: Array<[string, string]> = [
    ['specs/prd.md', 'specs/architecture.md'],
    ['specs/prd.md', 'specs/insights/prd-insights.md'],
    ['specs/architecture.md', 'specs/insights/architecture-insights.md'],
    ['specs/product-brief.md', 'specs/insights/product-brief-insights.md'],
  ];

  for (const [fileA, fileB] of BIDIRECTIONAL_PAIRS) {
    if (linkGraph[fileA] && linkGraph[fileB]) {
      const aLinksToB = linkGraph[fileA].some((l) => {
        const sourceDir = path.dirname(fileA);
        const resolved = path.posix.normalize(path.posix.join(sourceDir, l.target));
        return resolved === fileB;
      });
      const bLinksToA = linkGraph[fileB].some((l) => {
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

  if (result.total_links > 0) {
    result.score = Math.round((result.valid_links / result.total_links) * 1000) / 10;
  }
  result.pass = result.broken_links.length === 0 && result.missing_backlinks.length === 0;

  return result;
}
