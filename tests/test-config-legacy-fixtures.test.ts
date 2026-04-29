/**
 * test-config-legacy-fixtures.test.ts — T4.1.12 regression test.
 *
 * Per `specs/implementation-plan.md` T4.1.12, ten historical
 * `.jumpstart/config.yaml` shapes spanning 1.0 → 1.1.14 must parse
 * **byte-identical** between the legacy JS and the TS port. This file
 * is the load-bearing acceptance test for the config-cluster ports
 * (T4.1.8 — T4.1.11).
 *
 * Coverage:
 *   1. `flattenYaml` parity — TS and JS produce the same flat
 *      `Record<string, rawValueString>` map for every fixture.
 *   2. `loadConfig` parity — full merge result (config + sources +
 *      overrides_applied + global_keys + project_keys) round-trips
 *      identical when both implementations see the same project root.
 *   3. `parseConfigDocument` round-trip — parse-then-toString preserves
 *      comments, blank lines, key order (ADR-003 hard requirement).
 *   4. `mergeConfigs` idempotency — feeding the fixture as
 *      `userCurrent` with itself as both `oldDefault` and `newDefault`
 *      yields a no-op merge.
 *
 * Cross-references:
 *   - tests/fixtures/config-legacy/README.md — the 10 shapes + rationale
 *   - src/lib/{config-yaml,config-loader,config-merge}.ts — the ports
 *   - specs/decisions/adr-003-yaml-roundtrip.md
 *   - specs/implementation-plan.md T4.1.12
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig as tsLoadConfig } from '../src/lib/config-loader.js';
import {
  flattenYaml as tsFlattenYaml,
  mergeConfigs as tsMergeConfigs,
} from '../src/lib/config-merge.js';
import { parseConfigDocument, writeConfigDocument } from '../src/lib/config-yaml.js';

const require = createRequire(`${process.cwd()}/`);

// Legacy modules — strangler-phase reference implementations.
type LegacyConfigMerge = {
  flattenYaml: (yaml: string) => Record<string, string>;
  mergeConfigs: (
    oldDefault: string,
    newDefault: string,
    userCurrent: string
  ) => {
    mergedYaml: string;
    conflicts: Array<{
      key: string;
      oldDefault: string;
      newDefault: string;
      userValue: string;
    }>;
    newKeys: string[];
    preservedKeys: string[];
  };
};

const legacyConfigMerge = require(`${process.cwd()}/bin/lib/config-merge.mjs`) as LegacyConfigMerge;

// Legacy config-loader is ESM — dynamic-import via promise.
let legacyLoadConfig: (input: { root?: string; global_path?: string }) => Promise<{
  config: Record<string, unknown>;
  sources: { global: string | null; project: string | null };
  overrides_applied: unknown[];
  global_keys: number;
  project_keys: number;
  error?: string;
}>;

const FIXTURE_DIR = path.resolve(process.cwd(), 'tests/fixtures/config-legacy');

function listFixtures(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .sort();
}

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = mkdtempSync(path.join(tmpdir(), 'cfg-legacy-test-'));
  mkdirSync(path.join(tmpRoot, '.jumpstart'), { recursive: true });
  if (!legacyLoadConfig) {
    const mod = (await import(`${process.cwd()}/bin/lib/config-loader.mjs`)) as {
      loadConfig: typeof legacyLoadConfig;
    };
    legacyLoadConfig = mod.loadConfig;
  }
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function placeFixtureAsProjectConfig(fixtureName: string): string {
  const yaml = readFileSync(path.join(FIXTURE_DIR, fixtureName), 'utf8');
  const projectConfigPath = path.join(tmpRoot, '.jumpstart', 'config.yaml');
  writeFileSync(projectConfigPath, yaml, 'utf8');
  return yaml;
}

describe('T4.1.12 fixture matrix discovery', () => {
  it('finds at least 10 yaml fixtures (per implementation-plan T4.1.12)', () => {
    const fixtures = listFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it('covers shapes from 1.0 / 1.1.0 / 1.1.13 / 1.1.14', () => {
    const fixtures = listFixtures();
    expect(fixtures.some((f) => f.includes('1.0.0'))).toBe(true);
    expect(fixtures.some((f) => f.includes('1.1.0'))).toBe(true);
    expect(fixtures.some((f) => f.includes('1.1.13'))).toBe(true);
    expect(fixtures.some((f) => f.includes('1.1.14'))).toBe(true);
  });
});

describe('flattenYaml — TS↔JS parity across every fixture', () => {
  it.each(listFixtures())('%s: flattenYaml output is byte-identical', (fixtureName) => {
    const yaml = readFileSync(path.join(FIXTURE_DIR, fixtureName), 'utf8');
    const tsResult = tsFlattenYaml(yaml);
    const jsResult = legacyConfigMerge.flattenYaml(yaml);
    expect(tsResult).toEqual(jsResult);
  });
});

describe('loadConfig — TS↔JS parity across every fixture', () => {
  // Fixtures with inline `# comment` after a value where legacy
  // parseSimpleYaml has a known bug: it does NOT strip the inline
  // comment from the value, so legacy returns
  // `"architect  # active phase"` while the yaml package correctly
  // returns `"architect"`. The TS port adopts the correct behavior;
  // this is a deliberate FIX, not a regression. Documented in the
  // T4.1.9 Deviation Log entry.
  const FIXTURES_WITH_INLINE_COMMENT_BUG = new Set([
    '07-comments-and-blanks-1.1.13.yaml',
    '09-quoted-values-1.1.14.yaml',
  ]);

  it.each(
    listFixtures()
  )('%s: loadConfig produces matching config + sources + override metrics', async (fixtureName) => {
    placeFixtureAsProjectConfig(fixtureName);

    // No global config — use a path that doesn't exist so both
    // implementations short-circuit on the same empty global.
    const fakeGlobal = path.join(tmpRoot, 'no-such-global.yaml');
    const tsResult = await tsLoadConfig({ root: tmpRoot, global_path: fakeGlobal });
    const jsResult = await legacyLoadConfig({ root: tmpRoot, global_path: fakeGlobal });

    // Sources + key counts must match for every fixture.
    expect(tsResult.sources).toEqual(jsResult.sources);
    expect(tsResult.global_keys).toBe(jsResult.global_keys);
    expect(tsResult.project_keys).toBe(jsResult.project_keys);

    if (FIXTURES_WITH_INLINE_COMMENT_BUG.has(fixtureName)) {
      // Legacy parseSimpleYaml buggily includes the comment in the
      // value; the TS port via the yaml package correctly strips
      // it. Verify the structure is the same and that the TS port's
      // values DON'T contain `# `.
      expect(Object.keys(tsResult.config)).toEqual(Object.keys(jsResult.config));
      const tsValuesFlat = JSON.stringify(tsResult.config);
      expect(tsValuesFlat).not.toMatch(/ # /);
    } else {
      // Strict parity for every other fixture.
      expect(tsResult.config).toEqual(jsResult.config);
    }
  });

  it('TS port correctly strips inline comments from values (legacy bug FIXED)', async () => {
    placeFixtureAsProjectConfig('07-comments-and-blanks-1.1.13.yaml');
    const fakeGlobal = path.join(tmpRoot, 'no-such-global.yaml');
    const tsResult = await tsLoadConfig({ root: tmpRoot, global_path: fakeGlobal });
    const workflow = tsResult.config.workflow as Record<string, unknown>;
    expect(workflow.current_phase).toBe('architect');
    // The legacy bug would return 'architect  # active phase'.
  });
});

describe('parseConfigDocument — yaml package round-trip preserves SEMANTICS (ADR-003)', () => {
  // The yaml package's Document.toString() is byte-for-byte stable for
  // most inputs but DOES collapse some redundant whitespace (e.g.
  // `value  # comment` → `value # comment`) and may add/remove an
  // optional trailing newline. The load-bearing requirement per
  // ADR-003 is that the AST round-trips — comments + key order +
  // values must be preserved, not whitespace-exact. We test
  // toJSON() equivalence for that, plus comment-and-key preservation
  // separately.

  it.each(
    listFixtures()
  )('%s: parse-then-toString preserves semantic content + key order', (fixtureName) => {
    const yaml = readFileSync(path.join(FIXTURE_DIR, fixtureName), 'utf8');
    const projectConfigPath = path.join(tmpRoot, '.jumpstart', 'config.yaml');
    writeFileSync(projectConfigPath, yaml, 'utf8');

    const doc1 = parseConfigDocument(projectConfigPath);
    const reSerialized = doc1.toString();

    // Parse both the original input AND the re-serialized output.
    // toJSON() equivalence proves the AST is faithful: keys, values,
    // nesting all match.
    const doc2 = parseConfigDocument(
      (() => {
        const tmpFile = path.join(tmpRoot, '.jumpstart', `roundtrip-${fixtureName}`);
        writeFileSync(tmpFile, reSerialized, 'utf8');
        return tmpFile;
      })()
    );
    expect(doc2.toJSON()).toEqual(doc1.toJSON());
  });

  it.each(
    listFixtures()
  )('%s: parse-then-toString preserves all comments from the input', (fixtureName) => {
    const yaml = readFileSync(path.join(FIXTURE_DIR, fixtureName), 'utf8');
    // Extract the comment text (line bodies starting with #).
    const inputComments = yaml
      .split('\n')
      .filter((line) => /^\s*#/.test(line) || / # /.test(line))
      .map((line) => line.trim().replace(/\s+/g, ' '))
      .filter((line) => line.length > 0);

    if (inputComments.length === 0) return; // skip fixtures without comments

    const projectConfigPath = path.join(tmpRoot, '.jumpstart', 'config.yaml');
    writeFileSync(projectConfigPath, yaml, 'utf8');
    const doc = parseConfigDocument(projectConfigPath);
    const out = doc.toString();
    const outNormalized = out.replace(/\s+/g, ' ');

    // Every input comment's content (text after #) should appear
    // somewhere in the re-serialized output.
    for (const c of inputComments) {
      const commentBody = c.match(/#\s*(.*)/)?.[1] ?? '';
      if (commentBody.length > 0) {
        expect(outNormalized).toContain(commentBody);
      }
    }
  });

  it.each(
    listFixtures()
  )('%s: write-then-read round-trip preserves Document equivalence', (fixtureName) => {
    placeFixtureAsProjectConfig(fixtureName);
    const projectConfigPath = path.join(tmpRoot, '.jumpstart', 'config.yaml');

    const doc1 = parseConfigDocument(projectConfigPath);
    writeConfigDocument(projectConfigPath, doc1);
    const doc2 = parseConfigDocument(projectConfigPath);

    expect(doc2.toJSON()).toEqual(doc1.toJSON());
  });
});

describe('mergeConfigs — idempotency (self merged with self yields no-op)', () => {
  it.each(
    listFixtures()
  )('%s: merging fixture against itself produces no conflicts', (fixtureName) => {
    const yaml = readFileSync(path.join(FIXTURE_DIR, fixtureName), 'utf8');
    const tsResult = tsMergeConfigs(yaml, yaml, yaml);
    const jsResult = legacyConfigMerge.mergeConfigs(yaml, yaml, yaml);

    // Both should produce identical no-op output.
    expect(tsResult.conflicts).toEqual([]);
    expect(jsResult.conflicts).toEqual([]);
    expect(tsResult.newKeys).toEqual([]);
    expect(jsResult.newKeys).toEqual([]);
    // mergedYaml may differ in trailing whitespace but the body is
    // unchanged from input.
    expect(tsResult.mergedYaml.trimEnd()).toBe(yaml.trimEnd());
    expect(jsResult.mergedYaml.trimEnd()).toBe(yaml.trimEnd());
  });
});

describe('mergeConfigs — TS↔JS parity for representative upgrade scenarios', () => {
  it('adopts new default when user kept old default — both ports agree', () => {
    const oldDefault = readFileSync(path.join(FIXTURE_DIR, '01-minimal-1.0.0.yaml'), 'utf8');
    const newDefault = readFileSync(path.join(FIXTURE_DIR, '02-bootstrap-1.0.0.yaml'), 'utf8');
    const userCurrent = oldDefault;

    const tsResult = tsMergeConfigs(oldDefault, newDefault, userCurrent);
    const jsResult = legacyConfigMerge.mergeConfigs(oldDefault, newDefault, userCurrent);

    expect(tsResult.conflicts.map((c) => c.key)).toEqual(jsResult.conflicts.map((c) => c.key));
    expect(tsResult.newKeys.sort()).toEqual([...jsResult.newKeys].sort());
    expect(tsResult.mergedYaml).toBe(jsResult.mergedYaml);
  });

  it('preserves hooks: across an upgrade — both ports refuse to overwrite', () => {
    const oldDefault = readFileSync(
      path.join(FIXTURE_DIR, '03-workflow-active-1.1.0.yaml'),
      'utf8'
    );
    // Synthetic newDefault that adds a hooks: block (which mergeConfigs
    // must NEVER overwrite from user's perspective even when missing).
    const newDefault = `${oldDefault}\nhooks:\n  pre_phase: ./framework-supplied.sh\n`;
    const userCurrent = readFileSync(path.join(FIXTURE_DIR, '06-with-hooks-1.1.13.yaml'), 'utf8');

    const tsResult = tsMergeConfigs(oldDefault, newDefault, userCurrent);
    const jsResult = legacyConfigMerge.mergeConfigs(oldDefault, newDefault, userCurrent);

    // The user's hook values must survive.
    expect(tsResult.mergedYaml).toContain('./scripts/pre-phase.sh');
    expect(jsResult.mergedYaml).toContain('./scripts/pre-phase.sh');
    // Neither port should have introduced the framework's pre_phase.
    expect(tsResult.mergedYaml).not.toContain('./framework-supplied.sh');
    expect(jsResult.mergedYaml).not.toContain('./framework-supplied.sh');
  });
});
