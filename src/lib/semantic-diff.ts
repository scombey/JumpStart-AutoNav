/**
 * semantic-diff.ts — Cross-artifact Semantic Diffing port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/semantic-diff.js` (CJS). Public surface:
 *   - `extractSections(content)` => Section[]
 *   - `extractRequirements(content)` => string[]
 *   - `extractApiEndpoints(content)` => ApiEndpoint[]
 *   - `extractTableData(content)` => string[][]
 *   - `normalizeText(text)` => string
 *   - `textSimilarity(a, b)` => number
 *   - `compareArtifacts(contentA, contentB, options?)` => CompareResult
 *   - `compareFiles(pathA, pathB, options?)` => CompareResult
 *   - `crossArtifactDiff(root, options?)` => CrossDiffResult
 *
 * M3 hardening: No JSON state paths. Not applicable.
 * Path-safety per ADR-009: `compareFiles` paths come from CLI wiring.
 *
 * @see bin/lib/semantic-diff.js (legacy reference)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REQUIREMENT_PATTERN = /\b(REQ-\d+|E\d+-S\d+|NFR-\d+|UC-\d+|FR-\d+|AC-\d+|M\d+-T\d+)\b/g;
const API_ENDPOINT = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/g;
const TABLE_ROW = /^\|(.+)\|$/gm;

export interface Section {
  heading: string;
  level: number;
  content: string;
  startLine: number;
}

export function extractSections(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split('\n');
  let currentSection: { heading: string; level: number; content: string[]; startLine: number } = {
    heading: '(preamble)',
    level: 0,
    content: [],
    startLine: 0,
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentSection.content.length > 0 || currentSection.heading !== '(preamble)') {
        sections.push({
          heading: currentSection.heading,
          level: currentSection.level,
          content: currentSection.content.join('\n').trim(),
          startLine: currentSection.startLine,
        });
      }
      currentSection = {
        heading: (headingMatch[2] ?? '').trim(),
        level: headingMatch[1]?.length ?? 1,
        content: [],
        startLine: i + 1,
      };
    } else {
      currentSection.content.push(line);
    }
  }
  sections.push({
    heading: currentSection.heading,
    level: currentSection.level,
    content: currentSection.content.join('\n').trim(),
    startLine: currentSection.startLine,
  });

  return sections;
}

export function extractRequirements(content: string): string[] {
  const matches = content.match(REQUIREMENT_PATTERN) ?? [];
  return [...new Set(matches)].sort();
}

export interface ApiEndpoint {
  method: string;
  path: string;
}

export function extractApiEndpoints(content: string): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(API_ENDPOINT.source, 'g');
  while ((match = pattern.exec(content)) !== null) {
    const method = match[1];
    const apiPath = match[2];
    if (method && apiPath) endpoints.push({ method, path: apiPath });
  }
  return endpoints;
}

export function extractTableData(content: string): string[][] {
  const rows: string[][] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(TABLE_ROW.source, 'gm');
  while ((match = pattern.exec(content)) !== null) {
    const cells = (match[1] ?? '').split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.some(c => /^[-:]+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeText(a).split(' ').filter(w => w.length > 2));
  const wordsB = new Set(normalizeText(b).split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 1 : intersection / union;
}

export interface SectionChange {
  type: 'section_added' | 'section_removed' | 'section_modified';
  heading: string;
  severity: string;
  similarity?: number | undefined;
}

export interface CompareResult {
  success: true;
  overall_similarity: number;
  has_breaking_changes: boolean;
  section_changes: SectionChange[];
  requirement_changes: {
    added: string[];
    removed: string[];
    total_before: number;
    total_after: number;
  };
  api_changes: {
    added: string[];
    removed: string[];
    total_before: number;
    total_after: number;
  };
  table_changes: { rows_before: number; rows_after: number };
  summary: {
    sections_added: number;
    sections_removed: number;
    sections_modified: number;
    requirements_added: number;
    requirements_removed: number;
    apis_added: number;
    apis_removed: number;
  };
  file_a?: string | undefined;
  file_b?: string | undefined;
}

export function compareArtifacts(
  contentA: string,
  contentB: string,
  _options: Record<string, unknown> = {},
): CompareResult {
  const sectionsA = extractSections(contentA);
  const sectionsB = extractSections(contentB);
  const sectionChanges: SectionChange[] = [];
  const headingsA = sectionsA.map(s => s.heading);
  const headingsB = sectionsB.map(s => s.heading);

  for (const sec of sectionsB) {
    if (!headingsA.includes(sec.heading)) {
      sectionChanges.push({ type: 'section_added', heading: sec.heading, severity: 'info' });
    }
  }

  for (const sec of sectionsA) {
    if (!headingsB.includes(sec.heading)) {
      sectionChanges.push({ type: 'section_removed', heading: sec.heading, severity: 'warning' });
    }
  }

  for (const secA of sectionsA) {
    const secB = sectionsB.find(s => s.heading === secA.heading);
    if (secB) {
      const similarity = textSimilarity(secA.content, secB.content);
      if (similarity < 0.95) {
        sectionChanges.push({
          type: 'section_modified',
          heading: secA.heading,
          similarity: Math.round(similarity * 100),
          severity: similarity < 0.5 ? 'critical' : similarity < 0.8 ? 'warning' : 'info',
        });
      }
    }
  }

  const reqsA = extractRequirements(contentA);
  const reqsB = extractRequirements(contentB);
  const addedReqs = reqsB.filter(r => !reqsA.includes(r));
  const removedReqs = reqsA.filter(r => !reqsB.includes(r));

  const apisA = extractApiEndpoints(contentA);
  const apisB = extractApiEndpoints(contentB);
  const apiKeysA = apisA.map(a => `${a.method} ${a.path}`);
  const apiKeysB = apisB.map(a => `${a.method} ${a.path}`);
  const addedApis = apiKeysB.filter(k => !apiKeysA.includes(k));
  const removedApis = apiKeysA.filter(k => !apiKeysB.includes(k));

  const tablesA = extractTableData(contentA);
  const tablesB = extractTableData(contentB);

  const overallSimilarity = textSimilarity(contentA, contentB);
  const hasBreakingChanges =
    removedReqs.length > 0 || removedApis.length > 0 || sectionChanges.some(c => c.severity === 'critical');

  return {
    success: true,
    overall_similarity: Math.round(overallSimilarity * 100),
    has_breaking_changes: hasBreakingChanges,
    section_changes: sectionChanges,
    requirement_changes: { added: addedReqs, removed: removedReqs, total_before: reqsA.length, total_after: reqsB.length },
    api_changes: { added: addedApis, removed: removedApis, total_before: apisA.length, total_after: apisB.length },
    table_changes: { rows_before: tablesA.length, rows_after: tablesB.length },
    summary: {
      sections_added: sectionChanges.filter(c => c.type === 'section_added').length,
      sections_removed: sectionChanges.filter(c => c.type === 'section_removed').length,
      sections_modified: sectionChanges.filter(c => c.type === 'section_modified').length,
      requirements_added: addedReqs.length,
      requirements_removed: removedReqs.length,
      apis_added: addedApis.length,
      apis_removed: removedApis.length,
    },
  };
}

export type CompareFilesResult =
  | (CompareResult & { file_a: string; file_b: string })
  | { success: false; error: string };

export function compareFiles(
  pathA: string,
  pathB: string,
  options: Record<string, unknown> = {},
): CompareFilesResult {
  if (!existsSync(pathA)) return { success: false, error: `File not found: ${pathA}` };
  if (!existsSync(pathB)) return { success: false, error: `File not found: ${pathB}` };

  const contentA = readFileSync(pathA, 'utf8');
  const contentB = readFileSync(pathB, 'utf8');
  const result = compareArtifacts(contentA, contentB, options);
  return { ...result, file_a: pathA, file_b: pathB };
}

export interface CrossDiffResult {
  success: boolean;
  artifacts_analyzed?: number | undefined;
  inconsistencies?: Array<{
    type: string;
    upstream: string;
    downstream: string;
    missing_requirements: string[];
    severity: string;
  }> | undefined;
  summary?: { total_inconsistencies: number; requirement_gaps: number } | undefined;
  error?: string | undefined;
}

export function crossArtifactDiff(root: string, _options: Record<string, unknown> = {}): CrossDiffResult {
  const specsDir = join(root, 'specs');
  if (!existsSync(specsDir)) {
    return { success: false, error: 'specs/ directory not found' };
  }

  const artifactFiles = ['challenger-brief.md', 'product-brief.md', 'prd.md', 'architecture.md', 'implementation-plan.md'];
  const artifacts: Record<string, { requirements: string[] }> = {};

  for (const file of artifactFiles) {
    const fullPath = join(specsDir, file);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8');
      artifacts[file] = { requirements: extractRequirements(content) };
    }
  }

  const inconsistencies: Array<{
    type: string;
    upstream: string;
    downstream: string;
    missing_requirements: string[];
    severity: string;
  }> = [];

  const orderedKeys = Object.keys(artifacts);
  for (let i = 0; i < orderedKeys.length - 1; i++) {
    const upstreamKey = orderedKeys[i];
    const downstreamKey = orderedKeys[i + 1];
    if (!upstreamKey || !downstreamKey) continue;
    const upstream = artifacts[upstreamKey];
    const downstream = artifacts[downstreamKey];
    if (!upstream || !downstream) continue;

    const missingDownstream = upstream.requirements.filter(r => !downstream.requirements.includes(r));
    if (missingDownstream.length > 0) {
      inconsistencies.push({
        type: 'requirement_gap',
        upstream: upstreamKey,
        downstream: downstreamKey,
        missing_requirements: missingDownstream,
        severity: 'warning',
      });
    }
  }

  return {
    success: true,
    artifacts_analyzed: Object.keys(artifacts).length,
    inconsistencies,
    summary: {
      total_inconsistencies: inconsistencies.length,
      requirement_gaps: inconsistencies.filter(i => i.type === 'requirement_gap').length,
    },
  };
}
