/**
 * contract-checker.ts — Contract Validation port (T4.4.3, cluster L).
 *
 * Public surface
 * preserved verbatim by name + signature:
 *
 *   - `extractModelEntities(content)` => ModelEntity[]
 *   - `extractContractEntities(content)` => ContractEndpoint[]
 *   - `validateContracts(input)` => ValidationResult
 *
 * Invariants:
 *   - Uses `String.matchAll` (no stateful exec loops).
 *   - Default file paths: `specs/contracts.md`, `specs/data-model.md`.
 *   - Score: round(((totalChecks - issues) / totalChecks) * 100), pass when >= 70.
 *   - CLI entry-point intentionally omitted.
 *
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ModelField {
  name: string;
  type: string;
}

export interface ModelEntity {
  name: string;
  fields: ModelField[];
}

export interface ContractEndpoint {
  endpoint: string;
  entities: string[];
  fields: string[];
}

export interface ValidateInput {
  contracts?: string | undefined;
  data_model?: string | undefined;
  root?: string | undefined;
}

export interface ValidationResult {
  entities_in_model?: string[] | undefined;
  entities_in_contracts?: string[] | undefined;
  missing_in_contracts?: string[] | undefined;
  missing_in_model?: string[] | undefined;
  field_mismatches?: unknown[];
  endpoint_count?: number | undefined;
  score: number;
  pass: boolean;
  error?: string | undefined;
}

const FIELD_REGEX = /\|\s*`(\w+)`\s*\|\s*(\w+[\w\s[\]]*)\s*\|/g;
const FIELD_NAME_REGEX = /"(\w+)":/g;
const ENTITY_REF_REGEX = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)*)\b/g;

const RESERVED_FIELDS = new Set([
  'data',
  'meta',
  'errors',
  'error',
  'message',
  'code',
  'timestamp',
  'request_id',
  'field',
]);

const RESERVED_ENTITIES = new Set([
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Yes',
  'No',
  'Required',
  'Optional',
  'When',
  'Description',
  'Response',
  'Request',
  'Error',
]);

/**
 * Extract entity definitions from a data model document.
 */
export function extractModelEntities(content: string): ModelEntity[] {
  const entities: ModelEntity[] = [];
  const sections = content.split(/###\s+Entity:/);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    if (section === undefined) continue;
    const nameMatch = section.match(/^\s*(\w+)/);
    if (!nameMatch || nameMatch[1] === undefined) continue;

    const entity: ModelEntity = { name: nameMatch[1], fields: [] };
    for (const m of section.matchAll(FIELD_REGEX)) {
      if (m[1] === undefined || m[2] === undefined) continue;
      entity.fields.push({
        name: m[1],
        type: m[2].trim(),
      });
    }
    entities.push(entity);
  }

  return entities;
}

/**
 * Extract entity references from API contracts.
 */
export function extractContractEntities(content: string): ContractEndpoint[] {
  const endpoints: ContractEndpoint[] = [];
  const sections = content.split(/###\s+`/);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    if (section === undefined) continue;
    const headerMatch = section.match(/^(\w+)\s+([^`]+)`/);
    if (!headerMatch || headerMatch[1] === undefined || headerMatch[2] === undefined) continue;

    const endpoint = `${headerMatch[1]} ${headerMatch[2]}`;

    const fields: string[] = [];
    for (const m of section.matchAll(FIELD_NAME_REGEX)) {
      if (m[1] !== undefined && !RESERVED_FIELDS.has(m[1])) {
        fields.push(m[1]);
      }
    }

    const entities: string[] = [];
    for (const m of section.matchAll(ENTITY_REF_REGEX)) {
      if (m[1] !== undefined && !RESERVED_ENTITIES.has(m[1])) {
        entities.push(m[1]);
      }
    }

    endpoints.push({
      endpoint,
      entities: [...new Set(entities)],
      fields: [...new Set(fields)],
    });
  }

  return endpoints;
}

/**
 * Validate contracts against data model.
 */
export function validateContracts(input: ValidateInput): ValidationResult {
  const contracts = input.contracts || 'specs/contracts.md';
  const dataModel = input.data_model || 'specs/data-model.md';
  const root = input.root || '.';

  const contractsPath = resolve(root, contracts);
  const modelPath = resolve(root, dataModel);

  let contractsContent = '';
  let modelContent = '';

  if (!existsSync(contractsPath)) {
    return { error: `Cannot read contracts file: ${contractsPath}`, pass: false, score: 0 };
  }
  try {
    contractsContent = readFileSync(contractsPath, 'utf8');
  } catch {
    return { error: `Cannot read contracts file: ${contractsPath}`, pass: false, score: 0 };
  }

  if (!existsSync(modelPath)) {
    return { error: `Cannot read data model file: ${modelPath}`, pass: false, score: 0 };
  }
  try {
    modelContent = readFileSync(modelPath, 'utf8');
  } catch {
    return { error: `Cannot read data model file: ${modelPath}`, pass: false, score: 0 };
  }

  const modelEntities = extractModelEntities(modelContent);
  const contractEndpoints = extractContractEntities(contractsContent);

  const modelFieldNames = new Set(modelEntities.flatMap((e) => e.fields.map((f) => f.name)));

  const missingInContracts: string[] = [];
  for (const entity of modelEntities) {
    if (!contractsContent.toLowerCase().includes(entity.name.toLowerCase())) {
      missingInContracts.push(entity.name);
    }
  }

  const missingInModel: string[] = [];
  const allContractFields = new Set(contractEndpoints.flatMap((e) => e.fields));
  for (const field of allContractFields) {
    if (!modelFieldNames.has(field) && field.length > 2) {
      missingInModel.push(field);
    }
  }

  const fieldMismatches: unknown[] = [];

  const totalChecks = Math.max(1, modelEntities.length + allContractFields.size);
  const issues = missingInContracts.length + missingInModel.length + fieldMismatches.length;
  const score = Math.max(0, Math.round(((totalChecks - issues) / totalChecks) * 100));

  return {
    entities_in_model: modelEntities.map((e) => e.name),
    entities_in_contracts: [...new Set(contractEndpoints.flatMap((e) => e.entities))],
    missing_in_contracts: missingInContracts,
    missing_in_model: missingInModel,
    field_mismatches: fieldMismatches,
    endpoint_count: contractEndpoints.length,
    score,
    pass: score >= 70,
  };
}
