/**
 * tests/test-requirements-baseline.test.ts — Requirements Baseline port tests.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARTIFACT_TYPES,
  assessImpact,
  checkBaseline,
  defaultBaseline,
  extractRequirementIds,
  freezeBaseline,
  getBaselineStatus,
  hashContent,
  loadBaseline,
  saveBaseline,
} from '../src/lib/requirements-baseline.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `test-baseline-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('defaultBaseline', () => {
  it('returns unfrozen baseline', () => {
    const b = defaultBaseline();
    expect(b.frozen).toBe(false);
    expect(b.baselines).toEqual([]);
    expect(b.change_requests).toEqual([]);
  });
});

describe('loadBaseline', () => {
  it('returns defaultBaseline when file missing', () => {
    const b = loadBaseline(join(tmpDir, 'missing.json'));
    expect(b.frozen).toBe(false);
  });

  it('returns defaultBaseline on invalid JSON', () => {
    const f = join(tmpDir, 'bad.json');
    writeFileSync(f, 'not json');
    const b = loadBaseline(f);
    expect(b.baselines).toEqual([]);
  });

  // Pollution key tests using raw bytes (not JSON.stringify which strips __proto__)
  it('rejects __proto__ pollution key', () => {
    const f = join(tmpDir, 'polluted.json');
    writeFileSync(
      f,
      '{"__proto__":{"evil":true},"version":"1.0.0","created_at":"2024-01-01T00:00:00.000Z","last_updated":null,"frozen":false,"baselines":[],"change_requests":[]}'
    );
    const b = loadBaseline(f);
    expect(b.baselines).toEqual([]);
  });

  it('rejects constructor pollution key', () => {
    const f = join(tmpDir, 'polluted2.json');
    writeFileSync(
      f,
      '{"constructor":{},"version":"1.0.0","created_at":"2024-01-01T00:00:00.000Z","last_updated":null,"frozen":false,"baselines":[],"change_requests":[]}'
    );
    const b = loadBaseline(f);
    expect(b.baselines).toEqual([]);
  });
});

describe('saveBaseline / loadBaseline round-trip', () => {
  it('saves and loads correctly', () => {
    const f = join(tmpDir, 'baseline.json');
    const b = defaultBaseline();
    saveBaseline(b, f);
    const loaded = loadBaseline(f);
    expect(loaded.version).toBe('1.0.0');
    expect(loaded.last_updated).toBeTruthy();
  });
});

describe('hashContent', () => {
  it('produces a 64-char hex string', () => {
    const h = hashContent('hello world');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
  });

  it('differs for different content', () => {
    expect(hashContent('abc')).not.toBe(hashContent('xyz'));
  });
});

describe('extractRequirementIds', () => {
  it('extracts REQ- ids', () => {
    const ids = extractRequirementIds('See REQ-001 and REQ-042');
    expect(ids).toContain('REQ-001');
    expect(ids).toContain('REQ-042');
  });

  it('extracts E-S ids', () => {
    const ids = extractRequirementIds('Story E01-S02 is key');
    expect(ids).toContain('E01-S02');
  });

  it('deduplicates', () => {
    const ids = extractRequirementIds('REQ-001 REQ-001 REQ-002');
    expect(ids.filter((id) => id === 'REQ-001').length).toBe(1);
  });

  it('returns sorted array', () => {
    const ids = extractRequirementIds('REQ-003 REQ-001 REQ-002');
    expect(ids).toEqual([...ids].sort());
  });
});

describe('freezeBaseline', () => {
  it('returns error when specs dir missing', () => {
    const result = freezeBaseline(tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/specs/);
  });

  it('freezes with existing spec files', () => {
    const specsDir = join(tmpDir, 'specs');
    mkdirSync(specsDir);
    writeFileSync(
      join(specsDir, 'prd.md'),
      '# PRD\n\nREQ-001 some requirement\n\n## Phase Gate Approval\n- [x] done\nApproved by: Alice'
    );
    const result = freezeBaseline(tmpDir);
    expect(result.success).toBe(true);
    expect(result.artifacts_frozen).toBeGreaterThan(0);
  });
});

describe('checkBaseline', () => {
  it('returns frozen=false when no baseline', () => {
    const result = checkBaseline(tmpDir);
    expect(result.frozen).toBe(false);
  });

  it('detects unchanged after freeze', () => {
    const specsDir = join(tmpDir, 'specs');
    mkdirSync(specsDir);
    writeFileSync(join(specsDir, 'prd.md'), '# PRD\n\nContent');
    freezeBaseline(tmpDir);
    const result = checkBaseline(tmpDir);
    expect(result.frozen).toBe(true);
    expect(result.drifted).toBe(false);
  });

  it('detects drift after file change', () => {
    const specsDir = join(tmpDir, 'specs');
    mkdirSync(specsDir);
    writeFileSync(join(specsDir, 'prd.md'), '# PRD\n\nOriginal');
    freezeBaseline(tmpDir);
    writeFileSync(join(specsDir, 'prd.md'), '# PRD\n\nModified content here');
    const result = checkBaseline(tmpDir);
    expect(result.drifted).toBe(true);
  });
});

describe('assessImpact', () => {
  it('returns none when no baseline exists', () => {
    const result = assessImpact('specs/prd.md', tmpDir);
    expect(result.impact).toBe('none');
  });
});

describe('getBaselineStatus', () => {
  it('returns unfrozen status for empty state', () => {
    const f = join(tmpDir, 'bl.json');
    const result = getBaselineStatus({ baselineFile: f });
    expect(result.frozen).toBe(false);
    expect(result.total_baselines).toBe(0);
  });
});

describe('ARTIFACT_TYPES', () => {
  it('includes prd and architecture', () => {
    expect(ARTIFACT_TYPES).toContain('prd');
    expect(ARTIFACT_TYPES).toContain('architecture');
  });
});
