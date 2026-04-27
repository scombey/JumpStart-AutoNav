/**
 * repo-graph.ts — repo understanding graph port (T4.2.5).
 *
 * Pure-library port of `bin/lib/repo-graph.js`. Public surface preserved
 * verbatim by name + signature:
 *
 *   - `defaultRepoGraph()`
 *   - `loadRepoGraph(graphFile?)`
 *   - `saveRepoGraph(graph, graphFile?)`
 *   - `upsertNode(graph, id, type, metadata?)`
 *   - `addEdge(graph, from, to, relationship)`
 *   - `buildRepoGraph(root, options?)` — scans src/, specs/decisions/,
 *     and top-level spec files; persists to disk
 *   - `queryGraph(graph, query?)` — filters by type/nameContains/id
 *   - `getNeighbours(graph, nodeId)` — one-hop incoming + outgoing
 *
 * File classification heuristics (preserved verbatim):
 *   - api/route/endpoint => api
 *   - model/schema/entity => model
 *   - service/controller => service
 *   - everything else => file
 *
 * @owner annotations: `@owner: <name>` lines create an `owner:<name>`
 * node with an "owns" edge to the file.
 *
 * @see bin/lib/repo-graph.js (legacy reference)
 * @see specs/implementation-plan.md T4.2.5
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

// Public types

export interface RepoGraphNode {
  id: string;
  type: string;
  name?: string;
  path?: string;
  updated_at?: string;
  [extra: string]: unknown;
}

export interface RepoGraphEdge {
  from: string;
  to: string;
  relationship: string;
}

export interface RepoGraph {
  version: string;
  generated_at: string;
  last_updated: string | null;
  nodes: Record<string, RepoGraphNode>;
  edges: RepoGraphEdge[];
}

export interface BuildRepoGraphOptions {
  srcDir?: string;
  graphFile?: string;
}

export interface BuildRepoGraphResult {
  success: boolean;
  node_count: number;
  edge_count: number;
  graph_file: string;
}

export interface RepoGraphQuery {
  type?: string;
  nameContains?: string;
  id?: string;
}

export interface NeighbourEntry {
  node: RepoGraphNode;
  relationship: string;
}

export interface NeighbourResult {
  incoming: NeighbourEntry[];
  outgoing: NeighbourEntry[];
}

const DEFAULT_GRAPH_FILE = path.join('.jumpstart', 'state', 'repo-graph.json');

// Implementation

/** Initialize a fresh empty repo graph. */
export function defaultRepoGraph(): RepoGraph {
  return {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    last_updated: null,
    nodes: {},
    edges: [],
  };
}

/** Load a repo graph from disk; returns a fresh graph on missing/invalid. */
export function loadRepoGraph(graphFile?: string): RepoGraph {
  const filePath = graphFile || DEFAULT_GRAPH_FILE;
  if (!existsSync(filePath)) {
    return defaultRepoGraph();
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as RepoGraph;
  } catch {
    return defaultRepoGraph();
  }
}

/** Persist a repo graph to disk (auto-creates parent dirs, trailing
 *  newline, stamps `last_updated`). */
export function saveRepoGraph(graph: RepoGraph, graphFile?: string): void {
  const filePath = graphFile || DEFAULT_GRAPH_FILE;
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  graph.last_updated = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
}

/** Upsert (insert-or-update) a node, preserving prior fields. */
export function upsertNode(
  graph: RepoGraph,
  id: string,
  type: string,
  metadata: Record<string, unknown> = {}
): void {
  graph.nodes[id] = {
    ...(graph.nodes[id] || {}),
    id,
    type,
    ...metadata,
    updated_at: new Date().toISOString(),
  };
}

/** Add an edge if not already present (same from/to/relationship). */
export function addEdge(graph: RepoGraph, from: string, to: string, relationship: string): void {
  const dup = graph.edges.some(
    (e) => e.from === from && e.to === to && e.relationship === relationship
  );
  if (!dup) {
    graph.edges.push({ from, to, relationship });
  }
}

/** Walk the project filesystem and persist a structured graph. */
export function buildRepoGraph(
  root: string,
  options: BuildRepoGraphOptions = {}
): BuildRepoGraphResult {
  const graph = defaultRepoGraph();
  const srcDir = path.join(root, options.srcDir || 'src');
  const specsDir = path.join(root, 'specs');
  const graphFile = options.graphFile || path.join(root, DEFAULT_GRAPH_FILE);

  // 1. Scan src/ for modules and files
  if (existsSync(srcDir)) {
    upsertNode(graph, 'src', 'module', { name: 'Source Root', path: 'src' });

    const walk = (dir: string, parentId: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full).replace(/\\/g, '/');
        const nodeId = `file:${rel}`;

        if (entry.isDirectory()) {
          upsertNode(graph, nodeId, 'module', { name: entry.name, path: rel });
          addEdge(graph, parentId, nodeId, 'contains');
          walk(full, nodeId);
        } else if (entry.isFile()) {
          let fileType = 'file';
          const lower = entry.name.toLowerCase();
          if (lower.includes('api') || lower.includes('route') || lower.includes('endpoint')) {
            fileType = 'api';
          } else if (
            lower.includes('model') ||
            lower.includes('schema') ||
            lower.includes('entity')
          ) {
            fileType = 'model';
          } else if (lower.includes('service') || lower.includes('controller')) {
            fileType = 'service';
          }

          upsertNode(graph, nodeId, fileType, { name: entry.name, path: rel });
          addEdge(graph, parentId, nodeId, 'contains');

          try {
            const content = readFileSync(full, 'utf8');
            const ownerMatch = content.match(/@owner[:\s]+(\S+)/i);
            if (ownerMatch) {
              const ownerId = `owner:${ownerMatch[1]}`;
              upsertNode(graph, ownerId, 'owner', { name: ownerMatch[1] });
              addEdge(graph, ownerId, nodeId, 'owns');
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    };

    walk(srcDir, 'src');
  }

  // 2. ADR decisions
  const decisionsDir = path.join(specsDir, 'decisions');
  if (existsSync(decisionsDir)) {
    upsertNode(graph, 'decisions', 'module', {
      name: 'Architecture Decisions',
      path: 'specs/decisions',
    });
    for (const file of readdirSync(decisionsDir)) {
      if (file.endsWith('.md')) {
        const nodeId = `decision:${file}`;
        const adrPath = path.join(decisionsDir, file);
        let title: string = file;
        try {
          const content = readFileSync(adrPath, 'utf8');
          const titleMatch = content.match(/^# (.+)/m);
          if (titleMatch) title = titleMatch[1];
        } catch {
          // use filename as title
        }
        upsertNode(graph, nodeId, 'decision', {
          name: title,
          path: `specs/decisions/${file}`,
        });
        addEdge(graph, 'decisions', nodeId, 'contains');
      }
    }
  }

  // 3. Top-level spec files
  const specFiles = [
    'challenger-brief.md',
    'product-brief.md',
    'prd.md',
    'architecture.md',
    'implementation-plan.md',
  ];
  upsertNode(graph, 'specs', 'module', { name: 'Specifications', path: 'specs' });
  for (const sf of specFiles) {
    const specPath = path.join(specsDir, sf);
    if (existsSync(specPath)) {
      const nodeId = `spec:${sf}`;
      upsertNode(graph, nodeId, 'spec', { name: sf, path: `specs/${sf}` });
      addEdge(graph, 'specs', nodeId, 'contains');
    }
  }

  const nodeCount = Object.keys(graph.nodes).length;
  const edgeCount = graph.edges.length;

  saveRepoGraph(graph, graphFile);

  return {
    success: true,
    node_count: nodeCount,
    edge_count: edgeCount,
    graph_file: graphFile,
  };
}

/** Query nodes by type / nameContains / exact id. */
export function queryGraph(graph: RepoGraph, query: RepoGraphQuery = {}): RepoGraphNode[] {
  let nodes = Object.values(graph.nodes);

  if (query.type) {
    nodes = nodes.filter((n) => n.type === query.type);
  }

  if (query.nameContains) {
    const lower = query.nameContains.toLowerCase();
    nodes = nodes.filter((n) => n.name?.toLowerCase().includes(lower));
  }

  if (query.id) {
    nodes = nodes.filter((n) => n.id === query.id);
  }

  return nodes;
}

/** One-hop neighbour lookup (incoming + outgoing edges). */
export function getNeighbours(graph: RepoGraph, nodeId: string): NeighbourResult {
  const outgoing: NeighbourEntry[] = graph.edges
    .filter((e) => e.from === nodeId)
    .map((e) => ({
      node: graph.nodes[e.to] || ({ id: e.to, type: 'unknown' } as RepoGraphNode),
      relationship: e.relationship,
    }));

  const incoming: NeighbourEntry[] = graph.edges
    .filter((e) => e.to === nodeId)
    .map((e) => ({
      node: graph.nodes[e.from] || ({ id: e.from, type: 'unknown' } as RepoGraphNode),
      relationship: e.relationship,
    }));

  return { incoming, outgoing };
}
