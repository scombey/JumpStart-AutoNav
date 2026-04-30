/**
 * simplicity-gate.ts -- Simplicity Gate enforcement (Item 9).
 *
 * Fails plans that exceed 3 top-level project folders without explicit
 * justification.
 *
 * M3 hardening: no JSON state -- pure filesystem inspection.
 * ADR-009: projectDir/archContent must be pre-validated by caller.
 * ADR-006: no process.exit.
 */

import * as fs from 'fs';

// Directories excluded from the simplicity gate count
export const EXCLUDED_DIRS: Set<string> = new Set([
  'node_modules', '.git', '.jumpstart', 'specs', '.github',
  '.vscode', '.cursor', '.idea', '__pycache__', '.mypy_cache',
  '.pytest_cache', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.cache',
  'bin', 'docs', '.devcontainer'
]);

export interface DirCount {
  count: number;
  directories: string[];
}

/**
 * Count top-level project directories (excluding standard config/tool dirs).
 */
export function countTopLevelDirs(projectDir: string): DirCount {
  if (!fs.existsSync(projectDir)) {
    return { count: 0, directories: [] };
  }

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const directories = entries
    .filter(e => e.isDirectory() && !EXCLUDED_DIRS.has(e.name))
    .map(e => e.name);

  return { count: directories.length, directories };
}

/**
 * Extract planned directory structure from architecture or implementation plan.
 */
export function extractPlannedDirs(content: string): string[] {
  const structureMatch = content.match(/```[\s\S]*?\[project-root\]\/[\s\S]*?```/);
  if (!structureMatch) return [];

  const structure = structureMatch[0];
  const lines = structure.split('\n');
  const topLevel: string[] = [];

  for (const line of lines) {
    const dirMatch = line.match(/^[|\\u251C\\u2514\\u2500\s]*(?:--\s*|──\s*)(\w[\w-]*)\//);
    if (dirMatch) {
      const dirName = dirMatch[1];
      if (dirName && !EXCLUDED_DIRS.has(dirName)) {
        topLevel.push(dirName);
      }
    }
  }

  return Array.from(new Set(topLevel));
}

export interface CheckOptions {
  projectDir?: string | undefined;
  archContent?: string | undefined;
  maxDirs?: number | undefined;
}

export interface CheckResult {
  passed: boolean;
  count: number;
  directories: string[];
  justificationRequired: boolean;
  message: string;
}

/**
 * Run the simplicity gate check.
 */
export function check(options: CheckOptions = {}): CheckResult {
  const { maxDirs = 3 } = options;
  let directories: string[] = [];
  let count = 0;

  if (options.archContent) {
    directories = extractPlannedDirs(options.archContent);
    count = directories.length;
  } else if (options.projectDir) {
    const result = countTopLevelDirs(options.projectDir);
    directories = result.directories;
    count = result.count;
  }

  const passed = count <= maxDirs;
  const justificationRequired = !passed;

  let message: string;
  if (passed) {
    const plural = count === 1 ? 'y' : 'ies';
    message = `Simplicity gate passed: ${count} top-level director${plural} (max ${maxDirs}).`;
  } else {
    message = `Simplicity gate FAILED: ${count} top-level directories exceeds maximum of ${maxDirs}. ` +
              `Directories: ${directories.join(', ')}. ` +
              `Justification required in architecture document.`;
  }

  return { passed, count, directories, justificationRequired, message };
}
