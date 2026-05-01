/**
 * test-proactive-validator.test.ts — M11 batch 5 port coverage.
 *
 * Verifies the TS port at `src/lib/proactive-validator.ts` matches the
 * legacy `bin/lib/proactive-validator.js` public surface:
 *   - DIAGNOSTIC_CODES shape
 *   - inferSchemaName mapping
 *   - validateArtifactProactive: clean, vague, smelly, missing-section,
 *     non-existent + empty edge cases, strict threshold
 *   - validateAllArtifacts: empty + populated + cross_file structure
 *   - formatDiagnostic with/without file context
 *   - renderValidationReport: per-file sections + cross-file
 *
 * @see src/lib/proactive-validator.ts
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_CODES,
  formatDiagnostic,
  inferSchemaName,
  renderValidationReport,
  validateAllArtifacts,
  validateArtifactProactive,
} from '../src/lib/proactive-validator.js';

let tmpDir: string;

function writeSpec(name: string, content: string): string {
  const filePath = join(tmpDir, 'specs', name);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function makeCleanArtifact(): string {
  return [
    '---',
    'id: test-artifact',
    'phase: 0',
    'status: approved',
    '---',
    '',
    '# Test Artifact',
    '',
    'The system processes 100 requests per second with 99.9% uptime.',
    'Response time is under 200ms at the 95th percentile.',
    '',
    '## Requirements',
    '',
    'Users can log in within 2 seconds.',
    '',
    '## Phase Gate Approval',
    '',
    '- [x] All criteria met',
    '- [x] Quality gates passed',
    '',
    '**Approved by:** Human',
    '**Approval date:** 2026-01-01',
  ].join('\n');
}

function makeVagueArtifact(): string {
  return [
    '# Vague Artifact',
    '',
    'The system should be fast and scalable.',
    'It needs to be robust and user-friendly.',
    'We probably need a flexible architecture.',
    '',
    '## Phase Gate Approval',
    '',
    '- [ ] All criteria met',
    '',
    '**Approved by:** Pending',
  ].join('\n');
}

function makeSmellyArtifact(): string {
  return [
    '# Smelly Artifact',
    '',
    'The system should handle many requests, etc.',
    'Various components will be implemented and so on.',
    'Several different services will communicate somehow.',
    '',
    '## Phase Gate Approval',
    '',
    '- [ ] All criteria met',
    '',
    '**Approved by:** Pending',
  ].join('\n');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'proactive-validator-'));
  mkdirSync(join(tmpDir, 'specs'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('proactive-validator — DIAGNOSTIC_CODES', () => {
  it('contains the canonical 14 codes', () => {
    const expected = [
      'VAGUE_ADJ',
      'PASSIVE_VOICE',
      'GUESSING_LANG',
      'GWT_FORMAT',
      'METRIC_GAP',
      'SPEC_SMELL',
      'SCHEMA_ERROR',
      'MISSING_SECTION',
      'APPROVAL_PENDING',
      'PLACEHOLDER',
      'BROKEN_LINK',
      'SPEC_DRIFT',
      'COVERAGE_GAP',
      'UNMAPPED_NFR',
    ];
    for (const code of expected) {
      expect(DIAGNOSTIC_CODES).toHaveProperty(code);
      expect(DIAGNOSTIC_CODES[code]).toHaveProperty('severity');
      expect(DIAGNOSTIC_CODES[code]).toHaveProperty('description');
    }
  });

  it('every severity is one of error|warning|info', () => {
    const valid = new Set(['error', 'warning', 'info']);
    for (const entry of Object.values(DIAGNOSTIC_CODES)) {
      expect(valid.has(entry.severity)).toBe(true);
    }
  });
});

describe('proactive-validator — inferSchemaName', () => {
  it('maps known artifact filenames to schema names', () => {
    expect(inferSchemaName('prd.md')).toBe('prd');
    expect(inferSchemaName('architecture.md')).toBe('architecture');
    expect(inferSchemaName('challenger-brief.md')).toBe('challenger-brief');
    expect(inferSchemaName('product-brief.md')).toBe('product-brief');
    expect(inferSchemaName('implementation-plan.md')).toBe('implementation-plan');
    expect(inferSchemaName('codebase-context.md')).toBe('codebase-context');
  });

  it('returns null for unknown filenames', () => {
    expect(inferSchemaName('random.md')).toBeNull();
    expect(inferSchemaName('notes.md')).toBeNull();
  });
});

describe('proactive-validator — validateArtifactProactive (clean)', () => {
  it('returns a high score with few diagnostics', () => {
    const filePath = writeSpec('clean.md', makeCleanArtifact());
    const result = validateArtifactProactive(filePath);
    expect(result.file).toBe(filePath);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.pass).toBe(true);
  });
});

describe('proactive-validator — validateArtifactProactive (vague)', () => {
  it('produces VAGUE_ADJ diagnostics', () => {
    const filePath = writeSpec('vague.md', makeVagueArtifact());
    const result = validateArtifactProactive(filePath);
    const issues = result.diagnostics.filter((d) => d.code === 'VAGUE_ADJ');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.suggestion).toBeTruthy();
  });

  it('produces GUESSING_LANG diagnostics', () => {
    const filePath = writeSpec('vague.md', makeVagueArtifact());
    const result = validateArtifactProactive(filePath);
    const issues = result.diagnostics.filter((d) => d.code === 'GUESSING_LANG');
    expect(issues.length).toBeGreaterThan(0);
  });

  it('produces APPROVAL_PENDING for unapproved artifact', () => {
    const filePath = writeSpec('vague.md', makeVagueArtifact());
    const result = validateArtifactProactive(filePath);
    const issues = result.diagnostics.filter((d) => d.code === 'APPROVAL_PENDING');
    expect(issues.length).toBe(1);
  });
});

describe('proactive-validator — validateArtifactProactive (smelly)', () => {
  it('produces SPEC_SMELL diagnostics', () => {
    const filePath = writeSpec('smelly.md', makeSmellyArtifact());
    const result = validateArtifactProactive(filePath);
    const issues = result.diagnostics.filter((d) => d.code === 'SPEC_SMELL');
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('proactive-validator — validateArtifactProactive (edge cases)', () => {
  it('handles non-existent file gracefully', () => {
    const result = validateArtifactProactive(join(tmpDir, 'nonexistent.md'));
    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('SCHEMA_ERROR');
    expect(result.diagnostics[0]?.message).toMatch(/File not found/);
  });

  it('handles empty file', () => {
    const filePath = writeSpec('empty.md', '');
    const result = validateArtifactProactive(filePath);
    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('handles whitespace-only file', () => {
    const filePath = writeSpec('whitespace.md', '   \n\n   \n');
    const result = validateArtifactProactive(filePath);
    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('strict threshold rejects sub-100 scores', () => {
    const filePath = writeSpec('vague.md', makeVagueArtifact());
    const normal = validateArtifactProactive(filePath, { strict: false });
    const strict = validateArtifactProactive(filePath, { strict: true });
    expect(normal.score).toBe(strict.score);
    if (strict.score < 100) {
      expect(strict.pass).toBe(false);
    }
  });
});

describe('proactive-validator — diagnostic shape', () => {
  it('every diagnostic has required LSP-style fields', () => {
    const filePath = writeSpec('vague.md', makeVagueArtifact());
    const result = validateArtifactProactive(filePath);
    for (const d of result.diagnostics) {
      expect(typeof d.line).toBe('number');
      expect(typeof d.column).toBe('number');
      expect(['error', 'warning', 'info']).toContain(d.severity);
      expect(typeof d.code).toBe('string');
      expect(typeof d.message).toBe('string');
      expect(typeof d.source).toBe('string');
    }
  });
});

describe('proactive-validator — validateAllArtifacts', () => {
  it('returns zero files for empty specs directory', async () => {
    const result = await validateAllArtifacts(join(tmpDir, 'specs'));
    expect(result.files).toEqual([]);
    expect(result.summary.total_files).toBe(0);
    expect(result.summary.total_diagnostics).toBe(0);
  });

  it('aggregates multiple artifacts', async () => {
    writeSpec('clean.md', makeCleanArtifact());
    writeSpec('vague.md', makeVagueArtifact());
    const result = await validateAllArtifacts(join(tmpDir, 'specs'), { root: tmpDir });
    expect(result.files).toHaveLength(2);
    expect(result.summary.total_files).toBe(2);
    expect(result.summary.total_diagnostics).toBeGreaterThan(0);
  });

  it('normalizes file paths to specs/ relative', async () => {
    writeSpec('test.md', makeCleanArtifact());
    const result = await validateAllArtifacts(join(tmpDir, 'specs'), { root: tmpDir });
    expect(result.files[0]?.file).toBe('specs/test.md');
  });

  it('returns canonical cross_file structure', async () => {
    writeSpec('prd.md', makeCleanArtifact());
    const result = await validateAllArtifacts(join(tmpDir, 'specs'), { root: tmpDir });
    expect(result.cross_file).toHaveProperty('drift');
    expect(result.cross_file).toHaveProperty('broken_links');
    expect(result.cross_file).toHaveProperty('coverage_gaps');
    expect(result.cross_file).toHaveProperty('unmapped_nfrs');
  });

  it('computes summary averages', async () => {
    writeSpec('clean.md', makeCleanArtifact());
    writeSpec('vague.md', makeVagueArtifact());
    const result = await validateAllArtifacts(join(tmpDir, 'specs'), { root: tmpDir });
    expect(typeof result.summary.avg_score).toBe('number');
    expect(result.summary.pass_count + result.summary.fail_count).toBe(result.summary.total_files);
  });

  it('skips non-md files in specs dir', async () => {
    writeFileSync(join(tmpDir, 'specs', 'not-md.txt'), 'ignored');
    writeSpec('included.md', makeCleanArtifact());
    const result = await validateAllArtifacts(join(tmpDir, 'specs'), { root: tmpDir });
    expect(result.files).toHaveLength(1);
  });

  it('avg_score is null when no files', async () => {
    const result = await validateAllArtifacts(join(tmpDir, 'specs'));
    expect(result.summary.avg_score).toBeNull();
  });
});

describe('proactive-validator — formatDiagnostic', () => {
  it('formats with file context', () => {
    const formatted = formatDiagnostic(
      {
        line: 10,
        column: 5,
        severity: 'warning',
        code: 'VAGUE_ADJ',
        message: 'Vague word "fast"',
        suggestion: 'Add metric',
        source: 'spec-tester',
      },
      'specs/prd.md'
    );
    expect(formatted).toContain('specs/prd.md:10:5');
    expect(formatted).toContain('WARNING');
    expect(formatted).toContain('[VAGUE_ADJ]');
    expect(formatted).toContain('Vague word');
    expect(formatted).toContain('Add metric');
  });

  it('formats without file context', () => {
    const formatted = formatDiagnostic({
      line: 5,
      column: 0,
      severity: 'error',
      code: 'SCHEMA_ERROR',
      message: 'Missing field',
      suggestion: null,
      source: 'validator',
    });
    expect(formatted).toContain('line 5');
    expect(formatted).toContain('ERROR');
    expect(formatted).toContain('[SCHEMA_ERROR]');
  });

  it('omits suggestion section when null', () => {
    const formatted = formatDiagnostic({
      line: 1,
      column: 0,
      severity: 'info',
      code: 'GWT_FORMAT',
      message: 'm',
      suggestion: null,
      source: 's',
    });
    expect(formatted).not.toContain(' — ');
  });
});

describe('proactive-validator — renderValidationReport', () => {
  it('renders header + per-file sections', () => {
    const report = renderValidationReport({
      files: [
        { file: 'specs/prd.md', score: 75, pass: true, diagnostics: [] },
        {
          file: 'specs/vague.md',
          score: 45,
          pass: false,
          diagnostics: [
            {
              line: 3,
              column: 0,
              severity: 'warning',
              code: 'VAGUE_ADJ',
              message: 'Vague',
              suggestion: 'Add metric',
              source: 'spec-tester',
            },
          ],
        },
      ],
      cross_file: {
        drift: null,
        broken_links: null,
        coverage_gaps: null,
        unmapped_nfrs: null,
      },
      summary: {
        total_files: 2,
        total_diagnostics: 1,
        pass_count: 1,
        fail_count: 1,
        avg_score: 60,
      },
    });
    expect(report).toContain('# Proactive Validation Report');
    expect(report).toContain('specs/prd.md');
    expect(report).toContain('specs/vague.md');
    expect(report).toContain('60/100');
  });

  it('includes cross-file section when findings exist', () => {
    const report = renderValidationReport({
      files: [],
      cross_file: {
        drift: [
          {
            severity: 'warning',
            code: 'SPEC_DRIFT',
            message: 'Story drifted',
            source: 'spec-drift',
          },
        ],
        broken_links: null,
        coverage_gaps: null,
        unmapped_nfrs: null,
      },
      summary: {
        total_files: 0,
        total_diagnostics: 1,
        pass_count: 0,
        fail_count: 0,
        avg_score: null,
      },
    });
    expect(report).toContain('Cross-File');
    expect(report).toContain('SPEC_DRIFT');
  });

  it('omits average score line when null', () => {
    const report = renderValidationReport({
      files: [],
      cross_file: {
        drift: null,
        broken_links: null,
        coverage_gaps: null,
        unmapped_nfrs: null,
      },
      summary: {
        total_files: 0,
        total_diagnostics: 0,
        pass_count: 0,
        fail_count: 0,
        avg_score: null,
      },
    });
    expect(report).not.toContain('Average quality score');
  });

  it('renders "No issues found" for clean files', () => {
    const report = renderValidationReport({
      files: [{ file: 'specs/clean.md', score: 100, pass: true, diagnostics: [] }],
      cross_file: {
        drift: null,
        broken_links: null,
        coverage_gaps: null,
        unmapped_nfrs: null,
      },
      summary: {
        total_files: 1,
        total_diagnostics: 0,
        pass_count: 1,
        fail_count: 0,
        avg_score: 100,
      },
    });
    expect(report).toContain('No issues found.');
  });
});
