#!/usr/bin/env node

/**
 * template-watcher.js — Artifact Hot-Reloading.
 * 
 * Part of Jump Start Framework (Item 14: Artifact Hot-Reloading).
 * 
 * Detects template changes and prompts spec updates.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Compute a hash for a file.
 * 
 * @param {string} filePath - File to hash.
 * @returns {string} SHA-256 hex hash.
 */
function fileHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Build a snapshot of all template files and their hashes.
 * 
 * @param {string} templatesDir - Path to templates directory.
 * @returns {object} Map of filename -> hash.
 */
function buildSnapshot(templatesDir) {
  const snapshot = {};
  
  if (!fs.existsSync(templatesDir)) {
    return snapshot;
  }
  
  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    snapshot[file] = fileHash(path.join(templatesDir, file));
  }
  
  return snapshot;
}

/**
 * Load the previous template snapshot.
 * 
 * @param {string} snapshotPath - Path to the snapshot file.
 * @returns {object|null} Previous snapshot or null.
 */
function loadSnapshot(snapshotPath) {
  if (fs.existsSync(snapshotPath)) {
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  }
  return null;
}

/**
 * Save a template snapshot.
 * 
 * @param {string} snapshotPath - Path to save.
 * @param {object} snapshot - Snapshot to save.
 */
function saveSnapshot(snapshotPath, snapshot) {
  const dir = path.dirname(snapshotPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
}

/**
 * Compare two template snapshots and identify changes.
 * 
 * @param {object} previous - Previous snapshot.
 * @param {object} current - Current snapshot.
 * @returns {{ added: string[], modified: string[], removed: string[] }}
 */
function compareSnapshots(previous, current) {
  const added = [];
  const modified = [];
  const removed = [];
  
  // Check for new or modified templates
  for (const [file, hash] of Object.entries(current)) {
    if (!previous[file]) {
      added.push(file);
    } else if (previous[file] !== hash) {
      modified.push(file);
    }
  }
  
  // Check for removed templates
  for (const file of Object.keys(previous)) {
    if (!current[file]) {
      removed.push(file);
    }
  }
  
  return { added, modified, removed };
}

/**
 * Map template files to their corresponding spec artifacts.
 * 
 * @param {string} templateName - Template filename (e.g., 'prd.md').
 * @returns {string} Corresponding spec path (e.g., 'specs/prd.md').
 */
function templateToSpec(templateName) {
  const mapping = {
    'prd.md': 'specs/prd.md',
    'architecture.md': 'specs/architecture.md',
    'implementation-plan.md': 'specs/implementation-plan.md',
    'product-brief.md': 'specs/product-brief.md',
    'challenger-brief.md': 'specs/challenger-brief.md',
    'codebase-context.md': 'specs/codebase-context.md',
    'adr.md': 'specs/decisions/',
    'insights.md': 'specs/insights/',
    'qa-log.md': 'specs/qa-log.md'
  };
  
  return mapping[templateName] || `specs/${templateName}`;
}

/**
 * Check for template changes and generate warnings.
 * 
 * @param {string} templatesDir - Path to templates directory.
 * @param {string} snapshotPath - Path to store/load snapshots.
 * @returns {{ changed: boolean, changes: object, warnings: string[] }}
 */
function checkForChanges(templatesDir, snapshotPath) {
  const current = buildSnapshot(templatesDir);
  const previous = loadSnapshot(snapshotPath);
  const warnings = [];
  
  if (!previous) {
    // First run — save baseline
    saveSnapshot(snapshotPath, current);
    return { changed: false, changes: { added: [], modified: [], removed: [] }, warnings };
  }
  
  const changes = compareSnapshots(previous, current);
  const changed = changes.added.length > 0 || changes.modified.length > 0 || changes.removed.length > 0;
  
  if (changed) {
    for (const file of changes.modified) {
      const specPath = templateToSpec(file);
      warnings.push(`Template '${file}' has changed. Spec '${specPath}' may need regeneration.`);
    }
    for (const file of changes.added) {
      warnings.push(`New template '${file}' added. Consider generating corresponding spec.`);
    }
    for (const file of changes.removed) {
      warnings.push(`Template '${file}' was removed. Check if corresponding specs are orphaned.`);
    }
    
    // Update snapshot
    saveSnapshot(snapshotPath, current);
  }
  
  return { changed, changes, warnings };
}

module.exports = {
  buildSnapshot,
  loadSnapshot,
  saveSnapshot,
  compareSnapshots,
  templateToSpec,
  checkForChanges
};
