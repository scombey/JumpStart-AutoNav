/**
 * tests/test-export.test.ts — vitest suite for src/lib/export.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  exportHandoffPackage,
  gatherHandoffData,
  isApproved,
  PHASES,
  renderHandoffMarkdown,
  SECONDARY_ARTIFACTS,
} from '../src/lib/export.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

function setupProject() {
  const jsDir = path.join(tmpDir, '.jumpstart');
  fs.mkdirSync(jsDir, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'specs'), { recursive: true });
}

function writeSpec(rel: string, content: string) {
  const full = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const APPROVED_CONTENT = `# Brief\n\n## Phase Gate Approval\n\n**Approved by:** Sam\n\n- [x] Reviewed\n`;
const DRAFT_CONTENT = `# Brief\n\nContent here.\n`;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── PHASES / SECONDARY_ARTIFACTS constants ───────────────────────────────────

describe('constants', () => {
  it('PHASES has 6 entries covering -1 to 4', () => {
    expect(PHASES.length).toBe(6);
    const phases = PHASES.map((p) => p.phase);
    expect(phases).toContain(-1);
    expect(phases).toContain(4);
  });

  it('SECONDARY_ARTIFACTS contains implementation-plan.md', () => {
    expect(SECONDARY_ARTIFACTS).toContain('specs/implementation-plan.md');
  });
});

// ─── isApproved ───────────────────────────────────────────────────────────────

describe('isApproved', () => {
  it('returns false for empty content', () => {
    expect(isApproved('')).toBe(false);
  });

  it('returns false without Phase Gate Approval section', () => {
    expect(isApproved('# Brief\n\nSome content\n')).toBe(false);
  });

  it('returns false when Approved by is Pending', () => {
    const content = '# Brief\n\n## Phase Gate Approval\n\n**Approved by:** Pending\n';
    expect(isApproved(content)).toBe(false);
  });

  it('returns true when approved and all boxes checked', () => {
    expect(isApproved(APPROVED_CONTENT)).toBe(true);
  });

  it('returns false when some checkboxes are unchecked', () => {
    const content =
      '# Brief\n\n## Phase Gate Approval\n\n**Approved by:** Sam\n\n- [x] Done\n- [ ] Pending\n';
    expect(isApproved(content)).toBe(false);
  });
});

// ─── gatherHandoffData ────────────────────────────────────────────────────────

describe('gatherHandoffData', () => {
  it('returns empty project when no files exist', () => {
    const data = gatherHandoffData({ root: tmpDir });
    expect(data.project_name).toBe(path.basename(tmpDir));
    expect(data.phases.length).toBe(PHASES.length);
    expect(data.approved_artifacts).toEqual([]);
  });

  it('detects approved artifact', () => {
    setupProject();
    writeSpec('specs/product-brief.md', APPROVED_CONTENT);
    const data = gatherHandoffData({ root: tmpDir });
    expect(data.approved_artifacts).toContain('specs/product-brief.md');
  });

  it('marks draft artifacts with draft status', () => {
    setupProject();
    writeSpec('specs/product-brief.md', DRAFT_CONTENT);
    const data = gatherHandoffData({ root: tmpDir });
    const phase1 = data.phases.find((p) => p.phase === 1);
    expect(phase1?.status).toBe('draft');
  });

  it('loads project name from config.yaml', () => {
    setupProject();
    fs.writeFileSync(
      path.join(tmpDir, '.jumpstart', 'config.yaml'),
      "project:\n  name: 'My Cool Project'\n"
    );
    const data = gatherHandoffData({ root: tmpDir });
    expect(data.project_name).toBe('My Cool Project');
  });

  it('scans for ADRs in specs/decisions/', () => {
    setupProject();
    fs.mkdirSync(path.join(tmpDir, 'specs', 'decisions'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'specs', 'decisions', 'adr-001.md'),
      '# ADR-001: Use TypeScript\n\n**Status:** Accepted\n'
    );
    const data = gatherHandoffData({ root: tmpDir });
    expect(data.decisions.length).toBe(1);
    expect(data.decisions[0]?.title).toBe('ADR-001: Use TypeScript');
    expect(data.decisions[0]?.status).toBe('Accepted');
  });

  it('scans for [NEEDS CLARIFICATION] tags in specs', () => {
    setupProject();
    writeSpec('specs/prd.md', 'Some story [NEEDS CLARIFICATION: who is the user?]');
    const data = gatherHandoffData({ root: tmpDir });
    expect(data.open_items.length).toBeGreaterThan(0);
    expect(data.open_items[0]?.tag).toContain('NEEDS CLARIFICATION');
  });

  it('includes exported_at ISO timestamp', () => {
    const data = gatherHandoffData({ root: tmpDir });
    expect(data.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('defaults state with null phase when state.json missing', () => {
    const data = gatherHandoffData({ root: tmpDir });
    expect(data.implementation_status.current_phase).toBeNull();
  });

  it('handles polluted state.json gracefully (falls back to defaultState)', () => {
    setupProject();
    fs.mkdirSync(path.join(tmpDir, '.jumpstart', 'state'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.jumpstart', 'state', 'state.json'),
      '{"__proto__":{"evil":1},"current_phase":2}'
    );
    expect(() => gatherHandoffData({ root: tmpDir })).not.toThrow();
    const data = gatherHandoffData({ root: tmpDir });
    expect(data.implementation_status.current_phase).toBeNull(); // fallback
  });
});

// ─── renderHandoffMarkdown ────────────────────────────────────────────────────

describe('renderHandoffMarkdown', () => {
  it('renders project name in title', () => {
    const data = gatherHandoffData({ root: tmpDir });
    const md = renderHandoffMarkdown(data);
    expect(md).toContain('# Handoff Package');
  });

  it('renders Phase Status table', () => {
    const data = gatherHandoffData({ root: tmpDir });
    const md = renderHandoffMarkdown(data);
    expect(md).toContain('## Phase Status');
    expect(md).toContain('| Phase |');
  });

  it('renders Implementation Status section', () => {
    const data = gatherHandoffData({ root: tmpDir });
    const md = renderHandoffMarkdown(data);
    expect(md).toContain('## Implementation Status');
  });
});

// ─── exportHandoffPackage ─────────────────────────────────────────────────────

describe('exportHandoffPackage', () => {
  it('creates output file and returns success', () => {
    const outputPath = path.join(tmpDir, 'handoff-test.md');
    const result = exportHandoffPackage({ root: tmpDir, output: outputPath });
    expect(result.success).toBe(true);
    expect(result.output_path).toBe(outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('writes JSON content when json option is true', () => {
    const outputPath = path.join(tmpDir, 'handoff-test.json');
    exportHandoffPackage({ root: tmpDir, output: outputPath, json: true });
    const content = fs.readFileSync(outputPath, 'utf8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.project_name).toBeDefined();
    expect(parsed.phases).toBeDefined();
  });

  it('stats includes expected fields', () => {
    const outputPath = path.join(tmpDir, 'handoff-test.md');
    const result = exportHandoffPackage({ root: tmpDir, output: outputPath });
    expect(typeof result.stats.phases).toBe('number');
    expect(typeof result.stats.approved).toBe('number');
    expect(typeof result.stats.has_coverage).toBe('boolean');
  });

  it('creates output directory if it does not exist', () => {
    const outputPath = path.join(tmpDir, 'new-dir', 'handoff.md');
    const result = exportHandoffPackage({ root: tmpDir, output: outputPath });
    expect(result.success).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);
  });
});
