/**
 * web-dashboard.ts — Rich Web UI / Local Dashboard port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/web-dashboard.js` (CJS). Public surface:
 *   - `generateConfig(root, options?)` => ConfigResult
 *   - `gatherDashboardData(root, options?)` => DashboardData
 *   - `generateStaticDashboard(data)` => HtmlResult
 *   - `getServerStatus(options?)` => StatusResult
 *   - `DASHBOARD_SECTIONS`
 *   - `DEFAULT_PORT`
 *   - `DEFAULT_HOST`
 *
 * M3 hardening: No JSON state paths. Not applicable.
 * Path-safety per ADR-009: `root` comes from CLI wiring (assertUserPath).
 *
 * ADR-006: No process.exit() in library code. Not applicable here.
 *
 * @see bin/lib/web-dashboard.js (legacy reference)
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = 'localhost';

export const DASHBOARD_SECTIONS = ['phases', 'artifacts', 'governance', 'timeline', 'risks', 'metrics'] as const;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

export interface DashboardConfig {
  port: number;
  host: string;
  root: string;
  sections: string[];
  theme: string;
  auth: { enabled: boolean };
  refresh_interval: number;
  generated_at: string;
}

export interface ConfigResult {
  success: true;
  config: DashboardConfig;
}

export function generateConfig(
  root: string,
  options: {
    port?: number | undefined;
    host?: string | undefined;
    sections?: string[] | undefined;
    theme?: string | undefined;
    auth?: { enabled: boolean } | undefined;
    refresh_interval?: number | undefined;
  } = {},
): ConfigResult {
  const config: DashboardConfig = {
    port: options.port ?? DEFAULT_PORT,
    host: options.host ?? DEFAULT_HOST,
    root: resolve(root),
    sections: options.sections ?? [...DASHBOARD_SECTIONS],
    theme: options.theme ?? 'default',
    auth: options.auth ?? { enabled: false },
    refresh_interval: options.refresh_interval ?? 30,
    generated_at: new Date().toISOString(),
  };

  return { success: true, config };
}

export interface ArtifactEntry {
  name: string;
  size: number;
  modified: string;
}

export interface DashboardData {
  success: true;
  project_root: string;
  generated_at: string;
  sections: {
    phases: { current_phase: number | string; current_agent?: string | null; last_completed_step?: string | null };
    artifacts: { total: number; files: ArtifactEntry[] };
    config: { exists: boolean };
  };
}

export function gatherDashboardData(
  root: string,
  _options: Record<string, unknown> = {},
): DashboardData {
  const data: DashboardData = {
    success: true,
    project_root: root,
    generated_at: new Date().toISOString(),
    sections: {
      phases: { current_phase: 0 },
      artifacts: { total: 0, files: [] },
      config: { exists: false },
    },
  };

  const stateFile = join(root, '.jumpstart', 'state', 'state.json');
  if (existsSync(stateFile)) {
    try {
      const state = JSON.parse(readFileSync(stateFile, 'utf8')) as Record<string, unknown>;
      data.sections.phases = {
        current_phase: (state['current_phase'] as number | string | undefined) ?? 0,
        current_agent: (state['current_agent'] as string | null | undefined) ?? null,
        last_completed_step: (state['last_completed_step'] as string | null | undefined) ?? null,
      };
    } catch {
      data.sections.phases = { current_phase: 0 };
    }
  }

  const specsDir = join(root, 'specs');
  const artifacts: ArtifactEntry[] = [];
  if (existsSync(specsDir)) {
    for (const f of readdirSync(specsDir).filter(f => f.endsWith('.md'))) {
      const fp = join(specsDir, f);
      const st = statSync(fp);
      artifacts.push({ name: f, size: st.size, modified: st.mtime.toISOString() });
    }
  }
  data.sections.artifacts = { total: artifacts.length, files: artifacts };

  const configFile = join(root, '.jumpstart', 'config.yaml');
  data.sections.config = { exists: existsSync(configFile) };

  return data;
}

export interface HtmlResult {
  success: true;
  html: string;
}

export function generateStaticDashboard(data: DashboardData): HtmlResult {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Jump Start Dashboard</title></head>
<body>
<h1>Jump Start Dashboard</h1>
<p>Generated: ${data.generated_at}</p>
<h2>Phase Status</h2>
<p>Current Phase: ${data.sections.phases.current_phase}</p>
<h2>Artifacts (${data.sections.artifacts.total})</h2>
<ul>${data.sections.artifacts.files.map(f => `<li>${f.name} (${f.size} bytes)</li>`).join('')}</ul>
</body>
</html>`;
  return { success: true, html };
}

export interface StatusResult {
  success: true;
  running: boolean;
  port: number;
  host: string;
  uptime: null;
}

export function getServerStatus(options: { port?: number | undefined; host?: string | undefined } = {}): StatusResult {
  return {
    success: true,
    running: false,
    port: options.port ?? DEFAULT_PORT,
    host: options.host ?? DEFAULT_HOST,
    uptime: null,
  };
}
