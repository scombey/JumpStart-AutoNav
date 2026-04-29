/**
 * complexity.js — Adaptive Planning Depth Calculator (Item 33)
 *
 * Analyses project signals to automatically determine the appropriate
 * elicitation depth (quick | standard | deep) for the Challenger phase.
 *
 * Usage:
 *   echo '{"description":"...","file_count":50}' | node bin/lib/complexity.js
 *
 * Input (stdin JSON):
 *   {
 *     "description": "free-text problem statement",
 *     "file_count": 50,          // optional: number of source files
 *     "dependency_count": 12,    // optional: number of dependencies
 *     "domain": "healthcare",    // optional: project domain
 *     "integrations": 3,         // optional: number of external integrations
 *     "stakeholder_count": 4,    // optional: number of stakeholders
 *     "risk_signals": []         // optional: list of known risk keywords
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "recommended_depth": "standard",
 *     "score": 42,
 *     "breakdown": { ... },
 *     "reasoning": "..."
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readFileSync } = require('fs');

// Domain complexity weights from domain-complexity.csv
const HIGH_COMPLEXITY_DOMAINS = [
  'healthcare', 'fintech', 'govtech', 'aerospace',
  'automotive', 'scientific', 'legaltech', 'energy',
  'process_control'
];
const MEDIUM_COMPLEXITY_DOMAINS = [
  'insuretech', 'edtech', 'building_automation'
];

// Risk signal keywords that increase complexity score
const RISK_KEYWORDS = [
  'security', 'compliance', 'regulation', 'gdpr', 'hipaa', 'pci',
  'real-time', 'realtime', 'distributed', 'migration', 'legacy',
  'multi-tenant', 'concurrent', 'encryption', 'audit', 'financial'
];

/**
 * Calculate complexity score from project signals.
 * @param {object} input - Project signals
 * @returns {{ recommended_depth: string, score: number, breakdown: object, reasoning: string }}
 */
export function calculateComplexity(input) {
  const breakdown = {};
  let score = 0;

  // 1. Description analysis — count risk keywords
  const desc = (input.description || '').toLowerCase();
  const matchedKeywords = RISK_KEYWORDS.filter(k => desc.includes(k));
  const keywordScore = Math.min(matchedKeywords.length * 5, 25);
  breakdown.risk_keywords = { score: keywordScore, matched: matchedKeywords };
  score += keywordScore;

  // 2. Codebase size
  const fileCount = input.file_count || 0;
  const sizeScore = fileCount > 200 ? 20 : fileCount > 50 ? 10 : fileCount > 10 ? 5 : 0;
  breakdown.codebase_size = { score: sizeScore, file_count: fileCount };
  score += sizeScore;

  // 3. Dependency count
  const depCount = input.dependency_count || 0;
  const depScore = depCount > 30 ? 15 : depCount > 15 ? 10 : depCount > 5 ? 5 : 0;
  breakdown.dependencies = { score: depScore, count: depCount };
  score += depScore;

  // 4. Domain complexity
  const domain = (input.domain || '').toLowerCase();
  const domainScore = HIGH_COMPLEXITY_DOMAINS.includes(domain) ? 20
    : MEDIUM_COMPLEXITY_DOMAINS.includes(domain) ? 10 : 0;
  breakdown.domain = { score: domainScore, domain: domain || 'general' };
  score += domainScore;

  // 5. External integrations
  const integrations = input.integrations || 0;
  const intScore = integrations > 5 ? 15 : integrations > 2 ? 10 : integrations > 0 ? 5 : 0;
  breakdown.integrations = { score: intScore, count: integrations };
  score += intScore;

  // 6. Stakeholder count
  const stakeholders = input.stakeholder_count || 0;
  const stakeScore = stakeholders > 5 ? 10 : stakeholders > 2 ? 5 : 0;
  breakdown.stakeholders = { score: stakeScore, count: stakeholders };
  score += stakeScore;

  // Determine recommended depth
  let recommended_depth;
  let reasoning;
  if (score >= 50) {
    recommended_depth = 'deep';
    reasoning = `High complexity score (${score}/100). Project involves ${matchedKeywords.length > 0 ? 'risk-sensitive areas (' + matchedKeywords.join(', ') + ')' : 'significant complexity'}. Deep elicitation recommended to uncover non-obvious root causes and stakeholder concerns.`;
  } else if (score >= 20) {
    recommended_depth = 'standard';
    reasoning = `Moderate complexity score (${score}/100). Standard elicitation depth should provide adequate problem discovery while maintaining reasonable time investment.`;
  } else {
    recommended_depth = 'quick';
    reasoning = `Low complexity score (${score}/100). Quick elicitation is sufficient for this project's scope and risk profile.`;
  }

  return { recommended_depth, score, breakdown, reasoning };
}

// CLI mode: read from stdin
if (process.argv[1] && process.argv[1].endsWith('complexity.mjs')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input || '{}');
      const result = calculateComplexity(data);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (err) {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(1);
    }
  });
}
