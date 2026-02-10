#!/usr/bin/env node

/**
 * freshness-gate.js — Context7 Documentation Freshness Gate.
 * 
 * Part of Jump Start Framework (Item 101: Mandate Context7 MCP for Live Documentation).
 * 
 * Enforces that agents use Context7 MCP for live documentation lookups
 * instead of relying on stale training data. Audits specs for proper
 * Context7 citation markers.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Context7 citation pattern: [Context7: library@version] or <!-- c7:library -->
 */
const CITATION_PATTERNS = [
  /\[Context7:\s*[^\]]+\]/gi,
  /<!--\s*c7:[^\s]+\s*-->/gi,
  /\bContext7\b/gi
];

/**
 * Technology keywords that SHOULD trigger a Context7 lookup.
 */
const TECH_KEYWORDS = [
  'react', 'next.js', 'nextjs', 'vue', 'angular', 'svelte',
  'express', 'fastify', 'koa', 'hono', 'nest.js', 'nestjs',
  'prisma', 'drizzle', 'typeorm', 'sequelize', 'mongoose',
  'tailwind', 'bootstrap', 'material-ui', 'chakra',
  'jest', 'vitest', 'playwright', 'cypress', 'mocha',
  'webpack', 'vite', 'esbuild', 'rollup', 'turbopack',
  'docker', 'kubernetes', 'terraform', 'pulumi',
  'aws', 'azure', 'gcp', 'vercel', 'netlify', 'cloudflare',
  'postgresql', 'mysql', 'mongodb', 'redis', 'sqlite',
  'graphql', 'trpc', 'grpc', 'openapi',
  'typescript', 'python', 'rust', 'go', 'java',
  'supabase', 'firebase', 'clerk', 'auth0',
  'stripe', 'twilio', 'sendgrid',
  'langchain', 'openai', 'anthropic'
];

/**
 * Scan a document for technology references that lack Context7 citations.
 * 
 * @param {string} content - Document content to scan.
 * @returns {{ techs: string[], citations: string[], uncited: string[], score: number }}
 */
function auditDocument(content) {
  const contentLower = content.toLowerCase();
  
  // Find all mentioned technologies
  const techs = TECH_KEYWORDS.filter(kw => contentLower.includes(kw.toLowerCase()));
  
  // Find all Context7 citations
  const citations = [];
  for (const pattern of CITATION_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      citations.push(...matches);
    }
  }
  
  // Technologies without citations
  const citedTechsLower = citations.map(c => c.toLowerCase());
  const uncited = techs.filter(tech => {
    return !citedTechsLower.some(c => c.includes(tech.toLowerCase()));
  });
  
  // Freshness score: 0-100 (100 = all techs cited)
  const score = techs.length === 0 ? 100 
    : Math.round(((techs.length - uncited.length) / techs.length) * 100);
  
  return { techs, citations, uncited, score };
}

/**
 * Run a freshness audit across all spec files.
 * 
 * @param {string} specsDir - Path to specs directory.
 * @returns {{ files: object[], overallScore: number, warnings: string[] }}
 */
function auditSpecs(specsDir) {
  const files = [];
  const warnings = [];
  
  if (!fs.existsSync(specsDir)) {
    return { files, overallScore: 100, warnings: ['Specs directory not found.'] };
  }
  
  const specFiles = walkDir(specsDir).filter(f => f.endsWith('.md'));
  
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
  const overallScore = totalTechs === 0 ? 100
    : Math.round(((totalTechs - totalUncited) / totalTechs) * 100);
  
  return { files, overallScore, warnings };
}

/**
 * Generate a documentation audit report in markdown.
 * 
 * @param {string} specsDir - Path to specs directory.
 * @returns {string} Markdown report content.
 */
function generateAuditReport(specsDir) {
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
      report += `- ⚠ ${warning}\n`;
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
 * @param {string} dir
 * @returns {string[]}
 */
function walkDir(dir) {
  const results = [];
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

module.exports = {
  CITATION_PATTERNS,
  TECH_KEYWORDS,
  auditDocument,
  auditSpecs,
  generateAuditReport
};
