/**
 * quickstart.ts -- 5-Minute Quickstart Wizard (UX Feature 15).
 *
 * Streamlined interactive setup that asks 3–4 questions (project name,
 * type, domain, ceremony level) and drops the user into Phase 0.
 *
 * This module exports the data helpers only. Interactive prompt flow
 * is driven from the CLI command (which owns the prompts dependency).
 *
 * ADR-006: no process.exit.
 * M3 hardening: no JSON state — pure data transformation.
 */

import * as path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DomainOption {
  value: string;
  title: string;
  description: string;
}

export interface CeremonyOption {
  value: string;
  title: string;
  description: string;
}

export interface QuickstartAnswers {
  projectName?: string | null | undefined;
  projectType?: string | undefined;
  domain?: string | undefined;
  customDomain?: string | null | undefined;
  ceremony?: string | undefined;
  targetDir?: string | undefined;
  approverName?: string | null | undefined;
}

export interface QuickstartConfig {
  targetDir: string;
  projectName: string | null;
  approverName: string | null;
  projectType: string;
  copilot: boolean;
  force: boolean;
  dryRun: boolean;
  interactive: boolean;
  domain: string;
  ceremony: string;
}

export interface QuickstartSummary {
  lines: string[];
  firstCommand: string;
  firstMessage: string;
}

export interface ConfigPatch {
  section: string;
  key: string;
  value: string;
  pattern: RegExp;
  replacement: string;
}

export interface ConfigPatchResult {
  patches: ConfigPatch[];
}

// ─── Domain Options ───────────────────────────────────────────────────────────

export const DOMAIN_OPTIONS: DomainOption[] = [
  {
    value: 'web-app',
    title: 'Web Application',
    description: 'Browser-based UI with backend services',
  },
  {
    value: 'mobile-app',
    title: 'Mobile Application',
    description: 'iOS, Android, or cross-platform mobile app',
  },
  {
    value: 'api-service',
    title: 'API / Microservice',
    description: 'REST or GraphQL backend service',
  },
  { value: 'cli-tool', title: 'CLI Tool', description: 'Command-line utility or developer tool' },
  {
    value: 'library',
    title: 'Library / SDK',
    description: 'Reusable package consumed by other projects',
  },
  {
    value: 'data-pipeline',
    title: 'Data Pipeline',
    description: 'ETL, streaming, or analytics pipeline',
  },
  { value: 'ecommerce', title: 'E-Commerce', description: 'Online store, payments, inventory' },
  {
    value: 'saas',
    title: 'SaaS Platform',
    description: 'Multi-tenant software-as-a-service product',
  },
  { value: 'other', title: 'Other', description: 'Custom domain — enter your own' },
];

// ─── Ceremony Options ─────────────────────────────────────────────────────────

export const CEREMONY_OPTIONS: CeremonyOption[] = [
  {
    value: 'light',
    title: 'Light — Fast prototyping',
    description:
      'Minimal docs, skip optional gates, fast iteration. Best for proofs of concept and experiments.',
  },
  {
    value: 'standard',
    title: 'Standard — Balanced (recommended)',
    description: 'Full spec workflow with all quality gates. Good default for most projects.',
  },
  {
    value: 'rigorous',
    title: 'Rigorous — Enterprise grade',
    description:
      'Maximum ceremony: adversarial review, peer review, strict TDD, security audits. For regulated or high-risk projects.',
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a complete install configuration from wizard answers.
 */
export function buildQuickstartConfig(answers: QuickstartAnswers = {}): QuickstartConfig {
  const domain =
    answers.domain === 'other'
      ? (answers.customDomain ?? 'general')
      : (answers.domain ?? 'general');

  return {
    targetDir: answers.targetDir ?? '.',
    projectName: answers.projectName ?? null,
    approverName: answers.approverName ?? null,
    projectType: answers.projectType ?? 'greenfield',
    copilot: true, // Enable Copilot integration by default in quickstart
    force: false,
    dryRun: false,
    interactive: false,
    domain,
    ceremony: answers.ceremony ?? 'standard',
  };
}

/**
 * Determine the first command the user should run after setup.
 */
export function getFirstCommand(config: QuickstartConfig): { command: string; message: string } {
  if (config.projectType === 'brownfield') {
    return {
      command: '/jumpstart.scout',
      message: 'Brownfield project detected. The Scout will analyze your existing codebase first.',
    };
  }
  return {
    command: '/jumpstart.challenge',
    message:
      'Ready to begin! The Challenger will interrogate your problem space and sharpen the project vision.',
  };
}

/**
 * Generate a formatted summary of the quickstart configuration.
 */
export function generateQuickstartSummary(config: QuickstartConfig): QuickstartSummary {
  const next = getFirstCommand(config);
  const lines = [
    `Project:  ${config.projectName ?? path.basename(path.resolve(config.targetDir))}`,
    `Type:     ${config.projectType}`,
    `Domain:   ${config.domain}`,
    `Ceremony: ${config.ceremony}`,
    `Copilot:  ${config.copilot ? 'enabled' : 'disabled'}`,
  ];

  return {
    lines,
    firstCommand: next.command,
    firstMessage: next.message,
  };
}

/**
 * Build the YAML patch descriptors for adding domain and ceremony to config.yaml.
 */
export function getConfigPatches(config: QuickstartConfig): ConfigPatchResult {
  const patches: ConfigPatch[] = [];

  if (config.domain && config.domain !== 'general') {
    patches.push({
      section: 'project',
      key: 'domain',
      value: config.domain,
      pattern: /^(\s*type:\s*\S+)$/m,
      replacement: `$1\n  domain: ${config.domain}`,
    });
  }

  if (config.ceremony && config.ceremony !== 'standard') {
    patches.push({
      section: 'ceremony',
      key: 'profile',
      value: config.ceremony,
      pattern: /^(\s*profile:\s*)\S+/m,
      replacement: `$1${config.ceremony}`,
    });
  }

  return { patches };
}

/**
 * Apply config.yaml patches to a content string.
 */
export function applyConfigPatches(content: string, config: QuickstartConfig): string {
  let result = content;
  const { patches } = getConfigPatches(config);
  for (const patch of patches) {
    result = result.replace(patch.pattern, patch.replacement);
  }
  return result;
}
