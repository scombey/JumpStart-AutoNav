/**
 * lint-runner.ts -- Lint-on-Save for Agents (Item 66).
 *
 * Runs configured linters after agent writes to src/.
 * Failures create a fix task artifact.
 *
 * M3 hardening: no JSON state — pure command execution.
 * ADR-006: no process.exit.
 * ADR-009: root paths validated by caller before passing in.
 *
 * Security: commands are tokenized and run via spawnSync(shell:false)
 * to prevent shell injection (same pattern as smoke-tester.ts).
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LinterInfo {
  command: string;
  name: string;
}

export interface LintFinding {
  file: string;
  line: number | null;
  severity: string;
  message: string;
}

export interface FixTask {
  file: string;
  error_count: number;
  description: string;
  errors: Array<{ line: number | null; message: string }>;
}

export interface LintResult {
  files_checked: number;
  errors: number;
  warnings: number;
  findings: LintFinding[];
  pass: boolean;
  fix_tasks: FixTask[];
  linter: string | null;
  message?: string | undefined;
  exit_code?: number | undefined;
}

export interface LintConfig {
  lint_command?: string | undefined;
  fix?: boolean | undefined;
}

export interface RunLintInput {
  files?: string[] | undefined;
  root?: string | undefined;
  config?: LintConfig | undefined;
}

// ─── Linter detection ────────────────────────────────────────────────────────

const LINTER_CHECKS: Array<{ file: string; command: string; name: string }> = [
  { file: '.eslintrc.json', command: 'npx eslint', name: 'ESLint' },
  { file: '.eslintrc.js', command: 'npx eslint', name: 'ESLint' },
  { file: '.eslintrc.yml', command: 'npx eslint', name: 'ESLint' },
  { file: 'eslint.config.js', command: 'npx eslint', name: 'ESLint (flat)' },
  { file: 'eslint.config.mjs', command: 'npx eslint', name: 'ESLint (flat)' },
  { file: '.pylintrc', command: 'python -m pylint', name: 'Pylint' },
  { file: 'setup.cfg', command: 'python -m flake8', name: 'Flake8' },
  { file: 'pyproject.toml', command: 'python -m ruff check', name: 'Ruff' },
  { file: 'biome.json', command: 'npx @biomejs/biome lint', name: 'Biome' },
];

/**
 * Detect the project's linter from configuration files.
 */
export function detectLinter(root: string): LinterInfo | null {
  // Also check package.json for lint script
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      const scripts = pkg.scripts as Record<string, unknown> | undefined;
      if (scripts && typeof scripts.lint === 'string') {
        return { command: 'npm run lint --', name: 'npm lint script' };
      }
    } catch {
      // ignore parse errors
    }
  }

  for (const check of LINTER_CHECKS) {
    if (fs.existsSync(path.join(root, check.file))) {
      return { command: check.command, name: check.name };
    }
  }

  return null;
}

// ─── Output parsing ───────────────────────────────────────────────────────────

/**
 * Parse linter output into structured findings.
 * Handles common output formats (ESLint, Pylint, etc.).
 */
export function parseFindings(output: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // ESLint format: /path/file.js:10:5: error message (rule-name)
    const eslintMatch = line.match(/^(.+?):(\d+):\d+:\s+(error|warning)\s+(.+)/);
    if (eslintMatch) {
      findings.push({
        file: eslintMatch[1] ?? '',
        line: parseInt(eslintMatch[2] ?? '0', 10),
        severity: eslintMatch[3] ?? 'error',
        message: (eslintMatch[4] ?? '').trim(),
      });
      continue;
    }

    // Generic pattern: file:line: message
    const genericMatch = line.match(/^(.+?):(\d+):\s+(.+)/);
    if (genericMatch && !line.startsWith(' ')) {
      findings.push({
        file: genericMatch[1] ?? '',
        line: parseInt(genericMatch[2] ?? '0', 10),
        severity: 'error',
        message: (genericMatch[3] ?? '').trim(),
      });
    }
  }

  return findings;
}

// ─── Command execution ────────────────────────────────────────────────────────

/**
 * Tokenize a command string and run via spawnSync with shell:false
 * (same pattern as smoke-tester.ts — prevents shell injection).
 */
function runCommand(
  command: string,
  extraArgs: string[],
  cwd: string
): { output: string; exitCode: number } {
  const parts = command
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  const head = parts[0];
  if (!head) return { output: 'Empty command', exitCode: 1 };
  const tail = [...parts.slice(1), ...extraArgs];

  const result = spawnSync(head, tail, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60000,
    shell: false,
  });

  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const exitCode = result.status ?? 1;
  return { output, exitCode };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run linter on specified files.
 * When called with a string, treats it as the root directory (backward compat).
 */
export function runLint(input: RunLintInput | string): LintResult {
  // Accept a plain string root path for backward compat with CLI callers.
  const normalised: RunLintInput = typeof input === 'string' ? { root: input } : input;

  const { files = [], root = '.', config = {} } = normalised;
  const resolvedRoot = path.resolve(root);

  // Determine linter
  let linterInfo: LinterInfo | null;
  if (config.lint_command) {
    linterInfo = { command: config.lint_command, name: 'custom' };
  } else {
    linterInfo = detectLinter(resolvedRoot);
  }

  if (!linterInfo) {
    return {
      files_checked: files.length,
      errors: 0,
      warnings: 0,
      findings: [],
      pass: true,
      fix_tasks: [],
      linter: null,
      message: 'No linter detected. Consider adding ESLint, Pylint, or a similar tool.',
    };
  }

  // Append --fix flag if requested
  const baseCommand = config.fix ? `${linterInfo.command} --fix` : linterInfo.command;

  // Filter to existing files
  const existingFiles = files.filter((f) => {
    const fp = path.isAbsolute(f) ? f : path.join(resolvedRoot, f);
    return fs.existsSync(fp);
  });

  // If files were specified but none exist, return early
  if (files.length > 0 && existingFiles.length === 0) {
    return {
      files_checked: 0,
      errors: 0,
      warnings: 0,
      findings: [],
      pass: true,
      fix_tasks: [],
      linter: linterInfo.name,
      message: 'No existing files to lint.',
    };
  }

  // Run the linter: pass file args separately so spawnSync can handle them safely
  const { output, exitCode } = runCommand(baseCommand, existingFiles, resolvedRoot);

  const findings = parseFindings(output);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  // Generate fix tasks for errors grouped by file
  const fixTasks: FixTask[] = [];
  const fileErrors = new Map<string, LintFinding[]>();
  for (const finding of findings) {
    if (finding.severity === 'error') {
      const existing = fileErrors.get(finding.file);
      if (existing) {
        existing.push(finding);
      } else {
        fileErrors.set(finding.file, [finding]);
      }
    }
  }

  fileErrors.forEach((errs, file) => {
    fixTasks.push({
      file,
      error_count: errs.length,
      description: `Fix ${errs.length} lint error(s) in ${file}`,
      errors: errs.map((e) => ({ line: e.line, message: e.message })),
    });
  });

  return {
    files_checked: existingFiles.length > 0 ? existingFiles.length : files.length,
    errors,
    warnings,
    findings,
    pass: errors === 0,
    fix_tasks: fixTasks,
    linter: linterInfo.name,
    exit_code: exitCode,
  };
}
