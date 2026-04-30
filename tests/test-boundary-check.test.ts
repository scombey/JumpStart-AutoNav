/**
 * tests/test-boundary-check.test.ts -- vitest suite for src/lib/boundary-check.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  extractBoundaries,
  extractPlanScope,
  checkBoundaries,
} from '../src/lib/boundary-check.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(name: string, content: string) {
  const p = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ─── extractBoundaries ───────────────────────────────────────────────────────

describe('extractBoundaries', () => {
  it('returns empty array for content with no boundary sections', () => {
    const result = extractBoundaries('# Product Brief\n\nGeneral content');
    expect(result).toEqual([]);
  });

  it('extracts boundaries from "Constraints" section', () => {
    const content = `
## Constraints
- No third-party payment processors
- Avoid Redis for session storage
`;
    const result = extractBoundaries(content);
    expect(result.length).toBe(2);
    expect(result[0]?.statement).toContain('payment processors');
  });

  it('extracts boundaries from "Out of Scope" section', () => {
    const content = `
## Out of Scope
- Mobile app development
- Multi-language support
`;
    const result = extractBoundaries(content);
    expect(result.length).toBe(2);
  });

  it('stops extracting when hitting non-boundary heading', () => {
    const content = `
## Constraints
- No MongoDB
## Architecture
## Goals
`;
    const result = extractBoundaries(content);
    expect(result.length).toBe(1);
    expect(result[0]?.statement).toContain('MongoDB');
  });

  it('extracts numbered list items', () => {
    const content = `
## Constraints
1. No external API calls
2. Do not use Docker
`;
    const result = extractBoundaries(content);
    expect(result.length).toBe(2);
  });
});

// ─── extractPlanScope ────────────────────────────────────────────────────────

describe('extractPlanScope', () => {
  it('returns empty array for content with no task sections', () => {
    const result = extractPlanScope('No tasks here');
    expect(result).toEqual([]);
  });

  it('extracts task IDs and descriptions', () => {
    const content = `
### M1-T01: Build user authentication
Use PostgreSQL for user storage.

### M1-T02: Create dashboard
Use React for frontend.
`;
    const result = extractPlanScope(content);
    expect(result.length).toBe(2);
    const t01 = result[0];
    if (!t01) throw new Error('expected task');
    expect(t01.id).toBe('M1-T01');
    expect(t01.description).toContain('user authentication');
  });
});

// ─── checkBoundaries ─────────────────────────────────────────────────────────

describe('checkBoundaries', () => {
  it('returns error when brief file not found', () => {
    const result = checkBoundaries({ brief: '/nonexistent/brief.md', plan: '/nonexistent/plan.md', root: '.' });
    expect(result.pass).toBe(false);
    expect(result.error).toContain('Cannot read brief');
  });

  it('returns error when plan file not found', () => {
    const brief = write('brief.md', '# Brief\n');
    const result = checkBoundaries({ brief, plan: '/nonexistent/plan.md', root: tmpDir });
    expect(result.pass).toBe(false);
    expect(result.error).toContain('Cannot read plan');
  });

  it('passes when plan does not contain excluded terms', () => {
    const brief = write('brief.md', `
## Constraints
- No MongoDB
- Avoid Redis
`);
    const plan = write('plan.md', `
### M1-T01: Build API
Use PostgreSQL for storage.
`);
    const result = checkBoundaries({ brief, plan, root: tmpDir });
    expect(result.pass).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('detects violations when plan contains excluded terms', () => {
    const brief = write('brief.md', `
## Constraints
- Do not use mongodb in the implementation
`);
    const plan = write('plan.md', `
### M1-T01: Build API
Set up mongodb for persistence.
`);
    const result = checkBoundaries({ brief, plan, root: tmpDir });
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('returns warning when no boundaries found in brief', () => {
    const brief = write('brief.md', '# Brief\n\nGeneral content only');
    const plan = write('plan.md', '# Plan\n\nM1-T01: Do something');
    const result = checkBoundaries({ brief, plan, root: tmpDir });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain('No boundary');
  });

  it('includes score 0-100', () => {
    const brief = write('brief.md', '# Brief\n');
    const plan = write('plan.md', '# Plan\n');
    const result = checkBoundaries({ brief, plan, root: tmpDir });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ─── pollution-key safety (no JSON state) ───────────────────────────────────

describe('pollution-key safety', () => {
  it('extractBoundaries does not crash on __proto__ bytes in content', () => {
    const content = Buffer.from('{"__proto__":{"evil":1}}\n## Constraints\n- No MongoDB\n').toString();
    expect(() => extractBoundaries(content)).not.toThrow();
  });

  it('extractPlanScope does not crash on constructor key in content', () => {
    const content = Buffer.from('{"constructor":{"prototype":{}}}\n### M1-T01: task\n').toString();
    expect(() => extractPlanScope(content)).not.toThrow();
  });
});
