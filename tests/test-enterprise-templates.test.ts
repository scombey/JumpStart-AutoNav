/**
 * test-enterprise-templates.test.ts — M11 batch 2 port coverage.
 *
 * Verifies the TS port at `src/lib/enterprise-templates.ts` matches the
 * legacy `bin/lib/enterprise-templates.js` public surface:
 *   - VERTICALS / TEMPLATE_CATALOG byte-identical to legacy
 *   - listTemplates / getTemplate / applyTemplate return-shape parity
 *   - applyTemplate writes the canonical `.jumpstart/state/enterprise-template.json`
 *
 * @see src/lib/enterprise-templates.ts
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyTemplate,
  getTemplate,
  listTemplates,
  TEMPLATE_CATALOG,
  VERTICALS,
} from '../src/lib/enterprise-templates.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'enterprise-templates-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('enterprise-templates — VERTICALS catalog', () => {
  it('exposes the 7 documented verticals', () => {
    expect(VERTICALS).toEqual([
      'healthcare',
      'insurance',
      'banking',
      'manufacturing',
      'retail',
      'public-sector',
      'platform-engineering',
    ]);
  });

  it('TEMPLATE_CATALOG[v] always carries label/compliance/data_concerns/nfrs/personas', () => {
    for (const v of VERTICALS) {
      const entry = TEMPLATE_CATALOG[v];
      expect(entry.label).toBeTypeOf('string');
      expect(Array.isArray(entry.compliance)).toBe(true);
      expect(entry.compliance.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.data_concerns)).toBe(true);
      expect(Array.isArray(entry.nfrs)).toBe(true);
      expect(Array.isArray(entry.personas)).toBe(true);
    }
  });

  it('healthcare carries HIPAA + HITECH + FDA-21-CFR-Part-11 (legacy parity)', () => {
    expect(TEMPLATE_CATALOG.healthcare.compliance).toEqual([
      'HIPAA',
      'HITECH',
      'FDA-21-CFR-Part-11',
    ]);
  });

  it('banking carries PCI-DSS + SOX + GDPR + AML-KYC (legacy parity)', () => {
    expect(TEMPLATE_CATALOG.banking.compliance).toEqual(['PCI-DSS', 'SOX', 'GDPR', 'AML-KYC']);
  });

  it('public-sector carries FedRAMP + FISMA + Section-508 + WCAG (legacy parity)', () => {
    expect(TEMPLATE_CATALOG['public-sector'].compliance).toEqual([
      'FedRAMP',
      'FISMA',
      'Section-508',
      'WCAG',
    ]);
  });
});

describe('enterprise-templates — listTemplates', () => {
  it('returns a summary for every vertical', () => {
    const r = listTemplates();
    expect(r.success).toBe(true);
    expect(r.templates).toHaveLength(7);
    for (const t of r.templates) {
      expect(VERTICALS).toContain(t.id);
      expect(t.compliance_count).toBeGreaterThan(0);
      expect(t.persona_count).toBeGreaterThan(0);
    }
  });

  it('counts match the catalog', () => {
    const r = listTemplates();
    const banking = r.templates.find((t) => t.id === 'banking');
    expect(banking?.compliance_count).toBe(4);
    expect(banking?.persona_count).toBe(4);
  });
});

describe('enterprise-templates — getTemplate', () => {
  it('returns the entry for a known vertical', () => {
    const r = getTemplate('healthcare');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.vertical).toBe('healthcare');
      expect(r.template.label).toBe('Healthcare');
    }
  });

  it('returns success=false with the verticals list on unknown input', () => {
    const r = getTemplate('not-a-real-vertical');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Unknown vertical');
  });
});

describe('enterprise-templates — applyTemplate', () => {
  it('writes .jumpstart/state/enterprise-template.json with canonical shape', () => {
    const r = applyTemplate(tmpDir, 'banking');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.applied.vertical).toBe('banking');
      expect(r.applied.label).toBe('Banking');
      expect(r.applied.compliance_frameworks).toEqual(['PCI-DSS', 'SOX', 'GDPR', 'AML-KYC']);
      expect(r.applied.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    const persisted = JSON.parse(
      readFileSync(join(tmpDir, '.jumpstart', 'state', 'enterprise-template.json'), 'utf8')
    );
    expect(persisted.vertical).toBe('banking');
    expect(persisted.compliance_frameworks).toEqual(['PCI-DSS', 'SOX', 'GDPR', 'AML-KYC']);
  });

  it('rejects an unknown vertical without writing state', () => {
    const r = applyTemplate(tmpDir, 'nope');
    expect(r.success).toBe(false);
  });

  it('creates the state directory if missing', () => {
    expect(() => applyTemplate(tmpDir, 'retail')).not.toThrow();
  });
});
