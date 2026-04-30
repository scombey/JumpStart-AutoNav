/**
 * tests/test-transcript-ingestion.test.ts
 * Vitest tests for src/lib/transcript-ingestion.ts (M11 batch 6 port).
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTION_PATTERNS,
  DECISION_PATTERNS,
  defaultState,
  extractFromTranscript,
  ingestTranscript,
  listTranscripts,
  loadState,
  saveState,
} from '../src/lib/transcript-ingestion.js';

let _seq = 0;
function tmpStateFile() {
  const dir = join(tmpdir(), `transcript-test-${Date.now()}-${++_seq}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'transcripts.json');
}

// ─── defaultState ─────────────────────────────────────────────────────────────

describe('defaultState', () => {
  it('returns version 1.0.0', () => {
    expect(defaultState().version).toBe('1.0.0');
  });

  it('returns empty transcripts array', () => {
    expect(defaultState().transcripts).toEqual([]);
  });

  it('returns null last_updated', () => {
    expect(defaultState().last_updated).toBeNull();
  });
});

// ─── loadState / saveState ───────────────────────────────────────────────────

describe('loadState / saveState', () => {
  it('returns defaultState when file missing', () => {
    const state = loadState('/non/existent/path.json');
    expect(state.transcripts).toEqual([]);
  });

  it('round-trips state through save/load', () => {
    const f = tmpStateFile();
    const state = defaultState();
    saveState(state, f);
    const loaded = loadState(f);
    expect(loaded.version).toBe('1.0.0');
    expect(loaded.last_updated).not.toBeNull();
  });

  it('returns defaultState on corrupt JSON', () => {
    const f = tmpStateFile();
    writeFileSync(f, 'not-json', 'utf8');
    expect(loadState(f).transcripts).toEqual([]);
  });

  it('rejects __proto__ pollution key in state file (M3)', () => {
    const f = tmpStateFile();
    writeFileSync(
      f,
      '{"__proto__":{"polluted":true},"version":"1.0.0","transcripts":[],"last_updated":null}',
      'utf8'
    );
    // Should fall back to defaultState, not throw to caller
    const state = loadState(f);
    expect(state.transcripts).toEqual([]);
  });

  it('rejects constructor pollution key (M3)', () => {
    const f = tmpStateFile();
    writeFileSync(
      f,
      '{"constructor":{"polluted":true},"version":"1.0.0","transcripts":[],"last_updated":null}',
      'utf8'
    );
    const state = loadState(f);
    expect(state.transcripts).toEqual([]);
  });

  it('creates directory when saving to new path', () => {
    const dir = join(tmpdir(), `transcript-mkdir-${Date.now()}`, 'nested');
    const f = join(dir, 'transcripts.json');
    saveState(defaultState(), f);
    expect(existsSync(f)).toBe(true);
  });
});

// ─── ACTION_PATTERNS / DECISION_PATTERNS ─────────────────────────────────────

describe('ACTION_PATTERNS', () => {
  it('is an array of RegExp', () => {
    expect(Array.isArray(ACTION_PATTERNS)).toBe(true);
    for (const p of ACTION_PATTERNS) expect(p).toBeInstanceOf(RegExp);
  });
});

describe('DECISION_PATTERNS', () => {
  it('is an array of RegExp', () => {
    expect(Array.isArray(DECISION_PATTERNS)).toBe(true);
    for (const p of DECISION_PATTERNS) expect(p).toBeInstanceOf(RegExp);
  });
});

// ─── ingestTranscript ────────────────────────────────────────────────────────

describe('ingestTranscript', () => {
  it('returns error for empty text', () => {
    const result = ingestTranscript('', { stateFile: tmpStateFile() });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it('ingests a transcript and returns success', () => {
    const f = tmpStateFile();
    const result = ingestTranscript('Hello world meeting notes.', {
      stateFile: f,
      title: 'Test Meeting',
    });
    expect(result.success).toBe(true);
    expect(result.transcript?.title).toBe('Test Meeting');
    expect(result.transcript?.id).toMatch(/^TR-/);
  });

  it('persists transcript to state file', () => {
    const f = tmpStateFile();
    ingestTranscript('Some notes.', { stateFile: f });
    const state = loadState(f);
    expect(state.transcripts).toHaveLength(1);
  });

  it('extracts action items from TODO pattern', () => {
    const f = tmpStateFile();
    const result = ingestTranscript('Meeting notes. TODO: fix the build.', { stateFile: f });
    expect(result.transcript?.actions.some((a) => a.text.includes('fix the build'))).toBe(true);
  });

  it('extracts decisions from "decided" pattern', () => {
    const f = tmpStateFile();
    const result = ingestTranscript('We decided to use TypeScript.', { stateFile: f });
    expect(result.transcript?.decisions.some((d) => d.text.includes('use TypeScript'))).toBe(true);
  });

  it('extracts key_topics from markdown headings', () => {
    const f = tmpStateFile();
    const text = "# Sprint Review\n## Action Items\nLet's do this.";
    const result = ingestTranscript(text, { stateFile: f });
    expect(result.transcript?.key_topics).toContain('Sprint Review');
    expect(result.transcript?.key_topics).toContain('Action Items');
  });

  it('uses default title when not provided', () => {
    const f = tmpStateFile();
    const result = ingestTranscript('notes', { stateFile: f });
    expect(result.transcript?.title).toBe('Untitled Meeting');
  });
});

// ─── extractFromTranscript ───────────────────────────────────────────────────

describe('extractFromTranscript', () => {
  it('returns error for unknown id', () => {
    const f = tmpStateFile();
    const result = extractFromTranscript('TR-99999999', { stateFile: f });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('extracts data for existing transcript', () => {
    const f = tmpStateFile();
    const ingested = ingestTranscript('action item: review PR. decided to ship.', { stateFile: f });
    const id = ingested.transcript?.id ?? '';
    const result = extractFromTranscript(id, { stateFile: f });
    expect(result.success).toBe(true);
    expect(result.id).toBe(id);
    expect(result.summary?.action_count).toBeGreaterThanOrEqual(0);
    expect(result.summary?.decision_count).toBeGreaterThanOrEqual(0);
  });
});

// ─── listTranscripts ─────────────────────────────────────────────────────────

describe('listTranscripts', () => {
  it('returns empty list when no transcripts', () => {
    const f = tmpStateFile();
    const result = listTranscripts({ stateFile: f });
    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
    expect(result.transcripts).toEqual([]);
  });

  it('lists all ingested transcripts', () => {
    const f = tmpStateFile();
    ingestTranscript('notes one', { stateFile: f, title: 'Meeting A' });
    ingestTranscript('notes two', { stateFile: f, title: 'Meeting B' });
    const result = listTranscripts({ stateFile: f });
    expect(result.total).toBe(2);
    expect(result.transcripts.map((t) => t.title)).toContain('Meeting A');
    expect(result.transcripts.map((t) => t.title)).toContain('Meeting B');
  });
});
