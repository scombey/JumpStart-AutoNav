/**
 * tests/test-portfolio-reporting.test.ts — Portfolio Reporting port tests (M11 batch 6).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PHASES,
  PORTFOLIO_STATUSES,
  defaultPortfolio,
  getPortfolioStatus,
  loadPortfolio,
  registerInitiative,
  removeInitiative,
  savePortfolio,
  takeSnapshot,
} from '../src/lib/portfolio-reporting.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `test-portfolio-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('defaultPortfolio', () => {
  it('returns version 1.0.0', () => {
    const p = defaultPortfolio();
    expect(p.version).toBe('1.0.0');
    expect(p.initiatives).toEqual([]);
    expect(p.snapshots).toEqual([]);
  });
});

describe('loadPortfolio', () => {
  it('returns defaultPortfolio when file missing', () => {
    const p = loadPortfolio(join(tmpDir, 'nonexistent.json'));
    expect(p.version).toBe('1.0.0');
  });

  it('returns defaultPortfolio on invalid JSON', () => {
    const f = join(tmpDir, 'bad.json');
    writeFileSync(f, 'not json');
    const p = loadPortfolio(f);
    expect(p.initiatives).toEqual([]);
  });

  // Prototype pollution: raw __proto__ key injection in JSON bytes
  it('rejects __proto__ pollution key in JSON', () => {
    const f = join(tmpDir, 'polluted.json');
    writeFileSync(f, '{"__proto__":{"x":1},"initiatives":[],"snapshots":[],"version":"1.0.0","created_at":"2024-01-01T00:00:00.000Z","last_updated":null}');
    const p = loadPortfolio(f);
    // Should return defaultPortfolio() due to pollution rejection
    expect(p.initiatives).toEqual([]);
  });

  it('rejects constructor pollution key in JSON', () => {
    const f = join(tmpDir, 'polluted2.json');
    writeFileSync(f, '{"constructor":{},"initiatives":[],"snapshots":[],"version":"1.0.0","created_at":"2024-01-01T00:00:00.000Z","last_updated":null}');
    const p = loadPortfolio(f);
    expect(p.initiatives).toEqual([]);
  });
});

describe('savePortfolio / loadPortfolio round-trip', () => {
  it('saves and loads correctly', () => {
    const f = join(tmpDir, 'portfolio.json');
    const p = defaultPortfolio();
    savePortfolio(p, f);
    const loaded = loadPortfolio(f);
    expect(loaded.version).toBe('1.0.0');
    expect(loaded.last_updated).toBeTruthy();
  });
});

describe('registerInitiative', () => {
  it('registers a new initiative', () => {
    const f = join(tmpDir, 'portfolio.json');
    const result = registerInitiative({ name: 'Test Initiative' }, { portfolioFile: f });
    expect(result.success).toBe(true);
    expect(result.initiative?.id).toBe('test-initiative');
  });

  it('rejects missing name', () => {
    const f = join(tmpDir, 'portfolio.json');
    const result = registerInitiative({ name: '' }, { portfolioFile: f });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate id', () => {
    const f = join(tmpDir, 'portfolio.json');
    registerInitiative({ name: 'My Project' }, { portfolioFile: f });
    const result = registerInitiative({ name: 'My Project' }, { portfolioFile: f });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already exists/);
  });

  it('sets status to on-track by default', () => {
    const f = join(tmpDir, 'portfolio.json');
    const result = registerInitiative({ name: 'Alpha' }, { portfolioFile: f });
    expect(result.initiative?.status).toBe('on-track');
  });
});

describe('removeInitiative', () => {
  it('removes existing initiative', () => {
    const f = join(tmpDir, 'portfolio.json');
    registerInitiative({ name: 'Remove Me' }, { portfolioFile: f });
    const result = removeInitiative('remove-me', { portfolioFile: f });
    expect(result.success).toBe(true);
    expect(result.removed).toBe('Remove Me');
  });

  it('returns error for missing initiative', () => {
    const f = join(tmpDir, 'portfolio.json');
    const result = removeInitiative('nonexistent', { portfolioFile: f });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/);
  });
});

describe('getPortfolioStatus', () => {
  it('returns success with empty portfolio', () => {
    const f = join(tmpDir, 'portfolio.json');
    const result = getPortfolioStatus({ portfolioFile: f });
    expect(result.success).toBe(true);
    expect(result.total_initiatives).toBe(0);
  });

  it('includes all status counts', () => {
    const f = join(tmpDir, 'portfolio.json');
    const result = getPortfolioStatus({ portfolioFile: f });
    for (const s of PORTFOLIO_STATUSES) {
      expect(typeof result.status_counts[s]).toBe('number');
    }
  });
});

describe('takeSnapshot', () => {
  it('creates a snapshot', () => {
    const f = join(tmpDir, 'portfolio.json');
    const result = takeSnapshot({ portfolioFile: f });
    expect(result.success).toBe(true);
    expect(result.snapshot.taken_at).toBeTruthy();
  });

  it('snapshot caps at 100 entries', () => {
    const f = join(tmpDir, 'portfolio.json');
    for (let i = 0; i < 105; i++) takeSnapshot({ portfolioFile: f });
    const p = loadPortfolio(f);
    expect(p.snapshots.length).toBe(100);
  });
});

describe('PHASES', () => {
  it('includes expected phase IDs', () => {
    const ids = PHASES.map(p => p.id);
    expect(ids).toContain('phase-0');
    expect(ids).toContain('phase-4');
  });
});

describe('PORTFOLIO_STATUSES', () => {
  it('includes on-track and blocked', () => {
    expect(PORTFOLIO_STATUSES).toContain('on-track');
    expect(PORTFOLIO_STATUSES).toContain('blocked');
  });
});
