/**
 * test-slash-command-contract.test.ts — T4.7.5 slash-command contract test.
 *
 * Asserts the CLAUDE.md "Slash Command Routing" table stays in sync
 * with the actual `.jumpstart/agents/*.md` filenames on disk.
 *
 * Two failure modes this test catches:
 *
 *   1. **Broken reference**: CLAUDE.md mentions
 *      `Load \`.jumpstart/agents/scout.md\`` but `scout.md` doesn't
 *      exist. A user runs `/jumpstart.scout`; Claude Code follows
 *      the documented load instruction; FileNotFound surfaces.
 *
 *   2. **Orphan agent file**: a `.jumpstart/agents/<name>.md` exists
 *      on disk with no slash command pointing at it. Either the
 *      command was removed without cleaning up the agent file, or
 *      the agent was renamed without updating CLAUDE.md.
 *
 * The test allows a curated allowlist of "sub-agents" — files that
 * are deliberately invoked transitively (e.g., from facilitator's
 * roundtable protocol) rather than via a top-level slash command.
 *
 * @see specs/implementation-plan.md T4.7.5
 * @see CLAUDE.md §Slash Command Routing
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const CLAUDE_MD = path.join(REPO_ROOT, 'CLAUDE.md');
const AGENTS_DIR = path.join(REPO_ROOT, '.jumpstart', 'agents');

/**
 * Sub-agents intentionally NOT routed via top-level slash commands.
 * These are invoked transitively by facilitator (Pit Crew roundtable),
 * by `/jumpstart.review` (multi-agent validation), or as researcher
 * sub-agents spawned during a phase.
 */
const SUB_AGENTS_ALLOWLIST = new Set<string>([
  'adversary.md',
  'devops.md',
  'diagram-verifier.md',
  'facilitator.md',
  'maintenance.md',
  'performance.md',
  'qa.md',
  'quick-dev.md',
  'refactor.md',
  'requirements-extractor.md',
  'researcher.md',
  'retrospective.md',
  'reviewer.md',
  'scrum-master.md',
  'security.md',
  'tech-writer.md',
  'ux-designer.md',
]);

/** Extract every `.jumpstart/agents/<name>.md` mention from CLAUDE.md. */
function extractAgentReferences(content: string): Set<string> {
  const refs = new Set<string>();
  for (const m of content.matchAll(/\.jumpstart\/agents\/([\w-]+\.md)/g)) {
    refs.add(m[1]);
  }
  return refs;
}

describe('T4.7.5 — slash-command contract: CLAUDE.md ↔ .jumpstart/agents/*.md', () => {
  const claudeMd = readFileSync(CLAUDE_MD, 'utf8');
  const referencedAgents = extractAgentReferences(claudeMd);
  const agentFiles = new Set(readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')));

  it('CLAUDE.md exists', () => {
    expect(existsSync(CLAUDE_MD)).toBe(true);
  });

  it('.jumpstart/agents/ directory exists and has at least 1 agent', () => {
    expect(existsSync(AGENTS_DIR)).toBe(true);
    expect(agentFiles.size).toBeGreaterThan(0);
  });

  it('every CLAUDE.md agent reference points at an existing file (no broken Load instructions)', () => {
    const broken: string[] = [];
    for (const ref of referencedAgents) {
      if (!agentFiles.has(ref)) {
        broken.push(ref);
      }
    }
    expect(broken, `CLAUDE.md references missing agent files: ${broken.join(', ')}`).toEqual([]);
  });

  it('every agent file is either referenced by CLAUDE.md or in the sub-agent allowlist', () => {
    const orphans: string[] = [];
    for (const file of agentFiles) {
      if (!referencedAgents.has(file) && !SUB_AGENTS_ALLOWLIST.has(file)) {
        orphans.push(file);
      }
    }
    expect(
      orphans,
      `Orphan agent files (no slash command + not in sub-agent allowlist): ${orphans.join(', ')}. Either add a slash command in CLAUDE.md or add the file to SUB_AGENTS_ALLOWLIST in this test.`
    ).toEqual([]);
  });

  it('SUB_AGENTS_ALLOWLIST entries all exist on disk (no stale allowlist)', () => {
    const stale: string[] = [];
    for (const allowed of SUB_AGENTS_ALLOWLIST) {
      if (!agentFiles.has(allowed)) {
        stale.push(allowed);
      }
    }
    expect(
      stale,
      `Stale SUB_AGENTS_ALLOWLIST entries (file no longer exists): ${stale.join(', ')}. Remove from the allowlist.`
    ).toEqual([]);
  });

  it('the slash-command routing table mentions every phase agent', () => {
    // The 6 canonical phases each have a top-level command.
    const requiredPhases = [
      'scout.md',
      'challenger.md',
      'analyst.md',
      'pm.md',
      'architect.md',
      'developer.md',
    ];
    const missing = requiredPhases.filter((p) => !referencedAgents.has(p));
    expect(missing, `CLAUDE.md missing phase agents: ${missing.join(', ')}`).toEqual([]);
  });
});
