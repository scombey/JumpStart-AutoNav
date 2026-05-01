/**
 * test-fitness-functions.test.ts — M11 batch 5 port coverage.
 *
 * Verifies the TS port at `src/lib/fitness-functions.ts` matches the
 * legacy `bin/lib/fitness-functions.js` public surface:
 *   - defaultRegistry shape
 *   - loadRegistry / saveRegistry round-trip + defaultState fallback
 *   - addFitnessFunction validation, category normalization, dup-id
 *   - evaluateFitness walk + violation detection + history capping
 *   - listFitnessFunctions filters
 *   - BUILTIN_CHECKS (max_file_length, max_function_params, pattern_match,
 *     no_circular_imports)
 *   - M3 hardening: pollution-key registry payloads fall back to default
 *
 * @see src/lib/fitness-functions.ts
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addFitnessFunction,
  BUILTIN_CHECKS,
  defaultRegistry,
  evaluateFitness,
  FITNESS_CATEGORIES,
  listFitnessFunctions,
  loadRegistry,
  saveRegistry,
} from '../src/lib/fitness-functions.js';

let tmpDir: string;
let registryFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fitness-functions-'));
  mkdirSync(join(tmpDir, '.jumpstart'), { recursive: true });
  mkdirSync(join(tmpDir, 'src'), { recursive: true });
  registryFile = join(tmpDir, '.jumpstart', 'fitness-functions.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('fitness-functions — defaultRegistry', () => {
  it('returns canonical default shape', () => {
    const r = defaultRegistry();
    expect(r.version).toBe('1.0.0');
    expect(r.functions).toEqual([]);
    expect(r.evaluation_history).toEqual([]);
    expect(r.last_evaluated).toBeNull();
    expect(typeof r.created_at).toBe('string');
  });
});

describe('fitness-functions — FITNESS_CATEGORIES', () => {
  it('contains the canonical category list', () => {
    expect(FITNESS_CATEGORIES).toContain('dependency');
    expect(FITNESS_CATEGORIES).toContain('structure');
    expect(FITNESS_CATEGORIES).toContain('complexity');
    expect(FITNESS_CATEGORIES).toContain('naming');
    expect(FITNESS_CATEGORIES).toContain('security');
    expect(FITNESS_CATEGORIES).toContain('performance');
    expect(FITNESS_CATEGORIES).toContain('testing');
    expect(FITNESS_CATEGORIES.length).toBe(7);
  });
});

describe('fitness-functions — loadRegistry / saveRegistry', () => {
  it('returns defaultRegistry when file is missing', () => {
    const r = loadRegistry(registryFile);
    expect(r.version).toBe('1.0.0');
    expect(r.functions).toEqual([]);
  });

  it('round-trips a saved registry', () => {
    const r = defaultRegistry();
    r.functions.push({
      id: 't1',
      name: 'Test',
      category: 'structure',
      description: 'd',
      check_type: 'pattern',
      pattern: 'foo',
      threshold: null,
      target_dirs: ['src'],
      enabled: true,
      created_at: new Date().toISOString(),
    });
    saveRegistry(r, registryFile);
    const loaded = loadRegistry(registryFile);
    expect(loaded.functions.length).toBe(1);
    expect(loaded.functions[0]?.id).toBe('t1');
  });

  it('defaults on malformed JSON', () => {
    writeFileSync(registryFile, '{not json', 'utf8');
    const r = loadRegistry(registryFile);
    expect(r.functions).toEqual([]);
    expect(r.version).toBe('1.0.0');
  });

  it('defaults on top-level array (shape mismatch)', () => {
    writeFileSync(registryFile, '[]', 'utf8');
    const r = loadRegistry(registryFile);
    expect(r.functions).toEqual([]);
  });

  it('M3 hardening: rejects raw __proto__ payload, returns default', () => {
    // Cannot use JSON.stringify({__proto__: ...}) — the literal becomes a
    // prototype set, not a key. Write the bytes directly.
    writeFileSync(registryFile, '{"__proto__":{"polluted":true},"version":"1.0.0"}', 'utf8');
    const r = loadRegistry(registryFile);
    expect(r.functions).toEqual([]);
    // Pollution should not have leaked into the default shape.
    expect((r as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('M3 hardening: rejects raw constructor payload, returns default', () => {
    writeFileSync(registryFile, '{"constructor":{"polluted":true},"version":"1.0.0"}', 'utf8');
    const r = loadRegistry(registryFile);
    expect(r.functions).toEqual([]);
  });

  it('M3 hardening: rejects nested __proto__ in functions array', () => {
    writeFileSync(
      registryFile,
      '{"version":"1.0.0","functions":[{"__proto__":{"polluted":true}}]}',
      'utf8'
    );
    const r = loadRegistry(registryFile);
    expect(r.functions).toEqual([]);
  });

  it('saveRegistry creates the parent dir if missing', () => {
    const nested = join(tmpDir, 'deep', 'nested', 'fitness.json');
    saveRegistry(defaultRegistry(), nested);
    expect(existsSync(nested)).toBe(true);
  });
});

describe('fitness-functions — BUILTIN_CHECKS', () => {
  it('max_file_length passes under threshold', () => {
    const r = BUILTIN_CHECKS.max_file_length('a\nb\nc\n', 5);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(4);
    expect(r.threshold).toBe(5);
  });

  it('max_file_length fails when exceeded', () => {
    const long = Array(600).fill('line').join('\n');
    const r = BUILTIN_CHECKS.max_file_length(long, 500);
    expect(r.passed).toBe(false);
  });

  it('max_file_length default threshold is 500', () => {
    const r = BUILTIN_CHECKS.max_file_length('one line');
    expect(r.threshold).toBe(500);
  });

  it('max_function_params counts named function params', () => {
    const r = BUILTIN_CHECKS.max_function_params('function test(a, b, c) {}', 5);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(3);
  });

  it('max_function_params fails when threshold exceeded', () => {
    const r = BUILTIN_CHECKS.max_function_params('function test(a, b, c, d, e, f, g) {}', 5);
    expect(r.passed).toBe(false);
  });

  it('max_function_params default threshold is 5', () => {
    const r = BUILTIN_CHECKS.max_function_params('function test(a) {}');
    expect(r.threshold).toBe(5);
  });

  it('pattern_match flags console.log usage', () => {
    const r = BUILTIN_CHECKS.pattern_match('console.log("x")', null, 'console\\.log');
    expect(r.passed).toBe(false);
    expect(r.value).toBeGreaterThan(0);
  });

  it('pattern_match passes on clean content', () => {
    const r = BUILTIN_CHECKS.pattern_match('clean code here', null, 'console\\.log');
    expect(r.passed).toBe(true);
  });

  it('pattern_match returns passed on empty pattern', () => {
    const r = BUILTIN_CHECKS.pattern_match('content', null, null);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
  });

  it('pattern_match returns passed=true with error on bad regex', () => {
    const r = BUILTIN_CHECKS.pattern_match('text', null, '(unclosed');
    expect(r.passed).toBe(true);
    expect(r.error).toBe('invalid regex');
  });

  it('no_circular_imports counts require()-style imports', () => {
    // Legacy regex `(?:require|import)\s*\(?['"]([^'"]+)['"]\)?` only catches
    // function-call-shape imports. `import x from "a"` (named import) does
    // not match because `x from ` sits between `import` and the literal.
    const r = BUILTIN_CHECKS.no_circular_imports('require("a")\nrequire("b")');
    expect(r.passed).toBe(true);
    expect(r.value).toBe(2);
    expect(r.note).toBe('static check only');
  });
});

describe('fitness-functions — addFitnessFunction', () => {
  it('adds a function with all required fields', () => {
    const r = addFitnessFunction(
      {
        name: 'No console.log',
        category: 'structure',
        description: 'Disallow console.log',
        check_type: 'pattern',
        pattern: 'console\\.log',
      },
      { registryFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.function.name).toBe('No console.log');
      expect(r.function.category).toBe('structure');
      expect(r.total).toBe(1);
    }
  });

  it('rejects without name', () => {
    const r = addFitnessFunction({ description: 'd' }, { registryFile });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/name and description/);
  });

  it('rejects without description', () => {
    const r = addFitnessFunction({ name: 'X' }, { registryFile });
    expect(r.success).toBe(false);
  });

  it('rejects null input', () => {
    const r = addFitnessFunction(null, { registryFile });
    expect(r.success).toBe(false);
  });

  it('rejects unknown category', () => {
    const r = addFitnessFunction(
      { name: 'X', description: 'd', category: 'invalid' },
      { registryFile }
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/category must be one of/);
  });

  it('lower-cases category before lookup', () => {
    const r = addFitnessFunction(
      { name: 'X', description: 'd', category: 'STRUCTURE' },
      { registryFile }
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.function.category).toBe('structure');
  });

  it('rejects duplicate id', () => {
    addFitnessFunction(
      { id: 'dup-1', name: 'A', description: 'd', category: 'structure' },
      { registryFile }
    );
    const r = addFitnessFunction(
      { id: 'dup-1', name: 'A2', description: 'd2', category: 'structure' },
      { registryFile }
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/already exists/);
  });

  it('auto-generates id when none provided', () => {
    const r = addFitnessFunction(
      { name: 'X', description: 'd', category: 'structure' },
      { registryFile }
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.function.id).toMatch(/^ff-\d+-[a-z0-9]+$/);
  });

  it('defaults category to structure when omitted', () => {
    const r = addFitnessFunction({ name: 'X', description: 'd' }, { registryFile });
    expect(r.success).toBe(true);
    if (r.success) expect(r.function.category).toBe('structure');
  });

  it('trims name + description', () => {
    const r = addFitnessFunction(
      { name: '  hello  ', description: '  world  ', category: 'structure' },
      { registryFile }
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.function.name).toBe('hello');
      expect(r.function.description).toBe('world');
    }
  });
});

describe('fitness-functions — evaluateFitness', () => {
  it('returns success even with empty registry', () => {
    const r = evaluateFitness(tmpDir, { registryFile });
    expect(r.success).toBe(true);
    expect(r.all_passed).toBe(true);
    expect(r.results).toEqual([]);
  });

  it('detects pattern violations in src/', () => {
    addFitnessFunction(
      {
        name: 'No console.log',
        category: 'structure',
        description: 'd',
        check_type: 'pattern',
        pattern: 'console\\.log',
      },
      { registryFile }
    );
    writeFileSync(join(tmpDir, 'src', 'app.js'), 'console.log("hi")\n', 'utf8');
    const r = evaluateFitness(tmpDir, { registryFile });
    expect(r.all_passed).toBe(false);
    expect(r.results[0]?.violations).toBeGreaterThan(0);
    expect(r.summary.failed).toBe(1);
  });

  it('passes when no violations', () => {
    addFitnessFunction(
      {
        name: 'No console.log',
        category: 'structure',
        description: 'd',
        check_type: 'pattern',
        pattern: 'console\\.log',
      },
      { registryFile }
    );
    writeFileSync(join(tmpDir, 'src', 'app.js'), 'const x = 1\n', 'utf8');
    const r = evaluateFitness(tmpDir, { registryFile });
    expect(r.all_passed).toBe(true);
    expect(r.summary.passed).toBe(1);
  });

  it('skips dotfiles + node_modules', () => {
    addFitnessFunction(
      {
        name: 'No TODO',
        category: 'structure',
        description: 'd',
        check_type: 'pattern',
        pattern: 'TODO',
      },
      { registryFile }
    );
    mkdirSync(join(tmpDir, 'src', 'node_modules', 'lib'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'node_modules', 'lib', 'noisy.js'), 'TODO\n', 'utf8');
    mkdirSync(join(tmpDir, 'src', '.cache'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', '.cache', 'noisy.js'), 'TODO\n', 'utf8');
    const r = evaluateFitness(tmpDir, { registryFile });
    expect(r.all_passed).toBe(true);
  });

  it('skips disabled functions', () => {
    addFitnessFunction(
      {
        name: 'Off check',
        category: 'structure',
        description: 'd',
        check_type: 'pattern',
        pattern: 'TODO',
        enabled: false,
      },
      { registryFile }
    );
    writeFileSync(join(tmpDir, 'src', 'app.js'), 'TODO\n', 'utf8');
    const r = evaluateFitness(tmpDir, { registryFile });
    expect(r.results.length).toBe(0);
    expect(r.all_passed).toBe(true);
  });

  it('handles non-existent target dirs', () => {
    addFitnessFunction(
      {
        name: 'in-missing-dir',
        category: 'structure',
        description: 'd',
        check_type: 'pattern',
        pattern: 'TODO',
        target_dirs: ['nonexistent-dir'],
      },
      { registryFile }
    );
    const r = evaluateFitness(tmpDir, { registryFile });
    expect(r.all_passed).toBe(true);
  });

  it('appends to evaluation_history and caps at 50', () => {
    const reg = defaultRegistry();
    // Pre-populate with 50 history entries
    for (let i = 0; i < 50; i++) {
      reg.evaluation_history.push({
        evaluated_at: new Date(2020, 0, i + 1).toISOString(),
        total_functions: 0,
        passed: 0,
        failed: 0,
        all_passed: true,
      });
    }
    saveRegistry(reg, registryFile);
    evaluateFitness(tmpDir, { registryFile });
    const reloaded = loadRegistry(registryFile);
    expect(reloaded.evaluation_history.length).toBe(50);
  });

  it('records last_evaluated timestamp', () => {
    addFitnessFunction({ name: 'X', description: 'd', category: 'structure' }, { registryFile });
    evaluateFitness(tmpDir, { registryFile });
    const reloaded = loadRegistry(registryFile);
    expect(typeof reloaded.last_evaluated).toBe('string');
  });

  it('uses default registryFile path under root when no opt given', () => {
    // No file created -> evaluation runs against default registry (empty).
    const r = evaluateFitness(tmpDir);
    expect(r.success).toBe(true);
    expect(r.all_passed).toBe(true);
  });
});

describe('fitness-functions — listFitnessFunctions', () => {
  it('lists all when no filter', () => {
    addFitnessFunction({ name: 'A', description: 'd', category: 'structure' }, { registryFile });
    addFitnessFunction({ name: 'B', description: 'd', category: 'security' }, { registryFile });
    const r = listFitnessFunctions({}, { registryFile });
    expect(r.total).toBe(2);
  });

  it('filters by category', () => {
    addFitnessFunction({ name: 'A', description: 'd', category: 'structure' }, { registryFile });
    addFitnessFunction({ name: 'B', description: 'd', category: 'security' }, { registryFile });
    const r = listFitnessFunctions({ category: 'security' }, { registryFile });
    expect(r.total).toBe(1);
    expect(r.functions[0]?.name).toBe('B');
  });

  it('filters by enabled=true', () => {
    addFitnessFunction(
      { name: 'A', description: 'd', category: 'structure', enabled: true },
      { registryFile }
    );
    addFitnessFunction(
      { name: 'B', description: 'd', category: 'structure', enabled: false },
      { registryFile }
    );
    const r = listFitnessFunctions({ enabled: true }, { registryFile });
    expect(r.total).toBe(1);
    expect(r.functions[0]?.name).toBe('A');
  });

  it('filters by enabled=false', () => {
    addFitnessFunction(
      { name: 'A', description: 'd', category: 'structure', enabled: true },
      { registryFile }
    );
    addFitnessFunction(
      { name: 'B', description: 'd', category: 'structure', enabled: false },
      { registryFile }
    );
    const r = listFitnessFunctions({ enabled: false }, { registryFile });
    expect(r.total).toBe(1);
    expect(r.functions[0]?.name).toBe('B');
  });

  it('returns empty list when no functions registered', () => {
    const r = listFitnessFunctions({}, { registryFile });
    expect(r.total).toBe(0);
    expect(r.functions).toEqual([]);
  });

  it('persists across save+load round-trip', () => {
    addFitnessFunction({ name: 'A', description: 'd', category: 'structure' }, { registryFile });
    const raw = readFileSync(registryFile, 'utf8');
    expect(raw).toContain('"name": "A"');
  });
});
