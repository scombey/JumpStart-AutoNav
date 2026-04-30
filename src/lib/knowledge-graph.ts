/**
 * knowledge-graph.ts — Knowledge Graph Across Initiatives (Item 81).
 *
 * Reuse patterns, controls, decisions, skills, and modules across the enterprise.
 *
 * State file: .jumpstart/state/knowledge-graph.json
 *
 * M3 hardening: validates JSON keys rejecting __proto__/constructor/prototype
 *   before merging into state.
 * ADR-009: stateFile paths must be pre-validated by caller or use default.
 * ADR-006: no process.exit — returns error objects on failure.
 * defaultState fallback: loadState returns defaultState() on parse failure.
 */

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_STATE_FILE = path.join('.jumpstart', 'state', 'knowledge-graph.json');

export const NODE_TYPES = ['pattern', 'decision', 'control', 'component', 'skill', 'module'] as const;
export const EDGE_TYPES = ['uses', 'implements', 'depends-on', 'related-to', 'supersedes'] as const;

export type NodeType = typeof NODE_TYPES[number];
export type EdgeType = typeof EDGE_TYPES[number];

export interface KGNode {
  id: string;
  name: string;
  type: NodeType;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface KGEdge {
  from: string;
  to: string;
  type: EdgeType;
  created_at: string;
}

export interface KGState {
  version: string;
  nodes: KGNode[];
  edges: KGEdge[];
  last_updated: string | null;
}

/** Dangerous keys that must never appear in parsed JSON objects */
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively check an object for prototype-pollution keys.
 * Throws if any blocked key is found.
 */
function assertNoPollution(obj: unknown, path_ = ''): void {
  if (obj === null || typeof obj !== 'object') return;
  for (const key of Object.keys(obj as object)) {
    if (BLOCKED_KEYS.has(key)) {
      throw new Error(`Prototype pollution key detected at ${path_}.${key}`);
    }
    assertNoPollution((obj as Record<string, unknown>)[key], `${path_}.${key}`);
  }
}

export function defaultState(): KGState {
  return { version: '1.0.0', nodes: [], edges: [], last_updated: null };
}

export function loadState(stateFile?: string | null | undefined): KGState {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  if (!fs.existsSync(fp)) return defaultState();
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    assertNoPollution(raw);
    return raw as KGState;
  } catch {
    return defaultState();
  }
}

export function saveState(state: KGState, stateFile?: string | null | undefined): void {
  const fp = stateFile ?? DEFAULT_STATE_FILE;
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(fp, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export interface AddNodeOptions {
  stateFile?: string | null | undefined;
  tags?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface AddNodeResult {
  success: boolean;
  node?: KGNode | undefined;
  error?: string | undefined;
}

export function addNode(name: string, type: string, options: AddNodeOptions = {}): AddNodeResult {
  if (!name || !type) return { success: false, error: 'name and type are required' };
  if (!(NODE_TYPES as readonly string[]).includes(type)) {
    return { success: false, error: `Unknown type: ${type}. Valid: ${NODE_TYPES.join(', ')}` };
  }

  const stateFile = options.stateFile;
  const state = loadState(stateFile);

  const node: KGNode = {
    id: `KG-${Date.now()}`,
    name,
    type: type as NodeType,
    tags: options.tags ?? [],
    metadata: options.metadata ?? {},
    created_at: new Date().toISOString()
  };

  state.nodes.push(node);
  saveState(state, stateFile);

  return { success: true, node };
}

export interface AddEdgeOptions {
  stateFile?: string | null | undefined;
}

export interface AddEdgeResult {
  success: boolean;
  edge?: KGEdge | undefined;
  error?: string | undefined;
}

export function addEdge(fromId: string, toId: string, edgeType: string, options: AddEdgeOptions = {}): AddEdgeResult {
  if (!fromId || !toId || !edgeType) return { success: false, error: 'fromId, toId, and edgeType are required' };
  if (!(EDGE_TYPES as readonly string[]).includes(edgeType)) {
    return { success: false, error: `Unknown edge type: ${edgeType}. Valid: ${EDGE_TYPES.join(', ')}` };
  }

  const stateFile = options.stateFile;
  const state = loadState(stateFile);

  const edge: KGEdge = { from: fromId, to: toId, type: edgeType as EdgeType, created_at: new Date().toISOString() };
  state.edges.push(edge);
  saveState(state, stateFile);

  return { success: true, edge };
}

export interface QueryOptions {
  stateFile?: string | null | undefined;
  type?: string | undefined;
  tag?: string | undefined;
  search?: string | undefined;
}

export interface QueryResult {
  success: boolean;
  nodes: number;
  edges: number;
  results: KGNode[];
  related_edges: KGEdge[];
}

export function queryGraph(options: QueryOptions = {}): QueryResult {
  const state = loadState(options.stateFile);

  let nodes = state.nodes;
  if (options.type) nodes = nodes.filter(n => n.type === options.type);
  if (options.tag) nodes = nodes.filter(n => n.tags.includes(options.tag as string));
  if (options.search) {
    const q = options.search.toLowerCase();
    nodes = nodes.filter(n => n.name.toLowerCase().includes(q));
  }

  const nodeIds = new Set(nodes.map(n => n.id));
  return {
    success: true,
    nodes: nodes.length,
    edges: state.edges.length,
    results: nodes,
    related_edges: state.edges.filter(e => nodeIds.has(e.from) || nodeIds.has(e.to))
  };
}

export interface ReportOptions {
  stateFile?: string | null | undefined;
}

export interface ReportResult {
  success: boolean;
  total_nodes: number;
  total_edges: number;
  by_type: Record<string, number>;
}

export function generateReport(options: ReportOptions = {}): ReportResult {
  const state = loadState(options.stateFile);

  const byType: Record<string, number> = {};
  for (const n of state.nodes) {
    byType[n.type] = (byType[n.type] ?? 0) + 1;
  }

  return {
    success: true,
    total_nodes: state.nodes.length,
    total_edges: state.edges.length,
    by_type: byType
  };
}
