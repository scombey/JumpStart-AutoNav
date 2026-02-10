/**
 * diff.js — Dry-Run Mode (Item 77)
 *
 * Shows proposed changes before writing to disk.
 * Generates a patch-style summary for human review.
 *
 * Usage:
 *   echo '{"changes":[...]}' | node bin/lib/diff.js
 *
 * Input (stdin JSON):
 *   {
 *     "changes": [
 *       { "type": "create", "path": "src/index.js", "content": "..." },
 *       { "type": "modify", "path": "src/utils.js", "old": "...", "new": "..." },
 *       { "type": "delete", "path": "src/legacy.js" }
 *     ],
 *     "root": "."
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "summary": { "created": 1, "modified": 1, "deleted": 1 },
 *     "diffs": [...],
 *     "patch": "..."
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Generate a unified diff between two strings.
 *
 * @param {string} oldStr - Original content.
 * @param {string} newStr - New content.
 * @param {string} filePath - File path for header.
 * @returns {string} Unified diff string.
 */
function unifiedDiff(oldStr, newStr, filePath) {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const result = [];

  result.push(`--- a/${filePath}`);
  result.push(`+++ b/${filePath}`);

  // Simple line-by-line diff (not LCS-optimal, but sufficient for preview)
  const maxLen = Math.max(oldLines.length, newLines.length);
  let contextStart = -1;
  const hunks = [];
  let currentHunk = [];

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
        // Add context lines
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

    // Flush hunk after 3 unchanged lines following changes
    if (currentHunk.length > 0 && oldLine === newLine) {
      const unchangedTail = currentHunk.filter((l, idx) =>
        idx >= currentHunk.length - 3 && l.startsWith(' ')
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
    const removed = hunk.lines.filter(l => l.startsWith('-')).length;
    const added = hunk.lines.filter(l => l.startsWith('+')).length;
    const context = hunk.lines.filter(l => l.startsWith(' ')).length;
    result.push(`@@ -${hunk.start},${removed + context} +${hunk.start},${added + context} @@`);
    result.push(...hunk.lines);
  }

  return result.join('\n');
}

/**
 * Generate a diff summary for proposed changes.
 *
 * @param {object} input - Diff options.
 * @param {Array} input.changes - Array of change objects.
 * @param {string} [input.root] - Project root.
 * @returns {object} Diff results.
 */
function generateDiff(input) {
  const { changes = [], root = '.' } = input;
  const resolvedRoot = path.resolve(root);

  const diffs = [];
  let created = 0;
  let modified = 0;
  let deleted = 0;
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const change of changes) {
    const fullPath = path.resolve(resolvedRoot, change.path);

    switch (change.type) {
      case 'create': {
        const lines = (change.content || '').split('\n').length;
        linesAdded += lines;
        created++;
        diffs.push({
          type: 'create',
          path: change.path,
          lines,
          diff: `--- /dev/null\n+++ b/${change.path}\n@@ -0,0 +1,${lines} @@\n` +
            (change.content || '').split('\n').map(l => `+${l}`).join('\n')
        });
        break;
      }

      case 'modify': {
        let oldContent = change.old || '';
        if (!oldContent && fs.existsSync(fullPath)) {
          oldContent = fs.readFileSync(fullPath, 'utf8');
        }
        const newContent = change.new || change.content || '';
        const oldLines = oldContent.split('\n').length;
        const newLines = newContent.split('\n').length;
        linesAdded += Math.max(0, newLines - oldLines);
        linesRemoved += Math.max(0, oldLines - newLines);
        modified++;
        diffs.push({
          type: 'modify',
          path: change.path,
          lines_added: Math.max(0, newLines - oldLines),
          lines_removed: Math.max(0, oldLines - newLines),
          diff: unifiedDiff(oldContent, newContent, change.path)
        });
        break;
      }

      case 'delete': {
        let content = '';
        if (fs.existsSync(fullPath)) {
          content = fs.readFileSync(fullPath, 'utf8');
        }
        const lines = content.split('\n').length;
        linesRemoved += lines;
        deleted++;
        diffs.push({
          type: 'delete',
          path: change.path,
          lines,
          diff: `--- a/${change.path}\n+++ /dev/null\n@@ -1,${lines} +0,0 @@\n` +
            content.split('\n').map(l => `-${l}`).join('\n')
        });
        break;
      }
    }
  }

  const patch = diffs.map(d => d.diff).join('\n\n');

  return {
    summary: { created, modified, deleted, lines_added: linesAdded, lines_removed: linesRemoved },
    diffs,
    patch,
    total_changes: changes.length
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (process.argv[1] && (
  process.argv[1].endsWith('diff.js') ||
  process.argv[1].endsWith('diff')
)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const parsed = input.trim() ? JSON.parse(input) : {};
      const result = generateDiff(parsed);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });

  if (process.stdin.isTTY) {
    const result = generateDiff({});
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}

export { generateDiff, unifiedDiff };
