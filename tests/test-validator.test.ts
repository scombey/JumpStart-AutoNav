/**
 * test-validator.test.ts — T4.2.2 unit tests.
 *
 * Coverage:
 *   - Public surface parity with `bin/lib/validator.js` (7 exports).
 *   - Zod-primary route used when schema $id matches a generated one.
 *   - Walker fallback for inline / unknown schemas.
 *   - Error-string shape compatibility (substring-grep parity).
 *
 * @see src/lib/validator.ts
 */

import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkApproval,
  extractFrontmatter,
  loadSchema,
  validate,
  validateAgentDefinition,
  validateArtifact,
  validateMarkdownStructure,
} from '../src/lib/validator.js';

const SCHEMAS_DIR = path.join(__dirname, '..', '.jumpstart', 'schemas');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

describe('loadSchema', () => {
  it('loads a valid schema file', () => {
    const schema = loadSchema('spec-metadata.schema.json', SCHEMAS_DIR);
    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
    expect((schema.required as string[]).includes('id')).toBe(true);
  });

  it('throws on missing schema file', () => {
    expect(() => loadSchema('nonexistent.schema.json', SCHEMAS_DIR)).toThrow('Schema not found');
  });
});

describe('extractFrontmatter', () => {
  it('parses key-value pairs', () => {
    const fm = extractFrontmatter('---\nid: my-artifact\nphase: 2\n---\n# Content');
    expect(fm).toEqual({ id: 'my-artifact', phase: 2 });
  });

  it('parses boolean / null / number / list / quoted-string values', () => {
    const fm = extractFrontmatter(
      '---\nenabled: true\ndisabled: false\nvalue: null\nphase: 3\nname: "My Project"\nlist:\n- a\n- b\n---\n'
    );
    expect(fm).toEqual({
      enabled: true,
      disabled: false,
      value: null,
      phase: 3,
      name: 'My Project',
      list: ['a', 'b'],
    });
  });

  it('returns null when no frontmatter exists', () => {
    expect(extractFrontmatter('# Just a heading\nSome content.')).toBeNull();
  });

  it('handles empty list syntax', () => {
    expect(extractFrontmatter('---\nitems: []\n---\n')).toEqual({ items: [] });
  });
});

describe('validate — walker fallback (inline schemas)', () => {
  it('passes when all required fields present', () => {
    const result = validate(
      { id: 'test', phase: 2 },
      {
        required: ['id', 'phase'],
        properties: { id: { type: 'string' }, phase: { type: 'number' } },
      }
    );
    expect(result.valid).toBe(true);
  });

  it('fails on missing required field', () => {
    const result = validate({ id: 'test' }, { required: ['id', 'phase'], properties: {} });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('phase');
  });

  it('fails on type mismatch', () => {
    const result = validate({ phase: 'x' }, { properties: { phase: { type: 'number' } } });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("expected type 'number'");
  });

  it('fails on invalid enum value', () => {
    const result = validate(
      { status: 'invalid' },
      { properties: { status: { type: 'string', enum: ['draft', 'approved'] } } }
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be one of');
  });

  it('fails on pattern mismatch', () => {
    const result = validate(
      { version: 'not-semver' },
      { properties: { version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' } } }
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('does not match pattern');
  });

  it('checks minLength / minimum / maximum / format=date / minItems', () => {
    expect(
      validate({ name: 'ab' }, { properties: { name: { type: 'string', minLength: 3 } } }).valid
    ).toBe(false);
    expect(
      validate({ phase: -1 }, { properties: { phase: { type: 'number', minimum: 0, maximum: 4 } } })
        .valid
    ).toBe(false);
    expect(
      validate({ phase: 5 }, { properties: { phase: { type: 'number', minimum: 0, maximum: 4 } } })
        .valid
    ).toBe(false);
    expect(
      validate(
        { created: 'not-a-date' },
        { properties: { created: { type: 'string', format: 'date' } } }
      ).valid
    ).toBe(false);
    expect(
      validate({ items: ['a'] }, { properties: { items: { type: 'array', minItems: 2 } } }).valid
    ).toBe(false);
  });

  it('validates nested object properties', () => {
    const schema = {
      properties: {
        metadata: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
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
            properties: { id: { type: 'string' }, title: { type: 'string' } },
          },
        },
      },
    };
    expect(validate({ stories: [{ id: 'S01', title: 'Test' }] }, schema).valid).toBe(true);
    const invalid = validate({ stories: [{ title: 'Missing ID' }] }, schema);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors[0]).toContain('stories[0]');
  });

  it('resolves $ref across schemasDir', () => {
    const schema = {
      $ref: 'spec-metadata.schema.json',
      properties: { custom: { type: 'string' } },
    };
    const result = validate({ custom: 'test' }, schema, SCHEMAS_DIR);
    // $ref pulled in spec-metadata's required[]; missing fields fail.
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('id'))).toBe(true);
  });

  it('returns error for non-object data', () => {
    expect(validate(null, { required: ['id'] }).valid).toBe(false);
  });
});

describe('validate — Zod-primary path ($id-routed)', () => {
  it('routes spec-metadata.schema.json validation through generated Zod', () => {
    const schema = loadSchema('spec-metadata.schema.json', SCHEMAS_DIR);
    // Valid frontmatter should pass via Zod
    const ok = validate(
      {
        id: 'product-brief',
        phase: 1,
        agent: 'Analyst',
        status: 'Approved',
        created: '2026-04-27',
      },
      schema
    );
    expect(ok.valid).toBe(true);
  });

  it('produces field-prefixed error strings on Zod-route failure (substring grep parity)', () => {
    const schema = loadSchema('spec-metadata.schema.json', SCHEMAS_DIR);
    const result = validate(
      {
        id: 'x',
        phase: 1,
        agent: 'NotAnAgent',
        status: 'Approved',
        created: '2026-04-27',
      },
      schema
    );
    expect(result.valid).toBe(false);
    // Some error in the array references the agent field path.
    expect(result.errors.some((e) => e.includes('agent'))).toBe(true);
  });

  it('falls back to walker when caller passes a prefix (legacy nested-call path)', () => {
    const schema = loadSchema('spec-metadata.schema.json', SCHEMAS_DIR);
    const result = validate({ phase: 1 }, schema, undefined, 'parent');
    // With a prefix, Zod-route is bypassed (walker handles it), so the
    // error includes the parent-prefixed field path from the walker.
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('parent.'))).toBe(true);
  });
});

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

  it('warns when frontmatter is missing', () => {
    const result = validateArtifact(
      path.join(FIXTURES_DIR, 'invalid', 'adr-no-frontmatter.md'),
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.warnings.some((w) => w.includes('No YAML frontmatter'))).toBe(true);
  });

  it('warns on missing Phase Gate section', () => {
    const result = validateArtifact(
      path.join(FIXTURES_DIR, 'invalid', 'adr-no-frontmatter.md'),
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.warnings.some((w) => w.includes('Phase Gate'))).toBe(true);
  });

  it('fails on invalid status enum', () => {
    const result = validateArtifact(
      path.join(FIXTURES_DIR, 'invalid', 'architecture-bad-status.md'),
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('returns error for missing file', () => {
    const result = validateArtifact(
      '/nonexistent/file.md',
      'spec-metadata.schema.json',
      SCHEMAS_DIR
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('File not found');
  });
});

describe('validateMarkdownStructure', () => {
  it('detects present sections (case-insensitive)', () => {
    const r = validateMarkdownStructure(
      '## Product Overview\n\n## Epics\n\n## Phase Gate Approval\n',
      ['Product Overview', 'Epics', 'Phase Gate Approval']
    );
    expect(r.present).toHaveLength(3);
    expect(r.missing).toHaveLength(0);
  });

  it('detects missing sections', () => {
    const r = validateMarkdownStructure('## Product Overview\n\nSome content.\n', [
      'Product Overview',
      'Epics',
    ]);
    expect(r.present).toEqual(['Product Overview']);
    expect(r.missing).toEqual(['Epics']);
  });
});

describe('checkApproval', () => {
  it('detects approved artifact', () => {
    const result = checkApproval(path.join(FIXTURES_DIR, 'valid', 'prd.md'));
    expect(result.approved).toBe(true);
    expect(result.approver).toBe('Jane Smith');
    expect(result.date).toBeTruthy();
  });

  it('detects unapproved artifact', () => {
    expect(checkApproval(path.join(FIXTURES_DIR, 'invalid', 'prd-missing-epics.md')).approved).toBe(
      false
    );
  });

  it('returns false for missing Phase Gate section', () => {
    expect(
      checkApproval(path.join(FIXTURES_DIR, 'invalid', 'adr-no-frontmatter.md')).approved
    ).toBe(false);
  });

  it('returns false for nonexistent file', () => {
    expect(checkApproval('/nonexistent/file.md').approved).toBe(false);
  });
});

describe('validateAgentDefinition', () => {
  it('errors when required sections missing (Identity/Mandate/Activation)', () => {
    const tmpFile = path.join(__dirname, 'fixtures', 'valid', 'prd.md');
    // PRD doesn't have Identity/Mandate/Activation sections — should
    // fail. Reuse the fixture instead of authoring a new one.
    const result = validateAgentDefinition(tmpFile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Identity'))).toBe(true);
  });

  it('returns error for missing file', () => {
    const r = validateAgentDefinition('/nonexistent/file.md');
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('File not found');
  });
});

describe('Pit Crew M3 Adversary F1 — loadSchema path-traversal defense', () => {
  it('rejects schemaName containing ".." segments', () => {
    expect(() => loadSchema('../../etc/passwd', SCHEMAS_DIR)).toThrow(/Schema not found/);
  });
  it('rejects absolute schemaName', () => {
    expect(() => loadSchema('/etc/passwd', SCHEMAS_DIR)).toThrow(/Schema not found/);
  });
  it('rejects schemaName containing null bytes', () => {
    expect(() =>
      loadSchema(`spec-metadata.schema.json${String.fromCharCode(0)}`, SCHEMAS_DIR)
    ).toThrow(/Schema not found/);
  });
});

describe('Pit Crew M3 Adversary F8 — $ref allowlist', () => {
  it('rejects $ref target without .schema.json suffix', () => {
    const schema = {
      $ref: 'malicious.json',
      properties: { x: { type: 'string' } },
    };
    const result = validate({ x: 'a' }, schema, SCHEMAS_DIR);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('$ref target must end') || e.includes('schema.json'))
    ).toBe(true);
  });
});

describe('Pit Crew M3 Adversary F9 — extractFrontmatter prototype pollution defense', () => {
  it('skips __proto__ key in frontmatter', () => {
    const fm = extractFrontmatter('---\n__proto__: poisoned\nname: real\n---\n');
    expect(fm).toEqual({ name: 'real' });
  });
  it('skips constructor / prototype keys', () => {
    const fm = extractFrontmatter('---\nconstructor: x\nprototype: y\nname: real\n---\n');
    expect(fm).toEqual({ name: 'real' });
  });
});
