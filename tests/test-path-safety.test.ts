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
 * once `src/lib/ipc.ts` lands at port time.
 *
 * Beyond the fixture replay, this file also asserts the negative-space
 * cases (paths that should be allowed) so a future change that
 * accidentally over-rejects gets caught.
 *
 * @see src/lib/path-safety.ts
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
import { ValidationError } from '../src/lib/errors.js';
import { assertInsideRoot, safePathSchema } from '../src/lib/path-safety.js';

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
    'a/b/../../c', // multi-level round-trip — Pit Crew QA 12
    'a/./b', // single-dot mid-segment
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

describe('path-safety primitives — non-string inputs throw ValidationError, not TypeError (QA 1)', () => {
  const root = '/projects/myproject';
  // Per ADR-006 every rejection path produces ValidationError + exitCode 2.
  // Without an explicit type guard, `input.includes(NULL_BYTE)` crashes
  // with a bare TypeError that the IPC envelope renders as exit 99.
  const nonStrings: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['number', 123],
    ['boolean', true],
    ['object', {}],
    ['array', []],
  ];

  it.each(nonStrings)('%s input throws ValidationError', (_label, input) => {
    let caught: unknown;
    try {
      assertInsideRoot(input as string, root);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).exitCode).toBe(2);
  });
});

describe('path-safety primitives — empty + degenerate inputs (QA 2 documented behavior)', () => {
  const root = '/projects/myproject';
  // The documented policy: empty string and `.` are ALLOWED — both
  // resolve to the boundary root itself, which is technically in-bounds.
  // Callers that want them rejected should chain `.min(1)` or a custom
  // refinement on top of `safePathSchema`.
  //
  // `~` is also allowed: the helper deliberately does NOT do shell-style
  // home-expansion (it's a path-arithmetic primitive, not an ambient
  // shell). `~` becomes a literal filename inside the boundary. Callers
  // that want home-expansion should pre-process via `os.homedir()`
  // before passing to safePathSchema.
  const allowedDegenerate = ['', '.', './', '~/etc/passwd'];
  const rejectedDegenerate = ['..', '/'];

  it.each(allowedDegenerate)('%j is allowed (resolves inside boundary lexically)', (input) => {
    expect(() => assertInsideRoot(input, root)).not.toThrow();
    expect(safePathSchema(root).safeParse(input).success).toBe(true);
  });

  it.each(rejectedDegenerate)('%j is rejected', (input) => {
    expect(() => assertInsideRoot(input, root)).toThrow(ValidationError);
    expect(safePathSchema(root).safeParse(input).success).toBe(false);
  });
});

describe('path-safety primitives — Layer 1 ↔ Layer 2 parity (QA 5)', () => {
  // The whole point of the two-layer design (per ADR-009) is that both
  // layers enforce the SAME policy. Without a parity test, a future
  // change to one layer in isolation can produce silent divergence.
  const root = '/projects/myproject';
  const cases = [
    '',
    '.',
    'README.md',
    '../etc/passwd',
    '/etc/passwd',
    './legitimate/../../etc/passwd',
    '/projects/myproject',
    'C:\\Windows\\system32',
    '..\\..\\etc\\passwd',
  ];

  it.each(cases)('%j: assertInsideRoot and safePathSchema agree', (input) => {
    const layer1Pass = safePathSchema(root).safeParse(input).success;
    let layer2Pass = true;
    try {
      assertInsideRoot(input, root);
    } catch {
      layer2Pass = false;
    }
    expect(layer1Pass).toBe(layer2Pass);
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
