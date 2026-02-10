#!/usr/bin/env node

/**
 * spec-tester.js — Layer 3: "Unit Tests for English"
 * 
 * Part of Jump Start Framework (Item 61: Spec Quality Analysis).
 * 
 * Scans specification artifacts for ambiguity, passive voice,
 * metric coverage gaps, and terminology drift — the prose equivalent
 * of unit tests.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Ambiguity Detection ─────────────────────────────────────────────────────

/**
 * Vague adjectives that require measurable metrics to be meaningful.
 * Each must be followed by a quantified metric within the same sentence.
 */
const VAGUE_ADJECTIVES = [
  'scalable', 'fast', 'easy', 'robust', 'flexible', 'efficient',
  'user-friendly', 'seamless', 'intuitive', 'modern', 'simple',
  'lightweight', 'powerful', 'reliable', 'secure', 'performant',
  'responsive', 'clean', 'elegant', 'smart', 'quick', 'high-quality',
  'enterprise-grade', 'production-ready', 'best-in-class', 'world-class',
  'cutting-edge', 'next-generation', 'state-of-the-art'
];

/**
 * Patterns that indicate a quantified metric follows the adjective.
 */
const METRIC_PATTERNS = [
  /\d+\s*(?:ms|seconds?|minutes?|hours?|days?)/i,
  /\d+\s*%/,
  /\d+\s*(?:req|requests?|rps|qps)\s*(?:\/|per)\s*(?:s|sec|second|minute)/i,
  /\d+\s*(?:MB|GB|TB|KB|bytes?)/i,
  /\d+\s*(?:users?|connections?|concurrent)/i,
  /\d+\s*(?:nines?|9s)/i,
  /(?:99|99\.9|99\.99)\s*%\s*(?:uptime|availability|SLA)/i,
  /(?:within|under|below|less than|at most|at least|no more than)\s+\d+/i
];

/**
 * Check content for ambiguous language — vague adjectives without
 * accompanying measurable metrics.
 *
 * @param {string} content - Spec content to analyze.
 * @returns {{ issues: Array<{word: string, line: number, context: string}>, count: number }}
 */
function checkAmbiguity(content) {
  const lines = content.split('\n');
  const issues = [];
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Track code blocks
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Track frontmatter
    if (i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (line.trim() === '---') inFrontmatter = false; continue; }

    // Skip headings
    if (line.startsWith('#')) continue;

    for (const adj of VAGUE_ADJECTIVES) {
      const regex = new RegExp(`\\b${adj}\\b`, 'gi');
      if (regex.test(line)) {
        // Check if a metric follows in same line or next line
        const context = line + (lines[i + 1] || '');
        const hasMetric = METRIC_PATTERNS.some(p => p.test(context));
        
        // Also check for [MEASURABLE] or [NEEDS CLARIFICATION] tags
        const hasTag = /\[MEASURABLE\]|\[NEEDS CLARIFICATION\]|\[METRIC\]/i.test(context);

        if (!hasMetric && !hasTag) {
          issues.push({
            word: adj,
            line: i + 1,
            context: line.trim().substring(0, 120)
          });
        }
      }
    }
  }

  return { issues, count: issues.length };
}

// ─── Passive Voice Detection ─────────────────────────────────────────────────

/**
 * Passive voice patterns that indicate unclear ownership in requirements.
 */
const PASSIVE_PATTERNS = [
  /\b(?:is|are|was|were|be|been|being)\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bwill be\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bshould be\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bmust be\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bcan be\s+(?:\w+ed|done|handled|managed|processed|created|updated|deleted|performed|executed|configured|implemented|deployed)\b/gi,
  /\bneeds to be\s+\w+ed\b/gi,
  /\bhas to be\s+\w+ed\b/gi
];

/**
 * Check content for passive voice constructions.
 * Requirements should have clear actors ("The API server validates..." not "Inputs are validated...").
 *
 * @param {string} content - Spec content to analyze.
 * @returns {{ issues: Array<{pattern: string, line: number, context: string}>, count: number }}
 */
function checkPassiveVoice(content) {
  const lines = content.split('\n');
  const issues = [];
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Track code blocks
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Track frontmatter
    if (i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (line.trim() === '---') inFrontmatter = false; continue; }

    // Skip headings
    if (line.startsWith('#')) continue;

    for (const pattern of PASSIVE_PATTERNS) {
      // Reset regex lastIndex
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

// ─── Metric Coverage ─────────────────────────────────────────────────────────

/**
 * Check that functional requirements have measurable success criteria.
 * Counts [MEASURABLE] tags and compares against requirement count.
 *
 * @param {string} content - Spec content to analyze.
 * @returns {{ total_requirements: number, with_metrics: number, coverage_pct: number, gaps: string[] }}
 */
function checkMetricCoverage(content) {
  // Count functional requirements (user stories, FRs)
  const storyMatches = content.match(/####\s+E\d+-S\d+/g) || [];
  const frMatches = content.match(/###?\s+FR-\d+/g) || [];
  const totalRequirements = storyMatches.length + frMatches.length;

  if (totalRequirements === 0) {
    return { total_requirements: 0, with_metrics: 0, coverage_pct: 100, gaps: [] };
  }

  // Count requirements with quantified acceptance criteria
  const gaps = [];
  let withMetrics = 0;

  // Check each story/FR section for measurable criteria
  const sections = content.split(/(?=####?\s+(?:E\d+-S\d+|FR-\d+))/);
  for (const section of sections) {
    const idMatch = section.match(/####?\s+(E\d+-S\d+|FR-\d+)/);
    if (!idMatch) continue;

    const hasQuantified = METRIC_PATTERNS.some(p => p.test(section));
    const hasMeasurableTag = /\[MEASURABLE\]/i.test(section);

    if (hasQuantified || hasMeasurableTag) {
      withMetrics++;
    } else {
      gaps.push(idMatch[1]);
    }
  }

  const coveragePct = totalRequirements > 0 ? Math.round((withMetrics / totalRequirements) * 100) : 100;

  return {
    total_requirements: totalRequirements,
    with_metrics: withMetrics,
    coverage_pct: coveragePct,
    gaps
  };
}

// ─── Terminology Drift ───────────────────────────────────────────────────────

/**
 * Check for terminology drift across multiple spec files.
 * Builds a term dictionary from the first occurrence and flags
 * when later files use different names for the same entity.
 *
 * @param {string} specsDir - Path to the specs directory.
 * @returns {{ drifts: Array<{term: string, variants: string[], files: string[]}>, count: number }}
 */
function checkTerminologyDrift(specsDir) {
  if (!fs.existsSync(specsDir)) {
    return { drifts: [], count: 0 };
  }

  const files = fs.readdirSync(specsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      content: fs.readFileSync(path.join(specsDir, f), 'utf8').toLowerCase()
    }));

  // Common drift pairs to check
  const driftGroups = [
    ['user', 'customer', 'client', 'end-user', 'end user', 'consumer'],
    ['admin', 'administrator', 'system admin', 'sys admin', 'superuser', 'super user'],
    ['api', 'endpoint', 'route', 'service'],
    ['database', 'datastore', 'data store', 'db', 'data layer'],
    ['login', 'sign in', 'sign-in', 'signin', 'authentication', 'log in'],
    ['signup', 'sign up', 'sign-up', 'register', 'registration', 'create account']
  ];

  const drifts = [];

  for (const group of driftGroups) {
    const usedVariants = new Map(); // variant -> files using it
    
    for (const file of files) {
      for (const term of group) {
        const regex = new RegExp(`\\b${term.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'gi');
        if (regex.test(file.content)) {
          if (!usedVariants.has(term)) {
            usedVariants.set(term, []);
          }
          usedVariants.get(term).push(file.name);
        }
      }
    }

    if (usedVariants.size > 1) {
      drifts.push({
        term: group[0],
        variants: [...usedVariants.keys()],
        files: [...new Set([...usedVariants.values()].flat())]
      });
    }
  }

  return { drifts, count: drifts.length };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run all spec quality checks on content.
 *
 * @param {string} content - Spec content to analyze.
 * @param {object} [options] - Configuration options.
 * @param {string} [options.specsDir] - Path for terminology drift check.
 * @param {boolean} [options.strict] - If true, any issue is a failure.
 * @returns {{ pass: boolean, score: number, ambiguity, passive_voice, metric_coverage, terminology_drift }}
 */
function runAllChecks(content, options = {}) {
  const ambiguity = checkAmbiguity(content);
  const passiveVoice = checkPassiveVoice(content);
  const metricCoverage = checkMetricCoverage(content);
  const terminologyDrift = options.specsDir
    ? checkTerminologyDrift(options.specsDir)
    : { drifts: [], count: 0 };
  const gwtFormat = checkGWTFormat(content);
  const guessingLanguage = checkGuessingLanguage(content);

  // Compute overall score (0-100)
  // Deduct points for issues
  let score = 100;
  score -= Math.min(ambiguity.count * 5, 30);        // -5 per ambiguity, max 30
  score -= Math.min(passiveVoice.count * 3, 20);      // -3 per passive, max 20
  score -= Math.max(0, 100 - metricCoverage.coverage_pct) * 0.3; // scale metric gap
  score -= Math.min(terminologyDrift.count * 10, 20);  // -10 per drift, max 20
  score -= Math.min(guessingLanguage.count * 5, 15);   // -5 per guess, max 15
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

/**
 * Generate a markdown report from spec quality checks.
 *
 * @param {string} filePath - Path to the spec file.
 * @param {object} [options] - Options passed to runAllChecks.
 * @returns {string} Markdown report.
 */
function generateReport(filePath, options = {}) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = runAllChecks(content, options);

  let report = `# Spec Quality Report: ${path.basename(filePath)}\n\n`;
  report += `**Overall Score:** ${result.score}/100 ${result.pass ? '✅ PASS' : '❌ FAIL'}\n\n`;

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

module.exports = {
  VAGUE_ADJECTIVES,
  METRIC_PATTERNS,
  PASSIVE_PATTERNS,
  checkAmbiguity,
  checkPassiveVoice,
  checkMetricCoverage,
  checkTerminologyDrift,
  checkGWTFormat,
  checkGuessingLanguage,
  runAllChecks,
  generateReport
};

// ─── GWT / Gherkin Validation (Item 62) ──────────────────────────────────────

/**
 * Validate acceptance criteria use Given/When/Then format.
 * Scans for acceptance criteria sections and checks each criterion.
 *
 * @param {string} content - Spec content to analyze.
 * @returns {{ issues: Array<{line: number, context: string}>, gwt_count: number, non_gwt_count: number }}
 */
function checkGWTFormat(content) {
  const lines = content.split('\n');
  const issues = [];
  let inAcceptanceCriteria = false;
  let inCodeBlock = false;
  let gwtCount = 0;
  let nonGwtCount = 0;

  const GWT_PATTERN = /^\s*[-*]?\s*\*?\*?\s*(Given|When|Then|And|But)\b/i;
  const AC_HEADING = /^#+\s*Acceptance\s+Criteria/i;
  const ANY_HEADING = /^#+\s/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    if (AC_HEADING.test(line)) { inAcceptanceCriteria = true; continue; }
    if (inAcceptanceCriteria && ANY_HEADING.test(line) && !AC_HEADING.test(line)) {
      inAcceptanceCriteria = false;
      continue;
    }

    if (inAcceptanceCriteria && line.trim().length > 0) {
      // Check if line is a list item (actual criterion)
      if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        if (GWT_PATTERN.test(line)) {
          gwtCount++;
        } else {
          nonGwtCount++;
          issues.push({
            line: i + 1,
            context: line.trim().substring(0, 120)
          });
        }
      }
    }
  }

  return { issues, gwt_count: gwtCount, non_gwt_count: nonGwtCount };
}

// ─── Guessing Language Detection (Item 69) ───────────────────────────────────

/**
 * Detect hedging/guessing language that suggests uncertainty.
 * These words indicate the author is guessing rather than researching.
 *
 * @param {string} content - Spec content to analyze.
 * @returns {{ issues: Array<{word: string, line: number, context: string}>, count: number }}
 */
const GUESSING_WORDS = [
  'probably', 'maybe', 'perhaps', 'presumably', 'I think',
  'I believe', 'I assume', 'might work', 'should work',
  'not sure', 'unclear', 'TBD', 'TODO', 'FIXME',
  'we could try', 'possibly', 'it seems', 'apparently',
  'I guess', 'more or less', 'sort of', 'kind of',
  'roughly', 'ballpark', 'approximately'
];

function checkGuessingLanguage(content) {
  const lines = content.split('\n');
  const issues = [];
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;
    if (i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (line.trim() === '---') inFrontmatter = false; continue; }
    if (line.startsWith('#')) continue;

    for (const word of GUESSING_WORDS) {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (regex.test(line)) {
        // Skip if inside a [NEEDS CLARIFICATION] tag
        if (/\[NEEDS CLARIFICATION[:\]]/i.test(line)) continue;
        issues.push({
          word,
          line: i + 1,
          context: line.trim().substring(0, 120)
        });
      }
    }
  }

  return { issues, count: issues.length };
}
