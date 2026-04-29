/**
 * diff.ts — dry-run diff helper (T4.1.5 port).
 *
 * Pure-library port of `bin/lib/diff.mjs`. Two exports:
 *   - `unifiedDiff(oldStr, newStr, filePath)` → unified-diff string
 *   - `generateDiff({ changes, root? })` → per-change summary + patch
 *
 * Behavior parity: the unified-diff output and the `generateDiff`
 * result shape are byte-identical to the legacy module across every
 * branch the legacy switch covers (`create`, `modify`, `delete`).
 *
 * The legacy CLI driver block is intentionally NOT ported — subprocess
 * invocations continue to hit `bin/lib/diff.mjs` until M5.
 *
 * Limitations preserved verbatim from legacy: this is NOT an
 * LCS-optimal diff. Lines are compared positionally, not aligned. For
 * a "preview before commit" use case this is sufficient (and matches
 * what existing consumers have always seen).
 *
 * @see bin/lib/diff.mjs (legacy reference)
 * @see specs/decisions/adr-005-module-layout.md (strangler-fig)
 * @see specs/implementation-plan.md T4.1.5
 */

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { assertInsideRoot } from './path-safety.js';

/**
 * Discriminated union over the three change types `generateDiff`
 * accepts. Field set matches the legacy module verbatim.
 */
export type Change =
  | { type: 'create'; path: string; content?: string }
  | { type: 'modify'; path: string; old?: string; new?: string; content?: string }
  | { type: 'delete'; path: string };

export interface GenerateDiffInput {
  changes?: Change[];
  root?: string;
}

/** Per-change diff entry. Field set matches legacy across all three types. */
export type DiffEntry =
  | {
      type: 'create';
      path: string;
      lines: number;
      diff: string;
    }
  | {
      type: 'modify';
      path: string;
      lines_added: number;
      lines_removed: number;
      diff: string;
    }
  | {
      type: 'delete';
      path: string;
      lines: number;
      diff: string;
    };

export interface DiffSummary {
  created: number;
  modified: number;
  deleted: number;
  lines_added: number;
  lines_removed: number;
}

export interface GenerateDiffResult {
  summary: DiffSummary;
  diffs: DiffEntry[];
  patch: string;
  total_changes: number;
}

/**
 * Generate a unified-diff string between two strings. Output format:
 *
 *   --- a/<filePath>
 *   +++ b/<filePath>
 *   @@ -<start>,<oldLen> +<start>,<newLen> @@
 *   <context line>
 *   -<removed line>
 *   +<added line>
 *   ...
 *
 * The hunk-header math + flush-after-3-unchanged-lines heuristic are
 * preserved from the legacy module.
 */
export function unifiedDiff(oldStr: string, newStr: string, filePath: string): string {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const result: string[] = [];

  result.push(`--- a/${filePath}`);
  result.push(`+++ b/${filePath}`);

  const maxLen = Math.max(oldLines.length, newLines.length);
  let contextStart = -1;
  const hunks: Array<{ start: number; lines: string[] }> = [];
  let currentHunk: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      if (currentHunk.length > 0) {
        currentHunk.push(` ${oldLine || ''}`);
      }
    } else {
      if (currentHunk.length === 0) {
        contextStart = Math.max(0, i - 3);
        for (let c = contextStart; c < i; c++) {
          currentHunk.push(` ${oldLines[c] || ''}`);
        }
      }
      if (oldLine !== undefined) {
        currentHunk.push(`-${oldLine}`);
      }
      if (newLine !== undefined) {
        currentHunk.push(`+${newLine}`);
      }
    }

    if (currentHunk.length > 0 && oldLine === newLine) {
      const unchangedTail = currentHunk.filter(
        (l, idx) => idx >= currentHunk.length - 3 && l.startsWith(' ')
      ).length;
      if (unchangedTail >= 3) {
        hunks.push({ start: contextStart + 1, lines: currentHunk.slice(0, -3) });
        currentHunk = [];
      }
    }
  }

  if (currentHunk.length > 0) {
    hunks.push({ start: contextStart + 1, lines: currentHunk });
  }

  for (const hunk of hunks) {
    const removed = hunk.lines.filter((l) => l.startsWith('-')).length;
    const added = hunk.lines.filter((l) => l.startsWith('+')).length;
    const context = hunk.lines.filter((l) => l.startsWith(' ')).length;
    result.push(`@@ -${hunk.start},${removed + context} +${hunk.start},${added + context} @@`);
    result.push(...hunk.lines);
  }

  return result.join('\n');
}

/**
 * Build a structured diff report from a list of pending changes. For
 * each change:
 *   - `create` → counts content lines, builds a `--- /dev/null` header
 *     diff with every line prefixed `+`.
 *   - `modify` → reads `change.old` (or falls back to current file
 *     content if absent), uses `change.new ?? change.content` for the
 *     new side, runs `unifiedDiff`. Counts net +/- per the legacy
 *     `Math.max(0, ...)` formula.
 *   - `delete` → reads current content (if file exists), builds a
 *     `+++ /dev/null` header diff with every line prefixed `-`.
 */
export function generateDiff(input: GenerateDiffInput): GenerateDiffResult {
  const { changes = [], root = '.' } = input;
  const resolvedRoot = path.resolve(root);

  const diffs: DiffEntry[] = [];
  let created = 0;
  let modified = 0;
  let deleted = 0;
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const change of changes) {
    // Pit Crew Adversary 3 (CRITICAL) closed: legacy generateDiff
    // would read absolute paths and `..` traversal payloads, leaking
    // arbitrary file contents into the rendered patch via stdin-supplied
    // `change.path`. assertInsideRoot rejects every escape with
    // ValidationError (exit 2), turning the disclosure into a clean
    // schema-violation error.
    assertInsideRoot(change.path, resolvedRoot, { schemaId: 'diff.generateDiff.change.path' });
    const fullPath = path.resolve(resolvedRoot, change.path);

    switch (change.type) {
      case 'create': {
        const content = change.content || '';
        const lines = content.split('\n').length;
        linesAdded += lines;
        created++;
        diffs.push({
          type: 'create',
          path: change.path,
          lines,
          diff:
            `--- /dev/null\n+++ b/${change.path}\n@@ -0,0 +1,${lines} @@\n` +
            content
              .split('\n')
              .map((l) => `+${l}`)
              .join('\n'),
        });
        break;
      }

      case 'modify': {
        let oldContent = change.old || '';
        if (!oldContent && existsSync(fullPath)) {
          oldContent = readFileSync(fullPath, 'utf8');
        }
        const newContent = change.new || change.content || '';
        const oldLines = oldContent.split('\n').length;
        const newLines = newContent.split('\n').length;
        const addedHere = Math.max(0, newLines - oldLines);
        const removedHere = Math.max(0, oldLines - newLines);
        linesAdded += addedHere;
        linesRemoved += removedHere;
        modified++;
        diffs.push({
          type: 'modify',
          path: change.path,
          lines_added: addedHere,
          lines_removed: removedHere,
          diff: unifiedDiff(oldContent, newContent, change.path),
        });
        break;
      }

      case 'delete': {
        let content = '';
        if (existsSync(fullPath)) {
          content = readFileSync(fullPath, 'utf8');
        }
        const lines = content.split('\n').length;
        linesRemoved += lines;
        deleted++;
        diffs.push({
          type: 'delete',
          path: change.path,
          lines,
          diff:
            `--- a/${change.path}\n+++ /dev/null\n@@ -1,${lines} +0,0 @@\n` +
            content
              .split('\n')
              .map((l) => `-${l}`)
              .join('\n'),
        });
        break;
      }
    }
  }

  const patch = diffs.map((d) => d.diff).join('\n\n');

  return {
    summary: {
      created,
      modified,
      deleted,
      lines_added: linesAdded,
      lines_removed: linesRemoved,
    },
    diffs,
    patch,
    total_changes: changes.length,
  };
}
