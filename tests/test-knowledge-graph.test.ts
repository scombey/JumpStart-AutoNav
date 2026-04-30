/**
 * tests/test-knowledge-graph.test.ts — vitest suite for src/lib/knowledge-graph.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addEdge,
  addNode,
  defaultState,
  EDGE_TYPES,
  generateReport,
  loadState,
  NODE_TYPES,
  queryGraph,
  saveState,
} from '../src/lib/knowledge-graph.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-test-'));
  stateFile = path.join(tmpDir, 'kg.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── constants ───────────────────────────────────────────────────────────────

describe('constants', () => {
  it('NODE_TYPES includes expected types', () => {
    expect(NODE_TYPES).toContain('pattern');
    expect(NODE_TYPES).toContain('decision');
    expect(NODE_TYPES).toContain('skill');
  });

  it('EDGE_TYPES includes expected types', () => {
    expect(EDGE_TYPES).toContain('uses');
    expect(EDGE_TYPES).toContain('depends-on');
  });
});

// ─── defaultState ────────────────────────────────────────────────────────────

describe('defaultState', () => {
  it('returns empty nodes and edges', () => {
    const s = defaultState();
    expect(s.nodes).toEqual([]);
    expect(s.edges).toEqual([]);
    expect(s.last_updated).toBeNull();
  });
});

// ─── loadState / saveState ───────────────────────────────────────────────────

describe('loadState / saveState', () => {
  it('returns defaultState when file does not exist', () => {
    const s = loadState('/nonexistent/state.json');
    expect(s.nodes).toEqual([]);
  });

  it('round-trips state through save/load', () => {
    const orig = defaultState();
    orig.nodes.push({
      id: 'KG-1',
      name: 'test',
      type: 'pattern',
      tags: [],
      metadata: {},
      created_at: 'now',
    });
    saveState(orig, stateFile);
    const loaded = loadState(stateFile);
    expect(loaded.nodes.length).toBe(1);
    const n = loaded.nodes[0];
    if (!n) throw new Error('expected node');
    expect(n.name).toBe('test');
  });

  it('returns defaultState when JSON is malformed', () => {
    fs.writeFileSync(stateFile, 'NOT_JSON', 'utf8');
    const s = loadState(stateFile);
    expect(s.nodes).toEqual([]);
  });

  it('returns defaultState when file contains __proto__ pollution key', () => {
    // Raw bytes that JSON.parse would see as __proto__ key
    fs.writeFileSync(
      stateFile,
      '{"__proto__":{"evil":1},"version":"1.0.0","nodes":[],"edges":[],"last_updated":null}',
      'utf8'
    );
    const s = loadState(stateFile);
    // Should fall back to defaultState due to pollution detection
    expect(s.nodes).toEqual([]);
  });

  it('returns defaultState when file contains constructor pollution key', () => {
    fs.writeFileSync(
      stateFile,
      '{"constructor":{"prototype":{}},"version":"1.0.0","nodes":[],"edges":[],"last_updated":null}',
      'utf8'
    );
    const s = loadState(stateFile);
    expect(s.nodes).toEqual([]);
  });
});

// ─── addNode ─────────────────────────────────────────────────────────────────

describe('addNode', () => {
  it('adds a node and returns success', () => {
    const result = addNode('MyPattern', 'pattern', { stateFile });
    expect(result.success).toBe(true);
    expect(result.node?.name).toBe('MyPattern');
    expect(result.node?.type).toBe('pattern');
  });

  it('persists the node to state file', () => {
    addNode('Stored', 'skill', { stateFile });
    const state = loadState(stateFile);
    expect(state.nodes.length).toBe(1);
  });

  it('returns error for missing name', () => {
    const result = addNode('', 'pattern', { stateFile });
    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('returns error for unknown type', () => {
    const result = addNode('Test', 'unknown-type', { stateFile });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown type');
  });
});

// ─── addEdge ─────────────────────────────────────────────────────────────────

describe('addEdge', () => {
  it('adds an edge and returns success', () => {
    const result = addEdge('KG-1', 'KG-2', 'uses', { stateFile });
    expect(result.success).toBe(true);
    expect(result.edge?.from).toBe('KG-1');
    expect(result.edge?.type).toBe('uses');
  });

  it('returns error for missing fromId', () => {
    const result = addEdge('', 'KG-2', 'uses', { stateFile });
    expect(result.success).toBe(false);
  });

  it('returns error for unknown edge type', () => {
    const result = addEdge('KG-1', 'KG-2', 'unknown-edge', { stateFile });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown edge type');
  });
});

// ─── queryGraph ──────────────────────────────────────────────────────────────

describe('queryGraph', () => {
  it('returns empty results for empty state', () => {
    const result = queryGraph({ stateFile });
    expect(result.success).toBe(true);
    expect(result.nodes).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('filters nodes by type', () => {
    addNode('P1', 'pattern', { stateFile });
    addNode('S1', 'skill', { stateFile });
    const result = queryGraph({ stateFile, type: 'pattern' });
    expect(result.nodes).toBe(1);
    const n = result.results[0];
    if (!n) throw new Error('expected node');
    expect(n.type).toBe('pattern');
  });

  it('filters nodes by search term', () => {
    addNode('EncryptionPattern', 'pattern', { stateFile });
    addNode('CachingSkill', 'skill', { stateFile });
    const result = queryGraph({ stateFile, search: 'encrypt' });
    expect(result.nodes).toBe(1);
  });
});

// ─── generateReport ──────────────────────────────────────────────────────────

describe('generateReport', () => {
  it('returns zero counts for empty state', () => {
    const result = generateReport({ stateFile });
    expect(result.success).toBe(true);
    expect(result.total_nodes).toBe(0);
    expect(result.total_edges).toBe(0);
  });

  it('counts nodes by type correctly', () => {
    addNode('P1', 'pattern', { stateFile });
    addNode('P2', 'pattern', { stateFile });
    addNode('S1', 'skill', { stateFile });
    const result = generateReport({ stateFile });
    expect(result.by_type.pattern).toBe(2);
    expect(result.by_type.skill).toBe(1);
  });
});
