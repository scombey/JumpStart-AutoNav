/**
 * runtime-debugger.ts — Runtime-Aware Debugging Mode port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/runtime-debugger.js` (CJS). Public surface:
 *   - `analyzeLogs(logContent, options?)` => LogAnalysisResult
 *   - `analyzeLogFile(filePath, options?)` => LogAnalysisResult
 *   - `correlateWithSource(findings, root)` => CorrelateResult
 *   - `generateHypotheses(analysis)` => HypothesesResult
 *   - `LOG_PATTERNS`
 *
 * M3 hardening: No JSON parse paths. Not applicable.
 * Path-safety per ADR-009: `analyzeLogFile` receives filePath from CLI wiring.
 *
 * @see bin/lib/runtime-debugger.js (legacy reference)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOG_PATTERNS: Record<string, RegExp> = {
  error: /\b(?:ERROR|FATAL|CRITICAL)\b/i,
  warning: /\b(?:WARN(?:ING)?)\b/i,
  exception: /(?:Error|Exception|Traceback|at\s+\S+\s+\()/,
  stack_trace: /^\s+at\s+/m,
  timeout: /\b(?:timeout|timed?\s*out|ETIMEDOUT)\b/i,
  oom: /\b(?:out\s*of\s*memory|heap|OOM|ENOMEM)\b/i,
  connection: /\b(?:ECONNREFUSED|ECONNRESET|connection\s+refused)\b/i,
};

export interface LogFinding {
  type: string;
  line: number;
  content: string;
  severity: 'high' | 'medium';
}

export interface LogSummary {
  total_lines: number;
  errors: number;
  warnings: number;
  exceptions: number;
  timeouts: number;
  oom: number;
  connection_issues: number;
}

export interface LogAnalysisResult {
  success: boolean;
  findings?: LogFinding[] | undefined;
  summary?: LogSummary | undefined;
  total_findings?: number | undefined;
  file?: string | undefined;
  error?: string | undefined;
}

export function analyzeLogs(logContent: string, _options: Record<string, unknown> = {}): LogAnalysisResult {
  const lines = logContent.split('\n');
  const findings: LogFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const [type, pattern] of Object.entries(LOG_PATTERNS)) {
      if (pattern.test(line)) {
        findings.push({
          type,
          line: i + 1,
          content: line.trim().substring(0, 200),
          severity: type === 'error' || type === 'exception' ? 'high' : 'medium',
        });
        break;
      }
    }
  }

  const summary: LogSummary = {
    total_lines: lines.length,
    errors: findings.filter(f => f.type === 'error').length,
    warnings: findings.filter(f => f.type === 'warning').length,
    exceptions: findings.filter(f => f.type === 'exception').length,
    timeouts: findings.filter(f => f.type === 'timeout').length,
    oom: findings.filter(f => f.type === 'oom').length,
    connection_issues: findings.filter(f => f.type === 'connection').length,
  };

  return { success: true, findings, summary, total_findings: findings.length };
}

export function analyzeLogFile(filePath: string, options: Record<string, unknown> = {}): LogAnalysisResult {
  if (!existsSync(filePath)) {
    return { success: false, error: `Log file not found: ${filePath}` };
  }

  const content = readFileSync(filePath, 'utf8');
  const result = analyzeLogs(content, options);
  result.file = filePath;
  return result;
}

export interface Correlation {
  error: string;
  source_file: string;
  source_line: number;
  file_exists: boolean;
  severity: string;
}

export interface CorrelateResult {
  success: true;
  correlations: Correlation[];
  total: number;
  actionable: number;
}

export function correlateWithSource(findings: LogFinding[], root: string): CorrelateResult {
  const correlations: Correlation[] = [];

  for (const finding of findings) {
    const fileMatch = finding.content.match(/(?:at\s+)?(\S+\.(?:js|ts|py)):(\d+)/);
    if (fileMatch) {
      const file = fileMatch[1];
      const lineStr = fileMatch[2];
      if (!file || !lineStr) continue;
      const absPath = join(root, file);
      const exists = existsSync(absPath);

      correlations.push({
        error: finding.content.substring(0, 100),
        source_file: file,
        source_line: parseInt(lineStr, 10),
        file_exists: exists,
        severity: finding.severity,
      });
    }
  }

  return {
    success: true,
    correlations,
    total: correlations.length,
    actionable: correlations.filter(c => c.file_exists).length,
  };
}

export interface HypothesisEntry {
  hypothesis: string;
  confidence: string;
  action: string;
}

export interface HypothesesResult {
  success: true;
  hypotheses: HypothesisEntry[];
  total: number;
  summary: LogSummary;
}

export function generateHypotheses(analysis: LogAnalysisResult): HypothesesResult {
  const hypotheses: HypothesisEntry[] = [];
  const summary = analysis.summary ?? {
    total_lines: 0, errors: 0, warnings: 0, exceptions: 0,
    timeouts: 0, oom: 0, connection_issues: 0,
  };

  if (summary.oom > 0) {
    hypotheses.push({ hypothesis: 'Memory leak or insufficient heap allocation', confidence: 'high', action: 'Check for unbounded data structures or increase memory limits' });
  }
  if (summary.timeouts > 0) {
    hypotheses.push({ hypothesis: 'Network connectivity or slow dependency', confidence: 'medium', action: 'Check network configuration, increase timeouts, or add retries' });
  }
  if (summary.connection_issues > 0) {
    hypotheses.push({ hypothesis: 'Service dependency unavailable', confidence: 'high', action: 'Verify dependent services are running and network rules allow connection' });
  }
  if (summary.exceptions > 0) {
    hypotheses.push({ hypothesis: 'Unhandled exception in application code', confidence: 'high', action: 'Review stack traces and add error handling' });
  }

  return { success: true, hypotheses, total: hypotheses.length, summary };
}
