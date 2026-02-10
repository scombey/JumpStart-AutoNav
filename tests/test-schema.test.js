/**
 * test-schema.test.js — Layer 1: Schema & Formatting Validation Tests
 * 
 * Tests for bin/lib/validator.js covering:
 * - loadSchema()
 * - extractFrontmatter()
 * - validate() with $ref, minLength, minItems, nested objects
 * - validateArtifact() with valid/invalid fixtures
 * - validateMarkdownStructure()
 * - checkApproval()
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  loadSchema,
  extractFrontmatter,
  validate,
  validateArtifact,
  validateMarkdownStructure,
  checkApproval
} = require('../bin/lib/validator');

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const SCHEMAS_DIR = path.join(__dirname, '..', '.jumpstart', 'schemas');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ─── loadSchema ───────────────────────────────────────────────────────────────

describe('loadSchema', () => {
  it('loads a valid schema file', () => {
    const schema = loadSchema('spec-metadata.schema.json', SCHEMAS_DIR);
    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('id');
  });

  it('throws on missing schema file', () => {
    expect(() => loadSchema('nonexistent.schema.json', SCHEMAS_DIR)).toThrow('Schema not found');
  });
});

// ─── extractFrontmatter ──────────────────────────────────────────────────────

describe('extractFrontmatter', () => {
  it('parses key-value pairs', () => {
    const content = '---\nid: my-artifact\nphase: 2\n---\n# Content';
    const fm = extractFrontmatter(content);
    expect(fm).toEqual({ id: 'my-artifact', phase: 2 });
  });

  it('parses boolean values', () => {
    const content = '---\nenabled: true\ndisabled: false\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.enabled).toBe(true);
    expect(fm.disabled).toBe(false);
  });

  it('parses null values', () => {
    const content = '---\nvalue: null\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.value).toBeNull();
  });

  it('parses list values', () => {
    const content = '---\nupstream_refs:\n- brief-a\n- brief-b\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.upstream_refs).toEqual(['brief-a', 'brief-b']);
  });

  it('parses quoted strings', () => {
    const content = '---\nname: "My Project"\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.name).toBe('My Project');
  });

  it('parses numeric values', () => {
    const content = '---\nphase: 3\nversion: 1.5\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.phase).toBe(3);
    expect(fm.version).toBe(1.5);
  });

  it('returns null when no frontmatter exists', () => {
    const content = '# Just a heading\nSome content.';
    expect(extractFrontmatter(content)).toBeNull();
  });

  it('handles empty list syntax', () => {
    const content = '---\nitems: []\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.items).toEqual([]);
  });
});

// ─── validate ─────────────────────────────────────────────────────────────────

describe('validate', () => {
  it('passes when all required fields present', () => {
    const schema = { required: ['id', 'phase'], properties: { id: { type: 'string' }, phase: { type: 'number' } } };
    const result = validate({ id: 'test', phase: 2 }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails on missing required field', () => {
    const schema = { required: ['id', 'phase'], properties: {} };
    const result = validate({ id: 'test' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('phase'));
  });

  it('fails on type mismatch', () => {
    const schema = { properties: { phase: { type: 'number' } } };
    const result = validate({ phase: 'not-a-number' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("expected type 'number'");
  });

  it('fails on invalid enum value', () => {
    const schema = { properties: { status: { type: 'string', enum: ['draft', 'approved'] } } };
    const result = validate({ status: 'invalid' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be one of');
  });

  it('fails on pattern mismatch', () => {
    const schema = { properties: { version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' } } };
    const result = validate({ version: 'not-semver' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('does not match pattern');
  });

  it('checks minLength on strings', () => {
    const schema = { properties: { name: { type: 'string', minLength: 3 } } };
    expect(validate({ name: 'ab' }, schema).valid).toBe(false);
    expect(validate({ name: 'abc' }, schema).valid).toBe(true);
  });

  it('checks minimum/maximum on numbers', () => {
    const schema = { properties: { phase: { type: 'number', minimum: 0, maximum: 4 } } };
    expect(validate({ phase: -1 }, schema).valid).toBe(false);
    expect(validate({ phase: 5 }, schema).valid).toBe(false);
    expect(validate({ phase: 3 }, schema).valid).toBe(true);
  });

  it('checks format:date on strings', () => {
    const schema = { properties: { created: { type: 'string', format: 'date' } } };
    expect(validate({ created: '2026-01-15' }, schema).valid).toBe(true);
    expect(validate({ created: 'not-a-date' }, schema).valid).toBe(false);
  });

  it('checks minItems on arrays', () => {
    const schema = { properties: { items: { type: 'array', minItems: 2 } } };
    expect(validate({ items: ['a'] }, schema).valid).toBe(false);
    expect(validate({ items: ['a', 'b'] }, schema).valid).toBe(true);
  });

  it('validates nested object properties', () => {
    const schema = {
      properties: {
        metadata: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } }
        }
      }
    };
    expect(validate({ metadata: { id: 'test' } }, schema).valid).toBe(true);
    expect(validate({ metadata: {} }, schema).valid).toBe(false);
  });

  it('validates array items with nested schemas', () => {
    const schema = {
      properties: {
        stories: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' }, title: { type: 'string' } }
          }
        }
      }
    };
    const valid = validate({ stories: [{ id: 'S01', title: 'Test' }] }, schema);
    expect(valid.valid).toBe(true);
    const invalid = validate({ stories: [{ title: 'Missing ID' }] }, schema);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors[0]).toContain('stories[0]');
  });

  it('resolves $ref to load referenced schema', () => {
    const schema = {
      $ref: 'spec-metadata.schema.json',
      properties: { custom: { type: 'string' } }
    };
    // Should merge the ref'd schema's required fields
    const result = validate({ custom: 'test' }, schema, SCHEMAS_DIR);
    expect(result.valid).toBe(false); // Missing 'id', 'phase', etc. from spec-metadata
    expect(result.errors.some(e => e.includes('id'))).toBe(true);
  });

  it('returns error for non-object data', () => {
    const result = validate(null, { required: ['id'] });
    expect(result.valid).toBe(false);
  });
});

// ─── validateArtifact ─────────────────────────────────────────────────────────

describe('validateArtifact', () => {
  it('validates a valid PRD fixture', () => {
    const result = validateArtifact(
      path.join(FIXTURES_DIR, 'valid', 'prd.md'),
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates a valid ADR fixture', () => {
    const result = validateArtifact(
      path.join(FIXTURES_DIR, 'valid', 'adr.md'),
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.valid).toBe(true);
  });

  it('validates a valid architecture fixture', () => {
    const result = validateArtifact(
      path.join(FIXTURES_DIR, 'valid', 'architecture.md'),
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.valid).toBe(true);
  });

  it('warns when frontmatter is missing', () => {
    const result = validateArtifact(
      path.join(FIXTURES_DIR, 'invalid', 'adr-no-frontmatter.md'),
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.warnings).toContainEqual(expect.stringContaining('No YAML frontmatter'));
  });

  it('warns on missing Phase Gate section', () => {
    const result = validateArtifact(
      path.join(FIXTURES_DIR, 'invalid', 'adr-no-frontmatter.md'),
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.warnings).toContainEqual(expect.stringContaining('Phase Gate'));
  });

  it('fails on invalid status enum', () => {
    const result = validateArtifact(
      path.join(FIXTURES_DIR, 'invalid', 'architecture-bad-status.md'),
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
  });

  it('returns error for missing file', () => {
    const result = validateArtifact('/nonexistent/file.md', 'spec-metadata.schema.json', SCHEMAS_DIR);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('File not found');
  });
});

// ─── validateMarkdownStructure ───────────────────────────────────────────────

describe('validateMarkdownStructure', () => {
  it('detects present sections', () => {
    const content = '## Product Overview\n\n## Epics\n\n## Phase Gate Approval\n';
    const result = validateMarkdownStructure(content, ['Product Overview', 'Epics', 'Phase Gate Approval']);
    expect(result.present).toHaveLength(3);
    expect(result.missing).toHaveLength(0);
  });

  it('detects missing sections', () => {
    const content = '## Product Overview\n\nSome content.\n';
    const result = validateMarkdownStructure(content, ['Product Overview', 'Epics']);
    expect(result.present).toEqual(['Product Overview']);
    expect(result.missing).toEqual(['Epics']);
  });

  it('is case-insensitive', () => {
    const content = '## product overview\n';
    const result = validateMarkdownStructure(content, ['Product Overview']);
    expect(result.present).toHaveLength(1);
  });
});

// ─── checkApproval ───────────────────────────────────────────────────────────

describe('checkApproval', () => {
  it('detects approved artifact', () => {
    const result = checkApproval(path.join(FIXTURES_DIR, 'valid', 'prd.md'));
    expect(result.approved).toBe(true);
    expect(result.approver).toBe('Jane Smith');
    expect(result.date).toBeTruthy();
  });

  it('detects unapproved artifact', () => {
    const result = checkApproval(path.join(FIXTURES_DIR, 'invalid', 'prd-missing-epics.md'));
    expect(result.approved).toBe(false);
  });

  it('returns false for missing Phase Gate section', () => {
    const result = checkApproval(path.join(FIXTURES_DIR, 'invalid', 'adr-no-frontmatter.md'));
    expect(result.approved).toBe(false);
  });

  it('returns false for nonexistent file', () => {
    const result = checkApproval('/nonexistent/file.md');
    expect(result.approved).toBe(false);
  });
});
