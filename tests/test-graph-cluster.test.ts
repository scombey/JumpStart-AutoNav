/**
 * test-graph-cluster.test.ts — T4.2.5 graph cluster tests.
 *
 * Coverage for the 6 ports:
 *   - graph.ts (loadGraph/saveGraph/addNode/addEdge/findConnected/
 *               buildFromSpecs/getCoverage/auditTaskDependencies)
 *   - traceability.ts (extractStories/extractTasks/extractNFRs/
 *                      buildTraceabilityChain/buildNFRMap)
 *   - bidirectional-trace.ts (scanTraceLinks/traceForward/traceReverse/
 *                             buildCoverageReport/save+loadTraceMap)
 *   - impact-analysis.ts (analyzeImpact/renderImpactReport)
 *   - adr-index.ts (parseADR/buildIndex/searchIndex)
 *   - repo-graph.ts (defaultRepoGraph/loadRepoGraph/saveRepoGraph/
 *                    upsertNode/addEdge/buildRepoGraph/queryGraph/
 *                    getNeighbours)
 *
 * @see src/lib/{graph,traceability,bidirectional-trace,impact-analysis,adr-index,repo-graph}.ts
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildIndex, parseADR, searchIndex } from '../src/lib/adr-index.js';
import {
  buildCoverageReport,
  loadTraceMap,
  saveTraceMap,
  scanTraceLinks,
  traceForward,
  traceReverse,
} from '../src/lib/bidirectional-trace.js';
import {
  addEdge,
  addNode,
  auditTaskDependencies,
  buildFromSpecs,
  findConnected,
  getCoverage,
  loadGraph,
  type SpecGraph,
  saveGraph,
} from '../src/lib/graph.js';
import { analyzeImpact, renderImpactReport } from '../src/lib/impact-analysis.js';
import {
  buildRepoGraph,
  defaultRepoGraph,
  getNeighbours,
  loadRepoGraph,
  queryGraph,
  saveRepoGraph,
  upsertNode,
} from '../src/lib/repo-graph.js';
import {
  buildNFRMap,
  buildTraceabilityChain,
  extractNFRs,
  extractStories,
  extractTasks,
  extractValidationCriteria,
} from '../src/lib/traceability.js';
import { expectDefined } from './_helpers.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'graph-cluster-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeAt(rel: string, body: string): string {
  const full = path.join(tmpDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body, 'utf8');
  return full;
}

// ─────────────────────────────────────────────────────────────────────────
// graph.ts
// ─────────────────────────────────────────────────────────────────────────

describe('graph — loadGraph/saveGraph round-trip', () => {
  it('returns fresh empty graph when file missing', () => {
    const g = loadGraph(path.join(tmpDir, 'no-graph.json'));
    expect(g.version).toBe('1.0.0');
    expect(g.nodes).toEqual({});
    expect(g.edges).toEqual([]);
  });

  it('saves and reloads a graph', () => {
    const g: SpecGraph = {
      version: '1.0.0',
      generated: '2026-04-27T00:00:00.000Z',
      nodes: {},
      edges: [],
    };
    addNode(g, 'E1-S1', 'story', { name: 'login' });
    addEdge(g, 'E1', 'E1-S1', 'contains');
    const out = path.join(tmpDir, 'g.json');
    saveGraph(out, g);
    const reloaded = loadGraph(out);
    expect(reloaded.nodes['E1-S1']).toMatchObject({ id: 'E1-S1', type: 'story' });
    expect(reloaded.edges).toEqual([{ from: 'E1', to: 'E1-S1', relationship: 'contains' }]);
    expect(reloaded.lastUpdated).toBeDefined();
  });
});

describe('graph — addEdge dedupes', () => {
  it('does not add duplicate edges', () => {
    const g: SpecGraph = {
      version: '1.0.0',
      generated: 't',
      nodes: {},
      edges: [],
    };
    addEdge(g, 'a', 'b', 'r');
    addEdge(g, 'a', 'b', 'r');
    expect(g.edges).toHaveLength(1);
  });
});

describe('graph — findConnected', () => {
  it('returns outgoing/incoming/both', () => {
    const g: SpecGraph = {
      version: '1.0.0',
      generated: 't',
      nodes: {},
      edges: [],
    };
    addNode(g, 'a', 'task');
    addNode(g, 'b', 'story');
    addNode(g, 'c', 'file');
    addEdge(g, 'a', 'b', 'implements');
    addEdge(g, 'a', 'c', 'creates');
    addEdge(g, 'c', 'a', 'tested-by');
    const both = findConnected(g, 'a');
    expect(both).toHaveLength(3);
    const out = findConnected(g, 'a', 'outgoing');
    expect(out).toHaveLength(2);
    const inc = findConnected(g, 'a', 'incoming');
    expect(inc).toHaveLength(1);
  });
});

describe('graph — buildFromSpecs', () => {
  it('extracts epics, stories, tasks, file-creation edges', () => {
    writeAt('specs/prd.md', ['### Epic E1: User Auth', '#### Story E1-S1: Login', ''].join('\n'));
    writeAt(
      'specs/implementation-plan.md',
      [
        '### Task M1-T01: Implement login [P]',
        '**Story Reference** | E1-S1',
        '**Files** | src/auth.ts, src/session.ts',
        '',
      ].join('\n')
    );
    const g = buildFromSpecs(path.join(tmpDir, 'specs'));
    expect(g.nodes.E1?.type).toBe('epic');
    expect(g.nodes['E1-S1']?.type).toBe('story');
    expect(g.nodes['M1-T01']?.type).toBe('task');
    expect(g.nodes['src/auth.ts']?.type).toBe('file');
    expect(
      g.edges.some(
        (e) => e.from === 'M1-T01' && e.to === 'E1-S1' && e.relationship === 'implements'
      )
    ).toBe(true);
    expect(
      g.edges.some(
        (e) => e.from === 'M1-T01' && e.to === 'src/auth.ts' && e.relationship === 'creates'
      )
    ).toBe(true);
  });
});

describe('graph — getCoverage', () => {
  it('reports stories/tasks/files counts and unmapped stories', () => {
    const g: SpecGraph = {
      version: '1.0.0',
      generated: 't',
      nodes: {},
      edges: [],
    };
    addNode(g, 'E1-S1', 'story');
    addNode(g, 'E1-S2', 'story');
    addNode(g, 'M1-T01', 'task');
    addNode(g, 'src/x.ts', 'file');
    addEdge(g, 'M1-T01', 'E1-S1', 'implements');
    const cov = getCoverage(g);
    expect(cov.stories).toBe(2);
    expect(cov.tasks).toBe(1);
    expect(cov.files).toBe(1);
    expect(cov.unmappedStories).toEqual(['E1-S2']);
  });
});

describe('graph — auditTaskDependencies', () => {
  it('reports cycles, parallel groups, and milestone inversions', () => {
    const graph = {
      nodes: [
        { id: 'M1-T01', type: 'task' },
        { id: 'M1-T02', type: 'task' },
        { id: 'M2-T01', type: 'task' },
      ],
      edges: [
        { from: 'M1-T02', to: 'M1-T01', relationship: 'depends_on' },
        // Inversion: M1 task depends on M2 task
        { from: 'M1-T02', to: 'M2-T01', relationship: 'depends_on' },
      ],
    };
    const audit = auditTaskDependencies(graph);
    expect(audit.task_count).toBe(3);
    expect(audit.inversions.length).toBe(1);
    expectDefined(audit.inversions[0]);
    expect(audit.inversions[0].task).toBe('M1-T02');
    expect(audit.has_issues).toBe(true);
  });

  it('Pit Crew M3 QA C1 — detects a 3-node cycle via DFS back-edge', () => {
    // Setup: T01 -> T02 -> T03 -> T01 (cycle)
    const graph = {
      nodes: [
        { id: 'M1-T01', type: 'task' },
        { id: 'M1-T02', type: 'task' },
        { id: 'M1-T03', type: 'task' },
      ],
      edges: [
        { from: 'M1-T01', to: 'M1-T02', relationship: 'depends_on' },
        { from: 'M1-T02', to: 'M1-T03', relationship: 'depends_on' },
        { from: 'M1-T03', to: 'M1-T01', relationship: 'depends_on' },
      ],
    };
    const audit = auditTaskDependencies(graph);
    expect(audit.circular_dependencies.length).toBeGreaterThan(0);
    // Cycle should mention all three nodes (in some rotation)
    const cycleNodes = audit.circular_dependencies[0];
    expect(cycleNodes).toContain('M1-T01');
    expect(cycleNodes).toContain('M1-T02');
    expect(cycleNodes).toContain('M1-T03');
    expect(audit.has_issues).toBe(true);
  });

  it('Pit Crew M3 Reviewer M8 — does NOT emit spurious cycles for DAG cross-edges', () => {
    // Setup: diamond DAG (no cycle) — A->B, A->C, B->D, C->D
    // The walk from B to D and from C to D both hit D as visited;
    // legacy code would emit a spurious 2-element "cycle" because
    // indexOf(D, walkPathFromC) returned -1 and slice(-1) produced
    // [D]. Post-fix: indexOf=-1 short-circuits, no spurious entry.
    const graph = {
      nodes: [
        { id: 'A', type: 'task' },
        { id: 'B', type: 'task' },
        { id: 'C', type: 'task' },
        { id: 'D', type: 'task' },
      ],
      edges: [
        { from: 'A', to: 'B', relationship: 'depends_on' },
        { from: 'A', to: 'C', relationship: 'depends_on' },
        { from: 'B', to: 'D', relationship: 'depends_on' },
        { from: 'C', to: 'D', relationship: 'depends_on' },
      ],
    };
    const audit = auditTaskDependencies(graph);
    expect(audit.circular_dependencies).toEqual([]);
    expect(audit.has_issues).toBe(false);
  });
});

describe('graph — Pit Crew M3 Adversary F2 prototype-pollution defense', () => {
  it('addNode rejects __proto__ as id', () => {
    const g = {
      version: '1.0.0',
      generated: 't',
      nodes: {} as Record<string, never>,
      edges: [] as never[],
    };
    expect(() => addNode(g as never, '__proto__', 'evil')).toThrow(
      /forbidden key|prototype pollution/i
    );
  });
  it('addNode rejects constructor / prototype', () => {
    const g = {
      version: '1.0.0',
      generated: 't',
      nodes: {} as Record<string, never>,
      edges: [] as never[],
    };
    expect(() => addNode(g as never, 'constructor', 'evil')).toThrow();
    expect(() => addNode(g as never, 'prototype', 'evil')).toThrow();
  });
});

describe('graph — Pit Crew M3 Adversary F4 load-shape validation', () => {
  it('loadGraph rejects __proto__ as node id', () => {
    const file = path.join(tmpDir, 'evil.json');
    // Write the JSON as a raw string. `JSON.stringify({__proto__: ...})`
    // drops the key because it's the special prototype-setter; only a
    // literal-string write preserves it as a real own-property key on
    // parse, matching the attacker's POC.
    writeFileSync(
      file,
      '{"version":"1.0.0","generated":"t","nodes":{"__proto__":{"id":"__proto__","type":"evil"}},"edges":[]}',
      'utf8'
    );
    expect(() => loadGraph(file)).toThrow(/forbidden key|prototype pollution/i);
  });
  it('loadGraph rejects nodes:array (type confusion)', () => {
    const file = path.join(tmpDir, 'wrong-shape.json');
    writeFileSync(file, JSON.stringify({ nodes: [], edges: [] }), 'utf8');
    expect(() => loadGraph(file)).toThrow(/nodes must be an object map/);
  });
  it('loadGraph rejects edges:object (type confusion)', () => {
    const file = path.join(tmpDir, 'wrong-edges.json');
    writeFileSync(file, JSON.stringify({ nodes: {}, edges: {} }), 'utf8');
    expect(() => loadGraph(file)).toThrow(/edges must be an array/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// traceability.ts
// ─────────────────────────────────────────────────────────────────────────

describe('traceability — extractors', () => {
  it('extractStories / extractNFRs / extractValidationCriteria', () => {
    expect(extractStories('E1-S1, E2-S3')).toEqual(['E1-S1', 'E2-S3']);
    expect(extractNFRs('NFR-P01 and NFR-S02')).toEqual(['NFR-P01', 'NFR-S02']);
    expect(extractValidationCriteria('VC-01 and VC-02')).toEqual(['VC-01', 'VC-02']);
  });

  it('extractTasks supports BOTH M<n>-T<n> and T<3-digit> shapes', () => {
    const ids = extractTasks('M1-T01 and T001 and T002');
    expect(ids).toContain('M1-T01');
    expect(ids).toContain('T001');
    expect(ids).toContain('T002');
  });
});

describe('traceability — buildTraceabilityChain', () => {
  it('matches story-task pairs in 5-line context window', () => {
    writeAt('specs/prd.md', 'E1-S1\n');
    writeAt(
      'specs/implementation-plan.md',
      ['blah', 'M1-T01 implements feature', 'related to E1-S1', ''].join('\n')
    );
    const r = buildTraceabilityChain(tmpDir);
    expect(r.chains.find((c) => c.story === 'E1-S1')?.tasks).toContain('M1-T01');
  });

  it('reports gaps for stories without tasks/tests', () => {
    writeAt('specs/prd.md', 'E1-S1\n');
    writeAt('specs/implementation-plan.md', '');
    const r = buildTraceabilityChain(tmpDir);
    expect(r.gaps.some((g) => g.id === 'E1-S1' && g.type === 'story_without_tasks')).toBe(true);
  });
});

describe('traceability — buildNFRMap', () => {
  it('classifies fully_mapped vs partial vs unmapped', () => {
    writeAt('specs/prd.md', 'NFR-P01 NFR-P02 NFR-P03\n');
    writeAt('specs/architecture.md', 'NFR-P01 NFR-P02\n');
    writeAt('specs/implementation-plan.md', 'NFR-P01\n');
    const r = buildNFRMap(tmpDir);
    expect(r.summary.total).toBe(3);
    expect(r.summary.fully_mapped).toBe(1); // P01 (in both)
    expect(r.summary.partial).toBe(1); // P02 (arch only)
    expect(r.summary.unmapped).toBe(1); // P03
  });
});

// ─────────────────────────────────────────────────────────────────────────
// bidirectional-trace.ts
// ─────────────────────────────────────────────────────────────────────────

describe('bidirectional-trace — scanTraceLinks', () => {
  it('builds forward + reverse maps from spec ID references', () => {
    writeAt('src/auth.ts', '// implements E1-S1 and M1-T01\n');
    writeAt('tests/auth.test.ts', '// covers E1-S1\n');
    writeAt('specs/prd.md', 'NFR-P01 here\n');
    const tm = scanTraceLinks(tmpDir);
    expectDefined(tm.forward_map['E1-S1']);
    expect(tm.forward_map['E1-S1'].length).toBeGreaterThanOrEqual(2);
    expect(tm.stats.total_spec_ids).toBeGreaterThan(0);
  });

  it('traceForward / traceReverse round-trip', () => {
    writeAt('src/x.ts', '// E1-S1\n');
    const tm = scanTraceLinks(tmpDir);
    const fwd = traceForward('E1-S1', tm);
    expect(fwd.length).toBeGreaterThan(0);
    const rev = traceReverse('src/x.ts', tm);
    expect(rev.some((r) => r.specId === 'E1-S1')).toBe(true);
  });
});

describe('bidirectional-trace — buildCoverageReport', () => {
  it('counts spec-only links as gaps (not covered)', () => {
    writeAt('specs/prd.md', 'E1-S1 E1-S2\n');
    writeAt('src/auth.ts', '// E1-S1\n');
    const tm = scanTraceLinks(tmpDir);
    const cov = buildCoverageReport(tmpDir, tm);
    expect(cov.gap_list).toContain('E1-S2');
    expect(cov.covered_list).toContain('E1-S1');
  });
});

describe('bidirectional-trace — saveTraceMap / loadTraceMap', () => {
  it('round-trips a trace map', () => {
    writeAt('src/x.ts', '// E1-S1\n');
    const tm = scanTraceLinks(tmpDir);
    const out = path.join(tmpDir, '.jumpstart', 'state', 'trace-map.json');
    saveTraceMap(tm, out);
    expect(existsSync(out)).toBe(true);
    const reloaded = loadTraceMap(out);
    expect(reloaded.forward_map['E1-S1']).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// impact-analysis.ts
// ─────────────────────────────────────────────────────────────────────────

describe('impact-analysis — analyzeImpact', () => {
  it('errors when no target is provided', () => {
    const r = analyzeImpact(tmpDir, {});
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/target/);
  });

  it('classifies hits into requirements/tests/services/apis/consumers', () => {
    // The legacy classifier evaluates service/controller/route FIRST
    // (so a file with both 'api' AND 'route' lands in services, not
    // apis). Each fixture below is crafted to land in exactly one
    // bucket so the assertions remain unambiguous.
    writeAt('specs/prd.md', 'mentions auth\n');
    writeAt('tests/auth.test.ts', 'tests auth\n');
    writeAt('src/auth-service.ts', 'class AuthService { ... auth ... }\n');
    writeAt('src/auth-endpoint.ts', 'auth endpoint definition\n');
    writeAt('src/utils.ts', 'auth helper\n');
    const r = analyzeImpact(tmpDir, { symbol: 'auth' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.affected_requirements.length).toBeGreaterThanOrEqual(1);
      expect(r.affected_tests.length).toBeGreaterThanOrEqual(1);
      expect(r.affected_services.length).toBeGreaterThanOrEqual(1);
      expect(r.affected_apis.length).toBeGreaterThanOrEqual(1);
      expect(r.affected_consumers.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('impact-analysis — renderImpactReport', () => {
  it('renders error message for failure', () => {
    expect(renderImpactReport({ success: false, error: 'no target' })).toContain('failed');
  });
  it('renders risk emoji + sections for success', () => {
    writeAt('src/x.ts', 'foo\n');
    const r = analyzeImpact(tmpDir, { symbol: 'foo' });
    const report = renderImpactReport(r);
    expect(report).toContain('Impact Analysis');
    expect(report).toMatch(/Risk:\s+\w+/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// adr-index.ts
// ─────────────────────────────────────────────────────────────────────────

describe('adr-index — parseADR', () => {
  it('parses title/status/date/tags/components/decision/context', () => {
    const adrPath = writeAt(
      'specs/decisions/adr-001-foo.md',
      [
        '# ADR-001: Use Foo',
        '',
        '**Status:** Accepted',
        '**Date:** 2026-04-27',
        '**Tags:** Backend, Database',
        '**Components:** UserService, OrderService',
        '',
        '## Context',
        'We need a database.',
        '',
        '## Decision',
        'Use Postgres.',
        '',
      ].join('\n')
    );
    const e = parseADR(adrPath);
    expect(e).not.toBeNull();
    if (e) {
      expect(e.title).toBe('ADR-001: Use Foo');
      expect(e.status).toBe('Accepted');
      expect(e.date).toBe('2026-04-27');
      expect(e.tags).toEqual(['backend', 'database']);
      expect(e.components).toEqual(['UserService', 'OrderService']);
      expect(e.decision).toContain('Use Postgres');
      expect(e.context).toContain('database');
    }
  });

  it('returns null on missing file', () => {
    expect(parseADR('/nonexistent/file.md')).toBeNull();
  });
});

describe('adr-index — buildIndex / searchIndex', () => {
  it('builds index file and searches by query/tag/status', () => {
    writeAt(
      'specs/decisions/adr-001.md',
      ['# ADR-001: Database', '**Status:** Accepted', '**Tags:** db, postgres', ''].join('\n')
    );
    writeAt(
      'specs/decisions/adr-002.md',
      ['# ADR-002: Auth', '**Status:** Proposed', '**Tags:** auth, security', ''].join('\n')
    );
    const built = buildIndex(tmpDir);
    expect(built.indexed).toBe(2);
    expect(existsSync(built.index_path)).toBe(true);

    const byTag = searchIndex(tmpDir, { tag: 'postgres' });
    expect(byTag.total).toBe(1);
    expectDefined(byTag.results[0]);
    expect(byTag.results[0].id).toBe('adr-001');

    const byStatus = searchIndex(tmpDir, { status: 'Proposed' });
    expect(byStatus.total).toBe(1);
    expectDefined(byStatus.results[0]);
    expect(byStatus.results[0].id).toBe('adr-002');

    const byQuery = searchIndex(tmpDir, { query: 'database' });
    expect(byQuery.results.some((r) => r.id === 'adr-001')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// repo-graph.ts
// ─────────────────────────────────────────────────────────────────────────

describe('repo-graph — defaultRepoGraph / load+save round-trip', () => {
  it('default graph shape', () => {
    const g = defaultRepoGraph();
    expect(g.version).toBe('1.0.0');
    expect(g.nodes).toEqual({});
    expect(g.edges).toEqual([]);
  });

  it('saves and loads', () => {
    const g = defaultRepoGraph();
    upsertNode(g, 'a', 'module', { name: 'A' });
    const file = path.join(tmpDir, 'rg.json');
    saveRepoGraph(g, file);
    const reloaded = loadRepoGraph(file);
    expect(reloaded.nodes.a?.type).toBe('module');
    expect(reloaded.last_updated).toBeDefined();
  });
});

describe('repo-graph — buildRepoGraph', () => {
  it('classifies api/model/service/file by name + creates contains-edges', () => {
    writeAt('src/auth-service.ts', '// service code\n');
    writeAt('src/login-route.ts', '// route code\n');
    writeAt('src/user-model.ts', '// model code\n');
    writeAt('src/util.ts', '// generic\n');
    writeAt('specs/decisions/adr-001.md', '# ADR-001: Title\n');
    writeAt('specs/prd.md', 'content\n');
    const r = buildRepoGraph(tmpDir, { graphFile: path.join(tmpDir, 'rg.json') });
    expect(r.success).toBe(true);
    expect(r.node_count).toBeGreaterThan(0);
    const g = loadRepoGraph(path.join(tmpDir, 'rg.json'));
    expect(g.nodes['file:src/auth-service.ts']?.type).toBe('service');
    expect(g.nodes['file:src/login-route.ts']?.type).toBe('api');
    expect(g.nodes['file:src/user-model.ts']?.type).toBe('model');
    expect(g.nodes['file:src/util.ts']?.type).toBe('file');
    expect(g.nodes['decision:adr-001.md']?.type).toBe('decision');
    expect(g.nodes['spec:prd.md']?.type).toBe('spec');
  });
});

describe('repo-graph — queryGraph / getNeighbours', () => {
  it('queryGraph filters by type/nameContains/id', () => {
    const g = defaultRepoGraph();
    upsertNode(g, 'a', 'module', { name: 'Alpha' });
    upsertNode(g, 'b', 'service', { name: 'Beta' });
    expect(queryGraph(g, { type: 'module' }).length).toBe(1);
    expect(queryGraph(g, { nameContains: 'beta' }).length).toBe(1);
    expect(queryGraph(g, { id: 'a' }).length).toBe(1);
  });

  it('getNeighbours returns one-hop incoming/outgoing', () => {
    const g = defaultRepoGraph();
    upsertNode(g, 'a', 'm');
    upsertNode(g, 'b', 'm');
    g.edges.push({ from: 'a', to: 'b', relationship: 'contains' });
    const n = getNeighbours(g, 'b');
    expect(n.incoming.length).toBe(1);
    expect(n.outgoing.length).toBe(0);
  });
});

describe('repo-graph — saveRepoGraph trailing newline', () => {
  it('writes a trailing newline', () => {
    const g = defaultRepoGraph();
    const file = path.join(tmpDir, 'rg.json');
    saveRepoGraph(g, file);
    const raw = readFileSync(file, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
  });
});
