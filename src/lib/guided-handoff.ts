/**
 * guided-handoff.ts — Guided Handoff Packages port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/guided-handoff.js` (CJS) to a typed ES
 * module. Public surface preserved verbatim by name + signature:
 *
 *   - `generateHandoff(type, root, options?)` => HandoffResult
 *   - `listHandoffTypes()` => ListHandoffTypesResult
 *   - `validateHandoff(type, provided, options?)` => ValidateHandoffResult
 *   - `HANDOFF_TYPES` (frozen list)
 *   - `HANDOFF_CHECKLISTS` (typed map)
 *
 * M3 hardening:
 *   - No JSON parse paths — module is stateless (no state file).
 *     Not applicable for prototype-pollution check.
 *
 * Path-safety per ADR-009:
 *   - No user-supplied paths used in file I/O. Not applicable.
 *
 * @see bin/lib/guided-handoff.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

export const HANDOFF_TYPES = [
  'product-to-engineering',
  'engineering-to-qa',
  'engineering-to-ops',
  'ops-to-support',
] as const;

export type HandoffType = (typeof HANDOFF_TYPES)[number];

export interface HandoffChecklist {
  label: string;
  required: string[];
  optional: string[];
}

export const HANDOFF_CHECKLISTS: Record<HandoffType, HandoffChecklist> = {
  'product-to-engineering': {
    label: 'Product → Engineering',
    required: [
      'user_stories',
      'acceptance_criteria',
      'wireframes',
      'priorities',
      'scope_boundaries',
    ],
    optional: ['competitive_analysis', 'analytics_requirements', 'feature_flags'],
  },
  'engineering-to-qa': {
    label: 'Engineering → QA',
    required: ['test_plan', 'api_contracts', 'environment_setup', 'known_limitations', 'test_data'],
    optional: ['performance_baselines', 'security_considerations', 'rollback_procedures'],
  },
  'engineering-to-ops': {
    label: 'Engineering → Ops',
    required: [
      'deployment_guide',
      'runbooks',
      'monitoring_config',
      'rollback_procedures',
      'dependencies',
    ],
    optional: ['load_test_results', 'capacity_planning', 'dr_procedures'],
  },
  'ops-to-support': {
    label: 'Ops → Support',
    required: ['known_issues', 'troubleshooting_guide', 'escalation_paths', 'sla_details', 'faq'],
    optional: ['common_errors', 'workarounds', 'release_notes'],
  },
};

export interface HandoffItem {
  name: string;
  required: boolean;
  status: 'provided' | 'missing' | 'not_provided';
}

export interface HandoffResult {
  success: boolean;
  type?: HandoffType;
  label?: string;
  items?: HandoffItem[];
  complete?: boolean;
  missing_required?: string[];
  generated_at?: string;
  error?: string;
}

export interface ListHandoffTypesResult {
  success: true;
  types: Array<{ id: HandoffType; label: string; required_count: number; optional_count: number }>;
}

export interface ValidateHandoffResult {
  success: boolean;
  type?: HandoffType;
  complete?: boolean;
  coverage_pct?: number;
  missing?: string[];
  provided?: string[];
  error?: string;
}

/**
 * Generate a handoff package.
 */
export function generateHandoff(
  type: string,
  _root: string,
  options: Record<string, unknown> = {}
): HandoffResult {
  if (!HANDOFF_TYPES.includes(type as HandoffType)) {
    return {
      success: false,
      error: `Unknown handoff type: ${type}. Valid: ${HANDOFF_TYPES.join(', ')}`,
    };
  }

  const handoffType = type as HandoffType;
  const checklist = HANDOFF_CHECKLISTS[handoffType];
  const items: HandoffItem[] = [];

  for (const req of checklist.required) {
    items.push({ name: req, required: true, status: options[req] ? 'provided' : 'missing' });
  }
  for (const opt of checklist.optional) {
    items.push({ name: opt, required: false, status: options[opt] ? 'provided' : 'not_provided' });
  }

  const missing = items.filter((i) => i.required && i.status === 'missing');

  return {
    success: true,
    type: handoffType,
    label: checklist.label,
    items,
    complete: missing.length === 0,
    missing_required: missing.map((i) => i.name),
    generated_at: new Date().toISOString(),
  };
}

/**
 * List available handoff types.
 */
export function listHandoffTypes(): ListHandoffTypesResult {
  return {
    success: true,
    types: HANDOFF_TYPES.map((t) => ({
      id: t,
      label: HANDOFF_CHECKLISTS[t].label,
      required_count: HANDOFF_CHECKLISTS[t].required.length,
      optional_count: HANDOFF_CHECKLISTS[t].optional.length,
    })),
  };
}

/**
 * Validate a handoff package completeness.
 */
export function validateHandoff(
  type: string,
  provided: string[] | undefined | null,
  _options: Record<string, unknown> = {}
): ValidateHandoffResult {
  if (!HANDOFF_TYPES.includes(type as HandoffType)) {
    return { success: false, error: `Unknown handoff type: ${type}` };
  }

  const handoffType = type as HandoffType;
  const checklist = HANDOFF_CHECKLISTS[handoffType];
  const providedSet = new Set(provided ?? []);
  const missing = checklist.required.filter((r) => !providedSet.has(r));
  const coverage =
    checklist.required.length > 0
      ? Math.round(((checklist.required.length - missing.length) / checklist.required.length) * 100)
      : 100;

  return {
    success: true,
    type: handoffType,
    complete: missing.length === 0,
    coverage_pct: coverage,
    missing,
    provided: [...providedSet],
  };
}
