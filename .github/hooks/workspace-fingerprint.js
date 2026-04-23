#!/usr/bin/env node
/**
 * Hook #14 — SessionStart: Workspace fingerprint
 *
 * Inject branch, dirty state, Node version, detected package manager, and the
 * resolved repository root into the session so the agent starts with local
 * execution context.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  runCli,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  extractSessionId,
} = require('./lib/common');

function detectPackageManager(root) {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

function readGitCommand(root, command) {
  try {
    return execSync(command, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function collectWorkspaceFingerprint(root) {
  return {
    repo_root: root,
    branch: readGitCommand(root, 'git rev-parse --abbrev-ref HEAD') || 'unknown',
    dirty: Boolean(readGitCommand(root, 'git status --porcelain')),
    node_version: process.version,
    package_manager: detectPackageManager(root),
  };
}

function handle(input, ctx) {
  const sid = extractSessionId(input) || 'default';
  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now);
  const fingerprint = collectWorkspaceFingerprint(ctx.root);
  session.workspace = {
    ...session.workspace,
    ...fingerprint,
  };
  session.startup_context.push({
    type: 'workspace-fingerprint',
    at: ctx.now.toISOString(),
    value: fingerprint,
  });
  saveHookState(ctx.root, hookState);

  const additionalContext = [
    '[AutoNav Workspace Fingerprint]',
    `Repository root: ${fingerprint.repo_root}`,
    `Branch: ${fingerprint.branch}`,
    `Dirty working tree: ${fingerprint.dirty ? 'yes' : 'no'}`,
    `Node.js: ${fingerprint.node_version}`,
    `Package manager: ${fingerprint.package_manager}`,
  ].join('\n');

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
      additionalContext,
    }) + '\n',
  };
}

module.exports = {
  handle,
  collectWorkspaceFingerprint,
  detectPackageManager,
};

if (require.main === module) {
  runCli(handle);
}
