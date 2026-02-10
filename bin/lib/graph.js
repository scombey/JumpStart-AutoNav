#!/usr/bin/env node

/**
 * graph.js — Dependency Mapping (spec-graph.json).
 * 
 * Part of Jump Start Framework (Item 13: Dependency Mapping).
 * 
 * Maps stories to code files and tests. Maintains spec-graph.json
 * for traceability.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load or create the spec graph.
 * 
 * @param {string} graphPath - Path to spec-graph.json.
 * @returns {object} The spec graph.
 */
function loadGraph(graphPath) {
  if (fs.existsSync(graphPath)) {
    return JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  }
  return {
    version: '1.0.0',
    generated: new Date().toISOString(),
    nodes: {},
    edges: []
  };
}

/**
 * Save the spec graph.
 * 
 * @param {string} graphPath - Path to save.
 * @param {object} graph - The graph object.
 */
function saveGraph(graphPath, graph) {
  graph.lastUpdated = new Date().toISOString();
  const dir = path.dirname(graphPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf8');
}

/**
 * Add a node to the graph.
 * 
 * @param {object} graph - The graph.
 * @param {string} id - Node ID (e.g., 'E1-S1', 'M1-T01', 'src/models/user.js').
 * @param {string} type - Node type ('story', 'task', 'file', 'test', 'component').
 * @param {object} [metadata] - Additional metadata.
 */
function addNode(graph, id, type, metadata = {}) {
  graph.nodes[id] = {
    id,
    type,
    ...metadata,
    addedAt: new Date().toISOString()
  };
}

/**
 * Add an edge (relationship) to the graph.
 * 
 * @param {object} graph - The graph.
 * @param {string} from - Source node ID.
 * @param {string} to - Target node ID.
 * @param {string} relationship - Relationship type ('implements', 'tests', 'depends_on', 'contains').
 */
function addEdge(graph, from, to, relationship) {
  // Avoid duplicates
  const exists = graph.edges.some(
    e => e.from === from && e.to === to && e.relationship === relationship
  );
  if (!exists) {
    graph.edges.push({ from, to, relationship });
  }
}

/**
 * Find all nodes connected to a given node.
 * 
 * @param {object} graph - The graph.
 * @param {string} nodeId - Node ID to query.
 * @param {string} [direction='both'] - 'outgoing', 'incoming', or 'both'.
 * @returns {object[]} Array of { node, relationship, direction } objects.
 */
function findConnected(graph, nodeId, direction = 'both') {
  const results = [];
  
  for (const edge of graph.edges) {
    if ((direction === 'both' || direction === 'outgoing') && edge.from === nodeId) {
      results.push({
        node: graph.nodes[edge.to] || { id: edge.to },
        relationship: edge.relationship,
        direction: 'outgoing'
      });
    }
    if ((direction === 'both' || direction === 'incoming') && edge.to === nodeId) {
      results.push({
        node: graph.nodes[edge.from] || { id: edge.from },
        relationship: edge.relationship,
        direction: 'incoming'
      });
    }
  }
  
  return results;
}

/**
 * Build a graph from existing spec files.
 * Parses PRD, architecture, and implementation plan to extract relationships.
 * 
 * @param {string} specsDir - Path to specs directory.
 * @returns {object} Populated graph.
 */
function buildFromSpecs(specsDir) {
  const graph = { version: '1.0.0', generated: new Date().toISOString(), nodes: {}, edges: [] };
  
  // Parse PRD for stories
  const prdPath = path.join(specsDir, 'prd.md');
  if (fs.existsSync(prdPath)) {
    const prdContent = fs.readFileSync(prdPath, 'utf8');
    
    // Extract epic-story relationships
    const epicPattern = /### Epic (E\d+):\s*(.+)/g;
    let epicMatch;
    while ((epicMatch = epicPattern.exec(prdContent)) !== null) {
      addNode(graph, epicMatch[1], 'epic', { name: epicMatch[2].trim() });
    }
    
    const storyPattern = /#### Story (E\d+-S\d+):\s*(.+)/g;
    let storyMatch;
    while ((storyMatch = storyPattern.exec(prdContent)) !== null) {
      const storyId = storyMatch[1];
      const epicId = storyId.split('-')[0];
      addNode(graph, storyId, 'story', { name: storyMatch[2].trim() });
      addEdge(graph, epicId, storyId, 'contains');
    }
  }
  
  // Parse implementation plan for tasks
  const planPath = path.join(specsDir, 'implementation-plan.md');
  if (fs.existsSync(planPath)) {
    const planContent = fs.readFileSync(planPath, 'utf8');
    
    const taskPattern = /### Task (M\d+-T\d+):\s*(.+)/g;
    let taskMatch;
    while ((taskMatch = taskPattern.exec(planContent)) !== null) {
      const taskId = taskMatch[1];
      addNode(graph, taskId, 'task', { name: taskMatch[2].replace(/\s*`\[.*?\]`\s*/, '').trim() });
      
      // Find story reference for this task
      const blockStart = taskMatch.index;
      const blockEnd = planContent.indexOf('### Task', blockStart + 1);
      const block = planContent.substring(blockStart, blockEnd === -1 ? undefined : blockEnd);
      
      const storyRefMatch = block.match(/\*\*Story Reference\*\*\s*\|\s*(E\d+-S\d+)/);
      if (storyRefMatch) {
        addEdge(graph, taskId, storyRefMatch[1], 'implements');
      }
      
      // Find file references
      const filesMatch = block.match(/\*\*Files\*\*\s*\|\s*(.+)/);
      if (filesMatch) {
        const files = filesMatch[1].split(',').map(f => f.trim().replace(/`/g, ''));
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

/**
 * Get coverage statistics from the graph.
 * 
 * @param {object} graph - The spec graph.
 * @returns {{ stories: number, tasks: number, files: number, unmappedStories: string[] }}
 */
function getCoverage(graph) {
  const stories = Object.values(graph.nodes).filter(n => n.type === 'story');
  const tasks = Object.values(graph.nodes).filter(n => n.type === 'task');
  const files = Object.values(graph.nodes).filter(n => n.type === 'file');
  
  const implementedStories = new Set(
    graph.edges
      .filter(e => e.relationship === 'implements')
      .map(e => e.to)
  );
  
  const unmappedStories = stories
    .filter(s => !implementedStories.has(s.id))
    .map(s => s.id);
  
  return {
    stories: stories.length,
    tasks: tasks.length,
    files: files.length,
    unmappedStories
  };
}

module.exports = {
  loadGraph,
  saveGraph,
  addNode,
  addEdge,
  findConnected,
  buildFromSpecs,
  getCoverage,
  auditTaskDependencies
};

/**
 * Audit task dependencies for circular dependencies, inversions,
 * and parallelizable groups.
 *
 * @param {object} graph - The dependency graph object.
 * @returns {object} Audit results with circular deps, inversions, parallel groups, and critical path.
 */
function auditTaskDependencies(graph) {
  const tasks = (graph.nodes || []).filter(n => n.type === 'task');
  const taskEdges = (graph.edges || []).filter(e => e.type === 'depends_on');
  
  // Build adjacency list
  const adj = {};
  const inDeg = {};
  for (const t of tasks) {
    adj[t.id] = [];
    inDeg[t.id] = 0;
  }
  for (const e of taskEdges) {
    if (adj[e.from]) adj[e.from].push(e.to);
    if (inDeg[e.to] !== undefined) inDeg[e.to]++;
  }
  
  // Detect circular dependencies using DFS
  const circularDeps = [];
  const visited = new Set();
  const recStack = new Set();
  
  function dfs(node, path) {
    visited.add(node);
    recStack.add(node);
    for (const neighbor of (adj[node] || [])) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path, neighbor]);
      } else if (recStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        circularDeps.push(path.slice(cycleStart).concat(neighbor));
      }
    }
    recStack.delete(node);
  }
  
  for (const t of tasks) {
    if (!visited.has(t.id)) {
      dfs(t.id, [t.id]);
    }
  }
  
  // Find parallelizable groups (tasks with same in-degree level)
  const levels = {};
  const queue = tasks.filter(t => inDeg[t.id] === 0).map(t => t.id);
  const levelAssignment = {};
  let level = 0;
  const remaining = [...queue];
  
  while (remaining.length > 0) {
    const currentLevel = [...remaining];
    levels[level] = currentLevel;
    remaining.length = 0;
    for (const node of currentLevel) {
      levelAssignment[node] = level;
      for (const neighbor of (adj[node] || [])) {
        inDeg[neighbor]--;
        if (inDeg[neighbor] === 0) remaining.push(neighbor);
      }
    }
    level++;
  }
  
  const parallelGroups = Object.entries(levels)
    .filter(([, nodes]) => nodes.length > 1)
    .map(([lvl, nodes]) => ({ level: parseInt(lvl), tasks: nodes }));
  
  // Detect inversions (task depends on a higher-milestone task)
  const inversions = [];
  for (const e of taskEdges) {
    const fromMatch = e.from.match(/M(\d+)-T/);
    const toMatch = e.to.match(/M(\d+)-T/);
    if (fromMatch && toMatch) {
      const fromMilestone = parseInt(fromMatch[1]);
      const toMilestone = parseInt(toMatch[1]);
      if (toMilestone > fromMilestone) {
        inversions.push({ task: e.from, depends_on: e.to, reason: 'depends on later milestone' });
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
    has_issues: circularDeps.length > 0 || inversions.length > 0
  };
}
