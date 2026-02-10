#!/usr/bin/env node

/**
 * anti-abstraction.js — Anti-Abstraction Gate.
 * 
 * Part of Jump Start Framework (Item 10: Anti-Abstraction Gate).
 * 
 * Flags wrapper code that obscures native framework capabilities.
 * Requires ADR justification for new abstraction layers.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Patterns that suggest unnecessary abstraction/wrapping.
 */
const WRAPPER_PATTERNS = [
  {
    name: 'thin_wrapper_class',
    pattern: /class\s+\w*(?:Wrapper|Adapter|Proxy|Helper|Manager|Handler|Facade)\b/g,
    description: 'Class name suggests a thin wrapper pattern',
    severity: 'warning'
  },
  {
    name: 're_export',
    pattern: /module\.exports\s*=\s*require\(['"][^'"]+['"]\)/g,
    description: 'Re-exports another module without transformation',
    severity: 'info'
  },
  {
    name: 'passthrough_function',
    pattern: /(?:async\s+)?function\s+\w+\([^)]*\)\s*\{\s*return\s+\w+\.\w+\([^)]*\)\s*;?\s*\}/g,
    description: 'Function appears to be a passthrough to another function',
    severity: 'warning'
  },
  {
    name: 'util_barrel',
    pattern: /\/\*\*[\s\S]*?utility[\s\S]*?\*\/[\s\S]*?module\.exports/gi,
    description: 'Generic utility module (may need decomposition)',
    severity: 'info'
  }
];

/**
 * Scan a source file for anti-abstraction patterns.
 * 
 * @param {string} filePath - Path to the source file.
 * @returns {{ file: string, findings: object[] }}
 */
function scanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { file: filePath, findings: [] };
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const findings = [];
  
  for (const pattern of WRAPPER_PATTERNS) {
    const matches = content.match(pattern.pattern);
    if (matches) {
      for (const match of matches) {
        // Find line number
        const index = content.indexOf(match);
        const lineNumber = content.substring(0, index).split('\n').length;
        
        findings.push({
          pattern: pattern.name,
          description: pattern.description,
          severity: pattern.severity,
          line: lineNumber,
          match: match.substring(0, 100) // Truncate long matches
        });
      }
    }
  }
  
  return { file: filePath, findings };
}

/**
 * Recursively scan a directory for anti-abstraction patterns.
 * 
 * @param {string} dirPath - Directory to scan.
 * @param {object} [options] - Scan options.
 * @param {string[]} [options.extensions] - File extensions to scan.
 * @param {string[]} [options.excludeDirs] - Directories to skip.
 * @returns {{ files: object[], totalFindings: number, summary: string }}
 */
function scanDirectory(dirPath, options = {}) {
  const {
    extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb'],
    excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next']
  } = options;
  
  const results = [];
  let totalFindings = 0;
  
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          const result = scanFile(fullPath);
          if (result.findings.length > 0) {
            results.push(result);
            totalFindings += result.findings.length;
          }
        }
      }
    }
  }
  
  walk(dirPath);
  
  const summary = totalFindings === 0
    ? 'No anti-abstraction patterns detected.'
    : `Found ${totalFindings} potential abstraction issue(s) across ${results.length} file(s).`;
  
  return { files: results, totalFindings, summary };
}

/**
 * Check if an ADR exists justifying a specific abstraction.
 * 
 * @param {string} abstractionName - Name of the abstraction.
 * @param {string} decisionsDir - Path to ADR directory.
 * @returns {boolean} True if a relevant ADR exists.
 */
function hasJustification(abstractionName, decisionsDir) {
  if (!fs.existsSync(decisionsDir)) return false;
  
  const files = fs.readdirSync(decisionsDir);
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = fs.readFileSync(path.join(decisionsDir, file), 'utf8');
    if (content.toLowerCase().includes(abstractionName.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

module.exports = {
  WRAPPER_PATTERNS,
  scanFile,
  scanDirectory,
  hasJustification
};
