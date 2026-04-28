/**
 * deps.ts — Dependency-Injection Seam for the CLI Dispatcher (T4.7.1).
 *
 * Every command in `src/cli/commands/*.ts` receives a `Deps` object
 * rather than reaching out to global state. This exists for two
 * reasons:
 *
 *   1. **Testability.** Each command file is a pure function of its
 *      inputs (args + deps). Tests can `createTestDeps({ logger,
 *      cwd, env })` without setting up the entire process.
 *
 *   2. **Single-source-of-truth wiring.** `createRealDeps()` is the
 *      ONLY place that reads `process.cwd()`, `process.env`, builds
 *      the `chalk` instance, etc. Adding a new dep means exactly one
 *      place to update.
 *
 * The `Deps` interface intentionally exposes a small, stable surface.
 * Commands needing more should request one-off arguments rather than
 * growing this interface — keeping the seam narrow.
 *
 * ESM note: this file uses `import` exclusively. No `__dirname` /
 * `__filename` / `import.meta.url` — those are deferred until M9
 * cutover when `tsconfig.module = "ESNext"` and `package.json`
 * declares `"type": "module"`.
 *
 * @see specs/decisions/adr-002-cli-framework.md (citty + lazy subCommands)
 * @see specs/architecture.md §System Components (Deps Injection Seam)
 * @see specs/implementation-plan.md T4.7.1
 */

/** Logger interface. Real impl wraps console; test impls capture. */
export interface CliLogger {
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

/** Filesystem read/write interface — real impl is `node:fs`. */
export interface CliFs {
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string, encoding: 'utf8'): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, opts?: { recursive?: boolean }): void;
}

/** Process-environment surface. Carved out for test injection.
 *  NOTE: deliberately does NOT expose `process.exit`. Per ADR-006 only
 *  `src/cli/main.ts` and `runIpc` may call exit; commands return a
 *  `CommandResult { exitCode }` and main translates. */
export interface CliProcess {
  cwd(): string;
  env: NodeJS.ProcessEnv;
}

/**
 * The full deps object passed to every command.
 *
 * Public surface kept narrow on purpose. Commands needing rare
 * dependencies (network, prompts, child_process) declare them in
 * their own `defineCommand` args/options rather than promoting them
 * into this interface.
 */
export interface Deps {
  logger: CliLogger;
  fs: CliFs;
  process: CliProcess;
  /** Project-root resolution. Defaults to `process.cwd()` but can be
   *  overridden in tests or when running from a different directory. */
  projectRoot: string;
}

/**
 * Default real-impl deps. The sole place we read `process.cwd()` /
 * `process.env`. Called once from `runMain()` at startup; the
 * resulting `Deps` flows down into every command.
 */
export function createRealDeps(): Deps {
  // chalk's type is dynamic and varies across major versions; we
  // re-type its surface narrowly through CliLogger. Strangler-phase
  // CJS classification means we use require() — switches to import()
  // at the M9 ESM cutover.
  const fs = require('node:fs') as typeof import('node:fs');
  const chalk = require('chalk') as { default?: unknown } & Record<string, (s: string) => string>;
  const c = (chalk.default ?? chalk) as Record<string, (s: string) => string>;

  const logger: CliLogger = {
    info: (msg) => console.log(c.blue ? c.blue(msg) : msg),
    success: (msg) => console.log(c.green ? c.green(`✓ ${msg}`) : `✓ ${msg}`),
    warn: (msg) => console.warn(c.yellow ? c.yellow(`⚠ ${msg}`) : `⚠ ${msg}`),
    error: (msg) => console.error(c.red ? c.red(`✗ ${msg}`) : `✗ ${msg}`),
    debug: (msg) => {
      if (process.env.JUMPSTART_DEBUG === '1') {
        console.error(c.gray ? c.gray(`[debug] ${msg}`) : `[debug] ${msg}`);
      }
    },
  };

  return {
    logger,
    fs: {
      readFileSync: (p, enc) => fs.readFileSync(p, enc),
      writeFileSync: (p, d, enc) => fs.writeFileSync(p, d, enc),
      existsSync: (p) => fs.existsSync(p),
      mkdirSync: (p, opts) => {
        fs.mkdirSync(p, opts);
      },
    },
    process: {
      cwd: () => process.cwd(),
      env: process.env,
    },
    projectRoot: process.cwd(),
  };
}

/**
 * Test factory — returns a Deps where every method is a no-op or a
 * recording stub. Test files override individual fields as needed.
 *
 *   const deps = createTestDeps({
 *     logger: { info: vi.fn(), ... },
 *     projectRoot: tmpDir,
 *   });
 */
export function createTestDeps(overrides: Partial<Deps> = {}): Deps {
  const noopLogger: CliLogger = {
    info: () => undefined,
    success: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };

  const noopFs: CliFs = {
    readFileSync: () => '',
    writeFileSync: () => undefined,
    existsSync: () => false,
    mkdirSync: () => undefined,
  };

  const noopProcess: CliProcess = {
    cwd: () => '/test',
    env: {},
  };

  return {
    logger: noopLogger,
    fs: noopFs,
    process: noopProcess,
    projectRoot: '/test',
    ...overrides,
  };
}

/**
 * Common command-result shape. Every command's `run()` returns this
 * (or throws a typed error caught by main.ts's top-level handler).
 *
 * `exitCode === 0` for success; non-zero for command-defined failure.
 * The top-level handler translates this to `process.exit` at the
 * single allowlisted call site.
 */
export interface CommandResult {
  exitCode: number;
  message?: string;
}
