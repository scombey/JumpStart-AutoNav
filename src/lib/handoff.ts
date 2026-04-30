/**
 * handoff.ts -- Auto-Handoff Logic (Item 37).
 *
 * After a phase artifact is approved, determines the next phase's
 * artifacts and agent context automatically.
 *
 * M3 hardening: no JSON state -- pure in-memory data.
 * ADR-006: no process.exit.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhaseTransition {
  name: string;
  artifact: string | null;
  next_phase: number | null;
  next_agent: string | null;
  next_artifacts: string[];
  next_context: string[];
}

export interface HandoffResult {
  current_phase: number;
  current_name?: string | undefined;
  next_phase: number | null;
  next_agent: string | null;
  artifacts_to_create?: string[] | undefined;
  context_files?: string[] | undefined;
  message?: string | undefined;
  error?: string | undefined;
  ready: boolean;
}

export interface HandoffErrorResult {
  error: string;
  ready: false;
}

// ─── Timeline Hook ────────────────────────────────────────────────────────────

interface TimelineHook {
  recordEvent(event: {
    event_type: string;
    phase: number;
    action: string;
    metadata: Record<string, unknown>;
  }): void;
}

let _timelineHook: TimelineHook | null = null;

/**
 * Set the timeline instance for recording handoff events.
 */
export function setHandoffTimelineHook(timeline: TimelineHook | null): void {
  _timelineHook = timeline;
}

// ─── Phase Map ────────────────────────────────────────────────────────────────

/**
 * Phase transition map.
 * Each phase defines what artifacts and context the next phase needs.
 */
export const PHASE_MAP: Record<string, PhaseTransition> = {
  '-1': {
    name: 'Scout',
    artifact: 'specs/codebase-context.md',
    next_phase: 0,
    next_agent: 'challenger',
    next_artifacts: ['specs/challenger-brief.md', 'specs/insights/challenger-brief-insights.md'],
    next_context: ['.jumpstart/config.yaml', '.jumpstart/roadmap.md', 'specs/codebase-context.md']
  },
  '0': {
    name: 'Challenger',
    artifact: 'specs/challenger-brief.md',
    next_phase: 1,
    next_agent: 'analyst',
    next_artifacts: ['specs/product-brief.md', 'specs/insights/product-brief-insights.md'],
    next_context: ['.jumpstart/config.yaml', '.jumpstart/roadmap.md', 'specs/challenger-brief.md']
  },
  '1': {
    name: 'Analyst',
    artifact: 'specs/product-brief.md',
    next_phase: 2,
    next_agent: 'pm',
    next_artifacts: ['specs/prd.md', 'specs/insights/prd-insights.md'],
    next_context: ['.jumpstart/config.yaml', '.jumpstart/roadmap.md', 'specs/challenger-brief.md', 'specs/product-brief.md']
  },
  '2': {
    name: 'PM',
    artifact: 'specs/prd.md',
    next_phase: 3,
    next_agent: 'architect',
    next_artifacts: ['specs/architecture.md', 'specs/implementation-plan.md', 'specs/insights/architecture-insights.md'],
    next_context: ['.jumpstart/config.yaml', '.jumpstart/roadmap.md', 'specs/challenger-brief.md', 'specs/product-brief.md', 'specs/prd.md']
  },
  '3': {
    name: 'Architect',
    artifact: 'specs/architecture.md',
    next_phase: 4,
    next_agent: 'developer',
    next_artifacts: ['specs/insights/implementation-insights.md'],
    next_context: ['.jumpstart/config.yaml', '.jumpstart/roadmap.md', 'specs/prd.md', 'specs/architecture.md', 'specs/implementation-plan.md']
  },
  '4': {
    name: 'Developer',
    artifact: null,
    next_phase: null,
    next_agent: null,
    next_artifacts: [],
    next_context: []
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if an artifact is approved by scanning for Phase Gate approval markers.
 */
export function isArtifactApproved(content: string): boolean {
  if (!content) return false;
  const hasGateSection = /## Phase Gate Approval/i.test(content);
  if (!hasGateSection) return false;

  // Check that "Approved by" is not "Pending"
  const approvedByMatch = content.match(/\*\*Approved by:\*\*\s*(.+)/i);
  if (!approvedByMatch || (approvedByMatch[1] ?? '').trim().toLowerCase() === 'pending') return false;

  // Check all checkboxes are checked
  const gateSection = content.split(/## Phase Gate Approval/i)[1] ?? '';
  const unchecked = gateSection.match(/- \[ \]/g);
  return !unchecked || unchecked.length === 0;
}

/**
 * Determine the next phase handoff from a given phase.
 */
export function getHandoff(currentPhase: number): HandoffResult | HandoffErrorResult {
  const key = String(currentPhase);
  const transition = PHASE_MAP[key];

  if (!transition) {
    return { error: `Unknown phase: ${currentPhase}`, ready: false };
  }

  if (transition.next_phase === null) {
    return {
      current_phase: currentPhase,
      next_phase: null,
      next_agent: null,
      message: 'Phase 4 is the final phase. No further handoff needed.',
      ready: false
    };
  }

  return {
    current_phase: currentPhase,
    current_name: transition.name,
    next_phase: transition.next_phase,
    next_agent: transition.next_agent,
    artifacts_to_create: transition.next_artifacts,
    context_files: transition.next_context,
    ready: true
  };
}

/**
 * Execute a handoff and record it in the timeline.
 */
export function executeHandoff(currentPhase: number): HandoffResult | HandoffErrorResult {
  const result = getHandoff(currentPhase);

  if ('ready' in result && result.ready && _timelineHook) {
    const r = result as HandoffResult;
    _timelineHook.recordEvent({
      event_type: 'handoff',
      phase: currentPhase,
      action: `Handoff: Phase ${currentPhase} (${r.current_name}) → Phase ${r.next_phase} (${r.next_agent})`,
      metadata: {
        source_phase: currentPhase,
        target_phase: r.next_phase,
        next_agent: r.next_agent,
        context_files: r.context_files
      }
    });
  }

  return result;
}
