/**
 * tests/test-web-dashboard.test.ts
 * Vitest tests for src/lib/web-dashboard.ts (M11 batch 6 port).
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateConfig,
  gatherDashboardData,
  generateStaticDashboard,
  getServerStatus,
  DASHBOARD_SECTIONS,
  DEFAULT_PORT,
  DEFAULT_HOST,
} from '../src/lib/web-dashboard.js';

let _seq = 0;
function tmpRoot() {
  const dir = join(tmpdir(), `web-dash-${Date.now()}-${++_seq}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('DEFAULT_PORT is 3000', () => {
    expect(DEFAULT_PORT).toBe(3000);
  });

  it('DEFAULT_HOST is localhost', () => {
    expect(DEFAULT_HOST).toBe('localhost');
  });

  it('DASHBOARD_SECTIONS has 6 sections', () => {
    expect(DASHBOARD_SECTIONS).toHaveLength(6);
  });

  it('DASHBOARD_SECTIONS includes phases and artifacts', () => {
    expect(DASHBOARD_SECTIONS).toContain('phases');
    expect(DASHBOARD_SECTIONS).toContain('artifacts');
  });
});

// ─── generateConfig ───────────────────────────────────────────────────────────

describe('generateConfig', () => {
  it('returns success with default port and host', () => {
    const result = generateConfig('/tmp/project');
    expect(result.success).toBe(true);
    expect(result.config.port).toBe(DEFAULT_PORT);
    expect(result.config.host).toBe(DEFAULT_HOST);
  });

  it('accepts custom port and host', () => {
    const result = generateConfig('/tmp/project', { port: 8080, host: '0.0.0.0' });
    expect(result.config.port).toBe(8080);
    expect(result.config.host).toBe('0.0.0.0');
  });

  it('resolves root to absolute path', () => {
    const result = generateConfig('/tmp/project');
    expect(result.config.root).toMatch(/^\//);
  });

  it('uses default theme when not specified', () => {
    const result = generateConfig('/tmp/project');
    expect(result.config.theme).toBe('default');
  });

  it('accepts custom sections', () => {
    const result = generateConfig('/tmp/project', { sections: ['phases', 'artifacts'] });
    expect(result.config.sections).toEqual(['phases', 'artifacts']);
  });

  it('defaults refresh_interval to 30', () => {
    const result = generateConfig('/tmp/project');
    expect(result.config.refresh_interval).toBe(30);
  });

  it('includes generated_at timestamp', () => {
    const result = generateConfig('/tmp/project');
    expect(result.config.generated_at).toBeTruthy();
    expect(new Date(result.config.generated_at).getTime()).not.toBeNaN();
  });

  it('defaults auth to disabled', () => {
    const result = generateConfig('/tmp/project');
    expect(result.config.auth.enabled).toBe(false);
  });
});

// ─── gatherDashboardData ─────────────────────────────────────────────────────

describe('gatherDashboardData', () => {
  it('returns success with project_root', () => {
    const root = tmpRoot();
    const result = gatherDashboardData(root);
    expect(result.success).toBe(true);
    expect(result.project_root).toBe(root);
  });

  it('defaults to current_phase 0 when no state file', () => {
    const root = tmpRoot();
    const result = gatherDashboardData(root);
    expect(result.sections.phases.current_phase).toBe(0);
  });

  it('reads current_phase from state.json', () => {
    const root = tmpRoot();
    const stateDir = join(root, '.jumpstart', 'state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'state.json'),
      JSON.stringify({ current_phase: 3, current_agent: 'developer', last_completed_step: 'build' }),
      'utf8',
    );
    const result = gatherDashboardData(root);
    expect(result.sections.phases.current_phase).toBe(3);
    expect(result.sections.phases.current_agent).toBe('developer');
  });

  it('falls back to phase 0 on corrupt state.json', () => {
    const root = tmpRoot();
    const stateDir = join(root, '.jumpstart', 'state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, 'state.json'), 'not-json', 'utf8');
    const result = gatherDashboardData(root);
    expect(result.sections.phases.current_phase).toBe(0);
  });

  it('lists specs artifacts', () => {
    const root = tmpRoot();
    const specsDir = join(root, 'specs');
    mkdirSync(specsDir);
    writeFileSync(join(specsDir, 'prd.md'), '# PRD\n', 'utf8');
    writeFileSync(join(specsDir, 'architecture.md'), '# Arch\n', 'utf8');
    const result = gatherDashboardData(root);
    expect(result.sections.artifacts.total).toBe(2);
    const names = result.sections.artifacts.files.map(f => f.name);
    expect(names).toContain('prd.md');
    expect(names).toContain('architecture.md');
  });

  it('detects config existence', () => {
    const root = tmpRoot();
    const cfgDir = join(root, '.jumpstart');
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, 'config.yaml'), 'project: {}', 'utf8');
    const result = gatherDashboardData(root);
    expect(result.sections.config.exists).toBe(true);
  });

  it('config.exists is false when no config.yaml', () => {
    const root = tmpRoot();
    const result = gatherDashboardData(root);
    expect(result.sections.config.exists).toBe(false);
  });
});

// ─── generateStaticDashboard ─────────────────────────────────────────────────

describe('generateStaticDashboard', () => {
  it('returns success with html string', () => {
    const root = tmpRoot();
    const data = gatherDashboardData(root);
    const result = generateStaticDashboard(data);
    expect(result.success).toBe(true);
    expect(typeof result.html).toBe('string');
  });

  it('html contains Jump Start Dashboard title', () => {
    const root = tmpRoot();
    const data = gatherDashboardData(root);
    const { html } = generateStaticDashboard(data);
    expect(html).toContain('Jump Start Dashboard');
  });

  it('html contains current phase', () => {
    const root = tmpRoot();
    const data = gatherDashboardData(root);
    const { html } = generateStaticDashboard(data);
    expect(html).toContain('Current Phase:');
  });

  it('html lists artifact file names', () => {
    const root = tmpRoot();
    const specsDir = join(root, 'specs');
    mkdirSync(specsDir);
    writeFileSync(join(specsDir, 'prd.md'), '# PRD', 'utf8');
    const data = gatherDashboardData(root);
    const { html } = generateStaticDashboard(data);
    expect(html).toContain('prd.md');
  });
});

// ─── getServerStatus ─────────────────────────────────────────────────────────

describe('getServerStatus', () => {
  it('returns success', () => {
    const result = getServerStatus();
    expect(result.success).toBe(true);
  });

  it('running is false', () => {
    expect(getServerStatus().running).toBe(false);
  });

  it('uses default port and host', () => {
    const result = getServerStatus();
    expect(result.port).toBe(DEFAULT_PORT);
    expect(result.host).toBe(DEFAULT_HOST);
  });

  it('accepts custom port and host', () => {
    const result = getServerStatus({ port: 9000, host: '127.0.0.1' });
    expect(result.port).toBe(9000);
    expect(result.host).toBe('127.0.0.1');
  });

  it('uptime is null', () => {
    expect(getServerStatus().uptime).toBeNull();
  });
});
