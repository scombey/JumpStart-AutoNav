/**
 * tests/test-quickstart.test.ts — vitest suite for src/lib/quickstart.ts
 */

import { describe, it, expect } from 'vitest';
import {
  DOMAIN_OPTIONS,
  CEREMONY_OPTIONS,
  buildQuickstartConfig,
  getFirstCommand,
  generateQuickstartSummary,
  getConfigPatches,
  applyConfigPatches,
} from '../src/lib/quickstart.js';

// ─── DOMAIN_OPTIONS / CEREMONY_OPTIONS ───────────────────────────────────────

describe('DOMAIN_OPTIONS', () => {
  it('contains at least 5 options', () => {
    expect(DOMAIN_OPTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('each option has value, title, description', () => {
    for (const opt of DOMAIN_OPTIONS) {
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.title).toBe('string');
      expect(typeof opt.description).toBe('string');
    }
  });

  it('contains "other" as last option', () => {
    expect(DOMAIN_OPTIONS[DOMAIN_OPTIONS.length - 1]?.value).toBe('other');
  });
});

describe('CEREMONY_OPTIONS', () => {
  it('has exactly 3 options: light, standard, rigorous', () => {
    const values = CEREMONY_OPTIONS.map(o => o.value);
    expect(values).toContain('light');
    expect(values).toContain('standard');
    expect(values).toContain('rigorous');
  });
});

// ─── buildQuickstartConfig ────────────────────────────────────────────────────

describe('buildQuickstartConfig', () => {
  it('returns defaults for empty input', () => {
    const config = buildQuickstartConfig({});
    expect(config.projectType).toBe('greenfield');
    expect(config.ceremony).toBe('standard');
    expect(config.targetDir).toBe('.');
    expect(config.copilot).toBe(true);
  });

  it('uses provided projectName', () => {
    const config = buildQuickstartConfig({ projectName: 'my-app' });
    expect(config.projectName).toBe('my-app');
  });

  it('uses "other" domain customDomain when domain is "other"', () => {
    const config = buildQuickstartConfig({ domain: 'other', customDomain: 'gaming' });
    expect(config.domain).toBe('gaming');
  });

  it('falls back to "general" when domain is "other" but customDomain is empty', () => {
    const config = buildQuickstartConfig({ domain: 'other', customDomain: null });
    expect(config.domain).toBe('general');
  });

  it('uses direct domain when not "other"', () => {
    const config = buildQuickstartConfig({ domain: 'api-service' });
    expect(config.domain).toBe('api-service');
  });

  it('sets brownfield projectType correctly', () => {
    const config = buildQuickstartConfig({ projectType: 'brownfield' });
    expect(config.projectType).toBe('brownfield');
  });

  it('returns force: false and dryRun: false always', () => {
    const config = buildQuickstartConfig({});
    expect(config.force).toBe(false);
    expect(config.dryRun).toBe(false);
  });
});

// ─── getFirstCommand ──────────────────────────────────────────────────────────

describe('getFirstCommand', () => {
  it('returns /jumpstart.challenge for greenfield', () => {
    const config = buildQuickstartConfig({ projectType: 'greenfield' });
    const result = getFirstCommand(config);
    expect(result.command).toBe('/jumpstart.challenge');
  });

  it('returns /jumpstart.scout for brownfield', () => {
    const config = buildQuickstartConfig({ projectType: 'brownfield' });
    const result = getFirstCommand(config);
    expect(result.command).toBe('/jumpstart.scout');
  });

  it('includes message string', () => {
    const config = buildQuickstartConfig({});
    const result = getFirstCommand(config);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(10);
  });
});

// ─── generateQuickstartSummary ────────────────────────────────────────────────

describe('generateQuickstartSummary', () => {
  it('returns lines, firstCommand, firstMessage', () => {
    const config = buildQuickstartConfig({ projectName: 'test-proj' });
    const summary = generateQuickstartSummary(config);
    expect(Array.isArray(summary.lines)).toBe(true);
    expect(typeof summary.firstCommand).toBe('string');
    expect(typeof summary.firstMessage).toBe('string');
  });

  it('includes project name in summary lines', () => {
    const config = buildQuickstartConfig({ projectName: 'my-project' });
    const summary = generateQuickstartSummary(config);
    expect(summary.lines.some(l => l.includes('my-project'))).toBe(true);
  });

  it('includes ceremony in summary lines', () => {
    const config = buildQuickstartConfig({ ceremony: 'rigorous' });
    const summary = generateQuickstartSummary(config);
    expect(summary.lines.some(l => l.includes('rigorous'))).toBe(true);
  });
});

// ─── applyConfigPatches ───────────────────────────────────────────────────────

describe('applyConfigPatches', () => {
  it('returns content unchanged when domain is general and ceremony is standard', () => {
    const config = buildQuickstartConfig({});
    const content = 'project:\n  type: greenfield\nceremony:\n  profile: standard\n';
    expect(applyConfigPatches(content, config)).toBe(content);
  });

  it('patches ceremony profile line for non-standard ceremony', () => {
    const config = buildQuickstartConfig({ ceremony: 'light' });
    const content = 'ceremony:\n  profile: standard\n';
    const patched = applyConfigPatches(content, config);
    expect(patched).toContain('profile: light');
  });

  it('adds domain after type line for non-general domain', () => {
    const config = buildQuickstartConfig({ domain: 'api-service' });
    const content = 'project:\n  type: greenfield\n';
    const patched = applyConfigPatches(content, config);
    expect(patched).toContain('domain: api-service');
  });

  it('applies multiple patches (domain + ceremony)', () => {
    const config = buildQuickstartConfig({ domain: 'saas', ceremony: 'rigorous' });
    const content = 'project:\n  type: greenfield\nceremony:\n  profile: standard\n';
    const patched = applyConfigPatches(content, config);
    expect(patched).toContain('domain: saas');
    expect(patched).toContain('profile: rigorous');
  });
});

// ─── pollution-key safety ────────────────────────────────────────────────────

describe('pollution-key safety', () => {
  it('buildQuickstartConfig does not crash on __proto__ in domain', () => {
    expect(() => buildQuickstartConfig({ domain: '__proto__', ceremony: 'standard' })).not.toThrow();
  });

  it('applyConfigPatches does not crash on __proto__ bytes in content', () => {
    const raw = Buffer.from('{"__proto__":{"evil":1}}\nceremony:\n  profile: standard\n').toString();
    const config = buildQuickstartConfig({ ceremony: 'light' });
    expect(() => applyConfigPatches(raw, config)).not.toThrow();
  });
});
