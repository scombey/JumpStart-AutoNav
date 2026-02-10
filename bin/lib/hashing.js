#!/usr/bin/env node

/**
 * hashing.js — Content-Addressable Specs.
 * 
 * Part of Jump Start Framework (Item 12: Content-Addressable Specs).
 * 
 * Uses SHA-256 content hashes to detect tampering and guarantee integrity.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Compute SHA-256 hash of file content.
 * 
 * @param {string} filePath - Path to the file.
 * @returns {string} Hex-encoded SHA-256 hash.
 */
function hashFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA-256 hash of a string.
 * 
 * @param {string} content - Content to hash.
 * @returns {string} Hex-encoded SHA-256 hash.
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Load or create the manifest file.
 * 
 * @param {string} manifestPath - Path to the manifest file.
 * @returns {object} Manifest object.
 */
function loadManifest(manifestPath) {
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }
  return {
    version: '1.0.0',
    generated: new Date().toISOString(),
    artifacts: {}
  };
}

/**
 * Save the manifest file.
 * 
 * @param {string} manifestPath - Path to save the manifest.
 * @param {object} manifest - Manifest object.
 */
function saveManifest(manifestPath, manifest) {
  manifest.lastUpdated = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * Register or update an artifact in the manifest.
 * 
 * @param {string} manifestPath - Path to the manifest.
 * @param {string} artifactPath - Relative path to the artifact.
 * @param {string} filePath - Absolute path to the artifact file.
 * @returns {{ hash: string, changed: boolean, previousHash: string|null }}
 */
function registerArtifact(manifestPath, artifactPath, filePath) {
  const manifest = loadManifest(manifestPath);
  const hash = hashFile(filePath);
  
  const previous = manifest.artifacts[artifactPath];
  const previousHash = previous ? previous.hash : null;
  const changed = previousHash !== hash;
  
  manifest.artifacts[artifactPath] = {
    hash,
    lastVerified: new Date().toISOString(),
    size: fs.statSync(filePath).size
  };
  
  saveManifest(manifestPath, manifest);
  
  return { hash, changed, previousHash };
}

/**
 * Verify all artifacts in the manifest against their current content.
 * 
 * @param {string} manifestPath - Path to the manifest.
 * @param {string} baseDir - Base directory for resolving artifact paths.
 * @returns {{ verified: number, tampered: object[], missing: string[], summary: string }}
 */
function verifyAll(manifestPath, baseDir) {
  const manifest = loadManifest(manifestPath);
  const tampered = [];
  const missing = [];
  let verified = 0;
  
  for (const [artifactPath, entry] of Object.entries(manifest.artifacts)) {
    const fullPath = path.resolve(baseDir, artifactPath);
    
    if (!fs.existsSync(fullPath)) {
      missing.push(artifactPath);
      continue;
    }
    
    const currentHash = hashFile(fullPath);
    if (currentHash !== entry.hash) {
      tampered.push({
        path: artifactPath,
        expectedHash: entry.hash,
        actualHash: currentHash
      });
    } else {
      verified++;
    }
  }
  
  const total = Object.keys(manifest.artifacts).length;
  const summary = tampered.length === 0 && missing.length === 0
    ? `All ${verified} artifact(s) verified successfully.`
    : `${verified}/${total} verified. ${tampered.length} tampered. ${missing.length} missing.`;
  
  return { verified, tampered, missing, summary };
}

module.exports = {
  hashFile,
  hashContent,
  loadManifest,
  saveManifest,
  registerArtifact,
  verifyAll
};
