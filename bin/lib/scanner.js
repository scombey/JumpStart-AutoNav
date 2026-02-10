/**
 * scanner.js — Project Context Discovery (Item 49)
 *
 * Scans the project directory to detect tech stack, dependencies,
 * patterns, and risks. Populates project-context.md.
 *
 * Usage:
 *   echo '{"root":"."}' | node bin/lib/scanner.js
 *
 * Input (stdin JSON):
 *   {
 *     "root": ".",
 *     "ignore": ["node_modules", ".git", "dist"]
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "scanned_at": "...",
 *     "stack": { "language": ..., "runtime": ..., "framework": ... },
 *     "structure": { ... },
 *     "dependencies": { "production": [...], "dev": [...] },
 *     "patterns": { ... },
 *     "risks": [...],
 *     "stats": { "files": N, "directories": N }
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.venv'];

/**
 * Recursively scan a directory.
 *
 * @param {string} dir - Directory to scan.
 * @param {string[]} ignore - Directories to ignore.
 * @param {string} root - Project root for relative paths.
 * @returns {{ files: string[], dirs: string[] }}
 */
function scanDir(dir, ignore, root) {
  const files = [];
  const dirs = [];

  if (!fs.existsSync(dir)) return { files, dirs };

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.includes(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      dirs.push(rel);
      const sub = scanDir(full, ignore, root);
      files.push(...sub.files);
      dirs.push(...sub.dirs);
    } else {
      files.push(rel);
    }
  }

  return { files, dirs };
}

/**
 * Detect language and framework from manifest files.
 *
 * @param {string} root - Project root.
 * @param {string[]} files - List of files found.
 * @returns {object} Stack detection result.
 */
function detectStack(root, files) {
  const stack = {
    language: null,
    language_version: null,
    runtime: null,
    runtime_version: null,
    framework: null,
    framework_version: null,
    package_manager: null,
    test_framework: null,
    database: null
  };

  // Check for package.json (Node.js/JavaScript/TypeScript)
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Language detection
      if (allDeps.typescript || files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
        stack.language = 'TypeScript';
        stack.language_version = allDeps.typescript || 'detected';
      } else {
        stack.language = 'JavaScript';
      }

      // Runtime
      stack.runtime = 'Node.js';
      if (pkg.engines && pkg.engines.node) {
        stack.runtime_version = pkg.engines.node;
      }

      // Framework detection
      const frameworks = [
        { key: 'next', name: 'Next.js' },
        { key: 'react', name: 'React' },
        { key: 'vue', name: 'Vue.js' },
        { key: 'express', name: 'Express' },
        { key: 'fastify', name: 'Fastify' },
        { key: 'nuxt', name: 'Nuxt' },
        { key: '@angular/core', name: 'Angular' },
        { key: 'svelte', name: 'Svelte' },
        { key: 'hono', name: 'Hono' }
      ];
      for (const fw of frameworks) {
        if (allDeps[fw.key]) {
          stack.framework = fw.name;
          stack.framework_version = allDeps[fw.key];
          break;
        }
      }

      // Package manager
      if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) stack.package_manager = 'pnpm';
      else if (fs.existsSync(path.join(root, 'yarn.lock'))) stack.package_manager = 'yarn';
      else if (fs.existsSync(path.join(root, 'bun.lockb'))) stack.package_manager = 'bun';
      else stack.package_manager = 'npm';

      // Test framework
      const testFrameworks = [
        { key: 'vitest', name: 'Vitest' },
        { key: 'jest', name: 'Jest' },
        { key: 'mocha', name: 'Mocha' },
        { key: '@playwright/test', name: 'Playwright' },
        { key: 'cypress', name: 'Cypress' }
      ];
      for (const tf of testFrameworks) {
        if (allDeps[tf.key]) {
          stack.test_framework = tf.name;
          break;
        }
      }

      // Database detection
      const databases = [
        { key: '@prisma/client', name: 'Prisma (PostgreSQL/MySQL/SQLite)' },
        { key: 'pg', name: 'PostgreSQL' },
        { key: 'mysql2', name: 'MySQL' },
        { key: 'mongodb', name: 'MongoDB' },
        { key: 'better-sqlite3', name: 'SQLite' },
        { key: 'redis', name: 'Redis' }
      ];
      for (const db of databases) {
        if (allDeps[db.key]) {
          stack.database = db.name;
          break;
        }
      }
    } catch (_) {
      // Ignore parse errors
    }
  }

  // Python detection
  if (files.some(f => f === 'requirements.txt' || f === 'pyproject.toml' || f === 'setup.py')) {
    stack.language = stack.language || 'Python';
    stack.runtime = stack.runtime || 'Python';
  }

  // Go detection
  if (files.some(f => f === 'go.mod')) {
    stack.language = stack.language || 'Go';
    stack.runtime = stack.runtime || 'Go';
  }

  // Rust detection
  if (files.some(f => f === 'Cargo.toml')) {
    stack.language = stack.language || 'Rust';
    stack.runtime = stack.runtime || 'Rust';
  }

  return stack;
}

/**
 * Count technical debt markers in source files.
 *
 * @param {string} root - Project root.
 * @param {string[]} files - List of files.
 * @returns {object} Debt marker counts and locations.
 */
function countDebtMarkers(root, files) {
  const markers = { TODO: [], FIXME: [], HACK: [], XXX: [] };
  const sourceExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'];

  for (const file of files) {
    const ext = path.extname(file);
    if (!sourceExtensions.includes(ext)) continue;

    try {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        for (const marker of Object.keys(markers)) {
          if (line.includes(marker)) {
            markers[marker].push({ file, line: idx + 1 });
          }
        }
      });
    } catch (_) {
      // Skip unreadable files
    }
  }

  return {
    TODO: markers.TODO.length,
    FIXME: markers.FIXME.length,
    HACK: markers.HACK.length,
    XXX: markers.XXX.length,
    details: markers
  };
}

/**
 * Run a full project scan.
 *
 * @param {object} opts - Scan options.
 * @param {string} opts.root - Project root directory.
 * @param {string[]} [opts.ignore] - Directories to ignore.
 * @returns {object} Full scan result.
 */
function scan(opts) {
  const root = path.resolve(opts.root || '.');
  const ignore = opts.ignore || DEFAULT_IGNORE;

  const { files, dirs } = scanDir(root, ignore, root);
  const stack = detectStack(root, files);
  const debt = countDebtMarkers(root, files);

  // Extension distribution
  const extensions = {};
  for (const file of files) {
    const ext = path.extname(file) || '(no ext)';
    extensions[ext] = (extensions[ext] || 0) + 1;
  }

  // Top-level directory structure
  const topLevel = [];
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (ignore.includes(entry.name) || entry.name.startsWith('.')) continue;
      topLevel.push(entry.isDirectory() ? entry.name + '/' : entry.name);
    }
  } catch (_) {
    // Ignore errors
  }

  return {
    scanned_at: new Date().toISOString(),
    stack,
    structure: {
      top_level: topLevel,
      file_extensions: extensions
    },
    stats: {
      files: files.length,
      directories: dirs.length
    },
    debt_markers: debt,
    risks: identifyRisks(root, files, stack)
  };
}

/**
 * Identify common project risks.
 *
 * @param {string} root - Project root.
 * @param {string[]} files - File list.
 * @param {object} stack - Detected stack.
 * @returns {Array<{risk: string, severity: string, detail: string}>}
 */
function identifyRisks(root, files, stack) {
  const risks = [];

  // No tests
  const hasTests = files.some(f => f.includes('test') || f.includes('spec') || f.includes('__tests__'));
  if (!hasTests) {
    risks.push({ risk: 'No test files detected', severity: 'High', detail: 'No files matching test/spec patterns found' });
  }

  // No lock file
  const hasLock = files.some(f => ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'].includes(f));
  if (stack.runtime === 'Node.js' && !hasLock) {
    risks.push({ risk: 'No lock file', severity: 'Medium', detail: 'Non-deterministic dependency resolution' });
  }

  // No .gitignore
  if (!files.includes('.gitignore') && !fs.existsSync(path.join(root, '.gitignore'))) {
    risks.push({ risk: 'No .gitignore', severity: 'Low', detail: 'Risk of committing build artifacts or secrets' });
  }

  // .env file committed (not .env.example)
  if (files.some(f => f === '.env')) {
    risks.push({ risk: '.env file in repository', severity: 'High', detail: 'Potential secret exposure' });
  }

  return risks;
}

// --- CLI entry point ---
if (process.argv[1] && process.argv[1].endsWith('scanner.js')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const opts = JSON.parse(input || '{}');
      const result = scan(opts);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });
}

export { scan, scanDir, detectStack, countDebtMarkers, identifyRisks };
