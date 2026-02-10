#!/usr/bin/env node

/**
 * spec-drift.js — Detect drift between specs and implementation.
 * 
 * Part of Jump Start Framework (Item 4: Strict Power Inversion).
 * 
 * Specs are the source of truth; code is derived. This module
 * detects mismatches and flags them before build.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Extract story IDs referenced in a spec file.
 * Looks for patterns like E1-S1, E2-S3, etc.
 * 
 * @param {string} content - File content.
 * @returns {string[]} Array of story IDs.
 */
function extractStoryIds(content) {
  const matches = content.match(/E\d+-S\d+/g);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract task IDs from implementation plan.
 * Looks for patterns like M1-T01, M2-T02, etc.
 * 
 * @param {string} content - File content.
 * @returns {string[]} Array of task IDs.
 */
function extractTaskIds(content) {
  const matches = content.match(/M\d+-T\d+/g);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract component names from architecture document.
 * Looks for "### Component: [Name]" patterns.
 * 
 * @param {string} content - File content.
 * @returns {string[]} Array of component names.
 */
function extractComponents(content) {
  const matches = content.match(/### Component:\s*(.+)/g);
  return matches ? matches.map(m => m.replace('### Component:', '').trim()) : [];
}

/**
 * Check for spec drift between PRD, architecture, and implementation plan.
 * 
 * @param {string} specsDir - Path to specs directory.
 * @returns {{ drifts: object[], warnings: string[], summary: string }}
 */
function checkSpecDrift(specsDir) {
  const drifts = [];
  const warnings = [];
  
  const prdPath = path.join(specsDir, 'prd.md');
  const archPath = path.join(specsDir, 'architecture.md');
  const planPath = path.join(specsDir, 'implementation-plan.md');
  
  // Check file existence
  const files = { prd: prdPath, architecture: archPath, plan: planPath };
  const contents = {};
  
  for (const [name, filePath] of Object.entries(files)) {
    if (!fs.existsSync(filePath)) {
      warnings.push(`${name} not found at ${filePath}`);
    } else {
      contents[name] = fs.readFileSync(filePath, 'utf8');
    }
  }
  
  // Cross-reference stories: PRD stories should appear in architecture and plan
  if (contents.prd) {
    const prdStories = extractStoryIds(contents.prd);
    
    if (contents.architecture) {
      const archStories = extractStoryIds(contents.architecture);
      for (const story of prdStories) {
        if (!archStories.includes(story)) {
          drifts.push({
            type: 'missing_reference',
            source: 'prd.md',
            target: 'architecture.md',
            detail: `Story ${story} from PRD not referenced in Architecture Document`
          });
        }
      }
    }
    
    if (contents.plan) {
      const planStories = extractStoryIds(contents.plan);
      for (const story of prdStories) {
        if (!planStories.includes(story)) {
          drifts.push({
            type: 'missing_reference',
            source: 'prd.md',
            target: 'implementation-plan.md',
            detail: `Story ${story} from PRD not referenced in Implementation Plan`
          });
        }
      }
    }
  }
  
  // Cross-reference components: Architecture components should appear in plan
  if (contents.architecture && contents.plan) {
    const archComponents = extractComponents(contents.architecture);
    for (const component of archComponents) {
      if (!contents.plan.includes(component)) {
        drifts.push({
          type: 'missing_reference',
          source: 'architecture.md',
          target: 'implementation-plan.md',
          detail: `Component "${component}" from Architecture not referenced in Implementation Plan`
        });
      }
    }
  }
  
  // Check for orphan tasks in plan that don't reference any story
  if (contents.plan) {
    const taskBlocks = contents.plan.match(/### Task (M\d+-T\d+)[\s\S]*?(?=### Task|### Milestone|## Milestone|---\s*\n## |$)/g) || [];
    for (const block of taskBlocks) {
      const taskIdMatch = block.match(/### Task (M\d+-T\d+)/);
      const storyRefMatch = block.match(/\*\*Story Reference\*\*\s*\|\s*(\S+)/);
      if (taskIdMatch && storyRefMatch) {
        const storyRef = storyRefMatch[1];
        if (storyRef === 'None' || storyRef === '[PRD' || storyRef === '-') {
          warnings.push(`Task ${taskIdMatch[1]} has no story reference`);
        }
      }
    }
  }
  
  const summary = drifts.length === 0
    ? 'No spec drift detected.'
    : `Found ${drifts.length} drift(s) between specifications.`;
  
  return { drifts, warnings, summary };
}

/**
 * Check if source code files reference their spec origins.
 * Looks for task ID comments in source files.
 * 
 * @param {string} sourceDir - Path to source directory.
 * @param {string} planPath - Path to implementation plan.
 * @returns {{ unmapped: string[], summary: string }}
 */
function checkCodeTraceability(sourceDir, planPath) {
  const unmapped = [];
  
  if (!fs.existsSync(sourceDir) || !fs.existsSync(planPath)) {
    return { unmapped, summary: 'Source or plan not found.' };
  }
  
  const planContent = fs.readFileSync(planPath, 'utf8');
  const plannedFiles = [];
  
  // Extract files from plan
  const fileMatches = planContent.match(/\*\*Files\*\*\s*\|\s*(.+)/g) || [];
  for (const match of fileMatches) {
    const files = match.replace(/\*\*Files\*\*\s*\|\s*/, '').split(',').map(f => f.trim());
    plannedFiles.push(...files);
  }
  
  // Check source files exist
  for (const file of plannedFiles) {
    if (file && file !== '-' && file !== 'None') {
      const fullPath = path.resolve(sourceDir, '..', file);
      if (!fs.existsSync(fullPath)) {
        unmapped.push(file);
      }
    }
  }
  
  const summary = unmapped.length === 0
    ? 'All planned files are present.'
    : `${unmapped.length} planned file(s) not yet created.`;
  
  return { unmapped, summary };
}

module.exports = {
  extractStoryIds,
  extractTaskIds,
  extractComponents,
  checkSpecDrift,
  checkCodeTraceability
};
