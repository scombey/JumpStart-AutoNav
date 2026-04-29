/**
 * upgrade.js — Safe Framework Upgrade with Backup/Restore
 *
 * Updates framework-owned files while preserving user content.
 * Backs up modified files before overwriting using the archive system.
 * Performs a three-way YAML merge on config.yaml.
 *
 * Usage:
 *   npx jumpstart-mode upgrade              # Interactive upgrade
 *   npx jumpstart-mode upgrade --dry-run     # Preview changes
 *   npx jumpstart-mode upgrade --yes         # Skip confirmation
 *   npx jumpstart-mode upgrade --restore     # Restore from backup
 *
 * Programmatic:
 *   import { upgrade, restore } from './upgrade.js';
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } = require('fs');
const { join, dirname, relative, basename, extname } = require('path');

import {
  generateManifest,
  diffManifest,
  detectUserModifications,
  readFrameworkManifest,
  writeFrameworkManifest,
  getPackageVersion,
  isFrameworkOwned,
  isUserOwned,
} from './framework-manifest.mjs';

import {
  mergeConfigs,
  readConfig,
  writeConfig,
  writeConflictsFile,
} from './config-merge.mjs';

import { archiveArtifacts } from './rewind.mjs';

/**
 * Perform a safe framework upgrade.
 *
 * @param {string} projectRoot — Absolute path to the project directory
 * @param {object} options
 * @param {string} options.packageRoot — Path to the npm package root (defaults to ../../ from this file)
 * @param {boolean} [options.dryRun=false] — Preview without writing
 * @param {boolean} [options.yes=false] — Skip interactive confirmation
 * @param {Function} [options.log] — Logging function (defaults to console.log)
 * @param {Function} [options.confirm] — Confirmation function for interactive mode
 * @returns {Promise<UpgradeResult>}
 *
 * @typedef {object} UpgradeResult
 * @property {boolean} success
 * @property {string} [message]
 * @property {string} [oldVersion]
 * @property {string} [newVersion]
 * @property {number} [filesUpdated]
 * @property {number} [filesAdded]
 * @property {number} [filesBackedUp]
 * @property {number} [filesSkipped]
 * @property {string[]} [backedUpFiles]
 * @property {string[]} [conflicts]
 * @property {string[]} [newConfigKeys]
 */
export async function upgrade(projectRoot, options = {}) {
  const packageRoot = options.packageRoot || join(__dirname, '..', '..');
  const dryRun = options.dryRun || false;
  const yes = options.yes || false;
  const log = options.log || console.log;

  // ── Step A: Version check ──────────────────────────────────────────────
  const newVersion = getPackageVersion(packageRoot);
  const installedManifest = readFrameworkManifest(projectRoot);
  const oldVersion = installedManifest ? installedManifest.frameworkVersion : null;

  if (!existsSync(join(projectRoot, '.jumpstart'))) {
    return {
      success: false,
      message: 'No .jumpstart directory found. Run "npx jumpstart-mode" to install first.',
    };
  }

  if (oldVersion && oldVersion === newVersion) {
    log(`✓ Framework is already at version ${newVersion}. Nothing to upgrade.`);
    return {
      success: true,
      message: `Already at version ${newVersion}`,
      oldVersion,
      newVersion,
      filesUpdated: 0,
      filesAdded: 0,
      filesBackedUp: 0,
      filesSkipped: 0,
    };
  }

  // ── Step B: Generate manifests and diff ────────────────────────────────
  const newManifest = generateManifest(packageRoot, { version: newVersion });

  let diff;
  if (installedManifest) {
    diff = diffManifest(installedManifest, newManifest);
  } else {
    // First upgrade — treat all framework files as "added"
    log('ℹ️  No framework manifest found. Creating initial manifest.');
    diff = {
      added: Object.keys(newManifest.files),
      removed: [],
      changed: [],
      unchanged: [],
    };
  }

  // ── Step C: Detect user modifications to framework files ───────────────
  let userMods = { modified: [], unmodified: [], missing: [] };
  if (installedManifest) {
    userMods = detectUserModifications(projectRoot, installedManifest);
  }

  // Files that both the framework and user changed → need backup
  const conflictingFiles = diff.changed.filter(f => userMods.modified.includes(f));
  const safeUpdates = diff.changed.filter(f => !userMods.modified.includes(f));

  // ── Step D: Summary and confirmation ───────────────────────────────────
  const versionLabel = oldVersion
    ? `${oldVersion} → ${newVersion}`
    : `(initial) → ${newVersion}`;

  log(`\n⬆️  Framework Upgrade: ${versionLabel}\n`);
  log(`   Files to add:     ${diff.added.length}`);
  log(`   Files to update:  ${safeUpdates.length}`);
  log(`   Files with user customizations: ${conflictingFiles.length}`);
  if (diff.removed.length > 0) {
    log(`   Files removed in new version: ${diff.removed.length}`);
  }
  log(`   Unchanged files:  ${diff.unchanged.length}`);

  if (conflictingFiles.length > 0) {
    log(`\n   ⚠️  These framework files have local modifications:`);
    for (const f of conflictingFiles) {
      log(`      ${f}`);
    }
    log('   They will be backed up to .jumpstart/archive/ before overwriting.');
  }

  if (dryRun) {
    log('\n   [DRY RUN — no files will be changed]\n');

    if (diff.added.length > 0) {
      log('   Would add:');
      for (const f of diff.added) log(`     + ${f}`);
    }
    if (safeUpdates.length > 0) {
      log('   Would update:');
      for (const f of safeUpdates) log(`     ~ ${f}`);
    }
    if (conflictingFiles.length > 0) {
      log('   Would backup & update:');
      for (const f of conflictingFiles) log(`     ⚠ ${f}`);
    }

    return {
      success: true,
      message: 'Dry run complete. No files changed.',
      oldVersion: oldVersion || '(none)',
      newVersion,
      filesUpdated: safeUpdates.length,
      filesAdded: diff.added.length,
      filesBackedUp: conflictingFiles.length,
      filesSkipped: diff.unchanged.length,
    };
  }

  // Interactive confirmation
  if (!yes) {
    if (options.confirm) {
      const confirmed = await options.confirm(
        `Proceed with upgrade? (${diff.added.length} add, ${safeUpdates.length + conflictingFiles.length} update, ${conflictingFiles.length} backup)`
      );
      if (!confirmed) {
        log('\n❌ Upgrade cancelled.\n');
        return { success: false, message: 'Cancelled by user.' };
      }
    }
    // If no confirm function and not --yes, proceed (CLI handles prompting)
  }

  // ── Step E: Backup user-modified framework files ───────────────────────
  const backedUpFiles = [];
  if (conflictingFiles.length > 0) {
    log('\n📦 Backing up modified files...');
    const reason = `Framework upgrade from ${oldVersion || 'unknown'} to ${newVersion}`;
    const archiveResult = archiveArtifacts(conflictingFiles, reason, {
      root: projectRoot,
    });

    for (const a of archiveResult.archived) {
      log(`   📦 ${a.original} → ${basename(a.archived_to)}`);
      backedUpFiles.push(a.original);
    }

    // Update metadata to mark operation as 'upgrade'
    for (const a of archiveResult.archived) {
      const metaPath = a.archived_to + '.meta.json';
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
          meta.operation = 'upgrade';
          meta.from_version = oldVersion || 'unknown';
          meta.to_version = newVersion;
          writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
        } catch { /* ignore */ }
      }
    }
  }

  // ── Step F: Copy framework files ───────────────────────────────────────
  log('\n📁 Updating framework files...');
  let updatedCount = 0;
  let addedCount = 0;

  const filesToCopy = [...diff.added, ...safeUpdates, ...conflictingFiles];

  for (const relPath of filesToCopy) {
    const srcPath = join(packageRoot, relPath);
    const destPath = join(projectRoot, relPath);

    if (!existsSync(srcPath)) continue;

    // Ensure destination directory exists
    const destDir = dirname(destPath);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    copyFileSync(srcPath, destPath);

    if (diff.added.includes(relPath)) {
      addedCount++;
    } else {
      updatedCount++;
    }
  }

  log(`   ✓ ${addedCount} file(s) added, ${updatedCount} file(s) updated`);

  // ── Step G: Config merge ───────────────────────────────────────────────
  log('\n⚙️  Merging config.yaml...');
  const configConflicts = [];
  const newConfigKeys = [];

  const userConfig = readConfig(projectRoot);
  const newDefaultConfig = readConfig(packageRoot);

  if (userConfig && newDefaultConfig) {
    // Try to read old default from the installed manifest's embedded snapshot
    const oldDefaultConfigPath = join(projectRoot, '.jumpstart', 'config.yaml.default');
    let oldDefaultConfig = null;

    if (existsSync(oldDefaultConfigPath)) {
      oldDefaultConfig = readFileSync(oldDefaultConfigPath, 'utf8');
    }

    if (oldDefaultConfig) {
      // Full three-way merge
      const mergeResult = mergeConfigs(oldDefaultConfig, newDefaultConfig, userConfig);
      writeConfig(projectRoot, mergeResult.mergedYaml);

      if (mergeResult.conflicts.length > 0) {
        writeConflictsFile(projectRoot, mergeResult.conflicts, oldVersion || 'unknown', newVersion);
        configConflicts.push(...mergeResult.conflicts.map(c => c.key));
        log(`   ⚠️  ${mergeResult.conflicts.length} config conflict(s) — see .jumpstart/config.yaml.conflicts`);
      }

      if (mergeResult.newKeys.length > 0) {
        newConfigKeys.push(...mergeResult.newKeys);
        log(`   + ${mergeResult.newKeys.length} new config key(s) added`);
      }

      log('   ✓ Config merged (user values preserved)');
    } else {
      // No old default snapshot — can't three-way merge.
      // Preserve user config entirely, just note new keys.
      log('   ℹ️  No config baseline found. User config preserved as-is.');
      log('   ℹ️  Review new default at .jumpstart/config.yaml.new for new settings.');

      // Write the new default as a companion file for manual review
      const newConfigPath = join(projectRoot, '.jumpstart', 'config.yaml.new');
      writeFileSync(newConfigPath, newDefaultConfig, 'utf8');
    }

    // Save the new default as baseline for future upgrades
    writeFileSync(
      join(projectRoot, '.jumpstart', 'config.yaml.default'),
      newDefaultConfig,
      'utf8'
    );
  } else if (!userConfig && newDefaultConfig) {
    // No user config — just copy the default
    writeConfig(projectRoot, newDefaultConfig);
    log('   ✓ Config created from default');
  } else {
    log('   ℹ️  No config changes needed');
  }

  // ── Step H: Update manifest ────────────────────────────────────────────
  log('\n📝 Updating framework manifest...');
  const updatedManifest = generateManifest(projectRoot, { version: newVersion });
  writeFrameworkManifest(projectRoot, updatedManifest);
  log(`   ✓ Manifest stamped at version ${newVersion}`);

  // ── Step I: Report ─────────────────────────────────────────────────────
  log(`\n✅ Upgrade complete! ${oldVersion || '(initial)'} → ${newVersion}\n`);

  if (backedUpFiles.length > 0) {
    log('   📦 Backed-up files (in .jumpstart/archive/):');
    for (const f of backedUpFiles) {
      log(`      ${f}`);
    }
    log('   Review and re-apply any customizations you want to keep.\n');
  }

  if (configConflicts.length > 0) {
    log('   ⚠️  Config conflicts require manual resolution:');
    log('   Edit .jumpstart/config.yaml and delete .jumpstart/config.yaml.conflicts\n');
  }

  return {
    success: true,
    oldVersion: oldVersion || '(none)',
    newVersion,
    filesUpdated: updatedCount,
    filesAdded: addedCount,
    filesBackedUp: backedUpFiles.length,
    filesSkipped: diff.unchanged.length,
    backedUpFiles,
    conflicts: configConflicts,
    newConfigKeys,
  };
}

/**
 * List available upgrade backups.
 *
 * @param {string} projectRoot — Project root directory
 * @returns {Array<{file: string, originalPath: string, archivedAt: string, fromVersion: string, toVersion: string}>}
 */
export function listUpgradeBackups(projectRoot) {
  const archiveDir = join(projectRoot, '.jumpstart', 'archive');
  if (!existsSync(archiveDir)) return [];

  const entries = readdirSync(archiveDir).filter(f => f.endsWith('.meta.json'));
  const backups = [];

  for (const metaFile of entries) {
    try {
      const meta = JSON.parse(readFileSync(join(archiveDir, metaFile), 'utf8'));
      if (meta.operation === 'upgrade') {
        const archivedFile = metaFile.replace('.meta.json', '');
        backups.push({
          file: archivedFile,
          metaFile,
          originalPath: meta.original_path,
          archivedAt: meta.archived_at,
          fromVersion: meta.from_version || 'unknown',
          toVersion: meta.to_version || 'unknown',
          archivePath: join(archiveDir, archivedFile),
        });
      }
    } catch { /* skip invalid meta files */ }
  }

  return backups.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

/**
 * Restore files from upgrade backups.
 *
 * @param {string} projectRoot — Project root directory
 * @param {object} [options]
 * @param {string} [options.version] — Restore files from a specific upgrade version
 * @param {string[]} [options.files] — Specific files to restore (original paths)
 * @param {boolean} [options.dryRun=false] — Preview without writing
 * @param {Function} [options.log] — Logging function
 * @returns {{ success: boolean, restored: Array<{from: string, to: string}>, skipped: string[] }}
 */
export function restore(projectRoot, options = {}) {
  const dryRun = options.dryRun || false;
  const log = options.log || console.log;

  const backups = listUpgradeBackups(projectRoot);
  if (backups.length === 0) {
    log('ℹ️  No upgrade backups found.');
    return { success: true, restored: [], skipped: [] };
  }

  // Filter by version if specified
  let filtered = backups;
  if (options.version) {
    filtered = backups.filter(b => b.fromVersion === options.version || b.toVersion === options.version);
  }

  // Filter by specific files if specified
  if (options.files && options.files.length > 0) {
    filtered = filtered.filter(b => options.files.includes(b.originalPath));
  }

  if (filtered.length === 0) {
    log('ℹ️  No matching backups found for the specified criteria.');
    return { success: true, restored: [], skipped: [] };
  }

  log(`\n🔄 Restoring ${filtered.length} file(s) from upgrade backup...\n`);

  const restored = [];
  const skipped = [];

  for (const backup of filtered) {
    if (!existsSync(backup.archivePath)) {
      skipped.push(backup.originalPath);
      log(`   ⊘ Archive file not found: ${backup.file}`);
      continue;
    }

    const destPath = join(projectRoot, backup.originalPath);

    if (dryRun) {
      log(`   Would restore: ${backup.originalPath}`);
      restored.push({ from: backup.file, to: backup.originalPath });
      continue;
    }

    const destDir = dirname(destPath);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    copyFileSync(backup.archivePath, destPath);
    restored.push({ from: backup.file, to: backup.originalPath });
    log(`   ✓ ${backup.originalPath} (from ${backup.file})`);
  }

  if (!dryRun && restored.length > 0) {
    // Re-generate manifest to reflect restored files
    const manifest = readFrameworkManifest(projectRoot);
    if (manifest) {
      const updated = generateManifest(projectRoot, { version: manifest.frameworkVersion });
      writeFrameworkManifest(projectRoot, updated);
    }
  }

  log(`\n✓ Restored ${restored.length} file(s), skipped ${skipped.length}.\n`);

  return { success: true, restored, skipped };
}
