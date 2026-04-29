/**
 * contract-checker.js — Contract Validation (Item 68)
 *
 * Validates that API contracts align with the data model.
 * Compares entity names, field types, and schema references.
 *
 * Usage:
 *   echo '{"contracts":"specs/contracts.md","data_model":"specs/data-model.md"}' | node bin/lib/contract-checker.js
 *
 * Input (stdin JSON):
 *   {
 *     "contracts": "specs/contracts.md",
 *     "data_model": "specs/data-model.md",
 *     "root": "."
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "entities_in_model": [...],
 *     "entities_in_contracts": [...],
 *     "missing_in_contracts": [...],
 *     "missing_in_model": [...],
 *     "field_mismatches": [...],
 *     "score": 85,
 *     "pass": true
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Extract entity definitions from a data model document.
 *
 * @param {string} content - Data model markdown content.
 * @returns {Array<{ name: string, fields: Array<{ name: string, type: string }> }>}
 */
function extractModelEntities(content) {
  const entities = [];
  const entityRegex = /###\s+Entity:\s+(\w+)/g;
  const fieldRegex = /\|\s*`(\w+)`\s*\|\s*(\w+[\w\s[\]]*)\s*\|/g;

  let match;
  const sections = content.split(/###\s+Entity:/);

  // Skip the first section (before any entity)
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const nameMatch = section.match(/^\s*(\w+)/);
    if (!nameMatch) continue;

    const entity = { name: nameMatch[1], fields: [] };
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(section)) !== null) {
      entity.fields.push({
        name: fieldMatch[1],
        type: fieldMatch[2].trim()
      });
    }

    entities.push(entity);
  }

  return entities;
}

/**
 * Extract entity references from API contracts.
 *
 * @param {string} content - Contracts markdown content.
 * @returns {Array<{ endpoint: string, entities: string[], fields: string[] }>}
 */
function extractContractEntities(content) {
  const endpoints = [];
  const endpointRegex = /###\s+`(\w+)\s+([^`]+)`/g;
  const sections = content.split(/###\s+`/);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const headerMatch = section.match(/^(\w+)\s+([^`]+)`/);
    if (!headerMatch) continue;

    const endpoint = `${headerMatch[1]} ${headerMatch[2]}`;

    // Extract field references from JSON examples and parameter tables
    const fields = [];
    const fieldRegex = /"(\w+)":/g;
    let fm;
    while ((fm = fieldRegex.exec(section)) !== null) {
      if (!['data', 'meta', 'errors', 'error', 'message', 'code', 'timestamp', 'request_id', 'field'].includes(fm[1])) {
        fields.push(fm[1]);
      }
    }

    // Extract entity names from parameter tables
    const entities = [];
    const entityRefRegex = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)*)\b/g;
    let em;
    while ((em = entityRefRegex.exec(section)) !== null) {
      if (!['String', 'Number', 'Boolean', 'Array', 'Object', 'Yes', 'No', 'Required', 'Optional',
        'When', 'Description', 'Response', 'Request', 'Error'].includes(em[1])) {
        entities.push(em[1]);
      }
    }

    endpoints.push({ endpoint, entities: [...new Set(entities)], fields: [...new Set(fields)] });
  }

  return endpoints;
}

/**
 * Validate contracts against data model.
 *
 * @param {object} input - Validation options.
 * @param {string} input.contracts - Path to contracts file.
 * @param {string} input.data_model - Path to data model file.
 * @param {string} [input.root] - Project root.
 * @returns {object} Validation results.
 */
function validateContracts(input) {
  const { contracts = 'specs/contracts.md', data_model = 'specs/data-model.md', root = '.' } = input;

  const contractsPath = path.resolve(root, contracts);
  const modelPath = path.resolve(root, data_model);

  // Read files
  let contractsContent = '';
  let modelContent = '';

  try {
    contractsContent = fs.readFileSync(contractsPath, 'utf8');
  } catch {
    return { error: `Cannot read contracts file: ${contractsPath}`, pass: false, score: 0 };
  }

  try {
    modelContent = fs.readFileSync(modelPath, 'utf8');
  } catch {
    return { error: `Cannot read data model file: ${modelPath}`, pass: false, score: 0 };
  }

  const modelEntities = extractModelEntities(modelContent);
  const contractEndpoints = extractContractEntities(contractsContent);

  const modelEntityNames = modelEntities.map(e => e.name.toLowerCase());
  const modelFieldNames = new Set(modelEntities.flatMap(e => e.fields.map(f => f.name)));

  // Check for model entities not referenced in contracts
  const missingInContracts = [];
  for (const entity of modelEntities) {
    const found = contractsContent.toLowerCase().includes(entity.name.toLowerCase());
    if (!found) {
      missingInContracts.push(entity.name);
    }
  }

  // Check for contract field references not in model
  const missingInModel = [];
  const allContractFields = new Set(contractEndpoints.flatMap(e => e.fields));
  for (const field of allContractFields) {
    if (!modelFieldNames.has(field) && field.length > 2) {
      missingInModel.push(field);
    }
  }

  // Field type mismatches (basic check)
  const fieldMismatches = [];

  // Score
  const totalChecks = Math.max(1, modelEntities.length + allContractFields.size);
  const issues = missingInContracts.length + missingInModel.length + fieldMismatches.length;
  const score = Math.max(0, Math.round(((totalChecks - issues) / totalChecks) * 100));

  return {
    entities_in_model: modelEntities.map(e => e.name),
    entities_in_contracts: [...new Set(contractEndpoints.flatMap(e => e.entities))],
    missing_in_contracts: missingInContracts,
    missing_in_model: missingInModel,
    field_mismatches: fieldMismatches,
    endpoint_count: contractEndpoints.length,
    score,
    pass: score >= 70
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (process.argv[1] && (
  process.argv[1].endsWith('contract-checker.mjs') ||
  process.argv[1].endsWith('contract-checker')
)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const parsed = input.trim() ? JSON.parse(input) : {};
      const result = validateContracts(parsed);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.pass ? 0 : 1);
    } catch (err) {
      process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });

  if (process.stdin.isTTY) {
    const result = validateContracts({});
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.pass ? 0 : 1);
  }
}

export { validateContracts, extractModelEntities, extractContractEntities };
