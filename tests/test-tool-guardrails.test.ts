/**
 * tests/test-tool-guardrails.test.ts
 * Vitest tests for src/lib/tool-guardrails.ts (M11 batch 6 port).
 */

import { describe, it, expect } from 'vitest';
import {
  checkOperation,
  validateFileOperation,
  RISK_RULES,
  PROTECTED_PATHS,
} from '../src/lib/tool-guardrails.js';

// ─── RISK_RULES ───────────────────────────────────────────────────────────────

describe('RISK_RULES', () => {
  it('contains 8 rules', () => {
    expect(RISK_RULES).toHaveLength(8);
  });

  it('has a critical rule for recursive-delete', () => {
    const rule = RISK_RULES.find(r => r.id === 'recursive-delete');
    expect(rule).toBeDefined();
    expect(rule!.risk).toBe('critical');
  });

  it('has a critical rule for sudo-usage', () => {
    const rule = RISK_RULES.find(r => r.id === 'sudo-usage');
    expect(rule).toBeDefined();
    expect(rule!.risk).toBe('critical');
  });
});

// ─── PROTECTED_PATHS ─────────────────────────────────────────────────────────

describe('PROTECTED_PATHS', () => {
  it('includes .env', () => {
    expect(PROTECTED_PATHS).toContain('.env');
  });

  it('includes .jumpstart/state/', () => {
    expect(PROTECTED_PATHS).toContain('.jumpstart/state/');
  });
});

// ─── checkOperation ──────────────────────────────────────────────────────────

describe('checkOperation', () => {
  it('returns error for empty operation', () => {
    const result = checkOperation('');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it('returns no violations for safe operation', () => {
    const result = checkOperation('echo hello');
    expect(result.success).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.risk_level).toBe('none');
    expect(result.allowed).toBe(true);
  });

  it('detects rm -rf as critical', () => {
    const result = checkOperation('rm -rf /tmp/folder');
    expect(result.success).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.risk_level).toBe('critical');
    const violationIds = (result.violations ?? []).map(v => v.rule_id);
    expect(violationIds).toContain('recursive-delete');
  });

  it('detects sudo as critical', () => {
    const result = checkOperation('sudo rm file.txt');
    expect(result.allowed).toBe(false);
    expect(result.risk_level).toBe('critical');
  });

  it('detects schema change as high risk', () => {
    const result = checkOperation('ALTER TABLE users DROP COLUMN email');
    expect(result.success).toBe(true);
    expect(result.requires_approval).toBe(true);
    const violationIds = (result.violations ?? []).map(v => v.rule_id);
    expect(violationIds).toContain('schema-change');
  });

  it('detects git force push as high risk', () => {
    const result = checkOperation('git push --force origin main');
    expect(result.requires_approval).toBe(true);
    expect(result.risk_level).toBe('high');
  });

  it('detects wide glob as medium risk', () => {
    const result = checkOperation('rm **/*');
    // recursive-delete not matched here (no -rf), but wide-glob is medium
    const globs = (result.violations ?? []).filter(v => v.rule_id === 'wide-glob');
    expect(globs.length).toBeGreaterThan(0);
  });

  it('detects protected path .env', () => {
    const result = checkOperation('cat .env');
    expect(result.success).toBe(true);
    const ppViolations = (result.violations ?? []).filter(v => v.rule_id === 'protected-path');
    expect(ppViolations.length).toBeGreaterThan(0);
  });

  it('detects protected path .jumpstart/state/', () => {
    const result = checkOperation('rm .jumpstart/state/state.json');
    const ppViolations = (result.violations ?? []).filter(v => v.rule_id === 'protected-path');
    expect(ppViolations.length).toBeGreaterThan(0);
  });

  it('truncates long operations to 200 chars in result', () => {
    const longOp = 'echo ' + 'a'.repeat(300);
    const result = checkOperation(longOp);
    expect((result.operation ?? '').length).toBeLessThanOrEqual(200);
  });

  it('reports total_violations count', () => {
    const result = checkOperation('sudo rm -rf .env');
    expect(typeof result.total_violations).toBe('number');
    expect((result.total_violations ?? 0)).toBeGreaterThan(0);
  });
});

// ─── validateFileOperation ───────────────────────────────────────────────────

describe('validateFileOperation', () => {
  it('allows safe create', () => {
    const result = validateFileOperation('create', 'src/lib/foo.ts');
    expect(result.success).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns on delete with high-level warning', () => {
    const result = validateFileOperation('delete', 'src/lib/foo.ts');
    expect(result.success).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.warnings.some(w => w.level === 'high')).toBe(true);
  });

  it('blocks delete of protected path', () => {
    const result = validateFileOperation('delete', '.env');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/protected/i);
  });

  it('blocks delete of .jumpstart/state/ path', () => {
    const result = validateFileOperation('delete', '.jumpstart/state/state.json');
    expect(result.allowed).toBe(false);
  });

  it('warns on edit of .pem file', () => {
    const result = validateFileOperation('edit', 'certs/server.pem');
    expect(result.warnings.some(w => w.message.includes('sensitive'))).toBe(true);
  });

  it('warns on edit of .key file', () => {
    const result = validateFileOperation('edit', 'private.key');
    expect(result.warnings.some(w => w.level === 'high')).toBe(true);
  });

  it('warns on large edit (>100 lines)', () => {
    const result = validateFileOperation('edit', 'src/foo.ts', { lines_changed: 150 });
    expect(result.warnings.some(w => w.message.includes('Large edit'))).toBe(true);
  });

  it('does not warn for small edit', () => {
    const result = validateFileOperation('edit', 'src/foo.ts', { lines_changed: 10 });
    expect(result.warnings).toHaveLength(0);
  });

  it('sets requires_review true when high warning present', () => {
    const result = validateFileOperation('delete', 'src/foo.ts');
    expect(result.requires_review).toBe(true);
  });

  it('sets requires_review false when no high warnings', () => {
    const result = validateFileOperation('create', 'src/foo.ts');
    expect(result.requires_review).toBe(false);
  });
});
