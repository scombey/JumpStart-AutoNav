/**
 * test-upgrade.test.js — Tests for the framework upgrade system
 *
 * Covers: framework manifest generation, diffing, user modification detection,
 * config merge, upgrade flow, and restore functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Dynamic import helpers ──────────────────────────────────────────────────
let manifestMod;
let configMergeMod;
let upgradeMod;

beforeEach(async () => {
  manifestMod = await import('../bin/lib/framework-manifest.js');
  configMergeMod = await import('../bin/lib/config-merge.js');
  upgradeMod = await import('../bin/lib/upgrade.js');
});

// ── Temp directory helpers ──────────────────────────────────────────────────

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jumpstart-upgrade-test-'));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore cleanup errors */ }
}

function writeFile(dir, relPath, content) {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function readFileContent(dir, relPath) {
  return fs.readFileSync(path.join(dir, relPath), 'utf8');
}

// ══════════════════════════════════════════════════════════════════════════════
// Framework Manifest Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('framework-manifest', () => {

  describe('isFrameworkOwned', () => {
    it('should identify agent files as framework-owned', () => {
      expect(manifestMod.isFrameworkOwned('.jumpstart/agents/challenger.md')).toBe(true);
      expect(manifestMod.isFrameworkOwned('.jumpstart/agents/analyst.md')).toBe(true);
    });

    it('should identify template files as framework-owned', () => {
      expect(manifestMod.isFrameworkOwned('.jumpstart/templates/prd.md')).toBe(true);
    });

    it('should identify schema files as framework-owned', () => {
      expect(manifestMod.isFrameworkOwned('.jumpstart/schemas/prd.schema.json')).toBe(true);
    });

    it('should identify top-level integration files as framework-owned', () => {
      expect(manifestMod.isFrameworkOwned('AGENTS.md')).toBe(true);
      expect(manifestMod.isFrameworkOwned('CLAUDE.md')).toBe(true);
      expect(manifestMod.isFrameworkOwned('.cursorrules')).toBe(true);
    });

    it('should identify GitHub Copilot files as framework-owned', () => {
      expect(manifestMod.isFrameworkOwned('.github/agents/challenger.agent.md')).toBe(true);
      expect(manifestMod.isFrameworkOwned('.github/copilot-instructions.md')).toBe(true);
    });

    it('should identify roadmap and glossary as framework-owned', () => {
      expect(manifestMod.isFrameworkOwned('.jumpstart/roadmap.md')).toBe(true);
      expect(manifestMod.isFrameworkOwned('.jumpstart/glossary.md')).toBe(true);
      expect(manifestMod.isFrameworkOwned('.jumpstart/invariants.md')).toBe(true);
    });
  });

  describe('isUserOwned', () => {
    it('should identify config.yaml as user-owned', () => {
      expect(manifestMod.isUserOwned('.jumpstart/config.yaml')).toBe(true);
    });

    it('should identify state files as user-owned', () => {
      expect(manifestMod.isUserOwned('.jumpstart/state/state.json')).toBe(true);
      expect(manifestMod.isUserOwned('.jumpstart/state/todos.json')).toBe(true);
    });

    it('should identify specs as user-owned', () => {
      expect(manifestMod.isUserOwned('specs/prd.md')).toBe(true);
      expect(manifestMod.isUserOwned('specs/architecture.md')).toBe(true);
    });

    it('should identify installed.json as user-owned', () => {
      expect(manifestMod.isUserOwned('.jumpstart/installed.json')).toBe(true);
    });

    it('should identify user skills as user-owned', () => {
      expect(manifestMod.isUserOwned('.jumpstart/skills/my-skill/SKILL.md')).toBe(true);
    });

    it('should identify archive as user-owned', () => {
      expect(manifestMod.isUserOwned('.jumpstart/archive/prd.2026-01-01.md')).toBe(true);
    });

    it('should identify src and tests as user-owned', () => {
      expect(manifestMod.isUserOwned('src/index.js')).toBe(true);
      expect(manifestMod.isUserOwned('tests/test-app.js')).toBe(true);
    });

    it('user-owned should take precedence over framework patterns', () => {
      // config.yaml is under .jumpstart/ but is user-owned
      expect(manifestMod.isFrameworkOwned('.jumpstart/config.yaml')).toBe(false);
      expect(manifestMod.isUserOwned('.jumpstart/config.yaml')).toBe(true);
    });
  });

  describe('hashFile', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = createTempDir(); });
    afterEach(() => { cleanupDir(tmpDir); });

    it('should produce consistent SHA-256 hashes', () => {
      writeFile(tmpDir, 'test.txt', 'hello world');
      const hash1 = manifestMod.hashFile(path.join(tmpDir, 'test.txt'));
      const hash2 = manifestMod.hashFile(path.join(tmpDir, 'test.txt'));
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different content', () => {
      writeFile(tmpDir, 'a.txt', 'content a');
      writeFile(tmpDir, 'b.txt', 'content b');
      const hashA = manifestMod.hashFile(path.join(tmpDir, 'a.txt'));
      const hashB = manifestMod.hashFile(path.join(tmpDir, 'b.txt'));
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('generateManifest', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = createTempDir(); });
    afterEach(() => { cleanupDir(tmpDir); });

    it('should generate manifest with framework files only', () => {
      writeFile(tmpDir, '.jumpstart/agents/challenger.md', '# Challenger');
      writeFile(tmpDir, '.jumpstart/config.yaml', 'project:\n  name: test');
      writeFile(tmpDir, '.jumpstart/templates/prd.md', '# PRD Template');

      const manifest = manifestMod.generateManifest(tmpDir, { version: '1.0.0' });

      expect(manifest.frameworkVersion).toBe('1.0.0');
      expect(manifest.files['.jumpstart/agents/challenger.md']).toBeDefined();
      expect(manifest.files['.jumpstart/templates/prd.md']).toBeDefined();
      // config.yaml is user-owned, should NOT be in manifest
      expect(manifest.files['.jumpstart/config.yaml']).toBeUndefined();
    });

    it('should include version and timestamp', () => {
      writeFile(tmpDir, '.jumpstart/agents/test.md', 'test');
      const manifest = manifestMod.generateManifest(tmpDir, { version: '2.0.0' });
      expect(manifest.frameworkVersion).toBe('2.0.0');
      expect(manifest.generatedAt).toBeDefined();
    });
  });

  describe('diffManifest', () => {
    it('should detect added files', () => {
      const old = { files: { 'a.md': 'hash1' } };
      const neu = { files: { 'a.md': 'hash1', 'b.md': 'hash2' } };
      const diff = manifestMod.diffManifest(old, neu);
      expect(diff.added).toEqual(['b.md']);
      expect(diff.unchanged).toEqual(['a.md']);
    });

    it('should detect removed files', () => {
      const old = { files: { 'a.md': 'hash1', 'b.md': 'hash2' } };
      const neu = { files: { 'a.md': 'hash1' } };
      const diff = manifestMod.diffManifest(old, neu);
      expect(diff.removed).toEqual(['b.md']);
    });

    it('should detect changed files', () => {
      const old = { files: { 'a.md': 'hash1' } };
      const neu = { files: { 'a.md': 'hash2' } };
      const diff = manifestMod.diffManifest(old, neu);
      expect(diff.changed).toEqual(['a.md']);
    });

    it('should detect unchanged files', () => {
      const old = { files: { 'a.md': 'hash1' } };
      const neu = { files: { 'a.md': 'hash1' } };
      const diff = manifestMod.diffManifest(old, neu);
      expect(diff.unchanged).toEqual(['a.md']);
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
      expect(diff.changed).toEqual([]);
    });

    it('should handle empty manifests', () => {
      const diff = manifestMod.diffManifest({ files: {} }, { files: {} });
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
      expect(diff.changed).toEqual([]);
      expect(diff.unchanged).toEqual([]);
    });
  });

  describe('detectUserModifications', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = createTempDir(); });
    afterEach(() => { cleanupDir(tmpDir); });

    it('should detect modified files', () => {
      writeFile(tmpDir, 'test.md', 'original content');
      const originalHash = manifestMod.hashFile(path.join(tmpDir, 'test.md'));
      const manifest = { files: { 'test.md': originalHash } };

      // Modify the file
      writeFile(tmpDir, 'test.md', 'modified content');

      const result = manifestMod.detectUserModifications(tmpDir, manifest);
      expect(result.modified).toEqual(['test.md']);
      expect(result.unmodified).toEqual([]);
    });

    it('should detect unmodified files', () => {
      writeFile(tmpDir, 'test.md', 'same content');
      const hash = manifestMod.hashFile(path.join(tmpDir, 'test.md'));
      const manifest = { files: { 'test.md': hash } };

      const result = manifestMod.detectUserModifications(tmpDir, manifest);
      expect(result.unmodified).toEqual(['test.md']);
      expect(result.modified).toEqual([]);
    });

    it('should detect missing files', () => {
      const manifest = { files: { 'nonexistent.md': 'somehash' } };
      const result = manifestMod.detectUserModifications(tmpDir, manifest);
      expect(result.missing).toEqual(['nonexistent.md']);
    });
  });

  describe('readFrameworkManifest / writeFrameworkManifest', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = createTempDir(); });
    afterEach(() => { cleanupDir(tmpDir); });

    it('should return null when no manifest exists', () => {
      expect(manifestMod.readFrameworkManifest(tmpDir)).toBeNull();
    });

    it('should roundtrip a manifest', () => {
      const manifest = {
        frameworkVersion: '1.2.3',
        generatedAt: '2026-02-25T00:00:00.000Z',
        files: { 'a.md': 'hash1', 'b.md': 'hash2' },
      };
      fs.mkdirSync(path.join(tmpDir, '.jumpstart'), { recursive: true });
      manifestMod.writeFrameworkManifest(tmpDir, manifest);
      const loaded = manifestMod.readFrameworkManifest(tmpDir);
      expect(loaded).toEqual(manifest);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Config Merge Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('config-merge', () => {

  describe('flattenYaml', () => {
    it('should parse simple key-value pairs', () => {
      const yaml = 'name: test\nversion: 1.0.0';
      const result = configMergeMod.flattenYaml(yaml);
      expect(result.name).toBe('test');
      expect(result.version).toBe('1.0.0');
    });

    it('should parse nested keys', () => {
      const yaml = 'project:\n  name: "My Project"\n  type: greenfield';
      const result = configMergeMod.flattenYaml(yaml);
      expect(result['project.name']).toBe('"My Project"');
      expect(result['project.type']).toBe('greenfield');
    });

    it('should strip inline comments', () => {
      const yaml = 'enabled: true  # Enable this feature';
      const result = configMergeMod.flattenYaml(yaml);
      expect(result.enabled).toBe('true');
    });

    it('should skip comment-only and empty lines', () => {
      const yaml = '# Comment\n\nkey: value\n\n# Another comment';
      const result = configMergeMod.flattenYaml(yaml);
      expect(Object.keys(result)).toEqual(['key']);
      expect(result.key).toBe('value');
    });

    it('should handle deeply nested keys', () => {
      const yaml = 'agents:\n  challenger:\n    depth: 3\n    tone: direct';
      const result = configMergeMod.flattenYaml(yaml);
      expect(result['agents.challenger.depth']).toBe('3');
      expect(result['agents.challenger.tone']).toBe('direct');
    });
  });

  describe('mergeConfigs', () => {
    it('should preserve user values that differ from old default', () => {
      const oldDefault = 'ceremony:\n  profile: standard';
      const newDefault = 'ceremony:\n  profile: standard';
      const userCurrent = 'ceremony:\n  profile: lean';

      const result = configMergeMod.mergeConfigs(oldDefault, newDefault, userCurrent);
      expect(result.mergedYaml).toContain('profile: lean');
    });

    it('should adopt new default when user kept old default', () => {
      const oldDefault = 'ceremony:\n  profile: standard';
      const newDefault = 'ceremony:\n  profile: comprehensive';
      const userCurrent = 'ceremony:\n  profile: standard';

      const result = configMergeMod.mergeConfigs(oldDefault, newDefault, userCurrent);
      expect(result.mergedYaml).toContain('profile: comprehensive');
    });

    it('should detect conflicts when both user and framework changed', () => {
      const oldDefault = 'testing:\n  threshold: 80';
      const newDefault = 'testing:\n  threshold: 90';
      const userCurrent = 'testing:\n  threshold: 75';

      const result = configMergeMod.mergeConfigs(oldDefault, newDefault, userCurrent);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].key).toBe('testing.threshold');
      expect(result.conflicts[0].userValue).toBe('75');
      expect(result.conflicts[0].newDefault).toBe('90');
    });

    it('should identify new keys added in new default', () => {
      const oldDefault = 'ceremony:\n  profile: standard';
      const newDefault = 'ceremony:\n  profile: standard\nnew_feature:\n  enabled: true';
      const userCurrent = 'ceremony:\n  profile: standard';

      const result = configMergeMod.mergeConfigs(oldDefault, newDefault, userCurrent);
      expect(result.newKeys).toContain('new_feature.enabled');
    });

    it('should never overwrite protected keys (hooks, project.name)', () => {
      const oldDefault = 'project:\n  name: ""\nhooks:\n  pre_phase: ""';
      const newDefault = 'project:\n  name: ""\nhooks:\n  pre_phase: "echo hello"';
      const userCurrent = 'project:\n  name: "My App"\nhooks:\n  pre_phase: "my-script.sh"';

      const result = configMergeMod.mergeConfigs(oldDefault, newDefault, userCurrent);
      // User's hooks and project name must be preserved
      expect(result.mergedYaml).toContain('name: "My App"');
      expect(result.mergedYaml).toContain('pre_phase: "my-script.sh"');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Upgrade Flow Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('upgrade', () => {
  let projectDir;
  let packageDir;

  beforeEach(() => {
    projectDir = createTempDir();
    packageDir = createTempDir();

    // Set up a mock package root
    writeFile(packageDir, 'package.json', JSON.stringify({ name: 'jumpstart-mode', version: '2.0.0' }));
    writeFile(packageDir, '.jumpstart/agents/challenger.md', '# Challenger v2');
    writeFile(packageDir, '.jumpstart/agents/analyst.md', '# Analyst v2');
    writeFile(packageDir, '.jumpstart/templates/prd.md', '# PRD Template v2');
    writeFile(packageDir, '.jumpstart/config.yaml', 'project:\n  name: ""\n  type: null');
    writeFile(packageDir, '.jumpstart/roadmap.md', '# Roadmap v2');
  });

  afterEach(() => {
    cleanupDir(projectDir);
    cleanupDir(packageDir);
  });

  it('should fail when no .jumpstart directory exists', async () => {
    const logs = [];
    const result = await upgradeMod.upgrade(projectDir, {
      packageRoot: packageDir,
      yes: true,
      log: (msg) => logs.push(msg),
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('No .jumpstart directory found');
  });

  it('should report already up to date when versions match', async () => {
    // Set up project with matching version
    writeFile(projectDir, '.jumpstart/agents/challenger.md', '# Challenger v2');
    writeFile(projectDir, '.jumpstart/config.yaml', 'project:\n  name: test');
    const manifest = manifestMod.generateManifest(packageDir, { version: '2.0.0' });
    fs.mkdirSync(path.join(projectDir, '.jumpstart'), { recursive: true });
    manifestMod.writeFrameworkManifest(projectDir, manifest);

    const logs = [];
    const result = await upgradeMod.upgrade(projectDir, {
      packageRoot: packageDir,
      yes: true,
      log: (msg) => logs.push(msg),
    });
    expect(result.success).toBe(true);
    expect(result.filesUpdated).toBe(0);
  });

  it('should create initial manifest on first upgrade', async () => {
    // Project exists but has no manifest
    writeFile(projectDir, '.jumpstart/agents/challenger.md', '# Challenger v1');
    writeFile(projectDir, '.jumpstart/config.yaml', 'project:\n  name: test');

    const logs = [];
    const result = await upgradeMod.upgrade(projectDir, {
      packageRoot: packageDir,
      yes: true,
      log: (msg) => logs.push(msg),
    });
    expect(result.success).toBe(true);

    // Manifest should now exist
    const manifest = manifestMod.readFrameworkManifest(projectDir);
    expect(manifest).not.toBeNull();
    expect(manifest.frameworkVersion).toBe('2.0.0');
  });

  it('should back up user-modified framework files', async () => {
    // Set up project with v1 manifest
    writeFile(projectDir, '.jumpstart/agents/challenger.md', '# Challenger v1');
    writeFile(projectDir, '.jumpstart/config.yaml', 'project:\n  name: test');
    const v1Manifest = {
      frameworkVersion: '1.0.0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      files: {
        '.jumpstart/agents/challenger.md': manifestMod.hashFile(
          path.join(projectDir, '.jumpstart/agents/challenger.md')
        ),
      },
    };
    fs.mkdirSync(path.join(projectDir, '.jumpstart'), { recursive: true });
    manifestMod.writeFrameworkManifest(projectDir, v1Manifest);

    // User modifies the challenger agent
    writeFile(projectDir, '.jumpstart/agents/challenger.md', '# My Custom Challenger');

    const logs = [];
    const result = await upgradeMod.upgrade(projectDir, {
      packageRoot: packageDir,
      yes: true,
      log: (msg) => logs.push(msg),
    });

    expect(result.success).toBe(true);
    expect(result.filesBackedUp).toBeGreaterThan(0);
    expect(result.backedUpFiles).toContain('.jumpstart/agents/challenger.md');

    // Verify backup exists in archive
    const archiveDir = path.join(projectDir, '.jumpstart', 'archive');
    expect(fs.existsSync(archiveDir)).toBe(true);
    const archiveFiles = fs.readdirSync(archiveDir).filter(f => !f.endsWith('.meta.json'));
    expect(archiveFiles.length).toBeGreaterThan(0);

    // Verify the file was updated to v2
    const updatedContent = readFileContent(projectDir, '.jumpstart/agents/challenger.md');
    expect(updatedContent).toBe('# Challenger v2');
  });

  it('should not touch user-owned files', async () => {
    writeFile(projectDir, '.jumpstart/agents/challenger.md', '# Challenger v1');
    writeFile(projectDir, '.jumpstart/config.yaml', 'project:\n  name: "My Custom Project"');
    writeFile(projectDir, 'specs/prd.md', '# My Custom PRD');

    const v1Manifest = {
      frameworkVersion: '1.0.0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      files: {},
    };
    fs.mkdirSync(path.join(projectDir, '.jumpstart'), { recursive: true });
    manifestMod.writeFrameworkManifest(projectDir, v1Manifest);

    const logs = [];
    await upgradeMod.upgrade(projectDir, {
      packageRoot: packageDir,
      yes: true,
      log: (msg) => logs.push(msg),
    });

    // Specs should be untouched
    expect(readFileContent(projectDir, 'specs/prd.md')).toBe('# My Custom PRD');
  });

  it('should handle dry run without writing files', async () => {
    writeFile(projectDir, '.jumpstart/agents/challenger.md', '# Challenger v1');
    writeFile(projectDir, '.jumpstart/config.yaml', 'project:\n  name: test');
    const v1Manifest = {
      frameworkVersion: '1.0.0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      files: {
        '.jumpstart/agents/challenger.md': manifestMod.hashFile(
          path.join(projectDir, '.jumpstart/agents/challenger.md')
        ),
      },
    };
    fs.mkdirSync(path.join(projectDir, '.jumpstart'), { recursive: true });
    manifestMod.writeFrameworkManifest(projectDir, v1Manifest);

    const logs = [];
    const result = await upgradeMod.upgrade(projectDir, {
      packageRoot: packageDir,
      dryRun: true,
      log: (msg) => logs.push(msg),
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Dry run');

    // File should NOT have been updated
    expect(readFileContent(projectDir, '.jumpstart/agents/challenger.md')).toBe('# Challenger v1');
  });

  it('should cancel when user declines confirmation', async () => {
    writeFile(projectDir, '.jumpstart/agents/challenger.md', '# Challenger v1');
    writeFile(projectDir, '.jumpstart/config.yaml', 'project:\n  name: test');
    const v1Manifest = {
      frameworkVersion: '1.0.0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      files: {},
    };
    fs.mkdirSync(path.join(projectDir, '.jumpstart'), { recursive: true });
    manifestMod.writeFrameworkManifest(projectDir, v1Manifest);

    const logs = [];
    const result = await upgradeMod.upgrade(projectDir, {
      packageRoot: packageDir,
      confirm: async () => false,
      log: (msg) => logs.push(msg),
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Cancelled by user.');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Restore Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('restore', () => {

  it('should report no backups when archive is empty', () => {
    const tmpDir = createTempDir();
    try {
      const logs = [];
      const result = upgradeMod.restore(tmpDir, { log: (msg) => logs.push(msg) });
      expect(result.success).toBe(true);
      expect(result.restored).toEqual([]);
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('should list and restore upgrade backups', () => {
    const tmpDir = createTempDir();
    try {
      // Create a fake archive entry
      const archiveDir = path.join(tmpDir, '.jumpstart', 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      const archivedContent = '# My Custom Challenger';
      fs.writeFileSync(path.join(archiveDir, 'challenger.2026-02-25T10-00-00.md'), archivedContent);
      fs.writeFileSync(
        path.join(archiveDir, 'challenger.2026-02-25T10-00-00.md.meta.json'),
        JSON.stringify({
          original_path: '.jumpstart/agents/challenger.md',
          archived_at: '2026-02-25T10:00:00.000Z',
          reason: 'Framework upgrade from 1.0.0 to 2.0.0',
          operation: 'upgrade',
          from_version: '1.0.0',
          to_version: '2.0.0',
        })
      );

      // Create the target directory
      fs.mkdirSync(path.join(tmpDir, '.jumpstart', 'agents'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.jumpstart', 'agents', 'challenger.md'),
        '# Challenger v2'
      );

      // List backups
      const backups = upgradeMod.listUpgradeBackups(tmpDir);
      expect(backups).toHaveLength(1);
      expect(backups[0].originalPath).toBe('.jumpstart/agents/challenger.md');
      expect(backups[0].fromVersion).toBe('1.0.0');

      // Restore
      const logs = [];
      const result = upgradeMod.restore(tmpDir, { log: (msg) => logs.push(msg) });
      expect(result.success).toBe(true);
      expect(result.restored).toHaveLength(1);

      // Verify restored content
      const restored = fs.readFileSync(
        path.join(tmpDir, '.jumpstart', 'agents', 'challenger.md'),
        'utf8'
      );
      expect(restored).toBe(archivedContent);
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('should filter restore by version', () => {
    const tmpDir = createTempDir();
    try {
      const archiveDir = path.join(tmpDir, '.jumpstart', 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      // Two backups from different upgrade versions
      fs.writeFileSync(path.join(archiveDir, 'a.2026-01-01T00-00-00.md'), 'v1');
      fs.writeFileSync(
        path.join(archiveDir, 'a.2026-01-01T00-00-00.md.meta.json'),
        JSON.stringify({ original_path: 'a.md', archived_at: '2026-01-01', operation: 'upgrade', from_version: '1.0.0', to_version: '2.0.0' })
      );

      fs.writeFileSync(path.join(archiveDir, 'b.2026-02-01T00-00-00.md'), 'v1.5');
      fs.writeFileSync(
        path.join(archiveDir, 'b.2026-02-01T00-00-00.md.meta.json'),
        JSON.stringify({ original_path: 'b.md', archived_at: '2026-02-01', operation: 'upgrade', from_version: '1.5.0', to_version: '3.0.0' })
      );

      const backups = upgradeMod.listUpgradeBackups(tmpDir);
      expect(backups).toHaveLength(2);

      // Restore only from version 1.0.0
      const logs = [];
      const result = upgradeMod.restore(tmpDir, {
        version: '1.0.0',
        dryRun: true,
        log: (msg) => logs.push(msg),
      });
      expect(result.restored).toHaveLength(1);
    } finally {
      cleanupDir(tmpDir);
    }
  });
});
