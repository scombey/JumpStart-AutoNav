#!/usr/bin/env node

/**
 * template-merge.js — Template Inheritance System for Jump Start (Item 93).
 *
 * Merges organization-wide base templates with project-level overrides.
 * Project-level content wins on conflict (section-level merge).
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Parse a markdown document into sections keyed by H2 headers.
 *
 * @param {string} content - Markdown content.
 * @returns {{ frontmatter: string|null, preamble: string, sections: Map<string, string> }}
 */
export function parseSections(content) {
  const lines = content.split('\n');
  let frontmatter = null;
  let preamble = '';
  const sections = new Map();

  let currentSection = null;
  let currentContent = [];
  let inFrontmatter = false;
  let frontmatterLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track frontmatter
    if (i === 0 && line.trim() === '---') {
      inFrontmatter = true;
      frontmatterLines.push(line);
      continue;
    }
    if (inFrontmatter) {
      frontmatterLines.push(line);
      if (line.trim() === '---') {
        frontmatter = frontmatterLines.join('\n');
        inFrontmatter = false;
      }
      continue;
    }

    // Detect H2 sections
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      // Save previous section
      if (currentSection) {
        sections.set(currentSection, currentContent.join('\n'));
      } else if (currentContent.length > 0) {
        preamble = currentContent.join('\n');
      }
      currentSection = h2Match[1].trim();
      currentContent = [line];
      continue;
    }

    currentContent.push(line);
  }

  // Save last section
  if (currentSection) {
    sections.set(currentSection, currentContent.join('\n'));
  } else if (currentContent.length > 0) {
    preamble += (preamble ? '\n' : '') + currentContent.join('\n');
  }

  return { frontmatter, preamble, sections };
}

/**
 * Merge a base template with project overrides.
 * Project sections win on conflict. Base sections not present in project are kept.
 *
 * @param {string} baseContent - Base (organization-wide) template content.
 * @param {string} projectContent - Project-level template content.
 * @param {object} [options] - Merge options.
 * @param {string} [options.strategy='project-wins'] - Merge strategy.
 * @returns {{ merged: string, stats: { base_only: number, project_only: number, overridden: number, total: number } }}
 */
export function mergeTemplates(baseContent, projectContent, options = {}) {
  const strategy = options.strategy || 'project-wins';

  const base = parseSections(baseContent);
  const project = parseSections(projectContent);

  let stats = { base_only: 0, project_only: 0, overridden: 0, total: 0 };

  // Use project frontmatter if available, else base
  const frontmatter = project.frontmatter || base.frontmatter;
  const preamble = project.preamble || base.preamble;

  // Merge sections
  const mergedSections = new Map();

  // Start with base sections
  for (const [key, value] of base.sections) {
    mergedSections.set(key, value);
  }

  // Override/add project sections
  for (const [key, value] of project.sections) {
    if (mergedSections.has(key)) {
      if (strategy === 'project-wins') {
        mergedSections.set(key, value);
        stats.overridden++;
      }
      // 'base-wins' would keep the base version
    } else {
      mergedSections.set(key, value);
      stats.project_only++;
    }
  }

  // Count base-only sections
  for (const key of base.sections.keys()) {
    if (!project.sections.has(key)) {
      stats.base_only++;
    }
  }

  stats.total = mergedSections.size;

  // Reconstruct document
  const parts = [];
  if (frontmatter) parts.push(frontmatter);
  if (preamble.trim()) parts.push(preamble);
  for (const [, value] of mergedSections) {
    parts.push(value);
  }

  return { merged: parts.join('\n\n'), stats };
}

/**
 * Merge template files from disk.
 *
 * @param {string} basePath - Path to base template file.
 * @param {string} projectPath - Path to project template file.
 * @param {object} [options] - Merge options.
 * @returns {{ merged: string, stats: object }}
 */
export function mergeTemplateFiles(basePath, projectPath, options = {}) {
  const baseContent = fs.existsSync(basePath) ? fs.readFileSync(basePath, 'utf8') : '';
  const projectContent = fs.existsSync(projectPath) ? fs.readFileSync(projectPath, 'utf8') : '';

  if (!baseContent && !projectContent) {
    return { merged: '', stats: { base_only: 0, project_only: 0, overridden: 0, total: 0 } };
  }

  if (!baseContent) return { merged: projectContent, stats: { base_only: 0, project_only: 0, overridden: 0, total: 0 } };
  if (!projectContent) return { merged: baseContent, stats: { base_only: 0, project_only: 0, overridden: 0, total: 0 } };

  return mergeTemplates(baseContent, projectContent, options);
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('template-merge.js')) {
  const basePath = process.argv[2];
  const projectPath = process.argv[3];

  if (!basePath || !projectPath) {
    process.stderr.write('Usage: template-merge.js <base-path> <project-path>\n');
    process.exit(1);
  }

  const result = mergeTemplateFiles(basePath, projectPath);
  process.stdout.write(JSON.stringify({ stats: result.stats }, null, 2) + '\n');
  process.stdout.write(result.merged + '\n');
}
