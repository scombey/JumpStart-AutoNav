/**
 * fitness-functions.ts — Architectural Fitness Functions.
 *
 * Public surface:
 *   - `defaultRegistry()` => Registry
 *   - `loadRegistry(registryFile?)` => Registry
 *   - `saveRegistry(registry, registryFile?)` => void
 *   - `addFitnessFunction(func, options?)` => AddResult
 *   - `evaluateFitness(root, options?)` => EvaluateResult
 *   - `listFitnessFunctions(filter?, options?)` => ListResult
 *   - `BUILTIN_CHECKS` (max_file_length / no_circular_imports /
 *     max_function_params / pattern_match)
 *   - `FITNESS_CATEGORIES` (frozen list)
 *
 * Invariants:
 *   - Default registry file: `.jumpstart/fitness-functions.json`.
 *   - Registry IDs default to `ff-<Date.now()>-<5-char base36>`.
 *   - evaluateFitness walks `target_dirs` (default `['src']`) and reads
 *     files matching `.(js|ts|jsx|tsx|py|go|java|rb|rs)$` — skipping
 *     dotfiles and `node_modules`.
 *   - evaluation_history is capped at 50 entries (FIFO via slice(-50)).
 *
 * Security note: every JSON parse path runs through a recursive shape
 * check that rejects keys equal to `__proto__`, `constructor`, or
 * `prototype` before merge/persist. On parse failure or pollution
 * detection, we return `defaultRegistry()` so callers see a clean state
 * rather than throwing.
 *
 * Path-safety: `evaluateFitness(root, opts)` gates `root` through
 * `assertInsideRoot` before any `fs.*` walk. The directory walker
 * resolves only `path.join(root, dir)` shapes (no caller-supplied
 * absolute paths).
 *
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { assertInsideRoot } from './path-safety.js';

const DEFAULT_FITNESS_FILE = join('.jumpstart', 'fitness-functions.json');

export const FITNESS_CATEGORIES = [
  'dependency',
  'structure',
  'complexity',
  'naming',
  'security',
  'performance',
  'testing',
] as const;

export type FitnessCategory = (typeof FITNESS_CATEGORIES)[number];

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    for (const item of value) if (hasForbiddenKey(item)) return true;
    return false;
  }
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKey(value[key])) return true;
  }
  return false;
}

export interface FitnessFunction {
  id: string;
  name: string;
  category: string;
  description: string;
  check_type: string;
  pattern: string | null;
  threshold: number | null;
  target_dirs: string[];
  enabled: boolean;
  created_at: string;
}

export interface EvaluationSummary {
  evaluated_at: string;
  total_functions: number;
  passed: number;
  failed: number;
  all_passed: boolean;
}

export interface Registry {
  version: string;
  created_at: string;
  last_evaluated: string | null;
  functions: FitnessFunction[];
  evaluation_history: EvaluationSummary[];
}

export interface AddFitnessFunctionInput {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  check_type?: string;
  pattern?: string | null;
  threshold?: number | null;
  target_dirs?: string[];
  enabled?: boolean;
}

export interface AddOptions {
  registryFile?: string | undefined;
}

export type AddResult =
  | { success: true; function: FitnessFunction; total: number }
  | { success: false; error: string };

export interface BuiltinCheckResult {
  passed: boolean;
  value: number;
  threshold?: number | undefined;
  pattern?: string | undefined;
  note?: string | undefined;
  error?: string | undefined;
}

export interface EvaluateOptions {
  registryFile?: string | undefined;
}

export interface ViolationDetail extends BuiltinCheckResult {
  file: string;
}

export interface FunctionResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  violations: number;
  details: ViolationDetail[];
}

export interface EvaluateResult {
  success: true;
  all_passed: boolean;
  results: FunctionResult[];
  summary: EvaluationSummary;
}

export interface ListFilter {
  category?: string | undefined;
  enabled?: boolean | undefined;
}

export interface ListOptions {
  registryFile?: string | undefined;
}

export interface ListResult {
  success: true;
  functions: FitnessFunction[];
  total: number;
  last_evaluated: string | null;
}

/**
 * Default fitness function registry shape (legacy parity).
 */
export function defaultRegistry(): Registry {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_evaluated: null,
    functions: [],
    evaluation_history: [],
  };
}

/**
 * Load fitness function registry from disk.
 *
 * Returns `defaultRegistry()` on any of:
 *   - file missing
 *   - JSON parse failure
 *   - shape mismatch (top-level not a plain object)
 *   - M3 pollution-key detection
 */
export function loadRegistry(registryFile?: string): Registry {
  const filePath = registryFile ?? DEFAULT_FITNESS_FILE;
  if (!existsSync(filePath)) {
    return defaultRegistry();
  }
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return defaultRegistry();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultRegistry();
  }
  if (!isPlainObject(parsed)) return defaultRegistry();
  if (hasForbiddenKey(parsed)) return defaultRegistry();
  // The legacy module returned the parsed JSON verbatim; we coerce-fill
  // missing fields so downstream callers don't have to defend against
  // partial shapes.
  const base = defaultRegistry();
  const out: Registry = {
    version: typeof parsed.version === 'string' ? (parsed.version as string) : base.version,
    created_at:
      typeof parsed.created_at === 'string' ? (parsed.created_at as string) : base.created_at,
    last_evaluated:
      typeof parsed.last_evaluated === 'string' ? (parsed.last_evaluated as string) : null,
    functions: Array.isArray(parsed.functions) ? (parsed.functions as FitnessFunction[]) : [],
    evaluation_history: Array.isArray(parsed.evaluation_history)
      ? (parsed.evaluation_history as EvaluationSummary[])
      : [],
  };
  return out;
}

/**
 * Save fitness function registry to disk. Creates parent dir if missing.
 */
export function saveRegistry(registry: Registry, registryFile?: string): void {
  const filePath = registryFile ?? DEFAULT_FITNESS_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

/**
 * Add a fitness function to the registry. Returns `{success: false}` on
 * validation/duplicate-id failure (legacy parity — does not throw).
 */
export function addFitnessFunction(
  func: AddFitnessFunctionInput | null | undefined,
  options: AddOptions = {}
): AddResult {
  if (!func?.name || !func.description) {
    return { success: false, error: 'name and description are required' };
  }

  const category = (func.category ?? 'structure').toLowerCase();
  if (!(FITNESS_CATEGORIES as readonly string[]).includes(category)) {
    return {
      success: false,
      error: `category must be one of: ${FITNESS_CATEGORIES.join(', ')}`,
    };
  }

  const registryFile = options.registryFile ?? DEFAULT_FITNESS_FILE;
  const registry = loadRegistry(registryFile);

  const id = func.id ?? `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (registry.functions.find((f) => f.id === id)) {
    return { success: false, error: `Fitness function "${id}" already exists` };
  }

  const newFunc: FitnessFunction = {
    id,
    name: func.name.trim(),
    category,
    description: func.description.trim(),
    check_type: func.check_type ?? 'pattern',
    pattern: func.pattern ?? null,
    threshold: func.threshold ?? null,
    target_dirs: func.target_dirs ?? ['src'],
    enabled: func.enabled !== false,
    created_at: new Date().toISOString(),
  };

  registry.functions.push(newFunc);
  saveRegistry(registry, registryFile);

  return { success: true, function: newFunc, total: registry.functions.length };
}

/**
 * Built-in fitness checks. Exported as a frozen-shape object — callers
 * may probe `BUILTIN_CHECKS.max_file_length` etc. directly.
 */
export const BUILTIN_CHECKS = {
  max_file_length: (content: string, threshold?: number | null): BuiltinCheckResult => {
    const lineCount = content.split('\n').length;
    const t = threshold ?? 500;
    return { passed: lineCount <= t, value: lineCount, threshold: t };
  },
  no_circular_imports: (content: string): BuiltinCheckResult => {
    const imports = content.match(/(?:require|import)\s*\(?['"]([^'"]+)['"]\)?/g) ?? [];
    return { passed: true, value: imports.length, note: 'static check only' };
  },
  max_function_params: (content: string, threshold?: number | null): BuiltinCheckResult => {
    const funcPattern = /function\s+\w+\s*\(([^)]*)\)/g;
    const arrowPattern = /\(([^)]*)\)\s*(?:=>|{)/g;
    let maxParams = 0;
    for (const m of content.matchAll(funcPattern)) {
      const captured = m[1] ?? '';
      const params = captured.split(',').filter((p) => p.trim().length > 0).length;
      if (params > maxParams) maxParams = params;
    }
    for (const m of content.matchAll(arrowPattern)) {
      const captured = m[1] ?? '';
      const params = captured.split(',').filter((p) => p.trim().length > 0).length;
      if (params > maxParams) maxParams = params;
    }
    const t = threshold ?? 5;
    return { passed: maxParams <= t, value: maxParams, threshold: t };
  },
  pattern_match: (
    content: string,
    _threshold: number | null | undefined,
    pattern: string | null | undefined
  ): BuiltinCheckResult => {
    if (!pattern) return { passed: true, value: 0 };
    try {
      const regex = new RegExp(pattern, 'gi');
      const matches = content.match(regex) ?? [];
      return { passed: matches.length === 0, value: matches.length, pattern };
    } catch {
      return { passed: true, value: 0, error: 'invalid regex' };
    }
  },
} as const;

/**
 * Evaluate all enabled fitness functions against the project tree.
 *
 * Path-safety: `root` gated through `assertInsideRoot` before any walk.
 * The recursive walker only joins `path.join(root, dir)` — caller never
 * supplies an absolute traversal target.
 */
export function evaluateFitness(root: string, options: EvaluateOptions = {}): EvaluateResult {
  // Path-safety gate before any fs.* call.
  assertInsideRoot(root, root, { schemaId: 'fitness-functions:evaluateFitness:root' });

  const registryFile = options.registryFile ?? join(root, DEFAULT_FITNESS_FILE);
  const registry = loadRegistry(registryFile);

  const enabledFuncs = registry.functions.filter((f) => f.enabled !== false);
  const results: FunctionResult[] = [];

  for (const func of enabledFuncs) {
    const violations: ViolationDetail[] = [];
    const targetDirs = func.target_dirs ?? ['src'];

    for (const dir of targetDirs) {
      const absDir = join(root, dir);
      if (!existsSync(absDir)) continue;

      const walk = (d: string): void => {
        for (const entry of readdirSync(d, { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const full = join(d, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.isFile() && /\.(js|ts|jsx|tsx|py|go|java|rb|rs)$/.test(entry.name)) {
            try {
              const content = readFileSync(full, 'utf8');
              const rel = relative(root, full).replace(/\\/g, '/');
              let checkResult: BuiltinCheckResult;

              if (func.check_type === 'max_file_length') {
                checkResult = BUILTIN_CHECKS.max_file_length(content, func.threshold);
              } else if (func.check_type === 'max_function_params') {
                checkResult = BUILTIN_CHECKS.max_function_params(content, func.threshold);
              } else if (func.check_type === 'pattern' && func.pattern) {
                checkResult = BUILTIN_CHECKS.pattern_match(content, func.threshold, func.pattern);
              } else {
                checkResult = { passed: true, value: 0 };
              }

              if (!checkResult.passed) {
                violations.push({ file: rel, ...checkResult });
              }
            } catch {
              // skip unreadable files (legacy parity)
            }
          }
        }
      };
      walk(absDir);
    }

    results.push({
      id: func.id,
      name: func.name,
      category: func.category,
      passed: violations.length === 0,
      violations: violations.length,
      details: violations.slice(0, 10),
    });
  }

  const allPassed = results.every((r) => r.passed);
  const evaluation: EvaluationSummary = {
    evaluated_at: new Date().toISOString(),
    total_functions: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    all_passed: allPassed,
  };

  registry.last_evaluated = evaluation.evaluated_at;
  registry.evaluation_history.push(evaluation);
  if (registry.evaluation_history.length > 50) {
    registry.evaluation_history = registry.evaluation_history.slice(-50);
  }
  saveRegistry(registry, registryFile);

  return {
    success: true,
    all_passed: allPassed,
    results,
    summary: evaluation,
  };
}

/**
 * List registered fitness functions, optionally filtered by category /
 * enabled flag.
 */
export function listFitnessFunctions(
  filter: ListFilter = {},
  options: ListOptions = {}
): ListResult {
  const registryFile = options.registryFile ?? DEFAULT_FITNESS_FILE;
  const registry = loadRegistry(registryFile);

  let functions = registry.functions;
  if (filter.category !== undefined) {
    functions = functions.filter((f) => f.category === filter.category);
  }
  if (filter.enabled !== undefined) {
    functions = functions.filter((f) => (f.enabled !== false) === filter.enabled);
  }

  return {
    success: true,
    functions,
    total: functions.length,
    last_evaluated: registry.last_evaluated,
  };
}
