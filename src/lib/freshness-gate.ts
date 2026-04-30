/**
 * freshness-gate.ts — Context7 Documentation Freshness Gate (Item 101).
 *
 * Enforces that agents use Context7 MCP for live documentation lookups
 * instead of relying on stale training data. Audits specs for proper
 * Context7 citation markers.
 *
 * M3 hardening: no JSON persist — pure text audit, no mutable state paths.
 * ADR-009: specsDir passed in by callers who must validate paths first.
 * ADR-006: no process.exit.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Context7 citation pattern: [Context7: library@version] or <!-- c7:library -->
 */
export const CITATION_PATTERNS: RegExp[] = [
  /\[Context7:\s*[^\]]+\]/gi,
  /<!--\s*c7:[^\s]+\s*-->/gi,
  /\bContext7\b/gi,
];

/**
 * Technology keywords that SHOULD trigger a Context7 lookup.
 */
export const TECH_KEYWORDS: string[] = [
  'react',
  'next.js',
  'nextjs',
  'vue',
  'angular',
  'svelte',
  'express',
  'fastify',
  'koa',
  'hono',
  'nest.js',
  'nestjs',
  'prisma',
  'drizzle',
  'typeorm',
  'sequelize',
  'mongoose',
  'tailwind',
  'bootstrap',
  'material-ui',
  'chakra',
  'jest',
  'vitest',
  'playwright',
  'cypress',
  'mocha',
  'webpack',
  'vite',
  'esbuild',
  'rollup',
  'turbopack',
  'docker',
  'kubernetes',
  'terraform',
  'pulumi',
  'aws',
  'azure',
  'gcp',
  'vercel',
  'netlify',
  'cloudflare',
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
  'sqlite',
  'graphql',
  'trpc',
  'grpc',
  'openapi',
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  'supabase',
  'firebase',
  'clerk',
  'auth0',
  'stripe',
  'twilio',
  'sendgrid',
  'langchain',
  'openai',
  'anthropic',
];

export interface DocumentAuditResult {
  techs: string[];
  citations: string[];
  uncited: string[];
  score: number;
}

export interface FileAuditEntry extends DocumentAuditResult {
  path: string;
}

export interface SpecsAuditResult {
  files: FileAuditEntry[];
  overallScore: number;
  warnings: string[];
}

/**
 * Scan a document for technology references that lack Context7 citations.
 */
export function auditDocument(content: string): DocumentAuditResult {
  const contentLower = content.toLowerCase();

  const techs = TECH_KEYWORDS.filter((kw) => contentLower.includes(kw.toLowerCase()));

  const citations: string[] = [];
  for (const pattern of CITATION_PATTERNS) {
    // Reset lastIndex since flags include 'g'
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) {
      citations.push(...matches);
    }
  }

  const citedTechsLower = citations.map((c) => c.toLowerCase());
  const uncited = techs.filter((tech) => {
    return !citedTechsLower.some((c) => c.includes(tech.toLowerCase()));
  });

  const score =
    techs.length === 0 ? 100 : Math.round(((techs.length - uncited.length) / techs.length) * 100);

  return { techs, citations, uncited, score };
}

/**
 * Run a freshness audit across all spec files.
 * specsDir should be pre-validated by the caller.
 */
export function auditSpecs(specsDir: string): SpecsAuditResult {
  const files: FileAuditEntry[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(specsDir)) {
    return { files, overallScore: 100, warnings: ['Specs directory not found.'] };
  }

  const specFiles = walkDir(specsDir).filter((f) => f.endsWith('.md'));

  for (const filePath of specFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = auditDocument(content);
    const relativePath = path.relative(specsDir, filePath);

    files.push({ path: relativePath, ...result });

    if (result.uncited.length > 0) {
      warnings.push(
        `${relativePath}: Uncited technologies: ${result.uncited.join(', ')}. ` +
          `Use Context7 MCP to fetch live docs.`
      );
    }
  }

  const totalTechs = files.reduce((sum, f) => sum + f.techs.length, 0);
  const totalUncited = files.reduce((sum, f) => sum + f.uncited.length, 0);
  const overallScore =
    totalTechs === 0 ? 100 : Math.round(((totalTechs - totalUncited) / totalTechs) * 100);

  return { files, overallScore, warnings };
}

/**
 * Generate a documentation audit report in markdown.
 */
export function generateAuditReport(specsDir: string): string {
  const audit = auditSpecs(specsDir);

  let report = `# Documentation Freshness Audit\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Overall Score:** ${audit.overallScore}/100\n\n`;

  if (audit.files.length === 0) {
    report += `No spec files found.\n`;
    return report;
  }

  report += `## File-Level Results\n\n`;
  report += `| File | Technologies | Citations | Uncited | Score |\n`;
  report += `|------|-------------|-----------|---------|-------|\n`;

  for (const file of audit.files) {
    report += `| ${file.path} | ${file.techs.length} | ${file.citations.length} | ${file.uncited.length} | ${file.score}/100 |\n`;
  }

  if (audit.warnings.length > 0) {
    report += `\n## Warnings\n\n`;
    for (const warning of audit.warnings) {
      report += `- ${warning}\n`;
    }

    report += `\n## Remediation\n\n`;
    report += `For each uncited technology, use Context7 MCP:\n\n`;
    report += `1. Resolve the library ID: \`resolve-library-id\`\n`;
    report += `2. Fetch current docs: \`get-library-docs\`\n`;
    report += `3. Add citation marker: \`[Context7: library@version]\`\n`;
  }

  return report;
}

/**
 * Walk a directory recursively.
 */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
