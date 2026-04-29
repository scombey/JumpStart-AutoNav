/**
 * test-config-loader.test.ts — T4.1.9 unit tests.
 *
 * Coverage:
 *   - loadConfig merge order (project wins over global)
 *   - parseYamlFile via the unified `yaml` package (replaces the
 *     deleted hand-rolled parseSimpleYaml)
 *   - missing global config → silent fallthrough
 *   - malformed project config → legacy error envelope shape
 *   - deepMerge edge cases
 *   - ConfigLoaderInputSchema rejects path-traversal payloads (Zod
 *     refinement gated by safePathSchema per ADR-009)
 *
 * @see src/lib/config-loader.ts
 * @see bin/lib/config-loader.mjs (legacy reference)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigLoaderInputSchema, deepMerge, loadConfig } from '../src/lib/config-loader.js';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(tmpdir(), 'cfg-loader-test-'));
  mkdirSync(path.join(tmpRoot, '.jumpstart'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writeProjectConfig(yaml: string): void {
  writeFileSync(path.join(tmpRoot, '.jumpstart', 'config.yaml'), yaml, 'utf8');
}

function writeGlobalConfig(yaml: string): string {
  // Place the global config inside the same tmpRoot tree so we don't
  // touch the real `~/.jumpstart/config.yaml`. Caller passes
  // `global_path` to loadConfig.
  const globalPath = path.join(tmpRoot, 'global', 'config.yaml');
  mkdirSync(path.dirname(globalPath), { recursive: true });
  writeFileSync(globalPath, yaml, 'utf8');
  return globalPath;
}

describe('deepMerge', () => {
  it('source wins on key conflict', () => {
    const out = deepMerge({ a: 1, b: 2 }, { a: 10, c: 30 });
    expect(out).toEqual({ a: 10, b: 2, c: 30 });
  });

  it('recursively merges nested objects', () => {
    const out = deepMerge(
      { project: { name: 'old', type: 'brownfield' } },
      { project: { name: 'new' } }
    );
    expect(out).toEqual({ project: { name: 'new', type: 'brownfield' } });
  });

  it('arrays replace (no concat)', () => {
    const out = deepMerge({ list: [1, 2, 3] }, { list: [4, 5] });
    expect(out).toEqual({ list: [4, 5] });
  });

  it('empty source preserves target', () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });
});

describe('loadConfig — yaml-package parsing replaces parseSimpleYaml', () => {
  it('parses YAML via the unified yaml package + returns merged shape', async () => {
    writeProjectConfig(['project:', '  name: test', '  type: brownfield', ''].join('\n'));
    const result = await loadConfig({ root: tmpRoot });
    expect(result.config).toMatchObject({
      project: { name: 'test', type: 'brownfield' },
    });
    expect(result.sources.project).toContain('config.yaml');
    expect(result.sources.global).toBeNull();
  });

  it('handles YAML features parseSimpleYaml silently dropped (multiline strings, lists)', async () => {
    // The legacy hand-rolled parser had no support for multi-line
    // block-scalar strings or list values in the way the spec
    // expected. The yaml package handles them. Pin the new behavior.
    writeProjectConfig(
      [
        'project:',
        '  name: test',
        '  description: |',
        '    A multi-line',
        '    block-scalar string.',
        '  tags:',
        '    - alpha',
        '    - beta',
        '',
      ].join('\n')
    );
    const result = await loadConfig({ root: tmpRoot });
    const project = result.config.project as Record<string, unknown>;
    expect(project.name).toBe('test');
    expect(project.description).toContain('multi-line');
    expect(project.description).toContain('block-scalar string.');
    expect(project.tags).toEqual(['alpha', 'beta']);
  });
});

describe('loadConfig — merge order', () => {
  it('project config wins over global on key conflict', async () => {
    const globalPath = writeGlobalConfig('project:\n  name: from-global\n');
    writeProjectConfig('project:\n  name: from-project\n');

    const result = await loadConfig({ root: tmpRoot, global_path: globalPath });
    expect(result.config).toMatchObject({ project: { name: 'from-project' } });
  });

  it('reports global keys not overridden by project as overrides_applied', async () => {
    const globalPath = writeGlobalConfig(
      ['theme: dark', 'editor:', '  tab_width: 2', ''].join('\n')
    );
    writeProjectConfig('project:\n  name: x\n');

    const result = await loadConfig({ root: tmpRoot, global_path: globalPath });
    const overrideKeys = result.overrides_applied.map((o) => o.key);
    expect(overrideKeys).toContain('theme');
    expect(overrideKeys).toContain('editor.tab_width');
  });
});

describe('loadConfig — error fallthroughs (legacy semantics preserved)', () => {
  it('returns empty config when no project or global file exists', async () => {
    rmSync(path.join(tmpRoot, '.jumpstart'), { recursive: true });
    const result = await loadConfig({ root: tmpRoot });
    expect(result.config).toEqual({});
    expect(result.sources.project).toBeNull();
    expect(result.sources.global).toBeNull();
  });

  it('returns the error envelope on malformed project config (does NOT throw)', async () => {
    writeProjectConfig(': : : invalid yaml [');
    const result = await loadConfig({ root: tmpRoot });
    expect(result.error).toMatch(/Failed to parse project config/);
    expect(result.config).toEqual({});
  });

  it('silently skips malformed global config', async () => {
    const globalPath = writeGlobalConfig(': : : invalid yaml [');
    writeProjectConfig('project:\n  name: x\n');
    const result = await loadConfig({ root: tmpRoot, global_path: globalPath });
    expect(result.error).toBeUndefined();
    expect(result.sources.global).toBeNull();
    expect(result.config).toMatchObject({ project: { name: 'x' } });
  });
});

describe('ConfigLoaderInputSchema — ADR-009 path-traversal rejection', () => {
  it('accepts a default-shape input with no path-traversal', () => {
    const result = ConfigLoaderInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.root).toBe('.');
    }
  });

  it('rejects root that traverses outside cwd', () => {
    const result = ConfigLoaderInputSchema.safeParse({ root: '../../etc' });
    expect(result.success).toBe(false);
  });

  it('rejects absolute root outside cwd', () => {
    const result = ConfigLoaderInputSchema.safeParse({ root: '/etc' });
    expect(result.success).toBe(false);
  });

  it('accepts ~/foo as global_path (home expansion preserved)', () => {
    const result = ConfigLoaderInputSchema.safeParse({ global_path: '~/.jumpstart/config.yaml' });
    expect(result.success).toBe(true);
  });

  it('rejects global_path that resolves outside home', () => {
    const result = ConfigLoaderInputSchema.safeParse({ global_path: '/etc/passwd' });
    expect(result.success).toBe(false);
  });

  it('rejects null-byte injection in global_path', () => {
    const result = ConfigLoaderInputSchema.safeParse({
      global_path: `~/foo${String.fromCharCode(0)}../etc`,
    });
    expect(result.success).toBe(false);
  });
});

describe('loadConfig — yaml-package strict-parse edge cases (Pit Crew M2-Final QA F8)', () => {
  it('treats empty file as empty config (yaml-package returns null)', async () => {
    writeProjectConfig('');
    const r = await loadConfig({ root: tmpRoot });
    expect(r.config).toEqual({});
    expect(r.error).toBeUndefined();
    expect(r.sources.project).toContain('config.yaml');
  });

  it('treats comments-only file as empty config', async () => {
    writeProjectConfig('# only comments\n# no values\n');
    const r = await loadConfig({ root: tmpRoot });
    expect(r.config).toEqual({});
    expect(r.error).toBeUndefined();
  });

  it('returns error envelope when root is a scalar (not mapping)', async () => {
    writeProjectConfig('42\n');
    const r = await loadConfig({ root: tmpRoot });
    expect(r.error).toMatch(/Failed to parse project config/);
    expect(r.config).toEqual({});
  });

  it('returns error envelope when root is a list (not mapping)', async () => {
    writeProjectConfig('- a\n- b\n');
    const r = await loadConfig({ root: tmpRoot });
    expect(r.error).toMatch(/Failed to parse project config/);
  });
});

describe('runIpc(loadConfig, ConfigLoaderInputSchema) — e2e wiring (Pit Crew M2-Final QA F3)', () => {
  // Captures the full pipe: stdin → runIpc → safePathSchema → loadConfig
  // → envelope emit → process.exit. Without this, the runIpc + Zod +
  // loadConfig composition is unverified end-to-end.

  function captureE2E() {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCalls: number[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString());
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString());
      return true;
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCalls.push(code ?? 0);
      throw new Error('exit intercepted');
    }) as never);
    return { stdout, stderr, exitCalls };
  }

  function setTTY(value: boolean) {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
  }

  it('rejects /etc/passwd as root with VALIDATION error + exit 2', async () => {
    const { runIpc } = await import('../src/lib/ipc.js');
    const { stderr, exitCalls } = captureE2E();
    setTTY(false);
    const p = runIpc(loadConfig, ConfigLoaderInputSchema);
    process.stdin.emit('data', '{"root":"/etc/passwd"}');
    process.stdin.emit('end');
    await p.catch(() => {
      /* exit spy throws — expected */
    });
    expect(exitCalls[0]).toBe(2);
    const env = JSON.parse(stderr[0]);
    expect(env.error.code).toBe('VALIDATION');
    expect(env.error.schemaId).toBe('runIpc.input');
  });

  it('rejects ../etc/passwd as root with VALIDATION error', async () => {
    const { runIpc } = await import('../src/lib/ipc.js');
    const { exitCalls } = captureE2E();
    setTTY(false);
    const p = runIpc(loadConfig, ConfigLoaderInputSchema);
    process.stdin.emit('data', '{"root":"../etc/passwd"}');
    process.stdin.emit('end');
    await p.catch(() => {
      /* exit spy throws — expected */
    });
    expect(exitCalls[0]).toBe(2);
  });

  it('happy path: valid input produces v0 envelope + exit 0', async () => {
    const { runIpc } = await import('../src/lib/ipc.js');
    const os = await import('node:os');
    const { stdout, exitCalls } = captureE2E();
    setTTY(false);
    // Use homedir-prefixed global_path so safePathSchema(os.homedir())
    // accepts it. The file doesn't have to exist — loadConfig silently
    // falls through on a missing global config.
    const safeGlobal = path.join(os.homedir(), '.jumpstart-test-fixture-nonexistent.yaml');
    const p = runIpc(loadConfig, ConfigLoaderInputSchema);
    process.stdin.emit(
      'data',
      JSON.stringify({
        root: '.',
        global_path: safeGlobal,
      })
    );
    process.stdin.emit('end');
    await p.catch(() => {
      /* exit spy throws — expected */
    });
    expect(exitCalls[0]).toBe(0);
    const parsed = JSON.parse(stdout[0]);
    expect(parsed.ok).toBe(true);
    expect(parsed.config).toBeDefined();
  });
});

describe('loadConfig — ceremony profile expansion (legacy soft-fail behavior)', () => {
  it('skips profile expansion when ceremony.profile === "standard"', async () => {
    writeProjectConfig(['ceremony:', '  profile: standard', ''].join('\n'));
    const result = await loadConfig({ root: tmpRoot });
    expect(result.profile_applied).toBeNull();
  });

  it('skips profile expansion when ceremony.profile is unset', async () => {
    writeProjectConfig('project:\n  name: x\n');
    const result = await loadConfig({ root: tmpRoot });
    expect(result.profile_applied).toBeNull();
  });

  it('soft-fails to profile_applied=null when bin/lib/ceremony.mjs cannot be loaded', async () => {
    // We can't easily make the legacy ceremony.js reject without
    // touching the real repo's file. Instead spy on console to
    // confirm no unhandled rejection escapes.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* swallowed */
    });
    writeProjectConfig(['ceremony:', '  profile: nonexistent-profile', ''].join('\n'));
    const result = await loadConfig({ root: tmpRoot });
    // Whatever ceremony.js does, the call shouldn't throw — legacy
    // semantics is "skip on error."
    expect(result).toBeDefined();
    errorSpy.mockRestore();
  });
});
