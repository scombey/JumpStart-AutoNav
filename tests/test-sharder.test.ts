/**
 * tests/test-sharder.test.ts -- vitest suite for src/lib/sharder.ts
 */
import { describe, it, expect } from 'vitest';
import {
  extractEpics,
  shouldShard,
  generateShard,
  generateIndex,
  type ShardDescriptor,
} from '../src/lib/sharder.js';

// ─── sample PRD content ─────────────────────────────────────────────────────

const SAMPLE_PRD = `
# PRD

## Goals

### Epic E01: Authentication
User login and registration stories.

#### Story E01-S01
Login functionality.

#### Story E01-S02
Registration functionality.

### Epic E02: Dashboard
Dashboard stories.

#### Story E02-S01
Main dashboard view.
`;

// ─── extractEpics ────────────────────────────────────────────────────────────

describe('extractEpics', () => {
  it('returns empty array for content with no epics', () => {
    expect(extractEpics('No epics here')).toEqual([]);
  });

  it('extracts epic IDs and names', () => {
    const epics = extractEpics(SAMPLE_PRD);
    expect(epics.length).toBeGreaterThanOrEqual(2);
    const ids = epics.map(e => e.id);
    expect(ids).toContain('E01');
    expect(ids).toContain('E02');
  });

  it('counts stories within each epic', () => {
    const epics = extractEpics(SAMPLE_PRD);
    const e01 = epics.find(e => e.id === 'E01');
    if (!e01) throw new Error('expected E01');
    expect(e01.storyCount).toBe(2);
  });

  it('includes epic content', () => {
    const epics = extractEpics(SAMPLE_PRD);
    const e01 = epics.find(e => e.id === 'E01');
    if (!e01) throw new Error('expected E01');
    expect(e01.content).toContain('Authentication');
  });
});

// ─── shouldShard ─────────────────────────────────────────────────────────────

describe('shouldShard', () => {
  it('returns shouldShard:false for small PRD', () => {
    const result = shouldShard('Short content\nonly two lines');
    expect(result.shouldShard).toBe(false);
    expect(result.reason).toBe('Within limits');
  });

  it('returns shouldShard:true when epics exceed maxEpics', () => {
    // Create content with 6 epics (default max is 5)
    let content = '';
    for (let i = 1; i <= 6; i++) {
      content += `### Epic E0${i}: Test Epic ${i}\nContent\n`;
    }
    const result = shouldShard(content, { maxEpics: 5 });
    expect(result.shouldShard).toBe(true);
    expect(result.reason).toContain('epics');
  });

  it('returns shouldShard:true when lines exceed maxLines', () => {
    const lines = Array(900).fill('line').join('\n');
    const result = shouldShard(lines, { maxLines: 800 });
    expect(result.shouldShard).toBe(true);
    expect(result.reason).toContain('lines');
  });

  it('reports epicCount, storyCount, lineCount', () => {
    const result = shouldShard(SAMPLE_PRD);
    expect(typeof result.epicCount).toBe('number');
    expect(typeof result.storyCount).toBe('number');
    expect(result.lineCount).toBeGreaterThan(0);
  });

  it('respects custom thresholds', () => {
    const result = shouldShard(SAMPLE_PRD, { maxEpics: 1 });
    expect(result.shouldShard).toBe(true);
  });
});

// ─── generateShard ───────────────────────────────────────────────────────────

describe('generateShard', () => {
  it('returns empty string for unknown epic IDs', () => {
    const result = generateShard(SAMPLE_PRD, ['E99'], 1);
    expect(result).toBe('');
  });

  it('generates a shard header with shard index', () => {
    const result = generateShard(SAMPLE_PRD, ['E01'], 1);
    expect(result).toContain('PRD Shard 1');
    expect(result).toContain('E01');
  });

  it('includes parent document reference', () => {
    const result = generateShard(SAMPLE_PRD, ['E01'], 1);
    expect(result).toContain('prd.md');
  });

  it('includes epic content in shard', () => {
    const result = generateShard(SAMPLE_PRD, ['E01'], 1);
    expect(result).toContain('Authentication');
  });

  it('handles multiple epicIds', () => {
    const result = generateShard(SAMPLE_PRD, ['E01', 'E02'], 1);
    expect(result).toContain('E01');
    expect(result).toContain('E02');
  });
});

// ─── generateIndex ───────────────────────────────────────────────────────────

describe('generateIndex', () => {
  it('generates a markdown index with shard table', () => {
    const shards: ShardDescriptor[] = [
      { index: 1, epicIds: ['E01'], filePath: 'specs/prd/prd-001-e01.md' },
      { index: 2, epicIds: ['E02'], filePath: 'specs/prd/prd-002-e02.md' },
    ];
    const result = generateIndex(shards, 'MyProject');
    expect(result).toContain('PRD Index');
    expect(result).toContain('MyProject');
    expect(result).toContain('E01');
    expect(result).toContain('E02');
    expect(result).toContain('prd-001-e01.md');
  });

  it('uses "Project" as default name when not provided', () => {
    const result = generateIndex([]);
    expect(result).toContain('Project');
  });

  it('shows total shard count', () => {
    const shards: ShardDescriptor[] = [
      { index: 1, epicIds: ['E01'], filePath: 'a.md' },
    ];
    const result = generateIndex(shards);
    expect(result).toContain('1');
  });
});

// ─── pollution-key safety (no JSON state) ───────────────────────────────────

describe('pollution-key safety', () => {
  it('extractEpics does not crash on __proto__ bytes in content', () => {
    const content = Buffer.from('{"__proto__":{"evil":1}}\n### Epic E01: Test\nContent\n').toString();
    expect(() => extractEpics(content)).not.toThrow();
  });

  it('shouldShard does not crash on constructor key in content', () => {
    const content = Buffer.from('{"constructor":{"prototype":{}}}\nShort PRD').toString();
    expect(() => shouldShard(content)).not.toThrow();
  });
});
