/**
 * persona-packs.ts — Persona pack registry port (M11 batch 1).
 *
 * Pure-library port of `bin/lib/persona-packs.js`. Public surface
 * preserved verbatim by name + signature:
 *
 *   - `listPersonas()` => ListPersonasResult
 *   - `getPersona(personaId)` => GetPersonaResult
 *   - `applyPersona(personaId, options?)` => ApplyPersonaResult
 *   - `PERSONAS` (string[]), `PERSONA_CATALOG` (record)
 *
 * Behavior parity:
 *   - Static, in-memory catalog of 7 enterprise personas. No fs, no
 *     state files.
 *   - Unknown-persona error message format matches legacy verbatim.
 *
 * @see bin/lib/persona-packs.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

export interface PersonaDefinition {
  label: string;
  focus: string[];
  artifacts: string[];
  tools: string[];
}

export const PERSONA_CATALOG: Record<string, PersonaDefinition> = {
  'business-analyst': {
    label: 'Business Analyst',
    focus: ['requirements', 'process-modeling', 'stakeholder-management', 'data-analysis'],
    artifacts: ['product-brief', 'prd', 'process-maps'],
    tools: ['elicitation', 'estimation', 'ambiguity-heatmap'],
  },
  'product-owner': {
    label: 'Product Owner',
    focus: ['backlog', 'prioritization', 'user-stories', 'acceptance-criteria'],
    artifacts: ['prd', 'product-brief', 'backlog'],
    tools: ['estimation', 'playback-summaries', 'handoff'],
  },
  architect: {
    label: 'Architect',
    focus: ['system-design', 'tech-stack', 'nfrs', 'data-modeling'],
    artifacts: ['architecture', 'decisions', 'diagrams'],
    tools: ['diagram-studio', 'reference-arch', 'fitness-functions'],
  },
  'security-lead': {
    label: 'Security Lead',
    focus: ['threat-modeling', 'compliance', 'access-control', 'data-protection'],
    artifacts: ['security-review', 'compliance-report', 'threat-model'],
    tools: ['credential-boundary', 'data-classification', 'compliance-packs'],
  },
  'platform-engineer': {
    label: 'Platform Engineer',
    focus: ['infrastructure', 'ci-cd', 'golden-paths', 'developer-experience'],
    artifacts: ['deployment-guide', 'platform-config', 'runbooks'],
    tools: ['ci-cd-integration', 'env-promotion', 'platform-engineering'],
  },
  sre: {
    label: 'Site Reliability Engineer',
    focus: ['monitoring', 'incident-response', 'sla-slo', 'capacity-planning'],
    artifacts: ['runbooks', 'sla-report', 'incident-log'],
    tools: ['sla-slo', 'incident-feedback', 'ops-ownership'],
  },
  'data-steward': {
    label: 'Data Steward',
    focus: ['data-governance', 'data-quality', 'lineage', 'classification'],
    artifacts: ['data-catalog', 'classification-report', 'lineage-map'],
    tools: ['data-classification', 'data-contracts', 'domain-ontology'],
  },
};

export const PERSONAS: string[] = Object.keys(PERSONA_CATALOG);

export interface ListedPersona {
  id: string;
  label: string;
  focus_count: number;
  tools_count: number;
}

export interface ListPersonasResult {
  success: true;
  personas: ListedPersona[];
}

export interface GetPersonaResultSuccess {
  success: true;
  persona: PersonaDefinition & { id: string };
}
export interface GetPersonaResultFailure {
  success: false;
  error: string;
}
export type GetPersonaResult = GetPersonaResultSuccess | GetPersonaResultFailure;

export interface ApplyPersonaResultSuccess {
  success: true;
  persona_id: string;
  label: string;
  recommended_tools: string[];
  relevant_artifacts: string[];
  focus_areas: string[];
  applied_at: string;
}
export interface ApplyPersonaResultFailure {
  success: false;
  error: string;
}
export type ApplyPersonaResult = ApplyPersonaResultSuccess | ApplyPersonaResultFailure;

export function listPersonas(): ListPersonasResult {
  return {
    success: true,
    personas: PERSONAS.map((p) => ({
      id: p,
      label: PERSONA_CATALOG[p].label,
      focus_count: PERSONA_CATALOG[p].focus.length,
      tools_count: PERSONA_CATALOG[p].tools.length,
    })),
  };
}

export function getPersona(personaId: string): GetPersonaResult {
  if (!PERSONA_CATALOG[personaId]) {
    return {
      success: false,
      error: `Unknown persona: ${personaId}. Valid: ${PERSONAS.join(', ')}`,
    };
  }
  return { success: true, persona: { id: personaId, ...PERSONA_CATALOG[personaId] } };
}

export function applyPersona(
  personaId: string,
  _options: Record<string, unknown> = {}
): ApplyPersonaResult {
  if (!PERSONA_CATALOG[personaId]) {
    return { success: false, error: `Unknown persona: ${personaId}` };
  }

  const persona = PERSONA_CATALOG[personaId];
  return {
    success: true,
    persona_id: personaId,
    label: persona.label,
    recommended_tools: persona.tools,
    relevant_artifacts: persona.artifacts,
    focus_areas: persona.focus,
    applied_at: new Date().toISOString(),
  };
}
