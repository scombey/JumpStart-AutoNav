#!/usr/bin/env node

/**
 * simplicity-gate.js — Simplicity Gate enforcement.
 * 
 * Part of Jump Start Framework (Item 9: The Simplicity Gate).
 * 
 * Fails plans that exceed 3 top-level project folders without
 * explicit justification.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Directories excluded from the simplicity gate count
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.jumpstart', 'specs', '.github',
  '.vscode', '.cursor', '.idea', '__pycache__', '.mypy_cache',
  '.pytest_cache', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.cache',
  'bin', 'docs', '.devcontainer'
]);

/**
 * Count top-level project directories (excluding standard config/tool dirs).
 * 
 * @param {string} projectDir - Root project directory.
 * @returns {{ count: number, directories: string[] }}
 */
function countTopLevelDirs(projectDir) {
  if (!fs.existsSync(projectDir)) {
    return { count: 0, directories: [] };
  }
  
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const directories = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') || 
                 (e.isDirectory() && !EXCLUDED_DIRS.has(e.name)))
    .filter(e => !EXCLUDED_DIRS.has(e.name))
    .map(e => e.name);
  
  return { count: directories.length, directories };
}

/**
 * Extract planned directory structure from architecture or implementation plan.
 * 
 * @param {string} content - Architecture document content.
 * @returns {string[]} Planned top-level directories.
 */
function extractPlannedDirs(content) {
  // Look for project structure code block
  const structureMatch = content.match(/```[\s\S]*?\[project-root\]\/[\s\S]*?```/);
  if (!structureMatch) return [];
  
  const structure = structureMatch[0];
  const lines = structure.split('\n');
  const topLevel = [];
  
  for (const line of lines) {
    // Match top-level directory entries (e.g., "|-- src/" or "├── src/")
    const dirMatch = line.match(/^[|├└─\s]*(?:--\s*|──\s*)(\w[\w-]*)\//);
    if (dirMatch) {
      const dirName = dirMatch[1];
      if (!EXCLUDED_DIRS.has(dirName)) {
        topLevel.push(dirName);
      }
    }
  }
  
  return [...new Set(topLevel)];
}

/**
 * Run the simplicity gate check.
 * 
 * @param {object} options
 * @param {string} [options.projectDir] - Project root directory.
 * @param {string} [options.archContent] - Architecture document content.
 * @param {number} [options.maxDirs=3] - Maximum allowed top-level directories.
 * @returns {{ passed: boolean, count: number, directories: string[], justificationRequired: boolean, message: string }}
 */
function check(options = {}) {
  const { maxDirs = 3 } = options;
  let directories = [];
  let count = 0;
  
  if (options.archContent) {
    directories = extractPlannedDirs(options.archContent);
    count = directories.length;
  } else if (options.projectDir) {
    const result = countTopLevelDirs(options.projectDir);
    directories = result.directories;
    count = result.count;
  }
  
  const passed = count <= maxDirs;
  const justificationRequired = !passed;
  
  let message;
  if (passed) {
    message = `Simplicity gate passed: ${count} top-level director${count === 1 ? 'y' : 'ies'} (max ${maxDirs}).`;
  } else {
    message = `Simplicity gate FAILED: ${count} top-level directories exceeds maximum of ${maxDirs}. ` +
              `Directories: ${directories.join(', ')}. ` +
              `Justification required in architecture document.`;
  }
  
  return { passed, count, directories, justificationRequired, message };
}

module.exports = {
  countTopLevelDirs,
  extractPlannedDirs,
  check,
  EXCLUDED_DIRS
};
