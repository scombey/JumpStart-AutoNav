/**
 * bidirectional-trace.ts — code <-> spec traceability port (T4.2.5).
 *
 * Public surface
 * preserved verbatim by name + signature:
 *
 *   - `scanTraceLinks(root, options?)`
 *   - `traceForward(specId, traceMap)`
 *   - `traceReverse(filePath, traceMap)`
 *   - `buildCoverageReport(root, traceMap)`
 *   - `saveTraceMap(traceMap, outputPath)`
 *   - `loadTraceMap(inputPath)`
 *
 * Invariants:
 *   - Spec ID pattern: `(?:E\d+-S\d+|M\d+-T\d+|NFR-[A-Z]+\d+|VC-\d+)`.
 *   - Walks `<root>/<srcDir||'src'>` (type='source'),
 *     `<root>/<testsDir||'tests'>` (type='test'), and `<root>/specs`
 *     (type='spec').
 *   - Coverage: `total_spec_ids` is the union of IDs found in PRD +
 *     implementation-plan; `covered` counts only IDs that appear in
 *     source/test files (NOT spec-only links).
 *
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

// Public types

export type TraceLinkType = 'source' | 'test' | 'spec';

export interface ForwardTraceEntry {
  file: string;
  line: number;
  type: TraceLinkType;
}

export interface ReverseTraceEntry {
  specId: string;
  line: number;
  type: TraceLinkType;
}

export interface TraceMapStats {
  total_spec_ids: number;
  total_files_with_links: number;
  total_links: number;
}

export interface TraceMap {
  forward_map: Record<string, ForwardTraceEntry[]>;
  reverse_map: Record<string, ReverseTraceEntry[]>;
  stats: TraceMapStats | Record<string, never>;
}

export interface ScanTraceOptions {
  srcDir?: string | undefined;
  testsDir?: string | undefined;
}

export interface CoverageReport {
  total_spec_ids: number;
  covered: number;
  gaps: number;
  coverage_pct: number;
  gap_list: string[];
  covered_list: string[];
}

const SPEC_ID_SOURCE = '(?:E\\d+-S\\d+|M\\d+-T\\d+|NFR-[A-Z]+\\d+|VC-\\d+)';

// Implementation

/**
 * Walk source/test/spec directories collecting every spec-ID
 * occurrence. Returns forward (`specId -> entries`) and reverse
 * (`file -> entries`) maps plus aggregate stats.
 */
export function scanTraceLinks(root: string, options: ScanTraceOptions = {}): TraceMap {
  const specsDir = path.join(root, 'specs');
  const srcDir = path.join(root, options.srcDir || 'src');
  const testsDir = path.join(root, options.testsDir || 'tests');

  const forwardMap: Record<string, ForwardTraceEntry[]> = {};
  const reverseMap: Record<string, ReverseTraceEntry[]> = {};

  function recordLink(specId: string, file: string, line: number, type: TraceLinkType): void {
    if (!forwardMap[specId]) forwardMap[specId] = [];
    forwardMap[specId].push({ file, line, type });

    if (!reverseMap[file]) reverseMap[file] = [];
    reverseMap[file].push({ specId, line, type });
  }

  function scanDir(dir: string, fileType: TraceLinkType): void {
    if (!existsSync(dir)) return;
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const rel = path.relative(root, full).replace(/\\/g, '/');
          try {
            const content = readFileSync(full, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              const matches = line.matchAll(new RegExp(SPEC_ID_SOURCE, 'g'));
              for (const m of matches) {
                recordLink(m[0], rel, idx + 1, fileType);
              }
            });
          } catch {
            // skip unreadable files
          }
        }
      }
    };
    walk(dir);
  }

  scanDir(srcDir, 'source');
  scanDir(testsDir, 'test');
  if (existsSync(specsDir)) {
    scanDir(specsDir, 'spec');
  }

  const stats: TraceMapStats = {
    total_spec_ids: Object.keys(forwardMap).length,
    total_files_with_links: Object.keys(reverseMap).length,
    total_links: Object.values(forwardMap).reduce((s, a) => s + a.length, 0),
  };

  return { forward_map: forwardMap, reverse_map: reverseMap, stats };
}

/** Forward lookup: given a spec ID, return all code locations. */
export function traceForward(specId: string, traceMap: TraceMap): ForwardTraceEntry[] {
  return traceMap.forward_map?.[specId] || [];
}

/** Reverse lookup: given a file path, return all spec IDs it references. */
export function traceReverse(filePath: string, traceMap: TraceMap): ReverseTraceEntry[] {
  return traceMap.reverse_map?.[filePath] || [];
}

/**
 * Compute coverage: every spec ID found in PRD or implementation
 * plan, classified as covered (has source/test link) or gap.
 */
export function buildCoverageReport(root: string, traceMap: TraceMap): CoverageReport {
  const specsDir = path.join(root, 'specs');
  const prdPath = path.join(specsDir, 'prd.md');
  const implPath = path.join(specsDir, 'implementation-plan.md');

  const allSpecIds = new Set<string>();

  function extractFromFile(filePath: string): void {
    if (!existsSync(filePath)) return;
    const content = readFileSync(filePath, 'utf8');
    const matches = content.matchAll(new RegExp(SPEC_ID_SOURCE, 'g'));
    for (const m of matches) {
      allSpecIds.add(m[0]);
    }
  }

  extractFromFile(prdPath);
  extractFromFile(implPath);

  const codeLinked = new Set<string>();
  for (const [specId, links] of Object.entries(traceMap.forward_map || {})) {
    if (links.some((l) => l.type === 'source' || l.type === 'test')) {
      codeLinked.add(specId);
    }
  }
  const gaps = [...allSpecIds].filter((id) => !codeLinked.has(id));
  const covered = [...allSpecIds].filter((id) => codeLinked.has(id));

  const coverage_pct =
    allSpecIds.size > 0 ? Math.round((covered.length / allSpecIds.size) * 100) : 0;

  return {
    total_spec_ids: allSpecIds.size,
    covered: covered.length,
    gaps: gaps.length,
    coverage_pct,
    gap_list: gaps,
    covered_list: covered,
  };
}

/** Persist a trace map to disk (creates parent dirs, trailing newline). */
export function saveTraceMap(traceMap: TraceMap, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(outputPath, `${JSON.stringify(traceMap, null, 2)}\n`, 'utf8');
}

/** Load a persisted trace map; returns empty shape on missing/corrupt. */
export function loadTraceMap(inputPath: string): TraceMap {
  if (!existsSync(inputPath)) {
    return { forward_map: {}, reverse_map: {}, stats: {} };
  }
  try {
    return JSON.parse(readFileSync(inputPath, 'utf8')) as TraceMap;
  } catch {
    return { forward_map: {}, reverse_map: {}, stats: {} };
  }
}
