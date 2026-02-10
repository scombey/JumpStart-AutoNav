#!/usr/bin/env node

/**
 * validator.js — Schema Enforcement for Jump Start artifacts.
 * 
 * Part of Jump Start Framework (Item 5: Schema Enforcement).
 * 
 * Validates artifact structures against JSON schemas to prevent
 * "vibe-coding" and ensure template compliance.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load a JSON schema from the schemas directory.
 * 
 * @param {string} schemaName - Schema filename (e.g., 'spec-metadata.schema.json').
 * @param {string} [schemasDir] - Path to schemas directory.
 * @returns {object} Parsed schema.
 */
function loadSchema(schemaName, schemasDir) {
  const dir = schemasDir || path.join(__dirname, '..', '..', '.jumpstart', 'schemas');
  const schemaPath = path.join(dir, schemaName);
  
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema not found: ${schemaPath}`);
  }
  
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

/**
 * Extract YAML frontmatter from a markdown file.
 * 
 * @param {string} content - File content.
 * @returns {object|null} Parsed frontmatter or null if not found.
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  
  // Simple YAML parser for frontmatter (key: value pairs)
  const frontmatter = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey = null;
  let currentList = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // List item
    if (trimmed.startsWith('- ') && currentKey) {
      if (!currentList) {
        currentList = [];
        frontmatter[currentKey] = currentList;
      }
      currentList.push(trimmed.slice(2).trim());
      continue;
    }
    
    // Key-value pair
    const kvMatch = trimmed.match(/^(\w[\w_-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      currentList = null;
      
      if (value === '' || value === '[]') {
        frontmatter[currentKey] = value === '[]' ? [] : null;
      } else if (value === 'true') {
        frontmatter[currentKey] = true;
      } else if (value === 'false') {
        frontmatter[currentKey] = false;
      } else if (value === 'null') {
        frontmatter[currentKey] = null;
      } else if (/^-?\d+(\.\d+)?$/.test(value)) {
        frontmatter[currentKey] = parseFloat(value);
      } else {
        // Remove surrounding quotes if present
        frontmatter[currentKey] = value.replace(/^["']|["']$/g, '');
      }
    }
  }
  
  return frontmatter;
}

/**
 * Validate an object against a simple schema definition.
 * A lightweight validator that checks for required fields, types, enums,
 * patterns, $ref, minLength, minItems, minimum, maximum, format, and
 * nested objects/arrays.
 * 
 * @param {object} data - Data to validate.
 * @param {object} schema - JSON schema object.
 * @param {string} [schemasDir] - Directory containing schemas for $ref resolution.
 * @param {string} [prefix] - Key prefix for nested error messages.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(data, schema, schemasDir, prefix) {
  const errors = [];
  const pfx = prefix ? `${prefix}.` : '';
  
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [`${pfx || ''}Data must be an object`] };
  }

  // Resolve $ref if present — merge referenced schema into current
  let resolved = schema;
  if (schema.$ref && schemasDir) {
    try {
      const refSchema = loadSchema(path.basename(schema.$ref), schemasDir);
      // Merge: refSchema provides base, current schema overrides
      resolved = { ...refSchema, ...schema };
      delete resolved.$ref;
      // Merge properties
      if (refSchema.properties || schema.properties) {
        resolved.properties = { ...(refSchema.properties || {}), ...(schema.properties || {}) };
      }
      // Merge required
      if (refSchema.required || schema.required) {
        resolved.required = [...new Set([...(refSchema.required || []), ...(schema.required || [])])];
      }
    } catch (err) {
      errors.push(`Could not resolve $ref '${schema.$ref}': ${err.message}`);
    }
  }
  
  // Check required fields
  if (resolved.required && Array.isArray(resolved.required)) {
    for (const field of resolved.required) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        errors.push(`Missing required field: ${pfx}${field}`);
      }
    }
  }
  
  // Check property types and constraints
  if (resolved.properties) {
    for (const [key, propSchema] of Object.entries(resolved.properties)) {
      if (data[key] === undefined || data[key] === null) continue;
      
      const value = data[key];
      const fieldPath = `${pfx}${key}`;
      
      // Type check
      if (propSchema.type) {
        const expectedTypes = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        
        // Check if value matches any of the allowed types
        const typeMatch = expectedTypes.some(t => {
          if (t === 'integer') return typeof value === 'number' && Number.isInteger(value);
          if (t === 'null') return value === null;
          return t === actualType;
        });
        
        if (!typeMatch) {
          errors.push(`Field '${fieldPath}' expected type '${expectedTypes.join('|')}', got '${actualType}'`);
          continue; // Skip further checks if type is wrong
        }
      }
      
      // Enum check
      if (propSchema.enum && !propSchema.enum.includes(value)) {
        errors.push(`Field '${fieldPath}' must be one of: ${propSchema.enum.join(', ')}`);
      }
      
      // Pattern check
      if (propSchema.pattern && typeof value === 'string') {
        const regex = new RegExp(propSchema.pattern);
        if (!regex.test(value)) {
          errors.push(`Field '${fieldPath}' does not match pattern: ${propSchema.pattern}`);
        }
      }

      // minLength check
      if (propSchema.minLength !== undefined && typeof value === 'string') {
        if (value.length < propSchema.minLength) {
          errors.push(`Field '${fieldPath}' must be at least ${propSchema.minLength} characters`);
        }
      }

      // minimum / maximum checks (number)
      if (propSchema.minimum !== undefined && typeof value === 'number') {
        if (value < propSchema.minimum) {
          errors.push(`Field '${fieldPath}' must be >= ${propSchema.minimum}`);
        }
      }
      if (propSchema.maximum !== undefined && typeof value === 'number') {
        if (value > propSchema.maximum) {
          errors.push(`Field '${fieldPath}' must be <= ${propSchema.maximum}`);
        }
      }

      // format check (date)
      if (propSchema.format === 'date' && typeof value === 'string') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          errors.push(`Field '${fieldPath}' must be a valid date (YYYY-MM-DD)`);
        }
      }

      // Array-specific checks
      if (Array.isArray(value)) {
        // minItems
        if (propSchema.minItems !== undefined && value.length < propSchema.minItems) {
          errors.push(`Field '${fieldPath}' must have at least ${propSchema.minItems} item(s) (minItems: ${propSchema.minItems})`);
        }
        // Validate array items if items schema exists
        if (propSchema.items && propSchema.items.type === 'object' && propSchema.items.properties) {
          value.forEach((item, idx) => {
            if (typeof item === 'object' && item !== null) {
              const nested = validate(item, propSchema.items, schemasDir, `${fieldPath}[${idx}]`);
              errors.push(...nested.errors);
            }
          });
        }
      }

      // Nested object validation
      if (typeof value === 'object' && !Array.isArray(value) && propSchema.properties) {
        const nested = validate(value, propSchema, schemasDir, fieldPath);
        errors.push(...nested.errors);
      }

      // Nested $ref for object properties
      if (typeof value === 'object' && !Array.isArray(value) && propSchema.$ref && schemasDir) {
        try {
          const refSchema = loadSchema(path.basename(propSchema.$ref), schemasDir);
          const nested = validate(value, refSchema, schemasDir, fieldPath);
          errors.push(...nested.errors);
        } catch (err) {
          errors.push(`Could not resolve $ref for '${fieldPath}': ${err.message}`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate markdown structural elements (H2 heading hierarchy).
 * Checks that expected sections exist in the document.
 *
 * @param {string} content - Markdown content.
 * @param {string[]} expectedSections - Expected H2 section names.
 * @returns {{ present: string[], missing: string[] }}
 */
function validateMarkdownStructure(content, expectedSections) {
  const headers = (content.match(/^## .+$/gm) || [])
    .map(h => h.replace(/^## /, '').trim().toLowerCase());
  
  const present = [];
  const missing = [];
  
  for (const section of expectedSections) {
    const sectionLower = section.toLowerCase();
    if (headers.some(h => h.includes(sectionLower))) {
      present.push(section);
    } else {
      missing.push(section);
    }
  }
  
  return { present, missing };
}

/**
 * Validate a markdown artifact file against its schema.
 * Extracts frontmatter and validates structure.
 * 
 * @param {string} filePath - Path to the markdown file.
 * @param {string} schemaName - Schema to validate against.
 * @param {string} [schemasDir] - Optional schemas directory.
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateArtifact(filePath, schemaName, schemasDir) {
  const warnings = [];
  
  if (!fs.existsSync(filePath)) {
    return { valid: false, errors: [`File not found: ${filePath}`], warnings };
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for frontmatter
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) {
    warnings.push('No YAML frontmatter found in artifact');
  }
  
  // Check for required sections (H2 headers)
  const headers = content.match(/^## .+$/gm) || [];
  const headerNames = headers.map(h => h.replace('## ', '').trim());
  
  // Check for Phase Gate Approval section
  if (!headerNames.some(h => h.includes('Phase Gate'))) {
    warnings.push('Missing "Phase Gate Approval" section');
  }
  
  // Check for bracket placeholders
  const placeholders = content.match(/\[(?:DATE|NAME|DESCRIPTION|TODO|TBD|PLACEHOLDER)\]/gi);
  if (placeholders) {
    warnings.push(`Found ${placeholders.length} unresolved placeholder(s): ${[...new Set(placeholders)].join(', ')}`);
  }
  
  // Validate frontmatter against schema if both exist
  let schemaResult = { valid: true, errors: [] };
  if (frontmatter && schemaName) {
    try {
      const schema = loadSchema(schemaName, schemasDir);
      schemaResult = validate(frontmatter, schema);
    } catch (err) {
      warnings.push(`Could not load schema '${schemaName}': ${err.message}`);
    }
  }
  
  return {
    valid: schemaResult.valid,
    errors: schemaResult.errors,
    warnings
  };
}

/**
 * Check if an artifact has been approved (Phase Gate section).
 * 
 * @param {string} filePath - Path to the artifact.
 * @returns {{ approved: boolean, approver: string|null, date: string|null }}
 */
function checkApproval(filePath) {
  if (!fs.existsSync(filePath)) {
    return { approved: false, approver: null, date: null };
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Find Phase Gate section
  const gateMatch = content.match(/## Phase Gate Approval[\s\S]*?(?=\n## |\n---\s*$|$)/);
  if (!gateMatch) {
    return { approved: false, approver: null, date: null };
  }
  
  const gateSection = gateMatch[0];
  
  // Check all checkboxes are checked
  const unchecked = gateSection.match(/- \[ \]/g);
  const checked = gateSection.match(/- \[x\]/gi);
  
  // Extract approver
  const approverMatch = gateSection.match(/\*\*Approved by:\*\*\s*(.+)/);
  const approver = approverMatch ? approverMatch[1].trim() : null;
  
  // Extract date
  const dateMatch = gateSection.match(/\*\*Approval date:\*\*\s*(.+)/);
  const date = dateMatch ? dateMatch[1].trim() : null;
  
  const approved = !unchecked && checked && checked.length > 0 && 
                   approver && approver !== 'Pending' &&
                   date && date !== 'Pending';
  
  return { approved, approver, date };
}

/**
 * Validate a custom agent definition file against the agent-template structure (Item 92).
 * Checks for required sections: Identity, Mandate, Activation, Protocol, Phase Gate.
 * 
 * @param {string} filePath — path to the agent markdown file
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateAgentDefinition(filePath) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(filePath)) {
    return { valid: false, errors: ['File not found: ' + filePath], warnings: [] };
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Required sections
  const requiredSections = ['Identity', 'Mandate', 'Activation'];
  for (const section of requiredSections) {
    const pattern = new RegExp('^##\\s+.*' + section, 'im');
    if (!pattern.test(content)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  // Check for Phase Gate section
  if (!/Phase Gate/i.test(content)) {
    warnings.push('Missing "Phase Gate" section — recommended for gated agents');
  }

  // Check for H1 title
  if (!/^# .+/m.test(content)) {
    errors.push('Missing H1 title (e.g., "# Agent: The <Name>")');
  }

  // Check for Never Guess rule mention
  if (!/Never Guess|NEEDS CLARIFICATION/i.test(content)) {
    warnings.push('Consider adding the "Never Guess Rule" reference (Item 69)');
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
  loadSchema,
  extractFrontmatter,
  validate,
  validateArtifact,
  validateMarkdownStructure,
  checkApproval,
  validateAgentDefinition
};
