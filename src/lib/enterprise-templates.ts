/**
 * enterprise-templates.ts — Industry-vertical template catalog port (M11 batch 2).
 *
 * Pure-library port of `bin/lib/enterprise-templates.js`. Public surface
 * preserved verbatim:
 *
 *   - `listTemplates()` => ListTemplatesResult
 *   - `getTemplate(vertical)` => GetTemplateResult
 *   - `applyTemplate(root, vertical, options?)` => ApplyTemplateResult
 *   - `VERTICALS`, `TEMPLATE_CATALOG`
 *
 * Behavior parity:
 *   - Same 7 verticals (healthcare, insurance, banking, manufacturing,
 *     retail, public-sector, platform-engineering).
 *   - `applyTemplate` writes `.jumpstart/state/enterprise-template.json`
 *     with the same shape (vertical, label, compliance_frameworks,
 *     data_concerns, nfr_requirements, personas, applied_at).
 *
 * @see bin/lib/enterprise-templates.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const VERTICALS = [
  'healthcare',
  'insurance',
  'banking',
  'manufacturing',
  'retail',
  'public-sector',
  'platform-engineering',
] as const;

export type Vertical = (typeof VERTICALS)[number];

export interface TemplateEntry {
  label: string;
  compliance: string[];
  data_concerns: string[];
  nfrs: string[];
  personas: string[];
}

export const TEMPLATE_CATALOG: Record<Vertical, TemplateEntry> = {
  healthcare: {
    label: 'Healthcare',
    compliance: ['HIPAA', 'HITECH', 'FDA-21-CFR-Part-11'],
    data_concerns: ['PHI', 'patient-consent', 'de-identification'],
    nfrs: ['audit-trail', 'data-encryption-at-rest', 'access-control'],
    personas: ['clinician', 'patient', 'admin', 'compliance-officer'],
  },
  insurance: {
    label: 'Insurance',
    compliance: ['SOC2', 'state-regulations', 'NAIC'],
    data_concerns: ['PII', 'claims-data', 'underwriting-models'],
    nfrs: ['audit-trail', 'data-retention', 'fraud-detection'],
    personas: ['policyholder', 'agent', 'underwriter', 'claims-adjuster'],
  },
  banking: {
    label: 'Banking',
    compliance: ['PCI-DSS', 'SOX', 'GDPR', 'AML-KYC'],
    data_concerns: ['PII', 'transaction-data', 'account-info'],
    nfrs: ['encryption', 'audit-trail', 'multi-factor-auth'],
    personas: ['customer', 'teller', 'relationship-manager', 'risk-officer'],
  },
  manufacturing: {
    label: 'Manufacturing',
    compliance: ['ISO-9001', 'ISO-27001'],
    data_concerns: ['IoT-sensor-data', 'supply-chain', 'quality-metrics'],
    nfrs: ['real-time-processing', 'edge-computing', 'uptime-sla'],
    personas: ['plant-manager', 'operator', 'quality-engineer', 'supply-chain-manager'],
  },
  retail: {
    label: 'Retail',
    compliance: ['PCI-DSS', 'CCPA', 'GDPR'],
    data_concerns: ['customer-data', 'payment-info', 'inventory'],
    nfrs: ['scalability', 'low-latency', 'high-availability'],
    personas: ['shopper', 'store-manager', 'merchandiser', 'support-agent'],
  },
  'public-sector': {
    label: 'Public Sector',
    compliance: ['FedRAMP', 'FISMA', 'Section-508', 'WCAG'],
    data_concerns: ['citizen-data', 'classified-info', 'FOIA'],
    nfrs: ['accessibility', 'audit-trail', 'data-sovereignty'],
    personas: ['citizen', 'case-worker', 'agency-admin', 'auditor'],
  },
  'platform-engineering': {
    label: 'Internal Platform Engineering',
    compliance: ['SOC2', 'internal-governance'],
    data_concerns: ['service-configs', 'deployment-state', 'metrics'],
    nfrs: ['self-service', 'golden-paths', 'developer-experience'],
    personas: ['platform-engineer', 'app-developer', 'sre', 'security-engineer'],
  },
};

export interface TemplateSummary {
  id: Vertical;
  label: string;
  compliance_count: number;
  persona_count: number;
}

export interface ListTemplatesResult {
  success: true;
  verticals: readonly Vertical[];
  templates: TemplateSummary[];
}

export type GetTemplateResult =
  | { success: true; vertical: Vertical; template: TemplateEntry }
  | { success: false; error: string };

export interface AppliedTemplate {
  vertical: Vertical;
  label: string;
  compliance_frameworks: string[];
  data_concerns: string[];
  nfr_requirements: string[];
  personas: string[];
  applied_at: string;
}

export type ApplyTemplateResult =
  | { success: true; applied: AppliedTemplate }
  | { success: false; error: string };

function isVertical(value: string): value is Vertical {
  return (VERTICALS as readonly string[]).includes(value);
}

export function listTemplates(): ListTemplatesResult {
  return {
    success: true,
    verticals: VERTICALS,
    templates: VERTICALS.map((v) => ({
      id: v,
      label: TEMPLATE_CATALOG[v].label,
      compliance_count: TEMPLATE_CATALOG[v].compliance.length,
      persona_count: TEMPLATE_CATALOG[v].personas.length,
    })),
  };
}

export function getTemplate(vertical: string): GetTemplateResult {
  if (!isVertical(vertical)) {
    return {
      success: false,
      error: `Unknown vertical: ${vertical}. Valid: ${VERTICALS.join(', ')}`,
    };
  }
  return { success: true, vertical, template: TEMPLATE_CATALOG[vertical] };
}

export interface ApplyTemplateOptions {
  /** Reserved — legacy accepted but never used. Kept for API parity. */
  stateFile?: string | undefined;
}

export function applyTemplate(
  root: string,
  vertical: string,
  _options: ApplyTemplateOptions = {}
): ApplyTemplateResult {
  if (!isVertical(vertical)) {
    return {
      success: false,
      error: `Unknown vertical: ${vertical}. Valid: ${VERTICALS.join(', ')}`,
    };
  }

  const template = TEMPLATE_CATALOG[vertical];
  const applied: AppliedTemplate = {
    vertical,
    label: template.label,
    compliance_frameworks: template.compliance,
    data_concerns: template.data_concerns,
    nfr_requirements: template.nfrs,
    personas: template.personas,
    applied_at: new Date().toISOString(),
  };

  const stateDir = join(root, '.jumpstart', 'state');
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    join(stateDir, 'enterprise-template.json'),
    `${JSON.stringify(applied, null, 2)}\n`,
    'utf8'
  );

  return { success: true, applied };
}
