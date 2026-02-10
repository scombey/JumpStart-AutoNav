#!/usr/bin/env node

/**
 * JumpStart Diagram Verifier — CLI Tool
 *
 * Scans Markdown files in specs/ for Mermaid code blocks and performs
 * structural syntax validation. Designed to catch common authoring mistakes
 * before diagrams reach rendering engines.
 *
 * Usage:
 *   npx jumpstart-mode verify [--dir <path>] [--file <path>] [--strict] [--json]
 *
 * Exit codes:
 *   0 — All diagrams pass validation
 *   1 — One or more diagrams have errors
 *   2 — No diagrams found (warning)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Colour helpers (graceful fallback) ──────────────────────────────────────

let chalk;
try {
  chalk = require('chalk');
} catch {
  // Minimal stub when chalk is unavailable
  const id = (s) => s;
  chalk = { red: id, yellow: id, green: id, cyan: id, gray: id, bold: id, dim: id };
  chalk.red.bold = id;
  chalk.green.bold = id;
}

// ── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { dirs: [], files: [], strict: false, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' && argv[i + 1]) {
      args.dirs.push(argv[++i]);
    } else if (a === '--file' && argv[i + 1]) {
      args.files.push(argv[++i]);
    } else if (a === '--strict') {
      args.strict = true;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  // Default to specs/ if nothing specified
  if (args.dirs.length === 0 && args.files.length === 0) {
    args.dirs.push('specs');
  }
  return args;
}

function printHelp() {
  console.log(`
JumpStart Diagram Verifier

Scans Markdown files for Mermaid diagrams and validates syntax.

Usage:
  npx jumpstart-mode verify [options]

Options:
  --dir <path>    Directory to scan (default: specs). Can be repeated.
  --file <path>   Single file to scan. Can be repeated.
  --strict        Treat warnings as errors.
  --json          Output results as JSON.
  -h, --help      Show this help message.

Examples:
  npx jumpstart-mode verify
  npx jumpstart-mode verify --dir specs --dir docs
  npx jumpstart-mode verify --file specs/architecture.md --strict
`);
}

// ── File discovery ──────────────────────────────────────────────────────────

function findMarkdownFiles(dir) {
  const results = [];
  const base = path.resolve(dir);
  if (!fs.existsSync(base)) return results;

  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        results.push(full);
      }
    }
  }
  walk(base);
  return results;
}

// ── Mermaid block extraction ────────────────────────────────────────────────

/**
 * Extracts all ```mermaid ... ``` blocks from a file's content,
 * recording start line, end line, and raw body.
 */
function extractMermaidBlocks(content) {
  const lines = content.split('\n');
  const blocks = [];
  let inside = false;
  let startLine = 0;
  let body = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!inside && /^```mermaid\b/i.test(trimmed)) {
      inside = true;
      startLine = i + 1; // 1-based
      body = [];
    } else if (inside && trimmed === '```') {
      blocks.push({
        startLine,
        endLine: i + 1,
        body: body.join('\n'),
      });
      inside = false;
    } else if (inside) {
      body.push(lines[i]);
    }
  }

  // Unclosed block
  if (inside) {
    blocks.push({
      startLine,
      endLine: lines.length,
      body: body.join('\n'),
      unclosed: true,
    });
  }

  return blocks;
}

// ── Validation rules ────────────────────────────────────────────────────────

const KNOWN_DIAGRAM_TYPES = [
  'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'stateDiagram-v2', 'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart',
  'requirementDiagram', 'gitGraph', 'mindmap', 'timeline', 'sankey-beta',
  'xychart-beta', 'block-beta',
  // C4 extension types
  'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment',
];

const C4_DIAGRAM_TYPES = ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'];

const C4_FUNCTIONS = [
  // Elements: name(alias, label, ?techn, ?descr, ?sprite, ?tags, ?link)
  'Person', 'Person_Ext',
  'System', 'System_Ext', 'SystemDb', 'SystemDb_Ext', 'SystemQueue', 'SystemQueue_Ext',
  'Container', 'Container_Ext', 'ContainerDb', 'ContainerDb_Ext', 'ContainerQueue', 'ContainerQueue_Ext',
  'Component', 'Component_Ext', 'ComponentDb', 'ComponentDb_Ext', 'ComponentQueue', 'ComponentQueue_Ext',
  // Boundaries
  'Boundary', 'Enterprise_Boundary', 'System_Boundary', 'Container_Boundary',
  // Relationships
  'Rel', 'Rel_Back', 'Rel_Neighbor', 'Rel_Back_Neighbor',
  'Rel_D', 'Rel_Down', 'Rel_U', 'Rel_Up', 'Rel_L', 'Rel_Left', 'Rel_R', 'Rel_Right',
  'BiRel', 'BiRel_Neighbor', 'BiRel_D', 'BiRel_U', 'BiRel_L', 'BiRel_R',
  // Layout
  'UpdateElementStyle', 'UpdateRelStyle', 'UpdateLayoutConfig',
];

/**
 * Validate a single Mermaid block. Returns an array of
 * { level: 'error' | 'warning', message: string, line?: number }.
 */
function validateBlock(block) {
  const issues = [];
  const { body, startLine, unclosed } = block;

  if (unclosed) {
    issues.push({ level: 'error', message: 'Unclosed mermaid code block — missing closing ```', line: startLine });
    return issues; // Can't validate further
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    issues.push({ level: 'error', message: 'Empty mermaid code block', line: startLine });
    return issues;
  }

  // Determine diagram type from first meaningful line
  const bodyLines = trimmedBody.split('\n');
  const firstLine = bodyLines[0].trim();
  const diagramType = detectDiagramType(firstLine);

  if (!diagramType) {
    issues.push({
      level: 'error',
      message: `Unrecognised diagram type: "${firstLine.split(/\s/)[0]}". Expected one of: ${KNOWN_DIAGRAM_TYPES.join(', ')}`,
      line: startLine,
    });
    return issues;
  }

  // ── Generic structural checks ──

  // Bracket balance (skip for erDiagram — uses { } for entity field blocks with different semantics)
  if (diagramType !== 'erDiagram') {
    const bracketIssues = checkBracketBalance(body, startLine);
    issues.push(...bracketIssues);
  }

  // Subgraph / end pairing (for graph/flowchart)
  if (['graph', 'flowchart'].includes(diagramType)) {
    issues.push(...checkSubgraphEndPairing(body, startLine));
    issues.push(...checkArrowSyntax(body, startLine));
  }

  // ── C4-specific checks ──
  if (C4_DIAGRAM_TYPES.includes(diagramType)) {
    issues.push(...checkC4Syntax(body, startLine));
  }

  // ── erDiagram checks ──
  if (diagramType === 'erDiagram') {
    issues.push(...checkErDiagram(body, startLine));
  }

  // ── classDiagram checks ──
  if (diagramType === 'classDiagram') {
    issues.push(...checkClassDiagram(body, startLine));
  }

  return issues;
}

function detectDiagramType(firstLine) {
  for (const dt of KNOWN_DIAGRAM_TYPES) {
    // Match "graph TD", "graph LR", "flowchart TB", "C4Context", etc.
    if (firstLine === dt || firstLine.startsWith(dt + ' ') || firstLine.startsWith(dt + '\t')) {
      return dt;
    }
  }
  return null;
}

// ── Bracket balance ─────────────────────────────────────────────────────────

function checkBracketBalance(body, baseLineNum) {
  const issues = [];
  const stacks = { '{': [], '[': [], '(': [] };
  const closers = { '}': '{', ']': '[', ')': '(' };
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment lines
    if (line.trim().startsWith('%%')) continue;
    // Skip quoted strings (rough heuristic)
    const unquoted = line.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');

    for (const ch of unquoted) {
      if (ch in stacks) {
        stacks[ch].push(baseLineNum + i);
      } else if (ch in closers) {
        const opener = closers[ch];
        if (stacks[opener].length === 0) {
          issues.push({
            level: 'error',
            message: `Unmatched closing '${ch}'`,
            line: baseLineNum + i,
          });
        } else {
          stacks[opener].pop();
        }
      }
    }
  }

  for (const [opener, remaining] of Object.entries(stacks)) {
    for (const lineNum of remaining) {
      issues.push({
        level: 'error',
        message: `Unmatched opening '${opener}'`,
        line: lineNum,
      });
    }
  }

  return issues;
}

// ── Subgraph / end pairing ──────────────────────────────────────────────────

function checkSubgraphEndPairing(body, baseLineNum) {
  const issues = [];
  let depth = 0;
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^subgraph\b/i.test(trimmed)) {
      depth++;
    } else if (/^end$/i.test(trimmed)) {
      depth--;
      if (depth < 0) {
        issues.push({ level: 'error', message: 'Unexpected "end" without matching "subgraph"', line: baseLineNum + i });
        depth = 0;
      }
    }
  }

  if (depth > 0) {
    issues.push({ level: 'error', message: `${depth} unclosed subgraph(s) — missing "end" keyword(s)` });
  }

  return issues;
}

// ── Arrow syntax for graph/flowchart ────────────────────────────────────────

function checkArrowSyntax(body, baseLineNum) {
  const issues = [];
  const lines = body.split('\n');
  const validArrowPattern = /-->|==>|-.->|---->|~~~|---|===|---|--\s|-->/;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('%%') || trimmed.startsWith('style') || trimmed.startsWith('class') ||
        trimmed.startsWith('click') || trimmed.startsWith('linkStyle') || /^(graph|flowchart)\s/.test(trimmed) ||
        /^subgraph\b/i.test(trimmed) || /^end$/i.test(trimmed) || !trimmed) {
      continue;
    }

    // Check if line looks like a node connection but uses invalid syntax
    if (/\w+\s*->\s*\w+/.test(trimmed) && !validArrowPattern.test(trimmed)) {
      issues.push({
        level: 'warning',
        message: `Possible invalid arrow syntax. Use "-->" not "->". Found: "${trimmed.substring(0, 60)}"`,
        line: baseLineNum + i,
      });
    }
  }

  return issues;
}

// ── C4 syntax checks ────────────────────────────────────────────────────────

function checkC4Syntax(body, baseLineNum) {
  const issues = [];
  const lines = body.split('\n');
  const funcPattern = /^\s*(\w+)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('title ') ||
        trimmed === '}' || trimmed === '{' || C4_DIAGRAM_TYPES.includes(trimmed)) {
      continue;
    }

    const funcMatch = trimmed.match(funcPattern);
    if (funcMatch) {
      const funcName = funcMatch[1];

      // Check if it's a known C4 function
      if (!C4_FUNCTIONS.includes(funcName)) {
        // Only warn if it looks like a function call (not a boundary closing etc.)
        if (trimmed.includes('(') && trimmed.includes(')')) {
          issues.push({
            level: 'warning',
            message: `Unknown C4 function "${funcName}". Known functions: Person, System, Container, Component, Boundary, Rel, etc.`,
            line: baseLineNum + i,
          });
        }
      }

      // Check minimum argument count for element functions
      if (['Person', 'Person_Ext', 'System', 'System_Ext', 'SystemDb', 'SystemDb_Ext',
           'Container', 'Container_Ext', 'ContainerDb', 'ContainerDb_Ext',
           'Component', 'Component_Ext', 'ComponentDb', 'ComponentDb_Ext'].includes(funcName)) {
        const argCount = countArgs(trimmed);
        if (argCount < 2) {
          issues.push({
            level: 'error',
            message: `${funcName}() requires at least 2 arguments (alias, label). Found ${argCount}.`,
            line: baseLineNum + i,
          });
        }
      }

      // Check Rel minimum arguments
      if (/^(Rel|BiRel)/.test(funcName)) {
        const argCount = countArgs(trimmed);
        if (argCount < 3) {
          issues.push({
            level: 'error',
            message: `${funcName}() requires at least 3 arguments (from, to, label). Found ${argCount}.`,
            line: baseLineNum + i,
          });
        }
      }

      // Check Boundary minimum arguments
      if (/Boundary$/.test(funcName)) {
        const argCount = countArgs(trimmed);
        if (argCount < 2) {
          issues.push({
            level: 'error',
            message: `${funcName}() requires at least 2 arguments (alias, label). Found ${argCount}.`,
            line: baseLineNum + i,
          });
        }
      }
    }

    // Warn if graph/flowchart arrows are used in C4 diagrams
    if (/\w+\s*-->?\s*\w+/.test(trimmed) && !trimmed.startsWith('%%')) {
      issues.push({
        level: 'error',
        message: 'Arrow syntax ("-->") is not valid in C4 diagrams. Use Rel() functions instead.',
        line: baseLineNum + i,
      });
    }

    // Warn about square-bracket nodes in C4
    if (/\w+\[.*\]/.test(trimmed) && !funcMatch && !trimmed.startsWith('%%')) {
      issues.push({
        level: 'warning',
        message: 'Square-bracket node syntax is not valid in C4 diagrams. Use element functions like Person(), System(), Container().',
        line: baseLineNum + i,
      });
    }
  }

  return issues;
}

/**
 * Count arguments in a function call like: FuncName(arg1, "arg 2", arg3)
 * Handles quoted commas correctly.
 */
function countArgs(line) {
  const match = line.match(/\(([^)]*)\)/);
  if (!match || !match[1].trim()) return 0;
  const inner = match[1];

  let count = 1;
  let inQuote = false;
  let quoteChar = '';
  for (const ch of inner) {
    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true;
      quoteChar = ch;
    } else if (inQuote && ch === quoteChar) {
      inQuote = false;
    } else if (!inQuote && ch === ',') {
      count++;
    }
  }
  return count;
}

// ── erDiagram checks ────────────────────────────────────────────────────────

function checkErDiagram(body, baseLineNum) {
  const issues = [];
  const lines = body.split('\n');
  const relationPattern = /\S+\s+((\|\||\|o|o\||o\{|\{o|\|\{|\{||\}\||\}o|o\})\s*--\s*(\|\||\|o|o\||o\{|\{o|\|\{|\{||\}\||\}o|o\}))?\s+\S+\s*:/;
  const validCardinality = /(\|\||o\||o\{|\}\||o\}|\{o|\|o|\|\{|\{\||\}o)/;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed === 'erDiagram') continue;

    // Check for entity blocks
    if (/^\w+\s*\{/.test(trimmed)) {
      // Entity block opening — valid
      continue;
    }

    // Check relationship lines
    if (trimmed.includes('--') && trimmed.includes(':')) {
      // Rough check for valid relationship syntax
      if (!relationPattern.test(trimmed)) {
        // Check if cardinality symbols look wrong
        const parts = trimmed.split('--');
        if (parts.length === 2) {
          const leftSide = parts[0].trim();
          const leftSymbol = leftSide.split(/\s+/).pop();
          if (leftSymbol && !validCardinality.test(leftSymbol) && !/^\w+$/.test(leftSymbol)) {
            issues.push({
              level: 'warning',
              message: `Possibly invalid ER relationship cardinality: "${leftSymbol}". Use ||, o|, o{, }|, }o, etc.`,
              line: baseLineNum + i,
            });
          }
        }
      }
    }
  }

  return issues;
}

// ── classDiagram checks ─────────────────────────────────────────────────────

function checkClassDiagram(body, baseLineNum) {
  const issues = [];
  const lines = body.split('\n');
  const validRelationships = /(<\|--|--\*|--o|-->|--\>|\.\.>|\.\.\|>|--|\.\.)/;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed === 'classDiagram' ||
        trimmed.startsWith('direction') || trimmed.startsWith('note') ||
        trimmed.startsWith('class ') || trimmed.startsWith('<<') ||
        trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('#') ||
        trimmed.startsWith('~') || trimmed === '}') {
      continue;
    }

    // Check for class member lines inside a class block (indented)
    if (/^\s+[+\-#~]/.test(lines[i])) continue;

    // Check relationship lines
    if (validRelationships.test(trimmed)) {
      // Valid relationship — check for label
      continue;
    }
  }

  return issues;
}

// ── Report formatting ───────────────────────────────────────────────────────

function formatReport(results, jsonOutput) {
  if (jsonOutput) {
    return JSON.stringify(results, null, 2);
  }

  const lines = [];
  lines.push('');
  lines.push(chalk.bold('═══════════════════════════════════════════════════════'));
  lines.push(chalk.bold('  JumpStart Diagram Verifier'));
  lines.push(chalk.bold('═══════════════════════════════════════════════════════'));
  lines.push('');

  let totalDiagrams = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalPassed = 0;

  for (const fileResult of results) {
    const relPath = path.relative(process.cwd(), fileResult.file);
    const diagrams = fileResult.diagrams;

    if (diagrams.length === 0) continue;

    lines.push(chalk.cyan(`📄 ${relPath}`));

    for (const diag of diagrams) {
      totalDiagrams++;
      const errors = diag.issues.filter(i => i.level === 'error');
      const warnings = diag.issues.filter(i => i.level === 'warning');
      totalErrors += errors.length;
      totalWarnings += warnings.length;

      if (errors.length === 0 && warnings.length === 0) {
        totalPassed++;
        lines.push(chalk.green(`  ✓ Lines ${diag.startLine}–${diag.endLine}: ${diag.type || 'unknown'} — OK`));
      } else {
        const status = errors.length > 0 ? chalk.red.bold('FAIL') : chalk.yellow('WARN');
        lines.push(`  ${status} Lines ${diag.startLine}–${diag.endLine}: ${diag.type || 'unknown'}`);
        for (const issue of diag.issues) {
          const icon = issue.level === 'error' ? chalk.red('  ✗') : chalk.yellow('  ⚠');
          const lineRef = issue.line ? chalk.dim(` (line ${issue.line})`) : '';
          lines.push(`    ${icon} ${issue.message}${lineRef}`);
        }
      }
    }
    lines.push('');
  }

  // Summary
  lines.push(chalk.bold('───────────────────────────────────────────────────────'));
  if (totalDiagrams === 0) {
    lines.push(chalk.yellow('  ⚠ No Mermaid diagrams found in scanned files.'));
  } else {
    lines.push(`  Diagrams scanned: ${totalDiagrams}`);
    lines.push(chalk.green(`  Passed:  ${totalPassed}`));
    if (totalWarnings > 0) lines.push(chalk.yellow(`  Warnings: ${totalWarnings}`));
    if (totalErrors > 0) lines.push(chalk.red(`  Errors:   ${totalErrors}`));

    if (totalErrors === 0 && totalWarnings === 0) {
      lines.push('');
      lines.push(chalk.green.bold('  ✓ All diagrams passed verification.'));
    } else if (totalErrors === 0) {
      lines.push('');
      lines.push(chalk.yellow('  ⚠ All diagrams structurally valid, but some warnings found.'));
    } else {
      lines.push('');
      lines.push(chalk.red.bold('  ✗ Diagram verification failed. Fix errors above.'));
    }
  }
  lines.push(chalk.bold('═══════════════════════════════════════════════════════'));
  lines.push('');

  return lines.join('\n');
}

// ── Main entry ──────────────────────────────────────────────────────────────

function run(argv) {
  const args = parseArgs(argv || process.argv);

  // Gather files
  let files = [...args.files.map(f => path.resolve(f))];
  for (const dir of args.dirs) {
    files.push(...findMarkdownFiles(dir));
  }

  // Dedupe
  files = [...new Set(files)];

  if (files.length === 0) {
    if (args.json) {
      console.log(JSON.stringify({ diagrams: 0, errors: 0, warnings: 0, files: [] }));
    } else {
      console.log(chalk.yellow('\n  ⚠ No Markdown files found to scan.\n'));
    }
    process.exit(2);
  }

  // Scan each file
  const results = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      results.push({ file, error: 'File not found', diagrams: [] });
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const blocks = extractMermaidBlocks(content);

    const diagrams = blocks.map(block => {
      const issues = validateBlock(block);
      const firstLine = block.body.trim().split('\n')[0] || '';
      const type = detectDiagramType(firstLine.trim()) || firstLine.split(/\s/)[0] || 'unknown';
      return {
        startLine: block.startLine,
        endLine: block.endLine,
        type,
        issues,
      };
    });

    results.push({ file, diagrams });
  }

  // Output
  console.log(formatReport(results, args.json));

  // Determine exit code
  let hasErrors = false;
  let hasDiagrams = false;
  for (const r of results) {
    for (const d of r.diagrams) {
      hasDiagrams = true;
      for (const issue of d.issues) {
        if (issue.level === 'error') hasErrors = true;
        if (args.strict && issue.level === 'warning') hasErrors = true;
      }
    }
  }

  if (!hasDiagrams) process.exit(2);
  process.exit(hasErrors ? 1 : 0);
}

// Allow both CLI and programmatic usage
module.exports = { run, extractMermaidBlocks, validateBlock, detectDiagramType };

if (require.main === module) {
  run();
}
