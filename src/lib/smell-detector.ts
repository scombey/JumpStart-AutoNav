/**
 * smell-detector.ts — spec-smell detector port (T4.2.4).
 *
 * Public surface
 * preserved verbatim by name + signature:
 *
 *   - `SMELL_PATTERNS` (constant)
 *   - `detectSmells(content)` => SmellDetectionResult
 *   - `scoreSmellDensity(content)` => SmellDensityResult
 *   - `scanDirectory(dir, options?)` => DirectoryScanResult
 *   - `generateSmellReport(filePath)` => string (markdown)
 *
 * Invariants:
 *   - Code blocks (fences) and YAML frontmatter are skipped.
 *   - Headings (`#...`) and table separator rows are skipped.
 *   - `undefined-acronym` matches uppercase 2-6 char tokens not
 *     wrapped in parentheses, with the legacy exclusion allowlist.
 *   - Density formula: round(count / proseLines * 100 * 100) / 100
 *     (smells per 100 lines, two decimal places).
 *   - Default threshold for `scanDirectory`: 5.
 *
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

// Public types

export type SmellSeverity = 'minor' | 'major' | 'critical';

export interface SmellPatternConfig {
  patterns: RegExp[];
  severity: SmellSeverity;
  description: string;
  exclude?: string[] | undefined;
}

export interface SmellEntry {
  type: string;
  line: number;
  text: string;
  severity: SmellSeverity;
  description: string;
}

export interface SmellDetectionResult {
  smells: SmellEntry[];
  count: number;
}

export interface SmellDensityResult {
  density: number;
  prose_lines: number;
  smell_count: number;
}

export interface FileScanEntry {
  file: string;
  smells: number;
  density: number;
}

export interface DirectoryScanResult {
  files: FileScanEntry[];
  total_smells: number;
  pass: boolean;
}

export interface ScanDirectoryOptions {
  threshold?: number | undefined;
}

// Smell patterns (preserved verbatim from legacy)

export const SMELL_PATTERNS: Record<string, SmellPatternConfig> = {
  'vague-quantifier': {
    patterns: [
      /\b(?:several|many|few|some|various|numerous|a lot of|lots of|plenty of|a number of)\b/gi,
    ],
    severity: 'major',
    description: 'Vague quantifier — use specific numbers or ranges',
  },
  'undefined-acronym': {
    patterns: [/(?<!\()\b[A-Z]{2,6}\b(?!\))/g],
    severity: 'minor',
    description: 'Potentially undefined acronym — define on first use',
    exclude: [
      'API',
      'REST',
      'JSON',
      'YAML',
      'HTML',
      'CSS',
      'HTTP',
      'HTTPS',
      'URL',
      'URI',
      'SQL',
      'CLI',
      'GUI',
      'UI',
      'UX',
      'SSO',
      'JWT',
      'UUID',
      'TLS',
      'SSL',
      'SSH',
      'DNS',
      'TCP',
      'UDP',
      'CORS',
      'CRUD',
      'MVP',
      'PRD',
      'ADR',
      'CI',
      'CD',
      'TDD',
      'QA',
      'SLA',
      'KPI',
      'ORM',
      'NFR',
      'LTS',
      'SDK',
      'CDN',
      'AWS',
      'GCP',
      'SPA',
      'IDE',
      'RTL',
      'PDF',
      'CSV',
      'XML',
      'GDPR',
      'RBAC',
      'ABAC',
      'MCP',
      'LLM',
      'TODO',
      'TBD',
    ],
  },
  'missing-owner': {
    patterns: [
      /\b(?:someone|somebody|they|it)\s+(?:should|must|will|needs? to|has to)\b/gi,
      /\b(?:this|that|these|those)\s+(?:should|must|will|needs? to)\b/gi,
    ],
    severity: 'major',
    description: 'Missing requirement owner — specify which component or actor is responsible',
  },
  'unbounded-list': {
    patterns: [
      /\b(?:etc\.?|and more|and so on|and others|among others|and similar|and the like)\b/gi,
      /\.\.\./g,
    ],
    severity: 'minor',
    description: 'Unbounded list — enumerate all items explicitly',
  },
  'hedge-word': {
    patterns: [
      /\b(?:might|could|possibly|perhaps|maybe|potentially|roughly|approximately|arguably|likely|unlikely|probably|ideally)\b/gi,
    ],
    severity: 'major',
    description: 'Hedge word — requirements must be definitive, not speculative',
  },
  'dangling-reference': {
    patterns: [
      /\b(?:as (?:mentioned|described|noted|defined|specified|discussed) (?:above|below|earlier|previously|elsewhere))\b/gi,
      /\bsee (?:above|below|later|elsewhere)\b/gi,
      /\b(?:the aforementioned|the above-mentioned)\b/gi,
    ],
    severity: 'minor',
    description: 'Dangling reference — use explicit section/document references',
  },
  'wishful-thinking': {
    patterns: [
      /\b(?:would be nice|nice to have|in the future|at some point|down the road|eventually|someday)\b/gi,
    ],
    severity: 'minor',
    description: 'Wishful thinking — either scope it with a milestone or remove it',
  },
};

// Implementation

/**
 * Detect spec smells in `content`. Skips code-fence blocks, YAML
 * frontmatter, headings, and table separator rows. Returns one
 * `SmellEntry` per match (overlapping matches across patterns are
 * preserved — legacy behavior).
 */
export function detectSmells(content: string): SmellDetectionResult {
  const lines = content.split('\n');
  const smells: SmellEntry[] = [];
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    if (i === 0 && line === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false;
      continue;
    }

    if (line.startsWith('#') || line.match(/^\|[-\s|]+\|$/)) continue;

    for (const [type, config] of Object.entries(SMELL_PATTERNS)) {
      if (config === undefined) continue;
      for (const pattern of config.patterns) {
        // matchAll is stateless across invocations (unlike legacy's
        // stateful regex iteration which had to reset lastIndex
        // between lines).
        const matches = line.matchAll(pattern);
        for (const m of matches) {
          const matchText = m[0];

          if (type === 'undefined-acronym' && config.exclude) {
            if (config.exclude.includes(matchText)) continue;
          }

          smells.push({
            type,
            line: i + 1,
            text: matchText,
            severity: config.severity,
            description: config.description,
          });
        }
      }
    }
  }

  return { smells, count: smells.length };
}

/**
 * Calculate smell density: smells per 100 lines of prose content
 * (excluding code blocks, frontmatter, headings, blank lines, and
 * table separator rows).
 */
export function scoreSmellDensity(content: string): SmellDensityResult {
  const lines = content.split('\n');
  let proseLines = 0;
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (i === 0 && line === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false;
      continue;
    }
    if (line && !line.startsWith('#') && !line.match(/^\|[-\s|]+\|$/)) {
      proseLines++;
    }
  }

  const { count } = detectSmells(content);
  const density = proseLines > 0 ? Math.round((count / proseLines) * 100 * 100) / 100 : 0;

  return { density, prose_lines: proseLines, smell_count: count };
}

/**
 * Scan a directory for spec smells across all markdown files at the
 * top level (non-recursive — matches legacy). Default density
 * threshold: 5 smells per 100 prose lines.
 */
export function scanDirectory(
  dir: string,
  options: ScanDirectoryOptions = {}
): DirectoryScanResult {
  const threshold = options.threshold || 5;

  if (!existsSync(dir)) {
    return { files: [], total_smells: 0, pass: true };
  }

  const files: FileScanEntry[] = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const content = readFileSync(path.join(dir, f), 'utf8');
      const density = scoreSmellDensity(content);
      return {
        file: f,
        smells: density.smell_count,
        density: density.density,
      };
    });

  const totalSmells = files.reduce((sum, f) => sum + f.smells, 0);
  const pass = files.every((f) => f.density <= threshold);

  return { files, total_smells: totalSmells, pass };
}

/**
 * Generate a markdown smell report for a single file. Groups smells
 * by type, shows up to 15 instances per type with a `+N more` tail.
 */
export function generateSmellReport(filePath: string): string {
  const content = readFileSync(filePath, 'utf8');
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

  const grouped: Record<string, SmellEntry[]> = {};
  for (const smell of result.smells) {
    const bucket = grouped[smell.type] ?? [];
    bucket.push(smell);
    grouped[smell.type] = bucket;
  }

  for (const [type, smells] of Object.entries(grouped)) {
    const config = SMELL_PATTERNS[type];
    if (config === undefined) continue;
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
