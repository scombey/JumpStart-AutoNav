#!/usr/bin/env node
/**
 * extract-public-surface.mjs — cross-module contract harness.
 *
 * AST-based public-surface extractor. Walks `src/lib/**\/*.ts` and
 * cross-references method calls against class declarations to detect
 * drift of the form that bit us in v1.1.13: a class declared 4
 * methods, the caller invoked 12, and CI never noticed because the
 * missing methods only threw on the first phase-validation error.
 *
 * Detection scope (conservative — false-positive-averse):
 *   1. Class instantiation: `const x = new ClassName(...)` recorded in a
 *      per-file instantiation log keyed by (varName, sourcePosition).
 *   2. Method calls on tracked instances: `x.method(...)` is checked
 *      against the most recent `new ClassName()` assignment to `x`
 *      whose source position is BEFORE the call site. This handles
 *      reassignments correctly:
 *        let x = new A(); x.aMethod();   // checked against A
 *        x = new B();     x.bMethod();   // checked against B
 *      A flat last-write-wins map (which the original implementation
 *      used) would false-positive `x.aMethod()` against `B`.
 *
 * Out of scope (intentional, would generate noise on legacy code):
 *   - Arity-mismatch checks (default params, rest, options-bag pattern)
 *   - Cross-module function-import drift (T3.6 partially covers this)
 *   - Dynamic dispatch (`obj[methodName]()`) — purely runtime
 *   - Type-flow inference across function boundaries
 *
 * Output: `.jumpstart/metrics/drift-catches.json` (gitignored). Schema:
 *   {
 *     "timestamp": ISO8601,
 *     "scanned": { "tsFiles": N, "jsFiles": N, "callSites": N,
 *                  "parseErrors": N, "truncatedFiles": N },
 *     "incidents": [
 *       { "type": "missing_method", "callSite": {...}, "expected": {...}, "actual": {...} },
 *       { "type": "parse_error", "callSite": {...}, "actual": { "error": "..." } },
 *       { "type": "file_truncated", "callSite": {...}, "actual": { "callSites": N, "cap": N } }
 *     ]
 *   }
 *
 * Per ADR-007 + implementation-plan T3.1, this script uses:
 *   - `typescript` Compiler API for `.ts` files (strict + path-aware)
 *   - `@babel/parser` for `.js` files (lenient + CommonJS-friendly)
 *
 * Acceptance per T3.3:
 *   - Run against v1.1.14 main → 0 missing-method incidents
 *   - Run against tests/fixtures/contract-drift/simulation-tracer-vs-holodeck/
 *     → exactly 8 incidents with file:line refs
 *
 * @see specs/implementation-plan.md T3.1, T3.2, T3.3, Checkpoint C3
 * @see specs/architecture.md §Drift-catches log
 * @see specs/decisions/adr-007-ipc-envelope-versioning.md
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { parse as babelParse } from '@babel/parser';
import babelTraverseModule from '@babel/traverse';
import * as ts from 'typescript';

// Babel publishes a CJS default export when imported from ESM.
const babelTraverse = babelTraverseModule.default ?? babelTraverseModule;

const REPO_ROOT = process.cwd();

// Post-M11 phase 5e cutover: strangler tail fully retired. The single
// canonical surface is `src/lib/`; `bin/lib/` was deleted in M11.
const SCAN_ROOTS = ['src/lib'];

const OUTPUT_DIR = '.jumpstart/metrics';
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'drift-catches.json');

// DoS guard: cap per-file call sites to keep a single pathological file
// from producing a hundred-megabyte report (Pit Crew Adversary 5).
const PER_FILE_CALL_SITE_CAP = 5_000;

// Allow the harness to be pointed at a synthetic fixture (T3.2/T3.3).
// Usage: node scripts/extract-public-surface.mjs --root=tests/fixtures/contract-drift/foo
const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith('--root='));
const explicitRoots = rootArg ? [rootArg.slice('--root='.length)] : null;
const reportPathArg = args.find((a) => a.startsWith('--out='));
const reportPath = reportPathArg ? reportPathArg.slice('--out='.length) : OUTPUT_PATH;

const roots = explicitRoots ?? SCAN_ROOTS;

// ─────────────────────────────────────────────────────────────────────────
// File walker
// ─────────────────────────────────────────────────────────────────────────

function* walkSourceFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSourceFiles(full);
    } else if (
      entry.isFile() &&
      /\.(m?[jt]s)$/.test(entry.name) &&
      !/\.d\.m?ts$/.test(entry.name)
    ) {
      yield full;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// JS extractor (@babel/parser)
// ─────────────────────────────────────────────────────────────────────────
//
// Walks a JS file's AST and produces:
//   - declaredClasses: Map<className, Set<methodName>>
//   - instantiations:  Array<{ varName, className, pos }>  // per-call-site lookup
//   - methodCalls:     Array<{ varName, methodName, line, pos, snippet }>
//
// `pos` is the source-text byte offset; we use it to resolve which
// instantiation a call site refers to (most recent BEFORE the call).

function extractJs(_file, source) {
  const ast = babelParse(source, {
    sourceType: 'unambiguous',
    plugins: ['classProperties'],
    errorRecovery: true,
  });

  const declaredClasses = new Map();
  const instantiations = [];
  const methodCalls = [];
  const lines = source.split('\n');

  babelTraverse(ast, {
    ClassDeclaration(astPath) {
      const className = astPath.node.id?.name;
      if (!className) return;
      const methods = new Set();
      for (const member of astPath.node.body.body) {
        if (member.type === 'ClassMethod' || member.type === 'ClassPrivateMethod') {
          if (member.key.type === 'Identifier') methods.add(member.key.name);
        } else if (
          member.type === 'ClassProperty' &&
          (member.value?.type === 'ArrowFunctionExpression' ||
            member.value?.type === 'FunctionExpression')
        ) {
          if (member.key.type === 'Identifier') methods.add(member.key.name);
        }
      }
      declaredClasses.set(className, methods);
    },

    VariableDeclarator(astPath) {
      const init = astPath.node.init;
      if (init?.type === 'NewExpression' && init.callee.type === 'Identifier') {
        const varNode = astPath.node.id;
        if (varNode.type === 'Identifier') {
          instantiations.push({
            varName: varNode.name,
            className: init.callee.name,
            pos: astPath.node.start ?? 0,
          });
        }
      }
    },

    AssignmentExpression(astPath) {
      const node = astPath.node;
      if (
        node.right?.type === 'NewExpression' &&
        node.right.callee.type === 'Identifier' &&
        node.left.type === 'Identifier'
      ) {
        instantiations.push({
          varName: node.left.name,
          className: node.right.callee.name,
          pos: node.start ?? 0,
        });
      }
    },

    CallExpression(astPath) {
      if (methodCalls.length >= PER_FILE_CALL_SITE_CAP) return;
      const callee = astPath.node.callee;
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.property.type === 'Identifier' &&
        !callee.computed
      ) {
        const line = astPath.node.loc?.start.line ?? 0;
        methodCalls.push({
          varName: callee.object.name,
          methodName: callee.property.name,
          line,
          pos: astPath.node.start ?? 0,
          snippet: lines[line - 1]?.trim() ?? '',
        });
      }
    },
  });

  return { declaredClasses, instantiations, methodCalls };
}

// ─────────────────────────────────────────────────────────────────────────
// TS extractor (typescript Compiler API)
// ─────────────────────────────────────────────────────────────────────────

function extractTs(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const declaredClasses = new Map();
  const instantiations = [];
  const methodCalls = [];
  const lines = source.split('\n');

  function lineOf(node) {
    return ts.getLineAndCharacterOfPosition(sf, node.getStart(sf)).line + 1;
  }

  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const methods = new Set();
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          methods.add(member.name.text);
        } else if (
          ts.isPropertyDeclaration(member) &&
          member.name &&
          ts.isIdentifier(member.name) &&
          member.initializer &&
          (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))
        ) {
          // Property-initialized callable, e.g. `name = (): T => {}`.
          // Non-callable typed fields like `name: string = ''` are NOT
          // treated as methods (Pit Crew Reviewer H2).
          methods.add(member.name.text);
        }
      }
      declaredClasses.set(node.name.text, methods);
    }

    // const x = new Foo()  (declaration form)
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isNewExpression(node.initializer)
    ) {
      const expr = node.initializer.expression;
      if (ts.isIdentifier(expr) && ts.isIdentifier(node.name)) {
        instantiations.push({
          varName: node.name.text,
          className: expr.text,
          pos: node.getStart(sf),
        });
      }
    }

    // x = new Foo()  (assignment form — covers late-init pattern; Pit
    // Crew Reviewer H3)
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ts.isNewExpression(node.right) &&
      ts.isIdentifier(node.right.expression)
    ) {
      instantiations.push({
        varName: node.left.text,
        className: node.right.expression.text,
        pos: node.getStart(sf),
      });
    }

    if (
      methodCalls.length < PER_FILE_CALL_SITE_CAP &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      ts.isIdentifier(node.expression.name)
    ) {
      const line = lineOf(node);
      methodCalls.push({
        varName: node.expression.expression.text,
        methodName: node.expression.name.text,
        line,
        pos: node.getStart(sf),
        snippet: lines[line - 1]?.trim() ?? '',
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return { declaredClasses, instantiations, methodCalls };
}

// ─────────────────────────────────────────────────────────────────────────
// Driver — extract, cross-reference, emit report
// ─────────────────────────────────────────────────────────────────────────

const allClasses = new Map(); // className -> { file, methods: Set<string> }
const fileResults = []; // [{ file, instantiations, methodCalls, source }]
const incidents = [];
let tsCount = 0;
let jsCount = 0;
let parseErrors = 0;
let truncatedFiles = 0;

for (const root of roots) {
  for (const file of walkSourceFiles(root)) {
    const source = readFileSync(file, 'utf8');
    const isTs = /\.tsx?$/.test(file);
    const relPath = path.relative(REPO_ROOT, file);
    let result;
    try {
      result = isTs ? extractTs(file, source) : extractJs(file, source);
    } catch (err) {
      // Per ADR-006, surface parse errors as a typed drift-class so the
      // drift counter doesn't silently skip files. Without this a file
      // that crashes Babel (e.g. deeply-nested arrow chain) would mask
      // real drift inside it (Pit Crew Adversary 5).
      console.warn(`[extract-public-surface] parse error in ${relPath}: ${err.message}`);
      parseErrors++;
      incidents.push({
        type: 'parse_error',
        callSite: { file: relPath, line: 0, snippet: '' },
        actual: { error: String(err.message).slice(0, 500) },
      });
      continue;
    }

    if (isTs) tsCount++;
    else jsCount++;

    if (result.methodCalls.length >= PER_FILE_CALL_SITE_CAP) {
      truncatedFiles++;
      incidents.push({
        type: 'file_truncated',
        callSite: { file: relPath, line: 0, snippet: '' },
        actual: { callSites: result.methodCalls.length, cap: PER_FILE_CALL_SITE_CAP },
      });
    }

    for (const [name, methods] of result.declaredClasses) {
      // First-declaration wins.
      if (!allClasses.has(name)) {
        allClasses.set(name, { file: relPath, methods });
      }
    }

    fileResults.push({
      file: relPath,
      instantiations: result.instantiations,
      methodCalls: result.methodCalls,
    });
  }
}

let totalCallSites = 0;

for (const { file, instantiations, methodCalls } of fileResults) {
  totalCallSites += methodCalls.length;
  // Sort instantiations by source position once per file for log(n) lookup.
  const sortedInsts = instantiations.slice().sort((a, b) => a.pos - b.pos);

  for (const { varName, methodName, line, pos, snippet } of methodCalls) {
    // Per-call-site instantiation resolution: find the most recent
    // (varName, className) assignment whose pos < this call's pos.
    // Naive O(n*m) scan is fine — files have at most a few dozen
    // instantiations; the inner loop is tiny (Pit Crew QA 4 / Rev M1).
    let className;
    for (const inst of sortedInsts) {
      if (inst.pos >= pos) break;
      if (inst.varName === varName) className = inst.className;
    }
    if (!className) continue; // can't trace var → class statically; skip
    const cls = allClasses.get(className);
    if (!cls) continue; // class is from outside our scan scope (e.g. node builtin)
    if (cls.methods.has(methodName)) continue; // declared — fine
    incidents.push({
      type: 'missing_method',
      callSite: { file, line, snippet },
      expected: { class: className, declaredIn: cls.file },
      actual: { calledMethod: methodName, varName },
    });
  }
}

// False-green guard: the default-roots scan must find at least one file.
// If `src/lib/` is empty (deleted, mis-checked-out, CI working dir
// wrong), the harness would otherwise report "0 drift" and publish a
// forever-clean trend.
const usingDefaultRoots = explicitRoots === null;
const totalFiles = tsCount + jsCount;
if (usingDefaultRoots && totalFiles === 0) {
  console.error(
    `[extract-public-surface] FAIL: default scan roots [${SCAN_ROOTS.join(', ')}] contain zero source files.`
  );
  console.error(
    'This is almost certainly a CI / working-directory misconfiguration, NOT clean-as-a-whistle code.'
  );
  process.exit(2);
}

const report = {
  timestamp: new Date().toISOString(),
  scanned: {
    tsFiles: tsCount,
    jsFiles: jsCount,
    callSites: totalCallSites,
    parseErrors,
    truncatedFiles,
  },
  incidents,
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(
  `[extract-public-surface] ${report.scanned.tsFiles + report.scanned.jsFiles} files, ${report.scanned.callSites} call sites, ${report.incidents.length} incidents (parse_errors=${parseErrors}, truncated=${truncatedFiles}).`
);
console.log(`[extract-public-surface] Report: ${reportPath}`);

if (process.env.HARNESS_FAIL_ON_DRIFT === '1' && incidents.length > 0) {
  process.exit(1);
}
