/**
 * test-spec-quality.test.js — Layer 3: Unit Tests for English
 * 
 * Tests the spec-tester and smell-detector modules that analyze
 * specification prose for ambiguity, passive voice, metric gaps,
 * terminology drift, and spec smells.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  checkAmbiguity,
  checkMetricCoverage,
  checkPassiveVoice,
  checkTerminologyDrift,
  runAllChecks,
  VAGUE_ADJECTIVES,
} from '../src/lib/spec-tester.js';
import {
  detectSmells,
  scanDirectory,
  scoreSmellDensity,
  SMELL_PATTERNS,
} from '../src/lib/smell-detector.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');

// ─── Ambiguity Detection ─────────────────────────────────────────────────────

describe('Ambiguity Detection', () => {
  it('flags vague adjectives without metrics', () => {
    const content = 'The system must be scalable and fast.\nIt should provide a seamless user experience.';
    const result = checkAmbiguity(content);
    expect(result.count).toBeGreaterThan(0);
    expect(result.issues.some(i => i.word === 'scalable')).toBe(true);
    expect(result.issues.some(i => i.word === 'fast')).toBe(true);
    expect(result.issues.some(i => i.word === 'seamless')).toBe(true);
  });

  it('passes vague adjectives WITH metrics', () => {
    const content = 'The system must be scalable to 10000 concurrent users.\nResponse time must be fast, under 200ms.';
    const result = checkAmbiguity(content);
    // These should NOT be flagged because metrics follow
    expect(result.issues.filter(i => i.word === 'scalable').length).toBe(0);
    expect(result.issues.filter(i => i.word === 'fast').length).toBe(0);
  });

  it('skips code blocks and headings', () => {
    const content = '# Fast Architecture\n\n```\nconst scalable = true;\n```\n\nThe system is robust.';
    const result = checkAmbiguity(content);
    // Only "robust" on the non-code, non-heading line should be flagged
    expect(result.issues.some(i => i.word === 'robust')).toBe(true);
    expect(result.issues.filter(i => i.word === 'scalable').length).toBe(0);
  });

  it('returns zero issues for clean prose', () => {
    const content = 'The API server handles 500 requests per second.\nAuthentication uses JWT with 24-hour expiry.';
    const result = checkAmbiguity(content);
    expect(result.count).toBe(0);
  });

  it('VAGUE_ADJECTIVES list is comprehensive', () => {
    expect(VAGUE_ADJECTIVES).toContain('scalable');
    expect(VAGUE_ADJECTIVES).toContain('enterprise-grade');
    expect(VAGUE_ADJECTIVES).toContain('state-of-the-art');
    expect(VAGUE_ADJECTIVES.length).toBeGreaterThanOrEqual(20);
  });
});

// ─── Passive Voice Detection ─────────────────────────────────────────────────

describe('Passive Voice Detection', () => {
  it('detects passive voice constructions', () => {
    const content = 'Inputs are validated by the server.\nData is processed before storage.\nSessions must be managed securely.';
    const result = checkPassiveVoice(content);
    expect(result.count).toBeGreaterThan(0);
  });

  it('passes active voice constructions', () => {
    const content = 'The server validates all inputs.\nThe pipeline processes data before storage.';
    const result = checkPassiveVoice(content);
    expect(result.count).toBe(0);
  });

  it('skips code blocks', () => {
    const content = '```\n// Data is processed here\nconst result = processData(input);\n```';
    const result = checkPassiveVoice(content);
    expect(result.count).toBe(0);
  });
});

// ─── Metric Coverage ─────────────────────────────────────────────────────────

describe('Metric Coverage', () => {
  it('reports 100% for stories with metrics', () => {
    const content = `
#### E01-S01: User Registration
Response time under 200ms for registration.

#### E01-S02: User Login
Authentication completes within 100ms.
    `;
    const result = checkMetricCoverage(content);
    expect(result.coverage_pct).toBe(100);
    expect(result.gaps).toHaveLength(0);
  });

  it('detects stories without metrics', () => {
    const content = `
#### E01-S01: User Registration
The user can register for an account.

#### E01-S02: User Login
The user can log in successfully.
    `;
    const result = checkMetricCoverage(content);
    expect(result.coverage_pct).toBe(0);
    expect(result.gaps).toContain('E01-S01');
    expect(result.gaps).toContain('E01-S02');
  });

  it('returns 100% for no requirements', () => {
    const content = 'This is a general design document with no stories.';
    const result = checkMetricCoverage(content);
    expect(result.coverage_pct).toBe(100);
    expect(result.total_requirements).toBe(0);
  });
});

// ─── Terminology Drift ───────────────────────────────────────────────────────

describe('Terminology Drift', () => {
  it('returns empty for non-existent directory', () => {
    const result = checkTerminologyDrift('/nonexistent/path');
    expect(result.count).toBe(0);
    expect(result.drifts).toHaveLength(0);
  });

  it('detects user/customer drift if both used', () => {
    // Create temp files for testing
    const tmpDir = path.join(__dirname, 'tmp-drift-test');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'a.md'), 'The user logs into the system.');
    fs.writeFileSync(path.join(tmpDir, 'b.md'), 'The customer accesses the dashboard.');

    try {
      const result = checkTerminologyDrift(tmpDir);
      // Should detect user/customer as drift variants
      expect(result.drifts.some(d => d.variants.includes('user') && d.variants.includes('customer'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── Smell Detection ─────────────────────────────────────────────────────────

describe('Smell Detection', () => {
  it('detects vague quantifiers', () => {
    const content = 'The system should handle several concurrent requests.';
    const result = detectSmells(content);
    expect(result.smells.some(s => s.type === 'vague-quantifier')).toBe(true);
  });

  it('detects missing requirement owners', () => {
    const content = 'Someone should define the security policy.\nThey must implement authentication.';
    const result = detectSmells(content);
    expect(result.smells.some(s => s.type === 'missing-owner')).toBe(true);
  });

  it('detects hedge words', () => {
    const content = 'The feature might be needed. Perhaps we could add caching.';
    const result = detectSmells(content);
    expect(result.smells.some(s => s.type === 'hedge-word')).toBe(true);
  });

  it('detects unbounded lists', () => {
    const content = 'Support formats: JSON, XML, CSV, etc.';
    const result = detectSmells(content);
    expect(result.smells.some(s => s.type === 'unbounded-list')).toBe(true);
  });

  it('detects dangling references', () => {
    const content = 'As mentioned above, the API should be fast.';
    const result = detectSmells(content);
    expect(result.smells.some(s => s.type === 'dangling-reference')).toBe(true);
  });

  it('detects wishful thinking', () => {
    const content = 'It would be nice to have real-time sync in the future.';
    const result = detectSmells(content);
    expect(result.smells.some(s => s.type === 'wishful-thinking')).toBe(true);
  });

  it('skips code blocks and frontmatter', () => {
    const content = '---\nstatus: draft\n---\n\n```\nconst several = 5;\nmaybe something\n```\n\nClean prose here.';
    const result = detectSmells(content);
    // Should not detect smells inside code or frontmatter
    const codeSmells = result.smells.filter(s => s.text === 'several' || s.text === 'maybe');
    expect(codeSmells).toHaveLength(0);
  });

  it('excludes well-known acronyms from undefined-acronym', () => {
    const content = 'The API uses REST over HTTPS with JSON payloads and JWT tokens.';
    const result = detectSmells(content);
    const acronymSmells = result.smells.filter(s => s.type === 'undefined-acronym');
    // API, REST, HTTPS, JSON, JWT should all be excluded
    expect(acronymSmells).toHaveLength(0);
  });
});

// ─── Smell Density ───────────────────────────────────────────────────────────

describe('Smell Density', () => {
  it('computes density correctly', () => {
    const content = 'Several users might need this feature.\nPerhaps the team could implement it eventually.';
    const result = scoreSmellDensity(content);
    expect(result.prose_lines).toBeGreaterThan(0);
    expect(result.smell_count).toBeGreaterThan(0);
    expect(result.density).toBeGreaterThan(0);
  });

  it('returns 0 density for clean prose', () => {
    const content = 'The server processes 500 requests per second.\nThe database stores 10 million records.';
    const result = scoreSmellDensity(content);
    expect(result.density).toBe(0);
  });
});

// ─── Known Violations Fixture ────────────────────────────────────────────────

describe('Known Violations Fixture', () => {
  const violationsPath = path.join(__dirname, 'adversarial-review-tests', 'known-violations.md');

  it('known-violations.md triggers ambiguity warnings', () => {
    const content = fs.readFileSync(violationsPath, 'utf8');
    const result = checkAmbiguity(content);
    expect(result.count).toBeGreaterThanOrEqual(3);
  });

  it('known-violations.md triggers passive voice warnings', () => {
    const content = fs.readFileSync(violationsPath, 'utf8');
    const result = checkPassiveVoice(content);
    expect(result.count).toBeGreaterThanOrEqual(2);
  });

  it('known-violations.md triggers smell detection', () => {
    const content = fs.readFileSync(violationsPath, 'utf8');
    const result = detectSmells(content);
    expect(result.count).toBeGreaterThanOrEqual(3);
  });

  it('known-violations.md overall score is below 70', () => {
    const content = fs.readFileSync(violationsPath, 'utf8');
    const result = runAllChecks(content);
    expect(result.score).toBeLessThan(70);
    expect(result.pass).toBe(false);
  });
});

// ─── runAllChecks Orchestrator ───────────────────────────────────────────────

describe('runAllChecks', () => {
  it('passes clean content', () => {
    const content = `
#### E01-S01: User Registration
The API server creates a user account within 200ms.

#### E01-S02: User Login
The authentication service validates credentials in under 100ms.
    `;
    const result = runAllChecks(content);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('fails content with many issues', () => {
    const content = `
The system should be scalable and fast and robust. Several users might need this.
It is a flexible, high-performance, enterprise-grade platform. Various things are needed.
Perhaps the data is processed somewhere. It would be nice to have more features eventually.
The request was handled by the backend. The task was completed efficiently.
Someone should handle the authentication. As mentioned above, this is important.
Proper, seamless, intuitive functionality is expected across all use cases.
Support: JSON, XML, CSV, etc.
    `;
    const result = runAllChecks(content);
    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(70);
  });

  it('returns all check results', () => {
    const result = runAllChecks('Simple clean text.');
    expect(result).toHaveProperty('ambiguity');
    expect(result).toHaveProperty('passive_voice');
    expect(result).toHaveProperty('metric_coverage');
    expect(result).toHaveProperty('terminology_drift');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('pass');
  });
});
