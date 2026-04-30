/**
 * tests/test-spec-tester.test.ts -- vitest suite for src/lib/spec-tester.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  VAGUE_ADJECTIVES,
  METRIC_PATTERNS,
  PASSIVE_PATTERNS,
  GUESSING_WORDS,
  checkAmbiguity,
  checkPassiveVoice,
  checkMetricCoverage,
  checkTerminologyDrift,
  checkGWTFormat,
  checkGuessingLanguage,
  runAllChecks,
  generateReport,
} from '../src/lib/spec-tester.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-tester-test-'));
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

// ─── exports ─────────────────────────────────────────────────────────────────

describe('exports', () => {
  it('VAGUE_ADJECTIVES is a non-empty array', () => {
    expect(Array.isArray(VAGUE_ADJECTIVES)).toBe(true);
    expect(VAGUE_ADJECTIVES.length).toBeGreaterThan(0);
    expect(VAGUE_ADJECTIVES).toContain('scalable');
  });

  it('METRIC_PATTERNS is a non-empty array of RegExp', () => {
    expect(Array.isArray(METRIC_PATTERNS)).toBe(true);
    expect(METRIC_PATTERNS[0]).toBeInstanceOf(RegExp);
  });

  it('PASSIVE_PATTERNS is a non-empty array of RegExp', () => {
    expect(Array.isArray(PASSIVE_PATTERNS)).toBe(true);
  });

  it('GUESSING_WORDS is a non-empty array', () => {
    expect(Array.isArray(GUESSING_WORDS)).toBe(true);
    expect(GUESSING_WORDS).toContain('probably');
  });
});

// ─── checkAmbiguity ──────────────────────────────────────────────────────────

describe('checkAmbiguity', () => {
  it('returns zero issues for content with no vague adjectives', () => {
    const result = checkAmbiguity('The API returns results in 200ms per request.');
    expect(result.count).toBe(0);
  });

  it('detects vague adjective without metric', () => {
    const result = checkAmbiguity('The system should be fast and scalable.');
    expect(result.count).toBeGreaterThan(0);
    const words = result.issues.map(i => i.word);
    expect(words).toContain('fast');
    expect(words).toContain('scalable');
  });

  it('ignores vague adjective when metric follows in same line', () => {
    const result = checkAmbiguity('The system should be fast (under 200ms response time).');
    // "fast" with "200ms" on same line should not be flagged
    const fastIssues = result.issues.filter(i => i.word === 'fast');
    expect(fastIssues.length).toBe(0);
  });

  it('skips code blocks', () => {
    const result = checkAmbiguity('```\nscalable fast\n```');
    expect(result.count).toBe(0);
  });

  it('skips headings', () => {
    const result = checkAmbiguity('# Scalable Architecture\n## Fast System');
    expect(result.count).toBe(0);
  });
});

// ─── checkPassiveVoice ───────────────────────────────────────────────────────

describe('checkPassiveVoice', () => {
  it('returns zero issues for active voice', () => {
    const result = checkPassiveVoice('The API validates user credentials.');
    expect(result.count).toBe(0);
  });

  it('detects passive voice constructions', () => {
    const result = checkPassiveVoice('User credentials are validated by the system.');
    expect(result.count).toBeGreaterThan(0);
  });

  it('skips code blocks', () => {
    const result = checkPassiveVoice('```\ndata is processed\n```');
    expect(result.count).toBe(0);
  });
});

// ─── checkMetricCoverage ─────────────────────────────────────────────────────

describe('checkMetricCoverage', () => {
  it('returns 100% for content with no requirements', () => {
    const result = checkMetricCoverage('General prose content');
    expect(result.coverage_pct).toBe(100);
    expect(result.total_requirements).toBe(0);
  });

  it('detects requirements without metrics', () => {
    const content = `
#### E01-S01: User Login
The user can log in.

#### E01-S02: Dashboard
The user sees the dashboard.
`;
    const result = checkMetricCoverage(content);
    expect(result.total_requirements).toBe(2);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it('counts requirements with MEASURABLE tag as having metrics', () => {
    const content = `
#### E01-S01: User Login
Response time [MEASURABLE].
`;
    const result = checkMetricCoverage(content);
    expect(result.with_metrics).toBe(1);
    expect(result.gaps).not.toContain('E01-S01');
  });
});

// ─── checkGWTFormat ──────────────────────────────────────────────────────────

describe('checkGWTFormat', () => {
  it('returns zero non-GWT count for content with no AC section', () => {
    const result = checkGWTFormat('No acceptance criteria here');
    expect(result.non_gwt_count).toBe(0);
    expect(result.gwt_count).toBe(0);
  });

  it('counts GWT-format criteria', () => {
    const content = `
## Acceptance Criteria
- Given the user is logged in
- When they click logout
- Then they are redirected to login page
`;
    const result = checkGWTFormat(content);
    expect(result.gwt_count).toBeGreaterThan(0);
  });

  it('flags non-GWT criteria in AC section', () => {
    const content = `
## Acceptance Criteria
- User can log in
- System validates credentials
`;
    const result = checkGWTFormat(content);
    expect(result.non_gwt_count).toBeGreaterThan(0);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

// ─── checkGuessingLanguage ───────────────────────────────────────────────────

describe('checkGuessingLanguage', () => {
  it('returns zero issues for confident language', () => {
    const result = checkGuessingLanguage('The API validates credentials and returns a JWT token.');
    expect(result.count).toBe(0);
  });

  it('detects guessing language', () => {
    const result = checkGuessingLanguage('Probably we should use Redis for caching.');
    expect(result.count).toBeGreaterThan(0);
    expect(result.issues[0]?.word).toBe('probably');
  });

  it('detects TBD and TODO', () => {
    const result = checkGuessingLanguage('The architecture is TBD and implementation is TODO.');
    expect(result.count).toBeGreaterThan(0);
  });

  it('skips code blocks', () => {
    const result = checkGuessingLanguage('```\nTBD TODO\n```');
    expect(result.count).toBe(0);
  });
});

// ─── checkTerminologyDrift ───────────────────────────────────────────────────

describe('checkTerminologyDrift', () => {
  it('returns empty drifts for non-existent directory', () => {
    const result = checkTerminologyDrift('/nonexistent/specs');
    expect(result.count).toBe(0);
    expect(result.drifts).toEqual([]);
  });

  it('detects terminology drift across files', () => {
    write('a.md', 'The user logs in to the system.');
    write('b.md', 'The customer signs in to the platform.');
    const result = checkTerminologyDrift(tmpDir);
    // 'user' and 'customer' are in the same drift group
    expect(result.count).toBeGreaterThanOrEqual(1);
  });
});

// ─── runAllChecks ─────────────────────────────────────────────────────────────

describe('runAllChecks', () => {
  it('returns a score between 0-100', () => {
    const result = runAllChecks('Some plain text content');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns pass:true for clean content', () => {
    const result = runAllChecks('The API returns HTTP 200 in under 100ms.');
    expect(result.pass).toBe(true);
  });

  it('returns all check sub-results', () => {
    const result = runAllChecks('content');
    expect(result.ambiguity).toBeDefined();
    expect(result.passive_voice).toBeDefined();
    expect(result.metric_coverage).toBeDefined();
    expect(result.terminology_drift).toBeDefined();
    expect(result.gwt_format).toBeDefined();
    expect(result.guessing_language).toBeDefined();
  });

  it('passes strict option correctly', () => {
    const result = runAllChecks('probably scalable', { strict: true });
    expect(result.pass).toBe(false);
  });
});

// ─── generateReport ──────────────────────────────────────────────────────────

describe('generateReport', () => {
  it('generates a markdown report from a file', () => {
    const fp = write('spec.md', 'The system should be fast.');
    const report = generateReport(fp);
    expect(report).toContain('Spec Quality Report');
    expect(report).toContain('spec.md');
    expect(report).toContain('Overall Score');
  });
});

// ─── pollution-key safety (no JSON state) ───────────────────────────────────

describe('pollution-key safety', () => {
  it('checkAmbiguity does not crash on __proto__ bytes in content', () => {
    const content = Buffer.from('{"__proto__":{"evil":1}} scalable fast').toString();
    expect(() => checkAmbiguity(content)).not.toThrow();
  });

  it('checkGuessingLanguage does not crash on constructor key bytes', () => {
    const content = Buffer.from('{"constructor":{"prototype":{}}} probably TBD').toString();
    expect(() => checkGuessingLanguage(content)).not.toThrow();
  });
});
