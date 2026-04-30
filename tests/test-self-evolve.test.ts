/**
 * tests/test-self-evolve.test.ts — vitest suite for src/lib/self-evolve.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  analyzeAndPropose,
  generateProposalArtifact,
} from '../src/lib/self-evolve.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

function setupProject(configContent: string) {
  const jsDir = path.join(tmpDir, '.jumpstart');
  fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(path.join(jsDir, 'config.yaml'), configContent);
  return tmpDir;
}

function writeSpec(name: string) {
  const specsDir = path.join(tmpDir, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(path.join(specsDir, name), `# ${name}`);
}

function writeADR(name: string) {
  const adrDir = path.join(tmpDir, 'specs', 'decisions');
  fs.mkdirSync(adrDir, { recursive: true });
  fs.writeFileSync(path.join(adrDir, name), `# ${name}`);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-evolve-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── analyzeAndPropose ────────────────────────────────────────────────────────

describe('analyzeAndPropose', () => {
  it('returns empty proposals when no config.yaml found', () => {
    const result = analyzeAndPropose(tmpDir);
    expect(result.proposals).toEqual([]);
    expect(result.analysis.specs_found).toBe(0);
  });

  it('returns zero specs when specs dir is missing', () => {
    setupProject('workflow:\n  ceremony: standard\n');
    const result = analyzeAndPropose(tmpDir);
    expect(result.analysis.specs_found).toBe(0);
  });

  it('counts spec files correctly', () => {
    setupProject('workflow:\n');
    writeSpec('product-brief.md');
    writeSpec('prd.md');
    const result = analyzeAndPropose(tmpDir);
    expect(result.analysis.specs_found).toBe(2);
  });

  it('counts ADRs correctly', () => {
    setupProject('workflow:\n');
    writeADR('adr-001.md');
    writeADR('adr-002.md');
    const result = analyzeAndPropose(tmpDir);
    expect(result.analysis.adrs_found).toBe(2);
  });

  it('detects missing usage log', () => {
    setupProject('workflow:\n');
    const result = analyzeAndPropose(tmpDir);
    expect(result.analysis.has_usage_log).toBe(false);
  });

  it('detects existing usage log', () => {
    setupProject('workflow:\n');
    fs.writeFileSync(path.join(tmpDir, '.jumpstart', 'usage-log.json'), '{}');
    const result = analyzeAndPropose(tmpDir);
    expect(result.analysis.has_usage_log).toBe(true);
  });

  it('proposes usage_tracking when project has > 3 specs and no usage log', () => {
    setupProject('workflow:\n');
    for (let i = 0; i < 4; i++) writeSpec(`spec-${i}.md`);
    const result = analyzeAndPropose(tmpDir);
    expect(result.proposals.some(p => p.setting === 'usage_tracking')).toBe(true);
  });

  it('proposes skill_level when config has skill_level: null', () => {
    setupProject('user:\n  skill_level: null\n');
    const result = analyzeAndPropose(tmpDir);
    expect(result.proposals.some(p => p.setting === 'user.skill_level')).toBe(true);
  });

  it('proposes diagram verification when > 5 ADRs and auto_verify_at_gate is false', () => {
    setupProject('diagram_verification:\n  auto_verify_at_gate: false\n');
    for (let i = 0; i < 6; i++) writeADR(`adr-00${i}.md`);
    const result = analyzeAndPropose(tmpDir);
    expect(result.proposals.some(p => p.setting.includes('auto_verify_at_gate'))).toBe(true);
  });

  it('proposes peer_review_required when > 4 specs and peer_review is false', () => {
    setupProject('testing:\n  peer_review_required: false\n');
    for (let i = 0; i < 5; i++) writeSpec(`spec-${i}.md`);
    const result = analyzeAndPropose(tmpDir);
    expect(result.proposals.some(p => p.setting.includes('peer_review_required'))).toBe(true);
  });
});

// ─── generateProposalArtifact ─────────────────────────────────────────────────

describe('generateProposalArtifact', () => {
  it('returns "no changes" message when proposals is empty', () => {
    const result = { proposals: [], analysis: { specs_found: 0, adrs_found: 0, has_usage_log: false, has_correction_log: false, quality_score: null, modules_loaded: 0 } };
    const md = generateProposalArtifact(result);
    expect(md).toContain('No changes proposed');
  });

  it('generates markdown with proposal table when proposals exist', () => {
    const result = {
      proposals: [{ setting: 'usage_tracking', current: 'disabled', proposed: 'enabled', rationale: 'Enable to track usage' }],
      analysis: { specs_found: 5, adrs_found: 0, has_usage_log: false, has_correction_log: false, quality_score: null, modules_loaded: 0 }
    };
    const md = generateProposalArtifact(result);
    expect(md).toContain('## Proposed Changes');
    expect(md).toContain('usage_tracking');
  });

  it('includes analysis table in output', () => {
    const result = {
      proposals: [{ setting: 'x', current: 1, proposed: 2, rationale: 'reason' }],
      analysis: { specs_found: 3, adrs_found: 0, has_usage_log: false, has_correction_log: false, quality_score: null, modules_loaded: 0 }
    };
    const md = generateProposalArtifact(result);
    expect(md).toContain('## Project Analysis');
  });

  it('includes approval section', () => {
    const result = {
      proposals: [{ setting: 'x', current: 1, proposed: 2, rationale: 'reason' }],
      analysis: { specs_found: 0, adrs_found: 0, has_usage_log: false, has_correction_log: false, quality_score: null, modules_loaded: 0 }
    };
    const md = generateProposalArtifact(result);
    expect(md).toContain('Pending');
  });
});

// ─── pollution-key safety ────────────────────────────────────────────────────

describe('pollution-key safety', () => {
  it('analyzeAndPropose does not crash on __proto__ bytes in config.yaml', () => {
    const jsDir = path.join(tmpDir, '.jumpstart');
    fs.mkdirSync(jsDir, { recursive: true });
    const raw = Buffer.from('{"__proto__":{"evil":1}}\nskill_level: null\n').toString();
    fs.writeFileSync(path.join(jsDir, 'config.yaml'), raw);
    expect(() => analyzeAndPropose(tmpDir)).not.toThrow();
  });
});
