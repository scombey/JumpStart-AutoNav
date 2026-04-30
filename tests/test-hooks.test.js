/**
 * test-hooks.test.js — Unit tests for the 23 AutoNav VS Code Copilot agent hooks.
 *
 * Each hook exposes a pure `handle(input, ctx)` function so we can test its
 * logic without spawning child processes or mocking stdio.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOOKS_DIR = path.join(
  __dirname,
  '..',
  '.github',
  'hooks'
);

const sessionStart = require(path.join(HOOKS_DIR, 'session-start.js'));
const preCompact = require(path.join(HOOKS_DIR, 'pre-compact.js'));
const blockSelfMod = require(path.join(HOOKS_DIR, 'block-agent-self-modification.js'));
const injectAdr = require(path.join(HOOKS_DIR, 'inject-adr-context.js'));
const capturePlan = require(path.join(HOOKS_DIR, 'capture-plan.js'));
const retryEsc = require(path.join(HOOKS_DIR, 'retry-escalation.js'));
const testCochange = require(path.join(HOOKS_DIR, 'enforce-test-cochange.js'));
const draftChangelog = require(path.join(HOOKS_DIR, 'draft-changelog.js'));
const phaseBoundaryGuard = require(path.join(HOOKS_DIR, 'phase-boundary-guard.js'));
const qaLogCapture = require(path.join(HOOKS_DIR, 'qa-log-capture.js'));
const schemaOnWriteValidator = require(path.join(HOOKS_DIR, 'schema-on-write-validator.js'));
const specGraphUpdater = require(path.join(HOOKS_DIR, 'spec-graph-updater.js'));
const sessionAnalytics = require(path.join(HOOKS_DIR, 'session-analytics.js'));
const common = require(path.join(HOOKS_DIR, 'lib', 'common.js'));
const workspaceFingerprint = require(path.join(HOOKS_DIR, 'workspace-fingerprint.js'));
const phaseGateStatus = require(path.join(HOOKS_DIR, 'phase-gate-status.js'));
const timelineWarmup = require(path.join(HOOKS_DIR, 'timeline-warmup.js'));
const promptClassifier = require(path.join(HOOKS_DIR, 'prompt-classifier.js'));
const ambiguityDetector = require(path.join(HOOKS_DIR, 'ambiguity-detector.js'));
const specDriftGuard = require(path.join(HOOKS_DIR, 'spec-drift-guard.js'));
const dangerousOperationEscalator = require(path.join(HOOKS_DIR, 'dangerous-operation-escalator.js'));
const dependencyRiskPrecheck = require(path.join(HOOKS_DIR, 'dependency-risk-precheck.js'));
const secretsPathBlocker = require(path.join(HOOKS_DIR, 'secrets-path-blocker.js'));
const simplicityGateGuard = require(path.join(HOOKS_DIR, 'simplicity-gate-guard.js'));

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autonav-hooks-'));
  fs.mkdirSync(path.join(root, '.jumpstart', 'state'), { recursive: true });
  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function ctx(root) {
  return { root, now: new Date('2026-04-21T12:00:00Z') };
}

// ─── session-start.js ────────────────────────────────────────────────────────

describe('session-start hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('returns graceful message when state.json is missing', () => {
    const res = sessionStart.handle({ sessionId: 's1' }, ctx(root));
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.additionalContext).toContain('not initialised');
  });

  it('injects current phase and resume_context when present', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({
        current_phase: 3,
        current_agent: 'architect',
        current_step: 'API contract design',
        active_artifacts: ['specs/architecture.md'],
        approved_artifacts: ['specs/prd.md'],
        resume_context: { note: 'Pick up on auth contract' },
      })
    );
    const res = sessionStart.handle({ sessionId: 's1' }, ctx(root));
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.additionalContext).toContain('Current phase: 3');
    expect(parsed.additionalContext).toContain('architect');
    expect(parsed.additionalContext).toContain('API contract design');
    expect(parsed.additionalContext).toContain('Pick up on auth contract');
  });

  it('records session in hook-state.json', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 4 })
    );
    sessionStart.handle({ sessionId: 'abc' }, ctx(root));
    const hookState = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'state', 'hook-state.json'), 'utf8')
    );
    expect(hookState.sessions.abc).toBeDefined();
    expect(hookState.sessions.abc.phase).toBe(4);
  });
});

describe('workspace-fingerprint hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('detects npm from package-lock.json', () => {
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
    expect(workspaceFingerprint.detectPackageManager(root)).toBe('npm');
  });

  it('records workspace metadata in hook-state', () => {
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
    const res = workspaceFingerprint.handle({ sessionId: 's1' }, ctx(root));
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Workspace Fingerprint');
    const hookState = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'state', 'hook-state.json'), 'utf8')
    );
    expect(hookState.sessions.s1.workspace.repo_root).toBe(root);
    expect(hookState.sessions.s1.workspace.package_manager).toBe('npm');
  });

  it('treats untracked files as a dirty working tree', () => {
    execSync('git init', { cwd: root, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: root, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: root, stdio: 'ignore' });
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n');
    execSync('git add tracked.txt && git commit -m "init"', { cwd: root, stdio: 'ignore' });
    fs.writeFileSync(path.join(root, 'untracked.txt'), 'new\n');

    const fingerprint = workspaceFingerprint.collectWorkspaceFingerprint(root);
    expect(fingerprint.dirty).toBe(true);
  });

  it('reports false for a clean working tree', () => {
    execSync('git init', { cwd: root, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: root, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: root, stdio: 'ignore' });
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n');
    execSync('git add tracked.txt && git commit -m "init"', { cwd: root, stdio: 'ignore' });

    const fingerprint = workspaceFingerprint.collectWorkspaceFingerprint(root);
    expect(fingerprint.dirty).toBe(false);
  });
});

describe('phase-gate-status hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('reports approved, pending, and missing artifacts', () => {
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'specs', 'prd.md'),
      [
        '# PRD',
        '',
        '## Phase Gate Approval',
        '',
        '- [x] complete',
        '',
        '**Approved by:** Human',
        '**Approval date:** 2026-04-21',
        '',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(root, 'specs', 'architecture.md'),
      [
        '# Architecture',
        '',
        '## Phase Gate Approval',
        '',
        '- [ ] pending',
        '',
        '**Approved by:** Pending',
        '**Date:** Pending',
        '',
      ].join('\n')
    );
    const res = phaseGateStatus.handle({ sessionId: 's1' }, ctx(root));
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Approved artifacts (1): specs/prd.md');
    expect(res.stdout).toContain('Pending artifacts (1): specs/architecture.md');
    expect(res.stdout).toContain('Missing artifacts');
  });

  it('ignores unchecked boxes outside the phase gate section', () => {
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'specs', 'prd.md'),
      [
        '# PRD',
        '',
        '- [ ] unrelated todo',
        '',
        '## Phase Gate Approval',
        '',
        '- [x] complete',
        '',
        '**Approved by:** Human',
        '**Approval date:** 2026-04-21',
        '',
      ].join('\n')
    );
    expect(phaseGateStatus.readApprovalStatus(root, 'specs/prd.md').state).toBe('approved');
  });
});

describe('timeline-warmup hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('summarizes the last timeline event', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'timeline.json'),
      JSON.stringify({
        events: [
          {
            session_id: 'ses-1',
            event_type: 'artifact_write',
            action: 'Created specs/prd.md',
            timestamp: '2026-04-20T10:00:00Z',
          },
        ],
      })
    );
    const res = timelineWarmup.handle({ sessionId: 's1' }, ctx(root));
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Timeline ready with 1 event');
    expect(res.stdout).toContain('Created specs/prd.md');
  });
});

// ─── pre-compact.js ──────────────────────────────────────────────────────────

describe('pre-compact hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('creates state.json and writes resume_context when absent', () => {
    const res = preCompact.handle({}, ctx(root));
    expect(res.exitCode).toBe(0);
    const state = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'state', 'state.json'), 'utf8')
    );
    expect(state.resume_context).toBeDefined();
    expect(state.resume_context.reason).toBe('pre-compact');
    expect(state.resume_context.unresolved_clarifications).toEqual([]);
  });

  it('extracts [NEEDS CLARIFICATION: ...] markers from specs', () => {
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'specs', 'prd.md'),
      '# PRD\n\nSome text [NEEDS CLARIFICATION: rate limit threshold] and more ' +
      '[NEEDS CLARIFICATION: auth provider choice]'
    );
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 2, current_agent: 'pm' })
    );
    const res = preCompact.handle({}, ctx(root));
    const state = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'state', 'state.json'), 'utf8')
    );
    expect(state.resume_context.unresolved_clarifications).toHaveLength(2);
    expect(
      state.resume_context.unresolved_clarifications.map(c => c.note)
    ).toEqual(expect.arrayContaining(['rate limit threshold', 'auth provider choice']));
    expect(state.resume_context.phase).toBe(2);
    expect(res.stdout).toContain('2 unresolved clarification');
  });

  it('deduplicates identical clarifications', () => {
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'specs', 'a.md'),
      '[NEEDS CLARIFICATION: same question]'
    );
    fs.writeFileSync(
      path.join(root, 'specs', 'b.md'),
      '[NEEDS CLARIFICATION: other question]'
    );
    preCompact.handle({}, ctx(root));
    const state = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'state', 'state.json'), 'utf8')
    );
    // 2 distinct questions in 2 distinct files = 2 entries
    expect(state.resume_context.unresolved_clarifications).toHaveLength(2);
  });
});

// ─── block-agent-self-modification.js ───────────────────────────────────────

describe('block-agent-self-modification hook', () => {
  it('blocks edits to .jumpstart/agents/', () => {
    const res = blockSelfMod.handle({
      tool_input: { file_path: '.jumpstart/agents/architect.md' },
    });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('BLOCKED');
    const parsed = JSON.parse(res.stdout);
    expect(parsed.decision).toBe('block');
  });

  it('blocks edits to .github/agents/', () => {
    const res = blockSelfMod.handle({
      tool_input: { file_path: '.github/agents/jumpstart-developer.agent.md' },
    });
    expect(res.exitCode).toBe(2);
  });

  it('blocks edits to .github/hooks/autonav.json', () => {
    const res = blockSelfMod.handle({
      tool_input: { filePath: '.github/hooks/autonav.json' },
    });
    expect(res.exitCode).toBe(2);
  });

  it('blocks edits to .jumpstart/roadmap.md', () => {
    const res = blockSelfMod.handle({
      tool_input: { path: '.jumpstart/roadmap.md' },
    });
    expect(res.exitCode).toBe(2);
  });

  it('allows edits to normal source files', () => {
    const res = blockSelfMod.handle({
      tool_input: { file_path: 'src/app.js' },
    });
    expect(res.exitCode).toBe(0);
  });

  it('allows edits when opt-out env var is set', () => {
    process.env.JUMPSTART_HOOK_ALLOW_AGENT_EDITS = '1';
    try {
      const res = blockSelfMod.handle({
        tool_input: { file_path: '.jumpstart/agents/architect.md' },
      });
      expect(res.exitCode).toBe(0);
    } finally {
      delete process.env.JUMPSTART_HOOK_ALLOW_AGENT_EDITS;
    }
  });

  it('no-ops when tool_input has no file path', () => {
    const res = blockSelfMod.handle({ tool_input: {} });
    expect(res.exitCode).toBe(0);
  });
});

// ─── inject-adr-context.js ──────────────────────────────────────────────────

describe('inject-adr-context hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('no-ops when target is outside watched prefixes', () => {
    const res = injectAdr.handle(
      { tool_input: { file_path: 'docs/random.md' } },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout || '').toBe('');
  });

  it('no-ops when no ADRs exist', () => {
    const res = injectAdr.handle(
      { tool_input: { file_path: 'src/app.js' } },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout || '').toBe('');
  });

  it('injects matching ADRs from specs/decisions/', () => {
    fs.mkdirSync(path.join(root, 'specs', 'decisions'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'specs', 'decisions', 'adr-001-auth.md'),
      '# ADR 001: Authentication strategy\nstatus: accepted\n\nWe use JWT for auth...'
    );
    const res = injectAdr.handle(
      { tool_input: { file_path: 'src/auth/login.js' } },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('ADR Context');
    expect(res.stdout).toContain('adr-001-auth');
  });

  it('scoreAdrRelevance rewards explicit path matches', () => {
    const adr = {
      title: 'Auth',
      affected_paths: ['src/auth/'],
      body: '',
    };
    expect(injectAdr.scoreAdrRelevance(adr, 'src/auth/login.js')).toBeGreaterThanOrEqual(10);
    expect(injectAdr.scoreAdrRelevance(adr, 'src/unrelated.js')).toBeLessThan(10);
  });

  it('scoreAdrRelevance avoids false positives for sibling prefixes', () => {
    const adr = {
      title: 'Auth',
      affected_paths: ['src/auth'],
      body: '',
    };
    expect(injectAdr.scoreAdrRelevance(adr, 'src/auth/login.js')).toBeGreaterThanOrEqual(10);
    expect(injectAdr.scoreAdrRelevance(adr, 'src/authz/login.js')).toBeLessThan(10);
  });
});

describe('prompt-classifier hook', () => {
  it('classifies implementation prompts as build', () => {
    expect(promptClassifier.classifyPrompt('Implement the next 10 hooks')).toBe('build');
  });

  it('stores prompt classification in hook-state', () => {
    const root = makeSandbox();
    try {
      const res = promptClassifier.handle({ sessionId: 's1', prompt: 'Review the generated spec graph' }, ctx(root));
      expect(res.exitCode).toBe(0);
      const hookState = JSON.parse(
        fs.readFileSync(path.join(root, '.jumpstart', 'state', 'hook-state.json'), 'utf8')
      );
      expect(hookState.sessions.s1.prompts[0].classification).toBe('review');
    } finally {
      cleanup(root);
    }
  });
});

describe('ambiguity-detector hook', () => {
  it('flags vague prompts with a NEEDS CLARIFICATION reminder', () => {
    const root = makeSandbox();
    try {
      const res = ambiguityDetector.handle({ sessionId: 's1', prompt: 'fix it' }, ctx(root));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('NEEDS CLARIFICATION');
    } finally {
      cleanup(root);
    }
  });
});

// ─── phase-boundary-guard.js ──────────────────────────────────────────────────

describe('phase-boundary-guard hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('blocks Phase 4 implementation edits when upstream artifacts are missing', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 4, current_agent: 'developer' })
    );
    const res = phaseBoundaryGuard.handle(
      { tool_name: 'editFiles', tool_input: { file_path: 'src/app.js' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('Phase 4 work requires approved upstream artifacts');
  });

  it('allows Phase 4 edits when required specs are approved and records tool usage', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 4, current_agent: 'developer' })
    );
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    const approved = [
      '# Artifact',
      '',
      '## Phase Gate Approval',
      '',
      '- [x] Reviewed',
      '',
      '**Approved by:** Human',
      '**Date:** 2026-04-21',
      '',
    ].join('\n');
    for (const file of ['prd.md', 'architecture.md', 'implementation-plan.md']) {
      fs.writeFileSync(path.join(root, 'specs', file), approved);
    }

    const res = phaseBoundaryGuard.handle(
      { tool_name: 'editFiles', tool_input: { file_path: 'src/app.js' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    const hookState = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'state', 'hook-state.json'), 'utf8')
    );
    expect(hookState.sessions.s1.tool_counts.editFiles).toBe(1);
    expect(hookState.sessions.s1.blocked_actions).toHaveLength(0);
  });

  it('uses only the phase gate section when checking approval', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 4, current_agent: 'developer' })
    );
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    const approved = [
      '# Artifact',
      '',
      '- [ ] unrelated todo',
      '',
      '## Phase Gate Approval',
      '',
      '- [x] Reviewed',
      '',
      '**Approved by:** Human',
      '**Date:** 2026-04-21',
      '',
    ].join('\n');
    for (const file of ['prd.md', 'architecture.md', 'implementation-plan.md']) {
      fs.writeFileSync(path.join(root, 'specs', file), approved);
    }

    const res = phaseBoundaryGuard.handle(
      { tool_name: 'editFiles', tool_input: { file_path: 'src/app.js' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
  });
});

// ─── qa-log-capture.js ────────────────────────────────────────────────────────

describe('qa-log-capture hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('appends significant prompts to specs/qa-log.md', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 2, current_agent: 'pm' })
    );
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'config.yaml'),
      'project:\n  name: Demo\nworkflow:\n  qa_log: true\n'
    );
    const res = qaLogCapture.handle(
      {
        sessionId: 's1',
        prompt: 'Please implement the approved hook roadmap and document the changes.',
      },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Logged Q-001');
    const body = fs.readFileSync(path.join(root, 'specs', 'qa-log.md'), 'utf8');
    expect(body).toContain('### Q-001');
    expect(body).toContain('implement the approved hook roadmap');
  });
});

describe('spec-drift-guard hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('warns when traced code changes lack touched spec context', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'spec-graph.json'),
      JSON.stringify({
        nodes: {
          'src/app.js': { id: 'src/app.js', type: 'file' },
          'E1-S1': { id: 'E1-S1', type: 'story' },
        },
        edges: [{ from: 'E1-S1', to: 'src/app.js', relationship: 'implements' }],
      })
    );
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'hook-state.json'),
      JSON.stringify({ sessions: { s1: { tool_targets: [] } } })
    );
    const res = specDriftGuard.handle(
      { sessionId: 's1', tool_input: { file_path: 'src/app.js' } },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Spec-drift warning');
    expect(res.stdout).toContain('E1-S1');
  });
});

describe('dangerous-operation-escalator hook', () => {
  it('blocks destructive shell commands pending human approval', () => {
    const root = makeSandbox();
    try {
      const res = dangerousOperationEscalator.handle(
        { sessionId: 's1', tool_name: 'Bash', tool_input: { command: 'rm -rf src' } },
        ctx(root)
      );
      expect(res.exitCode).toBe(2);
      expect(res.stderr).toContain('requires explicit human approval');
    } finally {
      cleanup(root);
    }
  });
});

describe('dependency-risk-precheck hook', () => {
  it('detects package manager add/update commands', () => {
    expect(
      dependencyRiskPrecheck.isDependencyChange({ tool_input: { command: 'npm install lodash' } })
    ).toBe(true);
  });

  it('injects advisory context for dependency changes', () => {
    const res = dependencyRiskPrecheck.handle({ tool_input: { command: 'npm update chalk' } });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Dependency change detected');
  });
});

describe('secrets-path-blocker hook', () => {
  it('blocks edits to sensitive env files', () => {
    const res = secretsPathBlocker.handle({ tool_input: { file_path: '.env.production' } });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('sensitive credential material');
  });
});

describe('simplicity-gate-guard hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('warns when a new top-level directory would exceed the simplicity limit', () => {
    fs.mkdirSync(path.join(root, 'alpha'));
    fs.mkdirSync(path.join(root, 'beta'));
    fs.mkdirSync(path.join(root, 'gamma'));
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'config.yaml'),
      'simplicity_gate:\n  max_top_level_dirs: 3\n'
    );
    const res = simplicityGateGuard.handle(
      { tool_input: { file_path: 'delta/new-file.js' } },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Simplicity gate warning');
  });
});

// ─── capture-plan.js ─────────────────────────────────────────────────────────

describe('capture-plan hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('summarizeToolInput compacts long fields', () => {
    const s = capturePlan.summarizeToolInput({
      file_path: 'a.js',
      instructions: 'x'.repeat(300),
    });
    expect(s).toContain('file_path=a.js');
    expect(s).toContain('…');
  });

  it('appends to phase insights when file already exists', () => {
    fs.mkdirSync(path.join(root, 'specs', 'insights'), { recursive: true });
    const insightsPath = path.join(root, 'specs', 'insights', 'architect-insights.md');
    fs.writeFileSync(insightsPath, '# Architect Insights\n');
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 3 })
    );
    const res = capturePlan.handle(
      {
        tool_name: 'Edit',
        tool_input: { file_path: 'src/api.js', description: 'add endpoint' },
        sessionId: 's1',
      },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    const body = fs.readFileSync(insightsPath, 'utf8');
    expect(body).toContain('Hook: PreToolUse');
    expect(body).toContain('src/api.js');
  });

  it('skips when no insights dir and no phase', () => {
    const res = capturePlan.handle(
      { tool_name: 'Edit', tool_input: { file_path: 'src/x.js' } },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    // no insights dir was created
    expect(fs.existsSync(path.join(root, 'specs', 'insights'))).toBe(false);
  });

  it('skips when phase is before 3 and no insights file exists', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 2 })
    );
    const res = capturePlan.handle(
      { tool_name: 'Edit', tool_input: { file_path: 'src/x.js' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(fs.existsSync(path.join(root, 'specs', 'insights'))).toBe(false);
  });
});

// ─── retry-escalation.js ─────────────────────────────────────────────────────

describe('retry-escalation hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('normalizeCommand collapses whitespace', () => {
    expect(retryEsc.normalizeCommand('npm   test  ')).toBe('npm test');
    expect(retryEsc.normalizeCommand(null)).toBeNull();
  });

  it('allows first two identical commands, blocks the third', () => {
    const input = {
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      sessionId: 's1',
    };
    // Use a mutable "now" so timestamps are distinct but within window.
    let t = new Date('2026-04-21T12:00:00Z');
    const step = () => ({ root, now: new Date(t.getTime()) });
    let res = retryEsc.handle(input, step()); t = new Date(t.getTime() + 1000);
    expect(res.exitCode).toBe(0);
    res = retryEsc.handle(input, step()); t = new Date(t.getTime() + 1000);
    expect(res.exitCode).toBe(0);
    res = retryEsc.handle(input, step());
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('Retry-loop detected');
    // correction-log appended
    const log = fs.readFileSync(
      path.join(root, '.jumpstart', 'correction-log.md'),
      'utf8'
    );
    expect(log).toContain('Retry-loop detected (hook)');
    expect(log).toContain('npm test');
  });

  it('does not count commands outside the time window', () => {
    const input = { tool_name: 'Bash', tool_input: { command: 'echo a' } };
    const within = new Date('2026-04-21T12:00:00Z');
    const later = new Date(within.getTime() + retryEsc.WINDOW_MS + 1000);
    retryEsc.handle(input, { root, now: within });
    retryEsc.handle(input, { root, now: within });
    const res = retryEsc.handle(input, { root, now: later });
    expect(res.exitCode).toBe(0);
  });

  it('ignores tool calls without a command', () => {
    const res = retryEsc.handle({ tool_input: {} }, ctx(root));
    expect(res.exitCode).toBe(0);
  });
});

// ─── enforce-test-cochange.js ────────────────────────────────────────────────

describe('enforce-test-cochange hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('isSourceEdit / isTestEdit classify paths correctly', () => {
    expect(testCochange.isSourceEdit('src/app.js')).toBe(true);
    expect(testCochange.isSourceEdit('src/cli/main.ts')).toBe(true);
    expect(testCochange.isSourceEdit('tests/app.test.js')).toBe(false);
    expect(testCochange.isTestEdit('tests/app.test.js')).toBe(true);
    expect(testCochange.isTestEdit('src/app.spec.ts')).toBe(true);
    expect(testCochange.isTestEdit('src/app.js')).toBe(false);
  });

  it('records edits even when not in Phase 4 and no TDD mandate', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 2 })
    );
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'config.yaml'),
      'roadmap:\n  test_drive_mandate: false\n'
    );
    const res = testCochange.handle(
      { tool_input: { file_path: 'src/app.js' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stderr || '').toBe('');
    const hookState = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'state', 'hook-state.json'), 'utf8')
    );
    expect(hookState.sessions.s1.edits).toHaveLength(1);
    expect(hookState.sessions.s1.edits[0].kind).toBe('source');
  });

  it('warns on Phase 4 source edit without test edit', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 4 })
    );
    const res = testCochange.handle(
      { tool_input: { file_path: 'src/app.js' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stderr).toContain('Phase 4 quality gate');
  });

  it('suppresses warning after test file is also edited', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 4 })
    );
    const c = ctx(root);
    // First record a test edit
    testCochange.handle(
      { tool_input: { file_path: 'tests/app.test.js' }, sessionId: 's1' },
      c
    );
    // Now a source edit — should not warn because test edit already exists.
    const res = testCochange.handle(
      { tool_input: { file_path: 'src/app.js' }, sessionId: 's1' },
      c
    );
    expect(res.exitCode).toBe(0);
    expect(res.stderr || '').toBe('');
  });

  it('activates when test_drive_mandate is true even outside Phase 4', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 3 })
    );
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'config.yaml'),
      'roadmap:\n  enabled: true\n  test_drive_mandate: true\n'
    );
    const res = testCochange.handle(
      { tool_input: { file_path: 'src/app.js' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.stderr).toContain('Phase 4 quality gate');
  });
});

// ─── schema-on-write-validator.js ─────────────────────────────────────────────

describe('schema-on-write-validator hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('blocks invalid spec files with structural warnings', () => {
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs', 'prd.md'), '# PRD\n');
    const res = schemaOnWriteValidator.handle(
      { tool_input: { file_path: 'specs/prd.md' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).not.toContain('"decision":"block"');
    expect(res.stderr).toContain('Spec validation failed');
  });

  it('records the resolved schema when validating a mapped spec file', () => {
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, 'fixtures', 'valid', 'prd.md'),
      path.join(root, 'specs', 'prd.md')
    );
    const res = schemaOnWriteValidator.handle(
      { tool_input: { file_path: 'specs/prd.md' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Spec validation failed');
    expect(res.stdout).toContain('prd.schema.json');
    const hookState = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'state', 'hook-state.json'), 'utf8')
    );
    expect(hookState.sessions.s1.validations[0].schema).toBe('prd.schema.json');
    expect(hookState.sessions.s1.validations[0].valid).toBe(false);
  });

  it('passes a spec file that has no mapped schema and valid structure', () => {
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'specs', 'notes.md'),
      [
        '---',
        'id: notes',
        'phase: 3',
        '---',
        '',
        '# Notes',
        '',
        '## Summary',
        '',
        'Hook notes.',
        '',
        '## Phase Gate Approval',
        '',
        '- [x] Ready',
        '',
        '**Approved by:** Human',
        '**Approval date:** 2026-04-21',
        '',
      ].join('\n')
    );
    const res = schemaOnWriteValidator.handle(
      { tool_input: { file_path: 'specs/notes.md' }, sessionId: 's1' },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Spec validation passed');
  });

  it('treats punctuation and clarification words as clarification prompt signals', () => {
    expect(common.promptMatchesSignal('Ship this now?', ['clarification'])).toBe(true);
    expect(common.promptMatchesSignal('Please clarify the acceptance criteria.', ['clarification'])).toBe(true);
    expect(common.promptMatchesSignal('Why is this blocked?', ['clarification'])).toBe(true);
    expect(common.promptMatchesSignal('How should we handle retries?', ['clarification'])).toBe(true);
  });
});

// ─── spec-graph-updater.js ────────────────────────────────────────────────────

describe('spec-graph-updater hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('rebuilds spec-graph.json and annotates touched files', () => {
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'specs', 'prd.md'),
      '### Epic E1: Auth\n\n#### Story E1-S1: Login\n'
    );
    fs.writeFileSync(
      path.join(root, 'specs', 'implementation-plan.md'),
      [
        '### Task M1-T01: Implement login',
        '',
        '**Story Reference** | E1-S1',
        '**Files** | `src/app.js`',
        '',
      ].join('\n')
    );
    fs.writeFileSync(path.join(root, 'src', 'app.js'), '// M1-T01\n// E1-S1\n');

    const res = specGraphUpdater.handle(
      { tool_input: { file_path: 'src/app.js' } },
      ctx(root)
    );
    expect(res.exitCode).toBe(0);
    const graph = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'spec-graph.json'), 'utf8')
    );
    expect(graph.nodes['src/app.js']).toBeDefined();
    expect(graph.edges.some(e => e.to === 'src/app.js')).toBe(true);
  });
});

// ─── draft-changelog.js ──────────────────────────────────────────────────────

describe('draft-changelog hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('no-op when session had fewer than 2 edits', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'hook-state.json'),
      JSON.stringify({ sessions: { s1: { edits: [{ path: 'a.js', kind: 'source' }] } } })
    );
    const res = draftChangelog.handle({ sessionId: 's1' }, ctx(root));
    expect(res.exitCode).toBe(0);
    expect(res.stdout || '').toBe('');
  });

  it('writes a changelog draft for multi-file sessions', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 4 })
    );
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'hook-state.json'),
      JSON.stringify({
        sessions: {
          s1: {
            edits: [
              { at: '2026-04-21T12:00:00Z', path: 'src/app.js', kind: 'source' },
              { at: '2026-04-21T12:01:00Z', path: 'src/util.js', kind: 'source' },
              { at: '2026-04-21T12:02:00Z', path: 'tests/app.test.js', kind: 'test' },
            ],
          },
        },
      })
    );
    const res = draftChangelog.handle({ sessionId: 's1' }, ctx(root));
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Changelog draft written');
    const draftFiles = fs.readdirSync(
      path.join(root, 'specs', 'changelog-drafts')
    );
    expect(draftFiles).toHaveLength(1);
    const body = fs.readFileSync(
      path.join(root, 'specs', 'changelog-drafts', draftFiles[0]),
      'utf8'
    );
    expect(body).toContain('Files edited: 3');
    expect(body).toContain('src/app.js');
    expect(body).toContain('tests/app.test.js');
  });

  it('flags test-coverage gap for Phase 4 source-only session', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'state.json'),
      JSON.stringify({ current_phase: 4 })
    );
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'hook-state.json'),
      JSON.stringify({
        sessions: {
          s1: {
            edits: [
              { path: 'src/a.js', kind: 'source' },
              { path: 'src/b.js', kind: 'source' },
            ],
          },
        },
      })
    );
    draftChangelog.handle({ sessionId: 's1' }, ctx(root));
    const draftFiles = fs.readdirSync(
      path.join(root, 'specs', 'changelog-drafts')
    );
    const body = fs.readFileSync(
      path.join(root, 'specs', 'changelog-drafts', draftFiles[0]),
      'utf8'
    );
    expect(body).toContain('Test coverage gap');
  });

  it('clears the session from hook-state after drafting', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'hook-state.json'),
      JSON.stringify({
        sessions: {
          s1: {
            edits: [
              { path: 'src/a.js', kind: 'source' },
              { path: 'src/b.js', kind: 'source' },
            ],
          },
          s2: { edits: [{ path: 'keep.js', kind: 'source' }] },
        },
      })
    );
    draftChangelog.handle({ sessionId: 's1' }, ctx(root));
    const hookState = JSON.parse(
      fs.readFileSync(path.join(root, '.jumpstart', 'state', 'hook-state.json'), 'utf8')
    );
    expect(hookState.sessions.s1).toBeUndefined();
    expect(hookState.sessions.s2).toBeDefined();
  });
});

// ─── session-analytics.js ─────────────────────────────────────────────────────

describe('session-analytics hook', () => {
  let root;
  beforeEach(() => { root = makeSandbox(); });
  afterEach(() => cleanup(root));

  it('safeSessionFileName adds a hash suffix to reduce collisions', () => {
    const a = sessionAnalytics.safeSessionFileName('session-with-a-very-long-id-aaaaaaaaaaaaaaaaaaaa', new Date('2026-04-21T12:00:00Z'));
    const b = sessionAnalytics.safeSessionFileName('session-with-a-very-long-id-bbbbbbbbbbbbbbbbbbbb', new Date('2026-04-21T12:00:00Z'));
    expect(a).not.toBe(b);
    expect(a).toMatch(/-[a-f0-9]{8}\.md$/);
  });

  it('countItemsByKey groups values by the derived key', () => {
    const counts = sessionAnalytics.countItemsByKey(
      [{ path: 'src/app.js' }, { path: 'src/util.js' }, { path: 'tests/app.test.js' }],
      item => item.path.split('/')[0]
    );
    expect(counts.get('src')).toBe(2);
    expect(counts.get('tests')).toBe(1);
  });

  it('writes a session analytics report', () => {
    fs.writeFileSync(
      path.join(root, '.jumpstart', 'state', 'hook-state.json'),
      JSON.stringify({
        recent_tool_calls: [{ session: 's1', command: 'npm test', at: '2026-04-21T12:00:00Z' }],
        sessions: {
          s1: {
            started_at: '2026-04-21T12:00:00Z',
            phase: 4,
            edits: [{ path: 'src/app.js', kind: 'source' }],
            tool_counts: { editFiles: 2, bash: 1 },
            tool_targets: [{ path: 'src/app.js' }, { path: 'specs/prd.md' }],
            prompts: [{ text: 'Implement it', classification: 'implementation' }],
            validations: [{ path: 'specs/prd.md', valid: false, schema: 'prd.schema.json' }],
            blocked_actions: [{ tool: 'editFiles', target: 'src/app.js', reason: 'missing_specs' }],
          },
        },
      })
    );

    const res = sessionAnalytics.handle({ sessionId: 's1' }, ctx(root));
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Session analytics written');
    const files = fs.readdirSync(path.join(root, '.jumpstart', 'state', 'session-analytics'));
    expect(files).toHaveLength(1);
    const body = fs.readFileSync(
      path.join(root, '.jumpstart', 'state', 'session-analytics', files[0]),
      'utf8'
    );
    expect(body).toContain('Tool invocations: 3');
    expect(body).toContain('Validation results: 0 passed / 1 failed');
    expect(body).toContain('`src/app.js`');
  });
});

// ─── .github/hooks/autonav.json smoke test ──────────────────────────────────

describe('.github/hooks/autonav.json', () => {
  it('is valid JSON and registers all 23 hooks', () => {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(HOOKS_DIR, 'autonav.json'), 'utf8')
    );
    expect(cfg.hooks).toBeDefined();
    expect(cfg.hooks.SessionStart).toHaveLength(4);
    expect(cfg.hooks.UserPromptSubmit).toHaveLength(3);
    expect(cfg.hooks.PreCompact).toHaveLength(1);
    expect(cfg.hooks.PreToolUse).toHaveLength(10);
    expect(cfg.hooks.PostToolUse).toHaveLength(3);
    expect(cfg.hooks.Stop).toHaveLength(2);

    // Count unique scripts referenced — must be exactly 23.
    const commands = new Set();
    for (const event of Object.keys(cfg.hooks)) {
      for (const hook of cfg.hooks[event]) commands.add(hook.command);
    }
    expect(commands.size).toBe(23);
  });

  it('every registered script file exists', () => {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(HOOKS_DIR, 'autonav.json'), 'utf8')
    );
    for (const event of Object.keys(cfg.hooks)) {
      for (const hook of cfg.hooks[event]) {
        const scriptRel = hook.command
          .replace('node ${workspaceFolder}/', '')
          .trim();
        const scriptAbs = path.join(HOOKS_DIR, '..', '..', scriptRel);
        expect(fs.existsSync(scriptAbs)).toBe(true);
      }
    }
  });
});
