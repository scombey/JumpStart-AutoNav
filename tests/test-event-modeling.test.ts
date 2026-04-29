/**
 * test-event-modeling.test.ts — M11 batch 2 port coverage.
 *
 * Verifies the TS port at `src/lib/event-modeling.ts` matches the legacy
 * `bin/lib/event-modeling.js` public surface:
 *   - `defaultState`, `loadState`, `saveState` shape + JSON round-trip
 *   - `defineTopic`, `defineEvent`, `defineSaga` happy-path + error-path
 *   - `generateReport` aggregation
 *   - M3 hardening: rejects `__proto__` / `constructor` / `prototype` keys
 *
 * @see src/lib/event-modeling.ts
 * @see bin/lib/event-modeling.js (legacy reference)
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultState,
  defineEvent,
  defineSaga,
  defineTopic,
  EVENT_TYPES,
  generateReport,
  loadState,
  PATTERNS,
  saveState,
} from '../src/lib/event-modeling.js';

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'event-modeling-'));
  stateFile = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('event-modeling — constants', () => {
  it('exposes the 4 EVENT_TYPES the legacy module documents', () => {
    expect(EVENT_TYPES).toEqual(['domain-event', 'integration-event', 'command', 'query']);
  });

  it('exposes the 5 PATTERNS the legacy module documents', () => {
    expect(PATTERNS).toEqual(['saga', 'choreography', 'orchestration', 'cqrs', 'event-sourcing']);
  });
});

describe('event-modeling — defaultState', () => {
  it('returns an empty state with the canonical shape', () => {
    const s = defaultState();
    expect(s.version).toBe('1.0.0');
    expect(s.topics).toEqual([]);
    expect(s.events).toEqual([]);
    expect(s.sagas).toEqual([]);
    expect(s.last_updated).toBeNull();
  });
});

describe('event-modeling — loadState/saveState', () => {
  it('returns defaultState when the file does not exist', () => {
    const s = loadState(stateFile);
    expect(s.topics).toEqual([]);
    expect(s.events).toEqual([]);
  });

  it('round-trips through saveState → loadState', () => {
    const s = defaultState();
    s.topics.push({
      id: 'TOPIC-1',
      name: 'orders',
      partitions: 4,
      retention: '7d',
      dlq: true,
      created_at: '2026-01-01T00:00:00Z',
    });
    saveState(s, stateFile);
    const reloaded = loadState(stateFile);
    expect(reloaded.topics).toHaveLength(1);
    expect(reloaded.topics[0].name).toBe('orders');
  });

  it('rejects __proto__ key (M3 hardening — defaults instead of polluting)', () => {
    writeFileSync(stateFile, JSON.stringify({ __proto__: { polluted: true }, topics: [] }));
    const s = loadState(stateFile);
    expect(s.topics).toEqual([]);
    // The Object prototype must NOT carry the polluted key.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects constructor / prototype keys', () => {
    writeFileSync(stateFile, JSON.stringify({ constructor: { x: 1 }, topics: [] }));
    const s = loadState(stateFile);
    expect(s.topics).toEqual([]);
  });

  it('falls back to defaultState on malformed JSON', () => {
    writeFileSync(stateFile, '{not-json');
    const s = loadState(stateFile);
    expect(s.topics).toEqual([]);
  });
});

describe('event-modeling — defineTopic', () => {
  it('creates a topic with default options (matches legacy: partitions=1, retention=7d, dlq=false)', () => {
    const r = defineTopic('orders', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.topic.name).toBe('orders');
      expect(r.topic.partitions).toBe(1); // legacy default
      expect(r.topic.retention).toBe('7d'); // legacy default
      expect(r.topic.dlq).toBe(false); // legacy default
    }
  });

  it('honours explicit options', () => {
    const r = defineTopic('audit', { partitions: 8, retention: '90d', dlq: false, stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.topic.partitions).toBe(8);
      expect(r.topic.retention).toBe('90d');
      expect(r.topic.dlq).toBe(false);
    }
  });

  it('rejects empty name', () => {
    const r = defineTopic('', { stateFile });
    expect(r.success).toBe(false);
  });

  it('persists the topic to disk', () => {
    defineTopic('orders', { stateFile });
    const reloaded = loadState(stateFile);
    expect(reloaded.topics).toHaveLength(1);
    expect(reloaded.topics[0].name).toBe('orders');
  });
});

describe('event-modeling — defineEvent', () => {
  it('creates an event with type=domain-event by default', () => {
    const t = defineTopic('orders', { stateFile });
    if (!t.success) throw new Error('topic setup failed');
    const r = defineEvent('OrderPlaced', t.topic.id, { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.event.name).toBe('OrderPlaced');
      expect(r.event.type).toBe('domain-event');
      // Legacy uses `topic: topicId` (not `topic_id`); TS port preserves verbatim.
      expect(r.event.topic).toBe(t.topic.id);
    }
  });

  it('rejects unknown event type', () => {
    const t = defineTopic('orders', { stateFile });
    if (!t.success) throw new Error('topic setup failed');
    const r = defineEvent('OrderPlaced', t.topic.id, { type: 'invalid-type', stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects empty name', () => {
    const r = defineEvent('', 'TOPIC-X', { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects when topicId is empty', () => {
    const r = defineEvent('OrderPlaced', '', { stateFile });
    expect(r.success).toBe(false);
  });
});

describe('event-modeling — defineSaga', () => {
  it('creates a saga with ordered steps', () => {
    const r = defineSaga(
      'CheckoutSaga',
      [{ name: 'reserve' }, { name: 'charge' }, { name: 'fulfill' }],
      { stateFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.saga.steps).toHaveLength(3);
      expect(r.saga.steps[0].order).toBe(1);
      expect(r.saga.steps[2].order).toBe(3);
      expect(r.saga.compensation).toBe('manual'); // default
    }
  });

  it('honours explicit compensation', () => {
    const r = defineSaga('S', [{ name: 'a' }], { compensation: 'auto', stateFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.saga.compensation).toBe('auto');
  });

  it('rejects when steps is missing', () => {
    const r = defineSaga('S', null as unknown as Array<Record<string, unknown>>, { stateFile });
    expect(r.success).toBe(false);
  });

  it('rejects when steps is not an array', () => {
    const r = defineSaga('S', 'not-an-array' as unknown as Array<Record<string, unknown>>, {
      stateFile,
    });
    expect(r.success).toBe(false);
  });
});

describe('event-modeling — generateReport', () => {
  it('aggregates topics + events + sagas into the report shape', () => {
    const t = defineTopic('orders', { dlq: true, stateFile });
    if (!t.success) throw new Error('setup');
    defineTopic('payments', { stateFile }); // legacy default dlq=false
    defineEvent('OrderPlaced', t.topic.id, { stateFile });
    defineEvent('OrderShipped', t.topic.id, { type: 'integration-event', stateFile });
    defineSaga('Checkout', [{ name: 'a' }], { stateFile });

    const r = generateReport({ stateFile });
    expect(r.total_topics).toBe(2);
    expect(r.total_events).toBe(2);
    expect(r.total_sagas).toBe(1);
    expect(r.topics_with_dlq).toBe(1);
    expect(r.events_by_type['domain-event']).toBe(1);
    expect(r.events_by_type['integration-event']).toBe(1);
  });

  it('returns zeroed counts on an empty state', () => {
    const r = generateReport({ stateFile });
    expect(r.total_topics).toBe(0);
    expect(r.total_events).toBe(0);
    expect(r.total_sagas).toBe(0);
  });
});
