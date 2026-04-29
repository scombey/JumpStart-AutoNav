/**
 * tsdown build configuration — pinned at 0.21.10 exact (per ADR-001).
 *
 * Post-M9 (2.0.0-rc.1) layout:
 *
 *   src/cli/bin.ts          → dist/cli/bin.mjs        (npm-bin entry)
 *   src/cli/main.ts         → dist/cli/main.mjs       (citty dispatcher root)
 *   src/cli/deps.ts         → dist/cli/deps.mjs
 *   src/cli/commands/*.ts   → dist/cli/commands/*.mjs (lazy command modules)
 *   src/lib/*.ts            → dist/lib/*.mjs          (113 leaf modules)
 *
 * The shared rootDir is `src/`, so tsdown strips that prefix in the
 * emitted layout — the dist tree mirrors the source tree minus `src/`.
 *
 * Glob-based entries: enumerating each leaf was a pre-M9 strangler-phase
 * artifact (we wanted explicit awareness of which modules had ported).
 * Post-M9 every TS file under `src/lib/` is canonical, so we point
 * tsdown at the whole tree and let it discover every leaf. The
 * `check-dist-exports.mjs` gate still verifies emit completeness.
 *
 * Fallback (per ADR-001 if tsdown is displaced mid-rewrite, ~2-3 days):
 *   tsc + tsc-alias + shell-script shebang post-step + .d.ts-parity
 *   verification against golden-master emit.
 */

import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    // CLI surface
    'src/cli/bin.ts',
    'src/cli/main.ts',
    'src/cli/deps.ts',
    'src/cli/commands/*.ts',
    // Library surface (every TS port; tsdown emits .mjs + .d.mts + .mjs.map
    // for each one — the shared rootDir is `src/`, so emit goes to dist/lib/)
    'src/lib/*.ts',
  ],

  // Output to dist/ (gitignored). package.json `bin` points to
  // dist/cli/bin.mjs (preserves shebang per SEC-005 post-build assertion).
  outDir: 'dist',

  // ESM output. After M9 the package is `"type": "module"`; CJS-compat is
  // preserved by named exports for any downstream consumer that imports a
  // single function rather than the default export.
  format: ['esm'],

  // Type declarations are mandatory (NFR-D02 machine-readable surface).
  dts: true,

  // Source maps for debugging post-port issues against original TS.
  sourcemap: true,

  // Node 24+ engine floor (per package.json `engines.node`). Targets the
  // language features available in V8 12.x — top-level await, Array.with,
  // structuredClone, etc.
  platform: 'node',
  target: 'node24',

  // Preserve shebang on CLI entry points. ADR-001 + SEC-005 (post-build
  // assertion) guard this; if a release breaks shebang preservation, the
  // typescript.yml CI gate fails fast.
  // tsdown handles shebang preservation natively for files that start with #!
  // No additional config required as of 0.21.10.

  // Don't bundle node_modules — keep them as external imports.
  // Smaller dist/, faster builds, lets npm dedupe at install time.
  // (tsdown 0.21+: `external` deprecated; use `deps.neverBundle`.)
  deps: {
    neverBundle: [
      /^node:/,
      /^@biomejs/,
      /^@types\//,
      'chalk',
      'citty',
      'dotenv',
      'openai',
      'prompts',
      'yaml',
      'zod',
      'json-schema-to-zod',
      'tsdown',
      'vitest',
    ],
  },

  // Clean dist/ before each build to prevent stale .js / .d.ts files.
  clean: true,

  // Emit one .mjs + .mjs.map + .d.mts per entry, no shared-chunk extraction.
  // The package.json `bin` and `exports` map both point at concrete leaf
  // files; chunked emit produces hash-suffixed shared modules and turns the
  // leaf paths into thin re-exporters with no sourcemap of their own. That
  // breaks `check-dist-exports.mjs` (which asserts a leaf .mjs.map exists
  // for every entry) and complicates the npm package layout. `unbundle:
  // true` keeps each entry self-contained at the cost of larger leaves
  // when modules share helpers — acceptable for a CLI ship target.
  unbundle: true,
});
