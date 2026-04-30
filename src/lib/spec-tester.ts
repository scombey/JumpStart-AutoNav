/**
 * spec-tester.ts -- Layer 3: "Unit Tests for English" (Item 61).
 *
 * Scans specification artifacts for ambiguity, passive voice, metric
 * coverage gaps, and terminology drift -- the prose equivalent of unit tests.
 *
 * M3 hardening: no JSON state -- pure text processing.
 * ADR-009: specsDir/filePath must be pre-validated by caller.
 * ADR-006: no process.exit.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Ambiguity Detection ──────────────────────────────────────────────────────

export const VAGUE_ADJECTIVES: string[] = [
  'scalable', 'fast', 'easy', 'robust', 'flexible', 'efficient',
  'user-friendly', 'seamless', 'intuitive', 'modern', 'simple',
  'lightweight', 'powerful', 'reliable', 'secure', 'performant',
  'responsive', 'clean', 'elegant', 'smart', 'quick', 'high-quality',
  'enterprise-grade', 'production-ready', 'best-in-class', 'world-class',
  'cutting-edge', 'next-generation', 'state-of-the-art'
];

export const METRIC_PATTERNS: RegExp[] = [
  /\d+\s*(?:ms|seconds?|minutes?|hours?|days?)/i,
  /\d+\s*%/,
  /\d+\s*(?:req|requests?|rps|qps)\s*(?:\/|per)\s*(?:s|sec|second|minute)/i,
  /\d+\s*(?:MB|GB|TB|KB|bytes?)/i,
  /\d+\s*(?:users?|connections?|concurrent)/i,
  /\d+\s*(?:nines?|9s)/i,
  /(?:99|99\.9|99\.99)\s*%\s*(?:uptime|availability|SLA)/i,
  /(?:within|under|below|less than|at most|at least|no more than)\s+\d+/i
];

export const PASSIVE_PATTERNS: RegExp[] = [
  /\b(?:is|are|was|were|be|been|being)\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bwill be\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bshould be\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bmust be\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bcan be\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bneeds to be\s+\w+ed\b/gi,
  /\bhas to be\s+\w+ed\b/gi
];

export interface AmbiguityIssue {
  word: string;
  line: number;
  context: string;
}

export interface PassiveIssue {
  pattern: string;
  line: number;
  context: string;
}

export interface GWTIssue {
  line: number;
  context: string;
}

export interface GuessingIssue {
  word: string;
  line: number;
  context: string;
}

export interface AmbiguityResult {
  issues: AmbiguityIssue[];
  count: number;
}

export interface PassiveResult {
  issues: PassiveIssue[];
  count: number;
}

export interface MetricCoverageResult {
  total_requirements: number;
  with_metrics: number;
  coverage_pct: number;
  gaps: string[];
}

export interface TerminologyDriftResult {
  drifts: Array<{ term: string; variants: string[]; files: string[] }>;
  count: number;
}

export interface GWTResult {
  issues: GWTIssue[];
  gwt_count: number;
  non_gwt_count: number;
}

export interface GuessingResult {
  issues: GuessingIssue[];
  count: number;
}

export interface AllChecksResult {
  pass: boolean;
  score: number;
  ambiguity: AmbiguityResult;
  passive_voice: PassiveResult;
  metric_coverage: MetricCoverageResult;
  terminology_drift: TerminologyDriftResult;
  gwt_format: GWTResult;
  guessing_language: GuessingResult;
}

// ─── checkAmbiguity ───────────────────────────────────────────────────────────

export function checkAmbiguity(content: string): AmbiguityResult {
  const lines = content.split('\n');
  const issues: AmbiguityIssue[] = [];
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    if (i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (line.trim() === '---') inFrontmatter = false; continue; }

    if (line.startsWith('#')) continue;

    for (const adj of VAGUE_ADJECTIVES) {
      const regex = new RegExp(`\\b${adj}\\b`, 'gi');
      if (regex.test(line)) {
        const nextLine = lines[i + 1] ?? '';
        const context = line + nextLine;
        const hasMetric = METRIC_PATTERNS.some(p => p.test(context));
        const hasTag = /\[MEASURABLE\]|\[NEEDS CLARIFICATION\]|\[METRIC\]/i.test(context);

        if (!hasMetric && !hasTag) {
          issues.push({ word: adj, line: i + 1, context: line.trim().substring(0, 120) });
        }
      }
    }
  }

  return { issues, count: issues.length };
}

// ─── checkPassiveVoice ────────────────────────────────────────────────────────

export function checkPassiveVoice(content: string): PassiveResult {
  const lines = content.split('\n');
  const issues: PassiveIssue[] = [];
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    if (i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (line.trim() === '---') inFrontmatter = false; continue; }

    if (line.startsWith('#')) continue;

    for (const pattern of PASSIVE_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        issues.push({
          pattern: match[0],
          line: i + 1,
          context: line.trim().substring(0, 120)
        });
      }
    }
  }

  return { issues, count: issues.length };
}

// ─── checkMetricCoverage ──────────────────────────────────────────────────────

export function checkMetricCoverage(content: string): MetricCoverageResult {
  const storyMatches = content.match(/####\s+E\d+-S\d+/g) ?? [];
  const frMatches = content.match(/###?\s+FR-\d+/g) ?? [];
  const totalRequirements = storyMatches.length + frMatches.length;

  if (totalRequirements === 0) {
    return { total_requirements: 0, with_metrics: 0, coverage_pct: 100, gaps: [] };
  }

  const gaps: string[] = [];
  let withMetrics = 0;

  const sections = content.split(/(?=####?\s+(?:E\d+-S\d+|FR-\d+))/);
  for (const section of sections) {
    const idMatch = section.match(/####?\s+(E\d+-S\d+|FR-\d+)/);
    if (!idMatch) continue;

    const hasQuantified = METRIC_PATTERNS.some(p => p.test(section));
    const hasMeasurableTag = /\[MEASURABLE\]/i.test(section);

    if (hasQuantified || hasMeasurableTag) {
      withMetrics++;
    } else {
      gaps.push(idMatch[1] ?? '');
    }
  }

  const coveragePct = totalRequirements > 0
    ? Math.round((withMetrics / totalRequirements) * 100)
    : 100;

  return { total_requirements: totalRequirements, with_metrics: withMetrics, coverage_pct: coveragePct, gaps };
}

// ─── checkTerminologyDrift ────────────────────────────────────────────────────

export function checkTerminologyDrift(specsDir: string): TerminologyDriftResult {
  if (!fs.existsSync(specsDir)) {
    return { drifts: [], count: 0 };
  }

  const files = fs.readdirSync(specsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      content: fs.readFileSync(path.join(specsDir, f), 'utf8').toLowerCase()
    }));

  const driftGroups = [
    ['user', 'customer', 'client', 'end-user', 'end user', 'consumer'],
    ['admin', 'administrator', 'system admin', 'sys admin', 'superuser', 'super user'],
    ['api', 'endpoint', 'route', 'service'],
    ['database', 'datastore', 'data store', 'db', 'data layer'],
    ['login', 'sign in', 'sign-in', 'signin', 'authentication', 'log in'],
    ['signup', 'sign up', 'sign-up', 'register', 'registration', 'create account']
  ];

  const drifts: Array<{ term: string; variants: string[]; files: string[] }> = [];

  for (const group of driftGroups) {
    const usedVariants = new Map<string, string[]>();

    for (const file of files) {
      for (const term of group) {
        const escaped = term.replace(/[-\s]/g, '[-\\s]?');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        if (regex.test(file.content)) {
          if (!usedVariants.has(term)) {
            usedVariants.set(term, []);
          }
          const arr = usedVariants.get(term);
          if (arr) arr.push(file.name);
        }
      }
    }

    if (usedVariants.size > 1) {
      const allFiles: string[] = [];
      usedVariants.forEach(fileList => { allFiles.push(...fileList); });
      drifts.push({
        term: group[0] ?? '',
        variants: Array.from(usedVariants.keys()),
        files: Array.from(new Set(allFiles))
      });
    }
  }

  return { drifts, count: drifts.length };
}

// ─── checkGWTFormat ───────────────────────────────────────────────────────────

export function checkGWTFormat(content: string): GWTResult {
  const lines = content.split('\n');
  const issues: GWTIssue[] = [];
  let inAcceptanceCriteria = false;
  let inCodeBlock = false;
  let gwtCount = 0;
  let nonGwtCount = 0;

  const GWT_PATTERN = /^\s*[-*]?\s*\*?\*?\s*(Given|When|Then|And|But)\b/i;
  const AC_HEADING = /^#+\s*Acceptance\s+Criteria/i;
  const ANY_HEADING = /^#+\s/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    if (AC_HEADING.test(line)) { inAcceptanceCriteria = true; continue; }
    if (inAcceptanceCriteria && ANY_HEADING.test(line) && !AC_HEADING.test(line)) {
      inAcceptanceCriteria = false;
      continue;
    }

    if (inAcceptanceCriteria && line.trim().length > 0) {
      if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        if (GWT_PATTERN.test(line)) {
          gwtCount++;
        } else {
          nonGwtCount++;
          issues.push({ line: i + 1, context: line.trim().substring(0, 120) });
        }
      }
    }
  }

  return { issues, gwt_count: gwtCount, non_gwt_count: nonGwtCount };
}

// ─── checkGuessingLanguage ────────────────────────────────────────────────────

export const GUESSING_WORDS: string[] = [
  'probably', 'maybe', 'perhaps', 'presumably', 'I think',
  'I believe', 'I assume', 'might work', 'should work',
  'not sure', 'unclear', 'TBD', 'TODO', 'FIXME',
  'we could try', 'possibly', 'it seems', 'apparently',
  'I guess', 'more or less', 'sort of', 'kind of',
  'roughly', 'ballpark', 'approximately'
];

export function checkGuessingLanguage(content: string): GuessingResult {
  const lines = content.split('\n');
  const issues: GuessingIssue[] = [];
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;
    if (i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (line.trim() === '---') inFrontmatter = false; continue; }
    if (line.startsWith('#')) continue;

    for (const word of GUESSING_WORDS) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      if (regex.test(line)) {
        if (/\[NEEDS CLARIFICATION[:\]]/i.test(line)) continue;
        issues.push({ word, line: i + 1, context: line.trim().substring(0, 120) });
      }
    }
  }

  return { issues, count: issues.length };
}

// ─── runAllChecks ─────────────────────────────────────────────────────────────

export interface RunAllChecksOptions {
  specsDir?: string | undefined;
  strict?: boolean | undefined;
}

export function runAllChecks(content: string, options: RunAllChecksOptions = {}): AllChecksResult {
  const ambiguity = checkAmbiguity(content);
  const passiveVoice = checkPassiveVoice(content);
  const metricCoverage = checkMetricCoverage(content);
  const terminologyDrift = options.specsDir
    ? checkTerminologyDrift(options.specsDir)
    : { drifts: [], count: 0 };
  const gwtFormat = checkGWTFormat(content);
  const guessingLanguage = checkGuessingLanguage(content);

  let score = 100;
  score -= Math.min(ambiguity.count * 5, 30);
  score -= Math.min(passiveVoice.count * 3, 20);
  score -= Math.max(0, 100 - metricCoverage.coverage_pct) * 0.3;
  score -= Math.min(terminologyDrift.count * 10, 20);
  score -= Math.min(guessingLanguage.count * 5, 15);
  score = Math.max(0, Math.round(score));

  const pass = options.strict ? score === 100 : score >= 70;

  return {
    pass,
    score,
    ambiguity,
    passive_voice: passiveVoice,
    metric_coverage: metricCoverage,
    terminology_drift: terminologyDrift,
    gwt_format: gwtFormat,
    guessing_language: guessingLanguage
  };
}

// ─── generateReport ───────────────────────────────────────────────────────────

export function generateReport(filePath: string, options: RunAllChecksOptions = {}): string {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = runAllChecks(content, options);

  let report = `# Spec Quality Report: ${path.basename(filePath)}\n\n`;
  report += `**Overall Score:** ${result.score}/100 ${result.pass ? 'PASS' : 'FAIL'}\n\n`;

  report += `## Ambiguity Check (${result.ambiguity.count} issues)\n\n`;
  if (result.ambiguity.count > 0) {
    report += '| Line | Word | Context |\n|------|------|---------|\n';
    for (const issue of result.ambiguity.issues.slice(0, 20)) {
      report += `| ${issue.line} | ${issue.word} | ${issue.context.substring(0, 80)} |\n`;
    }
  } else {
    report += 'No ambiguous language detected.\n';
  }

  report += `\n## Passive Voice (${result.passive_voice.count} issues)\n\n`;
  if (result.passive_voice.count > 0) {
    report += '| Line | Pattern | Context |\n|------|------|---------|\n';
    for (const issue of result.passive_voice.issues.slice(0, 20)) {
      report += `| ${issue.line} | ${issue.pattern} | ${issue.context.substring(0, 80)} |\n`;
    }
  } else {
    report += 'No passive voice detected.\n';
  }

  report += `\n## Metric Coverage: ${result.metric_coverage.coverage_pct}%\n\n`;
  if (result.metric_coverage.gaps.length > 0) {
    report += `Requirements without metrics: ${result.metric_coverage.gaps.join(', ')}\n`;
  }

  report += `\n## Terminology Drift (${result.terminology_drift.count} drifts)\n\n`;
  if (result.terminology_drift.count > 0) {
    for (const drift of result.terminology_drift.drifts) {
      report += `- **${drift.term}**: used as "${drift.variants.join('", "')}" across ${drift.files.join(', ')}\n`;
    }
  } else {
    report += 'No terminology drift detected.\n';
  }

  report += `\n## GWT Format (${result.gwt_format.gwt_count} GWT, ${result.gwt_format.non_gwt_count} non-GWT)\n\n`;
  if (result.gwt_format.issues.length > 0) {
    report += '| Line | Criterion |\n|------|-----------|\n';
    for (const issue of result.gwt_format.issues.slice(0, 20)) {
      report += `| ${issue.line} | ${issue.context.substring(0, 80)} |\n`;
    }
  } else {
    report += 'All acceptance criteria use Given/When/Then format.\n';
  }

  report += `\n## Guessing Language (${result.guessing_language.count} issues)\n\n`;
  if (result.guessing_language.count > 0) {
    report += '| Line | Word | Context |\n|------|------|---------|\n';
    for (const issue of result.guessing_language.issues.slice(0, 20)) {
      report += `| ${issue.line} | ${issue.word} | ${issue.context.substring(0, 80)} |\n`;
    }
  } else {
    report += 'No guessing language detected.\n';
  }

  return report;
}
