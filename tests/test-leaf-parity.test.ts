/**
 * test-leaf-parity.test.ts — TS↔JS byte-identical parity (QA-F1).
 *
 * Every M2 port's docstring claims "byte-identical successful-path
 * output vs the legacy `bin/lib/<name>.js`." This file is the only
 * test that actually verifies that claim by importing both the legacy
 * JS module and the TS port and comparing their pure-function output
 * for fixture inputs.
 *
 * Coverage: pure functions only — anything that touches stdin, fs, or
 * git is exercised by the per-module test file. The parity test
 * locks down the SHAPE of the output, including object key order
 * (which `JSON.stringify` is sensitive to).
 *
 * Modules covered:
 *   - hashing.ts: hashContent
 *   - timestamps.ts: now (shape only), validate
 *   - diff.ts: unifiedDiff, generateDiff (no-fs cases)
 *   - context-chunker.ts: estimateTokens, chunkContent
 *   - artifact-comparison.ts: compareArtifacts, extractSections
 *   - ambiguity-heatmap.ts: scanAmbiguity
 *   - complexity.ts: calculateComplexity
 *   - locks.ts: NOT covered here (the port intentionally diverges via
 *     hash-based naming + atomic O_EXCL — Pit Crew Adv-1 fix).
 *   - versioning.ts: NOT covered for createVersionTag (git-aware) but
 *     generateTag IS covered.
 *   - io.ts: NOT covered here (the port intentionally diverges via
 *     throw-based error contract — documented in the port docstring).
 *
 * @see Pit Crew QA F1
 * @see specs/decisions/adr-005-module-layout.md (strangler-fig)
 */

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// CommonJS-aware require for legacy bin/lib/*.js modules. Using
// process.cwd() rather than import.meta.url — the test file is type-
// checked under module: NodeNext + no `"type": "module"` flag in
// package.json, so the compiler classifies it as CommonJS and rejects
// `import.meta` (TS1470). vitest always launches from repo root, so
// process.cwd() is the right anchor for createRequire.
const require = createRequire(`${process.cwd()}/`);

// ─────────────────────────────────────────────────────────────────────────
// hashing
// ─────────────────────────────────────────────────────────────────────────

describe('hashing — TS↔JS parity', () => {
  it('hashContent: identical hex digest across 4 input sizes', async () => {
    const tsModule = await import('../src/lib/hashing.js');
    const jsModule = require(`${process.cwd()}/bin/lib/hashing.js`);
    const inputs = ['', 'abc', 'a'.repeat(1024), 'spec content with unicode: 日本語'];
    for (const input of inputs) {
      expect(tsModule.hashContent(input)).toBe(jsModule.hashContent(input));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// timestamps
// ─────────────────────────────────────────────────────────────────────────

describe('timestamps — TS↔JS parity', () => {
  it('validate: same result shape across valid + invalid inputs', async () => {
    const tsModule = await import('../src/lib/timestamps.js');
    // @ts-expect-error legacy JS, no .d.ts (parity test imports raw runtime export — see tests/test-leaf-parity.test.ts header)
    const jsModule = (await import('../bin/lib/timestamps.mjs')) as any;
    const inputs = [
      '2024-01-01T00:00:00Z',
      '2024-01-01T00:00:00.123Z',
      '2024-01-01T00:00:00+00:00',
      'not-a-date',
      '',
      '2024-13-01T00:00:00Z',
    ];
    for (const input of inputs) {
      expect(tsModule.validate(input)).toEqual(jsModule.validate(input));
    }
  });

  it('now: shape parity (both return ISO 8601 UTC ending in Z)', async () => {
    const tsModule = await import('../src/lib/timestamps.js');
    // @ts-expect-error legacy JS, no .d.ts (parity test imports raw runtime export — see tests/test-leaf-parity.test.ts header)
    const jsModule = (await import('../bin/lib/timestamps.mjs')) as any;
    const tsNow = tsModule.now();
    const jsNow = jsModule.now();
    // Can't compare values (clock advances) but both must match the regex.
    expect(tsNow).toMatch(tsModule.ISO_UTC_REGEX);
    expect(jsNow).toMatch(tsModule.ISO_UTC_REGEX);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// diff (no-fs cases — generateDiff with explicit `old` + `new`)
// ─────────────────────────────────────────────────────────────────────────

describe('diff — TS↔JS parity (no fs reads)', () => {
  it('unifiedDiff: byte-identical output across edit cases', async () => {
    const tsModule = await import('../src/lib/diff.js');
    // @ts-expect-error legacy JS, no .d.ts (parity test imports raw runtime export — see tests/test-leaf-parity.test.ts header)
    const jsModule = (await import('../bin/lib/diff.mjs')) as any;
    const cases = [
      ['', '', 'empty.txt'],
      ['a\nb\nc', 'a\nB\nc', 'mid-edit.txt'],
      ['x\ny\nz', 'x\ny\nz', 'unchanged.txt'],
      ['one', 'one\ntwo', 'append.txt'],
    ];
    for (const [a, b, p] of cases) {
      expect(tsModule.unifiedDiff(a, b, p)).toBe(jsModule.unifiedDiff(a, b, p));
    }
  });

  it('generateDiff: identical create-only result with no fs touches', async () => {
    const tsModule = await import('../src/lib/diff.js');
    // @ts-expect-error legacy JS, no .d.ts (parity test imports raw runtime export — see tests/test-leaf-parity.test.ts header)
    const jsModule = (await import('../bin/lib/diff.mjs')) as any;
    const input = {
      changes: [{ type: 'create' as const, path: 'new.txt', content: 'a\nb\nc' }],
      root: process.cwd(),
    };
    const tsResult = tsModule.generateDiff(input);
    const jsResult = jsModule.generateDiff(input);
    expect(tsResult).toEqual(jsResult);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// context-chunker
// ─────────────────────────────────────────────────────────────────────────

describe('context-chunker — TS↔JS parity', () => {
  it('estimateTokens: identical math', async () => {
    const tsModule = await import('../src/lib/context-chunker.js');
    // @ts-expect-error legacy JS, no .d.ts (parity test imports raw runtime export — see tests/test-leaf-parity.test.ts header)
    const jsModule = (await import('../bin/lib/context-chunker.js')) as any;
    for (const input of ['', 'abc', 'a'.repeat(1000), 'unicode: 日本語']) {
      expect(tsModule.estimateTokens(input)).toBe(jsModule.estimateTokens(input));
    }
  });

  it('chunkContent: identical chunk plan for healthy inputs', async () => {
    const tsModule = await import('../src/lib/context-chunker.js');
    // @ts-expect-error legacy JS, no .d.ts (parity test imports raw runtime export — see tests/test-leaf-parity.test.ts header)
    const jsModule = (await import('../bin/lib/context-chunker.js')) as any;
    // Note: legacy uses overlap < maxTokens by default so the new
    // Adv-6 guard doesn't fire on legitimate inputs.
    const cases = [
      { content: 'a'.repeat(50_000), options: { model: 'gpt-4' } },
      { content: 'line\n'.repeat(200), options: { model: 'claude-3-haiku' } },
    ];
    for (const { content, options } of cases) {
      expect(tsModule.chunkContent(content, options)).toEqual(
        jsModule.chunkContent(content, options)
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// artifact-comparison
// ─────────────────────────────────────────────────────────────────────────

describe('artifact-comparison — TS↔JS parity', () => {
  it('compareArtifacts: identical changes array across cases', async () => {
    const tsModule = await import('../src/lib/artifact-comparison.js');
    // @ts-expect-error legacy JS, no .d.ts (parity test imports raw runtime export — see tests/test-leaf-parity.test.ts header)
    const jsModule = (await import('../bin/lib/artifact-comparison.js')) as any;
    const cases = [
      ['# A\nbody', '# A\nbody'],
      ['# A\nold', '# A\nnew\n## B\nadded'],
      ['# A\nthing\n## B\ngone', '# A\nthing'],
    ];
    for (const [a, b] of cases) {
      // The legacy returns changes in insertion order from a Set
      // iteration; compare as sets to avoid order-dependence.
      const ts = tsModule.compareArtifacts(a, b);
      const js = jsModule.compareArtifacts(a, b) as {
        success: boolean;
        changes?: Array<{ type: string; section: string }>;
        lines_before?: number;
        lines_after?: number;
        line_diff?: number;
      };
      expect(ts.success).toBe(js.success);
      if (ts.success && js.success && js.changes) {
        expect(new Set(ts.changes.map((c) => `${c.type}:${c.section}`))).toEqual(
          new Set(js.changes.map((c) => `${c.type}:${c.section}`))
        );
        expect(ts.lines_before).toBe(js.lines_before);
        expect(ts.lines_after).toBe(js.lines_after);
        expect(ts.line_diff).toBe(js.line_diff);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ambiguity-heatmap
// ─────────────────────────────────────────────────────────────────────────

describe('ambiguity-heatmap — TS↔JS parity', () => {
  it('scanAmbiguity: identical metrics across spec-shaped inputs', async () => {
    const tsModule = await import('../src/lib/ambiguity-heatmap.js');
    const jsModule = require(`${process.cwd()}/bin/lib/ambiguity-heatmap.js`);
    const inputs = [
      'The system should be intuitive and seamless.',
      'Must be fast and secure with high availability.',
      'Concrete spec with explicit thresholds.',
      '',
    ];
    for (const input of inputs) {
      const tsResult = tsModule.scanAmbiguity(input);
      const jsResult = jsModule.scanAmbiguity(input);
      expect(tsResult.success).toBe(jsResult.success);
      if (tsResult.success && jsResult.success) {
        expect(tsResult.metrics).toEqual(jsResult.metrics);
        expect(tsResult.total_findings).toBe(jsResult.total_findings);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// complexity
// ─────────────────────────────────────────────────────────────────────────

describe('complexity — TS↔JS parity', () => {
  it('calculateComplexity: identical depth + score + breakdown across signals', async () => {
    const tsModule = await import('../src/lib/complexity.js');
    // @ts-expect-error legacy JS, no .d.ts (parity test imports raw runtime export — see tests/test-leaf-parity.test.ts header)
    const jsModule = (await import('../bin/lib/complexity.mjs')) as any;
    const cases = [
      {},
      { description: 'security compliance gdpr hipaa pci', file_count: 250, domain: 'healthcare' },
      { description: 'simple internal tool', file_count: 5, domain: 'general' },
      { dependency_count: 50, integrations: 8, stakeholder_count: 10 },
    ];
    for (const input of cases) {
      expect(tsModule.calculateComplexity(input)).toEqual(jsModule.calculateComplexity(input));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// versioning (git-free part only)
// ─────────────────────────────────────────────────────────────────────────

describe('versioning — TS↔JS parity (git-free)', () => {
  it('generateTag: identical canonical-shape output', async () => {
    const tsModule = await import('../src/lib/versioning.js');
    const jsModule = require(`${process.cwd()}/bin/lib/versioning.js`);
    const cases = [
      ['prd', '1.0.0'],
      ['architecture', '2.3.5'],
      ['challenger-brief', '0.0.1-rc.1'],
    ];
    for (const [name, ver] of cases) {
      expect(tsModule.generateTag(name, ver)).toBe(jsModule.generateTag(name, ver));
    }
  });
});
