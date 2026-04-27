/**
 * test-zod-codegen.test.ts — T4.2.1 codegen pipeline tests.
 *
 * Pin three behaviors of `scripts/generate-zod-schemas.mjs`:
 *   1. Every committed `src/schemas/generated/*.ts` matches what the
 *      generator would produce from the canonical
 *      `.jumpstart/schemas/*.schema.json` (the same gate
 *      `verify-baseline.mjs` runs at CI time, mirrored here so a local
 *      `npm test` catches drift before PR).
 *   2. Each generated schema parses correctly via Zod (smoke test).
 *   3. The index.ts re-export covers every committed schema file.
 *
 * @see scripts/generate-zod-schemas.mjs
 * @see specs/decisions/adr-004-schema-direction.md
 * @see specs/implementation-plan.md T4.2.1
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_SRC_DIR = path.join(REPO_ROOT, '.jumpstart', 'schemas');
const SCHEMA_OUT_DIR = path.join(REPO_ROOT, 'src', 'schemas', 'generated');
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'generate-zod-schemas.mjs');

describe('zod-codegen pipeline', () => {
  it('every *.schema.json produces a matching .ts under src/schemas/generated/', () => {
    const sources = readdirSync(SCHEMA_SRC_DIR)
      .filter((f) => f.endsWith('.schema.json'))
      .map((f) => f.replace(/\.schema\.json$/, ''));
    expect(sources.length).toBeGreaterThan(0);
    for (const stem of sources) {
      const outPath = path.join(SCHEMA_OUT_DIR, `${stem}.ts`);
      expect(existsSync(outPath), `Missing generated file: ${outPath}`).toBe(true);
    }
  });

  it('committed output matches the generator (--check mode passes)', () => {
    // If this fails, the developer forgot to run the generator after
    // editing the canonical JSON Schema. The CI gate
    // `zod-codegen-fresh` in `verify-baseline.mjs` runs the same check.
    expect(() => {
      execFileSync('node', [GENERATOR, '--check'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }).not.toThrow();
  });

  it('index.ts re-exports every generated schema file', async () => {
    const indexPath = path.join(SCHEMA_OUT_DIR, 'index.ts');
    expect(existsSync(indexPath)).toBe(true);
    const stems = readdirSync(SCHEMA_OUT_DIR)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    const idx = await import(indexPath);
    // Every <Pascal>Schema export should be reachable via the index.
    for (const stem of stems) {
      const pascal = stem
        .split(/[-_]/)
        .map((p) => (p.length === 0 ? '' : p[0].toUpperCase() + p.slice(1)))
        .join('');
      expect(idx[`${pascal}Schema`]).toBeDefined();
    }
  });

  it('generated SpecMetadataSchema parses a valid frontmatter block', async () => {
    const { SpecMetadataSchema } = await import('../src/schemas/generated/spec-metadata.js');
    const result = SpecMetadataSchema.safeParse({
      id: 'product-brief',
      phase: 1,
      agent: 'Analyst',
      status: 'Approved',
      created: '2026-04-27',
    });
    expect(result.success).toBe(true);
  });

  it('generated SpecMetadataSchema rejects an invalid agent enum', async () => {
    const { SpecMetadataSchema } = await import('../src/schemas/generated/spec-metadata.js');
    const result = SpecMetadataSchema.safeParse({
      id: 'product-brief',
      phase: 1,
      agent: 'NotAnAgent',
      status: 'Approved',
      created: '2026-04-27',
    });
    expect(result.success).toBe(false);
  });
});
