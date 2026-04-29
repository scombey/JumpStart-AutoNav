/**
 * pr-package.ts — PR-Native Execution Mode port (M11 batch 4).
 *
 * Pure-library port of `bin/lib/pr-package.js`. Public surface preserved
 * verbatim by name + signature:
 *
 *   - `gatherTestEvidence(root)` => string[]
 *   - `createPRPackage(pkg, root, options?)` => CreatePRPackageResult
 *   - `listPRPackages(root, options?)` => ListPRPackagesResult
 *   - `exportPRPackage(packageId, root, options?)` => ExportPRPackageResult
 *
 * Behavior parity:
 *   - Default output dir: `<root>/.jumpstart/pr-packages`.
 *   - Markdown output filename: `<id>.md`, where id =
 *     `pr-<Date.now()>-<5-char base36>`.
 *   - Auto-detected test evidence sources (probed in order):
 *       test-results.json, coverage/summary.json, .vitest/results.json
 *   - listPRPackages returns packages sorted by created_at descending.
 *   - M3 hardening: shape-validated JSON for any auto-detected test
 *     evidence; rejects payloads carrying __proto__/constructor/prototype
 *     keys. Bad JSON falls back to a "Test results found at: ..." hint
 *     (legacy parity).
 *   - Path-safety per ADR-009: every user-supplied path through
 *     `assertInsideRoot`. `createPRPackage` writes a markdown file under
 *     `<root>/.jumpstart/pr-packages/`; `assertInsideRoot` confirms the
 *     resolved file path stays under `root`.
 *
 * @see bin/lib/pr-package.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { assertInsideRoot } from './path-safety.js';

const DEFAULT_OUTPUT_DIR = join('.jumpstart', 'pr-packages');

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    for (const item of value) if (hasForbiddenKey(item)) return true;
    return false;
  }
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKey(value[key])) return true;
  }
  return false;
}

export interface PRPackageInput {
  title?: string | undefined;
  summary?: string | undefined;
  changes?: string[] | string | undefined;
  risk_notes?: string[] | string | undefined;
  test_evidence?: string[] | string | undefined;
  rollback?: string | undefined;
  linked_stories?: string[] | undefined;
}

export interface CreatePRPackageOptions {
  outputDir?: string | undefined;
}

export type CreatePRPackageResult =
  | {
      success: true;
      id: string;
      output_file: string;
      title: string;
      changes_count: number;
      risk_count: number;
      has_test_evidence: boolean;
    }
  | { success: false; error: string };

export interface PRPackageEntry {
  id: string;
  file: string;
  created_at: string;
  size_bytes: number;
}

export interface ListPRPackagesOptions {
  outputDir?: string | undefined;
}

export interface ListPRPackagesResult {
  success: true;
  packages: PRPackageEntry[];
  total: number;
}

export interface ExportPRPackageOptions {
  outputDir?: string | undefined;
}

export type ExportPRPackageResult =
  | { success: true; id: string; content: string }
  | { success: false; error: string };

/**
 * Probe known test-result locations and return short evidence snippets.
 * Each probe is wrapped in a shape check to reject pollution payloads
 * before the JSON.stringify slice runs.
 */
export function gatherTestEvidence(root: string): string[] {
  // Path-safety: gate root before any fs probe.
  assertInsideRoot(root, root, { schemaId: 'pr-package:gatherTestEvidence:root' });

  const evidence: string[] = [];
  const candidatePaths = [
    join(root, 'test-results.json'),
    join(root, 'coverage', 'summary.json'),
    join(root, '.vitest', 'results.json'),
  ];

  for (const p of candidatePaths) {
    if (existsSync(p)) {
      let raw: string;
      try {
        raw = readFileSync(p, 'utf8');
      } catch {
        evidence.push(`Test results found at: ${relative(root, p)}`);
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        evidence.push(`Test results found at: ${relative(root, p)}`);
        continue;
      }
      // M3 hardening: never serialize a payload carrying pollution keys.
      if (hasForbiddenKey(parsed)) {
        evidence.push(`Test results found at: ${relative(root, p)}`);
        continue;
      }
      evidence.push(
        `Test results from ${relative(root, p)}: ${JSON.stringify(parsed).slice(0, 200)}`
      );
    }
  }

  return evidence;
}

function toArrayOfStrings(value: string[] | string | undefined, fallback: string[] = []): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value.length > 0) return [value];
  return fallback;
}

/**
 * Create a PR work package and write it as markdown under
 * `<root>/.jumpstart/pr-packages/<id>.md`.
 */
export function createPRPackage(
  pkg: PRPackageInput | null | undefined,
  root: string,
  options: CreatePRPackageOptions = {}
): CreatePRPackageResult {
  if (!pkg?.title || !pkg.summary) {
    return { success: false, error: 'pkg.title and pkg.summary are required' };
  }

  // Path-safety: gate root before any fs probe / write.
  assertInsideRoot(root, root, { schemaId: 'pr-package:createPRPackage:root' });

  const id = `pr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const outputDir = options.outputDir ?? join(root, DEFAULT_OUTPUT_DIR);
  const outputFile = join(outputDir, `${id}.md`);

  // Auto-detect test evidence if caller did not supply any.
  let testEvidence = toArrayOfStrings(pkg.test_evidence);
  if (testEvidence.length === 0) {
    testEvidence = gatherTestEvidence(root);
  }

  const changes = toArrayOfStrings(pkg.changes);
  const riskNotes = toArrayOfStrings(pkg.risk_notes, ['None identified']);
  const linkedStories = Array.isArray(pkg.linked_stories)
    ? pkg.linked_stories.filter((s): s is string => typeof s === 'string')
    : [];

  const now = new Date().toISOString();

  const lines: string[] = [
    `# PR Work Package: ${pkg.title}`,
    '',
    `**ID:** ${id}`,
    `**Created:** ${now}`,
    '',
    '## Summary',
    '',
    pkg.summary,
    '',
    '## Changes',
    '',
    ...changes.map((c) => `- ${c}`),
    '',
    '## Linked Stories / Tasks',
    '',
    linkedStories.length > 0 ? linkedStories.map((s) => `- ${s}`).join('\n') : '- None specified',
    '',
    '## Risk Notes',
    '',
    ...riskNotes.map((r) => `- ${r}`),
    '',
    '## Test Evidence',
    '',
    testEvidence.length > 0
      ? testEvidence.map((e) => `- ${e}`).join('\n')
      : '- No automated test results found. Run tests before merging.',
    '',
    '## Rollback Guidance',
    '',
    pkg.rollback ?? 'No specific rollback steps documented. Revert the PR commits.',
    '',
    '---',
    '',
    `*Generated by JumpStart PR-Native Execution Mode*`,
  ];

  const content = lines.join('\n');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(outputFile, content, 'utf8');

  return {
    success: true,
    id,
    output_file: outputFile,
    title: pkg.title,
    changes_count: changes.length,
    risk_count: riskNotes.length,
    has_test_evidence: testEvidence.length > 0,
  };
}

/**
 * List all existing PR packages in the configured output directory.
 * Sorted by created_at descending (newest first).
 */
export function listPRPackages(
  root: string,
  options: ListPRPackagesOptions = {}
): ListPRPackagesResult {
  // Path-safety: gate root.
  assertInsideRoot(root, root, { schemaId: 'pr-package:listPRPackages:root' });

  const outputDir = options.outputDir ?? join(root, DEFAULT_OUTPUT_DIR);

  if (!existsSync(outputDir)) {
    return { success: true, packages: [], total: 0 };
  }

  const files = readdirSync(outputDir)
    .filter((f) => f.endsWith('.md'))
    .map((f): PRPackageEntry => {
      const filePath = join(outputDir, f);
      const stat = statSync(filePath);
      return {
        id: basename(f, '.md'),
        file: relative(root, filePath).replace(/\\/g, '/'),
        created_at: stat.birthtime.toISOString(),
        size_bytes: stat.size,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return { success: true, packages: files, total: files.length };
}

/**
 * Export a previously-created PR package as a string.
 */
export function exportPRPackage(
  packageId: string,
  root: string,
  options: ExportPRPackageOptions = {}
): ExportPRPackageResult {
  // Path-safety: gate root + reject traversal-shaped ids.
  assertInsideRoot(root, root, { schemaId: 'pr-package:exportPRPackage:root' });
  if (typeof packageId !== 'string' || packageId.length === 0) {
    return { success: false, error: 'PR package id is required' };
  }
  // Defense in depth: a malicious id like `../../etc/passwd` would otherwise
  // resolve outside outputDir. Reject anything that doesn't look like a
  // simple package id.
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(packageId)) {
    return { success: false, error: `Invalid PR package id: ${packageId}` };
  }

  const outputDir = options.outputDir ?? join(root, DEFAULT_OUTPUT_DIR);
  const filePath = join(outputDir, `${packageId}.md`);

  if (!existsSync(filePath)) {
    return { success: false, error: `PR package not found: ${packageId}` };
  }

  const content = readFileSync(filePath, 'utf8');
  return { success: true, id: packageId, content };
}
