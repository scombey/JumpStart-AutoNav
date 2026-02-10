#!/usr/bin/env node

/**
 * invariants-check.js — Environment Invariants ("Roadmapal Invariants").
 * 
 * Part of Jump Start Framework (Item 15: Environment Invariants).
 * 
 * Non-negotiable rules (encryption-at-rest, audit logging, etc.)
 * enforced pre-implementation.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load invariants from the invariants file.
 * 
 * @param {string} invariantsPath - Path to invariants.md.
 * @returns {object[]} Array of { id, name, category, requirement, verification } objects.
 */
function loadInvariants(invariantsPath) {
  if (!fs.existsSync(invariantsPath)) {
    return [];
  }
  
  const content = fs.readFileSync(invariantsPath, 'utf8');
  const invariants = [];
  
  // Parse invariant entries from the markdown table
  const tableMatch = content.match(/\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|/gm);
  if (!tableMatch) return invariants;
  
  // Skip header and separator rows
  const rows = tableMatch.filter(row => !row.includes('---') && !row.includes('Category'));
  
  for (const row of rows) {
    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 4) {
      invariants.push({
        id: cells[0],
        name: cells[1],
        category: cells[2],
        requirement: cells[3],
        verification: cells[4] || 'Manual review'
      });
    }
  }
  
  return invariants;
}

/**
 * Check architecture document against invariants.
 * 
 * @param {string} archContent - Architecture document content.
 * @param {object[]} invariants - Loaded invariants.
 * @returns {{ passed: object[], failed: object[], warnings: string[] }}
 */
function checkAgainstArchitecture(archContent, invariants) {
  const passed = [];
  const failed = [];
  const warnings = [];
  
  const contentLower = archContent.toLowerCase();
  
  for (const inv of invariants) {
    // Check if the invariant's key terms are mentioned in the architecture
    const keywords = inv.requirement
      .toLowerCase()
      .split(/[\s,;.]+/)
      .filter(w => w.length > 4);
    
    const keywordHits = keywords.filter(kw => contentLower.includes(kw));
    const coverage = keywords.length > 0 ? keywordHits.length / keywords.length : 0;
    
    if (coverage >= 0.3) {
      passed.push({ ...inv, coverage: Math.round(coverage * 100) });
    } else {
      failed.push({ ...inv, coverage: Math.round(coverage * 100) });
      warnings.push(
        `Invariant "${inv.name}" (${inv.id}) — ${inv.category}: ` +
        `Architecture document may not address: "${inv.requirement}"`
      );
    }
  }
  
  return { passed, failed, warnings };
}

/**
 * Check implementation plan against invariants.
 * 
 * @param {string} planContent - Implementation plan content.
 * @param {object[]} invariants - Loaded invariants.
 * @returns {{ addressed: string[], unaddressed: string[] }}
 */
function checkAgainstPlan(planContent, invariants) {
  const addressed = [];
  const unaddressed = [];
  const contentLower = planContent.toLowerCase();
  
  for (const inv of invariants) {
    const nameWords = inv.name.toLowerCase().split(/\s+/);
    const found = nameWords.some(w => w.length > 3 && contentLower.includes(w));
    
    if (found) {
      addressed.push(inv.id);
    } else {
      unaddressed.push(inv.id);
    }
  }
  
  return { addressed, unaddressed };
}

/**
 * Generate a compliance report for all invariants.
 * 
 * @param {string} invariantsPath - Path to invariants file.
 * @param {string} specsDir - Path to specs directory.
 * @returns {{ invariantCount: number, archCoverage: object, planCoverage: object, summary: string }}
 */
function generateReport(invariantsPath, specsDir) {
  const invariants = loadInvariants(invariantsPath);
  
  if (invariants.length === 0) {
    return {
      invariantCount: 0,
      archCoverage: null,
      planCoverage: null,
      summary: 'No invariants defined.'
    };
  }
  
  let archCoverage = null;
  const archPath = path.join(specsDir, 'architecture.md');
  if (fs.existsSync(archPath)) {
    const archContent = fs.readFileSync(archPath, 'utf8');
    archCoverage = checkAgainstArchitecture(archContent, invariants);
  }
  
  let planCoverage = null;
  const planPath = path.join(specsDir, 'implementation-plan.md');
  if (fs.existsSync(planPath)) {
    const planContent = fs.readFileSync(planPath, 'utf8');
    planCoverage = checkAgainstPlan(planContent, invariants);
  }
  
  const failedCount = archCoverage ? archCoverage.failed.length : invariants.length;
  const summary = failedCount === 0
    ? `All ${invariants.length} invariant(s) addressed in architecture.`
    : `${failedCount}/${invariants.length} invariant(s) may not be addressed in architecture.`;
  
  return { invariantCount: invariants.length, archCoverage, planCoverage, summary };
}

module.exports = {
  loadInvariants,
  checkAgainstArchitecture,
  checkAgainstPlan,
  generateReport
};
