/**
 * graph.ts — spec-graph dependency map port (T4.2.5).
 *
 * Pure-library port of `bin/lib/graph.js`. Public surface preserved
 * verbatim by name + signature:
 *
 *   - `loadGraph(graphPath)`
 *   - `saveGraph(graphPath, graph)`
 *   - `addNode(graph, id, type, metadata?)`
 *   - `addEdge(graph, from, to, relationship)`
 *   - `findConnected(graph, nodeId, direction?)`
 *   - `buildFromSpecs(specsDir)`
 *   - `getCoverage(graph)`
 *   - `auditTaskDependencies(graph)`
 *
 * Behavior parity:
 *   - Initial graph shape: `{ version:'1.0.0', generated, nodes:{}, edges:[] }`.
 *   - `saveGraph` mutates `graph.lastUpdated` in place AND auto-creates
 *     parent dirs (legacy quirk preserved).
 *   - `addEdge` is duplicate-aware (same from/to/relationship triple
 *     never inserted twice).
 *   - `auditTaskDependencies` returns DFS-detected cycles plus
 *     parallel-group level assignments and milestone inversions.
 *
 * @see bin/lib/graph.js (legacy reference)
 * @see specs/implementation-plan.md T4.2.5
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

// Pit Crew M3 Adversary F2 + F4 + F9: keys we never accept into a node
// id, edge endpoint, or arbitrary object key. `__proto__` lookup
// pollutes the prototype chain of `graph.nodes` (a plain object map).
// `constructor` and `prototype` round out the standard prototype-
// poisoning catalog. Apply at every entry point that writes into the
// nodes map or trusts a JSON-loaded graph.
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

function rejectForbiddenKey(key: unknown, fnName: string): void {
  if (typeof key === 'string' && FORBIDDEN_KEYS.has(key)) {
    throw new Error(
      `${fnName}: forbidden key "${key}" — prototype pollution rejected (Pit Crew M3 Adv F2).`
    );
  }
}

// Public types

export interface GraphNode {
  id: string;
  type: string;
  name?: string | undefined;
  path?: string | undefined;
  addedAt?: string | undefined;
  updated_at?: string | undefined;
  [extra: string]: unknown;
}

export interface GraphEdge {
  from: string;
  to: string;
  relationship: string;
}

export interface SpecGraph {
  version: string;
  generated: string;
  lastUpdated?: string | undefined;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

export interface ConnectionResult {
  node: GraphNode;
  relationship: string;
  direction: 'incoming' | 'outgoing';
}

export interface CoverageResult {
  stories: number;
  tasks: number;
  files: number;
  unmappedStories: string[];
}

export interface ParallelGroup {
  level: number;
  tasks: string[];
}

export interface InversionEntry {
  task: string;
  depends_on: string;
  reason: string;
}

export interface AuditResult {
  task_count: number;
  edge_count: number;
  circular_dependencies: string[][];
  inversions: InversionEntry[];
  parallel_groups: ParallelGroup[];
  critical_path_length: number;
  has_issues: boolean;
}

// Implementation

/** Load `graphPath`, or return a fresh empty graph if missing.
 *
 *  Pit Crew M3 Adversary F4: validates the loaded JSON shape before
 *  returning. Rejects `nodes`/`edges` of wrong type AND any node id
 *  in `FORBIDDEN_KEYS` (prototype-pollution defense paired with F2).
 *  On invalid shape, throws a descriptive error rather than returning
 *  a poisoned graph that silently breaks downstream walks.
 */
export function loadGraph(graphPath: string): SpecGraph {
  if (!existsSync(graphPath)) {
    return {
      version: '1.0.0',
      generated: new Date().toISOString(),
      nodes: {},
      edges: [],
    };
  }
  const parsed = JSON.parse(readFileSync(graphPath, 'utf8')) as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`loadGraph: expected JSON object at ${graphPath}, got ${typeof parsed}`);
  }
  const obj = parsed as Record<string, unknown>;
  if (
    obj.nodes !== undefined &&
    (typeof obj.nodes !== 'object' || obj.nodes === null || Array.isArray(obj.nodes))
  ) {
    throw new Error(`loadGraph: nodes must be an object map at ${graphPath}.`);
  }
  if (obj.edges !== undefined && !Array.isArray(obj.edges)) {
    throw new Error(`loadGraph: edges must be an array at ${graphPath}.`);
  }
  // F2 + F4 prototype-pollution rejection: a malicious manifest can
  // declare `__proto__` as a node id; reject before it touches the map.
  for (const id of Object.keys(obj.nodes || {})) {
    rejectForbiddenKey(id, 'loadGraph');
  }
  return parsed as SpecGraph;
}

/** Save `graph` to `graphPath`, creating parent dirs and stamping
 *  `lastUpdated`. */
export function saveGraph(graphPath: string, graph: SpecGraph): void {
  graph.lastUpdated = new Date().toISOString();
  const dir = path.dirname(graphPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf8');
}

/** Add (or replace) a node with metadata.
 *
 *  Pit Crew M3 Adversary F2: rejects `__proto__`, `constructor`, and
 *  `prototype` as node ids — assigning to those keys on a plain
 *  `graph.nodes` object pollutes its prototype chain, allowing an
 *  attacker who reaches `addNode` (e.g. via a build step that ingests
 *  user-controlled IDs) to plant arbitrary fields on every subsequent
 *  unknown lookup.
 */
export function addNode(
  graph: SpecGraph,
  id: string,
  type: string,
  metadata: Record<string, unknown> = {}
): void {
  rejectForbiddenKey(id, 'addNode');
  graph.nodes[id] = {
    id,
    type,
    ...metadata,
    addedAt: new Date().toISOString(),
  };
}

/** Add an edge. Duplicate (same from/to/relationship) triples skipped. */
export function addEdge(graph: SpecGraph, from: string, to: string, relationship: string): void {
  const dup = graph.edges.some(
    (e) => e.from === from && e.to === to && e.relationship === relationship
  );
  if (!dup) {
    graph.edges.push({ from, to, relationship });
  }
}

/** Find all nodes connected to `nodeId`. Default direction is 'both'. */
export function findConnected(
  graph: SpecGraph,
  nodeId: string,
  direction: 'incoming' | 'outgoing' | 'both' = 'both'
): ConnectionResult[] {
  const results: ConnectionResult[] = [];

  for (const edge of graph.edges) {
    if ((direction === 'both' || direction === 'outgoing') && edge.from === nodeId) {
      results.push({
        node: graph.nodes[edge.to] || { id: edge.to, type: 'unknown' },
        relationship: edge.relationship,
        direction: 'outgoing',
      });
    }
    if ((direction === 'both' || direction === 'incoming') && edge.to === nodeId) {
      results.push({
        node: graph.nodes[edge.from] || { id: edge.from, type: 'unknown' },
        relationship: edge.relationship,
        direction: 'incoming',
      });
    }
  }

  return results;
}

/**
 * Build a graph by parsing PRD + implementation plan. Recognized
 * structures:
 *   - `### Epic E<n>: <name>`
 *   - `#### Story E<n>-S<n>: <name>` (auto-edge: epic-contains-story)
 *   - `### Task M<n>-T<n>: <name>` (auto-edge: task-implements-story
 *     when `**Story Reference** | E<n>-S<n>` lives in same block;
 *     auto-edge: task-creates-file when `**Files** | foo, bar` exists)
 */
export function buildFromSpecs(specsDir: string): SpecGraph {
  const graph: SpecGraph = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    nodes: {},
    edges: [],
  };

  const prdPath = path.join(specsDir, 'prd.md');
  if (existsSync(prdPath)) {
    const prdContent = readFileSync(prdPath, 'utf8');

    for (const m of prdContent.matchAll(/### Epic (E\d+):\s*(.+)/g)) {
      const epicId = m[1];
      const epicName = m[2];
      if (epicId === undefined || epicName === undefined) continue;
      addNode(graph, epicId, 'epic', { name: epicName.trim() });
    }

    for (const m of prdContent.matchAll(/#### Story (E\d+-S\d+):\s*(.+)/g)) {
      const storyId = m[1];
      const storyName = m[2];
      if (storyId === undefined || storyName === undefined) continue;
      const epicId = storyId.split('-')[0];
      if (epicId === undefined) continue;
      addNode(graph, storyId, 'story', { name: storyName.trim() });
      addEdge(graph, epicId, storyId, 'contains');
    }
  }

  const planPath = path.join(specsDir, 'implementation-plan.md');
  if (existsSync(planPath)) {
    const planContent = readFileSync(planPath, 'utf8');

    const taskMatches = Array.from(planContent.matchAll(/### Task (M\d+-T\d+):\s*(.+)/g));
    for (const taskMatch of taskMatches) {
      const taskId = taskMatch[1];
      const taskName = taskMatch[2];
      if (taskId === undefined || taskName === undefined) continue;
      const cleanedName = taskName.replace(/\s*`\[.*?\]`\s*/, '').trim();
      addNode(graph, taskId, 'task', { name: cleanedName });

      const blockStart = taskMatch.index ?? 0;
      const blockEnd = planContent.indexOf('### Task', blockStart + 1);
      const block = planContent.substring(blockStart, blockEnd === -1 ? undefined : blockEnd);

      const storyRefMatch = block.match(/\*\*Story Reference\*\*\s*\|\s*(E\d+-S\d+)/);
      if (storyRefMatch?.[1] !== undefined) {
        addEdge(graph, taskId, storyRefMatch[1], 'implements');
      }

      const filesMatch = block.match(/\*\*Files\*\*\s*\|\s*(.+)/);
      if (filesMatch?.[1] !== undefined) {
        const files = filesMatch[1].split(',').map((f) => f.trim().replace(/`/g, ''));
        for (const file of files) {
          if (file && file !== '-' && file !== 'None') {
            addNode(graph, file, 'file', {});
            addEdge(graph, taskId, file, 'creates');
          }
        }
      }
    }
  }

  return graph;
}

/** Coverage stats: stories vs implementing tasks. */
export function getCoverage(graph: SpecGraph): CoverageResult {
  const stories = Object.values(graph.nodes).filter((n) => n.type === 'story');
  const tasks = Object.values(graph.nodes).filter((n) => n.type === 'task');
  const files = Object.values(graph.nodes).filter((n) => n.type === 'file');

  const implementedStories = new Set(
    graph.edges.filter((e) => e.relationship === 'implements').map((e) => e.to)
  );

  const unmappedStories = stories.filter((s) => !implementedStories.has(s.id)).map((s) => s.id);

  return {
    stories: stories.length,
    tasks: tasks.length,
    files: files.length,
    unmappedStories,
  };
}

/**
 * Audit task dependencies. Note: the legacy implementation expected
 * `graph.nodes` to be an ARRAY (not the canonical map). We accept
 * either shape — array OR Record map — and normalize internally for
 * forward-compat. Edge type field: legacy used `e.type === 'depends_on'`,
 * port honors both `e.type` and `e.relationship` for parity with newer
 * builders.
 */
export function auditTaskDependencies(graph: {
  nodes?: GraphNode[] | Record<string, GraphNode>;
  edges?: Array<GraphEdge & { type?: string }>;
}): AuditResult {
  const nodesIter = Array.isArray(graph.nodes) ? graph.nodes : Object.values(graph.nodes || {});
  const tasks = nodesIter.filter((n) => n.type === 'task');
  const taskEdges = (graph.edges || []).filter(
    (e) => e.type === 'depends_on' || e.relationship === 'depends_on'
  );

  const adj: Record<string, string[]> = {};
  const inDeg: Record<string, number> = {};
  for (const t of tasks) {
    adj[t.id] = [];
    inDeg[t.id] = 0;
  }
  for (const e of taskEdges) {
    const fromAdj = adj[e.from];
    if (fromAdj) fromAdj.push(e.to);
    if (inDeg[e.to] !== undefined) inDeg[e.to] = (inDeg[e.to] ?? 0) + 1;
  }

  // Detect cycles via DFS
  const circularDeps: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string, walkPath: string[]): void {
    visited.add(node);
    recStack.add(node);
    for (const neighbor of adj[node] || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...walkPath, neighbor]);
      } else if (recStack.has(neighbor)) {
        // Pit Crew M3 Reviewer M8: guard against indexOf=-1 which
        // happens for cross-edges (visited via a separate DFS root,
        // not in current walk path). Without this guard we'd emit a
        // spurious 2-element "cycle" that's actually a DAG cross-
        // edge. Only emit a real back-edge cycle.
        const cycleStart = walkPath.indexOf(neighbor);
        if (cycleStart >= 0) {
          circularDeps.push(walkPath.slice(cycleStart).concat(neighbor));
        }
      }
    }
    recStack.delete(node);
  }

  for (const t of tasks) {
    if (!visited.has(t.id)) {
      dfs(t.id, [t.id]);
    }
  }

  // Parallel groups via Kahn's-style level assignment
  const levels: Record<number, string[]> = {};
  const initial = tasks.filter((t) => inDeg[t.id] === 0).map((t) => t.id);
  let level = 0;
  let remaining = [...initial];

  while (remaining.length > 0) {
    const currentLevel = [...remaining];
    levels[level] = currentLevel;
    remaining = [];
    for (const node of currentLevel) {
      for (const neighbor of adj[node] || []) {
        const remaining_count = (inDeg[neighbor] ?? 0) - 1;
        inDeg[neighbor] = remaining_count;
        if (remaining_count === 0) remaining.push(neighbor);
      }
    }
    level++;
  }

  const parallelGroups: ParallelGroup[] = Object.entries(levels)
    .filter(([, nodes]) => nodes.length > 1)
    .map(([lvl, nodes]) => ({ level: Number.parseInt(lvl, 10), tasks: nodes }));

  // Inversions (task in milestone N depends on task in milestone > N)
  const inversions: InversionEntry[] = [];
  for (const e of taskEdges) {
    const fromMatch = e.from.match(/M(\d+)-T/);
    const toMatch = e.to.match(/M(\d+)-T/);
    if (fromMatch?.[1] !== undefined && toMatch?.[1] !== undefined) {
      const fromMilestone = Number.parseInt(fromMatch[1], 10);
      const toMilestone = Number.parseInt(toMatch[1], 10);
      if (toMilestone > fromMilestone) {
        inversions.push({
          task: e.from,
          depends_on: e.to,
          reason: 'depends on later milestone',
        });
      }
    }
  }

  return {
    task_count: tasks.length,
    edge_count: taskEdges.length,
    circular_dependencies: circularDeps,
    inversions,
    parallel_groups: parallelGroups,
    critical_path_length: level,
    has_issues: circularDeps.length > 0 || inversions.length > 0,
  };
}
