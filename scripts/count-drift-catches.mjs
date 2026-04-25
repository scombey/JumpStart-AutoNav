#!/usr/bin/env node
/**
 * count-drift-catches.mjs — T3.7 metrics rollup.
 *
 * Aggregates one or more contract-harness reports (produced by
 * `scripts/extract-public-surface.mjs`) into a regression-share summary
 * suitable for weekly trend reporting.
 *
 * Usage:
 *   node scripts/count-drift-catches.mjs [<input-dir-or-file> ...]
 *
 * Default input: `.jumpstart/metrics/drift-catches.json` (current run).
 * If invoked with multiple inputs (e.g. CI artifact rollup), it merges
 * incidents across runs and computes per-week aggregates from the
 * embedded `timestamp` field.
 *
 * Output: `.jumpstart/metrics/regression-share.json`. Schema:
 *   {
 *     "generatedAt": ISO8601,
 *     "windowStart": ISO8601,           // earliest timestamp seen
 *     "windowEnd": ISO8601,             // latest timestamp seen
 *     "totalRuns": N,
 *     "totalIncidents": N,
 *     "runsWithIncidents": N,
 *     "incidentsByType": { "missing_method": N, ... },
 *     "topClasses": [{ "class": "Foo", "count": N }, ...]   // most-drifted classes
 *   }
 *
 * Dormant pattern: with no inputs and no drift-catches.json on disk, the
 * script emits an empty rollup and exits 0. Once the harness has run at
 * least once, the rollup populates.
 *
 * @see scripts/extract-public-surface.mjs (input producer)
 * @see specs/architecture.md §Drift-catches log + Regression-share metric
 * @see specs/implementation-plan.md T3.7
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const DEFAULT_INPUT = '.jumpstart/metrics/drift-catches.json';
const OUTPUT_PATH = '.jumpstart/metrics/regression-share.json';

const inputs = process.argv.slice(2);
const sources = inputs.length === 0 ? [DEFAULT_INPUT] : inputs;

const reports = [];
let skippedSources = 0;
let malformedSources = 0;

for (const src of sources) {
  if (!existsSync(src)) {
    console.warn(`[count-drift-catches] skipping missing input: ${src}`);
    skippedSources++;
    continue;
  }
  const stat = statSync(src);
  const tryParse = (filePath) => {
    try {
      return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.warn(`[count-drift-catches] skipping malformed JSON in ${filePath}: ${err.message}`);
      malformedSources++;
      return null;
    }
  };
  if (stat.isDirectory()) {
    for (const f of readdirSync(src)) {
      if (!f.endsWith('.json')) continue;
      const r = tryParse(path.join(src, f));
      if (r) reports.push(r);
    }
  } else {
    const r = tryParse(src);
    if (r) reports.push(r);
  }
}

let windowStart = null;
let windowEnd = null;
let totalIncidents = 0;
let runsWithIncidents = 0;

// Use prototype-less objects so an attacker-supplied incident with
// `type: "toString"` or `class: "constructor"` can't poison the
// accumulators (Pit Crew Adversary 2 confirmed exploit).
const incidentsByType = Object.create(null);
const classCounts = Object.create(null);

// Defensive list of strings that should never be treated as own-property
// keys even after the Object.create(null) guard, in case a future change
// switches back to `{}`.
const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

for (const r of reports) {
  const ts = typeof r.timestamp === 'string' ? r.timestamp : null;
  if (ts) {
    if (!windowStart || ts < windowStart) windowStart = ts;
    if (!windowEnd || ts > windowEnd) windowEnd = ts;
  }
  const incidents = Array.isArray(r.incidents) ? r.incidents : [];
  totalIncidents += incidents.length;
  if (incidents.length > 0) runsWithIncidents++;
  for (const i of incidents) {
    if (typeof i?.type !== 'string' || POISON_KEYS.has(i.type)) continue;
    incidentsByType[i.type] = (incidentsByType[i.type] ?? 0) + 1;
    const cls = i.expected?.class;
    if (typeof cls === 'string' && !POISON_KEYS.has(cls)) {
      classCounts[cls] = (classCounts[cls] ?? 0) + 1;
    }
  }
}

const topClasses = Object.entries(classCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([cls, count]) => ({ class: cls, count }));

// Distinguish "no incidents this run" from "no inputs found" so the
// rollup doesn't lie when the upstream harness silently failed to
// produce a report (Pit Crew Reviewer H5).
const status = reports.length === 0 ? 'no-inputs' : malformedSources > 0 ? 'partial' : 'ok';

const rollup = {
  generatedAt: new Date().toISOString(),
  status,
  windowStart,
  windowEnd,
  totalRuns: reports.length,
  totalIncidents,
  runsWithIncidents,
  regressionShare: reports.length === 0 ? 0 : runsWithIncidents / reports.length,
  // Spread Object.create(null) maps into plain objects for JSON
  // serialization. The keys are now safe (POISON_KEYS filter above).
  incidentsByType: { ...incidentsByType },
  topClasses,
  diagnostics: {
    sourcesGiven: sources.length,
    sourcesSkipped: skippedSources,
    sourcesMalformed: malformedSources,
  },
};

mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(rollup, null, 2));

console.log(
  `[count-drift-catches] status=${rollup.status} runs=${rollup.totalRuns} incidents=${rollup.totalIncidents} regression-share=${(rollup.regressionShare * 100).toFixed(1)}% (skipped=${skippedSources} malformed=${malformedSources}) wrote=${OUTPUT_PATH}`
);

// Exit non-zero when explicit inputs were given and ALL of them failed
// — the caller asked for an aggregate and got nothing usable. Keep
// exit 0 for the bare-default "no harness output yet" case (dormant).
if (inputs.length > 0 && reports.length === 0) {
  console.error('[count-drift-catches] FAIL: every requested input was missing or malformed.');
  process.exit(1);
}
