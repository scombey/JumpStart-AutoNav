/**
 * model-router.ts — multi-model routing port (T4.3.1).
 *
 * Pure-library port of `bin/lib/model-router.js`. Public surface
 * preserved verbatim by name + signature:
 *
 *   - `TASK_TYPES` (constant array)
 *   - `DEFAULT_ROUTING` (constant table)
 *   - `loadConfig(configFile?)`
 *   - `saveConfig(config, configFile?)`
 *   - `routeTask(taskType, options?)`
 *   - `configureRoute(taskType, model, options?)`
 *   - `generateReport(options?)`
 *
 * Behavior parity:
 *   - 8 task types (planning/coding/review/diagramming/summarization/
 *     testing/documentation/analysis).
 *   - Default config file: `.jumpstart/model-routing.json`.
 *   - Soft-fail on missing/corrupt config.
 *   - `configureRoute` stamps `configured_at` ISO timestamp.
 *
 * @see bin/lib/model-router.js (legacy reference)
 * @see specs/implementation-plan.md T4.3.1
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

// Public types

export type TaskType =
  | 'planning'
  | 'coding'
  | 'review'
  | 'diagramming'
  | 'summarization'
  | 'testing'
  | 'documentation'
  | 'analysis';

export interface RouteEntry {
  model: string;
  reason: string;
  configured_at?: string;
}

export interface ModelRouterConfig {
  routing: Partial<Record<TaskType, RouteEntry>>;
}

export interface RouteOptions {
  configFile?: string;
  reason?: string;
}

export interface RouteTaskResult {
  success: boolean;
  task_type?: TaskType;
  model?: string;
  reason?: string;
  overridden?: boolean;
  error?: string;
}

export interface ConfigureRouteResult {
  success: boolean;
  task_type?: TaskType;
  model?: string;
  routing?: Partial<Record<TaskType, RouteEntry>>;
  error?: string;
}

export interface ModelRouterReport {
  success: boolean;
  task_types: number;
  configured_routes: number;
  unique_models: number;
  models: string[];
  routing: Partial<Record<TaskType, RouteEntry>>;
}

// Catalogs (preserved verbatim from legacy)

export const TASK_TYPES: readonly TaskType[] = [
  'planning',
  'coding',
  'review',
  'diagramming',
  'summarization',
  'testing',
  'documentation',
  'analysis',
];

export const DEFAULT_ROUTING: Record<TaskType, RouteEntry> = {
  planning: { model: 'claude-3-opus', reason: 'Complex reasoning for architecture decisions' },
  coding: { model: 'claude-3-sonnet', reason: 'Balanced quality and speed for code generation' },
  review: { model: 'gpt-4o', reason: 'Thorough code review capabilities' },
  diagramming: { model: 'claude-3-haiku', reason: 'Fast diagram generation' },
  summarization: { model: 'claude-3-haiku', reason: 'Efficient summarization' },
  testing: { model: 'claude-3-sonnet', reason: 'Good test generation quality' },
  documentation: { model: 'claude-3-haiku', reason: 'Efficient doc generation' },
  analysis: { model: 'claude-3-opus', reason: 'Deep analysis capabilities' },
};

const DEFAULT_CONFIG_FILE = path.join('.jumpstart', 'model-routing.json');

// Implementation

/** Load routing config; returns defaults on missing/corrupt. */
export function loadConfig(configFile?: string): ModelRouterConfig {
  const filePath = configFile || DEFAULT_CONFIG_FILE;
  if (!existsSync(filePath)) return { routing: { ...DEFAULT_ROUTING } };
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as ModelRouterConfig;
  } catch {
    return { routing: { ...DEFAULT_ROUTING } };
  }
}

/** Persist routing config (auto-creates parent dir + trailing newline). */
export function saveConfig(config: ModelRouterConfig, configFile?: string): void {
  const filePath = configFile || DEFAULT_CONFIG_FILE;
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/** Route a task to its configured model (or default). */
export function routeTask(taskType: string, options: RouteOptions = {}): RouteTaskResult {
  if (!TASK_TYPES.includes(taskType as TaskType)) {
    return {
      success: false,
      error: `Invalid task type. Must be one of: ${TASK_TYPES.join(', ')}`,
    };
  }

  const configFile = options.configFile || DEFAULT_CONFIG_FILE;
  const config = loadConfig(configFile);
  const routing = config.routing || DEFAULT_ROUTING;
  const route = routing[taskType as TaskType] || DEFAULT_ROUTING[taskType as TaskType];

  return {
    success: true,
    task_type: taskType as TaskType,
    model: route.model,
    reason: route.reason,
    overridden: !!config.routing?.[taskType as TaskType],
  };
}

/** Configure routing for a specific task type. */
export function configureRoute(
  taskType: string,
  model: string,
  options: RouteOptions = {}
): ConfigureRouteResult {
  if (!TASK_TYPES.includes(taskType as TaskType)) {
    return {
      success: false,
      error: `Invalid task type. Must be one of: ${TASK_TYPES.join(', ')}`,
    };
  }

  const configFile = options.configFile || DEFAULT_CONFIG_FILE;
  const config = loadConfig(configFile);
  if (!config.routing) config.routing = { ...DEFAULT_ROUTING };

  config.routing[taskType as TaskType] = {
    model,
    reason: options.reason || `Custom routing to ${model}`,
    configured_at: new Date().toISOString(),
  };

  saveConfig(config, configFile);

  return { success: true, task_type: taskType as TaskType, model, routing: config.routing };
}

/** Routing summary report. */
export function generateReport(options: RouteOptions = {}): ModelRouterReport {
  const configFile = options.configFile || DEFAULT_CONFIG_FILE;
  const config = loadConfig(configFile);
  const routing = config.routing || DEFAULT_ROUTING;

  const models = Array.from(new Set(Object.values(routing).map((r) => (r as RouteEntry).model)));

  return {
    success: true,
    task_types: TASK_TYPES.length,
    configured_routes: Object.keys(routing).length,
    unique_models: models.length,
    models,
    routing,
  };
}
