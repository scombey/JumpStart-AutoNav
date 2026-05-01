/**
 * transcript-ingestion.ts — Meeting Transcript Ingestion.
 *
 * Public surface:
 *   - `ingestTranscript(text, options?)` => IngestResult
 *   - `extractFromTranscript(transcriptId, options?)` => ExtractResult
 *   - `listTranscripts(options?)` => ListResult
 *   - `loadState(stateFile?)` => TranscriptState
 *   - `saveState(state, stateFile?)` => void
 *   - `defaultState()` => TranscriptState
 *   - `ACTION_PATTERNS`
 *   - `DECISION_PATTERNS`
 *
 * Invariants:
 *   - `loadState` runs `rejectPollutionKeys` on parsed JSON.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'transcripts.json');

export const ACTION_PATTERNS: RegExp[] = [
  /\baction(?:\s+item)?:\s*(.+)/gi,
  /\bTODO:\s*(.+)/gi,
  /\b(?:will|should|needs? to)\s+(.+?)(?:\.|$)/gi,
];

export const DECISION_PATTERNS: RegExp[] = [
  /\bdecided?\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
  /\bdecision:\s*(.+)/gi,
  /\bagreed\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
];

export interface ActionItem {
  text: string;
  source_pattern: string;
}

export interface DecisionItem {
  text: string;
}

export interface Transcript {
  id: string;
  title: string;
  source: string;
  text_length: number;
  ingested_at: string;
  actions: ActionItem[];
  decisions: DecisionItem[];
  key_topics: string[];
}

export interface TranscriptState {
  version: string;
  transcripts: Transcript[];
  last_updated: string | null;
}

function rejectPollutionKeys(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') return;
  const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (forbidden.has(key)) throw new Error(`Prototype-pollution key detected: "${key}"`);
    rejectPollutionKeys((obj as Record<string, unknown>)[key]);
  }
}

export function defaultState(): TranscriptState {
  return { version: '1.0.0', transcripts: [], last_updated: null };
}

export function loadState(stateFile?: string): TranscriptState {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(fp)) return defaultState();
  try {
    const parsed: unknown = JSON.parse(readFileSync(fp, 'utf8'));
    rejectPollutionKeys(parsed);
    return parsed as TranscriptState;
  } catch {
    return defaultState();
  }
}

export function saveState(state: TranscriptState, stateFile?: string): void {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(fp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(fp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export interface IngestResult {
  success: boolean;
  transcript?: Transcript | undefined;
  error?: string | undefined;
}

export function ingestTranscript(
  text: string,
  options: {
    stateFile?: string | undefined;
    title?: string | undefined;
    source?: string | undefined;
  } = {}
): IngestResult {
  if (!text) return { success: false, error: 'Transcript text is required' };

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const transcript: Transcript = {
    id: `TR-${Date.now()}`,
    title: options.title ?? 'Untitled Meeting',
    source: options.source ?? 'manual',
    text_length: text.length,
    ingested_at: new Date().toISOString(),
    actions: [],
    decisions: [],
    key_topics: [],
  };

  for (const pattern of ACTION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    for (const match of text.matchAll(re)) {
      const matchedText = match[1];
      if (matchedText) {
        transcript.actions.push({
          text: matchedText.trim(),
          source_pattern: pattern.source.substring(0, 30),
        });
      }
    }
  }

  for (const pattern of DECISION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    for (const match of text.matchAll(re)) {
      const matchedText = match[1];
      if (matchedText) {
        transcript.decisions.push({ text: matchedText.trim() });
      }
    }
  }

  const headings = text.match(/^#+\s+(.+)$/gm);
  if (headings) {
    transcript.key_topics = headings.map((h) => h.replace(/^#+\s+/, '').trim());
  }

  state.transcripts.push(transcript);
  saveState(state, stateFile);

  return { success: true, transcript };
}

export interface ExtractResult {
  success: boolean;
  id?: string | undefined;
  title?: string | undefined;
  actions?: ActionItem[] | undefined;
  decisions?: DecisionItem[] | undefined;
  key_topics?: string[] | undefined;
  summary?: { action_count: number; decision_count: number; topic_count: number } | undefined;
  error?: string | undefined;
}

export function extractFromTranscript(
  transcriptId: string,
  options: { stateFile?: string | undefined } = {}
): ExtractResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const transcript = state.transcripts.find((t) => t.id === transcriptId);
  if (!transcript) return { success: false, error: `Transcript ${transcriptId} not found` };

  return {
    success: true,
    id: transcript.id,
    title: transcript.title,
    actions: transcript.actions,
    decisions: transcript.decisions,
    key_topics: transcript.key_topics,
    summary: {
      action_count: transcript.actions.length,
      decision_count: transcript.decisions.length,
      topic_count: transcript.key_topics.length,
    },
  };
}

export interface TranscriptSummary {
  id: string;
  title: string;
  actions: number;
  decisions: number;
  ingested_at: string;
}

export interface ListResult {
  success: true;
  total: number;
  transcripts: TranscriptSummary[];
}

export function listTranscripts(options: { stateFile?: string | undefined } = {}): ListResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  return {
    success: true,
    total: state.transcripts.length,
    transcripts: state.transcripts.map((t) => ({
      id: t.id,
      title: t.title,
      actions: t.actions.length,
      decisions: t.decisions.length,
      ingested_at: t.ingested_at,
    })),
  };
}
