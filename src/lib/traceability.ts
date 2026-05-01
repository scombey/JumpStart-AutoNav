/**
 * traceability.ts — constraint tracking + traceability matrix port (T4.2.5).
 *
 * Public surface
 * preserved verbatim by name + signature:
 *
 *   - `extractStories(content)`
 *   - `extractTasks(content)` (matches both `M<n>-T<n>` and `T<3-digit>`)
 *   - `extractNFRs(content)` (pattern `NFR-<UPPER>+<num>`)
 *   - `extractValidationCriteria(content)` (pattern `VC-<num>`)
 *   - `buildTraceabilityChain(root)`
 *   - `buildNFRMap(root)`
 *
 * Invariants:
 *   - Test discovery walks `<root>/tests` recursively for `.test.js`,
 *     `.spec.js`, `.test.ts`, `.spec.ts`.
 *   - Story-task association uses a 5-line context window — if a task
 *     ID and a story ID appear within 5 lines of each other in the
 *     implementation plan, the task is "linked" to that story.
 *   - Coverage percentages: round((linked / total) * 100), 0 when
 *     no stories.
 *
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

// Public types

export interface TraceabilityChain {
  story: string;
  tasks: string[];
  has_tests: boolean;
  coverage: 'partial' | 'gap';
}

export interface CoverageSummary {
  total_stories: number;
  stories_with_tasks: number;
  stories_with_tests: number;
  stories_to_tasks_pct: number;
  stories_to_tests_pct: number;
  total_tasks: number;
  total_nfrs: number;
}

export interface TraceabilityGap {
  type: 'story_without_tasks' | 'story_without_tests';
  id: string;
}

export interface TraceabilityResult {
  chains: TraceabilityChain[];
  coverage: CoverageSummary;
  gaps: TraceabilityGap[];
}

export interface NFRMappingEntry {
  nfr: string;
  in_architecture: boolean;
  in_implementation: boolean;
  status: 'fully_mapped' | 'partial_arch' | 'partial_impl' | 'unmapped';
}

export interface NFRMappingSummary {
  total: number;
  fully_mapped: number;
  partial: number;
  unmapped: number;
}

export interface NFRMapResult {
  mapping: NFRMappingEntry[];
  summary: NFRMappingSummary;
}

// Implementation

/** Story IDs (`E<n>-S<n>`), deduped. */
export function extractStories(content: string): string[] {
  const matches = content.match(/E\d+-S\d+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/** Task IDs — matches BOTH `M<n>-T<n>` and `T<3-digit>` (legacy
 *  accepts both shapes), deduped across both patterns. */
export function extractTasks(content: string): string[] {
  const patterns = [/M\d+-T\d+/g, /T\d{3}/g];
  const all: string[] = [];
  for (const pat of patterns) {
    const matches = content.match(pat);
    if (matches) all.push(...matches);
  }
  return Array.from(new Set(all));
}

/** NFR IDs (`NFR-<UPPER>+<num>`, e.g. `NFR-P01`), deduped. */
export function extractNFRs(content: string): string[] {
  const matches = content.match(/NFR-[A-Z]+\d+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/** Validation criteria IDs (`VC-<num>`), deduped. */
export function extractValidationCriteria(content: string): string[] {
  const matches = content.match(/VC-\d+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/** Read a file safely; returns empty string if missing/unreadable. */
function readSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Build the full traceability chain — for each PRD story, find tasks
 * (in implementation plan, 5-line context window) and tests (any
 * spec/test file referencing the story ID).
 */
export function buildTraceabilityChain(root: string): TraceabilityResult {
  const specsDir = path.join(root, 'specs');

  readSafe(path.join(specsDir, 'challenger-brief.md'));
  readSafe(path.join(specsDir, 'product-brief.md'));
  const prdContent = readSafe(path.join(specsDir, 'prd.md'));
  readSafe(path.join(specsDir, 'architecture.md'));
  const implContent = readSafe(path.join(specsDir, 'implementation-plan.md'));

  const stories = extractStories(prdContent);
  const tasks = extractTasks(implContent);
  const nfrs = extractNFRs(prdContent);

  const testDir = path.join(root, 'tests');
  const testStories = new Set<string>();
  const testTasks = new Set<string>();

  if (existsSync(testDir)) {
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          entry.name.endsWith('.test.js') ||
          entry.name.endsWith('.spec.js') ||
          entry.name.endsWith('.test.ts') ||
          entry.name.endsWith('.spec.ts')
        ) {
          const content = readSafe(full);
          for (const s of extractStories(content)) testStories.add(s);
          for (const t of extractTasks(content)) testTasks.add(t);
        }
      }
    };
    walk(testDir);
  }

  const chains: TraceabilityChain[] = stories.map((storyId) => {
    const relatedTasks = tasks.filter((t) => {
      const lines = implContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        if (line.includes(t)) {
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
      coverage: relatedTasks.length > 0 ? 'partial' : 'gap',
    };
  });

  const storiesWithTasks = chains.filter((c) => c.tasks.length > 0).length;
  const storiesWithTests = chains.filter((c) => c.has_tests).length;

  const coverage: CoverageSummary = {
    total_stories: stories.length,
    stories_with_tasks: storiesWithTasks,
    stories_with_tests: storiesWithTests,
    stories_to_tasks_pct:
      stories.length > 0 ? Math.round((storiesWithTasks / stories.length) * 100) : 0,
    stories_to_tests_pct:
      stories.length > 0 ? Math.round((storiesWithTests / stories.length) * 100) : 0,
    total_tasks: tasks.length,
    total_nfrs: nfrs.length,
  };

  const gaps: TraceabilityGap[] = [];
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
 * Build NFR-to-architecture mapping. For each PRD-defined NFR, check
 * presence in architecture.md and implementation-plan.md; classify as
 * fully_mapped / partial_arch / partial_impl / unmapped.
 */
export function buildNFRMap(root: string): NFRMapResult {
  const specsDir = path.join(root, 'specs');
  const prdContent = readSafe(path.join(specsDir, 'prd.md'));
  const archContent = readSafe(path.join(specsDir, 'architecture.md'));
  const implContent = readSafe(path.join(specsDir, 'implementation-plan.md'));

  const nfrs = extractNFRs(prdContent);

  const mapping: NFRMappingEntry[] = nfrs.map((nfr) => {
    const inArch = archContent.includes(nfr);
    const inImpl = implContent.includes(nfr);
    let status: NFRMappingEntry['status'];
    if (inArch && inImpl) status = 'fully_mapped';
    else if (inArch) status = 'partial_arch';
    else if (inImpl) status = 'partial_impl';
    else status = 'unmapped';
    return { nfr, in_architecture: inArch, in_implementation: inImpl, status };
  });

  const summary: NFRMappingSummary = {
    total: nfrs.length,
    fully_mapped: mapping.filter((m) => m.status === 'fully_mapped').length,
    partial: mapping.filter((m) => m.status.startsWith('partial')).length,
    unmapped: mapping.filter((m) => m.status === 'unmapped').length,
  };

  return { mapping, summary };
}
