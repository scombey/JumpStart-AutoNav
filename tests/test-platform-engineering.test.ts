/**
 * test-platform-engineering.test.ts — M11 batch 1 port coverage.
 *
 * Verifies the TS port at `src/lib/platform-engineering.ts` matches the
 * legacy `bin/lib/platform-engineering.js` public surface:
 *   - registerTemplate / listTemplates / instantiateTemplate / generateReport
 *   - load/save round-trip
 *   - TEMPLATE_TYPES, GOLDEN_PATH_STAGES enum contents
 *
 * @see src/lib/platform-engineering.ts
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultState,
  GOLDEN_PATH_STAGES,
  generateReport,
  instantiateTemplate,
  listTemplates,
  loadState,
  registerTemplate,
  saveState,
  TEMPLATE_TYPES,
} from '../src/lib/platform-engineering.js';
import { expectDefined } from './_helpers.js';

let tmp: string;
let stateFile: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'platform-eng-'));
  stateFile = path.join(tmp, 'platform-engineering.json');
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('platform-engineering — TEMPLATE_TYPES + GOLDEN_PATH_STAGES', () => {
  it('lists 5 template types', () => {
    expect(TEMPLATE_TYPES.length).toBe(5);
    expect(TEMPLATE_TYPES).toContain('service');
    expect(TEMPLATE_TYPES).toContain('library');
    expect(TEMPLATE_TYPES).toContain('worker');
    expect(TEMPLATE_TYPES).toContain('api-gateway');
    expect(TEMPLATE_TYPES).toContain('frontend');
  });

  it('lists 5 golden path stages', () => {
    expect(GOLDEN_PATH_STAGES.length).toBe(5);
    expect(GOLDEN_PATH_STAGES).toContain('scaffold');
    expect(GOLDEN_PATH_STAGES).toContain('ci-cd');
    expect(GOLDEN_PATH_STAGES).toContain('observability');
    expect(GOLDEN_PATH_STAGES).toContain('security');
    expect(GOLDEN_PATH_STAGES).toContain('deployment');
  });
});

describe('platform-engineering — defaultState / load / save', () => {
  it('defaultState returns empty templates + version 1.0.0', () => {
    const s = defaultState();
    expect(s.version).toBe('1.0.0');
    expect(s.templates).toEqual([]);
    expect(s.instances).toEqual([]);
    expect(s.golden_paths).toEqual([]);
    expect(s.last_updated).toBe(null);
  });

  it('loadState returns defaultState when file missing', () => {
    const s = loadState(stateFile);
    expect(s.templates).toEqual([]);
  });

  it('saveState writes JSON + populates last_updated', () => {
    const s = defaultState();
    saveState(s, stateFile);
    const raw = readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('loadState round-trips saved state', () => {
    const s = defaultState();
    saveState(s, stateFile);
    const loaded = loadState(stateFile);
    expect(loaded.version).toBe('1.0.0');
  });

  it('rejects malformed JSON by returning defaultState', () => {
    writeFileSync(stateFile, 'not-json', 'utf8');
    const loaded = loadState(stateFile);
    expect(loaded.templates).toEqual([]);
  });

  it('rejects __proto__-keyed JSON by returning defaultState', () => {
    writeFileSync(stateFile, '{"__proto__":{"polluted":true}}', 'utf8');
    const loaded = loadState(stateFile);
    expect(loaded.templates).toEqual([]);
  });
});

describe('platform-engineering — registerTemplate', () => {
  it('registers a service template with id starting PLAT-', () => {
    const r = registerTemplate('payments-svc', 'service', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.template.id).toMatch(/^PLAT-\d+/);
      expect(r.template.name).toBe('payments-svc');
      expect(r.template.type).toBe('service');
      expect(r.template.version).toBe('1.0.0');
      expect(r.template.golden_path_stages.length).toBe(5);
    }
  });

  it('rejects when name is missing', () => {
    const r = registerTemplate('', 'service', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('required');
  });

  it('rejects unknown type', () => {
    const r = registerTemplate('thing', 'made-up', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Unknown type');
  });

  it('honors options.tech_stack and version', () => {
    const r = registerTemplate('p', 'frontend', {
      stateFile,
      tech_stack: ['react', 'vite'],
      version: '2.0.0',
      stages: ['scaffold', 'deployment'],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.template.tech_stack).toEqual(['react', 'vite']);
      expect(r.template.version).toBe('2.0.0');
      expect(r.template.golden_path_stages).toEqual(['scaffold', 'deployment']);
    }
  });
});

describe('platform-engineering — listTemplates', () => {
  it('returns all templates with no filter', () => {
    registerTemplate('a', 'service', { stateFile });
    registerTemplate('b', 'frontend', { stateFile });
    const r = listTemplates({ stateFile });
    expect(r.total).toBe(2);
  });

  it('filters by type', () => {
    registerTemplate('a', 'service', { stateFile });
    registerTemplate('b', 'frontend', { stateFile });
    const r = listTemplates({ stateFile, type: 'service' });
    expect(r.total).toBe(1);
    const [first] = r.templates;
    expectDefined(first);
    expect(first.name).toBe('a');
  });

  it('returns 0 when no templates registered', () => {
    const r = listTemplates({ stateFile });
    expect(r.total).toBe(0);
  });
});

describe('platform-engineering — instantiateTemplate', () => {
  it('creates an instance with id starting INST-', () => {
    const reg = registerTemplate('base', 'service', { stateFile });
    const tplId = reg.success ? reg.template.id : '';
    const r = instantiateTemplate(tplId, 'my-project', { stateFile });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.instance.id).toMatch(/^INST-\d+/);
      expect(r.instance.project_name).toBe('my-project');
      expect(r.instance.status).toBe('created');
    }
  });

  it('rejects when templateId or projectName missing', () => {
    const r = instantiateTemplate('', 'p', { stateFile });
    expect(r.success).toBe(false);
    const r2 = instantiateTemplate('PLAT-x', '', { stateFile });
    expect(r2.success).toBe(false);
  });

  it('rejects unknown templateId', () => {
    const r = instantiateTemplate('PLAT-doesnotexist', 'my-project', { stateFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('not found');
  });
});

describe('platform-engineering — generateReport', () => {
  it('reports counts grouped by type', () => {
    registerTemplate('a', 'service', { stateFile });
    registerTemplate('b', 'service', { stateFile });
    registerTemplate('c', 'frontend', { stateFile });
    const r = generateReport({ stateFile });
    expect(r.total_templates).toBe(3);
    expect(r.by_type.service).toBe(2);
    expect(r.by_type.frontend).toBe(1);
  });

  it('reports zero for empty state', () => {
    const r = generateReport({ stateFile });
    expect(r.total_templates).toBe(0);
    expect(r.total_instances).toBe(0);
    expect(r.by_type).toEqual({});
  });

  it('counts instances after instantiation', () => {
    const reg = registerTemplate('base', 'service', { stateFile });
    const tplId = reg.success ? reg.template.id : '';
    instantiateTemplate(tplId, 'a', { stateFile });
    instantiateTemplate(tplId, 'b', { stateFile });
    const r = generateReport({ stateFile });
    expect(r.total_instances).toBe(2);
  });
});
