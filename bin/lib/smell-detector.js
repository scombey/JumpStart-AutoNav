#!/usr/bin/env node

/**
 * smell-detector.js — Layer 3: Spec Smell Detection
 * 
 * Part of Jump Start Framework (Item 72: Spec Smell Detection).
 * 
 * Detects "spec smells" — patterns in requirement prose that indicate
 * vagueness, incompleteness, or non-testable requirements.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Smell pattern definitions. Each has a type, regex, severity, and description.
 */
const SMELL_PATTERNS = {
  'vague-quantifier': {
    patterns: [
      /\b(?:several|many|few|some|various|numerous|a lot of|lots of|plenty of|a number of)\b/gi
    ],
    severity: 'major',
    description: 'Vague quantifier — use specific numbers or ranges'
  },
  'undefined-acronym': {
    patterns: [
      // Uppercase acronyms 2-6 chars not preceded by definition
      /(?<!\()\b[A-Z]{2,6}\b(?!\))/g
    ],
    severity: 'minor',
    description: 'Potentially undefined acronym — define on first use',
    // Known well-defined acronyms to exclude
    exclude: ['API', 'REST', 'JSON', 'YAML', 'HTML', 'CSS', 'HTTP', 'HTTPS', 'URL', 'URI',
      'SQL', 'CLI', 'GUI', 'UI', 'UX', 'SSO', 'JWT', 'UUID', 'TLS', 'SSL', 'SSH',
      'DNS', 'TCP', 'UDP', 'CORS', 'CRUD', 'MVP', 'PRD', 'ADR', 'CI', 'CD', 'TDD',
      'QA', 'SLA', 'KPI', 'ORM', 'NFR', 'LTS', 'SDK', 'CDN', 'AWS', 'GCP', 'SPA',
      'IDE', 'RTL', 'PDF', 'CSV', 'XML', 'GDPR', 'RBAC', 'ABAC', 'MCP', 'LLM', 'TODO', 'TBD']
  },
  'missing-owner': {
    patterns: [
      /\b(?:someone|somebody|they|it)\s+(?:should|must|will|needs? to|has to)\b/gi,
      /\b(?:this|that|these|those)\s+(?:should|must|will|needs? to)\b/gi
    ],
    severity: 'major',
    description: 'Missing requirement owner — specify which component or actor is responsible'
  },
  'unbounded-list': {
    patterns: [
      /\b(?:etc\.?|and more|and so on|and others|among others|and similar|and the like)\b/gi,
      /\.\.\./g
    ],
    severity: 'minor',
    description: 'Unbounded list — enumerate all items explicitly'
  },
  'hedge-word': {
    patterns: [
      /\b(?:might|could|possibly|perhaps|maybe|potentially|roughly|approximately|arguably|likely|unlikely|probably|ideally)\b/gi
    ],
    severity: 'major',
    description: 'Hedge word — requirements must be definitive, not speculative'
  },
  'dangling-reference': {
    patterns: [
      /\b(?:as (?:mentioned|described|noted|defined|specified|discussed) (?:above|below|earlier|previously|elsewhere))\b/gi,
      /\bsee (?:above|below|later|elsewhere)\b/gi,
      /\b(?:the aforementioned|the above-mentioned)\b/gi
    ],
    severity: 'minor',
    description: 'Dangling reference — use explicit section/document references'
  },
  'wishful-thinking': {
    patterns: [
      /\b(?:would be nice|nice to have|in the future|at some point|down the road|eventually|someday)\b/gi
    ],
    severity: 'minor',
    description: 'Wishful thinking — either scope it with a milestone or remove it'
  }
};

/**
 * Detect spec smells in content.
 *
 * @param {string} content - Spec content to analyze.
 * @returns {{ smells: Array<{type: string, line: number, text: string, severity: string, description: string}>, count: number }}
 */
function detectSmells(content) {
  const lines = content.split('\n');
  const smells = [];
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Track frontmatter
    if (i === 0 && line === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false;
      continue;
    }

    // Skip headings and table headers
    if (line.startsWith('#') || line.match(/^\|[-\s|]+\|$/)) continue;

    for (const [type, config] of Object.entries(SMELL_PATTERNS)) {
      for (const pattern of config.patterns) {
        // Reset regex
        pattern.lastIndex = 0;
        let match;

        while ((match = pattern.exec(line)) !== null) {
          const matchText = match[0];

          // Check exclusions for undefined-acronym
          if (type === 'undefined-acronym' && config.exclude) {
            if (config.exclude.includes(matchText)) continue;
          }

          smells.push({
            type,
            line: i + 1,
            text: matchText,
            severity: config.severity,
            description: config.description
          });
        }
      }
    }
  }

  return { smells, count: smells.length };
}

/**
 * Calculate smell density — smells per 100 lines of content
 * (excluding code blocks, frontmatter, and blank lines).
 *
 * @param {string} content - Spec content.
 * @returns {{ density: number, prose_lines: number, smell_count: number }}
 */
function scoreSmellDensity(content) {
  const lines = content.split('\n');
  let proseLines = 0;
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;
    if (i === 0 && line === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (line === '---') inFrontmatter = false; continue; }
    if (line && !line.startsWith('#') && !line.match(/^\|[-\s|]+\|$/)) {
      proseLines++;
    }
  }

  const { count } = detectSmells(content);
  const density = proseLines > 0 ? Math.round((count / proseLines) * 100 * 100) / 100 : 0;

  return { density, prose_lines: proseLines, smell_count: count };
}

/**
 * Scan a directory for spec smells across all markdown files.
 *
 * @param {string} dir - Directory to scan.
 * @param {object} [options] - Options.
 * @param {number} [options.threshold] - Max smell density (default: 5).
 * @returns {{ files: Array<{file: string, smells: number, density: number}>, total_smells: number, pass: boolean }}
 */
function scanDirectory(dir, options = {}) {
  const threshold = options.threshold || 5;

  if (!fs.existsSync(dir)) {
    return { files: [], total_smells: 0, pass: true };
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const density = scoreSmellDensity(content);
      return {
        file: f,
        smells: density.smell_count,
        density: density.density
      };
    });

  const totalSmells = files.reduce((sum, f) => sum + f.smells, 0);
  const pass = files.every(f => f.density <= threshold);

  return { files, total_smells: totalSmells, pass };
}

/**
 * Generate a markdown smell report for a file.
 *
 * @param {string} filePath - Path to the spec file.
 * @returns {string} Markdown report.
 */
function generateSmellReport(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = detectSmells(content);
  const density = scoreSmellDensity(content);

  let report = `# Spec Smell Report: ${path.basename(filePath)}\n\n`;
  report += `**Smells Found:** ${result.count}\n`;
  report += `**Smell Density:** ${density.density} per 100 lines\n`;
  report += `**Prose Lines:** ${density.prose_lines}\n\n`;

  if (result.count === 0) {
    report += 'No spec smells detected. ✅\n';
    return report;
  }

  // Group by type
  const grouped = {};
  for (const smell of result.smells) {
    if (!grouped[smell.type]) grouped[smell.type] = [];
    grouped[smell.type].push(smell);
  }

  for (const [type, smells] of Object.entries(grouped)) {
    const config = SMELL_PATTERNS[type];
    report += `## ${type} (${smells.length}) — ${config.severity}\n\n`;
    report += `*${config.description}*\n\n`;
    report += '| Line | Text |\n|------|------|\n';
    for (const smell of smells.slice(0, 15)) {
      report += `| ${smell.line} | \`${smell.text}\` |\n`;
    }
    if (smells.length > 15) {
      report += `| ... | +${smells.length - 15} more |\n`;
    }
    report += '\n';
  }

  return report;
}

module.exports = {
  SMELL_PATTERNS,
  detectSmells,
  scoreSmellDensity,
  scanDirectory,
  generateSmellReport
};
