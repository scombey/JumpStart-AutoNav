/**
 * spec-comments.ts — Inline Spec Review Comments port (M11 batch 6).
 *
 * Pure-library port of `bin/lib/spec-comments.js` (CJS). Public surface:
 *   - `addComment(artifact, section, text, options?)` => CommentResult
 *   - `resolveComment(commentId, resolution, options?)` => CommentResult
 *   - `listComments(options?)` => ListCommentsResult
 *   - `assignComment(commentId, assignee, options?)` => CommentResult
 *   - `loadState(stateFile?)` => CommentsState
 *   - `saveState(state, stateFile?)` => void
 *   - `defaultState()` => CommentsState
 *   - `COMMENT_STATUSES`
 *
 * M3 hardening:
 *   - `loadState` runs `rejectPollutionKeys` on parsed JSON.
 *   - On parse failure or pollution, returns `defaultState()`.
 *
 * Path-safety per ADR-009: No user-supplied paths to fs. Not applicable.
 *
 * @see bin/lib/spec-comments.js (legacy reference)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_STATE_FILE = join('.jumpstart', 'state', 'spec-comments.json');

export const COMMENT_STATUSES = ['open', 'resolved', 'wontfix', 'deferred'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export interface Comment {
  id: string;
  artifact: string;
  section: string | null;
  text: string;
  author: string;
  assignee: string | null;
  status: CommentStatus;
  created_at: string;
  resolved_at: string | null;
  replies: unknown[];
  resolution?: string | undefined;
  resolved_by?: string | undefined;
}

export interface CommentsState {
  version: string;
  created_at: string;
  last_updated: string | null;
  comments: Comment[];
}

function rejectPollutionKeys(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') return;
  const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (forbidden.has(key)) throw new Error(`Prototype-pollution key detected: "${key}"`);
    rejectPollutionKeys((obj as Record<string, unknown>)[key]);
  }
}

export function defaultState(): CommentsState {
  return {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    last_updated: null,
    comments: [],
  };
}

export function loadState(stateFile?: string): CommentsState {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  if (!existsSync(fp)) return defaultState();
  try {
    const parsed: unknown = JSON.parse(readFileSync(fp, 'utf8'));
    rejectPollutionKeys(parsed);
    return parsed as CommentsState;
  } catch {
    return defaultState();
  }
}

export function saveState(state: CommentsState, stateFile?: string): void {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  const dir = dirname(fp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  writeFileSync(fp, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export interface CommentResult {
  success: boolean;
  comment?: Comment | undefined;
  error?: string | undefined;
}

export function addComment(
  artifact: string,
  section: string | null | undefined,
  text: string,
  options: {
    stateFile?: string | undefined;
    author?: string | undefined;
    assignee?: string | undefined;
  } = {},
): CommentResult {
  if (!artifact || !text) return { success: false, error: 'artifact and text are required' };

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const comment: Comment = {
    id: `C-${Date.now()}`,
    artifact,
    section: section ?? null,
    text,
    author: options.author ?? 'anonymous',
    assignee: options.assignee ?? null,
    status: 'open',
    created_at: new Date().toISOString(),
    resolved_at: null,
    replies: [],
  };

  state.comments.push(comment);
  saveState(state, stateFile);

  return { success: true, comment };
}

export function resolveComment(
  commentId: string,
  resolution: string | undefined,
  options: { stateFile?: string | undefined; author?: string | undefined } = {},
): CommentResult {
  if (!commentId) return { success: false, error: 'commentId is required' };

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const comment = state.comments.find(c => c.id === commentId);
  if (!comment) return { success: false, error: `Comment ${commentId} not found` };

  comment.status = 'resolved';
  comment.resolution = resolution ?? 'Resolved';
  comment.resolved_at = new Date().toISOString();
  comment.resolved_by = options.author ?? 'anonymous';
  saveState(state, stateFile);

  return { success: true, comment };
}

export interface ListCommentsResult {
  success: true;
  total: number;
  comments: Comment[];
}

export function listComments(
  options: {
    stateFile?: string | undefined;
    artifact?: string | undefined;
    status?: string | undefined;
    assignee?: string | undefined;
  } = {},
): ListCommentsResult {
  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  let comments = state.comments;

  if (options.artifact) {
    comments = comments.filter(c => c.artifact === options.artifact);
  }
  if (options.status) {
    comments = comments.filter(c => c.status === options.status);
  }
  if (options.assignee) {
    comments = comments.filter(c => c.assignee === options.assignee);
  }

  return { success: true, total: comments.length, comments };
}

export function assignComment(
  commentId: string,
  assignee: string,
  options: { stateFile?: string | undefined } = {},
): CommentResult {
  if (!commentId || !assignee) return { success: false, error: 'commentId and assignee are required' };

  const stateFile = options.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);

  const comment = state.comments.find(c => c.id === commentId);
  if (!comment) return { success: false, error: `Comment ${commentId} not found` };

  comment.assignee = assignee;
  saveState(state, stateFile);

  return { success: true, comment };
}
