/**
 * lifecycle.ts — Lifecycle / state cluster (T4.7.2 batch 2).
 *
 * Ports the following bin/cli.js subcommands into citty `defineCommand`s:
 *   - approve            (approve.approveArtifact, lib-ts)
 *   - reject             (approve.rejectArtifact, lib-ts)
 *   - checkpoint         (state-store.createCheckpoint/list/restore, lib-ts)
 *   - agent-checkpoint   (legacy bin/lib/agent-checkpoint.js)
 *   - focus              (focus.buildFocusConfig/writeFocusToConfig/clearFocusFromConfig/getFocusStatus, lib-ts)
 *   - init               (legacy bin/lib/init.mjs — ESM, dynamic import)
 *   - lock               (locks.acquireLock/releaseLock/lockStatus/listLocks, lib-ts)
 *   - memory             (legacy bin/lib/project-memory.js — but lib-ts port exists; uses legacyRequire to match cli.js)
 *   - rewind             (rewind.rewindToPhase, lib-ts)
 *   - next               (next-phase.determineNextAction, lib-ts)
 *   - plan-executor      (legacy bin/lib/plan-executor.js)
 *
 * **Skipped**: `status` is the marketplace-status branch in bin/cli.js
 * (lines ~1505-1528) — it's not a phase/framework status command. Kept
 * out of this cluster pending a separate marketplace-status port.
 *
 * Pattern: each leaf command is a `defineCommand` exported as
 * `<name>Command`. Pure logic lives in `<name>Impl(deps, args)`.
 *
 * @see bin/cli.js (lines ~1762, 1815-1898, 2166-2306, 2498-2553, 2997-3052,
 *       4162-4193, 5213-5273 — legacy reference)
 * @see specs/implementation-plan.md T4.7.2
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { defineCommand } from 'citty';
import {
  approveArtifact,
  detectCurrentArtifact,
  rejectArtifact,
  renderApprovalResult,
  renderRejectionResult,
} from '../../lib/approve.js';
import {
  buildFocusConfig,
  clearFocusFromConfig,
  getFocusStatus,
  listPresets,
  VALID_PRESETS,
  writeFocusToConfig,
} from '../../lib/focus.js';
import { writeResult } from '../../lib/io.js';
import { acquireLock, listLocks, lockStatus, releaseLock } from '../../lib/locks.js';
import { determineNextAction } from '../../lib/next-phase.js';
import { renderRewindReport, rewindToPhase } from '../../lib/rewind.js';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from '../../lib/state-store.js';
import { type CommandResult, createRealDeps, type Deps } from '../deps.js';
import { asRest, assertUserPath, legacyRequire, parseFlag, safeJoin } from './_helpers.js';

// ─────────────────────────────────────────────────────────────────────────
// approve
// ─────────────────────────────────────────────────────────────────────────

export interface ApproveArgs {
  path?: string;
  approver?: string;
  json?: boolean;
}

export function approveImpl(deps: Deps, args: ApproveArgs): CommandResult {
  let targetPath = args.path;
  if (!targetPath) {
    const detected = detectCurrentArtifact({ root: deps.projectRoot });
    if (!detected.artifact_path) {
      deps.logger.error(
        'No artifact detected for current phase. Specify a path: jumpstart-mode approve <path>'
      );
      return { exitCode: 1 };
    }
    targetPath = detected.artifact_path;
  }
  // Pit Crew M8 BLOCKER 2: gate user-supplied path through assertUserPath.
  const safePath = assertUserPath(deps, targetPath, 'approve:path');
  const result = approveArtifact(safePath, {
    root: deps.projectRoot,
    approver: args.approver,
  });
  if (args.json) {
    writeResult(result as unknown as Record<string, unknown>);
  } else {
    deps.logger.info(renderApprovalResult(result));
  }
  return { exitCode: 0 };
}

export const approveCommand = defineCommand({
  meta: { name: 'approve', description: 'Approve current-phase artifact (UX Feature 4)' },
  args: {
    path: {
      type: 'positional',
      description: 'Artifact path (auto-detected if omitted)',
      required: false,
    },
    approver: { type: 'string', description: 'Approver identity', required: false },
    json: { type: 'boolean', description: 'JSON output mode', required: false },
  },
  run({ args }) {
    const r = approveImpl(createRealDeps(), {
      path: args.path,
      approver: args.approver,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'approve failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// reject
// ─────────────────────────────────────────────────────────────────────────

export interface RejectArgs {
  path?: string;
  reason?: string;
  json?: boolean;
}

export function rejectImpl(deps: Deps, args: RejectArgs): CommandResult {
  let targetPath = args.path;
  if (!targetPath) {
    const detected = detectCurrentArtifact({ root: deps.projectRoot });
    if (!detected.artifact_path) {
      deps.logger.error(
        'No artifact detected for current phase. Specify a path: jumpstart-mode reject <path>'
      );
      return { exitCode: 1 };
    }
    targetPath = detected.artifact_path;
  }
  const safePath = assertUserPath(deps, targetPath, 'reject:path');
  const result = rejectArtifact(safePath, {
    root: deps.projectRoot,
    reason: args.reason ?? 'No reason specified',
  });
  if (args.json) {
    writeResult(result as unknown as Record<string, unknown>);
  } else {
    deps.logger.info(renderRejectionResult(result));
  }
  return { exitCode: 0 };
}

export const rejectCommand = defineCommand({
  meta: { name: 'reject', description: 'Reject current-phase artifact (UX Feature 4)' },
  args: {
    path: {
      type: 'positional',
      description: 'Artifact path (auto-detected if omitted)',
      required: false,
    },
    reason: { type: 'string', description: 'Rejection reason', required: false },
    json: { type: 'boolean', description: 'JSON output mode', required: false },
  },
  run({ args }) {
    const r = rejectImpl(createRealDeps(), {
      path: args.path,
      reason: args.reason,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'reject failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// checkpoint
// ─────────────────────────────────────────────────────────────────────────

export interface CheckpointArgs {
  action: string;
  arg?: string;
  json?: boolean;
}

export function checkpointImpl(deps: Deps, args: CheckpointArgs): CommandResult {
  const statePath = safeJoin(deps, '.jumpstart', 'state', 'state.json');

  if (args.action === 'create') {
    const result = createCheckpoint(args.arg ?? 'auto', { statePath });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else {
      deps.logger.success(`Checkpoint created: ${result.checkpoint.id}`);
      if (result.checkpoint.label) deps.logger.info(`   Label: ${result.checkpoint.label}`);
      deps.logger.info(
        `   Phase: ${result.checkpoint.phase ?? 'none'} | Artifacts: ${(result.checkpoint.approved_artifacts || []).length}`
      );
    }
    return { exitCode: 0 };
  }

  if (args.action === 'list') {
    const checkpoints = listCheckpoints(statePath);
    if (args.json) {
      writeResult(checkpoints as unknown as Record<string, unknown>);
    } else if (checkpoints.length === 0) {
      deps.logger.warn('No checkpoints found.');
    } else {
      deps.logger.info(`Checkpoints (${checkpoints.length}):`);
      for (const cp of checkpoints) {
        const date = new Date(cp.timestamp).toLocaleString();
        deps.logger.info(
          `  ${cp.id}  ${date}  ${cp.label || '(no label)'}  phase=${cp.phase ?? '?'}`
        );
      }
    }
    return { exitCode: 0 };
  }

  if (args.action === 'restore') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode checkpoint restore <checkpoint-id>');
      return { exitCode: 1 };
    }
    const result = restoreCheckpoint(args.arg, statePath);
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else if (result.success && result.restored_from) {
      deps.logger.success(`Restored checkpoint: ${args.arg}`);
      deps.logger.info(
        `   Phase: ${result.restored_from.phase ?? 'none'} | Artifacts: ${(result.restored_from.approved_artifacts || []).length}`
      );
    } else {
      deps.logger.error(result.error ?? 'restore failed');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }

  deps.logger.error('Usage: jumpstart-mode checkpoint <create|list|restore> [args]');
  return { exitCode: 1 };
}

export const checkpointCommand = defineCommand({
  meta: { name: 'checkpoint', description: 'Session checkpointing (UX Feature 10)' },
  args: {
    action: { type: 'positional', description: 'create | list | restore', required: true },
    arg: {
      type: 'positional',
      description: 'Label (for create) or checkpoint id (restore)',
      required: false,
    },
    json: { type: 'boolean', description: 'JSON output mode', required: false },
  },
  run({ args }) {
    const r = checkpointImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'checkpoint failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// agent-checkpoint
// ─────────────────────────────────────────────────────────────────────────

export interface AgentCheckpointArgs {
  action?: string;
  arg?: string;
  json?: boolean;
}

interface AgentCheckpointLib {
  saveCheckpoint: (
    payload: { agent: string; type: string },
    opts: { stateFile: string }
  ) => { checkpoint: { id: string } };
  restoreCheckpoint: (
    cpId: string,
    opts: { stateFile: string }
  ) => { success: boolean; checkpoint?: { id: string }; error?: string };
  cleanCheckpoints: (opts: { stateFile: string }) => { removed: number; remaining: number };
  listCheckpoints: (
    filter: Record<string, unknown>,
    opts: { stateFile: string }
  ) => {
    total: number;
    checkpoints: { id: string; agent: string; phase?: string; saved_at: string }[];
  };
}

export function agentCheckpointImpl(deps: Deps, args: AgentCheckpointArgs): CommandResult {
  const lib = legacyRequire<AgentCheckpointLib>('agent-checkpoint');
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'agent-checkpoints.json');
  const action = args.action ?? 'list';

  if (action === 'save') {
    const agent = args.arg ?? 'cli';
    const result = lib.saveCheckpoint({ agent, type: 'manual' }, { stateFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else {
      deps.logger.success(`Checkpoint saved: ${result.checkpoint.id}`);
    }
    return { exitCode: 0 };
  }
  if (action === 'restore') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode agent-checkpoint restore <checkpoint-id>');
      return { exitCode: 1 };
    }
    const result = lib.restoreCheckpoint(args.arg, { stateFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else if (result.success && result.checkpoint) {
      deps.logger.success(`Restored: ${result.checkpoint.id}`);
    } else {
      deps.logger.error(result.error ?? 'restore failed');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }
  if (action === 'clean') {
    const result = lib.cleanCheckpoints({ stateFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else {
      deps.logger.success(`Cleaned ${result.removed} checkpoints, ${result.remaining} remaining`);
    }
    return { exitCode: 0 };
  }
  // list (default)
  const result = lib.listCheckpoints({}, { stateFile });
  if (args.json) {
    writeResult(result as unknown as Record<string, unknown>);
  } else {
    deps.logger.info(`Checkpoints (${result.total})`);
    for (const c of result.checkpoints) {
      deps.logger.info(`  ${c.id}: ${c.agent} ${c.phase || ''} (${c.saved_at})`);
    }
  }
  return { exitCode: 0 };
}

export const agentCheckpointCommand = defineCommand({
  meta: { name: 'agent-checkpoint', description: 'Per-agent checkpoint store' },
  args: {
    action: { type: 'positional', description: 'save | restore | clean | list', required: false },
    arg: {
      type: 'positional',
      description: 'Agent name (save) or checkpoint id (restore)',
      required: false,
    },
    json: { type: 'boolean', description: 'JSON output mode', required: false },
  },
  run({ args }) {
    const r = agentCheckpointImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'agent-checkpoint failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// focus
// ─────────────────────────────────────────────────────────────────────────

export interface FocusArgs {
  action?: string;
  preset?: string;
  start?: string;
  end?: string;
}

export function focusImpl(deps: Deps, args: FocusArgs): CommandResult {
  const configPath = safeJoin(deps, '.jumpstart', 'config.yaml');

  if (args.action === 'list') {
    writeResult({ presets: listPresets() } as Record<string, unknown>);
    return { exitCode: 0 };
  }

  if (args.action === 'set') {
    let focusConfig: ReturnType<typeof buildFocusConfig>;
    if (args.start !== undefined && args.end !== undefined) {
      const start = parseInt(args.start, 10);
      const end = parseInt(args.end, 10);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        deps.logger.error('Usage: jumpstart-mode focus set --start <phase> --end <phase>');
        return { exitCode: 1 };
      }
      try {
        focusConfig = buildFocusConfig({ start_phase: start, end_phase: end });
      } catch (err) {
        deps.logger.error((err as Error).message);
        return { exitCode: 1 };
      }
    } else if (args.preset) {
      if (!VALID_PRESETS.includes(args.preset)) {
        deps.logger.error(
          `Unknown preset: "${args.preset}". Valid presets: ${VALID_PRESETS.join(', ')}`
        );
        return { exitCode: 1 };
      }
      focusConfig = buildFocusConfig({ preset: args.preset });
    } else {
      deps.logger.error(
        'Usage: jumpstart-mode focus set <preset> | focus set --start <phase> --end <phase>'
      );
      deps.logger.error(`  Presets: ${VALID_PRESETS.join(', ')}`);
      return { exitCode: 1 };
    }

    if (!existsSync(configPath)) {
      deps.logger.error('Config file not found. Run jumpstart-mode init first.');
      return { exitCode: 1 };
    }
    const writeRes = writeFocusToConfig(configPath, focusConfig);
    if (!writeRes.success) {
      deps.logger.error(writeRes.error ?? 'failed to write focus');
      return { exitCode: 1 };
    }
    deps.logger.success(`Focus mode set: ${focusConfig.description}`);
    return { exitCode: 0 };
  }

  if (args.action === 'clear') {
    if (!existsSync(configPath)) {
      deps.logger.error('Config file not found. Run jumpstart-mode init first.');
      return { exitCode: 1 };
    }
    clearFocusFromConfig(configPath);
    deps.logger.success('Focus mode cleared — full workflow restored.');
    return { exitCode: 0 };
  }

  // status / default
  const status = getFocusStatus({ root: deps.projectRoot });
  writeResult(status as unknown as Record<string, unknown>);
  return { exitCode: 0 };
}

export const focusCommand = defineCommand({
  meta: { name: 'focus', description: 'Phase focus mode — restrict workflow to specific phases' },
  args: {
    action: { type: 'positional', description: 'list | set | clear | status', required: false },
    preset: { type: 'positional', description: 'Preset name (for set)', required: false },
    start: { type: 'string', description: 'Start phase (for custom range)', required: false },
    end: { type: 'string', description: 'End phase (for custom range)', required: false },
  },
  run({ args }) {
    const r = focusImpl(createRealDeps(), {
      action: args.action,
      preset: args.preset,
      start: args.start,
      end: args.end,
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'focus failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// init
// ─────────────────────────────────────────────────────────────────────────

export interface InitArgs {
  skillLevel?: string;
  type?: string;
  json?: boolean;
}

interface InitLib {
  generateInitConfig: (input: { skill_level: string; project_type: string }) => {
    skill_level: string;
    explanation_depth: string;
    project_type: string;
    recommendations: string[];
  };
}

export async function initImpl(deps: Deps, args: InitArgs): Promise<CommandResult> {
  // bin/lib/init.mjs is ESM (uses `export`), so it must be loaded via
  // dynamic import — `legacyRequire` would fail with ERR_REQUIRE_ESM.
  const initMod = (await import(path.join(deps.projectRoot, 'bin', 'lib', 'init.js'))) as InitLib;
  const skillLevel = args.skillLevel ?? 'intermediate';
  const projectType = args.type ?? 'greenfield';
  const result = initMod.generateInitConfig({
    skill_level: skillLevel,
    project_type: projectType,
  });
  if (args.json) {
    writeResult(result as unknown as Record<string, unknown>);
  } else {
    deps.logger.info(`Init Configuration (${result.skill_level})`);
    deps.logger.info(`  Explanation depth: ${result.explanation_depth}`);
    deps.logger.info(`  Project type: ${result.project_type}`);
    deps.logger.info('  Recommendations:');
    for (const r of result.recommendations) deps.logger.info(`    • ${r}`);
  }
  return { exitCode: 0 };
}

export const initCommand = defineCommand({
  meta: { name: 'init', description: 'Generate init configuration (Item 76)' },
  args: {
    skillLevel: {
      type: 'positional',
      description: 'beginner | intermediate | expert',
      required: false,
    },
    type: { type: 'string', description: 'greenfield | brownfield', required: false },
    json: { type: 'boolean', description: 'JSON output mode', required: false },
  },
  async run({ args }) {
    const r = await initImpl(createRealDeps(), {
      skillLevel: args.skillLevel,
      type: args.type,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'init failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// lock
// ─────────────────────────────────────────────────────────────────────────

export interface LockArgs {
  action?: string;
  file?: string;
  agent?: string;
  json?: boolean;
}

export function lockImpl(deps: Deps, args: LockArgs): CommandResult {
  const action = args.action ?? 'list';

  if (action === 'acquire') {
    if (!args.file) {
      deps.logger.error('Usage: jumpstart-mode lock acquire <file> [agent]');
      return { exitCode: 1 };
    }
    // Pit Crew M8 BLOCKER 2: lock-file is user-supplied — gate.
    const safeFile = assertUserPath(deps, args.file, 'lock:file');
    const result = acquireLock(safeFile, args.agent ?? 'cli');
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else if (result.success) {
      deps.logger.success(`Lock acquired: ${args.file} by ${args.agent ?? 'cli'}`);
    } else {
      deps.logger.error(result.error ?? 'failed to acquire lock');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }
  if (action === 'release') {
    if (!args.file) {
      deps.logger.error('Usage: jumpstart-mode lock release <file> [agent]');
      return { exitCode: 1 };
    }
    const safeFile = assertUserPath(deps, args.file, 'lock:file');
    const result = releaseLock(safeFile, args.agent ?? 'cli');
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else if (result.success) {
      deps.logger.success(`Lock released: ${args.file}`);
    } else {
      deps.logger.error(result.error ?? 'failed to release lock');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }
  if (action === 'status') {
    if (!args.file) {
      deps.logger.error('Usage: jumpstart-mode lock status <file>');
      return { exitCode: 1 };
    }
    const safeFile = assertUserPath(deps, args.file, 'lock:file');
    const result = lockStatus(safeFile);
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else {
      deps.logger.info('Lock Status');
      deps.logger.info(`  File: ${args.file}`);
      deps.logger.info(`  Locked: ${result.locked}`);
      if (result.lock?.ok) {
        deps.logger.info(`  By: ${result.lock.agent}  Since: ${result.lock.acquired_at}`);
      }
    }
    return { exitCode: 0 };
  }
  // list (default)
  const result = listLocks();
  if (args.json) {
    writeResult(result as unknown as Record<string, unknown>);
  } else {
    deps.logger.info(`Active Locks (${result.locks.length})`);
    for (const l of result.locks) {
      if (l.ok) deps.logger.info(`  ${l.file}: ${l.agent} (${l.acquired_at})`);
      else deps.logger.warn(`  ${l.file}: <corrupt>`);
    }
  }
  return { exitCode: 0 };
}

export const lockCommand = defineCommand({
  meta: { name: 'lock', description: 'File locking (Item 45)' },
  args: {
    action: {
      type: 'positional',
      description: 'acquire | release | status | list',
      required: false,
    },
    file: { type: 'positional', description: 'File path', required: false },
    agent: { type: 'positional', description: 'Agent identity', required: false },
    json: { type: 'boolean', description: 'JSON output mode', required: false },
  },
  run({ args }) {
    const r = lockImpl(createRealDeps(), {
      action: args.action,
      file: args.file,
      agent: args.agent,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'lock failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// memory
// ─────────────────────────────────────────────────────────────────────────

export interface MemoryArgs {
  action?: string;
  arg?: string;
  rest: string[];
  json?: boolean;
}

interface MemoryLib {
  addMemory: (
    payload: { type: string; title: string; content: string },
    opts: { memoryFile: string }
  ) => { success: boolean; entry?: { id: string }; error?: string };
  searchMemories: (
    keyword: string,
    opts: { memoryFile: string }
  ) => { total: number; entries: { id: string; type: string; title: string }[] };
  recallMemory: (
    id: string,
    opts: { memoryFile: string }
  ) => {
    success: boolean;
    entry?: { id: string; title: string; type: string; created_at: string; content: string };
    error?: string;
  };
  listMemories: (
    filter: Record<string, unknown>,
    opts: { memoryFile: string }
  ) => { total: number; entries: { id: string; type: string; title: string }[] };
}

export function memoryImpl(deps: Deps, args: MemoryArgs): CommandResult {
  const memLib = legacyRequire<MemoryLib>('project-memory');
  const memFile = safeJoin(deps, '.jumpstart', 'state', 'project-memory.json');
  const action = args.action ?? 'list';

  if (action === 'add') {
    const typeArg = parseFlag(args.rest, 'type') ?? 'insight';
    const title = parseFlag(args.rest, 'title');
    const content = parseFlag(args.rest, 'content');
    if (!title || !content) {
      deps.logger.error(
        'Usage: jumpstart-mode memory add --type <type> --title <title> --content <content>'
      );
      return { exitCode: 1 };
    }
    const result = memLib.addMemory({ type: typeArg, title, content }, { memoryFile: memFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else if (result.success && result.entry) {
      deps.logger.success(`Memory added: ${result.entry.id}`);
    } else {
      deps.logger.error(result.error ?? 'failed to add memory');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }
  if (action === 'search') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode memory search <keyword>');
      return { exitCode: 1 };
    }
    const result = memLib.searchMemories(args.arg, { memoryFile: memFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else {
      deps.logger.info(`Memory Search: "${args.arg}" (${result.total} results)`);
      for (const e of result.entries) deps.logger.info(`  [${e.type}] ${e.title} — ${e.id}`);
    }
    return { exitCode: 0 };
  }
  if (action === 'recall') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode memory recall <id>');
      return { exitCode: 1 };
    }
    const result = memLib.recallMemory(args.arg, { memoryFile: memFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else if (result.success && result.entry) {
      deps.logger.info(result.entry.title);
      deps.logger.info(`Type: ${result.entry.type}  |  Created: ${result.entry.created_at}`);
      deps.logger.info(result.entry.content);
    } else {
      deps.logger.error(result.error ?? 'memory not found');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }
  // list (default)
  const typeFilter = parseFlag(args.rest, 'type');
  const result = memLib.listMemories(typeFilter ? { type: typeFilter } : {}, {
    memoryFile: memFile,
  });
  if (args.json) {
    writeResult(result as unknown as Record<string, unknown>);
  } else {
    deps.logger.info(`Project Memory (${result.total} entries)`);
    for (const e of result.entries) deps.logger.info(`  [${e.type}] ${e.title} — ${e.id}`);
  }
  return { exitCode: 0 };
}

export const memoryCommand = defineCommand({
  meta: { name: 'memory', description: 'Project memory store (decisions, insights, pitfalls)' },
  args: {
    action: { type: 'positional', description: 'add | search | recall | list', required: false },
    arg: { type: 'positional', description: 'Keyword (search) or id (recall)', required: false },
    rest: { type: 'positional', description: 'Optional flags', required: false },
    json: { type: 'boolean', description: 'JSON output mode', required: false },
  },
  run({ args }) {
    const r = memoryImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      rest: asRest(args.rest),
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'memory failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// rewind
// ─────────────────────────────────────────────────────────────────────────

export interface RewindArgs {
  phase?: string;
  reason?: string;
  json?: boolean;
}

export function rewindImpl(deps: Deps, args: RewindArgs): CommandResult {
  if (args.phase === undefined) {
    deps.logger.error('Usage: jumpstart-mode rewind <phase> [--reason <text>] [--json]');
    deps.logger.error('  phase: -1 to 4 (target phase to rewind to)');
    return { exitCode: 1 };
  }
  const target = parseInt(args.phase, 10);
  if (Number.isNaN(target)) {
    deps.logger.error('Usage: jumpstart-mode rewind <phase> [--reason <text>] [--json]');
    deps.logger.error('  phase: -1 to 4 (target phase to rewind to)');
    return { exitCode: 1 };
  }
  const result = rewindToPhase(target, { root: deps.projectRoot, reason: args.reason });
  if (args.json) {
    writeResult(result as unknown as Record<string, unknown>);
  } else {
    deps.logger.info(renderRewindReport(result));
  }
  return { exitCode: 0 };
}

export const rewindCommand = defineCommand({
  meta: { name: 'rewind', description: 'Rewind to a prior phase with cascade (UX Feature 2)' },
  args: {
    phase: { type: 'positional', description: 'Target phase (-1 to 4)', required: true },
    reason: { type: 'string', description: 'Rewind reason', required: false },
    json: { type: 'boolean', description: 'JSON output mode', required: false },
  },
  run({ args }) {
    const r = rewindImpl(createRealDeps(), {
      phase: args.phase,
      reason: args.reason,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'rewind failed');
  },
});

// ─────────────────────────────────────────────────────────────────────────
// next
// ─────────────────────────────────────────────────────────────────────────

export function nextImpl(deps: Deps): CommandResult {
  const result = determineNextAction({ root: deps.projectRoot });
  writeResult(result as unknown as Record<string, unknown>);
  return { exitCode: 0 };
}

export const nextCommand = defineCommand({
  meta: { name: 'next', description: 'Auto-pilot next-phase determination (UX Feature 1)' },
  args: {},
  run() {
    nextImpl(createRealDeps());
  },
});

// ─────────────────────────────────────────────────────────────────────────
// plan-executor
// ─────────────────────────────────────────────────────────────────────────

export interface PlanExecutorArgs {
  action?: string;
  arg?: string;
  status?: string;
  json?: boolean;
}

interface PlanExecutorLib {
  initializeExecution: (
    root: string,
    opts: { stateFile: string }
  ) => {
    success: boolean;
    total_jobs?: number;
    milestones?: string[];
    error?: string;
  };
  updateJobStatus: (
    jobId: string,
    status: string,
    opts: { stateFile: string }
  ) => { success: boolean; previous_status?: string; new_status?: string; error?: string };
  verifyJob: (
    jobId: string,
    root: string,
    opts: { stateFile: string }
  ) => { success: boolean; verified?: boolean; error?: string };
  resetExecution: (opts: { stateFile: string }) => { jobs_reset: number };
  getExecutionStatus: (opts: { stateFile: string }) => {
    initialized: boolean;
    progress?: number;
    total_jobs?: number;
    status_counts?: { completed: number; in_progress: number; pending: number };
    next_tasks?: { id: string; title: string }[];
  };
}

export function planExecutorImpl(deps: Deps, args: PlanExecutorArgs): CommandResult {
  const execLib = legacyRequire<PlanExecutorLib>('plan-executor');
  const stateFile = safeJoin(deps, '.jumpstart', 'state', 'plan-execution.json');
  const action = args.action ?? 'status';

  if (action === 'init') {
    const result = execLib.initializeExecution(deps.projectRoot, { stateFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else if (result.success) {
      deps.logger.success('Plan execution initialized');
      deps.logger.info(`  Jobs: ${result.total_jobs}`);
      deps.logger.info(`  Milestones: ${(result.milestones ?? []).join(', ')}`);
    } else {
      deps.logger.error(result.error ?? 'init failed');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }
  if (action === 'update') {
    if (!args.arg || !args.status) {
      deps.logger.error('Usage: jumpstart-mode plan-executor update <job-id> <status>');
      return { exitCode: 1 };
    }
    const result = execLib.updateJobStatus(args.arg, args.status, { stateFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else if (result.success) {
      deps.logger.success(`${args.arg}: ${result.previous_status} → ${result.new_status}`);
    } else {
      deps.logger.error(result.error ?? 'update failed');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }
  if (action === 'verify') {
    if (!args.arg) {
      deps.logger.error('Usage: jumpstart-mode plan-executor verify <job-id>');
      return { exitCode: 1 };
    }
    const result = execLib.verifyJob(args.arg, deps.projectRoot, { stateFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else if (result.success && result.verified) {
      deps.logger.success(`${args.arg}: verified`);
    } else if (result.success) {
      deps.logger.warn(`${args.arg}: verification failed`);
    } else {
      deps.logger.error(result.error ?? 'verify failed');
      return { exitCode: 1 };
    }
    return { exitCode: 0 };
  }
  if (action === 'reset') {
    const result = execLib.resetExecution({ stateFile });
    if (args.json) {
      writeResult(result as unknown as Record<string, unknown>);
    } else {
      deps.logger.success(`Execution reset (${result.jobs_reset} jobs)`);
    }
    return { exitCode: 0 };
  }
  // status (default)
  const result = execLib.getExecutionStatus({ stateFile });
  if (args.json) {
    writeResult(result as unknown as Record<string, unknown>);
  } else if (result.initialized && result.status_counts) {
    deps.logger.info(`Plan Execution: ${result.progress}%`);
    deps.logger.info(
      `  Total: ${result.total_jobs}  Completed: ${result.status_counts.completed}  In Progress: ${result.status_counts.in_progress}  Pending: ${result.status_counts.pending}`
    );
    if (result.next_tasks && result.next_tasks.length > 0) {
      deps.logger.info('  Next tasks:');
      for (const t of result.next_tasks.slice(0, 5)) {
        deps.logger.info(`    → ${t.id}: ${t.title}`);
      }
    }
  } else {
    deps.logger.info('No execution plan loaded. Run: jumpstart-mode plan-executor init');
  }
  return { exitCode: 0 };
}

export const planExecutorCommand = defineCommand({
  meta: { name: 'plan-executor', description: 'Execute the implementation plan' },
  args: {
    action: {
      type: 'positional',
      description: 'init | update | verify | reset | status',
      required: false,
    },
    arg: { type: 'positional', description: 'Job id (update/verify)', required: false },
    status: { type: 'positional', description: 'New status (update)', required: false },
    json: { type: 'boolean', description: 'JSON output mode', required: false },
  },
  run({ args }) {
    const r = planExecutorImpl(createRealDeps(), {
      action: args.action,
      arg: args.arg,
      status: args.status,
      json: Boolean(args.json),
    });
    if (r.exitCode !== 0) throw new Error(r.message ?? 'plan-executor failed');
  },
});
