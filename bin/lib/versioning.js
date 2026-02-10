#!/usr/bin/env node

/**
 * versioning.js — Versioned Artifacts for Jump Start specs.
 * 
 * Part of Jump Start Framework (Item 6: Versioned Artifacts).
 * 
 * On approval, auto-create git tags and store spec versions in metadata.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Generate a version tag for a spec artifact.
 * Format: spec/[artifact-name]/vX.Y.Z
 * 
 * @param {string} artifactName - Base name of the artifact (e.g., 'prd', 'architecture').
 * @param {string} version - Semver version string.
 * @returns {string} The tag name.
 */
function generateTag(artifactName, version) {
  return `spec/${artifactName}/v${version}`;
}

/**
 * Get the next version for an artifact based on existing tags.
 * 
 * @param {string} artifactName - Base name of the artifact.
 * @param {string} [cwd] - Working directory (defaults to process.cwd()).
 * @returns {string} Next version string (e.g., '1.0.0', '1.1.0').
 */
function getNextVersion(artifactName, cwd) {
  const workDir = cwd || process.cwd();
  
  try {
    const tags = execSync(`git tag -l "spec/${artifactName}/v*"`, {
      cwd: workDir,
      encoding: 'utf8'
    }).trim();
    
    if (!tags) return '1.0.0';
    
    const versions = tags.split('\n')
      .map(tag => tag.replace(`spec/${artifactName}/v`, ''))
      .filter(v => /^\d+\.\d+\.\d+$/.test(v))
      .map(v => v.split('.').map(Number))
      .sort((a, b) => {
        for (let i = 0; i < 3; i++) {
          if (a[i] !== b[i]) return b[i] - a[i];
        }
        return 0;
      });
    
    if (versions.length === 0) return '1.0.0';
    
    const latest = versions[0];
    return `${latest[0]}.${latest[1] + 1}.0`;
  } catch {
    return '1.0.0';
  }
}

/**
 * Create a git tag for the approved artifact.
 * 
 * @param {string} artifactName - Base name of the artifact.
 * @param {string} version - Version string.
 * @param {string} [message] - Tag message.
 * @param {string} [cwd] - Working directory.
 * @returns {{ success: boolean, tag: string, error?: string }}
 */
function createVersionTag(artifactName, version, message, cwd) {
  const workDir = cwd || process.cwd();
  const tag = generateTag(artifactName, version);
  const tagMessage = message || `Approved: ${artifactName} v${version}`;
  
  try {
    execSync(`git tag -a "${tag}" -m "${tagMessage}"`, {
      cwd: workDir,
      encoding: 'utf8'
    });
    return { success: true, tag };
  } catch (err) {
    return { success: false, tag, error: err.message };
  }
}

/**
 * Inject version metadata into a spec file's frontmatter.
 * 
 * @param {string} filePath - Path to the spec file.
 * @param {string} version - Version string.
 * @returns {boolean} True if successfully updated.
 */
function injectVersion(filePath, version) {
  if (!fs.existsSync(filePath)) return false;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if frontmatter exists
  if (content.startsWith('---\n')) {
    // Add or update version in frontmatter
    const endIdx = content.indexOf('\n---', 4);
    if (endIdx !== -1) {
      let frontmatter = content.substring(4, endIdx);
      if (frontmatter.includes('version:')) {
        frontmatter = frontmatter.replace(/version:\s*.+/, `version: "${version}"`);
      } else {
        frontmatter += `\nversion: "${version}"`;
      }
      content = '---\n' + frontmatter + content.substring(endIdx);
    }
  }
  
  // Also update the header metadata block if present
  const versionPattern = /(\*\*Version:\*\*\s*).*/;
  if (versionPattern.test(content)) {
    content = content.replace(versionPattern, `$1${version}`);
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

/**
 * List all version tags for the project.
 * 
 * @param {string} [cwd] - Working directory.
 * @returns {object[]} Array of { artifact, version, tag } objects.
 */
function listVersions(cwd) {
  const workDir = cwd || process.cwd();
  
  try {
    const tags = execSync('git tag -l "spec/*"', {
      cwd: workDir,
      encoding: 'utf8'
    }).trim();
    
    if (!tags) return [];
    
    return tags.split('\n').map(tag => {
      const match = tag.match(/^spec\/(.+)\/v(.+)$/);
      if (match) {
        return { artifact: match[1], version: match[2], tag };
      }
      return null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = {
  generateTag,
  getNextVersion,
  createVersionTag,
  injectVersion,
  listVersions
};
