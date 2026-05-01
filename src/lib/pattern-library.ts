/**
 * pattern-library.ts — Inner-source pattern library port.
 *
 * Public surface
 * preserved verbatim by name + signature:
 *
 *   - `defaultState()` => PatternLibraryState
 *   - `loadState(stateFile?)` => PatternLibraryState
 *   - `saveState(state, stateFile?)` => void
 *   - `registerPattern(name, category, options?)` => RegisterPatternResult
 *   - `searchPatterns(query, options?)` => SearchPatternsResult
 *   - `getPattern(patternId, options?)` => GetPatternResult
 *   - `listPatterns(options?)` => ListPatternsResult
 *   - `PATTERN_CATEGORIES`
 *
 * Invariants:
 *   - Default state file: `.jumpstart/state/pattern-library.json`.
 *   - 8 categories: api, data-access, auth, messaging, testing,
 *     deployment, error-handling, logging.
 *   - M3 hardening: shape-validated JSON; rejects __proto__/constructor/prototype.
 *
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'pattern-library.json');

export const PATTERN_CATEGORIES = [
  'api',
  'data-access',
  'auth',
  'messaging',
  'testing',
  'deployment',
  'error-handling',
  'logging',
] as const;

export interface Pattern {
  id: string;
  name: string;
  category: string;
  description: string;
  language: string;
  code: string;
  tags: string[];
  approved: boolean;
  created_at: string;
}

export interface PatternLibraryState {
  version: string;
  patterns: Pattern[];
  last_updated: string | null;
}

export interface RegisterPatternOptions {
  stateFile?: string;
  description?: string;
  language?: string;
  code?: string;
  tags?: string[];
  approved?: boolean;
}

export interface SearchPatternsOptions {
  stateFile?: string;
  category?: string;
}

export interface StateOptions {
  stateFile?: string;
}

export interface RegisterPatternResultSuccess {
  success: true;
  pattern: Pattern;
}
export interface RegisterPatternResultFailure {
  success: false;
  error: string;
}
export type RegisterPatternResult = RegisterPatternResultSuccess | RegisterPatternResultFailure;

export interface SearchPatternsResult {
  success: true;
  total: number;
  patterns: Pattern[];
}

export interface GetPatternResultSuccess {
  success: true;
  pattern: Pattern;
}
export interface GetPatternResultFailure {
  success: false;
  error: string;
}
export type GetPatternResult = GetPatternResultSuccess | GetPatternResultFailure;

export interface ListedPattern {
  id: string;
  name: string;
  category: string;
  approved: boolean;
}

export interface ListPatternsResult {
  success: true;
  total: number;
  categories: readonly string[];
  patterns: ListedPattern[];
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function safeParseState(raw: string): PatternLibraryState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  for (const key of Object.keys(parsed)) {
    if (FORBIDDEN_KEYS.has(key)) return null;
  }
  const data = parsed as Partial<PatternLibraryState>;
  return {
    version: typeof data.version === 'string' ? data.version : '1.0.0',
    patterns: Array.isArray(data.patterns) ? (data.patterns as Pattern[]) : [],
    last_updated: typeof data.last_updated === 'string' ? data.last_updated : null,
  };
}

export function defaultState(): PatternLibraryState {
  return { version: '1.0.0', patterns: [], last_updated: null };
}

export function loadState(stateFile?: string): PatternLibraryState {
  const fp = stateFile || DEFAULT_STATE_FILE;
  if (!existsSync(fp)) return defaultState();
  const parsed = safeParseState(readFileSync(fp, 'utf8'));
  return parsed ?? defaultState();
}

export function saveState(state: PatternLibraryState, stateFile?: string): void {
  const fp = stateFile || DEFAULT_STATE_FILE;
  const dir = dirname(fp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(fp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function registerPattern(
  name: string,
  category: string,
  options: RegisterPatternOptions = {}
): RegisterPatternResult {
  if (!name || !category) return { success: false, error: 'name and category are required' };
  if (!(PATTERN_CATEGORIES as readonly string[]).includes(category)) {
    return {
      success: false,
      error: `Unknown category: ${category}. Valid: ${PATTERN_CATEGORIES.join(', ')}`,
    };
  }

  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const pattern: Pattern = {
    id: `PAT-${Date.now()}`,
    name,
    category,
    description: options.description || '',
    language: options.language || 'javascript',
    code: options.code || '',
    tags: options.tags || [],
    approved: options.approved || false,
    created_at: new Date().toISOString(),
  };

  state.patterns.push(pattern);
  saveState(state, stateFile);

  return { success: true, pattern };
}

export function searchPatterns(
  query: string | undefined | null,
  options: SearchPatternsOptions = {}
): SearchPatternsResult {
  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const q = (query || '').toLowerCase();
  let results = state.patterns;

  if (q) {
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  if (options.category) {
    const cat = options.category;
    results = results.filter((p) => p.category === cat);
  }

  return { success: true, total: results.length, patterns: results };
}

export function getPattern(patternId: string, options: StateOptions = {}): GetPatternResult {
  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const pattern = state.patterns.find((p) => p.id === patternId);
  if (!pattern) return { success: false, error: `Pattern ${patternId} not found` };

  return { success: true, pattern };
}

export function listPatterns(options: StateOptions = {}): ListPatternsResult {
  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  return {
    success: true,
    total: state.patterns.length,
    categories: PATTERN_CATEGORIES,
    patterns: state.patterns.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      approved: p.approved,
    })),
  };
}
