/**
 * event-modeling.ts — Event-Driven Architecture Modeling port (M11 batch 2).
 *
 * Pure-library port of `bin/lib/event-modeling.js`. Public surface
 * preserved verbatim by name + signature:
 *
 *   - `defaultState()` => EventModelingState
 *   - `loadState(stateFile?)` => EventModelingState
 *   - `saveState(state, stateFile?)` => void
 *   - `defineTopic(name, options?)` => DefineTopicResult
 *   - `defineEvent(name, topicId, options?)` => DefineEventResult
 *   - `defineSaga(name, steps, options?)` => DefineSagaResult
 *   - `generateReport(options?)` => EventModelingReport
 *   - `EVENT_TYPES`, `PATTERNS`
 *
 * Behavior parity:
 *   - Default state file: `.jumpstart/state/event-modeling.json`.
 *   - 4 event types: domain-event, integration-event, command, query.
 *   - 5 patterns: saga, choreography, orchestration, cqrs, event-sourcing.
 *   - M3 hardening: shape-validated JSON; rejects __proto__/constructor/prototype.
 *
 * @see bin/lib/event-modeling.js (legacy reference)
 * @see specs/implementation-plan.md M11 strangler cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'event-modeling.json');

export const EVENT_TYPES = ['domain-event', 'integration-event', 'command', 'query'] as const;
export const PATTERNS = ['saga', 'choreography', 'orchestration', 'cqrs', 'event-sourcing'] as const;

export interface EventTopic {
  id: string;
  name: string;
  partitions: number;
  retention: string;
  dlq: boolean;
  created_at: string;
}

export interface RetryPolicy {
  max_retries: number;
  backoff: string;
}

export interface EventDefinition {
  id: string;
  name: string;
  topic: string;
  type: string;
  schema: Record<string, unknown>;
  idempotency_key: string | null;
  retry_policy: RetryPolicy;
  created_at: string;
}

export interface SagaStep {
  order: number;
  [k: string]: unknown;
}

export interface SagaDefinition {
  id: string;
  name: string;
  steps: SagaStep[];
  compensation: string;
  created_at: string;
}

export interface EventModelingState {
  version: string;
  topics: EventTopic[];
  events: EventDefinition[];
  sagas: SagaDefinition[];
  last_updated: string | null;
}

export interface DefineTopicOptions {
  stateFile?: string;
  partitions?: number;
  retention?: string;
  dlq?: boolean;
}

export interface DefineEventOptions {
  stateFile?: string;
  type?: string;
  schema?: Record<string, unknown>;
  idempotency_key?: string | null;
  retry_policy?: RetryPolicy;
}

export interface DefineSagaOptions {
  stateFile?: string;
  compensation?: string;
}

export interface StateOptions {
  stateFile?: string;
}

export interface DefineTopicResultSuccess {
  success: true;
  topic: EventTopic;
}
export interface DefineTopicResultFailure {
  success: false;
  error: string;
}
export type DefineTopicResult = DefineTopicResultSuccess | DefineTopicResultFailure;

export interface DefineEventResultSuccess {
  success: true;
  event: EventDefinition;
}
export interface DefineEventResultFailure {
  success: false;
  error: string;
}
export type DefineEventResult = DefineEventResultSuccess | DefineEventResultFailure;

export interface DefineSagaResultSuccess {
  success: true;
  saga: SagaDefinition;
}
export interface DefineSagaResultFailure {
  success: false;
  error: string;
}
export type DefineSagaResult = DefineSagaResultSuccess | DefineSagaResultFailure;

export interface EventModelingReport {
  success: true;
  total_topics: number;
  total_events: number;
  total_sagas: number;
  topics_with_dlq: number;
  events_by_type: Record<string, number>;
  topics: EventTopic[];
  events: EventDefinition[];
  sagas: SagaDefinition[];
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function safeParseState(raw: string): EventModelingState | null {
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
  const data = parsed as Partial<EventModelingState>;
  return {
    version: typeof data.version === 'string' ? data.version : '1.0.0',
    topics: Array.isArray(data.topics) ? (data.topics as EventTopic[]) : [],
    events: Array.isArray(data.events) ? (data.events as EventDefinition[]) : [],
    sagas: Array.isArray(data.sagas) ? (data.sagas as SagaDefinition[]) : [],
    last_updated: typeof data.last_updated === 'string' ? data.last_updated : null,
  };
}

export function defaultState(): EventModelingState {
  return { version: '1.0.0', topics: [], events: [], sagas: [], last_updated: null };
}

export function loadState(stateFile?: string): EventModelingState {
  const fp = stateFile || DEFAULT_STATE_FILE;
  if (!existsSync(fp)) return defaultState();
  const parsed = safeParseState(readFileSync(fp, 'utf8'));
  return parsed ?? defaultState();
}

export function saveState(state: EventModelingState, stateFile?: string): void {
  const fp = stateFile || DEFAULT_STATE_FILE;
  const dir = dirname(fp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(fp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function defineTopic(name: string, options: DefineTopicOptions = {}): DefineTopicResult {
  if (!name) return { success: false, error: 'Topic name is required' };

  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const topic: EventTopic = {
    id: `TOPIC-${Date.now()}`,
    name,
    partitions: options.partitions ?? 1,
    retention: options.retention ?? '7d',
    dlq: options.dlq ?? false,
    created_at: new Date().toISOString(),
  };

  state.topics.push(topic);
  saveState(state, stateFile);

  return { success: true, topic };
}

export function defineEvent(
  name: string,
  topicId: string,
  options: DefineEventOptions = {}
): DefineEventResult {
  if (!name || !topicId) return { success: false, error: 'name and topicId are required' };

  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const event: EventDefinition = {
    id: `EVT-${Date.now()}`,
    name,
    topic: topicId,
    type: options.type ?? 'domain-event',
    schema: options.schema ?? {},
    idempotency_key: options.idempotency_key ?? null,
    retry_policy: options.retry_policy ?? { max_retries: 3, backoff: 'exponential' },
    created_at: new Date().toISOString(),
  };

  if (!(EVENT_TYPES as readonly string[]).includes(event.type)) {
    return {
      success: false,
      error: `Unknown type: ${event.type}. Valid: ${EVENT_TYPES.join(', ')}`,
    };
  }

  state.events.push(event);
  saveState(state, stateFile);

  return { success: true, event };
}

export function defineSaga(
  name: string,
  steps: Array<Record<string, unknown>> | undefined | null,
  options: DefineSagaOptions = {}
): DefineSagaResult {
  if (!name || !steps || !Array.isArray(steps)) {
    return { success: false, error: 'name and steps array are required' };
  }

  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const saga: SagaDefinition = {
    id: `SAGA-${Date.now()}`,
    name,
    steps: steps.map((s, i) => ({ order: i + 1, ...s })),
    compensation: options.compensation ?? 'manual',
    created_at: new Date().toISOString(),
  };

  state.sagas.push(saga);
  saveState(state, stateFile);

  return { success: true, saga };
}

export function generateReport(options: StateOptions = {}): EventModelingReport {
  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const eventsByType: Record<string, number> = {};
  for (const e of state.events) {
    eventsByType[e.type] = (eventsByType[e.type] ?? 0) + 1;
  }

  return {
    success: true,
    total_topics: state.topics.length,
    total_events: state.events.length,
    total_sagas: state.sagas.length,
    topics_with_dlq: state.topics.filter((t) => t.dlq).length,
    events_by_type: eventsByType,
    topics: state.topics,
    events: state.events,
    sagas: state.sagas,
  };
}
