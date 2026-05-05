/**
 * Vitest global-setup hook — runs once before any test file is loaded.
 *
 * Ensures `dist/` is built so tests that import from `dist/` (either
 * directly or via re-importing source modules that load dist artifacts
 * at module-evaluation time, e.g. `tests/test-hooks.test.js` →
 * `.github/hooks/*.mjs` → `dist/lib/validator.mjs`) don't race the
 * tsdown invocations from `tests/test-build-smoke.test.ts` and
 * `tests/test-m9-pitcrew-regressions.test.ts`.
 *
 * The helper is mkdir-locked, so multiple vitest workers calling it in
 * parallel coordinate through a single tsdown invocation.
 */

import { ensureDistBuilt } from './ensure-dist-built.js';

export default function setup(): void {
  ensureDistBuilt(process.cwd());
}
