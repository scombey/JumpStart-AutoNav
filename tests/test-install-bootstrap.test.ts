/**
 * tests/test-install-bootstrap.test.ts — install-bootstrap port (#50).
 *
 * Covers the public surface of `src/lib/install-bootstrap.ts`:
 *   - `detectProjectType` (heuristic greenfield/brownfield classification)
 *   - `detectConflicts` (pre-flight conflict report)
 *   - `buildMergedInstructionBlock` (markdown merge-block assembly)
 *   - `mergeInstructionDocument` (idempotent insert/update)
 *   - `installBootstrap` end-to-end (skip / overwrite / merge / dry-run)
 *
 * @see src/lib/install-bootstrap.ts
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMergedInstructionBlock,
  detectConflicts,
  detectProjectType,
  INTEGRATION_FILES,
  installBootstrap,
  MERGEABLE_INTEGRATION_FILES,
  mergeInstructionDocument,
} from '../src/lib/install-bootstrap.js';

// Helper to materialize a tiny "package root" with the framework files
// the installer expects to find. The installer walks JUMPSTART_DIR + the
// integration files + (optionally) GITHUB_DIR; we stub minimal versions.
function makePackageRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'jumpstart-bootstrap-pkg-'));
  // .jumpstart/ — the framework directory
  mkdirSync(path.join(root, '.jumpstart', 'templates'), { recursive: true });
  mkdirSync(path.join(root, '.jumpstart', 'agents'), { recursive: true });
  mkdirSync(path.join(root, '.jumpstart', 'schemas'), { recursive: true });
  writeFileSync(
    path.join(root, '.jumpstart', 'config.yaml'),
    'project:\n  name: ""\n  type: greenfield\n  approver: ""\n',
    'utf8'
  );
  writeFileSync(
    path.join(root, '.jumpstart', 'templates', 'qa-log.md'),
    '# Q&A Decision Log\n\n_Empty._\n',
    'utf8'
  );
  // Integration files
  writeFileSync(
    path.join(root, 'AGENTS.md'),
    '# Jump Start Framework — Agents\n\nFramework agent rules.\n',
    'utf8'
  );
  writeFileSync(
    path.join(root, 'CLAUDE.md'),
    '# Jump Start — Claude\n\nFramework Claude rules.\n',
    'utf8'
  );
  writeFileSync(path.join(root, '.cursorrules'), '# Jump Start cursor rules\n', 'utf8');
  // package.json (for getPackageVersion)
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'jumpstart-test-pkg', version: '2.0.0-test' }, null, 2),
    'utf8'
  );
  return root;
}

let pkgRoot: string;
let target: string;

beforeEach(() => {
  pkgRoot = makePackageRoot();
  target = mkdtempSync(path.join(tmpdir(), 'jumpstart-bootstrap-target-'));
});

afterEach(() => {
  rmSync(pkgRoot, { recursive: true, force: true });
  rmSync(target, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────
// detectProjectType
// ─────────────────────────────────────────────────────────────────────────

describe('detectProjectType', () => {
  it('classifies an empty directory as greenfield', () => {
    const r = detectProjectType(target);
    expect(r.type).toBe('greenfield');
    expect(r.signals).toEqual([]);
  });

  it('classifies a directory with package.json + .git as brownfield', () => {
    writeFileSync(path.join(target, 'package.json'), '{}');
    mkdirSync(path.join(target, '.git', 'refs', 'heads'), { recursive: true });
    const r = detectProjectType(target);
    expect(r.type).toBe('brownfield');
    expect(r.signals).toContain('.git history');
    expect(r.signals).toContain('package.json');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('classifies a directory with src/ + Dockerfile as brownfield', () => {
    mkdirSync(path.join(target, 'src'), { recursive: true });
    writeFileSync(path.join(target, 'src', 'app.js'), 'console.log("hi");\n');
    writeFileSync(path.join(target, 'Dockerfile'), 'FROM node:24\n');
    const r = detectProjectType(target);
    expect(r.type).toBe('brownfield');
    expect(r.signals).toContain('Dockerfile');
    expect(r.signals).toContain('src/');
  });

  it('caps signal collection at 5 (DoS guard)', () => {
    // Plant 10 brownfield indicators; we expect ≤ 5 in the result.
    const indicators = [
      'package.json',
      'tsconfig.json',
      'Dockerfile',
      'Makefile',
      '.gitignore',
      'go.mod',
      'Cargo.toml',
      'composer.json',
      'pom.xml',
      'build.gradle',
    ];
    for (const f of indicators) writeFileSync(path.join(target, f), '');
    const r = detectProjectType(target);
    expect(r.signals.length).toBeLessThanOrEqual(5);
    expect(r.type).toBe('brownfield');
  });

  it('treats a src/ with only .gitkeep as NOT a brownfield signal', () => {
    mkdirSync(path.join(target, 'src'), { recursive: true });
    writeFileSync(path.join(target, 'src', '.gitkeep'), '');
    const r = detectProjectType(target);
    // .gitkeep alone shouldn't push score over the threshold
    expect(r.signals).not.toContain('src/');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// detectConflicts
// ─────────────────────────────────────────────────────────────────────────

describe('detectConflicts', () => {
  it('returns empty array for a virgin directory', () => {
    const c = detectConflicts(target, { targetDir: target });
    expect(c).toEqual([]);
  });

  it('reports .jumpstart conflict when present', () => {
    mkdirSync(path.join(target, '.jumpstart'), { recursive: true });
    const c = detectConflicts(target, { targetDir: target });
    expect(c).toContain('.jumpstart');
  });

  it('reports integration-file conflicts (AGENTS.md, CLAUDE.md, .cursorrules)', () => {
    writeFileSync(path.join(target, 'AGENTS.md'), '# existing\n');
    writeFileSync(path.join(target, 'CLAUDE.md'), '# existing\n');
    const c = detectConflicts(target, { targetDir: target });
    expect(c).toContain('AGENTS.md');
    expect(c).toContain('CLAUDE.md');
  });

  it('reports .github only when copilot opt-in is set', () => {
    mkdirSync(path.join(target, '.github'), { recursive: true });
    expect(detectConflicts(target, { targetDir: target })).not.toContain('.github');
    expect(detectConflicts(target, { targetDir: target, copilot: true })).toContain('.github');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildMergedInstructionBlock + mergeInstructionDocument
// ─────────────────────────────────────────────────────────────────────────

describe('buildMergedInstructionBlock', () => {
  it('wraps content in BEGIN/END markers with the file name', () => {
    const r = buildMergedInstructionBlock('hello world\n', 'AGENTS.md');
    expect(r.startMarker).toBe('<!-- BEGIN JUMPSTART MERGE: AGENTS.md -->');
    expect(r.endMarker).toBe('<!-- END JUMPSTART MERGE: AGENTS.md -->');
    expect(r.block).toContain('## Jump Start Framework Instructions (Merged)');
    expect(r.block).toContain('hello world');
  });

  it('trims framework content', () => {
    const r = buildMergedInstructionBlock('   foo   \n\n', 'CLAUDE.md');
    // The trimmed body sits between the markers
    expect(r.block).toContain('<!-- BEGIN JUMPSTART MERGE: CLAUDE.md -->\nfoo\n<!-- END');
  });
});

describe('mergeInstructionDocument', () => {
  it('appends the merge block to existing user content (first run)', () => {
    const merged = mergeInstructionDocument(
      '# My Project\n\nCustom team instructions.\n',
      'Framework rules.\n',
      'AGENTS.md'
    );
    expect(merged).toContain('Custom team instructions.');
    expect(merged).toContain('<!-- BEGIN JUMPSTART MERGE: AGENTS.md -->');
    expect(merged).toContain('Framework rules.');
    expect(merged).toContain('<!-- END JUMPSTART MERGE: AGENTS.md -->');
  });

  it('replaces an existing block in-place (idempotent re-runs)', () => {
    const first = mergeInstructionDocument('# Hi\n', 'v1 framework rules', 'AGENTS.md');
    const second = mergeInstructionDocument(first, 'v2 framework rules', 'AGENTS.md');
    // Second run replaces v1 with v2
    expect(second).toContain('v2 framework rules');
    expect(second).not.toContain('v1 framework rules');
    // Single block (no duplication)
    const markerCount = (second.match(/BEGIN JUMPSTART MERGE: AGENTS\.md/g) ?? []).length;
    expect(markerCount).toBe(1);
  });

  it('preserves user content above the merge block', () => {
    const first = mergeInstructionDocument(
      '# My Project\n\nCustom team instructions.\n',
      'Framework v1',
      'CLAUDE.md'
    );
    const second = mergeInstructionDocument(first, 'Framework v2', 'CLAUDE.md');
    // User content survives both runs
    expect(second).toContain('Custom team instructions.');
  });

  it('uses regex-safe markers (file names with regex specials)', () => {
    // A file name with regex-special characters would have broken the
    // legacy merge regex without escaping. The port escapes the markers.
    const fileName = 'a.b+c*.md';
    const first = mergeInstructionDocument('user\n', 'framework', fileName);
    expect(first).toContain(`<!-- BEGIN JUMPSTART MERGE: ${fileName} -->`);
    const second = mergeInstructionDocument(first, 'framework v2', fileName);
    const markerCount = (second.match(/BEGIN JUMPSTART MERGE: a\.b\+c\*\.md/g) ?? []).length;
    expect(markerCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// installBootstrap end-to-end
// ─────────────────────────────────────────────────────────────────────────

describe('installBootstrap', () => {
  it('copies framework files into a virgin target', async () => {
    const r = await installBootstrap({ targetDir: target, packageRoot: pkgRoot });
    expect(r.success).toBe(true);
    expect(existsSync(path.join(target, '.jumpstart'))).toBe(true);
    expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(true);
    expect(existsSync(path.join(target, 'CLAUDE.md'))).toBe(true);
    expect(r.stats.copied.length).toBeGreaterThan(0);
  });

  it('persists project name + approver + type to config.yaml', async () => {
    await installBootstrap({
      targetDir: target,
      packageRoot: pkgRoot,
      projectName: 'Test Project',
      approverName: 'QA Team',
      projectType: 'brownfield',
    });
    const config = readFileSync(path.join(target, '.jumpstart', 'config.yaml'), 'utf8');
    expect(config).toContain('Test Project');
    expect(config).toContain('QA Team');
    expect(config).toContain('brownfield');
  });

  it('respects --conflict skip (default) — preserves existing AGENTS.md', async () => {
    writeFileSync(path.join(target, 'AGENTS.md'), '# Custom rules\n');
    const r = await installBootstrap({ targetDir: target, packageRoot: pkgRoot });
    expect(readFileSync(path.join(target, 'AGENTS.md'), 'utf8')).toBe('# Custom rules\n');
    expect(r.stats.skipped).toContain(path.join(target, 'AGENTS.md'));
  });

  it('respects --conflict overwrite — replaces existing AGENTS.md outright', async () => {
    writeFileSync(path.join(target, 'AGENTS.md'), '# Custom\n');
    const r = await installBootstrap({
      targetDir: target,
      packageRoot: pkgRoot,
      conflictStrategy: 'overwrite',
      force: true,
    });
    const content = readFileSync(path.join(target, 'AGENTS.md'), 'utf8');
    expect(content).toContain('Framework agent rules.');
    expect(content).not.toContain('# Custom\n');
    expect(r.success).toBe(true);
  });

  it('respects --conflict merge — wraps existing user content with framework block', async () => {
    writeFileSync(path.join(target, 'AGENTS.md'), '# My Project\n\nCustom team instructions.\n');
    await installBootstrap({
      targetDir: target,
      packageRoot: pkgRoot,
      conflictStrategy: 'merge',
    });
    const content = readFileSync(path.join(target, 'AGENTS.md'), 'utf8');
    // User content preserved
    expect(content).toContain('Custom team instructions.');
    // Framework merge block inserted
    expect(content).toContain('<!-- BEGIN JUMPSTART MERGE: AGENTS.md -->');
    expect(content).toContain('Framework agent rules.');
    expect(content).toContain('<!-- END JUMPSTART MERGE: AGENTS.md -->');
  });

  it('--conflict merge is idempotent across reruns', async () => {
    writeFileSync(path.join(target, 'AGENTS.md'), '# My Project\n\nCustom team instructions.\n');
    await installBootstrap({
      targetDir: target,
      packageRoot: pkgRoot,
      conflictStrategy: 'merge',
    });
    await installBootstrap({
      targetDir: target,
      packageRoot: pkgRoot,
      conflictStrategy: 'merge',
    });
    const content = readFileSync(path.join(target, 'AGENTS.md'), 'utf8');
    const markerCount = (content.match(/BEGIN JUMPSTART MERGE: AGENTS\.md/g) ?? []).length;
    expect(markerCount).toBe(1);
  });

  it('emits skip-warning when AGENTS.md/CLAUDE.md skipped (--conflict skip default)', async () => {
    writeFileSync(path.join(target, 'AGENTS.md'), '# Custom\n');
    writeFileSync(path.join(target, 'CLAUDE.md'), '# Custom\n');
    const r = await installBootstrap({ targetDir: target, packageRoot: pkgRoot });
    expect(r.skipWarningEmitted).toContain('AGENTS.md');
    expect(r.skipWarningEmitted).toContain('CLAUDE.md');
    const warningPath = path.join(target, '.jumpstart', 'state', 'install-warnings.md');
    expect(existsSync(warningPath)).toBe(true);
    const warning = readFileSync(warningPath, 'utf8');
    expect(warning).toContain('AGENTS.md');
    expect(warning).toContain('CLAUDE.md');
    expect(warning).toContain('--conflict merge');
  });

  it('does NOT emit skip-warning when integration files were merged', async () => {
    writeFileSync(path.join(target, 'AGENTS.md'), '# Custom\n');
    const r = await installBootstrap({
      targetDir: target,
      packageRoot: pkgRoot,
      conflictStrategy: 'merge',
    });
    expect(r.skipWarningEmitted).toEqual([]);
    expect(existsSync(path.join(target, '.jumpstart', 'state', 'install-warnings.md'))).toBe(false);
  });

  it('--dry-run reports stats without writing files', async () => {
    const r = await installBootstrap({
      targetDir: target,
      packageRoot: pkgRoot,
      dryRun: true,
    });
    expect(r.success).toBe(true);
    expect(r.stats.copied.length).toBeGreaterThan(0);
    // But nothing actually got written
    expect(existsSync(path.join(target, '.jumpstart', 'config.yaml'))).toBe(false);
    expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(false);
  });

  it('creates greenfield directory scaffold (specs + src + tests)', async () => {
    await installBootstrap({
      targetDir: target,
      packageRoot: pkgRoot,
      projectType: 'greenfield',
    });
    expect(existsSync(path.join(target, 'specs', 'decisions'))).toBe(true);
    expect(existsSync(path.join(target, 'specs', 'research'))).toBe(true);
    expect(existsSync(path.join(target, 'specs', 'insights'))).toBe(true);
    expect(existsSync(path.join(target, 'src'))).toBe(true);
    expect(existsSync(path.join(target, 'tests'))).toBe(true);
  });

  it('creates brownfield directory scaffold (specs only — preserves existing src/tests)', async () => {
    // Brownfield: pre-existing src/tests with content; installer must NOT
    // touch them (only specs/* gets scaffolded).
    mkdirSync(path.join(target, 'src'), { recursive: true });
    writeFileSync(path.join(target, 'src', 'existing.ts'), 'export {};\n');

    await installBootstrap({
      targetDir: target,
      packageRoot: pkgRoot,
      projectType: 'brownfield',
    });

    expect(existsSync(path.join(target, 'specs', 'decisions'))).toBe(true);
    // Pre-existing user code survives
    expect(readFileSync(path.join(target, 'src', 'existing.ts'), 'utf8')).toBe('export {};\n');
  });

  it('seeds .jumpstart/state/timeline.json on first run, idempotent on rerun', async () => {
    await installBootstrap({ targetDir: target, packageRoot: pkgRoot });
    const timelinePath = path.join(target, '.jumpstart', 'state', 'timeline.json');
    expect(existsSync(timelinePath)).toBe(true);
    const seedContent = readFileSync(timelinePath, 'utf8');
    expect(seedContent).toContain('phase_start');

    // Rerun should NOT overwrite the existing timeline
    await installBootstrap({ targetDir: target, packageRoot: pkgRoot });
    expect(readFileSync(timelinePath, 'utf8')).toBe(seedContent);
  });

  it('seeds .jumpstart/usage-log.json on first run', async () => {
    await installBootstrap({ targetDir: target, packageRoot: pkgRoot });
    const usagePath = path.join(target, '.jumpstart', 'usage-log.json');
    expect(existsSync(usagePath)).toBe(true);
    const usage = JSON.parse(readFileSync(usagePath, 'utf8'));
    expect(usage.entries).toEqual([]);
    expect(usage.total_tokens).toBe(0);
  });

  it('exports the canonical INTEGRATION_FILES + MERGEABLE_INTEGRATION_FILES constants', () => {
    expect(INTEGRATION_FILES).toEqual(['AGENTS.md', 'CLAUDE.md', '.cursorrules']);
    expect(MERGEABLE_INTEGRATION_FILES).toEqual(['AGENTS.md', 'CLAUDE.md']);
    // .cursorrules is intentionally NOT mergeable (no merge semantics for it)
    expect(MERGEABLE_INTEGRATION_FILES).not.toContain('.cursorrules');
  });
});
