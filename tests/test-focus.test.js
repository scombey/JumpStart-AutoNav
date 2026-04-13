/**
 * test-focus.test.js — Tests for Phase Focus Mode
 *
 * Tests for bin/lib/focus.js covering:
 * - Preset listing and retrieval
 * - Phase range validation
 * - Focus config building (preset and custom)
 * - isPhaseInFocus checks
 * - Config read/write round-trip
 * - Focus-aware next-phase integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Helper: create a temporary project directory
function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpstart-focus-test-'));
  fs.mkdirSync(path.join(tmpDir, '.jumpstart', 'state'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'specs'), { recursive: true });
  return tmpDir;
}

// Helper: write a minimal config.yaml
function writeConfig(tmpDir, overrides = {}) {
  const config = {
    project: { type: overrides.projectType || 'greenfield', name: 'test' },
    workflow: { require_gate_approval: true, ...overrides.workflow },
    ...overrides
  };
  const lines = [];
  function writeObj(obj, indent = 0) {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        lines.push(' '.repeat(indent) + `${key}:`);
        writeObj(value, indent + 2);
      } else {
        lines.push(' '.repeat(indent) + `${key}: ${value}`);
      }
    }
  }
  writeObj(config);
  return fs.writeFileSync(path.join(tmpDir, '.jumpstart', 'config.yaml'), lines.join('\n'), 'utf8');
}

// Helper: write state.json
function writeState(tmpDir, state) {
  fs.writeFileSync(
    path.join(tmpDir, '.jumpstart', 'state', 'state.json'),
    JSON.stringify(state, null, 2),
    'utf8'
  );
}

// Helper: write a spec artifact with approval status
function writeArtifact(tmpDir, relPath, approved = false) {
  const fullPath = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const approvalSection = approved
    ? `## Phase Gate Approval\n\n- [x] All criteria met\n- [x] Quality gates passed\n\n**Approved by:** Human`
    : `## Phase Gate Approval\n\n- [ ] All criteria met\n- [ ] Quality gates passed\n\n**Approved by:** Pending`;
  fs.writeFileSync(fullPath, `# Test Artifact\n\nContent here.\n\n${approvalSection}\n`, 'utf8');
}

// ─── Focus Module Tests ──────────────────────────────────────────────────────

describe('listPresets', () => {
  it('returns all predefined presets', async () => {
    const { listPresets } = await import('../bin/lib/focus.js');
    const presets = listPresets();
    expect(presets.length).toBeGreaterThan(0);
    const names = presets.map(p => p.name);
    expect(names).toContain('full');
    expect(names).toContain('business-analyst');
    expect(names).toContain('prd-ready');
    expect(names).toContain('discovery');
    expect(names).toContain('technical-lead');
    expect(names).toContain('developer-only');
  });

  it('each preset has required fields', async () => {
    const { listPresets } = await import('../bin/lib/focus.js');
    const presets = listPresets();
    for (const preset of presets) {
      expect(preset).toHaveProperty('name');
      expect(preset).toHaveProperty('description');
      expect(preset).toHaveProperty('start_phase');
      expect(preset).toHaveProperty('end_phase');
      expect(preset).toHaveProperty('role');
      expect(preset).toHaveProperty('phases');
      expect(preset.start_phase).toBeLessThanOrEqual(preset.end_phase);
    }
  });
});

describe('getPreset', () => {
  it('returns details for a valid preset', async () => {
    const { getPreset } = await import('../bin/lib/focus.js');
    const preset = getPreset('business-analyst');
    expect(preset.name).toBe('business-analyst');
    expect(preset.start_phase).toBe(0);
    expect(preset.end_phase).toBe(2);
    expect(preset.role).toBe('Business Analyst');
  });

  it('throws on invalid preset name', async () => {
    const { getPreset } = await import('../bin/lib/focus.js');
    expect(() => getPreset('nonexistent')).toThrow('Unknown focus preset');
  });
});

describe('validatePhaseRange', () => {
  it('accepts valid phase ranges', async () => {
    const { validatePhaseRange } = await import('../bin/lib/focus.js');
    expect(validatePhaseRange(0, 4).valid).toBe(true);
    expect(validatePhaseRange(1, 2).valid).toBe(true);
    expect(validatePhaseRange(2, 2).valid).toBe(true);
    expect(validatePhaseRange(-1, 4).valid).toBe(true);
  });

  it('rejects invalid phase numbers', async () => {
    const { validatePhaseRange } = await import('../bin/lib/focus.js');
    expect(validatePhaseRange(5, 6).valid).toBe(false);
    expect(validatePhaseRange(-2, 0).valid).toBe(false);
  });

  it('rejects start after end', async () => {
    const { validatePhaseRange } = await import('../bin/lib/focus.js');
    expect(validatePhaseRange(3, 1).valid).toBe(false);
  });
});

describe('isPhaseInFocus', () => {
  it('returns true when focus is not enabled', async () => {
    const { isPhaseInFocus } = await import('../bin/lib/focus.js');
    expect(isPhaseInFocus(0, null)).toBe(true);
    expect(isPhaseInFocus(0, { enabled: false })).toBe(true);
  });

  it('returns true for phases within range', async () => {
    const { isPhaseInFocus } = await import('../bin/lib/focus.js');
    const focus = { enabled: true, start_phase: 1, end_phase: 3 };
    expect(isPhaseInFocus(1, focus)).toBe(true);
    expect(isPhaseInFocus(2, focus)).toBe(true);
    expect(isPhaseInFocus(3, focus)).toBe(true);
  });

  it('returns false for phases outside range', async () => {
    const { isPhaseInFocus } = await import('../bin/lib/focus.js');
    const focus = { enabled: true, start_phase: 1, end_phase: 3 };
    expect(isPhaseInFocus(0, focus)).toBe(false);
    expect(isPhaseInFocus(4, focus)).toBe(false);
  });
});

describe('buildFocusConfig', () => {
  it('builds config from a preset', async () => {
    const { buildFocusConfig } = await import('../bin/lib/focus.js');
    const config = buildFocusConfig({ preset: 'business-analyst' });
    expect(config.enabled).toBe(true);
    expect(config.preset).toBe('business-analyst');
    expect(config.start_phase).toBe(0);
    expect(config.end_phase).toBe(2);
    expect(config.phases.length).toBe(3);
  });

  it('builds config from custom range', async () => {
    const { buildFocusConfig } = await import('../bin/lib/focus.js');
    const config = buildFocusConfig({ start_phase: 2, end_phase: 3 });
    expect(config.enabled).toBe(true);
    expect(config.preset).toBeNull();
    expect(config.start_phase).toBe(2);
    expect(config.end_phase).toBe(3);
  });

  it('full preset is not enabled', async () => {
    const { buildFocusConfig } = await import('../bin/lib/focus.js');
    const config = buildFocusConfig({ preset: 'full' });
    expect(config.enabled).toBe(false);
  });

  it('custom range 0-4 is not enabled (matches full)', async () => {
    const { buildFocusConfig } = await import('../bin/lib/focus.js');
    const config = buildFocusConfig({ start_phase: 0, end_phase: 4 });
    expect(config.enabled).toBe(false);
  });

  it('throws on invalid preset', async () => {
    const { buildFocusConfig } = await import('../bin/lib/focus.js');
    expect(() => buildFocusConfig({ preset: 'invalid' })).toThrow('Unknown focus preset');
  });

  it('throws on invalid range', async () => {
    const { buildFocusConfig } = await import('../bin/lib/focus.js');
    expect(() => buildFocusConfig({ start_phase: 3, end_phase: 1 })).toThrow();
  });
});

describe('getPhasesInRange', () => {
  it('returns correct phases for a range', async () => {
    const { getPhasesInRange } = await import('../bin/lib/focus.js');
    const phases = getPhasesInRange(1, 3);
    expect(phases).toHaveLength(3);
    expect(phases[0].name).toBe('Analyst');
    expect(phases[1].name).toBe('PM');
    expect(phases[2].name).toBe('Architect');
  });

  it('includes scout for range starting at -1', async () => {
    const { getPhasesInRange } = await import('../bin/lib/focus.js');
    const phases = getPhasesInRange(-1, 0);
    expect(phases).toHaveLength(2);
    expect(phases[0].name).toBe('Scout');
  });
});

// ─── Config Read/Write ───────────────────────────────────────────────────────

describe('writeFocusToConfig and readFocusFromConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads a preset focus config', async () => {
    const { buildFocusConfig, writeFocusToConfig, readFocusFromConfig } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const configPath = path.join(tmpDir, '.jumpstart', 'config.yaml');

    const focusConfig = buildFocusConfig({ preset: 'business-analyst' });
    const result = writeFocusToConfig(configPath, focusConfig);
    expect(result.success).toBe(true);

    const read = readFocusFromConfig(configPath);
    expect(read).not.toBeNull();
    expect(read.enabled).toBe(true);
    expect(read.start_phase).toBe(0);
    expect(read.end_phase).toBe(2);
  });

  it('clearFocusFromConfig resets to full workflow', async () => {
    const { buildFocusConfig, writeFocusToConfig, clearFocusFromConfig, readFocusFromConfig } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const configPath = path.join(tmpDir, '.jumpstart', 'config.yaml');

    // Set focus first
    writeFocusToConfig(configPath, buildFocusConfig({ preset: 'prd-ready' }));
    // Clear it
    clearFocusFromConfig(configPath);

    const read = readFocusFromConfig(configPath);
    expect(read).toBeNull(); // disabled
  });

  it('returns error when config file does not exist', async () => {
    const { writeFocusToConfig, buildFocusConfig } = await import('../bin/lib/focus.js');
    const result = writeFocusToConfig('/nonexistent/config.yaml', buildFocusConfig({ preset: 'full' }));
    expect(result.success).toBe(false);
  });

  it('writes and reads a custom range focus config', async () => {
    const { buildFocusConfig, writeFocusToConfig, readFocusFromConfig } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const configPath = path.join(tmpDir, '.jumpstart', 'config.yaml');

    const focusConfig = buildFocusConfig({ start_phase: 1, end_phase: 3 });
    writeFocusToConfig(configPath, focusConfig);

    const read = readFocusFromConfig(configPath);
    expect(read).not.toBeNull();
    expect(read.enabled).toBe(true);
    expect(read.start_phase).toBe(1);
    expect(read.end_phase).toBe(3);
  });

  it('double-write replaces focus config correctly', async () => {
    const { buildFocusConfig, writeFocusToConfig, readFocusFromConfig } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const configPath = path.join(tmpDir, '.jumpstart', 'config.yaml');

    writeFocusToConfig(configPath, buildFocusConfig({ preset: 'business-analyst' }));
    writeFocusToConfig(configPath, buildFocusConfig({ preset: 'prd-ready' }));

    const read = readFocusFromConfig(configPath);
    expect(read).not.toBeNull();
    expect(read.start_phase).toBe(2);
    expect(read.end_phase).toBe(2);
  });

  it('readFocusFromConfig returns null when no focus section exists', async () => {
    const { readFocusFromConfig } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const configPath = path.join(tmpDir, '.jumpstart', 'config.yaml');

    const read = readFocusFromConfig(configPath);
    expect(read).toBeNull();
  });
});

// ─── getFocusStatus ──────────────────────────────────────────────────────────

describe('getFocusStatus', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports inactive when no focus is set', async () => {
    const { getFocusStatus } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const status = getFocusStatus({ root: tmpDir });
    expect(status.active).toBe(false);
  });

  it('reports active when focus is set', async () => {
    const { getFocusStatus, buildFocusConfig, writeFocusToConfig } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const configPath = path.join(tmpDir, '.jumpstart', 'config.yaml');
    writeFocusToConfig(configPath, buildFocusConfig({ preset: 'business-analyst' }));

    const status = getFocusStatus({ root: tmpDir });
    expect(status.active).toBe(true);
    expect(status.preset).toBe('business-analyst');
  });
});

// ─── VALID_PRESETS ───────────────────────────────────────────────────────────

describe('VALID_PRESETS', () => {
  it('contains expected preset names', async () => {
    const { VALID_PRESETS } = await import('../bin/lib/focus.js');
    expect(VALID_PRESETS).toContain('full');
    expect(VALID_PRESETS).toContain('business-analyst');
    expect(VALID_PRESETS).toContain('prd-ready');
    expect(VALID_PRESETS).toContain('discovery');
    expect(VALID_PRESETS).toContain('technical-lead');
    expect(VALID_PRESETS).toContain('developer-only');
  });
});

// ─── Focus-Aware Next Phase Integration ──────────────────────────────────────

describe('determineNextAction with focus mode', () => {
  let tmpDir;
  let determineNextAction;

  beforeEach(async () => {
    tmpDir = createTempProject();
    const mod = await import('../bin/lib/next-phase.js');
    determineNextAction = mod.determineNextAction;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('recommends focus start phase for fresh project with focus set', async () => {
    const { buildFocusConfig, writeFocusToConfig } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const configPath = path.join(tmpDir, '.jumpstart', 'config.yaml');
    writeFocusToConfig(configPath, buildFocusConfig({ preset: 'prd-ready' }));

    const result = determineNextAction({ root: tmpDir });
    expect(result.action).toBe('start');
    expect(result.next_phase).toBe(2);
    expect(result.next_agent).toBe('pm');
    expect(result.command).toBe('/jumpstart.plan');
    expect(result.focus).toBeDefined();
    expect(result.focus.active).toBe(true);
  });

  it('recommends completion when focus end phase is reached', async () => {
    const { buildFocusConfig, writeFocusToConfig } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const configPath = path.join(tmpDir, '.jumpstart', 'config.yaml');
    writeFocusToConfig(configPath, buildFocusConfig({ preset: 'business-analyst' }));

    writeState(tmpDir, { current_phase: 2, current_agent: 'pm' });
    writeArtifact(tmpDir, 'specs/prd.md', true);

    const result = determineNextAction({ root: tmpDir });
    expect(result.action).toBe('complete');
    expect(result.focus).toBeDefined();
    expect(result.focus.active).toBe(true);
  });

  it('allows normal progression within focus range', async () => {
    const { buildFocusConfig, writeFocusToConfig } = await import('../bin/lib/focus.js');
    writeConfig(tmpDir);
    const configPath = path.join(tmpDir, '.jumpstart', 'config.yaml');
    writeFocusToConfig(configPath, buildFocusConfig({ preset: 'business-analyst' }));

    writeState(tmpDir, { current_phase: 1, current_agent: 'analyst' });
    writeArtifact(tmpDir, 'specs/product-brief.md', true);

    const result = determineNextAction({ root: tmpDir });
    expect(result.action).toBe('proceed');
    expect(result.next_phase).toBe(2);
    expect(result.next_agent).toBe('pm');
  });

  it('works normally when focus is not set', async () => {
    writeConfig(tmpDir);
    const result = determineNextAction({ root: tmpDir });
    expect(result.action).toBe('start');
    expect(result.next_phase).toBe(0);
    expect(result.focus).toBeUndefined();
  });
});
