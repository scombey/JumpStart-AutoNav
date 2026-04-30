/**
 * test-persona-packs.test.ts — M11 batch 1 port coverage.
 *
 * Verifies the TS port at `src/lib/persona-packs.ts` matches the legacy
 * `bin/lib/persona-packs.js` public surface:
 *   - listPersonas / getPersona / applyPersona return-shape parity
 *   - PERSONAS / PERSONA_CATALOG byte-identical to legacy
 *
 * @see src/lib/persona-packs.ts
 * @see bin/lib/persona-packs.js (legacy reference)
 */

import { describe, expect, it } from 'vitest';
import {
  applyPersona,
  getPersona,
  listPersonas,
  PERSONA_CATALOG,
  PERSONAS,
} from '../src/lib/persona-packs.js';
import { expectDefined } from './_helpers.js';

describe('persona-packs — PERSONAS catalog', () => {
  it('exposes the 7 documented personas', () => {
    expect(PERSONAS.length).toBe(7);
    expect(PERSONAS).toContain('business-analyst');
    expect(PERSONAS).toContain('product-owner');
    expect(PERSONAS).toContain('architect');
    expect(PERSONAS).toContain('security-lead');
    expect(PERSONAS).toContain('platform-engineer');
    expect(PERSONAS).toContain('sre');
    expect(PERSONAS).toContain('data-steward');
  });

  it('PERSONA_CATALOG[id] always carries label, focus, artifacts, tools', () => {
    for (const id of PERSONAS) {
      const entry = PERSONA_CATALOG[id];
      expectDefined(entry);
      expect(entry.label).toBeTypeOf('string');
      expect(Array.isArray(entry.focus)).toBe(true);
      expect(Array.isArray(entry.artifacts)).toBe(true);
      expect(Array.isArray(entry.tools)).toBe(true);
    }
  });

  it('architect entry matches legacy contents', () => {
    expectDefined(PERSONA_CATALOG.architect);
    expect(PERSONA_CATALOG.architect.label).toBe('Architect');
    expect(PERSONA_CATALOG.architect.focus).toEqual([
      'system-design',
      'tech-stack',
      'nfrs',
      'data-modeling',
    ]);
  });
});

describe('persona-packs — listPersonas', () => {
  it('returns success and 7 entries', () => {
    const result = listPersonas();
    expect(result.success).toBe(true);
    expect(result.personas.length).toBe(7);
  });

  it('each entry has id, label, focus_count, tools_count', () => {
    const result = listPersonas();
    for (const p of result.personas) {
      expect(p.id).toBeTypeOf('string');
      expect(p.label).toBeTypeOf('string');
      expect(p.focus_count).toBeGreaterThan(0);
      expect(p.tools_count).toBeGreaterThan(0);
    }
  });

  it('focus_count matches actual focus array length', () => {
    const result = listPersonas();
    const ba = result.personas.find((p) => p.id === 'business-analyst');
    expectDefined(PERSONA_CATALOG['business-analyst']);
    expect(ba?.focus_count).toBe(PERSONA_CATALOG['business-analyst'].focus.length);
  });
});

describe('persona-packs — getPersona', () => {
  it('returns the persona on a known id', () => {
    const result = getPersona('architect');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.persona.id).toBe('architect');
      expect(result.persona.label).toBe('Architect');
      expect(result.persona.focus).toContain('system-design');
    }
  });

  it('rejects an unknown persona with the legacy error message', () => {
    const result = getPersona('not-a-persona');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Unknown persona: not-a-persona');
      expect(result.error).toContain('Valid:');
    }
  });

  it('error lists the valid persona ids', () => {
    const result = getPersona('xx');
    if (!result.success) {
      for (const id of PERSONAS) expect(result.error).toContain(id);
    }
  });
});

describe('persona-packs — applyPersona', () => {
  it('returns recommendations on a known id', () => {
    const result = applyPersona('platform-engineer');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.persona_id).toBe('platform-engineer');
      expect(result.label).toBe('Platform Engineer');
      expect(result.recommended_tools).toContain('ci-cd-integration');
      expect(result.relevant_artifacts).toContain('platform-config');
      expect(result.focus_areas).toContain('infrastructure');
      expect(result.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('rejects an unknown persona', () => {
    const result = applyPersona('does-not-exist');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Unknown persona: does-not-exist');
    }
  });

  it('accepts an options object as second arg (legacy parity)', () => {
    const result = applyPersona('sre', { context: 'ignored' });
    expect(result.success).toBe(true);
  });
});
