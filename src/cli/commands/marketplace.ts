/**
 * marketplace.ts — Marketplace cluster (T4.7.2 batch 3).
 *
 * Ports the following bin/cli.js subcommands into citty `defineCommand`s:
 *   - install            (lib-ts: install + searchItems + fetchRegistryIndex
 *                          + normalizeItemId + detectIDE)
 *   - uninstall          (lib-ts: uninstallItem + normalizeItemId)
 *   - status             (lib-ts: getStatus — the marketplace-status branch
 *                          batch 2 deliberately skipped, see lifecycle.ts)
 *   - integrate          (lib-ts: applyIntegration + cleanIntegration +
 *                          readIntegrationLog)
 *   - update             (lib-ts: updateItems + checkUpdates +
 *                          fetchRegistryIndex + normalizeItemId)
 *   - upgrade            (lib-ts: upgrade + restore + listUpgradeBackups)
 *
 * Pattern: each leaf command is a `defineCommand` exported as
 * `<name>Command`. Pure logic lives in `<name>Impl(deps, args)`. All
 * lib-ts imports are TOP-LEVEL ES imports — the inline-`require`
 * pattern from earlier batches (spec-validation.ts, handoff.ts) silently
 * dies at runtime when the lib-ts file is .ts-only. lifecycle.ts is the
 * canonical example.
 *
 * **No `registry` subcommand**: the spec called for one but `bin/cli.js`
 * has no `subcommand === 'registry'` branch. Skipped — the registry
 * functions in `src/lib/registry.ts` are invoked indirectly via
 * `validate-module` (already in spec-validation.ts batch 1).
 *
 * @see bin/cli.js (lines 1350-1732 — legacy reference)
 * @see src/lib/install.ts (install/uninstallItem/getStatus/checkUpdates/...)
 * @see src/lib/integrate.ts (applyIntegration/cleanIntegration/readIntegrationLog)
 * @see src/lib/upgrade.ts  (upgrade/restore/listUpgradeBackups)
 * @see specs/implementation-plan.md T4.7.2
 */

import { defineCommand } from 'citty';
import {
  checkUpdates,
  detectIDE,
  fetchRegistryIndex,
  getStatus,
  install,
  normalizeItemId,
  searchItems,
  uninstallItem,
  updateItems,
} from '../../lib/install.js';
import { applyIntegration, cleanIntegration, readIntegrationLog } from '../../lib/integrate.js';
import { listUpgradeBackups, restore, upgrade } from '../../lib/upgrade.js';
import { type CommandResult, createRealDeps, type Deps } from '../deps.js';

// ─────────────────────────────────────────────────────────────────────────
// install
// ─────────────────────────────────────────────────────────────────────────

export interface InstallArgs {
  /** Either a fully-qualified id like `skill.ignition`, OR the
   *  category half of a `<type> <name>` invocation. */
  itemId?: string | undefined;
  /** Optional second positional — when present, combines with `itemId`
   *  to form `<itemId>.<name>` per `normalizeItemId`. */
  name?: string | undefined;
  /** `--registry <url>` override. The lib-ts callee runs the URL
   *  through its internal `validateMarketplaceUrl`, so we don't have
   *  to gate it here. */
  registry?: string | undefined;
  /** `--search <query>` switches the command into search mode. */
  search?: string | undefined;
  /** `--dry-run` — preview without writing. */
  dryRun?: boolean | undefined;
  /** `--force` — re-install even if already present. */
  force?: boolean | undefined;
}

export async function installImpl(deps: Deps, args: InstallArgs): Promise<CommandResult> {
  // Search mode short-circuits positional parsing.
  if (args.search !== undefined) {
    try {
      const index = await fetchRegistryIndex(args.registry);
      const results = searchItems(index, args.search);
      if (results.length === 0) {
        deps.logger.warn(`No items found matching "${args.search}".`);
      } else {
        deps.logger.info(`Found ${results.length} item(s):`);
        for (const r of results) {
          deps.logger.info(`  ${r.id} — ${r.displayName} [${r.category}] (${r.version})`);
          if (r.description) deps.logger.info(`    ${r.description}`);
        }
      }
      return { exitCode: 0 };
    } catch (err) {
      deps.logger.error(`Search failed: ${(err as Error).message}`);
      return { exitCode: 1, message: (err as Error).message };
    }
  }

  if (!args.itemId) {
    deps.logger.error('Usage: jumpstart-mode install <item-id> [options]');
    deps.logger.error('       jumpstart-mode install <type> <name> [options]');
    deps.logger.error('       jumpstart-mode install --search <query>');
    return { exitCode: 1 };
  }

  const itemId = normalizeItemId(args.itemId, args.name);
  if (!itemId) {
    deps.logger.error(
      `Cannot resolve item from "${args.itemId}". Try: jumpstart-mode install --search ${args.itemId}`
    );
    return { exitCode: 1 };
  }

  try {
    const ide = detectIDE(deps.projectRoot);
    if (args.dryRun) {
      deps.logger.info(`[dry-run] Would install ${itemId}`);
      deps.logger.info(`  IDE detected: ${ide.ide}`);
      deps.logger.info(`  Agents → ${ide.agentDir}/`);
      deps.logger.info(`  Prompts → ${ide.promptDir}/`);
    }

    deps.logger.info(`Installing ${itemId}...`);
    const result = await install(itemId, {
      registryUrl: args.registry,
      projectRoot: deps.projectRoot,
      force: Boolean(args.force),
      dryRun: Boolean(args.dryRun),
      onProgress: (msg) => deps.logger.info(msg),
    });

    if ('bundleId' in result) {
      deps.logger.success(`Bundle ${result.bundleId} installed:`);
      for (const r of result.installed) {
        if ('error' in r) {
          deps.logger.error(`  ${r.item.id}: ${r.error}`);
        } else {
          deps.logger.success(`  ${r.item.id} → ${(r.installed || []).join(', ')}`);
          if (r.remappedFiles && r.remappedFiles.length > 0) {
            deps.logger.info(`    Remapped: ${r.remappedFiles.join(', ')}`);
          }
        }
      }
    } else if (result.skipped) {
      deps.logger.warn(`${result.item.id} v${result.item.version} already installed.`);
    } else {
      deps.logger.success(`${result.item.id} v${result.item.version} installed`);
      deps.logger.info(`  Location: ${(result.installed || []).join(', ')}`);
      deps.logger.info(`  Files: ${result.fileCount}`);
      deps.logger.info(`  IDE: ${result.ide || 'unknown'}`);
      if (result.remappedFiles && result.remappedFiles.length > 0) {
        deps.logger.info(`  Remapped: ${result.remappedFiles.join(', ')}`);
      }
      if (result.dependenciesInstalled && result.dependenciesInstalled.length > 0) {
        deps.logger.info(`  Dependencies: ${result.dependenciesInstalled.join(', ')}`);
      }
    }
    return { exitCode: 0 };
  } catch (err) {
    deps.logger.error(`Install failed: ${(err as Error).message}`);
    return { exitCode: 1, message: (err as Error).message };
  }
}

export const installCommand = defineCommand({
  meta: { name: 'install', description: 'Install a marketplace item (skill/agent/prompt/bundle)' },
  args: {
    itemId: {
      type: 'positional',
      description: 'Item id (e.g. skill.ignition) or category (with name)',
      required: false,
    },
    name: {
      type: 'positional',
      description: 'Item name (when itemId is the category)',
      required: false,
    },
    registry: { type: 'string', description: 'Registry URL override', required: false },
    search: { type: 'string', description: 'Search registry for matching items', required: false },
    'dry-run': { type: 'boolean', description: 'Preview without writing', required: false },
    force: { type: 'boolean', description: 'Re-install even if present', required: false },
  },
  async run({ args }) {
    const r = await installImpl(createRealDeps(), {
      itemId: args.itemId,
      name: args.name,
      registry: args.registry,
      search: args.search,
      dryRun: Boolean(args['dry-run']),
      force: Boolean(args.force),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'install failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// uninstall
// ─────────────────────────────────────────────────────────────────────────

export interface UninstallArgs {
  itemId?: string | undefined;
  name?: string | undefined;
}

export function uninstallImpl(deps: Deps, args: UninstallArgs): CommandResult {
  if (!args.itemId) {
    deps.logger.error('Usage: jumpstart-mode uninstall <item-id>');
    deps.logger.error('       jumpstart-mode uninstall <type> <name>');
    return { exitCode: 1 };
  }
  const itemId = normalizeItemId(args.itemId, args.name);
  if (!itemId) {
    deps.logger.error(`Cannot resolve item from "${args.itemId}".`);
    return { exitCode: 1 };
  }
  try {
    const result = uninstallItem(itemId, deps.projectRoot);
    deps.logger.success(`Uninstalled ${itemId}`);
    if (result.removed.length > 0) {
      deps.logger.info(`  Removed: ${result.removed.join(', ')}`);
    }
    return { exitCode: 0 };
  } catch (err) {
    deps.logger.error(`Uninstall failed: ${(err as Error).message}`);
    return { exitCode: 1, message: (err as Error).message };
  }
}

export const uninstallCommand = defineCommand({
  meta: { name: 'uninstall', description: 'Uninstall a marketplace item' },
  args: {
    itemId: { type: 'positional', description: 'Item id or category', required: false },
    name: { type: 'positional', description: 'Item name (with category)', required: false },
  },
  run({ args }) {
    const r = uninstallImpl(createRealDeps(), { itemId: args.itemId, name: args.name });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'uninstall failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// status — marketplace status (the one batch 2 skipped)
// ─────────────────────────────────────────────────────────────────────────

export interface StatusArgs {
  // No args today; reserved for future filters (e.g. --type=skill).
  _placeholder?: never;
}

export function statusImpl(deps: Deps, _args: StatusArgs): CommandResult {
  const status = getStatus(deps.projectRoot);

  if (status.count === 0) {
    deps.logger.warn('No marketplace items installed.');
    deps.logger.info('Install with: jumpstart-mode install skill ignition');
    return { exitCode: 0 };
  }

  deps.logger.info(`${status.count} marketplace item(s) installed:`);
  for (const [id, entry] of Object.entries(status.items)) {
    const typeLabel = (entry.type ?? 'item').padEnd(6);
    deps.logger.info(`  ${typeLabel} ${id} v${entry.version}`);
    deps.logger.info(`         Installed: ${entry.installedAt}`);
    if (entry.remappedFiles && entry.remappedFiles.length > 0) {
      deps.logger.info(`         Remapped:  ${entry.remappedFiles.join(', ')}`);
    }
  }
  return { exitCode: 0 };
}

export const statusCommand = defineCommand({
  meta: { name: 'status', description: 'List installed marketplace items' },
  args: {},
  run() {
    const r = statusImpl(createRealDeps(), {});
    if (r.exitCode !== 0) throw new Error(r.message ?? 'status failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// integrate
// ─────────────────────────────────────────────────────────────────────────

export interface IntegrateArgs {
  clean?: boolean | undefined;
  status?: boolean | undefined;
}

export function integrateImpl(deps: Deps, args: IntegrateArgs): CommandResult {
  if (args.status) {
    const log = readIntegrationLog(deps.projectRoot);
    const fileCount = Object.keys(log.files || {}).length;
    const skillCount = Object.keys(log.skillContributions || {}).length;
    if (fileCount === 0) {
      deps.logger.warn('No integration files generated.');
      deps.logger.info('Run: jumpstart-mode integrate');
      return { exitCode: 0 };
    }
    deps.logger.info(`Integration state (${log.generatedAt}):`);
    deps.logger.info(`  Skills integrated: ${skillCount}`);
    deps.logger.info(`  Files generated:   ${fileCount}`);
    for (const [fp, meta] of Object.entries(log.files)) {
      deps.logger.info(`    ${fp} ${meta.hash.slice(0, 18)}...`);
    }
    return { exitCode: 0 };
  }

  try {
    if (args.clean) {
      const { filesRemoved } = cleanIntegration(deps.projectRoot, {
        onProgress: (m) => deps.logger.info(m),
      });
      deps.logger.success(`Clean complete: removed ${filesRemoved.length} file(s).`);
    } else {
      const { filesWritten, filesRemoved, skillCount } = applyIntegration(deps.projectRoot, {
        onProgress: (m) => deps.logger.info(m),
      });
      deps.logger.success(
        `Integration rebuilt: ${skillCount} skill(s), ${filesWritten.length} file(s) generated.`
      );
      if (filesRemoved.length > 0) {
        deps.logger.info(`  Removed ${filesRemoved.length} stale file(s).`);
      }
    }
    return { exitCode: 0 };
  } catch (err) {
    deps.logger.error(`Integration failed: ${(err as Error).message}`);
    return { exitCode: 1, message: (err as Error).message };
  }
}

export const integrateCommand = defineCommand({
  meta: {
    name: 'integrate',
    description: 'Rebuild skill integration files from installed skills',
  },
  args: {
    clean: { type: 'boolean', description: 'Remove all integration files', required: false },
    status: { type: 'boolean', description: 'Show current integration state', required: false },
  },
  run({ args }) {
    const r = integrateImpl(createRealDeps(), {
      clean: Boolean(args.clean),
      status: Boolean(args.status),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'integrate failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────────

export interface UpdateArgs {
  itemId?: string | undefined;
  name?: string | undefined;
  registry?: string | undefined;
}

export async function updateImpl(deps: Deps, args: UpdateArgs): Promise<CommandResult> {
  const itemId =
    args.itemId && !args.itemId.startsWith('--') ? normalizeItemId(args.itemId, args.name) : null;

  try {
    const index = await fetchRegistryIndex(args.registry);
    const { updates } = checkUpdates(deps.projectRoot, index);

    if (updates.length === 0) {
      deps.logger.success('All installed items are up to date.');
      return { exitCode: 0 };
    }

    deps.logger.info(`${updates.length} update(s) available:`);
    for (const u of updates) {
      deps.logger.info(`  ${u.id}: ${u.localVersion} → ${u.registryVersion}`);
    }

    const results = await updateItems(itemId, {
      registryUrl: args.registry,
      projectRoot: deps.projectRoot,
      index,
      onProgress: (msg) => deps.logger.info(msg),
    });

    deps.logger.success(`Updated ${results.length} item(s).`);
    return { exitCode: 0 };
  } catch (err) {
    deps.logger.error(`Update failed: ${(err as Error).message}`);
    return { exitCode: 1, message: (err as Error).message };
  }
}

export const updateCommand = defineCommand({
  meta: {
    name: 'update',
    description: 'Update installed marketplace items to latest registry version',
  },
  args: {
    itemId: {
      type: 'positional',
      description: 'Item id (omit to update all)',
      required: false,
    },
    name: {
      type: 'positional',
      description: 'Item name (when itemId is category)',
      required: false,
    },
    registry: { type: 'string', description: 'Registry URL override', required: false },
  },
  async run({ args }) {
    const r = await updateImpl(createRealDeps(), {
      itemId: args.itemId,
      name: args.name,
      registry: args.registry,
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'update failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// upgrade
// ─────────────────────────────────────────────────────────────────────────

export interface UpgradeArgs {
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
  doRestore?: boolean | undefined;
}

/** Confirmation hook — uses the legacy `prompts` package for parity
 *  with `bin/cli.js`. Resolves to `false` if prompts isn't available
 *  (e.g. test environments) so the upgrade aborts cleanly rather than
 *  hanging. */
async function defaultConfirm(message: string): Promise<boolean> {
  try {
    // Strangler-phase: bare require() is the M4-M8 norm for optional
    // CJS deps (matches deps.ts, lifecycle.ts). M9 ESM cutover swaps
    // to dynamic `import()`.
    const prompts = require('prompts') as (q: {
      type: string;
      name: string;
      message: string;
      initial?: boolean | undefined;
    }) => Promise<{ confirmed?: boolean }>;
    const { confirmed } = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message,
      initial: true,
    });
    return Boolean(confirmed);
  } catch {
    return false;
  }
}

export async function upgradeImpl(deps: Deps, args: UpgradeArgs): Promise<CommandResult> {
  const dryRun = Boolean(args.dryRun);
  const yes = Boolean(args.yes);

  // --restore branch
  if (args.doRestore) {
    const backups = listUpgradeBackups(deps.projectRoot);
    if (backups.length === 0) {
      deps.logger.warn('No upgrade backups found.');
      return { exitCode: 0 };
    }

    deps.logger.info(`Upgrade backups (${backups.length} file(s)):`);
    for (const b of backups) {
      deps.logger.info(`  ${b.originalPath}`);
      deps.logger.info(`    Archived: ${b.archivedAt}`);
      deps.logger.info(`    Upgrade: ${b.fromVersion} → ${b.toVersion}`);
      deps.logger.info(`    File: ${b.file}`);
    }

    if (!dryRun) {
      const confirmed = await defaultConfirm(`Restore all ${backups.length} backed-up file(s)?`);
      if (!confirmed) {
        deps.logger.warn('Restore cancelled.');
        return { exitCode: 0 };
      }
    }

    const result = restore(deps.projectRoot, { dryRun });
    if (!result.success) {
      // RestoreResult does not currently carry a `message` field; emit
      // a generic failure note. (The RestoreResult shape exposed by
      // src/lib/upgrade.ts is `{ success, restored, skipped }`.)
      deps.logger.error('Restore failed.');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }

  // Normal upgrade
  try {
    const result = await upgrade(deps.projectRoot, {
      packageRoot: deps.projectRoot,
      dryRun,
      yes,
      confirm: yes ? undefined : defaultConfirm,
      log: (msg) => deps.logger.info(msg),
    });

    if (!result.success) {
      if (result.message !== 'Cancelled by user.') {
        deps.logger.error(result.message ?? 'upgrade failed');
        return { exitCode: 1, message: result.message };
      }
    }
    return { exitCode: 0 };
  } catch (err) {
    deps.logger.error(`Upgrade failed: ${(err as Error).message}`);
    return { exitCode: 1, message: (err as Error).message };
  }
}

export const upgradeCommand = defineCommand({
  meta: { name: 'upgrade', description: 'Safely upgrade framework files' },
  args: {
    'dry-run': { type: 'boolean', description: 'Preview without writing', required: false },
    yes: { type: 'boolean', description: 'Skip confirmation prompt', required: false },
    restore: { type: 'boolean', description: 'Restore from upgrade backups', required: false },
  },
  async run({ args }) {
    const r = await upgradeImpl(createRealDeps(), {
      dryRun: Boolean(args['dry-run']),
      yes: Boolean(args.yes),
      doRestore: Boolean(args.restore),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'upgrade failed');
  },
});
