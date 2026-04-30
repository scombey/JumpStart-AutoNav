/**
 * root-cause-analysis.ts — Root Cause Analysis Assistant port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/root-cause-analysis.js` (CJS). Public surface:
 *   - `analyzeFailure(output, options?)` => AnalyzeResult
 *   - `analyzeTestFile(filePath, options?)` => AnalyzeResult
 *   - `generateReport(analysis)` => ReportResult
 *   - `FAILURE_PATTERNS`
 *
 * M3 hardening: No JSON parse paths. Not applicable.
 * Path-safety per ADR-009: `analyzeTestFile` receives filePath from CLI wiring.
 *
 * @see bin/lib/root-cause-analysis.js (legacy reference)
 */

import { existsSync, readFileSync } from 'node:fs';

export interface FailurePattern {
  pattern: RegExp;
  category: string;
  fix: string;
}

export const FAILURE_PATTERNS: FailurePattern[] = [
  { pattern: /Cannot find module ['"]([^'"]+)['"]/g, category: 'missing-dependency', fix: 'Install or fix import path' },
  { pattern: /SyntaxError:\s*(.+)/g, category: 'syntax-error', fix: 'Fix syntax at indicated location' },
  { pattern: /TypeError:\s*(.+)\s+is not a function/g, category: 'type-error', fix: 'Check API usage and version compatibility' },
  { pattern: /ENOENT.*['"]([^'"]+)['"]/g, category: 'missing-file', fix: 'Create missing file or fix path reference' },
  { pattern: /AssertionError|AssertionError:\s*(.+)/g, category: 'test-assertion', fix: 'Update test or fix implementation' },
  { pattern: /ReferenceError:\s*(\w+)\s+is not defined/g, category: 'reference-error', fix: 'Import or declare the missing variable' },
  { pattern: /ECONNREFUSED/g, category: 'connection-error', fix: 'Ensure required services are running' },
  { pattern: /out of memory|heap|OOM/gi, category: 'memory-error', fix: 'Optimize memory usage or increase limits' },
  { pattern: /timeout|ETIMEDOUT/gi, category: 'timeout', fix: 'Increase timeout or optimize slow operations' },
  { pattern: /permission denied|EACCES/gi, category: 'permission-error', fix: 'Check file permissions or user privileges' },
];

export interface Hypothesis {
  category: string;
  detail: string;
  line: number;
  suggested_fix: string;
  confidence: string;
  context: string;
}

export interface AnalyzeResult {
  success: boolean;
  total_hypotheses?: number | undefined;
  hypotheses?: Hypothesis[] | undefined;
  primary_cause?: Hypothesis | null | undefined;
  categories?: string[] | undefined;
  recommended_actions?: Array<{ action: string; detail: string; category: string }> | undefined;
  file?: string | undefined;
  error?: string | undefined;
}

const SEVERITY_ORDER: Record<string, number> = {
  'syntax-error': 1,
  'missing-dependency': 2,
  'reference-error': 3,
  'type-error': 4,
  'missing-file': 5,
  'test-assertion': 6,
};

export function analyzeFailure(
  output: string,
  _options: Record<string, unknown> = {},
): AnalyzeResult {
  if (!output) return { success: false, error: 'output is required' };

  const hypotheses: Hypothesis[] = [];
  const seen = new Set<string>();

  for (const fp of FAILURE_PATTERNS) {
    const regex = new RegExp(fp.pattern.source, fp.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(output)) !== null) {
      const detail = match[1] ?? '';
      const key = `${fp.category}:${detail.substring(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const lineNum = output.substring(0, match.index).split('\n').length;
      const lines = output.split('\n');
      hypotheses.push({
        category: fp.category,
        detail: detail || match[0].trim(),
        line: lineNum,
        suggested_fix: fp.fix,
        confidence: 'high',
        context: lines.slice(Math.max(0, lineNum - 3), lineNum + 2).join('\n'),
      });
    }
  }

  hypotheses.sort((a, b) => (SEVERITY_ORDER[a.category] ?? 99) - (SEVERITY_ORDER[b.category] ?? 99));

  return {
    success: true,
    total_hypotheses: hypotheses.length,
    hypotheses,
    primary_cause: hypotheses[0] ?? null,
    categories: [...new Set(hypotheses.map(h => h.category))],
    recommended_actions: hypotheses.slice(0, 3).map(h => ({
      action: h.suggested_fix,
      detail: h.detail,
      category: h.category,
    })),
  };
}

export function analyzeTestFile(filePath: string, options: Record<string, unknown> = {}): AnalyzeResult {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const content = readFileSync(filePath, 'utf8');
  const result = analyzeFailure(content, options);
  result.file = filePath;
  return result;
}

export interface ReportResult {
  success: boolean;
  summary?: {
    total_issues: number;
    primary_cause: string;
    categories: number;
  } | undefined;
  by_category?: Record<string, number> | undefined;
  action_plan?: Array<{ action: string; detail: string; category: string }> | undefined;
  hypotheses?: Hypothesis[] | undefined;
  error?: string | undefined;
}

export function generateReport(analysis: AnalyzeResult): ReportResult {
  if (!analysis?.hypotheses) {
    return { success: false, error: 'Invalid analysis result' };
  }

  const byCategory = analysis.hypotheses.reduce<Record<string, number>>((acc, h) => {
    acc[h.category] = (acc[h.category] ?? 0) + 1;
    return acc;
  }, {});

  return {
    success: true,
    summary: {
      total_issues: analysis.total_hypotheses ?? 0,
      primary_cause: analysis.primary_cause?.category ?? 'unknown',
      categories: Object.keys(byCategory).length,
    },
    by_category: byCategory,
    action_plan: analysis.recommended_actions ?? [],
    hypotheses: analysis.hypotheses,
  };
}
