import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Mirror tsconfig `paths` at runtime so test code can import via `@lib/*`
  // and exercise the same alias that tsc resolves at typecheck.
  resolve: {
    alias: [{ find: /^@lib\/(.+)$/, replacement: path.resolve(__dirname, 'src/lib/$1') }],
  },
  test: {
    globals: true,
    root: '.',
    include: ['tests/**/*.test.{js,ts}'],
    exclude: [],
    // Build dist/ once before any test file loads. Several tests import
    // from `dist/` at module-evaluation time (e.g., `test-hooks.test.js`
    // → `.github/hooks/*.mjs` → `dist/lib/validator.mjs`); per-test
    // `beforeAll` guards run too late for those imports.
    globalSetup: ['tests/helpers/global-setup.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      // `json-summary` produces coverage/coverage-summary.json which the
      // ratchet script reads. `text` keeps a human-readable summary in
      // the terminal. `html` is for local inspection (gitignored).
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/lib/**/*.ts', 'src/cli/**/*.ts', 'scripts/**/*.mjs'],
    },
  },
});
