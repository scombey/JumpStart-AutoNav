/**
 * reference-architectures.ts — Org-wide Reference Architectures port (M11 batch 5).
 *
 * Pure-library port of `bin/lib/reference-architectures.js` (CJS) to a
 * typed ES module. Public surface preserved verbatim by name + signature:
 *
 *   - `defaultRegistry()` => Registry
 *   - `loadRegistry(registryFile?)` => Registry
 *   - `saveRegistry(registry, registryFile?)` => void
 *   - `listPatterns(filter?, options?)` => ListResult
 *   - `getPattern(patternId, options?)` => GetResult
 *   - `registerPattern(pattern, options?)` => RegisterResult
 *   - `instantiatePattern(patternId, root, options?)` => InstantiateResult
 *   - `BUILTIN_PATTERNS` (frozen-shape array of 4 default patterns)
 *   - `PATTERN_CATEGORIES` (frozen list)
 *
 * Behavior parity:
 *   - Default registry file: `.jumpstart/reference-architectures.json`.
 *   - Built-in patterns: rag-pipeline, agent-app, api-platform,
 *     event-driven (4 entries, identical components/tech_stack/structure
 *     to legacy).
 *   - Pattern IDs auto-generated from name (`name.toLowerCase()
 *     .replace(/\s+/g, '-')`) when not supplied.
 *   - Custom patterns persist under `registry.custom_patterns[]`.
 *   - Unknown categories normalize to `'other'`.
 *   - `instantiatePattern` walks the pattern's structure map and creates
 *     each directory; writes a `README.md` in each new directory; skips
 *     pre-existing directories.
 *
 * M3 hardening: every JSON parse path runs through a recursive shape
 * check that rejects __proto__/constructor/prototype keys; falls back
 * to `defaultRegistry()` on parse failure or pollution detection. This
 * also guards against an attacker-controlled registry file injecting a
 * `structure: { '__proto__': '...' }` payload into instantiatePattern
 * (which would otherwise iterate Object.entries that includes the
 * polluted key and create a directory named `__proto__`).
 *
 * Path-safety per ADR-009:
 *   - `instantiatePattern(patternId, root, opts)` gates `root` through
 *     `assertInsideRoot` before any fs probe. Each directory key from
 *     `pattern.structure` is also re-asserted to resolve inside `root`
 *     before mkdirSync — defends against a custom pattern injecting
 *     `'../../../etc/'` or absolute paths.
 *
 * @see bin/lib/reference-architectures.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ValidationError } from './errors.js';
import { assertInsideRoot } from './path-safety.js';

const DEFAULT_REGISTRY_FILE = join('.jumpstart', 'reference-architectures.json');

export const PATTERN_CATEGORIES = [
  'api-platform',
  'event-driven',
  'rag',
  'agent-app',
  'microservices',
  'monolith',
  'serverless',
  'data-pipeline',
  'other',
] as const;

export type PatternCategory = (typeof PATTERN_CATEGORIES)[number];

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

export interface TechStack {
  suggested: string[];
}

export interface Pattern {
  id: string;
  name: string;
  category: string;
  description: string;
  components: string[];
  tech_stack: TechStack;
  structure: Record<string, string>;
  nfrs: string[];
  custom?: boolean;
  created_at?: string;
}

export interface InstantiationHistoryEntry {
  pattern_id: string;
  instantiated_at: string;
  root: string;
  directories_created: number;
}

export interface Registry {
  version: string;
  created_at: string;
  patterns: Pattern[];
  custom_patterns: Pattern[];
  instantiation_history: InstantiationHistoryEntry[];
}

export const BUILTIN_PATTERNS: Pattern[] = [
  {
    id: 'rag-pipeline',
    name: 'RAG Pipeline',
    category: 'rag',
    description:
      'Retrieval-Augmented Generation pipeline with vector store, embeddings, and LLM orchestration.',
    components: [
      'document-ingestion',
      'embedding-service',
      'vector-store',
      'retrieval-engine',
      'llm-orchestrator',
      'api-gateway',
    ],
    tech_stack: { suggested: ['langchain', 'pinecone', 'openai', 'fastapi'] },
    structure: {
      'src/ingestion/': 'Document ingestion and chunking',
      'src/embeddings/': 'Embedding generation',
      'src/retrieval/': 'Vector search and retrieval',
      'src/orchestrator/': 'LLM orchestration and prompt management',
      'src/api/': 'API endpoints',
      'tests/': 'Test suites',
    },
    nfrs: ['latency < 2s p95', 'embedding refresh < 1h', 'context window management'],
  },
  {
    id: 'agent-app',
    name: 'Agent Application',
    category: 'agent-app',
    description: 'Multi-agent application with tool use, memory, and planning capabilities.',
    components: [
      'agent-core',
      'tool-registry',
      'memory-store',
      'planner',
      'executor',
      'api-layer',
    ],
    tech_stack: { suggested: ['openai', 'langchain', 'redis', 'express'] },
    structure: {
      'src/agents/': 'Agent definitions and personas',
      'src/tools/': 'Tool implementations',
      'src/memory/': 'Memory and state management',
      'src/planner/': 'Planning and orchestration',
      'src/api/': 'API endpoints',
      'tests/': 'Test suites',
    },
    nfrs: [
      'response time < 5s',
      'tool execution timeout 30s',
      'conversation history management',
    ],
  },
  {
    id: 'api-platform',
    name: 'API Platform',
    category: 'api-platform',
    description: 'RESTful API platform with authentication, rate limiting, and monitoring.',
    components: [
      'api-gateway',
      'auth-service',
      'rate-limiter',
      'business-logic',
      'data-layer',
      'monitoring',
    ],
    tech_stack: { suggested: ['express', 'postgresql', 'redis', 'jwt'] },
    structure: {
      'src/routes/': 'API route definitions',
      'src/middleware/': 'Auth, rate limiting, validation',
      'src/services/': 'Business logic',
      'src/models/': 'Data models',
      'src/config/': 'Configuration',
      'tests/': 'Test suites',
    },
    nfrs: ['latency < 200ms p95', 'rate limit 1000 req/min', '99.9% availability'],
  },
  {
    id: 'event-driven',
    name: 'Event-Driven System',
    category: 'event-driven',
    description:
      'Event-driven microservice architecture with message broker and event sourcing.',
    components: [
      'event-producer',
      'message-broker',
      'event-consumer',
      'event-store',
      'projection-service',
      'api-layer',
    ],
    tech_stack: { suggested: ['kafka', 'nodejs', 'postgresql', 'elasticsearch'] },
    structure: {
      'src/events/': 'Event definitions and schemas',
      'src/producers/': 'Event producers',
      'src/consumers/': 'Event consumers and handlers',
      'src/projections/': 'Read model projections',
      'src/api/': 'Query API',
      'tests/': 'Test suites',
    },
    nfrs: [
      'event processing < 100ms',
      'at-least-once delivery',
      'event ordering guarantees',
    ],
  },
];

export interface ListFilter {
  category?: string | undefined;
}

export interface CommonOptions {
  registryFile?: string | undefined;
}

export interface PatternSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  components: number;
}

export interface ListResult {
  success: true;
  patterns: PatternSummary[];
  total: number;
  categories: string[];
}

export type GetResult = { success: true; pattern: Pattern } | { success: false; error: string };

export interface RegisterPatternInput {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  components?: string[];
  tech_stack?: TechStack;
  structure?: Record<string, string>;
  nfrs?: string[];
}

export type RegisterResult =
  | { success: true; pattern: Pattern }
  | { success: false; error: string };

export type InstantiateResult =
  | {
      success: true;
      pattern: string;
      pattern_name: string;
      directories_created: string[];
      directories_skipped: string[];
      components: string[];
      suggested_tech_stack: TechStack;
      nfrs: string[];
    }
  | { success: false; error: string };

/**
 * Default registry shape. Always includes the 4 built-in patterns.
 */
export function defaultRegistry(): Registry {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    patterns: BUILTIN_PATTERNS.map((p) => ({ ...p })),
    custom_patterns: [],
    instantiation_history: [],
  };
}

/**
 * Load registry from disk. On any failure path (file missing, parse
 * error, shape mismatch, M3 pollution detection) returns
 * `defaultRegistry()`.
 *
 * Legacy parity: if `data.patterns` is missing, the legacy module
 * back-fills with `BUILTIN_PATTERNS`. We preserve that.
 */
export function loadRegistry(registryFile?: string): Registry {
  const filePath = registryFile ?? DEFAULT_REGISTRY_FILE;
  if (!existsSync(filePath)) return defaultRegistry();
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
  const base = defaultRegistry();
  const patterns = Array.isArray(parsed['patterns'])
    ? (parsed['patterns'] as Pattern[])
    : BUILTIN_PATTERNS.map((p) => ({ ...p }));
  return {
    version: typeof parsed['version'] === 'string' ? (parsed['version'] as string) : base.version,
    created_at:
      typeof parsed['created_at'] === 'string'
        ? (parsed['created_at'] as string)
        : base.created_at,
    patterns,
    custom_patterns: Array.isArray(parsed['custom_patterns'])
      ? (parsed['custom_patterns'] as Pattern[])
      : [],
    instantiation_history: Array.isArray(parsed['instantiation_history'])
      ? (parsed['instantiation_history'] as InstantiationHistoryEntry[])
      : [],
  };
}

/**
 * Save registry to disk. Creates the parent dir if missing.
 */
export function saveRegistry(registry: Registry, registryFile?: string): void {
  const filePath = registryFile ?? DEFAULT_REGISTRY_FILE;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

/**
 * List available reference architectures (built-in + custom). Returns
 * compact summaries with `components` reduced to a count.
 */
export function listPatterns(
  filter: ListFilter = {},
  options: CommonOptions = {}
): ListResult {
  const registryFile = options.registryFile ?? DEFAULT_REGISTRY_FILE;
  const registry = loadRegistry(registryFile);

  let allPatterns = [...registry.patterns, ...registry.custom_patterns];

  if (filter.category !== undefined) {
    allPatterns = allPatterns.filter((p) => p.category === filter.category);
  }

  return {
    success: true,
    patterns: allPatterns.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      components: p.components.length,
    })),
    total: allPatterns.length,
    categories: [...new Set(allPatterns.map((p) => p.category))],
  };
}

/**
 * Get a detailed reference architecture by id.
 */
export function getPattern(patternId: string, options: CommonOptions = {}): GetResult {
  const registryFile = options.registryFile ?? DEFAULT_REGISTRY_FILE;
  const registry = loadRegistry(registryFile);

  const allPatterns = [...registry.patterns, ...registry.custom_patterns];
  const pattern = allPatterns.find((p) => p.id === patternId);

  if (!pattern) {
    return { success: false, error: `Pattern not found: ${patternId}` };
  }

  return { success: true, pattern };
}

/**
 * Register a custom reference architecture pattern. Persists into
 * `registry.custom_patterns[]`.
 */
export function registerPattern(
  pattern: RegisterPatternInput | null | undefined,
  options: CommonOptions = {}
): RegisterResult {
  if (!pattern || !pattern.name || !pattern.description) {
    return { success: false, error: 'name and description are required' };
  }

  const registryFile = options.registryFile ?? DEFAULT_REGISTRY_FILE;
  const registry = loadRegistry(registryFile);

  const id = pattern.id ?? pattern.name.toLowerCase().replace(/\s+/g, '-');
  const allPatterns = [...registry.patterns, ...registry.custom_patterns];
  if (allPatterns.find((p) => p.id === id)) {
    return { success: false, error: `Pattern "${id}" already exists` };
  }

  const isKnownCategory =
    pattern.category !== undefined &&
    (PATTERN_CATEGORIES as readonly string[]).includes(pattern.category);

  const newPattern: Pattern = {
    id,
    name: pattern.name.trim(),
    category: isKnownCategory ? (pattern.category as string) : 'other',
    description: pattern.description.trim(),
    components: pattern.components ?? [],
    tech_stack: pattern.tech_stack ?? { suggested: [] },
    structure: pattern.structure ?? {},
    nfrs: pattern.nfrs ?? [],
    custom: true,
    created_at: new Date().toISOString(),
  };

  registry.custom_patterns.push(newPattern);
  saveRegistry(registry, registryFile);

  return { success: true, pattern: newPattern };
}

/**
 * Instantiate a pattern in a project: walks the pattern.structure map
 * and creates each directory plus a README.md describing its purpose.
 *
 * Path-safety: gates `root` through `assertInsideRoot` and re-asserts
 * each structure key resolves inside root before mkdirSync. Defends
 * against a custom pattern injecting `'../../../etc/'` or absolute-path
 * keys.
 */
export function instantiatePattern(
  patternId: string,
  root: string,
  options: CommonOptions = {}
): InstantiateResult {
  // Path-safety: gate root before any fs probe.
  assertInsideRoot(root, root, { schemaId: 'reference-architectures:instantiatePattern:root' });

  const registryFile = options.registryFile ?? join(root, DEFAULT_REGISTRY_FILE);
  const registry = loadRegistry(registryFile);
  const allPatterns = [...registry.patterns, ...registry.custom_patterns];
  const pattern = allPatterns.find((p) => p.id === patternId);

  if (!pattern) {
    return { success: false, error: `Pattern not found: ${patternId}` };
  }

  const created: string[] = [];
  const skipped: string[] = [];

  for (const [dir, description] of Object.entries(pattern.structure)) {
    // Defense in depth: re-validate each path resolves inside root. A
    // custom pattern (or polluted registry) might inject `'../../etc/'`.
    try {
      assertInsideRoot(dir, root, {
        schemaId: 'reference-architectures:instantiatePattern:structure',
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        // Reject traversal-shaped key — record as skipped, continue.
        skipped.push(dir);
        continue;
      }
      throw err;
    }
    const fullDir = join(root, dir);
    if (!existsSync(fullDir)) {
      mkdirSync(fullDir, { recursive: true });
      const leaf = dir.replace(/\/$/, '').split('/').pop() ?? dir;
      const readmePath = join(fullDir, 'README.md');
      writeFileSync(
        readmePath,
        `# ${leaf}\n\n${description}\n\nPart of the **${pattern.name}** reference architecture.\n`,
        'utf8'
      );
      created.push(dir);
    } else {
      skipped.push(dir);
    }
  }

  registry.instantiation_history.push({
    pattern_id: patternId,
    instantiated_at: new Date().toISOString(),
    root: resolve(root),
    directories_created: created.length,
  });
  saveRegistry(registry, registryFile);

  return {
    success: true,
    pattern: patternId,
    pattern_name: pattern.name,
    directories_created: created,
    directories_skipped: skipped,
    components: pattern.components,
    suggested_tech_stack: pattern.tech_stack,
    nfrs: pattern.nfrs,
  };
}
