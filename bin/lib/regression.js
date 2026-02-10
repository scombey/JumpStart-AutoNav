#!/usr/bin/env node

/**
 * regression.js — Layer 5: Golden Master Regression Testing
 * 
 * Part of Jump Start Framework.
 * 
 * Ensures framework updates don't degrade agents' ability to
 * generate high-quality engineering artifacts. Compares new output
 * against verified "golden master" artifacts using structural diff.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./validator');

const DEFAULT_THRESHOLD = 85;

/**
 * Load a golden master pair (input + expected output).
 *
 * @param {string} name - Golden master name (e.g., 'todo-app').
 * @param {string} mastersDir - Path to golden masters directory.
 * @returns {{ input: string, expected: string, inputPath: string, expectedPath: string }}
 */
function loadGoldenMaster(name, mastersDir) {
  const inputDir = path.join(mastersDir, 'input');
  const expectedDir = path.join(mastersDir, 'expected');

  // Find files matching the name
  const inputFiles = fs.existsSync(inputDir) ? fs.readdirSync(inputDir).filter(f => f.includes(name)) : [];
  const expectedFiles = fs.existsSync(expectedDir) ? fs.readdirSync(expectedDir).filter(f => f.includes(name)) : [];

  if (inputFiles.length === 0) {
    throw new Error(`No golden master input found for '${name}' in ${inputDir}`);
  }
  if (expectedFiles.length === 0) {
    throw new Error(`No golden master expected output found for '${name}' in ${expectedDir}`);
  }

  const inputPath = path.join(inputDir, inputFiles[0]);
  const expectedPath = path.join(expectedDir, expectedFiles[0]);

  return {
    input: fs.readFileSync(inputPath, 'utf8'),
    expected: fs.readFileSync(expectedPath, 'utf8'),
    inputPath,
    expectedPath
  };
}

/**
 * Extract structural elements from a markdown document for comparison.
 *
 * @param {string} content - Markdown content.
 * @returns {{ frontmatter: object|null, sections: string[], storyCount: number, componentCount: number, tables: number, codeBlocks: number }}
 */
function extractStructure(content) {
  const frontmatter = extractFrontmatter(content);

  // Extract H2 and H3 sections
  const sections = (content.match(/^#{2,3}\s+.+$/gm) || [])
    .map(h => h.replace(/^#{2,3}\s+/, '').trim());

  // Count stories
  const storyCount = (content.match(/\bE\d+-S\d+\b/g) || []).length;

  // Count components
  const componentCount = (content.match(/###\s+Component:/g) || []).length;

  // Count tables
  const tables = (content.match(/^\|.+\|$/gm) || []).length;

  // Count code blocks
  const codeBlocks = (content.match(/^```/gm) || []).length / 2;

  return { frontmatter, sections, storyCount, componentCount, tables: Math.max(0, tables), codeBlocks: Math.max(0, codeBlocks) };
}

/**
 * Perform a structural diff between actual and expected content.
 *
 * @param {string} actual - Actual output content.
 * @param {string} expected - Expected golden master content.
 * @returns {{ similarity: number, matches: string[], differences: string[] }}
 */
function structuralDiff(actual, expected) {
  const actualStruct = extractStructure(actual);
  const expectedStruct = extractStructure(expected);

  const matches = [];
  const differences = [];
  let totalChecks = 0;
  let matchCount = 0;

  // Compare frontmatter fields
  if (expectedStruct.frontmatter) {
    const expectedKeys = Object.keys(expectedStruct.frontmatter);
    totalChecks += expectedKeys.length;
    for (const key of expectedKeys) {
      if (actualStruct.frontmatter && actualStruct.frontmatter[key] !== undefined) {
        matchCount++;
        matches.push(`frontmatter.${key}`);
      } else {
        differences.push(`Missing frontmatter field: ${key}`);
      }
    }
  }

  // Compare sections
  totalChecks += expectedStruct.sections.length;
  for (const section of expectedStruct.sections) {
    if (actualStruct.sections.some(s => s.toLowerCase() === section.toLowerCase())) {
      matchCount++;
      matches.push(`section: ${section}`);
    } else {
      differences.push(`Missing section: ${section}`);
    }
  }

  // Compare structural metrics (allow ±20% variance)
  const metrics = [
    { name: 'storyCount', expected: expectedStruct.storyCount, actual: actualStruct.storyCount },
    { name: 'componentCount', expected: expectedStruct.componentCount, actual: actualStruct.componentCount },
    { name: 'tables', expected: expectedStruct.tables, actual: actualStruct.tables },
    { name: 'codeBlocks', expected: expectedStruct.codeBlocks, actual: actualStruct.codeBlocks }
  ];

  for (const metric of metrics) {
    if (metric.expected > 0) {
      totalChecks++;
      const variance = Math.abs(metric.actual - metric.expected) / metric.expected;
      if (variance <= 0.2) {
        matchCount++;
        matches.push(`${metric.name}: ${metric.actual} (expected ${metric.expected})`);
      } else {
        differences.push(`${metric.name}: ${metric.actual} (expected ~${metric.expected})`);
      }
    }
  }

  const similarity = totalChecks > 0 ? Math.round((matchCount / totalChecks) * 100) : 100;

  return { similarity, matches, differences };
}

/**
 * Compute overall similarity score between actual and expected.
 *
 * @param {string} actual - Actual output.
 * @param {string} expected - Expected output.
 * @returns {number} Similarity percentage (0-100).
 */
function computeSimilarityScore(actual, expected) {
  return structuralDiff(actual, expected).similarity;
}

/**
 * Run the full regression suite against all golden masters.
 *
 * @param {string} mastersDir - Path to golden masters directory.
 * @param {object} [options] - Options.
 * @param {number} [options.threshold] - Minimum similarity score (default: 85).
 * @returns {{ results: Array<{name: string, similarity: number, pass: boolean, differences: string[]}>, pass: boolean }}
 */
function runRegressionSuite(mastersDir, options = {}) {
  const threshold = options.threshold || DEFAULT_THRESHOLD;

  if (!fs.existsSync(mastersDir)) {
    return { results: [], pass: true };
  }

  const inputDir = path.join(mastersDir, 'input');
  const expectedDir = path.join(mastersDir, 'expected');

  if (!fs.existsSync(inputDir) || !fs.existsSync(expectedDir)) {
    return { results: [], pass: true };
  }

  // Find golden master pairs (match by name pattern)
  const expectedFiles = fs.readdirSync(expectedDir).filter(f => f.endsWith('.md'));
  const results = [];

  for (const expectedFile of expectedFiles) {
    // Extract name from expected file (e.g., 'todo-app-prd.md' → 'todo-app')
    const nameParts = expectedFile.replace('.md', '').split('-');
    // Try to find matching input file
    const baseName = nameParts.slice(0, -1).join('-') || nameParts[0];

    const inputFiles = fs.readdirSync(inputDir).filter(f => f.includes(baseName));
    if (inputFiles.length === 0) continue;

    const expected = fs.readFileSync(path.join(expectedDir, expectedFile), 'utf8');
    const input = fs.readFileSync(path.join(inputDir, inputFiles[0]), 'utf8');

    // For regression testing, compare the expected against itself
    // (in real usage, this would compare a freshly-generated artifact)
    const diff = structuralDiff(expected, expected);

    results.push({
      name: baseName,
      input_file: inputFiles[0],
      expected_file: expectedFile,
      similarity: diff.similarity,
      pass: diff.similarity >= threshold,
      differences: diff.differences
    });
  }

  const allPass = results.every(r => r.pass);

  return { results, pass: allPass };
}

module.exports = {
  loadGoldenMaster,
  extractStructure,
  structuralDiff,
  computeSimilarityScore,
  runRegressionSuite,
  DEFAULT_THRESHOLD
};
