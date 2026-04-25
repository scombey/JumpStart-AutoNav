/**
 * test-count-drift-catches.test.ts — smoke + math + hardening coverage
 * for `scripts/count-drift-catches.mjs` (T3.7 metrics rollup).
 *
 * Pit Crew QA 6 flagged this script ships untested into Monday's
 * metrics-cron. Coverage here:
 *   1. End-to-end smoke: feed a single drift-catches.json, get a
 *      regression-share.json with the expected math.
 *   2. Multi-input directory aggregation (the production-cron path).
 *   3. Malformed JSON tolerance: a corrupt file is skipped + logged,
 *      not a crash.
 *   4. Missing-input failure mode: explicit input that doesn't exist
 *      → status=no-inputs + exit 1.
 *   5. Prototype-pollution defense: `type: "toString"` and
 *      `class: "constructor"` don't poison the accumulators (Pit
 *      Crew Adversary 2 confirmed exploit; this test pins the fix).
 *
 * @see scripts/count-drift-catches.mjs
 * @see specs/implementation-plan.md T3.7
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'scripts/count-drift-catches.mjs');
const outputPath = path.join(repoRoot, '.jumpstart/metrics/regression-share.json');

interface Rollup {
  generatedAt: string;
  status: 'ok' | 'no-inputs' | 'partial';
  windowStart: string | null;
  windowEnd: string | null;
  totalRuns: number;
  totalIncidents: number;
  runsWithIncidents: number;
  regressionShare: number;
  incidentsByType: Record<string, number>;
  topClasses: Array<{ class: string; count: number }>;
  diagnostics: { sourcesGiven: number; sourcesSkipped: number; sourcesMalformed: number };
}

function runScript(args: string[], expectFailure = false): { rollup: Rollup; status: number } {
  let status = 0;
  try {
    execFileSync('node', [script, ...args], { cwd: repoRoot, stdio: 'pipe' });
  } catch (err) {
    status = (err as { status?: number }).status ?? 1;
    if (!expectFailure) throw err;
  }
  const rollup = JSON.parse(readFileSync(outputPath, 'utf8')) as Rollup;
  return { rollup, status };
}

let tmpDir: string;
let savedRollup: string | null = null;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'count-drift-test-'));
  // Preserve any existing rollup so the test doesn't clobber prod state.
  try {
    savedRollup = readFileSync(outputPath, 'utf8');
  } catch {
    savedRollup = null;
  }
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (savedRollup !== null) writeFileSync(outputPath, savedRollup);
});

function writeReport(name: string, body: object): string {
  const p = path.join(tmpDir, name);
  writeFileSync(p, JSON.stringify(body));
  return p;
}

describe('count-drift-catches.mjs — smoke + math', () => {
  it('aggregates a single clean run as 0% regression-share (status=ok)', () => {
    const input = writeReport('clean.json', {
      timestamp: '2026-04-24T12:00:00Z',
      scanned: { tsFiles: 1, jsFiles: 158, callSites: 4756 },
      incidents: [],
    });
    const { rollup, status } = runScript([input]);
    expect(status).toBe(0);
    expect(rollup.status).toBe('ok');
    expect(rollup.totalRuns).toBe(1);
    expect(rollup.totalIncidents).toBe(0);
    expect(rollup.runsWithIncidents).toBe(0);
    expect(rollup.regressionShare).toBe(0);
    expect(rollup.windowStart).toBe('2026-04-24T12:00:00Z');
    expect(rollup.windowEnd).toBe('2026-04-24T12:00:00Z');
  });

  it('computes regression-share as 50% for two runs where one has incidents', () => {
    writeReport('a-clean.json', {
      timestamp: '2026-04-21T12:00:00Z',
      incidents: [],
    });
    writeReport('b-dirty.json', {
      timestamp: '2026-04-22T12:00:00Z',
      incidents: [
        {
          type: 'missing_method',
          callSite: { file: 'foo.js', line: 1, snippet: 'x.bar()' },
          expected: { class: 'Foo', declaredIn: 'foo.js' },
          actual: { calledMethod: 'bar', varName: 'x' },
        },
      ],
    });
    const { rollup } = runScript([tmpDir]);
    expect(rollup.totalRuns).toBe(2);
    expect(rollup.totalIncidents).toBe(1);
    expect(rollup.runsWithIncidents).toBe(1);
    expect(rollup.regressionShare).toBe(0.5);
    expect(rollup.incidentsByType.missing_method).toBe(1);
    expect(rollup.topClasses).toEqual([{ class: 'Foo', count: 1 }]);
  });

  it('walks a directory of JSON files (the metrics-cron production path)', () => {
    for (let i = 0; i < 5; i++) {
      writeReport(`run-${i}.json`, {
        timestamp: `2026-04-${20 + i}T12:00:00Z`,
        incidents: [],
      });
    }
    const { rollup } = runScript([tmpDir]);
    expect(rollup.totalRuns).toBe(5);
    expect(rollup.windowStart).toBe('2026-04-20T12:00:00Z');
    expect(rollup.windowEnd).toBe('2026-04-24T12:00:00Z');
  });
});

describe('count-drift-catches.mjs — failure tolerance', () => {
  it('skips malformed JSON without crashing (status=partial when others succeed)', () => {
    writeReport('good.json', {
      timestamp: '2026-04-24T12:00:00Z',
      incidents: [],
    });
    const badPath = path.join(tmpDir, 'bad.json');
    writeFileSync(badPath, 'not valid json{');
    const { rollup, status } = runScript([tmpDir]);
    expect(status).toBe(0);
    expect(rollup.status).toBe('partial');
    expect(rollup.diagnostics.sourcesMalformed).toBe(1);
    expect(rollup.totalRuns).toBe(1); // the good one
  });

  it('exits non-zero with status=no-inputs when every explicit input is missing', () => {
    const { rollup, status } = runScript(['/this/does/not/exist.json'], true);
    expect(status).toBe(1);
    expect(rollup.status).toBe('no-inputs');
    expect(rollup.totalRuns).toBe(0);
  });
});

describe('count-drift-catches.mjs — prototype-pollution defense (Adversary 2)', () => {
  it('treats "toString" as a normal string key — accumulator value is a NUMBER, not a polluted concat', () => {
    // Pre-fix symptom: incidentsByType[type] = (incidentsByType[type] ?? 0) + 1
    // on a plain `{}` returned Object.prototype.toString (a function) for
    // `incidentsByType['toString']`, the `??` failed to short-circuit
    // (the function is truthy), and the `+ 1` produced a nonsense string
    // like '"function toString() { [native code] }1"'. Object.create(null)
    // removes the prototype chain entirely so the lookup returns
    // undefined, `??` short-circuits to 0, and we get the legitimate
    // count of 1.
    writeReport('attack.json', {
      timestamp: '2026-04-24T12:00:00Z',
      incidents: [
        { type: 'toString', expected: { class: 'Foo' }, actual: {} },
        { type: 'hasOwnProperty', expected: { class: 'Bar' }, actual: {} },
        { type: 'missing_method', expected: { class: 'RealClass' }, actual: {} },
      ],
    });
    const { rollup } = runScript([tmpDir]);

    // The value MUST be a number — never a polluted concat.
    for (const value of Object.values(rollup.incidentsByType)) {
      expect(typeof value).toBe('number');
    }
    // toString and hasOwnProperty are legitimately countable strings.
    expect(rollup.incidentsByType.toString).toBe(1);
    expect(rollup.incidentsByType.hasOwnProperty).toBe(1);
    expect(rollup.incidentsByType.missing_method).toBe(1);
  });

  it('rejects incidents with class="constructor" / "__proto__" / "prototype"', () => {
    writeReport('attack.json', {
      timestamp: '2026-04-24T12:00:00Z',
      incidents: [
        { type: 'missing_method', expected: { class: 'constructor' }, actual: {} },
        { type: 'missing_method', expected: { class: '__proto__' }, actual: {} },
        { type: 'missing_method', expected: { class: 'prototype' }, actual: {} },
        { type: 'missing_method', expected: { class: 'LegitClass' }, actual: {} },
      ],
    });
    const { rollup } = runScript([tmpDir]);
    const classes = rollup.topClasses.map((tc) => tc.class);
    expect(classes).not.toContain('constructor');
    expect(classes).not.toContain('__proto__');
    expect(classes).not.toContain('prototype');
    expect(classes).toContain('LegitClass');
  });
});
