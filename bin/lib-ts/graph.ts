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

// Public types

export interface GraphNode {
  id: string;
  type: string;
  name?: string;
  path?: string;
  addedAt?: string;
  updated_at?: string;
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
  lastUpdated?: string;
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

/** Load `graphPath`, or return a fresh empty graph if missing. */
export function loadGraph(graphPath: string): SpecGraph {
  if (existsSync(graphPath)) {
    return JSON.parse(readFileSync(graphPath, 'utf8')) as SpecGraph;
  }
  return {
    version: '1.0.0',
    generated: new Date().toISOString(),
    nodes: {},
    edges: [],
  };
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

/** Add (or replace) a node with metadata. */
export function addNode(
  graph: SpecGraph,
  id: string,
  type: string,
  metadata: Record<string, unknown> = {}
): void {
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
      addNode(graph, m[1], 'epic', { name: m[2].trim() });
    }

    for (const m of prdContent.matchAll(/#### Story (E\d+-S\d+):\s*(.+)/g)) {
      const storyId = m[1];
      const epicId = storyId.split('-')[0];
      addNode(graph, storyId, 'story', { name: m[2].trim() });
      addEdge(graph, epicId, storyId, 'contains');
    }
  }

  const planPath = path.join(specsDir, 'implementation-plan.md');
  if (existsSync(planPath)) {
    const planContent = readFileSync(planPath, 'utf8');

    const taskMatches = Array.from(planContent.matchAll(/### Task (M\d+-T\d+):\s*(.+)/g));
    for (const taskMatch of taskMatches) {
      const taskId = taskMatch[1];
      const cleanedName = taskMatch[2].replace(/\s*`\[.*?\]`\s*/, '').trim();
      addNode(graph, taskId, 'task', { name: cleanedName });

      const blockStart = taskMatch.index ?? 0;
      const blockEnd = planContent.indexOf('### Task', blockStart + 1);
      const block = planContent.substring(blockStart, blockEnd === -1 ? undefined : blockEnd);

      const storyRefMatch = block.match(/\*\*Story Reference\*\*\s*\|\s*(E\d+-S\d+)/);
      if (storyRefMatch) {
        addEdge(graph, taskId, storyRefMatch[1], 'implements');
      }

      const filesMatch = block.match(/\*\*Files\*\*\s*\|\s*(.+)/);
      if (filesMatch) {
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
    if (adj[e.from]) adj[e.from].push(e.to);
    if (inDeg[e.to] !== undefined) inDeg[e.to]++;
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
        const cycleStart = walkPath.indexOf(neighbor);
        circularDeps.push(walkPath.slice(cycleStart).concat(neighbor));
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
        inDeg[neighbor]--;
        if (inDeg[neighbor] === 0) remaining.push(neighbor);
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
    if (fromMatch && toMatch) {
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
