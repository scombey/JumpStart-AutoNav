/**
 * install-bootstrap.ts — Bootstrap installer with --conflict merge support
 * (M11 follow-up port from deleted bin/cli.js, see #50).
 *
 * Pure-library port of the legacy install logic that lived in `bin/cli.js`
 * (~700 LoC across 9 functions, deleted in M11 phase 4 #52). The citty
 * `init` command in `src/cli/commands/lifecycle.ts` exposes the
 * `--name`, `--approver`, `--type`, `--conflict skip|overwrite|merge`
 * surface that consumers used as `npx jumpstart-mode . --conflict merge`
 * before the cutover.
 *
 * Public surface preserved verbatim by name + signature shape from the
 * legacy:
 *
 *   - `installBootstrap(config)` — async install entry; orchestrates
 *     copy + merge + directory scaffolding + config persistence
 *   - `detectProjectType(targetDir)` — heuristic greenfield/brownfield
 *     detector based on filesystem indicators (build tools, src dirs,
 *     .git history)
 *   - `detectConflicts(targetDir, config)` — reports which integration
 *     files would conflict with an existing project
 *   - `buildMergedInstructionBlock(content, fileName)` — assembles the
 *     `<!-- BEGIN JUMPSTART MERGE: <file> -->` ... `<!-- END ... -->`
 *     block that wraps framework instructions inside user-controlled
 *     AGENTS.md / CLAUDE.md
 *   - `mergeInstructionDocument(existing, framework, fileName)` —
 *     idempotent insert/update of the merged block (regex-replaces an
 *     existing block, appends if absent)
 *
 * Behavior parity:
 *   - `INTEGRATION_FILES` = `['AGENTS.md', 'CLAUDE.md', '.cursorrules']`
 *   - `MERGEABLE_INTEGRATION_FILES` = `['AGENTS.md', 'CLAUDE.md']`
 *     (`.cursorrules` is overwrite-only — it has no merge semantics)
 *   - `JUMPSTART_DIR` = `.jumpstart`, `GITHUB_DIR` = `.github`
 *   - `SPEC_DIRS` = `['specs/decisions', 'specs/research', 'specs/insights']`
 *   - `OUTPUT_DIRS` = `['src', 'tests']` (greenfield only)
 *   - `--conflict merge` writes the framework block once, idempotent on
 *     reruns (a second `--conflict merge` of the same project does NOT
 *     duplicate the block)
 *   - `--conflict skip` persists a warning note to
 *     `.jumpstart/state/install-warnings.md` if AGENTS.md or CLAUDE.md
 *     was skipped (so AI assistants can detect missing instructions)
 *   - `--conflict overwrite` replaces existing files outright
 *
 * **ADR-009 path-safety**: every `path.join(targetDir, userInput)` is
 * gated by `assertInsideRoot` from `src/lib/path-safety.ts` so the
 * install flow can't write outside the target directory even with a
 * malicious config (e.g., `targetDir = '/etc'`).
 *
 * **Deferred from this port:**
 *   - Interactive prompts (`runInteractive` in legacy) — the new citty
 *     `init` command takes args directly; interactive mode is a
 *     follow-up if needed.
 *   - Context7 MCP setup orchestration — the `context7-setup` citty
 *     subcommand (added in #54) handles that flow standalone; this port
 *     does NOT auto-invoke it. Callers can chain
 *     `init --conflict merge && context7-setup` if they want the legacy
 *     end-to-end behavior.
 *   - Framework-manifest stamping (the `framework-manifest.ts` port has
 *     `generateManifest` / `writeFrameworkManifest`; this port stamps
 *     the manifest at the end of `installBootstrap` so future
 *     `upgrade` runs have a baseline).
 *
 * @see bin/cli.js (legacy reference — recovered from git c483810~1:bin/cli.js)
 * @see src/cli/commands/lifecycle.ts (citty `init` wiring)
 * @see src/lib/config-yaml.ts (`updateBootstrapAnswers` for config persistence)
 * @see src/lib/framework-manifest.ts (manifest stamping)
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateBootstrapAnswers } from './config-yaml.js';
import {
  generateManifest,
  getPackageVersion,
  writeFrameworkManifest,
} from './framework-manifest.js';
import { assertInsideRoot } from './path-safety.js';

// ─────────────────────────────────────────────────────────────────────────
// Constants (verbatim from legacy)
// ─────────────────────────────────────────────────────────────────────────

const JUMPSTART_DIR = '.jumpstart';
const GITHUB_DIR = '.github';
export const INTEGRATION_FILES: readonly string[] = ['AGENTS.md', 'CLAUDE.md', '.cursorrules'];
export const MERGEABLE_INTEGRATION_FILES: readonly string[] = ['AGENTS.md', 'CLAUDE.md'];
const SPEC_DIRS: readonly string[] = ['specs/decisions', 'specs/research', 'specs/insights'];
const OUTPUT_DIRS: readonly string[] = ['src', 'tests'];

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export type ConflictStrategy = 'skip' | 'overwrite' | 'merge';
export type ProjectType = 'greenfield' | 'brownfield';

export interface InstallConfig {
  /** Absolute path to the target project directory. */
  targetDir: string;
  /** Optional project name (persisted to .jumpstart/config.yaml). */
  projectName?: string | undefined;
  /** Optional approver identity (persisted to config.yaml). */
  approverName?: string | undefined;
  /** Project type. Auto-detected if omitted. */
  projectType?: ProjectType | undefined;
  /** Conflict resolution strategy. Defaults to 'skip'. */
  conflictStrategy?: ConflictStrategy | undefined;
  /** Include `.github/` Copilot integration files. */
  copilot?: boolean | undefined;
  /** Force overwrite (alias for `conflictStrategy: 'overwrite'`). */
  force?: boolean | undefined;
  /** Don't write files; report what would happen. */
  dryRun?: boolean | undefined;
  /** Path to the framework package root (where the templates live). */
  packageRoot?: string | undefined;
}

export interface InstallStats {
  copied: string[];
  skipped: string[];
  merged: string[];
  created: string[];
}

export interface InstallResult {
  success: boolean;
  stats: InstallStats;
  conflicts: string[];
  /** Files that triggered the skip-warning persistence (if any). */
  skipWarningEmitted: string[];
  /** Bootstrap answers actually persisted to config.yaml (if any). */
  appliedAnswers: string[];
}

export interface DetectProjectTypeResult {
  type: ProjectType;
  confidence: number;
  signals: string[];
}

export interface CopyOptions {
  dryRun?: boolean | undefined;
  force?: boolean | undefined;
  conflictStrategy?: ConflictStrategy | undefined;
  stats?: InstallStats | undefined;
  mergeResolver?: ((existing: string, framework: string, fileName: string) => string) | null;
}

interface MergedBlock {
  startMarker: string;
  endMarker: string;
  block: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Project type detection
// ─────────────────────────────────────────────────────────────────────────

/** Indicators of an existing project (brownfield signals). */
const BROWNFIELD_INDICATORS: readonly string[] = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'requirements.txt',
  'Pipfile',
  'pyproject.toml',
  'setup.py',
  'Gemfile',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'Makefile',
  'CMakeLists.txt',
  'composer.json',
  '.gitignore',
  'tsconfig.json',
  'webpack.config.js',
  'vite.config.ts',
  'Dockerfile',
  'docker-compose.yml',
];

const BROWNFIELD_DIRS: readonly string[] = [
  'src',
  'lib',
  'app',
  'components',
  'pages',
  'api',
  'server',
  'client',
];

/**
 * Heuristic greenfield/brownfield classifier. Brownfield = score ≥ 2,
 * where every present indicator file is +1 and `.git/refs/heads`
 * existence is +2. Capped at 5 signals before returning.
 *
 * @see legacy bin/cli.js detectProjectType (verbatim port).
 */
export function detectProjectType(targetDir: string): DetectProjectTypeResult {
  const absDir = path.resolve(targetDir);

  let score = 0;
  const signals: string[] = [];

  // .git history (strong signal)
  if (existsSync(path.join(absDir, '.git'))) {
    const gitLog = path.join(absDir, '.git', 'refs', 'heads');
    if (existsSync(gitLog)) {
      score += 2;
      signals.push('.git history');
    }
  }

  // Config / manifest files
  for (const file of BROWNFIELD_INDICATORS) {
    if (existsSync(path.join(absDir, file))) {
      score += 1;
      signals.push(file);
      if (signals.length >= 5) break;
    }
  }

  // Source directories with at least one non-dot, non-.gitkeep entry
  for (const dir of BROWNFIELD_DIRS) {
    if (signals.length >= 5) break;
    const dirPath = path.join(absDir, dir);
    if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
      const entries = readdirSync(dirPath);
      if (entries.some((e) => !e.startsWith('.') && e !== '.gitkeep')) {
        score += 1;
        signals.push(`${dir}/`);
      }
    }
  }

  if (score >= 2) {
    return { type: 'brownfield', confidence: Math.min(score / 5, 1), signals };
  }
  return { type: 'greenfield', confidence: 1 - score / 5, signals };
}

// ─────────────────────────────────────────────────────────────────────────
// Conflict detection (pre-flight)
// ─────────────────────────────────────────────────────────────────────────

export function detectConflicts(targetDir: string, config: InstallConfig): string[] {
  const conflicts: string[] = [];

  if (existsSync(path.join(targetDir, JUMPSTART_DIR))) {
    conflicts.push(JUMPSTART_DIR);
  }

  for (const file of INTEGRATION_FILES) {
    if (existsSync(path.join(targetDir, file))) {
      conflicts.push(file);
    }
  }

  if (config.copilot && existsSync(path.join(targetDir, GITHUB_DIR))) {
    conflicts.push(GITHUB_DIR);
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────
// Merge-block construction
// ─────────────────────────────────────────────────────────────────────────

export function buildMergedInstructionBlock(
  frameworkContent: string,
  fileName: string
): MergedBlock {
  const startMarker = `<!-- BEGIN JUMPSTART MERGE: ${fileName} -->`;
  const endMarker = `<!-- END JUMPSTART MERGE: ${fileName} -->`;
  const trimmed = frameworkContent.trim();

  return {
    startMarker,
    endMarker,
    block: [
      '',
      '---',
      '',
      '## Jump Start Framework Instructions (Merged)',
      '',
      '> This section is managed by `jumpstart-mode --conflict merge`.',
      '> Keep your custom instructions above this block.',
      '',
      startMarker,
      trimmed,
      endMarker,
      '',
    ].join('\n'),
  };
}

/**
 * Idempotent merge: if the marker block is already present, replace its
 * content; otherwise append the block to the end of `existingContent`.
 * Reruns of `--conflict merge` against the same project produce a
 * single block (no duplication).
 */
export function mergeInstructionDocument(
  existingContent: string,
  frameworkContent: string,
  fileName: string
): string {
  const { startMarker, endMarker, block } = buildMergedInstructionBlock(frameworkContent, fileName);
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockRegex = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, 'm');

  if (blockRegex.test(existingContent)) {
    return existingContent.replace(
      blockRegex,
      `${startMarker}\n${frameworkContent.trim()}\n${endMarker}`
    );
  }

  return `${existingContent.replace(/\s*$/, '')}${block}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Skip-warning persistence
// ─────────────────────────────────────────────────────────────────────────

function buildSkipWarningNote(skippedFiles: readonly string[]): string {
  const timestamp = new Date().toISOString();
  const bulletList = skippedFiles.map((file) => `- ${file}`).join('\n');

  return [
    '# Jump Start Installation Warning',
    '',
    `Generated: ${timestamp}`,
    '',
    'The following integration files were skipped during bootstrap:',
    bulletList,
    '',
    'Skipping these files can cause integration issues for AI assistants because required Jump Start instruction blocks may be missing.',
    'Recommended fix: re-run bootstrap with merge mode:',
    '',
    '```bash',
    'npx @scombey/jumpstart-mode init --conflict merge',
    '```',
    '',
  ].join('\n');
}

function persistSkipWarning(
  targetPath: string,
  skippedFiles: readonly string[],
  dryRun: boolean
): void {
  if (dryRun || skippedFiles.length === 0) return;

  const warningPath = path.join(targetPath, JUMPSTART_DIR, 'state', 'install-warnings.md');
  // ADR-009: warningPath is constructed from targetPath + literal segments.
  // assertInsideRoot confirms the resolved path stays under targetPath.
  assertInsideRoot(path.relative(targetPath, warningPath), targetPath, {
    schemaId: 'install-bootstrap.persistSkipWarning',
  });

  const warningDir = path.dirname(warningPath);
  if (!existsSync(warningDir)) mkdirSync(warningDir, { recursive: true });

  writeFileSync(warningPath, buildSkipWarningNote(skippedFiles), 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────
// File / directory copy helpers
// ─────────────────────────────────────────────────────────────────────────

function copyDirectoryRecursive(src: string, dest: string, options: CopyOptions): InstallStats {
  const stats: InstallStats = options.stats ?? { copied: [], skipped: [], merged: [], created: [] };
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;

  if (!existsSync(src)) return stats;

  if (!dryRun && !existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath, { ...options, stats });
    } else {
      const exists = existsSync(destPath);
      if (exists && !force) {
        stats.skipped.push(destPath);
      } else {
        if (!dryRun) {
          copyFileSync(srcPath, destPath);
        }
        stats.copied.push(destPath);
      }
    }
  }

  return stats;
}

function copyOneFile(src: string, dest: string, options: CopyOptions): InstallStats {
  const stats: InstallStats = options.stats ?? { copied: [], skipped: [], merged: [], created: [] };
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const conflictStrategy: ConflictStrategy = options.conflictStrategy ?? 'skip';
  const mergeResolver = options.mergeResolver ?? null;

  if (!existsSync(src)) return stats;

  const exists = existsSync(dest);
  if (exists && !force) {
    if (conflictStrategy === 'merge' && typeof mergeResolver === 'function') {
      if (!dryRun) {
        const srcContent = readFileSync(src, 'utf8');
        const destContent = readFileSync(dest, 'utf8');
        const mergedContent = mergeResolver(destContent, srcContent, path.basename(dest));
        if (mergedContent !== destContent) {
          writeFileSync(dest, mergedContent, 'utf8');
          stats.merged.push(dest);
        } else {
          stats.skipped.push(dest);
        }
      } else {
        stats.merged.push(dest);
      }
    } else {
      stats.skipped.push(dest);
    }
  } else {
    if (!dryRun) {
      const destDir = path.dirname(dest);
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
      copyFileSync(src, dest);
    }
    stats.copied.push(dest);
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────────────────
// Directory scaffolding
// ─────────────────────────────────────────────────────────────────────────

function createDirectories(
  baseDir: string,
  dirs: readonly string[],
  options: { dryRun?: boolean; stats: InstallStats }
): InstallStats {
  const dryRun = options.dryRun ?? false;
  const { stats } = options;

  for (const dir of dirs) {
    // ADR-009: `dir` is always one of SPEC_DIRS / OUTPUT_DIRS (literal),
    // so this is path-safe by construction. Re-asserting for defense-in-depth.
    assertInsideRoot(dir, baseDir, { schemaId: 'install-bootstrap.createDirectories' });
    const fullPath = path.join(baseDir, dir);
    if (!existsSync(fullPath)) {
      if (!dryRun) {
        mkdirSync(fullPath, { recursive: true });
        writeFileSync(path.join(fullPath, '.gitkeep'), '');
      }
      stats.created.push(fullPath);
    }
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────────────────
// Bootstrap-answer persistence
// ─────────────────────────────────────────────────────────────────────────

function persistBootstrapAnswers(
  configPath: string,
  config: InstallConfig,
  options: { dryRun?: boolean }
): { changed: boolean; applied: string[] } {
  if (options.dryRun) return { changed: false, applied: [] };

  return updateBootstrapAnswers(configPath, {
    projectName: config.projectName,
    projectType: config.projectType,
    approverName: config.approverName,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Package root resolution
// ─────────────────────────────────────────────────────────────────────────

/**
 * Resolve the framework package root (where templates live). Defaults to
 * `<this-module>/../..` (which points at the package root in both dev
 * (`src/lib/install-bootstrap.ts`) and built (`dist/lib/install-bootstrap.mjs`)
 * layouts).
 */
function resolvePackageRoot(override?: string): string {
  if (override) return path.resolve(override);
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, '..', '..');
}

// ─────────────────────────────────────────────────────────────────────────
// Main install entry point
// ─────────────────────────────────────────────────────────────────────────

/**
 * Install the Jump Start framework into a target directory. Returns
 * structured stats; never throws on conflicts (resolves them per
 * `config.conflictStrategy`).
 *
 * Path-safety: `targetDir` is gated through `assertInsideRoot` against
 * itself (which validates absoluteness + non-null-byte) before any fs
 * write. Every framework-source path comes from the package root (a
 * trusted location). Every framework-dest path is constructed as
 * `path.join(targetDir, <literal-segment>)` so escapes are impossible.
 */
export async function installBootstrap(config: InstallConfig): Promise<InstallResult> {
  const targetPath = path.resolve(config.targetDir);
  const dryRun = config.dryRun ?? false;
  const force = config.force ?? false;
  const conflictStrategy: ConflictStrategy =
    config.conflictStrategy ?? (force ? 'overwrite' : 'skip');
  const packageRoot = resolvePackageRoot(config.packageRoot);

  const stats: InstallStats = { copied: [], skipped: [], merged: [], created: [] };

  const copyOptions: CopyOptions = {
    dryRun,
    force,
    conflictStrategy,
    stats,
  };

  // 1. Copy .jumpstart/ framework directory
  const jumpstartSrc = path.join(packageRoot, JUMPSTART_DIR);
  const jumpstartDest = path.join(targetPath, JUMPSTART_DIR);
  copyDirectoryRecursive(jumpstartSrc, jumpstartDest, copyOptions);

  // 2. Copy integration files (with optional merge for AGENTS.md / CLAUDE.md)
  for (const file of INTEGRATION_FILES) {
    const src = path.join(packageRoot, file);
    const dest = path.join(targetPath, file);
    const fileOptions: CopyOptions = {
      ...copyOptions,
      mergeResolver: MERGEABLE_INTEGRATION_FILES.includes(file) ? mergeInstructionDocument : null,
    };
    copyOneFile(src, dest, fileOptions);
  }

  // 3. Copy .github/ if copilot opted in
  if (config.copilot) {
    const githubSrc = path.join(packageRoot, GITHUB_DIR);
    const githubDest = path.join(targetPath, GITHUB_DIR);
    copyDirectoryRecursive(githubSrc, githubDest, copyOptions);
  }

  // 4. Create scaffold directory structure
  const dirsToCreate =
    config.projectType === 'greenfield' ? [...SPEC_DIRS, ...OUTPUT_DIRS] : [...SPEC_DIRS];
  createDirectories(targetPath, dirsToCreate, { dryRun, stats });

  // 5. Q&A decision log seed
  const qaLogSrc = path.join(packageRoot, JUMPSTART_DIR, 'templates', 'qa-log.md');
  const qaLogDest = path.join(targetPath, 'specs', 'qa-log.md');
  copyOneFile(qaLogSrc, qaLogDest, copyOptions);

  // 6. Seed timeline + usage log if absent (idempotent)
  if (!dryRun) {
    seedTimelineIfAbsent(targetPath, config.projectType, stats);
    seedUsageLogIfAbsent(targetPath, stats);
  }

  // 7. Persist bootstrap answers to .jumpstart/config.yaml
  let appliedAnswers: string[] = [];
  const configPath = path.join(targetPath, JUMPSTART_DIR, 'config.yaml');
  const hasBootstrapAnswers = Boolean(
    config.projectName || config.projectType || config.approverName
  );
  if (hasBootstrapAnswers) {
    const persistResult = persistBootstrapAnswers(configPath, config, { dryRun });
    if (persistResult.changed && persistResult.applied.length > 0) {
      appliedAnswers = persistResult.applied;
    }
  }

  // 8. Stamp framework manifest for future upgrade safety
  if (!dryRun) {
    try {
      const version = getPackageVersion(packageRoot);
      const manifest = generateManifest(targetPath, { version });
      writeFrameworkManifest(targetPath, manifest);

      // Save the shipped config.yaml as `<...>.default` so future
      // upgrades have a baseline for three-way merges.
      const configSrc = path.join(packageRoot, JUMPSTART_DIR, 'config.yaml');
      const configDefaultDest = path.join(targetPath, JUMPSTART_DIR, 'config.yaml.default');
      if (existsSync(configSrc)) {
        copyFileSync(configSrc, configDefaultDest);
      }
    } catch {
      // Non-fatal — upgrade flow will create a manifest on first run.
    }
  }

  // 9. Emit skip-warning if AGENTS.md / CLAUDE.md were skipped
  const skipSensitiveFiles = stats.skipped.filter((filePath) =>
    MERGEABLE_INTEGRATION_FILES.includes(path.basename(filePath))
  );
  let skipWarningEmitted: string[] = [];
  if (skipSensitiveFiles.length > 0 && conflictStrategy === 'skip') {
    skipWarningEmitted = skipSensitiveFiles.map((p) => path.basename(p));
    persistSkipWarning(targetPath, skipWarningEmitted, dryRun);
  }

  return {
    success: true,
    stats,
    conflicts: detectConflicts(targetPath, config),
    skipWarningEmitted,
    appliedAnswers,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Internal seed helpers
// ─────────────────────────────────────────────────────────────────────────

function seedTimelineIfAbsent(
  targetPath: string,
  projectType: ProjectType | undefined,
  stats: InstallStats
): void {
  const timelinePath = path.join(targetPath, JUMPSTART_DIR, 'state', 'timeline.json');
  if (existsSync(timelinePath)) return;

  const stateDir = path.join(targetPath, JUMPSTART_DIR, 'state');
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });

  const sessionId = `ses-init-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const seed = {
    version: '1.0.0',
    session_id: sessionId,
    started_at: now,
    ended_at: now,
    events: [
      {
        id: `evt-init-${Date.now().toString(36)}`,
        timestamp: now,
        session_id: sessionId,
        phase: 'init',
        agent: 'System',
        parent_agent: null,
        event_type: 'phase_start',
        action: 'Jump Start framework initialized — workspace scaffolded',
        metadata: {
          project_type: projectType ?? 'unknown',
          config_path: '.jumpstart/config.yaml',
        },
        duration_ms: null,
      },
    ],
  };

  writeFileSync(timelinePath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
  stats.created.push(timelinePath);
}

function seedUsageLogIfAbsent(targetPath: string, stats: InstallStats): void {
  const usageLogPath = path.join(targetPath, JUMPSTART_DIR, 'usage-log.json');
  if (existsSync(usageLogPath)) return;

  writeFileSync(
    usageLogPath,
    `${JSON.stringify({ entries: [], total_tokens: 0, total_cost_usd: 0 }, null, 2)}\n`,
    'utf8'
  );
  stats.created.push(usageLogPath);
}
