/**
 * analyzer.ts — consistency analyzer port (T4.2.4).
 *
 * Pure-library port of `bin/lib/analyzer.js`. Public surface preserved
 * verbatim by name + signature:
 *
 *   - `analyze(input)` => AnalysisResult
 *   - `extractTerms(content)` => Map<string, string>
 *   - `extractStoryIds(content)` => string[]
 *   - `extractTaskIds(content)` => string[]
 *   - `extractNfrIds(content)` => string[]
 *
 * Six consistency checks (run in order, parity with legacy):
 *   1. Story coverage: PRD stories must appear in plan
 *   2. Story coverage: PRD stories should appear in architecture
 *   3. Task coverage: plan tasks should reference stories
 *   4. NFR coverage: PRD NFRs should appear in architecture
 *   5. Terminology drift: near-match terms across PRD/Arch/brief
 *   6. Contract / data-model alignment: entity names cross-referenced
 *
 * Score formula: ((totalChecks - issues) / totalChecks) * 100,
 * where totalChecks = max(1, missingCoverage + contradictions +
 *                            terminologyDrift + artifactCount).
 * pass = score >= 70.
 *
 * The CLI entry point at the bottom of the legacy file is INTENTIONALLY
 * NOT ported here. IPC subprocess dispatch is centralized through
 * `bin/lib-ts/ipc.ts`'s `runIpc()` per ADR-007. Library callers use
 * `analyze()` directly; subprocess callers wire `runIpc(analyze, ...)`
 * at the trust boundary.
 *
 * @see bin/lib/analyzer.js (legacy reference)
 * @see specs/implementation-plan.md T4.2.4
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

// Public types

export interface AnalyzeInput {
  specs_dir?: string;
  root?: string;
}

export interface MissingCoverageEntry {
  source: string;
  id: string;
  missing_from: string;
  type:
    | 'story_not_in_plan'
    | 'story_not_in_architecture'
    | 'orphan_task'
    | 'nfr_not_in_architecture';
}

export interface ContradictionEntry {
  artifact_a: string;
  artifact_b: string;
  description: string;
  severity: 'minor' | 'major' | 'critical';
}

export interface TerminologyDriftEntry {
  term_a: string;
  source_a: string;
  term_b: string;
  source_b: string;
}

export interface AnalysisResult {
  artifacts_analyzed: number;
  contradictions: ContradictionEntry[];
  missing_coverage: MissingCoverageEntry[];
  terminology_drift: TerminologyDriftEntry[];
  score: number;
  pass: boolean;
}

// Implementation

/**
 * Extract defined terms from a markdown document. Looks for:
 *   - Bold terms: `**Term**` (Title-Case, 3-49 chars)
 *   - Heading terms: H1-H4, optional `Label:` prefix stripped
 *
 * Returns a Map of `lowercase-term -> original-term` so callers can
 * do case-insensitive lookups while preserving display casing.
 */
export function extractTerms(content: string): Map<string, string> {
  const terms = new Map<string, string>();

  for (const m of content.matchAll(/\*\*([A-Z][a-zA-Z\s]+)\*\*/g)) {
    const term = m[1].trim();
    if (term.length > 2 && term.length < 50) {
      terms.set(term.toLowerCase(), term);
    }
  }

  for (const m of content.matchAll(/^#{1,4}\s+(?:.*?:\s*)?(.+)$/gm)) {
    const term = m[1].trim();
    if (term.length > 2 && term.length < 60) {
      terms.set(term.toLowerCase(), term);
    }
  }

  return terms;
}

/** Extract story IDs (pattern E<num>-S<num>), deduped. */
export function extractStoryIds(content: string): string[] {
  const matches = content.match(/\bE\d+-S\d+\b/g) || [];
  return Array.from(new Set(matches));
}

/** Extract task IDs (pattern M<num>-T<num>), deduped. */
export function extractTaskIds(content: string): string[] {
  const matches = content.match(/\bM\d+-T\d+\b/g) || [];
  return Array.from(new Set(matches));
}

/** Extract NFR IDs (pattern NFR-<UPPER>-<num>), deduped. */
export function extractNfrIds(content: string): string[] {
  const matches = content.match(/\bNFR-[A-Z]+-\d+\b/g) || [];
  return Array.from(new Set(matches));
}

/** Read a file safely; returns empty string if missing/unreadable.
 *  Legacy semantics: analyzer NEVER throws on missing artifacts; the
 *  resulting empty string just means "this artifact contributes
 *  nothing to the analysis". */
function safeRead(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Run consistency analysis across spec artifacts. Defaults match the
 * legacy module: `specs_dir='specs/'`, `root='.'`.
 */
export function analyze(input: AnalyzeInput): AnalysisResult {
  const { specs_dir = 'specs/', root = '.' } = input;
  const specsPath = path.resolve(root, specs_dir);

  const artifacts = {
    prd: safeRead(path.join(specsPath, 'prd.md')),
    architecture: safeRead(path.join(specsPath, 'architecture.md')),
    plan: safeRead(path.join(specsPath, 'implementation-plan.md')),
    contracts: safeRead(path.join(specsPath, 'contracts.md')),
    dataModel: safeRead(path.join(specsPath, 'data-model.md')),
    brief: safeRead(path.join(specsPath, 'product-brief.md')),
    challenger: safeRead(path.join(specsPath, 'challenger-brief.md')),
  };

  const contradictions: ContradictionEntry[] = [];
  const missingCoverage: MissingCoverageEntry[] = [];
  const terminologyDrift: TerminologyDriftEntry[] = [];
  let artifactCount = 0;

  for (const content of Object.values(artifacts)) {
    if (content.trim()) artifactCount++;
  }

  // 1. Story coverage: PRD stories must appear in plan
  if (artifacts.prd && artifacts.plan) {
    const prdStories = extractStoryIds(artifacts.prd);
    const planStories = extractStoryIds(artifacts.plan);
    for (const story of prdStories) {
      if (!planStories.includes(story)) {
        missingCoverage.push({
          source: 'prd.md',
          id: story,
          missing_from: 'implementation-plan.md',
          type: 'story_not_in_plan',
        });
      }
    }
  }

  // 2. Story coverage: PRD stories should appear in architecture
  if (artifacts.prd && artifacts.architecture) {
    const prdStories = extractStoryIds(artifacts.prd);
    const archStories = extractStoryIds(artifacts.architecture);
    for (const story of prdStories) {
      if (!archStories.includes(story)) {
        missingCoverage.push({
          source: 'prd.md',
          id: story,
          missing_from: 'architecture.md',
          type: 'story_not_in_architecture',
        });
      }
    }
  }

  // 3. Task coverage: plan tasks should reference stories.
  //
  // Pit Crew M3 Reviewer M3: legacy used `String.prototype.includes`
  // which produces false-positives on substring collisions. A line
  // mentioning `E1-S10` would match story `E1-S1` because `'E1-S10'
  // .includes('E1-S1') === true`. Fixed by anchoring with word
  // boundaries via RegExp. The story IDs come from the PRD's own
  // extractor (already validated shape `E\d+-S\d+`), so RegExp
  // construction is safe — no caller-controlled metacharacters reach
  // the pattern.
  if (artifacts.plan && artifacts.prd) {
    const planTasks = extractTaskIds(artifacts.plan);
    const prdStories = extractStoryIds(artifacts.prd);
    for (const task of planTasks) {
      const taskRe = new RegExp(`\\b${task}\\b`);
      const taskLines = artifacts.plan.split('\n').filter((l) => taskRe.test(l));
      const hasStory = taskLines.some((l) =>
        prdStories.some((s) => new RegExp(`\\b${s}\\b`).test(l))
      );
      if (!hasStory) {
        missingCoverage.push({
          source: 'implementation-plan.md',
          id: task,
          missing_from: 'prd.md',
          type: 'orphan_task',
        });
      }
    }
  }

  // 4. NFR coverage: PRD NFRs should appear in architecture
  if (artifacts.prd && artifacts.architecture) {
    const prdNfrs = extractNfrIds(artifacts.prd);
    const archNfrs = extractNfrIds(artifacts.architecture);
    for (const nfr of prdNfrs) {
      if (!archNfrs.includes(nfr)) {
        missingCoverage.push({
          source: 'prd.md',
          id: nfr,
          missing_from: 'architecture.md',
          type: 'nfr_not_in_architecture',
        });
      }
    }
  }

  // 5. Terminology drift across artifacts
  const termSources: Record<string, string> = {
    'prd.md': artifacts.prd,
    'architecture.md': artifacts.architecture,
    'product-brief.md': artifacts.brief,
  };

  const allTermsBySource: Record<string, Map<string, string>> = {};
  for (const [name, content] of Object.entries(termSources)) {
    if (content) {
      allTermsBySource[name] = extractTerms(content);
    }
  }

  const sourceNames = Object.keys(allTermsBySource);
  if (sourceNames.length >= 2) {
    for (let i = 0; i < sourceNames.length; i++) {
      const srcA = sourceNames[i];
      const termsA = allTermsBySource[srcA];
      for (const [keyA, termA] of termsA) {
        for (let j = i + 1; j < sourceNames.length; j++) {
          const srcB = sourceNames[j];
          const termsB = allTermsBySource[srcB];
          for (const [keyB, termB] of termsB) {
            if (
              keyA !== keyB &&
              keyA.length > 4 &&
              keyB.length > 4 &&
              (keyA.includes(keyB) || keyB.includes(keyA)) &&
              Math.abs(keyA.length - keyB.length) <= 5
            ) {
              terminologyDrift.push({
                term_a: termA,
                source_a: srcA,
                term_b: termB,
                source_b: srcB,
              });
            }
          }
        }
      }
    }
  }

  // 6. Contract / data-model alignment
  if (artifacts.contracts && artifacts.dataModel) {
    const entities: string[] = [];
    for (const m of artifacts.dataModel.matchAll(/###\s+Entity:\s+(\w+)/g)) {
      entities.push(m[1]);
    }
    for (const entity of entities) {
      if (!artifacts.contracts.toLowerCase().includes(entity.toLowerCase())) {
        contradictions.push({
          artifact_a: 'data-model.md',
          artifact_b: 'contracts.md',
          description: `Entity "${entity}" defined in data model but not referenced in contracts`,
          severity: 'major',
        });
      }
    }
  }

  // Score
  const totalChecks = Math.max(
    1,
    missingCoverage.length + contradictions.length + terminologyDrift.length + artifactCount
  );
  const issues = missingCoverage.length + contradictions.length + terminologyDrift.length;
  const score = Math.max(0, Math.round(((totalChecks - issues) / totalChecks) * 100));

  return {
    artifacts_analyzed: artifactCount,
    contradictions,
    missing_coverage: missingCoverage,
    terminology_drift: terminologyDrift,
    score,
    pass: score >= 70,
  };
}
