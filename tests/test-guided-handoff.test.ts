/**
 * tests/test-guided-handoff.test.ts — Guided Handoff port tests (M11 batch 6).
 */
import { describe, expect, it } from 'vitest';
import {
  generateHandoff,
  HANDOFF_CHECKLISTS,
  HANDOFF_TYPES,
  listHandoffTypes,
  validateHandoff,
} from '../src/lib/guided-handoff.js';

describe('HANDOFF_TYPES', () => {
  it('contains the four expected types', () => {
    expect(HANDOFF_TYPES).toContain('product-to-engineering');
    expect(HANDOFF_TYPES).toContain('engineering-to-qa');
    expect(HANDOFF_TYPES).toContain('engineering-to-ops');
    expect(HANDOFF_TYPES).toContain('ops-to-support');
  });
});

describe('HANDOFF_CHECKLISTS', () => {
  it('each type has required and optional arrays', () => {
    for (const t of HANDOFF_TYPES) {
      const cl = HANDOFF_CHECKLISTS[t];
      expect(Array.isArray(cl.required)).toBe(true);
      expect(Array.isArray(cl.optional)).toBe(true);
      expect(cl.required.length).toBeGreaterThan(0);
    }
  });
});

describe('generateHandoff', () => {
  it('returns success for valid type', () => {
    const result = generateHandoff('product-to-engineering', '/tmp');
    expect(result.success).toBe(true);
    expect(result.type).toBe('product-to-engineering');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('returns error for unknown type', () => {
    const result = generateHandoff('unknown-type', '/tmp');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown handoff type/);
  });

  it('marks provided items as provided', () => {
    const result = generateHandoff('product-to-engineering', '/tmp', { user_stories: true });
    const item = result.items?.find((i) => i.name === 'user_stories');
    expect(item?.status).toBe('provided');
  });

  it('marks missing required items', () => {
    const result = generateHandoff('product-to-engineering', '/tmp');
    expect(result.complete).toBe(false);
    expect((result.missing_required ?? []).length).toBeGreaterThan(0);
  });

  it('marks complete when all required are provided', () => {
    const opts: Record<string, boolean> = {};
    for (const req of HANDOFF_CHECKLISTS['product-to-engineering'].required) {
      opts[req] = true;
    }
    const result = generateHandoff('product-to-engineering', '/tmp', opts);
    expect(result.complete).toBe(true);
    expect(result.missing_required?.length).toBe(0);
  });

  it('sets generated_at timestamp', () => {
    const result = generateHandoff('engineering-to-qa', '/tmp');
    expect(result.generated_at).toBeTruthy();
  });

  it('handles all four handoff types', () => {
    for (const t of HANDOFF_TYPES) {
      const result = generateHandoff(t, '/tmp');
      expect(result.success).toBe(true);
    }
  });

  // Prototype pollution — raw __proto__ key (not JSON.stringify which strips it)
  it('does not accept __proto__ as a handoff type', () => {
    const result = generateHandoff('__proto__', '/tmp');
    expect(result.success).toBe(false);
  });

  it('does not accept constructor as a handoff type', () => {
    const result = generateHandoff('constructor', '/tmp');
    expect(result.success).toBe(false);
  });
});

describe('listHandoffTypes', () => {
  it('returns all types with counts', () => {
    const result = listHandoffTypes();
    expect(result.success).toBe(true);
    expect(result.types.length).toBe(HANDOFF_TYPES.length);
    for (const t of result.types) {
      expect(t.required_count).toBeGreaterThan(0);
    }
  });

  it('includes labels for all types', () => {
    const result = listHandoffTypes();
    for (const t of result.types) {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});

describe('validateHandoff', () => {
  it('returns success false for unknown type', () => {
    const result = validateHandoff('bad', []);
    expect(result.success).toBe(false);
  });

  it('identifies missing required items', () => {
    const result = validateHandoff('product-to-engineering', []);
    expect(result.complete).toBe(false);
    expect((result.missing ?? []).length).toBeGreaterThan(0);
  });

  it('reports complete when all required provided', () => {
    const required = HANDOFF_CHECKLISTS['product-to-engineering'].required;
    const result = validateHandoff('product-to-engineering', [...required]);
    expect(result.complete).toBe(true);
    expect(result.coverage_pct).toBe(100);
  });

  it('handles null provided list', () => {
    const result = validateHandoff('engineering-to-qa', null);
    expect(result.success).toBe(true);
    expect(result.complete).toBe(false);
  });

  it('includes provided set in output', () => {
    const result = validateHandoff('engineering-to-ops', ['runbooks', 'deployment_guide']);
    expect(result.provided).toContain('runbooks');
  });

  it('coverage_pct is between 0 and 100', () => {
    const result = validateHandoff('ops-to-support', ['known_issues']);
    expect(result.coverage_pct ?? 0).toBeGreaterThanOrEqual(0);
    expect(result.coverage_pct ?? 0).toBeLessThanOrEqual(100);
  });

  // Pollution key tests
  it('does not accept __proto__ as type for validate', () => {
    const result = validateHandoff('__proto__', []);
    expect(result.success).toBe(false);
  });

  it('does not accept prototype as type for validate', () => {
    const result = validateHandoff('prototype', []);
    expect(result.success).toBe(false);
  });
});
