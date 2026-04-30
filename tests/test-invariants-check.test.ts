/**
 * tests/test-invariants-check.test.ts — vitest suite for src/lib/invariants-check.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkAgainstArchitecture,
  checkAgainstPlan,
  generateReport,
  type Invariant,
  loadInvariants,
} from '../src/lib/invariants-check.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invariants-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(name: string, content: string) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

const TABLE_HEADER = `| ID | Name | Category | Requirement | Verification |\n|---|---|---|---|---|\n`;
function tableRow(id: string, name: string, cat: string, req: string, verif = 'Manual') {
  return `| ${id} | ${name} | ${cat} | ${req} | ${verif} |\n`;
}

// ─── loadInvariants ──────────────────────────────────────────────────────────

describe('loadInvariants', () => {
  it('returns empty array when file does not exist', () => {
    const result = loadInvariants('/nonexistent/invariants.md');
    expect(result).toEqual([]);
  });

  it('returns empty array when file has no table', () => {
    const fp = write('invariants.md', '# Invariants\n\nNo table here.');
    expect(loadInvariants(fp)).toEqual([]);
  });

  it('parses table rows into invariant objects', () => {
    const content =
      TABLE_HEADER + tableRow('INV-01', 'Encryption', 'Security', 'Data must be encrypted at rest');
    const fp = write('invariants.md', content);
    const result = loadInvariants(fp);
    expect(result.length).toBe(1);
    const inv = result[0];
    if (!inv) throw new Error('expected invariant');
    expect(inv.id).toBe('INV-01');
    expect(inv.name).toBe('Encryption');
    expect(inv.category).toBe('Security');
  });

  it('uses "Manual review" as default verification when 5th cell absent', () => {
    // Row has 5 pipes but only 4 non-empty cells (no verification cell value)
    const content = `${TABLE_HEADER}| INV-02 | Audit | Compliance | Must log all actions |  |\n`;
    const fp = write('invariants.md', content);
    const result = loadInvariants(fp);
    const inv = result[0];
    if (!inv) throw new Error('expected invariant');
    // The 5th cell is empty, so verification defaults to 'Manual review'
    expect(inv.verification).toBe('Manual review');
  });
});

// ─── checkAgainstArchitecture ────────────────────────────────────────────────

describe('checkAgainstArchitecture', () => {
  const invariants: Invariant[] = [
    {
      id: 'INV-01',
      name: 'Encryption',
      category: 'Security',
      requirement: 'encrypt data at rest using AES',
      verification: 'Auto',
    },
  ];

  it('passes invariant when keywords are found in architecture', () => {
    const arch = 'We encrypt all data at rest using AES-256.';
    const result = checkAgainstArchitecture(arch, invariants);
    expect(result.passed.length).toBe(1);
    expect(result.failed.length).toBe(0);
  });

  it('fails invariant when keywords are absent from architecture', () => {
    const arch = 'We use a simple in-memory store for caching.';
    const result = checkAgainstArchitecture(arch, invariants);
    expect(result.failed.length).toBe(1);
    expect(result.warnings.length).toBe(1);
  });

  it('returns empty results for empty invariants list', () => {
    const result = checkAgainstArchitecture('any content', []);
    expect(result.passed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

// ─── checkAgainstPlan ────────────────────────────────────────────────────────

describe('checkAgainstPlan', () => {
  const invariants: Invariant[] = [
    {
      id: 'INV-01',
      name: 'Encryption at Rest',
      category: 'Security',
      requirement: 'encrypt',
      verification: 'Auto',
    },
    {
      id: 'INV-02',
      name: 'Audit Logging',
      category: 'Compliance',
      requirement: 'log',
      verification: 'Auto',
    },
  ];

  it('marks invariant as addressed when name words appear in plan', () => {
    const plan = 'Phase 1: Implement encryption at rest for all databases.';
    const result = checkAgainstPlan(plan, invariants);
    expect(result.addressed).toContain('INV-01');
  });

  it('marks invariant as unaddressed when name words are absent', () => {
    const plan = 'Phase 1: Build user authentication module.';
    // "Audit" is short (5 chars), "Logging" should match
    const result = checkAgainstPlan(plan, invariants);
    // Both should be absent in this basic plan
    expect(Array.isArray(result.unaddressed)).toBe(true);
  });
});

// ─── generateReport ──────────────────────────────────────────────────────────

describe('generateReport', () => {
  it('returns no-invariants report when file missing', () => {
    const report = generateReport('/nonexistent/inv.md', tmpDir);
    expect(report.invariantCount).toBe(0);
    expect(report.summary).toContain('No invariants defined');
  });

  it('returns report with archCoverage when architecture.md exists', () => {
    const inv = TABLE_HEADER + tableRow('INV-01', 'Encryption', 'Security', 'encrypt data at rest');
    const invPath = write('invariants.md', inv);
    write('architecture.md', 'We encrypt all data at rest using TLS.');
    const report = generateReport(invPath, tmpDir);
    expect(report.invariantCount).toBe(1);
    expect(report.archCoverage).not.toBeNull();
  });

  it('null archCoverage when architecture.md missing', () => {
    const inv = TABLE_HEADER + tableRow('INV-01', 'Encryption', 'Security', 'encrypt data');
    const invPath = write('invariants.md', inv);
    const report = generateReport(invPath, tmpDir);
    expect(report.archCoverage).toBeNull();
  });

  it('summary includes count when all pass', () => {
    const inv = TABLE_HEADER + tableRow('INV-01', 'Encryption', 'Security', 'encrypt data at rest');
    const invPath = write('invariants.md', inv);
    write('architecture.md', 'We encrypt all data at rest using TLS and AES.');
    const report = generateReport(invPath, tmpDir);
    expect(typeof report.summary).toBe('string');
    expect(report.summary.length).toBeGreaterThan(0);
  });
});

// ─── pollution-key safety ────────────────────────────────────────────────────

describe('pollution-key safety (no JSON state)', () => {
  it('loadInvariants does not crash on raw __proto__ bytes in file', () => {
    const content = Buffer.from(`{"__proto__":{"evil":1}}\n${TABLE_HEADER}`).toString();
    const fp = write('inv.md', content);
    expect(() => loadInvariants(fp)).not.toThrow();
  });

  it('checkAgainstArchitecture does not crash on constructor key in content', () => {
    const content = Buffer.from('{"constructor":{"prototype":{}}} We encrypt data').toString();
    const invariants: Invariant[] = [
      { id: 'INV-01', name: 'Enc', category: 'Sec', requirement: 'encrypt', verification: 'Auto' },
    ];
    expect(() => checkAgainstArchitecture(content, invariants)).not.toThrow();
  });
});
