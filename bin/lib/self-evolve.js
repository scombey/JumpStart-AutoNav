#!/usr/bin/env node

/**
 * self-evolve.js — Framework Self-Improvement Hook (Item 100).
 *
 * Analyzes project usage patterns and generates config change proposals.
 * All proposals require explicit human approval before applying.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Analyze the project state and generate config improvement proposals.
 *
 * @param {string} projectDir - Path to the project root.
 * @returns {{ proposals: Array<{setting: string, current: any, proposed: any, rationale: string}>, analysis: object }}
 */
export function analyzeAndPropose(projectDir) {
  const proposals = [];
  const analysis = {
    specs_found: 0,
    adrs_found: 0,
    has_usage_log: false,
    has_correction_log: false,
    quality_score: null,
    modules_loaded: 0
  };

  const configPath = path.join(projectDir, '.jumpstart', 'config.yaml');
  if (!fs.existsSync(configPath)) {
    return { proposals: [], analysis };
  }

  const configContent = fs.readFileSync(configPath, 'utf8');

  // Count specs
  const specsDir = path.join(projectDir, 'specs');
  if (fs.existsSync(specsDir)) {
    const specFiles = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
    analysis.specs_found = specFiles.length;
  }

  // Count ADRs
  const adrsDir = path.join(projectDir, 'specs', 'decisions');
  if (fs.existsSync(adrsDir)) {
    analysis.adrs_found = fs.readdirSync(adrsDir).filter(f => f.endsWith('.md')).length;
  }

  // Check usage log
  const usageLog = path.join(projectDir, '.jumpstart', 'usage-log.json');
  analysis.has_usage_log = fs.existsSync(usageLog);

  // Check correction log
  const correctionLog = path.join(projectDir, '.jumpstart', 'correction-log.md');
  analysis.has_correction_log = fs.existsSync(correctionLog);

  // ── Heuristic-based proposals ──────────────────────────────────────────

  // If many ADRs exist but diagram verification is off
  if (analysis.adrs_found > 5 && configContent.includes('auto_verify_at_gate: false')) {
    proposals.push({
      setting: 'diagram_verification.auto_verify_at_gate',
      current: false,
      proposed: true,
      rationale: `Project has ${analysis.adrs_found} ADRs, suggesting complexity. Auto-verifying diagrams at gates would catch inconsistencies earlier.`
    });
  }

  // If no usage log exists and project is mature
  if (!analysis.has_usage_log && analysis.specs_found > 3) {
    proposals.push({
      setting: 'usage_tracking',
      current: 'disabled',
      proposed: 'enabled',
      rationale: 'Project has multiple spec artifacts. Enabling usage tracking would provide visibility into agent session costs and help optimize workflow.'
    });
  }

  // If skill level is not set
  if (configContent.includes('skill_level: null')) {
    proposals.push({
      setting: 'user.skill_level',
      current: null,
      proposed: 'intermediate',
      rationale: 'Skill level is unset. Setting it to "intermediate" would enable adaptive explanations and hints tailored to experience level.'
    });
  }

  // If many corrections logged, suggest stricter quality gates
  if (analysis.has_correction_log) {
    try {
      const corrections = fs.readFileSync(correctionLog, 'utf8');
      const entryCount = (corrections.match(/^## /gm) || []).length;
      if (entryCount > 5 && configContent.includes('overall_score_min: 70')) {
        proposals.push({
          setting: 'testing.spec_quality.overall_score_min',
          current: 70,
          proposed: 80,
          rationale: `Correction log has ${entryCount} entries. Raising the minimum quality score from 70 to 80 would catch more issues before they require correction.`
        });
      }
    } catch (err) {
      // Skip if can't read
    }
  }

  // If peer review is disabled and project has grown
  if (analysis.specs_found > 4 && configContent.includes('peer_review_required: false')) {
    proposals.push({
      setting: 'testing.peer_review_required',
      current: false,
      proposed: true,
      rationale: `Project has ${analysis.specs_found} spec artifacts. Enabling peer review would add an additional quality layer as complexity grows.`
    });
  }

  return { proposals, analysis };
}

/**
 * Generate a config proposal markdown artifact from analysis results.
 *
 * @param {object} result - Output from analyzeAndPropose().
 * @returns {string} Markdown content for the config-proposal.md artifact.
 */
export function generateProposalArtifact(result) {
  if (result.proposals.length === 0) {
    return '# Configuration Change Proposal\n\nNo changes proposed. Current configuration is well-suited to the project state.\n';
  }

  let md = '# Configuration Change Proposal\n\n';
  md += `> **Generated:** ${new Date().toISOString()}\n`;
  md += `> **Triggered by:** Self-evolve analysis\n\n`;
  md += '---\n\n';

  md += '## Proposed Changes\n\n';
  md += '| Setting | Current Value | Proposed Value | Rationale |\n';
  md += '|---------|--------------|----------------|----------|\n';
  for (const p of result.proposals) {
    md += `| \`${p.setting}\` | ${p.current} | ${p.proposed} | ${p.rationale.substring(0, 80)}... |\n`;
  }

  md += '\n---\n\n';
  md += '## Project Analysis\n\n';
  md += `| Metric | Value |\n|--------|-------|\n`;
  for (const [key, value] of Object.entries(result.analysis)) {
    md += `| ${key} | ${value} |\n`;
  }

  md += '\n---\n\n';
  md += '## Approval\n\n';
  md += 'This proposal requires explicit human approval before applying changes.\n\n';
  md += '- [ ] Changes reviewed and understood\n';
  md += '- [ ] Impact analysis acceptable\n\n';
  md += '**Approved by:** Pending\n';
  md += '**Approval date:** Pending\n';
  md += '**Action:** [Apply / Reject / Defer]\n';

  return md;
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('self-evolve.js')) {
  const projectDir = process.argv[2] || process.cwd();
  const result = analyzeAndPropose(projectDir);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
