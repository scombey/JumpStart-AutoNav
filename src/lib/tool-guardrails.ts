/**
 * tool-guardrails.ts — Tool Execution Guardrails port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/tool-guardrails.js` (CJS). Public surface:
 *   - `checkOperation(operation, options?)` => OperationCheckResult
 *   - `validateFileOperation(action, filePath, options?)` => FileOpResult
 *   - `RISK_RULES`
 *   - `PROTECTED_PATHS`
 *
 * M3 hardening: No JSON state paths. Not applicable.
 * Path-safety per ADR-009: No user path-to-disk resolution here. Not applicable.
 *
 * @see bin/lib/tool-guardrails.js (legacy reference)
 */

import { extname } from 'node:path';

export interface RiskRule {
  id: string;
  pattern: RegExp;
  risk: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export const RISK_RULES: RiskRule[] = [
  { id: 'delete-protection', pattern: /^(?:rm|del|remove)\s+/i, risk: 'high', description: 'File deletion operation' },
  { id: 'recursive-delete', pattern: /rm\s+-rf?\s/i, risk: 'critical', description: 'Recursive deletion' },
  { id: 'schema-change', pattern: /(?:ALTER|DROP|TRUNCATE)\s+(?:TABLE|DATABASE|SCHEMA)/i, risk: 'high', description: 'Database schema modification' },
  { id: 'config-write', pattern: /(?:\.env|config|secrets?)\s*$/i, risk: 'high', description: 'Configuration file modification' },
  { id: 'wide-glob', pattern: /\*\*\/\*|\*\.\*/i, risk: 'medium', description: 'Wide glob pattern' },
  { id: 'sudo-usage', pattern: /\bsudo\b/i, risk: 'critical', description: 'Elevated privilege usage' },
  { id: 'network-call', pattern: /\b(?:curl|wget|fetch)\s+http/i, risk: 'medium', description: 'External network call' },
  { id: 'git-force', pattern: /git\s+(?:push\s+--force|reset\s+--hard)/i, risk: 'high', description: 'Force git operation' },
];

export const PROTECTED_PATHS = [
  '.env', '.env.local', '.env.production',
  '.git/', 'node_modules/',
  'package-lock.json', 'yarn.lock',
  '.jumpstart/state/',
] as const;

export interface Violation {
  rule_id: string;
  risk: string;
  description: string;
  matched: string;
}

const RISK_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export interface OperationCheckResult {
  success: boolean;
  operation?: string | undefined;
  allowed?: boolean | undefined;
  requires_approval?: boolean | undefined;
  risk_level?: string | undefined;
  violations?: Violation[] | undefined;
  total_violations?: number | undefined;
  error?: string | undefined;
}

export function checkOperation(
  operation: string,
  _options: Record<string, unknown> = {},
): OperationCheckResult {
  if (!operation) return { success: false, error: 'operation is required' };

  const violations: Violation[] = [];

  for (const rule of RISK_RULES) {
    if (rule.pattern.test(operation)) {
      violations.push({
        rule_id: rule.id,
        risk: rule.risk,
        description: rule.description,
        matched: operation.substring(0, 100),
      });
    }
  }

  for (const pp of PROTECTED_PATHS) {
    if (operation.includes(pp)) {
      violations.push({
        rule_id: 'protected-path',
        risk: 'high',
        description: `Operation targets protected path: ${pp}`,
        matched: pp,
      });
    }
  }

  const maxRisk = violations.reduce((max, v) => {
    return (RISK_ORDER[v.risk] ?? 0) > (RISK_ORDER[max] ?? 0) ? v.risk : max;
  }, 'low');

  return {
    success: true,
    operation: operation.substring(0, 200),
    allowed: violations.filter(v => v.risk === 'critical').length === 0,
    requires_approval: violations.some(v => v.risk === 'high' || v.risk === 'critical'),
    risk_level: violations.length > 0 ? maxRisk : 'none',
    violations,
    total_violations: violations.length,
  };
}

export interface Warning {
  level: string;
  message: string;
}

export interface FileOpResult {
  success: true;
  allowed: boolean;
  reason?: string | undefined;
  action?: string | undefined;
  file?: string | undefined;
  warnings: Warning[];
  requires_review?: boolean | undefined;
}

export function validateFileOperation(
  action: string,
  filePath: string,
  options: { lines_changed?: number | undefined } = {},
): FileOpResult {
  const warnings: Warning[] = [];

  if (action === 'delete') {
    warnings.push({ level: 'high', message: `Deleting file: ${filePath}` });

    for (const pp of PROTECTED_PATHS) {
      if (filePath.includes(pp)) {
        return {
          success: true,
          allowed: false,
          reason: `Cannot delete protected path: ${pp}`,
          warnings,
        };
      }
    }
  }

  if (action === 'edit') {
    const ext = extname(filePath).toLowerCase();
    if (['.env', '.pem', '.key'].includes(ext)) {
      warnings.push({ level: 'high', message: 'Editing sensitive file type' });
    }
  }

  const linesChanged = options.lines_changed ?? 0;
  if (linesChanged > 100) {
    warnings.push({ level: 'medium', message: `Large edit: ${linesChanged} lines changed` });
  }

  return {
    success: true,
    allowed: true,
    action,
    file: filePath,
    warnings,
    requires_review: warnings.some(w => w.level === 'high'),
  };
}
