/**
 * lint-runner.js — Lint-on-Save for Agents (Item 66)
 *
 * Runs configured linters after agent writes to src/.
 * Failures create a fix task artifact.
 *
 * Usage:
 *   echo '{"files":["src/index.js"],"config":{}}' | node bin/lib/lint-runner.js
 *
 * Input (stdin JSON):
 *   {
 *     "files": ["src/index.js", "src/utils.ts"],
 *     "root": ".",
 *     "config": {
 *       "lint_command": "npx eslint",
 *       "fix": false
 *     }
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "files_checked": 2,
 *     "errors": 3,
 *     "warnings": 1,
 *     "findings": [...],
 *     "pass": false,
 *     "fix_tasks": [...]
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Detect the project's linter from configuration files.
 *
 * @param {string} root - Project root path.
 * @returns {{ command: string, name: string } | null}
 */
function detectLinter(root) {
  const checks = [
    { file: '.eslintrc.json', command: 'npx eslint', name: 'ESLint' },
    { file: '.eslintrc.js', command: 'npx eslint', name: 'ESLint' },
    { file: '.eslintrc.yml', command: 'npx eslint', name: 'ESLint' },
    { file: 'eslint.config.js', command: 'npx eslint', name: 'ESLint (flat)' },
    { file: 'eslint.config.mjs', command: 'npx eslint', name: 'ESLint (flat)' },
    { file: '.pylintrc', command: 'python -m pylint', name: 'Pylint' },
    { file: 'setup.cfg', command: 'python -m flake8', name: 'Flake8' },
    { file: 'pyproject.toml', command: 'python -m ruff check', name: 'Ruff' },
    { file: 'biome.json', command: 'npx @biomejs/biome lint', name: 'Biome' }
  ];

  // Also check package.json for lint script
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.lint) {
        return { command: 'npm run lint --', name: 'npm lint script' };
      }
    } catch {
      // ignore
    }
  }

  for (const check of checks) {
    if (fs.existsSync(path.join(root, check.file))) {
      return { command: check.command, name: check.name };
    }
  }

  return null;
}

/**
 * Parse linter output into structured findings.
 * Handles common output formats (ESLint, Pylint, etc.).
 *
 * @param {string} output - Raw linter output.
 * @returns {Array<{ file: string, line: number|null, severity: string, message: string }>}
 */
function parseFindings(output) {
  const findings = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // ESLint format: /path/file.js:10:5: error message (rule-name)
    const eslintMatch = line.match(/^(.+?):(\d+):\d+:\s+(error|warning)\s+(.+)/);
    if (eslintMatch) {
      findings.push({
        file: eslintMatch[1],
        line: parseInt(eslintMatch[2], 10),
        severity: eslintMatch[3],
        message: eslintMatch[4].trim()
      });
      continue;
    }

    // Generic pattern: file:line: message
    const genericMatch = line.match(/^(.+?):(\d+):\s+(.+)/);
    if (genericMatch && !line.startsWith(' ')) {
      findings.push({
        file: genericMatch[1],
        line: parseInt(genericMatch[2], 10),
        severity: 'error',
        message: genericMatch[3].trim()
      });
    }
  }

  return findings;
}

/**
 * Run linter on specified files.
 *
 * @param {object} input - Lint options.
 * @param {string[]} input.files - Files to lint.
 * @param {string} [input.root] - Project root.
 * @param {object} [input.config] - Override config.
 * @param {string} [input.config.lint_command] - Custom lint command.
 * @param {boolean} [input.config.fix] - Attempt auto-fix.
 * @returns {object} Lint results.
 */
function runLint(input) {
  const { files = [], root = '.', config = {} } = input;
  const resolvedRoot = path.resolve(root);

  // Determine linter
  let linterInfo;
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
      message: 'No linter detected. Consider adding ESLint, Pylint, or a similar tool.'
    };
  }

  // Build command
  let cmd = linterInfo.command;
  if (config.fix) {
    cmd += ' --fix';
  }

  // Filter to existing files
  const existingFiles = files.filter(f => {
    const fp = path.isAbsolute(f) ? f : path.join(resolvedRoot, f);
    return fs.existsSync(fp);
  });

  if (existingFiles.length === 0) {
    return {
      files_checked: 0,
      errors: 0,
      warnings: 0,
      findings: [],
      pass: true,
      fix_tasks: [],
      linter: linterInfo.name,
      message: 'No existing files to lint.'
    };
  }

  const fullCmd = `${cmd} ${existingFiles.join(' ')}`;
  let output = '';
  let exitCode = 0;

  try {
    output = execSync(fullCmd, {
      cwd: resolvedRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000
    });
  } catch (err) {
    output = (err.stdout || '') + (err.stderr || '');
    exitCode = err.status || 1;
  }

  const findings = parseFindings(output);
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;

  // Generate fix tasks for errors
  const fixTasks = [];
  const fileErrors = new Map();
  for (const finding of findings) {
    if (finding.severity === 'error') {
      if (!fileErrors.has(finding.file)) {
        fileErrors.set(finding.file, []);
      }
      fileErrors.get(finding.file).push(finding);
    }
  }

  for (const [file, errs] of fileErrors) {
    fixTasks.push({
      file,
      error_count: errs.length,
      description: `Fix ${errs.length} lint error(s) in ${file}`,
      errors: errs.map(e => ({ line: e.line, message: e.message }))
    });
  }

  return {
    files_checked: existingFiles.length,
    errors,
    warnings,
    findings,
    pass: errors === 0,
    fix_tasks: fixTasks,
    linter: linterInfo.name,
    exit_code: exitCode
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (process.argv[1] && (
  process.argv[1].endsWith('lint-runner.mjs') ||
  process.argv[1].endsWith('lint-runner')
)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const parsed = input.trim() ? JSON.parse(input) : {};
      const result = runLint(parsed);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.pass ? 0 : 1);
    } catch (err) {
      process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });

  if (process.stdin.isTTY) {
    const result = runLint({});
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.pass ? 0 : 1);
  }
}

export { runLint, detectLinter, parseFindings };
