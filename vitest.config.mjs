import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Mirror tsconfig `paths` at runtime so test code can import via `@lib/*`
  // and exercise the same alias that tsc resolves at typecheck. This is
  // what makes `tests/test-paths-alias-smoke.test.ts` an honest gate rather
  // than a relative-path smoke. Post-M9 the canonical TS modules live at
  // `src/lib/*`; the second alias entry preserves resolution for any test
  // that still imports `@lib/<name>` for a module that only exists as
  // legacy JS in `bin/lib/*`. Vite's alias array tries each replacement
  // until one resolves, so this is functionally equivalent to tsc's
  // path-mapping behavior.
  resolve: {
    alias: [
      { find: /^@lib\/(.+)$/, replacement: path.resolve(__dirname, 'src/lib/$1') },
      { find: /^@lib\/(.+)$/, replacement: path.resolve(__dirname, 'bin/lib/$1') },
    ],
  },
  test: {
    globals: true,
    root: '.',
    // Strangler tail: include both .js (legacy, slated for M11 cleanup) and
    // .ts (ported canonical + new TS tests).
    include: ['tests/**/*.test.{js,ts}'],
    exclude: [
      'tests/test-agent-intelligence.test.js', // Aggregate test that imports 20+ modules; covered by individual test files
    ],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      // `json-summary` produces coverage/coverage-summary.json which the
      // ratchet script reads. `text` keeps a human-readable summary in the
      // terminal. `html` is for local inspection (gitignored).
      reporter: ['text', 'json-summary', 'html'],
      // Cover both src/ (canonical) + bin/lib/ (legacy strangler tail).
      include: [
        'bin/lib/**/*.js',
        'src/lib/**/*.ts',
        'src/cli/**/*.ts',
        'scripts/**/*.mjs',
      ],
      exclude: [
        'bin/cli.js',
        'bin/verify-diagrams.js',
        'bin/context7-setup.js',
        '**/_smoke.*', // M0 toolchain smoke; will be deleted at first real port
      ],
    },
  },
});
