/**
 * impact-analysis.ts — change impact analyzer port (T4.2.5).
 *
 * Pure-library port of `bin/lib/impact-analysis.js`. Public surface
 * preserved verbatim:
 *
 *   - `analyzeImpact(root, target, options?)` => ImpactResult
 *   - `renderImpactReport(analysis)` => string (human-readable)
 *
 * Behavior parity:
 *   - target is `{file?, symbol?, specId?}`. At least one MUST be set.
 *   - Search terms include filename stem, full basename, symbol, and
 *     spec ID (whichever are provided).
 *   - File classification heuristics for source-dir hits (preserved
 *     verbatim): service/controller/route -> service, api/endpoint/
 *     handler -> api, anything else -> consumer.
 *   - Risk thresholds: critical >20, high >10, medium >4, else low.
 *
 * @see bin/lib/impact-analysis.js (legacy reference)
 * @see specs/implementation-plan.md T4.2.5
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

// Public types

export interface ImpactTarget {
  file?: string;
  symbol?: string;
  specId?: string;
}

export interface ImpactOptions {
  testsDir?: string;
  srcDir?: string;
}

export interface ImpactHit {
  file: string;
  label: 'requirement' | 'test' | 'source';
  matched_term: string;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ImpactSummary {
  total_affected: number;
  requirements: number;
  tests: number;
  services: number;
  apis: number;
  consumers: number;
  risk_level: RiskLevel;
}

export interface ImpactSuccessResult {
  success: true;
  target: ImpactTarget;
  affected_requirements: ImpactHit[];
  affected_tests: ImpactHit[];
  affected_services: ImpactHit[];
  affected_apis: ImpactHit[];
  affected_consumers: ImpactHit[];
  risk_level: RiskLevel;
  summary: ImpactSummary;
}

export interface ImpactErrorResult {
  success: false;
  error: string;
}

export type ImpactResult = ImpactSuccessResult | ImpactErrorResult;

// Implementation

/**
 * Analyse the impact of changing a file/symbol/specId. Walks specs,
 * tests, and src dirs and bucket-categorizes every file that mentions
 * any of the search terms.
 */
export function analyzeImpact(
  root: string,
  target: ImpactTarget,
  options: ImpactOptions = {}
): ImpactResult {
  if (!target || (!target.file && !target.symbol && !target.specId)) {
    return {
      success: false,
      error: 'target.file, target.symbol, or target.specId is required',
    };
  }

  const affected_requirements: ImpactHit[] = [];
  const affected_tests: ImpactHit[] = [];
  const affected_services: ImpactHit[] = [];
  const affected_apis: ImpactHit[] = [];
  const affected_consumers: ImpactHit[] = [];

  const specsDir = path.join(root, 'specs');
  const testsDir = path.join(root, options.testsDir || 'tests');
  const srcDir = path.join(root, options.srcDir || 'src');

  const searchTerms: string[] = [];
  if (target.file) {
    searchTerms.push(path.basename(target.file, path.extname(target.file)));
    searchTerms.push(path.basename(target.file));
  }
  if (target.symbol) searchTerms.push(target.symbol);
  if (target.specId) searchTerms.push(target.specId);

  function grepDir(dir: string, label: ImpactHit['label']): ImpactHit[] {
    if (!existsSync(dir)) return [];
    const hits: ImpactHit[] = [];
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          try {
            const content = readFileSync(full, 'utf8');
            const rel = path.relative(root, full).replace(/\\/g, '/');
            for (const term of searchTerms) {
              if (content.includes(term)) {
                hits.push({ file: rel, label, matched_term: term });
                break;
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    };
    walk(dir);
    return hits;
  }

  for (const h of grepDir(specsDir, 'requirement')) {
    if (!affected_requirements.some((r) => r.file === h.file)) {
      affected_requirements.push(h);
    }
  }

  for (const h of grepDir(testsDir, 'test')) {
    if (!affected_tests.some((r) => r.file === h.file)) {
      affected_tests.push(h);
    }
  }

  const srcHits = grepDir(srcDir, 'source');
  for (const h of srcHits) {
    const lower = h.file.toLowerCase();
    if (lower.includes('service') || lower.includes('controller') || lower.includes('route')) {
      affected_services.push(h);
    } else if (lower.includes('api') || lower.includes('endpoint') || lower.includes('handler')) {
      affected_apis.push(h);
    } else {
      affected_consumers.push(h);
    }
  }

  const totalAffected =
    affected_requirements.length +
    affected_tests.length +
    affected_services.length +
    affected_apis.length +
    affected_consumers.length;

  let risk_level: RiskLevel;
  if (totalAffected > 20) risk_level = 'critical';
  else if (totalAffected > 10) risk_level = 'high';
  else if (totalAffected > 4) risk_level = 'medium';
  else risk_level = 'low';

  return {
    success: true,
    target,
    affected_requirements,
    affected_tests,
    affected_services,
    affected_apis,
    affected_consumers,
    risk_level,
    summary: {
      total_affected: totalAffected,
      requirements: affected_requirements.length,
      tests: affected_tests.length,
      services: affected_services.length,
      apis: affected_apis.length,
      consumers: affected_consumers.length,
      risk_level,
    },
  };
}

/**
 * Render a human-readable impact report. Uses the same emoji palette
 * + section ordering as the legacy module.
 */
export function renderImpactReport(analysis: ImpactResult): string {
  if (!analysis.success) {
    return `❌ Impact analysis failed: ${analysis.error}`;
  }

  const lines: string[] = [];
  const riskEmoji: Record<RiskLevel, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };
  const emoji = riskEmoji[analysis.risk_level] || '⚪';

  lines.push(`\n${emoji} Impact Analysis — Risk: ${analysis.risk_level.toUpperCase()}`);
  lines.push(`\nTarget: ${JSON.stringify(analysis.target)}`);
  lines.push(`Total affected: ${analysis.summary.total_affected}`);
  lines.push('');

  const sections: Array<[string, ImpactHit[]]> = [
    ['Requirements', analysis.affected_requirements],
    ['Tests', analysis.affected_tests],
    ['Services', analysis.affected_services],
    ['APIs', analysis.affected_apis],
    ['Consumers', analysis.affected_consumers],
  ];

  for (const [label, items] of sections) {
    if (items.length > 0) {
      lines.push(`${label} (${items.length}):`);
      for (const item of items) {
        lines.push(`  • ${item.file}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
