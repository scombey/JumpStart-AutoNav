/**
 * test-pr-package.test.ts — M11 batch 4 port coverage.
 *
 * Verifies the TS port at `src/lib/pr-package.ts` matches the legacy
 * `bin/lib/pr-package.js` public surface:
 *   - createPRPackage validation, markdown output, default sections
 *   - listPRPackages: empty + populated + sort order
 *   - exportPRPackage: existing + missing id + traversal-shaped id
 *   - gatherTestEvidence probes (test-results.json, coverage, .vitest)
 *   - M3 hardening: pollution-key payloads in test-results don't leak
 *
 * @see src/lib/pr-package.ts
 * @see bin/lib/pr-package.js (legacy reference)
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPRPackage,
  exportPRPackage,
  gatherTestEvidence,
  listPRPackages,
} from '../src/lib/pr-package.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'pr-package-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('pr-package — createPRPackage', () => {
  it('creates a markdown file with the canonical header', () => {
    const r = createPRPackage(
      {
        title: 'Add auth',
        summary: 'Implements JWT authentication.',
        changes: ['src/auth.js'],
        risk_notes: ['Session tokens expire after 24h'],
        rollback: 'Revert commit abc123',
      },
      tmpDir
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.id).toMatch(/^pr-\d+-[a-z0-9]+$/);
      expect(r.title).toBe('Add auth');
      const content = readFileSync(r.output_file, 'utf8');
      expect(content).toContain('# PR Work Package: Add auth');
      expect(content).toContain('## Summary');
      expect(content).toContain('Implements JWT authentication.');
    }
  });

  it('rejects missing title', () => {
    const r = createPRPackage({ summary: 'x' }, tmpDir);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/title/);
  });

  it('rejects missing summary', () => {
    const r = createPRPackage({ title: 't' }, tmpDir);
    expect(r.success).toBe(false);
  });

  it('rejects null pkg', () => {
    const r = createPRPackage(null, tmpDir);
    expect(r.success).toBe(false);
  });

  it('records changes count + risk count', () => {
    const r = createPRPackage(
      {
        title: 'T',
        summary: 'S',
        changes: ['a.js', 'b.js'],
        risk_notes: ['r1', 'r2', 'r3'],
      },
      tmpDir
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.changes_count).toBe(2);
      expect(r.risk_count).toBe(3);
    }
  });

  it('coerces a single-string changes/risk_notes into arrays', () => {
    const r = createPRPackage(
      {
        title: 'T',
        summary: 'S',
        changes: 'a.js',
        risk_notes: 'one risk',
      },
      tmpDir
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.changes_count).toBe(1);
      expect(r.risk_count).toBe(1);
      const content = readFileSync(r.output_file, 'utf8');
      expect(content).toContain('- a.js');
      expect(content).toContain('- one risk');
    }
  });

  it('falls back to "None identified" when no risk_notes provided', () => {
    const r = createPRPackage({ title: 'T', summary: 'S' }, tmpDir);
    expect(r.success).toBe(true);
    if (r.success) {
      const content = readFileSync(r.output_file, 'utf8');
      expect(content).toContain('- None identified');
    }
  });

  it('falls back to default rollback line when none provided', () => {
    const r = createPRPackage({ title: 'T', summary: 'S' }, tmpDir);
    expect(r.success).toBe(true);
    if (r.success) {
      const content = readFileSync(r.output_file, 'utf8');
      expect(content).toContain('No specific rollback steps documented. Revert the PR commits.');
    }
  });

  it('renders linked stories', () => {
    const r = createPRPackage(
      { title: 'T', summary: 'S', linked_stories: ['E1-S1', 'M1-T01'] },
      tmpDir
    );
    expect(r.success).toBe(true);
    if (r.success) {
      const content = readFileSync(r.output_file, 'utf8');
      expect(content).toContain('- E1-S1');
      expect(content).toContain('- M1-T01');
    }
  });

  it('writes under <root>/.jumpstart/pr-packages by default', () => {
    const r = createPRPackage({ title: 'T', summary: 'S' }, tmpDir);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.output_file).toContain(join(tmpDir, '.jumpstart', 'pr-packages'));
    }
  });

  it('honours custom outputDir', () => {
    const customDir = join(tmpDir, 'custom-out');
    const r = createPRPackage({ title: 'T', summary: 'S' }, tmpDir, { outputDir: customDir });
    expect(r.success).toBe(true);
    if (r.success) expect(r.output_file).toContain(customDir);
  });
});

describe('pr-package — listPRPackages', () => {
  it('returns total=0 for fresh dir', () => {
    const r = listPRPackages(tmpDir);
    expect(r.total).toBe(0);
    expect(r.packages).toEqual([]);
  });

  it('returns created packages', () => {
    createPRPackage({ title: 'A', summary: 'S' }, tmpDir);
    createPRPackage({ title: 'B', summary: 'S' }, tmpDir);
    const r = listPRPackages(tmpDir);
    expect(r.total).toBe(2);
  });

  it('sorts by created_at descending', () => {
    const a = createPRPackage({ title: 'A', summary: 'S' }, tmpDir);
    // Force a different mtime; the sort key is created_at (ISO string).
    const b = createPRPackage({ title: 'B', summary: 'S' }, tmpDir);
    expect(a.success && b.success).toBe(true);
    const r = listPRPackages(tmpDir);
    expect(r.total).toBe(2);
    // Newer first
    const first = r.packages[0]?.created_at ?? '';
    const second = r.packages[1]?.created_at ?? '';
    expect(first >= second).toBe(true);
  });
});

describe('pr-package — exportPRPackage', () => {
  it('returns the markdown content for an existing package', () => {
    const created = createPRPackage({ title: 'T', summary: 'S' }, tmpDir);
    expect(created.success).toBe(true);
    if (!created.success) throw new Error('setup');
    const r = exportPRPackage(created.id, tmpDir);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.id).toBe(created.id);
      expect(r.content).toContain('# PR Work Package');
    }
  });

  it('rejects empty id', () => {
    const r = exportPRPackage('', tmpDir);
    expect(r.success).toBe(false);
  });

  it('rejects traversal-shaped id', () => {
    const r = exportPRPackage('../../etc/passwd', tmpDir);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Invalid PR package id/);
  });

  it('returns success=false for unknown id', () => {
    const r = exportPRPackage('pr-doesntexist', tmpDir);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/PR package not found/);
  });
});

describe('pr-package — gatherTestEvidence', () => {
  it('returns empty array when no probe files exist', () => {
    expect(gatherTestEvidence(tmpDir)).toEqual([]);
  });

  it('detects test-results.json', () => {
    writeFileSync(join(tmpDir, 'test-results.json'), JSON.stringify({ pass: 100 }));
    const r = gatherTestEvidence(tmpDir);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('test-results.json');
    expect(r[0]).toContain('pass');
  });

  it('detects coverage/summary.json', () => {
    mkdirSync(join(tmpDir, 'coverage'), { recursive: true });
    writeFileSync(join(tmpDir, 'coverage', 'summary.json'), JSON.stringify({ lines: 95 }));
    const r = gatherTestEvidence(tmpDir);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('coverage/summary.json');
  });

  it('detects all 3 probe locations', () => {
    writeFileSync(join(tmpDir, 'test-results.json'), '{}');
    mkdirSync(join(tmpDir, 'coverage'), { recursive: true });
    writeFileSync(join(tmpDir, 'coverage', 'summary.json'), '{}');
    mkdirSync(join(tmpDir, '.vitest'), { recursive: true });
    writeFileSync(join(tmpDir, '.vitest', 'results.json'), '{}');
    const r = gatherTestEvidence(tmpDir);
    expect(r).toHaveLength(3);
  });

  it('falls back to "found at" hint on malformed JSON', () => {
    writeFileSync(join(tmpDir, 'test-results.json'), '{not-json');
    const r = gatherTestEvidence(tmpDir);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/Test results found at:/);
  });

  it('M3 hardening: rejects raw __proto__ payloads in test-results', () => {
    // JSON.stringify({__proto__: ...}) drops the key (the __proto__ literal
    // in object initializers SETS the prototype rather than adding a key);
    // we have to write the raw bytes to exercise the pollution path.
    writeFileSync(join(tmpDir, 'test-results.json'), '{"__proto__":{"polluted":true},"ok":true}');
    const r = gatherTestEvidence(tmpDir);
    expect(r).toHaveLength(1);
    // Hardening path falls back to the safe hint, never serializes the payload.
    expect(r[0]).toMatch(/Test results found at:/);
    expect(r[0]).not.toMatch(/polluted/);
  });

  it('M3 hardening: rejects raw constructor payloads in test-results', () => {
    writeFileSync(join(tmpDir, 'test-results.json'), '{"constructor":{"polluted":true},"ok":true}');
    const r = gatherTestEvidence(tmpDir);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/Test results found at:/);
  });

  it('auto-fills test_evidence into a created package', () => {
    writeFileSync(join(tmpDir, 'test-results.json'), JSON.stringify({ pass: 1 }));
    const r = createPRPackage({ title: 'T', summary: 'S' }, tmpDir);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.has_test_evidence).toBe(true);
      const content = readFileSync(r.output_file, 'utf8');
      expect(content).toContain('test-results.json');
    }
  });

  it('explicit test_evidence overrides auto-detection', () => {
    writeFileSync(join(tmpDir, 'test-results.json'), JSON.stringify({ pass: 1 }));
    const r = createPRPackage(
      { title: 'T', summary: 'S', test_evidence: 'manual evidence line' },
      tmpDir
    );
    expect(r.success).toBe(true);
    if (r.success) {
      const content = readFileSync(r.output_file, 'utf8');
      expect(content).toContain('manual evidence line');
      expect(content).not.toContain('test-results.json');
    }
  });
});
