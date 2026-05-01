/**
 * scanner.ts — Project Context Discovery port.
 *
 * Port of `bin/lib/scanner.mjs` (ESM). Near-trivial since it was already
 * ESM — mostly type annotations. Public surface:
 *   - `scan(opts)` => ScanResult
 *   - `scanDir(dir, ignore, root)` => { files, dirs }
 *   - `detectStack(root, files)` => StackInfo
 *   - `countDebtMarkers(root, files)` => DebtMarkers
 *   - `identifyRisks(root, files, stack)` => Risk[]
 *
 * M3 hardening: No JSON state file. package.json parsed with try/catch + defaulting.
 * Path-safety per ADR-009: `scan(opts)` receives root from CLI wiring.
 *
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.venv',
];

export interface StackInfo {
  language: string | null;
  language_version: string | null;
  runtime: string | null;
  runtime_version: string | null;
  framework: string | null;
  framework_version: string | null;
  package_manager: string | null;
  test_framework: string | null;
  database: string | null;
}

export interface DebtDetail {
  file: string;
  line: number;
}

export interface DebtMarkers {
  TODO: number;
  FIXME: number;
  HACK: number;
  XXX: number;
  details: {
    TODO: DebtDetail[];
    FIXME: DebtDetail[];
    HACK: DebtDetail[];
    XXX: DebtDetail[];
  };
}

export interface Risk {
  risk: string;
  severity: string;
  detail: string;
}

export interface ScanResult {
  scanned_at: string;
  stack: StackInfo;
  structure: {
    top_level: string[];
    file_extensions: Record<string, number>;
  };
  stats: { files: number; directories: number };
  debt_markers: DebtMarkers;
  risks: Risk[];
}

export function scanDir(
  dir: string,
  ignore: string[],
  root: string
): { files: string[]; dirs: string[] } {
  const files: string[] = [];
  const dirs: string[] = [];

  if (!existsSync(dir)) return { files, dirs };

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignore.includes(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

    const full = join(dir, entry.name);
    const rel = relative(root, full).replace(/\\/g, '/');

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

export function detectStack(root: string, files: string[]): StackInfo {
  const stack: StackInfo = {
    language: null,
    language_version: null,
    runtime: null,
    runtime_version: null,
    framework: null,
    framework_version: null,
    package_manager: null,
    test_framework: null,
    database: null,
  };

  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        engines?: { node?: string };
      };
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps.typescript || files.some((f) => f.endsWith('.ts') || f.endsWith('.tsx'))) {
        stack.language = 'TypeScript';
        stack.language_version = allDeps.typescript ?? 'detected';
      } else {
        stack.language = 'JavaScript';
      }

      stack.runtime = 'Node.js';
      if (pkg.engines?.node) stack.runtime_version = pkg.engines.node;

      const frameworks = [
        { key: 'next', name: 'Next.js' },
        { key: 'react', name: 'React' },
        { key: 'vue', name: 'Vue.js' },
        { key: 'express', name: 'Express' },
        { key: 'fastify', name: 'Fastify' },
        { key: 'nuxt', name: 'Nuxt' },
        { key: '@angular/core', name: 'Angular' },
        { key: 'svelte', name: 'Svelte' },
        { key: 'hono', name: 'Hono' },
      ];
      for (const fw of frameworks) {
        if (allDeps[fw.key]) {
          stack.framework = fw.name;
          stack.framework_version = allDeps[fw.key] ?? null;
          break;
        }
      }

      if (existsSync(join(root, 'pnpm-lock.yaml'))) stack.package_manager = 'pnpm';
      else if (existsSync(join(root, 'yarn.lock'))) stack.package_manager = 'yarn';
      else if (existsSync(join(root, 'bun.lockb'))) stack.package_manager = 'bun';
      else stack.package_manager = 'npm';

      const testFrameworks = [
        { key: 'vitest', name: 'Vitest' },
        { key: 'jest', name: 'Jest' },
        { key: 'mocha', name: 'Mocha' },
        { key: '@playwright/test', name: 'Playwright' },
        { key: 'cypress', name: 'Cypress' },
      ];
      for (const tf of testFrameworks) {
        if (allDeps[tf.key]) {
          stack.test_framework = tf.name;
          break;
        }
      }

      const databases = [
        { key: '@prisma/client', name: 'Prisma (PostgreSQL/MySQL/SQLite)' },
        { key: 'pg', name: 'PostgreSQL' },
        { key: 'mysql2', name: 'MySQL' },
        { key: 'mongodb', name: 'MongoDB' },
        { key: 'better-sqlite3', name: 'SQLite' },
        { key: 'redis', name: 'Redis' },
      ];
      for (const db of databases) {
        if (allDeps[db.key]) {
          stack.database = db.name;
          break;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  if (files.some((f) => f === 'requirements.txt' || f === 'pyproject.toml' || f === 'setup.py')) {
    stack.language = stack.language ?? 'Python';
    stack.runtime = stack.runtime ?? 'Python';
  }

  if (files.some((f) => f === 'go.mod')) {
    stack.language = stack.language ?? 'Go';
    stack.runtime = stack.runtime ?? 'Go';
  }

  if (files.some((f) => f === 'Cargo.toml')) {
    stack.language = stack.language ?? 'Rust';
    stack.runtime = stack.runtime ?? 'Rust';
  }

  return stack;
}

export function countDebtMarkers(root: string, files: string[]): DebtMarkers {
  const markers: {
    TODO: DebtDetail[];
    FIXME: DebtDetail[];
    HACK: DebtDetail[];
    XXX: DebtDetail[];
  } = {
    TODO: [],
    FIXME: [],
    HACK: [],
    XXX: [],
  };
  const sourceExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'];

  for (const file of files) {
    const ext = extname(file);
    if (!sourceExtensions.includes(ext)) continue;

    try {
      const content = readFileSync(join(root, file), 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        for (const marker of Object.keys(markers) as Array<keyof typeof markers>) {
          if (line.includes(marker)) {
            markers[marker].push({ file, line: idx + 1 });
          }
        }
      });
    } catch {
      // Skip unreadable files
    }
  }

  return {
    TODO: markers.TODO.length,
    FIXME: markers.FIXME.length,
    HACK: markers.HACK.length,
    XXX: markers.XXX.length,
    details: markers,
  };
}

export function identifyRisks(root: string, files: string[], stack: StackInfo): Risk[] {
  const risks: Risk[] = [];

  const hasTests = files.some(
    (f) => f.includes('test') || f.includes('spec') || f.includes('__tests__')
  );
  if (!hasTests) {
    risks.push({
      risk: 'No test files detected',
      severity: 'High',
      detail: 'No files matching test/spec patterns found',
    });
  }

  const hasLock = files.some((f) =>
    ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'].includes(f)
  );
  if (stack.runtime === 'Node.js' && !hasLock) {
    risks.push({
      risk: 'No lock file',
      severity: 'Medium',
      detail: 'Non-deterministic dependency resolution',
    });
  }

  if (!files.includes('.gitignore') && !existsSync(join(root, '.gitignore'))) {
    risks.push({
      risk: 'No .gitignore',
      severity: 'Low',
      detail: 'Risk of committing build artifacts or secrets',
    });
  }

  if (files.some((f) => f === '.env')) {
    risks.push({
      risk: '.env file in repository',
      severity: 'High',
      detail: 'Potential secret exposure',
    });
  }

  return risks;
}

export interface ScanOptions {
  root?: string | undefined;
  ignore?: string[] | undefined;
}

export function scan(opts: ScanOptions): ScanResult {
  const root = opts.root ?? '.';
  const ignore = opts.ignore ?? DEFAULT_IGNORE;

  const { files, dirs } = scanDir(root, ignore, root);
  const stack = detectStack(root, files);
  const debt = countDebtMarkers(root, files);

  const extensions: Record<string, number> = {};
  for (const file of files) {
    const ext = extname(file) || '(no ext)';
    extensions[ext] = (extensions[ext] ?? 0) + 1;
  }

  const topLevel: string[] = [];
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (ignore.includes(entry.name) || entry.name.startsWith('.')) continue;
      topLevel.push(entry.isDirectory() ? `${entry.name}/` : entry.name);
    }
  } catch {
    // Ignore errors
  }

  return {
    scanned_at: new Date().toISOString(),
    stack,
    structure: { top_level: topLevel, file_extensions: extensions },
    stats: { files: files.length, directories: dirs.length },
    debt_markers: debt,
    risks: identifyRisks(root, files, stack),
  };
}
