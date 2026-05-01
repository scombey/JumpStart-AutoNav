/**
 * test-public-surface.test.ts — cross-module drift harness gate.
 *
 * Two assertions:
 *   1. Run the harness against the current `src/lib/` tree — must
 *      report ZERO drift incidents.
 *   2. Run the harness against the synthetic drift fixture — must
 *      report EXACTLY 8 `missing_method` incidents, each with a
 *      `file:line` reference.
 *
 * If either fails, the harness has either silently broken or
 * accidentally surfaced a real drift on main.
 *
 * @see scripts/extract-public-surface.mjs
 * @see tests/fixtures/contract-drift/simulation-tracer-vs-holodeck/README.md
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const harness = path.join(repoRoot, 'scripts/extract-public-surface.mjs');

interface DriftReport {
  timestamp: string;
  scanned: {
    tsFiles: number;
    jsFiles: number;
    callSites: number;
    parseErrors?: number;
    truncatedFiles?: number;
  };
  incidents: Array<
    | {
        type: 'missing_method';
        callSite: { file: string; line: number; snippet: string };
        expected: { class: string; declaredIn: string };
        actual: { calledMethod: string; varName: string };
      }
    | {
        type: 'parse_error';
        callSite: { file: string; line: number; snippet: string };
        actual: { error: string };
      }
    | {
        type: 'file_truncated';
        callSite: { file: string; line: number; snippet: string };
        actual: { callSites: number; cap: number };
      }
  >;
}

function runHarness(
  rootArg: string | null,
  expectFailure = false
): { report: DriftReport | null; status: number } {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'drift-test-'));
  const outPath = path.join(tmpDir, 'drift.json');
  const args = [harness, `--out=${outPath}`];
  if (rootArg) args.push(`--root=${rootArg}`);

  let status = 0;
  let report: DriftReport | null = null;
  try {
    execFileSync('node', args, { cwd: repoRoot, stdio: 'pipe' });
  } catch (err) {
    status = (err as { status?: number }).status ?? 1;
    if (!expectFailure) {
      rmSync(tmpDir, { recursive: true, force: true });
      throw err;
    }
  }
  try {
    report = JSON.parse(readFileSync(outPath, 'utf8')) as DriftReport;
  } catch {
    // Harness exited before writing — that's fine when expectFailure=true.
  }
  rmSync(tmpDir, { recursive: true, force: true });
  return { report, status };
}

describe('public-surface contract harness (T3.1 + T3.3 acceptance)', () => {
  beforeAll(() => {
    if (!existsSync(harness)) {
      throw new Error(`harness script missing at ${harness}; T3.1 implementation incomplete.`);
    }
  });

  it('reports zero drift on current main', () => {
    // Default scan roots: src/lib (set by the script itself).
    const { report, status } = runHarness(null);
    expect(status).toBe(0);
    if (!report) throw new Error('harness produced no report');

    // The harness must have scanned SOMETHING. Pinning total > 0 is
    // the actual invariant — any hard-coded floor would rot as the
    // surface evolves.
    expect(report.scanned.tsFiles + report.scanned.jsFiles).toBeGreaterThan(0);
    expect(report.scanned.callSites).toBeGreaterThan(0);

    // The killer assertion: ZERO missing-method incidents on current
    // main. parse_error / file_truncated incidents are operational
    // signals, not method-drift drift, so we only block on the former.
    const driftIncidents = report.incidents.filter((i) => i.type === 'missing_method');
    if (driftIncidents.length > 0) {
      const summary = driftIncidents
        .slice(0, 5)
        .map((i) => {
          const { file, line } = i.callSite;
          if (i.type !== 'missing_method') return '';
          return `  ${file}:${line}  ${i.actual.varName}.${i.actual.calledMethod}() not declared on ${i.expected.class} (${i.expected.declaredIn})`;
        })
        .join('\n');
      throw new Error(
        `Drift detected on current main (${driftIncidents.length} incidents). First 5:\n${summary}`
      );
    }
    expect(driftIncidents).toHaveLength(0);
  });

  it('reports EXACTLY 8 incidents on the simulation-tracer-vs-holodeck fixture (T3.3 acceptance #2)', () => {
    const fixtureRoot = 'tests/fixtures/contract-drift/simulation-tracer-vs-holodeck';
    const { report, status } = runHarness(fixtureRoot);
    expect(status).toBe(0);
    if (!report) throw new Error('fixture run produced no report');

    expect(report.scanned.jsFiles).toBe(2);
    const driftIncidents = report.incidents.filter((i) => i.type === 'missing_method');
    expect(driftIncidents).toHaveLength(8);

    // Every incident must point to the holodeck.js call site (the bug
    // location), NOT the tracer.js declaration site.
    for (const incident of driftIncidents) {
      if (incident.type !== 'missing_method') continue;
      expect(incident.callSite.file).toContain('holodeck.js');
      expect(incident.expected.class).toBe('Tracer');
      expect(incident.actual.varName).toBe('tracer');
      expect(incident.callSite.line).toBeGreaterThan(0);
      expect(incident.callSite.snippet).toMatch(/tracer\.\w+\(/);
    }

    // Set equality (not array equality) — the harness's traversal order
    // is deterministic today but the assertion shouldn't depend on
    // readdirSync ordering once the fixture grows beyond a single file
    // (Pit Crew QA 9).
    const missingMethods = new Set(
      driftIncidents.flatMap((i) => (i.type === 'missing_method' ? [i.actual.calledMethod] : []))
    );
    expect(missingMethods).toEqual(
      new Set([
        'logError',
        'logWarning',
        'logSubagentVerified',
        'logDocumentCreation',
        'logCostTracking',
        'logHandoffValidation',
        'printSummary',
        'saveReport',
      ])
    );
  });

  it('reports zero drift on the reassignment-no-drift fixture (Pit Crew QA 4 / Rev M1 regression canary)', () => {
    // `let x = new A(); x.aMethod(); x = new B(); x.bMethod()` — both
    // calls hit declared methods; harness must NOT false-positive.
    const fixtureRoot = 'tests/fixtures/contract-drift/reassignment-no-drift';
    const { report } = runHarness(fixtureRoot);
    if (!report) throw new Error('reassignment fixture produced no report');
    const driftIncidents = report.incidents.filter((i) => i.type === 'missing_method');
    expect(driftIncidents).toHaveLength(0);
  });

  it('reports zero incidents on an explicit empty --root (false-green guard inverse)', () => {
    // Point the harness at an explicit empty --root. With `--root`
    // provided we DO get the empty-scan-zero-incidents outcome; the
    // default-roots false-green guard only fires when no `--root` is
    // passed (covered by the main smoke harness above, which would
    // have crashed every prior test if `src/lib/` were missing).
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'drift-empty-'));
    const { report, status } = runHarness(tmpDir);
    rmSync(tmpDir, { recursive: true, force: true });
    expect(status).toBe(0);
    expect(report?.scanned.tsFiles).toBe(0);
    expect(report?.scanned.jsFiles).toBe(0);
  });
});
