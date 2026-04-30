/**
 * tests/test-handoff.test.ts — vitest suite for src/lib/handoff.ts
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  executeHandoff,
  getHandoff,
  isArtifactApproved,
  PHASE_MAP,
  setHandoffTimelineHook,
} from '../src/lib/handoff.js';

// ─── isArtifactApproved ───────────────────────────────────────────────────────

describe('isArtifactApproved', () => {
  it('returns false for empty string', () => {
    expect(isArtifactApproved('')).toBe(false);
  });

  it('returns false when Phase Gate Approval section is missing', () => {
    const content = '# Product Brief\n\nSome content here\n';
    expect(isArtifactApproved(content)).toBe(false);
  });

  it('returns false when Approved by is Pending', () => {
    const content = `# Brief\n\n## Phase Gate Approval\n\n**Approved by:** Pending\n\n- [x] Checked\n`;
    expect(isArtifactApproved(content)).toBe(false);
  });

  it('returns false when some checkboxes are unchecked', () => {
    const content = `# Brief\n\n## Phase Gate Approval\n\n**Approved by:** Sam\n\n- [x] Item 1\n- [ ] Item 2\n`;
    expect(isArtifactApproved(content)).toBe(false);
  });

  it('returns true when all checkboxes are checked and approved by is set', () => {
    const content = `# Brief\n\n## Phase Gate Approval\n\n**Approved by:** Sam\n\n- [x] Item 1\n- [x] Item 2\n`;
    expect(isArtifactApproved(content)).toBe(true);
  });

  it('returns true with no checkboxes but Approved by set (no items to fail)', () => {
    const content = `# Brief\n\n## Phase Gate Approval\n\n**Approved by:** Sam\n\nAll good.\n`;
    expect(isArtifactApproved(content)).toBe(true);
  });

  it('is case-insensitive for Phase Gate Approval header', () => {
    const content = `# Brief\n\n## phase gate approval\n\n**Approved by:** Sam\n\n- [x] Done\n`;
    expect(isArtifactApproved(content)).toBe(true);
  });

  it('returns false when Approved by is "pending" (lowercase)', () => {
    const content = `# Brief\n\n## Phase Gate Approval\n\n**Approved by:** pending\n`;
    expect(isArtifactApproved(content)).toBe(false);
  });
});

// ─── getHandoff ───────────────────────────────────────────────────────────────

describe('getHandoff', () => {
  it('returns error for unknown phase', () => {
    const result = getHandoff(99);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Unknown phase: 99');
    }
    expect(result.ready).toBe(false);
  });

  it('returns phase -1 handoff (Scout → Challenger)', () => {
    const result = getHandoff(-1);
    if ('error' in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.ready).toBe(true);
    expect(result.next_phase).toBe(0);
    expect(result.next_agent).toBe('challenger');
    expect(result.artifacts_to_create).toContain('specs/challenger-brief.md');
    expect(result.context_files).toContain('.jumpstart/config.yaml');
  });

  it('returns phase 0 handoff (Challenger → Analyst)', () => {
    const result = getHandoff(0);
    if ('error' in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.next_phase).toBe(1);
    expect(result.next_agent).toBe('analyst');
  });

  it('returns phase 1 handoff (Analyst → PM)', () => {
    const result = getHandoff(1);
    if ('error' in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.next_phase).toBe(2);
    expect(result.next_agent).toBe('pm');
    expect(result.context_files).toContain('specs/product-brief.md');
  });

  it('returns phase 2 handoff (PM → Architect)', () => {
    const result = getHandoff(2);
    if ('error' in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.next_phase).toBe(3);
    expect(result.next_agent).toBe('architect');
    expect(result.artifacts_to_create).toContain('specs/architecture.md');
  });

  it('returns phase 3 handoff (Architect → Developer)', () => {
    const result = getHandoff(3);
    if ('error' in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.next_phase).toBe(4);
    expect(result.next_agent).toBe('developer');
  });

  it('returns terminal state for phase 4 (Developer)', () => {
    const result = getHandoff(4);
    if ('error' in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.ready).toBe(false);
    expect(result.next_phase).toBeNull();
    expect(result.next_agent).toBeNull();
    expect(result.message).toContain('final phase');
  });

  it('includes current_name for known phases', () => {
    const result = getHandoff(2);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.current_name).toBe('PM');
  });

  it('includes current_phase in the result', () => {
    const result = getHandoff(1);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.current_phase).toBe(1);
  });
});

// ─── executeHandoff ───────────────────────────────────────────────────────────

describe('executeHandoff', () => {
  beforeEach(() => {
    setHandoffTimelineHook(null);
  });

  it('returns same result as getHandoff for valid phase', () => {
    const exec = executeHandoff(2);
    const get = getHandoff(2);
    expect(exec).toEqual(get);
  });

  it('returns same result as getHandoff for unknown phase', () => {
    const exec = executeHandoff(99);
    const get = getHandoff(99);
    expect(exec).toEqual(get);
  });

  it('records timeline event when hook is set and result is ready', () => {
    const events: unknown[] = [];
    setHandoffTimelineHook({
      recordEvent: (e) => {
        events.push(e);
      },
    });
    executeHandoff(1);
    expect(events.length).toBe(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev.event_type).toBe('handoff');
    expect(ev.phase).toBe(1);
  });

  it('does not record timeline event when result is not ready', () => {
    const events: unknown[] = [];
    setHandoffTimelineHook({
      recordEvent: (e) => {
        events.push(e);
      },
    });
    executeHandoff(4); // terminal phase
    expect(events.length).toBe(0);
  });

  it('does not crash when no timeline hook is set', () => {
    setHandoffTimelineHook(null);
    expect(() => executeHandoff(2)).not.toThrow();
  });

  it('timeline event action string references source and target phases', () => {
    const events: unknown[] = [];
    setHandoffTimelineHook({
      recordEvent: (e) => {
        events.push(e);
      },
    });
    executeHandoff(2);
    const ev = events[0] as Record<string, unknown>;
    expect(String(ev.action)).toContain('Phase 2');
    expect(String(ev.action)).toContain('Phase 3');
  });
});

// ─── PHASE_MAP completeness ───────────────────────────────────────────────────

describe('PHASE_MAP', () => {
  it('has entries for phases -1 through 4', () => {
    ['-1', '0', '1', '2', '3', '4'].forEach((key) => {
      expect(PHASE_MAP[key]).toBeDefined();
    });
  });

  it('all non-terminal phases have non-null next_agent', () => {
    ['-1', '0', '1', '2', '3'].forEach((key) => {
      expect(PHASE_MAP[key]?.next_agent).not.toBeNull();
    });
  });

  it('terminal phase 4 has null next_phase and next_agent', () => {
    expect(PHASE_MAP['4']?.next_phase).toBeNull();
    expect(PHASE_MAP['4']?.next_agent).toBeNull();
  });
});

// ─── pollution-key safety ────────────────────────────────────────────────────

describe('pollution-key safety', () => {
  it('isArtifactApproved does not crash on __proto__ bytes in content', () => {
    const raw = Buffer.from(
      '{"__proto__":{"evil":1}} ## Phase Gate Approval\n**Approved by:** Sam\n'
    ).toString();
    expect(() => isArtifactApproved(raw)).not.toThrow();
  });

  it('getHandoff does not crash on NaN input', () => {
    expect(() => getHandoff(NaN)).not.toThrow();
  });
});
