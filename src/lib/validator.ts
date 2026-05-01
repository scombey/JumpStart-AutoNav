/**
 * validator.ts — schema-enforcement library port (T4.2.2).
 *
 * Public surface preserved
 * verbatim by name + signature for byte-identical drop-in compatibility:
 *
 * - `loadSchema(name, dir?)`
 * - `extractFrontmatter(content)`
 * - `validate(data, schema, schemasDir?, prefix?)`
 * - `validateArtifact(filePath, schemaName, schemasDir?)`
 * - `validateMarkdownStructure(content, expectedSections)`
 * - `checkApproval(filePath)`
 * - `validateAgentDefinition(filePath)`
 *
 * **Zod-primary, JSON-Schema-walker fallback (per T4.2.2 plan).**
 * The generated Zod schemas in `src/schemas/generated/` are the
 * PRIMARY validation path: when `validate()` receives a schema whose
 * `$id` matches a canonical generated schema (e.g.
 * `jumpstart://spec-metadata`), it routes through the Zod schema
 * for richer error messages and brand-friendly types. For inline /
 * custom / unknown schemas the legacy hand-rolled walker stays
 * active — preserves v0 compatibility for every caller that hands
 * `validate()` an ad-hoc schema literal (the test fixtures in
 * `tests/test-schema.test.js` rely on this for ~10 of their
 * inline-schema cases).
 *
 * **Error contract.** Returns `{valid, errors}` plain object — same as
 * legacy. Does NOT throw `ValidationError`; this is a leaf-utility
 * that lets callers decide whether to throw or surface inline. The
 * IPC envelope at the trust boundary (`runIpc`) translates returns
 * into typed errors.
 *
 * @see src/schemas/generated/* (Zod codegen)
 * @see specs/decisions/adr-004-schema-direction.md
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZodType } from 'zod';
import * as generated from '../schemas/generated/index.js';

// Resolve this module's on-disk directory under pure ESM. `__dirname`
// is not a binding in ESM, so we synthesize it from `import.meta.url`
// — the canonical ESM equivalent.
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// Pit Crew M3 Adversary F9 + F2: forbidden frontmatter keys that
// would pollute the prototype chain of the returned object.
const FORBIDDEN_FRONTMATTER_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

/** Plain JSON Schema 7 value (recursive). The walker accepts arbitrary
 * unknown-shape inputs; precise typing isn't worth the maintenance cost
 * for a JS-compat layer. */
export type JSONSchema = Record<string, unknown>;

export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
}

export interface ArtifactValidationOutcome {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface MarkdownStructureOutcome {
  present: string[];
  missing: string[];
}

export interface ApprovalCheckOutcome {
  approved: boolean;
  approver: string | null;
  date: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// $id → generated Zod-schema map (built once at module load).
//
// The generated barrel exports a `*Schema` constant for every JSON
// Schema in `.jumpstart/schemas/`. We index them by the JSON-Schema
// `$id` so `validate()` can detect "this is a known canonical schema"
// in O(1).
// ─────────────────────────────────────────────────────────────────────────

interface ZodMapEntry {
  schema: ZodType<unknown>;
  schemaName: string;
}

function buildIdToZodMap(): Map<string, ZodMapEntry> {
  // Map of $id → generated Zod export. Built by reading the canonical
  // JSON-Schema files and pairing them with the matching `*Schema`
  // export. Fails-soft on entries without a matching export so a new
  // .schema.json that hasn't been re-codegen'd yet doesn't crash this
  // module at load time.
  //
  // Pit Crew M3 Reviewer H6: previously used inline `require('node:fs')`
  // which breaks under ESM-strict tooling. Now uses the static imports
  // (readdirSync, readFileSync) declared at module top so dual-mode
  // consumers get the same code path.
  const result = new Map<string, ZodMapEntry>();
  const schemasDir = path.join(MODULE_DIR, '..', '..', '.jumpstart', 'schemas');
  if (!existsSync(schemasDir)) return result;
  const filenames = readdirSync(schemasDir).filter((f) => f.endsWith('.schema.json'));
  for (const filename of filenames) {
    const stem = filename.replace(/\.schema\.json$/, '');
    const pascal = stem
      .split(/[-_]/)
      .map((p) => (p.length === 0 ? '' : (p[0] ?? '').toUpperCase() + p.slice(1)))
      .join('');
    const exportName = `${pascal}Schema`;
    const zodSchema = (generated as Record<string, unknown>)[exportName];
    if (!zodSchema) continue;
    try {
      const json = JSON.parse(readFileSync(path.join(schemasDir, filename), 'utf8')) as {
        $id?: string;
      };
      if (typeof json.$id === 'string') {
        result.set(json.$id, { schema: zodSchema as ZodType<unknown>, schemaName: filename });
      }
    } catch {
      // Malformed JSON — skip; the codegen-fresh CI gate catches this.
    }
  }
  return result;
}

const ID_TO_ZOD = buildIdToZodMap();

/**
 * Test-only: re-build the $id → Zod map. Used by tests that need
 * deterministic state when toggling generated-schema availability
 * (rarely needed, but exposed for parity with the legacy `loadSchema`
 * cache pattern).
 */
export function _rebuildZodMap(): void {
  ID_TO_ZOD.clear();
  for (const [k, v] of buildIdToZodMap().entries()) ID_TO_ZOD.set(k, v);
}

// ─────────────────────────────────────────────────────────────────────────
// Implementation — verbatim port of bin/lib/validator.js
// ─────────────────────────────────────────────────────────────────────────

/**
 * Load a JSON schema from the schemas directory. Throws if the file
 * doesn't exist (matches legacy behavior — the CLI lifts this into
 * an exit code).
 */
export function loadSchema(schemaName: string, schemasDir?: string): JSONSchema {
  const dir = schemasDir || path.join(MODULE_DIR, '..', '..', '.jumpstart', 'schemas');

  // Pit Crew M3 Adversary F1 (BLOCKER, confirmed exploit): the legacy
  // `loadSchema('../../etc/passwd', dir)` would `path.join` the
  // traversal into a real read of /etc/passwd. JSON.parse then throws,
  // BUT the file IS read, leaking timing/error data. Defense:
  // (a) reject names containing `..` segments
  // (b) reject absolute names
  // (c) require the resolved path to live inside `dir`
  const resolvedDir = path.resolve(dir);
  const resolvedSchema = path.resolve(dir, schemaName);
  if (
    schemaName.includes('..') ||
    path.isAbsolute(schemaName) ||
    schemaName.includes('\0') ||
    !(resolvedSchema === resolvedDir || resolvedSchema.startsWith(`${resolvedDir}${path.sep}`))
  ) {
    throw new Error(`Schema not found: ${path.join(dir, schemaName)}`);
  }

  if (!existsSync(resolvedSchema)) {
    throw new Error(`Schema not found: ${resolvedSchema}`);
  }

  return JSON.parse(readFileSync(resolvedSchema, 'utf8')) as JSONSchema;
}

/**
 * Extract YAML frontmatter from a markdown file. Hand-rolled parser
 * preserved verbatim from the legacy module — the unified `yaml`
 * package would change behavior on edge cases (boolean `yes`/`no`,
 * scientific-notation numbers, anchors) that the existing test
 * fixtures explicitly DO NOT exercise. Strangler-fig caveat:
 * `bin/lib/config-loader.ts` (T4.1.9) DID port to the yaml package
 * because its callers tolerate richer parsing; here we keep the
 * simple parser.
 */
export function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const frontmatter: Record<string, unknown> = {};
  const fmBody = match[1] ?? '';
  const lines = fmBody.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

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
      const matchedKey = kvMatch[1];
      const matchedValue = kvMatch[2];
      if (matchedKey === undefined || matchedValue === undefined) continue;
      // Pit Crew M3 Adversary F9: skip __proto__/constructor/prototype.
      // These are not legal frontmatter keys for jumpstart artifacts;
      // accepting them creates a prototype-pollution vector for any
      // downstream consumer that does `Object.entries(frontmatter)` or
      // shape-based lookups.
      if (FORBIDDEN_FRONTMATTER_KEYS.has(matchedKey)) {
        currentKey = null;
        currentList = null;
        continue;
      }
      currentKey = matchedKey;
      const value = matchedValue.trim();
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
        frontmatter[currentKey] = Number.parseFloat(value);
      } else {
        // Remove surrounding quotes if present
        frontmatter[currentKey] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  return frontmatter;
}

/**
 * Validate `data` against `schema`. Preserves the legacy `{valid,
 * errors}` shape verbatim.
 *
 * **Zod-primary path:** when `schema.$id` matches a known canonical
 * (`jumpstart://*`), the generated Zod schema validates first and
 * the legacy walker is bypassed. Zod issues are mapped to the same
 * `errors[]` string shape so callers see drop-in identical output.
 *
 * **Walker fallback:** for any schema without a matching `$id` (inline
 * literals, ad-hoc tests, custom schemas), the hand-rolled walker
 * runs — same logic as legacy. This preserves v0 compat for every
 * caller in `tests/test-schema.test.js` that hands `validate` a
 * literal schema.
 */
export function validate(
  data: unknown,
  schema: JSONSchema,
  schemasDir?: string,
  prefix?: string
): ValidationOutcome {
  // Zod-primary route: only when the schema is one of our canonical
  // generated schemas (matched by $id). Inline schemas keep the
  // legacy walker — see fallback below.
  const $id = typeof schema.$id === 'string' ? schema.$id : null;
  if ($id && ID_TO_ZOD.has($id) && !prefix) {
    const entry = ID_TO_ZOD.get($id) as ZodMapEntry;
    const result = entry.schema.safeParse(data);
    if (result.success) {
      return { valid: true, errors: [] };
    }
    // Map Zod issues to the legacy walker's error-string shape.
    const errors = result.error.issues.map((issue) => formatZodIssue(issue));
    return { valid: false, errors };
  }

  return walkValidate(data, schema, schemasDir, prefix);
}

/**
 * Format a Zod issue to match the legacy walker's "Field 'foo.bar'
 * <reason>" shape so consumers grep-able by substring still work.
 * Falls back to Zod's native message when no field-prefix mapping is
 * obvious (e.g. union failures at the root).
 */
function formatZodIssue(issue: {
  path: PropertyKey[];
  message: string;
  code: string;
  expected?: unknown;
  received?: unknown;
}): string {
  // PropertyKey includes symbol — guard so String(symbol) doesn't
  // surface "Symbol(...)" in our error string. In practice Zod issues
  // never carry symbol-keyed paths because schemas are JSON-shaped,
  // but the type narrowing keeps tsc happy.
  const fieldPath = issue.path
    .map((p) => (typeof p === 'symbol' ? (p.description ?? '') : String(p)))
    .join('.');
  if (!fieldPath) return issue.message;
  // Mirror legacy phrasings for the four error types `tests/test-
  // schema.test.js` greps for: type / enum / pattern / required /
  // minimum / maximum / minItems / minLength / format.
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined') {
        return `Missing required field: ${fieldPath}`;
      }
      return `Field '${fieldPath}' expected type '${String(issue.expected)}', got '${String(issue.received)}'`;
    case 'invalid_value':
    case 'invalid_enum_value':
      return `Field '${fieldPath}' must be one of: ${issue.message}`;
    case 'invalid_string':
      return `Field '${fieldPath}' ${issue.message}`;
    case 'too_small':
      return `Field '${fieldPath}' ${issue.message}`;
    case 'too_big':
      return `Field '${fieldPath}' ${issue.message}`;
    default:
      return `Field '${fieldPath}' ${issue.message}`;
  }
}

/**
 * Hand-rolled JSON Schema walker (verbatim port of legacy validate()).
 * Handles required, type, enum, pattern, minLength, minimum, maximum,
 * format=date, minItems, items.<schema>, properties.<schema> nested,
 * and $ref resolution against `schemasDir`.
 */
function walkValidate(
  data: unknown,
  schema: JSONSchema,
  schemasDir?: string,
  prefix?: string
): ValidationOutcome {
  const errors: string[] = [];
  const pfx = prefix ? `${prefix}.` : '';

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [`${pfx || ''}Data must be an object`] };
  }
  const dataObj = data as Record<string, unknown>;

  // Resolve $ref if present — merge referenced schema into current.
  //
  // Pit Crew M3 Adversary F8: tighten the $ref allowlist. Legacy
  // accepted any basename, allowing an attacker who controls
  // schemasDir contents to point `$ref` at any sibling JSON file
  // (e.g. an uploaded snapshot fixture). Now require the $ref target
  // to end with `.schema.json` — matching the canonical naming
  // convention enforced by `scripts/generate-zod-schemas.mjs`.
  let resolved = schema;
  if (typeof schema.$ref === 'string' && schemasDir) {
    const refBasename = path.basename(schema.$ref);
    if (!refBasename.endsWith('.schema.json')) {
      errors.push(
        `Could not resolve $ref '${String(schema.$ref)}': $ref target must end with '.schema.json' (Pit Crew M3 Adv F8 — confused-deputy defense).`
      );
    } else {
      try {
        const refSchema = loadSchema(refBasename, schemasDir);
        const refProps =
          (refSchema.properties as Record<string, JSONSchema> | undefined) || undefined;
        const ownProps = (schema.properties as Record<string, JSONSchema> | undefined) || undefined;
        resolved = { ...refSchema, ...schema };
        // Strip $ref from the merged schema so downstream walkers don't
        // re-resolve. Setting to undefined (vs delete) keeps the key in
        // the object but with undefined value — equivalent for the
        // legacy walker's `if (resolved.$ref && schemasDir)` check on
        // nested properties.
        resolved.$ref = undefined;
        if (refProps || ownProps) {
          resolved.properties = { ...(refProps || {}), ...(ownProps || {}) };
        }
        const refReq = (refSchema.required as string[] | undefined) || [];
        const ownReq = (schema.required as string[] | undefined) || [];
        if (refReq.length || ownReq.length) {
          resolved.required = Array.from(new Set([...refReq, ...ownReq]));
        }
      } catch (err) {
        errors.push(`Could not resolve $ref '${String(schema.$ref)}': ${(err as Error).message}`);
      }
    } // close `else` from F8 allowlist guard
  }

  // Check required fields
  if (Array.isArray(resolved.required)) {
    for (const field of resolved.required as string[]) {
      const v = dataObj[field];
      if (v === undefined || v === null || v === '') {
        errors.push(`Missing required field: ${pfx}${field}`);
      }
    }
  }

  // Check property types and constraints
  if (resolved.properties && typeof resolved.properties === 'object') {
    for (const [key, propSchemaRaw] of Object.entries(
      resolved.properties as Record<string, JSONSchema>
    )) {
      if (dataObj[key] === undefined || dataObj[key] === null) continue;

      const propSchema = propSchemaRaw;
      const value = dataObj[key];
      const fieldPath = `${pfx}${key}`;

      // Type check
      if (propSchema.type) {
        const expectedTypes = Array.isArray(propSchema.type)
          ? (propSchema.type as string[])
          : [propSchema.type as string];
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        const typeMatch = expectedTypes.some((t) => {
          if (t === 'integer') return typeof value === 'number' && Number.isInteger(value);
          if (t === 'null') return value === null;
          return t === actualType;
        });
        if (!typeMatch) {
          errors.push(
            `Field '${fieldPath}' expected type '${expectedTypes.join('|')}', got '${actualType}'`
          );
          continue;
        }
      }

      // Enum check
      if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(value)) {
        errors.push(
          `Field '${fieldPath}' must be one of: ${(propSchema.enum as unknown[]).join(', ')}`
        );
      }

      // Pattern check
      if (typeof propSchema.pattern === 'string' && typeof value === 'string') {
        const regex = new RegExp(propSchema.pattern);
        if (!regex.test(value)) {
          errors.push(`Field '${fieldPath}' does not match pattern: ${propSchema.pattern}`);
        }
      }

      // minLength check
      if (typeof propSchema.minLength === 'number' && typeof value === 'string') {
        if (value.length < propSchema.minLength) {
          errors.push(`Field '${fieldPath}' must be at least ${propSchema.minLength} characters`);
        }
      }

      // minimum / maximum (number)
      if (typeof propSchema.minimum === 'number' && typeof value === 'number') {
        if (value < propSchema.minimum) {
          errors.push(`Field '${fieldPath}' must be >= ${propSchema.minimum}`);
        }
      }
      if (typeof propSchema.maximum === 'number' && typeof value === 'number') {
        if (value > propSchema.maximum) {
          errors.push(`Field '${fieldPath}' must be <= ${propSchema.maximum}`);
        }
      }

      // format=date
      if (propSchema.format === 'date' && typeof value === 'string') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          errors.push(`Field '${fieldPath}' must be a valid date (YYYY-MM-DD)`);
        }
      }

      // Array-specific checks
      if (Array.isArray(value)) {
        if (typeof propSchema.minItems === 'number' && value.length < propSchema.minItems) {
          errors.push(
            `Field '${fieldPath}' must have at least ${propSchema.minItems} item(s) (minItems: ${propSchema.minItems})`
          );
        }
        const items = propSchema.items as JSONSchema | undefined;
        if (items && items.type === 'object' && items.properties) {
          value.forEach((item, idx) => {
            if (typeof item === 'object' && item !== null) {
              const nested = walkValidate(item, items, schemasDir, `${fieldPath}[${idx}]`);
              errors.push(...nested.errors);
            }
          });
        }
      }

      // Nested object validation
      if (typeof value === 'object' && !Array.isArray(value) && propSchema.properties) {
        const nested = walkValidate(value, propSchema, schemasDir, fieldPath);
        errors.push(...nested.errors);
      }

      // Nested $ref for object properties
      if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof propSchema.$ref === 'string' &&
        schemasDir
      ) {
        try {
          const refSchema = loadSchema(path.basename(propSchema.$ref), schemasDir);
          const nested = walkValidate(value, refSchema, schemasDir, fieldPath);
          errors.push(...nested.errors);
        } catch (err) {
          errors.push(`Could not resolve $ref for '${fieldPath}': ${(err as Error).message}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate markdown structural elements (H2 heading hierarchy).
 * Case-insensitive substring match.
 */
export function validateMarkdownStructure(
  content: string,
  expectedSections: string[]
): MarkdownStructureOutcome {
  const headers = (content.match(/^## .+$/gm) || []).map((h) =>
    h.replace(/^## /, '').trim().toLowerCase()
  );

  const present: string[] = [];
  const missing: string[] = [];

  for (const section of expectedSections) {
    const sectionLower = section.toLowerCase();
    if (headers.some((h) => h.includes(sectionLower))) {
      present.push(section);
    } else {
      missing.push(section);
    }
  }

  return { present, missing };
}

/**
 * Validate a markdown artifact file against its schema. Combines
 * frontmatter extraction, structural checks (Phase Gate, placeholder
 * detection), and schema-driven property validation in a single pass.
 */
export function validateArtifact(
  filePath: string,
  schemaName: string,
  schemasDir?: string
): ArtifactValidationOutcome {
  const warnings: string[] = [];

  if (!existsSync(filePath)) {
    return { valid: false, errors: [`File not found: ${filePath}`], warnings };
  }

  const content = readFileSync(filePath, 'utf8');

  // Frontmatter
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) {
    warnings.push('No YAML frontmatter found in artifact');
  }

  // H2 header check
  const headers = content.match(/^## .+$/gm) || [];
  const headerNames = headers.map((h) => h.replace('## ', '').trim());
  if (!headerNames.some((h) => h.includes('Phase Gate'))) {
    warnings.push('Missing "Phase Gate Approval" section');
  }

  // Bracket placeholders
  const placeholders = content.match(/\[(?:DATE|NAME|DESCRIPTION|TODO|TBD|PLACEHOLDER)\]/gi);
  if (placeholders) {
    const unique = Array.from(new Set(placeholders)).join(', ');
    warnings.push(`Found ${placeholders.length} unresolved placeholder(s): ${unique}`);
  }

  let schemaResult: ValidationOutcome = { valid: true, errors: [] };
  if (frontmatter && schemaName) {
    try {
      const schema = loadSchema(schemaName, schemasDir);
      schemaResult = validate(frontmatter, schema);
    } catch (err) {
      warnings.push(`Could not load schema '${schemaName}': ${(err as Error).message}`);
    }
  }

  return {
    valid: schemaResult.valid,
    errors: schemaResult.errors,
    warnings,
  };
}

/**
 * Check if an artifact has been approved (Phase Gate section).
 */
export function checkApproval(filePath: string): ApprovalCheckOutcome {
  if (!existsSync(filePath)) {
    return { approved: false, approver: null, date: null };
  }

  const content = readFileSync(filePath, 'utf8');

  // Find Phase Gate section (greedy until next H2 or doc-end)
  const gateMatch = content.match(/## Phase Gate Approval[\s\S]*?(?=\n## |\n---\s*$|$)/);
  if (!gateMatch) {
    return { approved: false, approver: null, date: null };
  }

  const gateSection = gateMatch[0];

  // Checkbox state
  const unchecked = gateSection.match(/- \[ \]/g);
  const checked = gateSection.match(/- \[x\]/gi);

  // Approver
  const approverMatch = gateSection.match(/\*\*Approved by:\*\*\s*(.+)/);
  const approver = approverMatch?.[1] !== undefined ? approverMatch[1].trim() : null;

  // Date
  const dateMatch = gateSection.match(/\*\*Approval date:\*\*\s*(.+)/);
  const date = dateMatch?.[1] !== undefined ? dateMatch[1].trim() : null;

  const approved = Boolean(
    !unchecked &&
      checked &&
      checked.length > 0 &&
      approver &&
      approver !== 'Pending' &&
      date &&
      date !== 'Pending'
  );

  return { approved, approver, date };
}

/**
 * Validate a custom agent definition file against the agent-template
 * structure (Item 92). Errors when required sections are missing,
 * warnings for recommended ones (Phase Gate, Never Guess rule).
 */
export function validateAgentDefinition(filePath: string): ArtifactValidationOutcome {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(filePath)) {
    return { valid: false, errors: [`File not found: ${filePath}`], warnings: [] };
  }

  const content = readFileSync(filePath, 'utf8');

  const requiredSections = ['Identity', 'Mandate', 'Activation'];
  for (const section of requiredSections) {
    const pattern = new RegExp(`^##\\s+.*${section}`, 'im');
    if (!pattern.test(content)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  if (!/Phase Gate/i.test(content)) {
    warnings.push('Missing "Phase Gate" section — recommended for gated agents');
  }

  if (!/^# .+/m.test(content)) {
    errors.push('Missing H1 title (e.g., "# Agent: The <Name>")');
  }

  if (!/Never Guess|NEEDS CLARIFICATION/i.test(content)) {
    warnings.push('Consider adding the "Never Guess Rule" reference (Item 69)');
  }

  return { valid: errors.length === 0, errors, warnings };
}
