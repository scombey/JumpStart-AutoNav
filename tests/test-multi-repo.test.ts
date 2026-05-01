/**
 * test-multi-repo.test.ts — M11 batch 4 port coverage.
 *
 * Verifies the TS port at `src/lib/multi-repo.ts` matches the legacy
 * `bin/lib/multi-repo.js` public surface:
 *   - defaultMultiRepoState shape
 *   - loadMultiRepoState / saveMultiRepoState round-trip + M3 hardening
 *   - initProgram (success + reject empty + state-reset)
 *   - linkRepo (role normalization + duplicate rejection + invalid role)
 *   - addSharedSpec (rejects empty path)
 *   - addDependency (rejects missing ids)
 *   - getProgramStatus aggregations
 *   - setReleasePlan (rejects non-array; sets current_milestone)
 *
 * @see src/lib/multi-repo.ts
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addDependency,
  addSharedSpec,
  defaultMultiRepoState,
  getProgramStatus,
  initProgram,
  linkRepo,
  loadMultiRepoState,
  saveMultiRepoState,
  setReleasePlan,
} from '../src/lib/multi-repo.js';

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'multi-repo-'));
  stateFile = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('multi-repo — defaultMultiRepoState', () => {
  it('returns a fresh state with the canonical shape', () => {
    const s = defaultMultiRepoState();
    expect(s.version).toBe('1.0.0');
    expect(s.program_name).toBeNull();
    expect(s.repos).toEqual([]);
    expect(s.shared_specs).toEqual([]);
    expect(s.dependencies).toEqual([]);
    expect(s.release_plan.milestones).toEqual([]);
    expect(s.release_plan.current_milestone).toBeNull();
  });
});

describe('multi-repo — loadMultiRepoState/saveMultiRepoState', () => {
  it('returns defaultMultiRepoState when the file does not exist', () => {
    const s = loadMultiRepoState(stateFile);
    expect(s.repos).toEqual([]);
  });

  it('round-trips through saveMultiRepoState → loadMultiRepoState', () => {
    const s = defaultMultiRepoState();
    s.program_name = 'P';
    saveMultiRepoState(s, stateFile);
    const reloaded = loadMultiRepoState(stateFile);
    expect(reloaded.program_name).toBe('P');
    expect(reloaded.last_updated).not.toBeNull();
  });

  it('falls back to defaultMultiRepoState on malformed JSON', () => {
    writeFileSync(stateFile, '{not-json');
    const s = loadMultiRepoState(stateFile);
    expect(s.repos).toEqual([]);
  });

  it('M3 hardening: rejects __proto__', () => {
    writeFileSync(stateFile, '{"__proto__":{"polluted":true},"program_name":"X"}');
    const s = loadMultiRepoState(stateFile);
    expect(s.program_name).toBeNull();
  });

  it('M3 hardening: rejects nested constructor', () => {
    writeFileSync(stateFile, '{"program_name":"P","repos":[{"constructor":{"x":1}}]}');
    const s = loadMultiRepoState(stateFile);
    expect(s.program_name).toBeNull();
  });
});

describe('multi-repo — initProgram', () => {
  it('initializes a new program', () => {
    const r = initProgram('MyProgram', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.program_name).toBe('MyProgram');
    const reloaded = loadMultiRepoState(stateFile);
    expect(reloaded.program_name).toBe('MyProgram');
  });

  it('rejects empty name', () => {
    const r = initProgram('', { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects whitespace-only name', () => {
    const r = initProgram('   ', { stateFile });
    expect(r.success).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    const r = initProgram('  Trimmed  ', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.program_name).toBe('Trimmed');
  });

  it('overwrites prior state on re-init', () => {
    initProgram('First', { stateFile });
    linkRepo('https://github.com/a/b', 'frontend', { stateFile });
    initProgram('Second', { stateFile });
    const reloaded = loadMultiRepoState(stateFile);
    expect(reloaded.program_name).toBe('Second');
    expect(reloaded.repos).toEqual([]);
  });
});

describe('multi-repo — linkRepo', () => {
  it('adds a repo with a valid role', () => {
    initProgram('P', { stateFile });
    const r = linkRepo('https://github.com/org/repo', 'frontend', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.repo.role).toBe('frontend');
      expect(r.total_repos).toBe(1);
    }
  });

  it('normalizes role to lowercase', () => {
    initProgram('P', { stateFile });
    const r = linkRepo('https://github.com/org/repo', 'BACKEND', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.repo.role).toBe('backend');
  });

  it('rejects invalid role', () => {
    initProgram('P', { stateFile });
    const r = linkRepo('https://github.com/org/repo', 'wizard', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/role must be one of/);
  });

  it('rejects missing url', () => {
    const r = linkRepo('', 'frontend', { stateFile });
    expect(r.success).toBe(false);
  });

  it('prevents duplicate repos by URL', () => {
    initProgram('P', { stateFile });
    linkRepo('https://github.com/org/r', 'backend', { stateFile });
    const r = linkRepo('https://github.com/org/r', 'backend', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/already linked/);
  });

  it('falls back to "other" when role is empty/null', () => {
    initProgram('P', { stateFile });
    const r = linkRepo('https://github.com/x/y', '', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.repo.role).toBe('other');
  });
});

describe('multi-repo — addSharedSpec', () => {
  it('records a shared spec', () => {
    initProgram('P', { stateFile });
    const r = addSharedSpec('specs/prd.md', ['repo-1', 'repo-2'], { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.spec.path).toBe('specs/prd.md');
      expect(r.spec.repos).toEqual(['repo-1', 'repo-2']);
      expect(r.total_shared_specs).toBe(1);
    }
  });

  it('rejects empty specPath', () => {
    const r = addSharedSpec('', [], { stateFile });
    expect(r.success).toBe(false);
  });

  it('handles non-array repoIds gracefully', () => {
    initProgram('P', { stateFile });
    // null repoIds → empty repos[]
    const r = addSharedSpec('specs/prd.md', null, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.spec.repos).toEqual([]);
  });
});

describe('multi-repo — addDependency', () => {
  it('records a cross-repo dependency', () => {
    initProgram('P', { stateFile });
    const r = addDependency('repo-a', 'repo-b', 'api', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.dependency.from).toBe('repo-a');
      expect(r.dependency.to).toBe('repo-b');
      expect(r.dependency.type).toBe('api');
    }
  });

  it('defaults type to "other"', () => {
    initProgram('P', { stateFile });
    const r = addDependency('a', 'b', null, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.dependency.type).toBe('other');
  });

  it('rejects missing ids', () => {
    const r = addDependency('', 'b', 'api', { stateFile });
    expect(r.success).toBe(false);
  });
});

describe('multi-repo — getProgramStatus', () => {
  it('returns aggregate info', () => {
    initProgram('P', { stateFile });
    linkRepo('https://github.com/org/frontend', 'frontend', { stateFile });
    linkRepo('https://github.com/org/backend', 'backend', { stateFile });
    const s = getProgramStatus({ stateFile });
    expect(s.repo_count).toBe(2);
    expect(s.role_breakdown.frontend).toBe(1);
    expect(s.role_breakdown.backend).toBe(1);
    expect(s.initialized).toBe(true);
  });

  it('initialized=false when no program_name set', () => {
    const s = getProgramStatus({ stateFile });
    expect(s.initialized).toBe(false);
  });
});

describe('multi-repo — setReleasePlan', () => {
  it('stores milestones + sets current_milestone to first', () => {
    initProgram('P', { stateFile });
    const r = setReleasePlan(
      [
        { name: 'Alpha', target_date: '2026-06-01', repos: [] },
        { name: 'Beta', target_date: '2026-09-01', repos: [] },
      ],
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.milestone_count).toBe(2);
      expect(r.release_plan.current_milestone).toBe('milestone-1');
    }
  });

  it('rejects non-array milestones', () => {
    const r = setReleasePlan('not an array' as unknown as never, { stateFile });
    expect(r.success).toBe(false);
  });

  it('honours fallbacks for missing milestone fields', () => {
    initProgram('P', { stateFile });
    const r = setReleasePlan([{}], { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.release_plan.milestones[0]?.name).toBe('Milestone 1');
      expect(r.release_plan.milestones[0]?.status).toBe('planned');
      expect(r.release_plan.milestones[0]?.target_date).toBeNull();
      expect(r.release_plan.milestones[0]?.repos).toEqual([]);
    }
  });

  it('does not set current_milestone when list is empty', () => {
    initProgram('P', { stateFile });
    const r = setReleasePlan([], { stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.release_plan.current_milestone).toBeNull();
  });
});
