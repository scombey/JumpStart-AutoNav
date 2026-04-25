/**
 * test-path-safety.test.ts — T3.9 Tier 1 acceptance gate (NOT dormant).
 *
 * Replays every fixture in `tests/fixtures/security/path-traversal/`
 * through both layers of the path-safety primitives:
 *   - `assertInsideRoot(input, boundaryRoot, opts?)` (layer 2)
 *   - `safePathSchema(boundaryRoot).parse(input)` (layer 1)
 *
 * Both must throw `ValidationError`. Per implementation-plan T3.9 the
 * Tier 1 unit tests run from M1 onward and are NOT dormant; the Tier 2
 * subprocess replay tests against `dist/lib/path-safety.js` activate
 * once `bin/lib-ts/ipc.ts` lands at port time.
 *
 * Beyond the fixture replay, this file also asserts the negative-space
 * cases (paths that should be allowed) so a future change that
 * accidentally over-rejects gets caught.
 *
 * @see bin/lib-ts/path-safety.ts
 * @see tests/fixtures/security/path-traversal/README.md
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 * @see specs/implementation-plan.md T3.9, Checkpoint C3
 */

import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ValidationError } from '../bin/lib-ts/errors.js';
import { assertInsideRoot, safePathSchema } from '../bin/lib-ts/path-safety.js';

interface PathTraversalFixture {
  name: string;
  description: string;
  boundaryRoot: string;
  input: string;
  options?: { followSymlinks?: boolean };
  expected: {
    outcome: 'reject' | 'allow';
    errorClass?: string;
    exitCode?: number;
    messageContains?: string;
  };
}

const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/security/path-traversal');

function loadFixtures(): PathTraversalFixture[] {
  return readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map(
      (f) => JSON.parse(readFileSync(path.join(fixturesDir, f), 'utf8')) as PathTraversalFixture
    );
}

describe('path-safety primitives — T3.9 fixture replay', () => {
  let tmpRoot: string;
  let symlinkOutsideTarget: string;

  beforeAll(() => {
    // Symlink fixture (06) requires a real symlink whose target resolves
    // outside a real boundary directory. We create a fresh tmp boundary
    // and link `<tmp>/outside-link` → some path one level above it.
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'pathsafety-'));
    symlinkOutsideTarget = path.resolve(path.dirname(tmpRoot), 'outside-target');
    writeFileSync(symlinkOutsideTarget, 'sentinel');
    symlinkSync(symlinkOutsideTarget, path.join(tmpRoot, 'outside-link'));
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    rmSync(symlinkOutsideTarget, { force: true });
  });

  it('discovers at least 6 fixtures (per ADR-009 minimum)', () => {
    const fixtures = loadFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
  });

  it.each(loadFixtures())('rejects fixture: $name', (fixture: PathTraversalFixture) => {
    // Resolve runtime placeholders in the boundaryRoot.
    const boundaryRoot = fixture.boundaryRoot === '<runtime-tmp>' ? tmpRoot : fixture.boundaryRoot;

    // Layer 2 — direct helper call.
    let helperError: unknown;
    try {
      assertInsideRoot(fixture.input, boundaryRoot, fixture.options ?? {});
    } catch (err) {
      helperError = err;
    }

    expect(helperError).toBeInstanceOf(ValidationError);
    const v = helperError as ValidationError;
    expect(v.exitCode).toBe(2);
    if (fixture.expected.messageContains) {
      expect(v.message).toContain(fixture.expected.messageContains);
    }

    // Layer 1 — Zod schema parse. We skip this for the symlink fixture
    // because `safePathSchema` is a lexical-only check (Zod refinements
    // don't follow symlinks); the symlink case is solely a layer-2
    // concern.
    if (fixture.name === 'symlink-outside-boundary') return;

    const schema = safePathSchema(boundaryRoot);
    const result = schema.safeParse(fixture.input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      if (fixture.expected.messageContains) {
        expect(messages).toContain(fixture.expected.messageContains);
      }
    }
  });
});

describe('path-safety primitives — negative-space (paths that must be ALLOWED)', () => {
  const root = '/projects/myproject';
  const acceptable = [
    'README.md',
    'src/lib/io.ts',
    './src/lib/io.ts',
    'src/lib/../lib/io.ts', // resolves back inside
    '/projects/myproject/src/lib/io.ts', // absolute, but inside
    '/projects/myproject', // the root itself
  ];

  it.each(acceptable)('%s passes assertInsideRoot', (input) => {
    expect(() => assertInsideRoot(input, root)).not.toThrow();
  });

  it.each(acceptable)('%s passes safePathSchema', (input) => {
    const schema = safePathSchema(root);
    expect(schema.safeParse(input).success).toBe(true);
  });
});

describe('path-safety primitives — error-shape contract', () => {
  it('thrown errors carry exitCode 2 + schemaId for IPC envelope rendering', () => {
    let caught: unknown;
    try {
      assertInsideRoot('../etc/passwd', '/projects/myproject');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ValidationError);
    const v = caught as ValidationError;
    expect(v.exitCode).toBe(2);
    expect(v.schemaId).toBe('assertInsideRoot');
    expect(v.name).toBe('ValidationError');
    expect(Array.isArray(v.issues)).toBe(true);
  });

  it('schemaId override propagates to thrown ValidationError', () => {
    let caught: unknown;
    try {
      assertInsideRoot('../etc/passwd', '/projects/myproject', {
        schemaId: 'config-loader.input.root',
      });
    } catch (err) {
      caught = err;
    }
    expect((caught as ValidationError).schemaId).toBe('config-loader.input.root');
  });
});
