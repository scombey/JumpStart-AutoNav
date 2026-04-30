/**
 * tests/test-init.test.ts — vitest suite for src/lib/init.ts
 */

import { describe, expect, it } from 'vitest';
import { generateInitConfig, SKILL_PRESETS } from '../src/lib/init.js';

// ─── SKILL_PRESETS ────────────────────────────────────────────────────────────

describe('SKILL_PRESETS', () => {
  it('has presets for beginner, intermediate, expert', () => {
    expect(SKILL_PRESETS.beginner).toBeDefined();
    expect(SKILL_PRESETS.intermediate).toBeDefined();
    expect(SKILL_PRESETS.expert).toBeDefined();
  });

  it('beginner preset has detailed explanation depth', () => {
    expect(SKILL_PRESETS.beginner?.explanation_depth).toBe('detailed');
  });

  it('expert preset has minimal explanation depth', () => {
    expect(SKILL_PRESETS.expert?.explanation_depth).toBe('minimal');
  });

  it('beginner preset has auto_hints enabled', () => {
    expect(SKILL_PRESETS.beginner?.auto_hints).toBe(true);
  });

  it('expert preset has verbose_gates disabled', () => {
    expect(SKILL_PRESETS.expert?.verbose_gates).toBe(false);
  });
});

// ─── generateInitConfig ───────────────────────────────────────────────────────

describe('generateInitConfig', () => {
  it('uses intermediate as default skill level', () => {
    const result = generateInitConfig({});
    expect(result.skill_level).toBe('intermediate');
  });

  it('uses greenfield as default project type', () => {
    const result = generateInitConfig({});
    expect(result.project_type).toBe('greenfield');
  });

  it('normalizes skill level to lowercase', () => {
    const result = generateInitConfig({ skill_level: 'BEGINNER' });
    expect(result.skill_level).toBe('beginner');
  });

  it('returns detailed explanation depth for beginner', () => {
    const result = generateInitConfig({ skill_level: 'beginner' });
    expect(result.explanation_depth).toBe('detailed');
  });

  it('returns standard explanation depth for intermediate', () => {
    const result = generateInitConfig({ skill_level: 'intermediate' });
    expect(result.explanation_depth).toBe('standard');
  });

  it('returns minimal explanation depth for expert', () => {
    const result = generateInitConfig({ skill_level: 'expert' });
    expect(result.explanation_depth).toBe('minimal');
  });

  it('falls back to intermediate preset for unknown skill level', () => {
    const result = generateInitConfig({ skill_level: 'grandmaster' });
    expect(result.explanation_depth).toBe('standard');
  });

  it('includes recommendations array', () => {
    const result = generateInitConfig({ skill_level: 'beginner' });
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('includes config_overrides object', () => {
    const result = generateInitConfig({ skill_level: 'expert' });
    expect(typeof result.config_overrides).toBe('object');
    expect(result.config_overrides['workflow.explanation_level']).toBe('minimal');
  });

  it('adds brownfield recommendation first for brownfield project type', () => {
    const result = generateInitConfig({ skill_level: 'beginner', project_type: 'brownfield' });
    expect(result.recommendations[0]).toContain('jumpstart.scout');
  });

  it('adds additional brownfield recommendation at end for brownfield', () => {
    const result = generateInitConfig({ skill_level: 'beginner', project_type: 'brownfield' });
    const last = result.recommendations[result.recommendations.length - 1];
    expect(last).toContain('Scout output');
  });

  it('does not prepend brownfield recommendation for greenfield', () => {
    const result = generateInitConfig({ skill_level: 'beginner', project_type: 'greenfield' });
    expect(result.recommendations[0]).not.toContain('scout');
  });

  it('includes show_examples field', () => {
    const beginner = generateInitConfig({ skill_level: 'beginner' });
    const expert = generateInitConfig({ skill_level: 'expert' });
    expect(beginner.show_examples).toBe(true);
    expect(expert.show_examples).toBe(false);
  });

  it('brownfield project type is preserved in result', () => {
    const result = generateInitConfig({ project_type: 'brownfield' });
    expect(result.project_type).toBe('brownfield');
  });
});

// ─── pollution-key safety ────────────────────────────────────────────────────

describe('pollution-key safety', () => {
  it('generateInitConfig does not crash on __proto__ in skill_level string', () => {
    expect(() =>
      generateInitConfig({ skill_level: '__proto__', project_type: 'greenfield' })
    ).not.toThrow();
  });

  it('generateInitConfig does not crash on constructor in project_type string', () => {
    expect(() =>
      generateInitConfig({ skill_level: 'beginner', project_type: 'constructor' })
    ).not.toThrow();
  });
});
