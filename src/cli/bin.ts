#!/usr/bin/env node
/**
 * bin.ts — npm-bin entry point (M9 cutover, T5.1).
 *
 * After `package.json` is flipped to `"type": "module"` and the `bin`
 * field points to `./dist/cli/bin.mjs`, this file is what `npx
 * @scombey/jumpstart-mode <args>` actually invokes. Two responsibilities:
 *
 *   1. Provide the shebang. tsdown preserves the shebang on entry
 *      points whose source starts with `#!` (the SEC-005 post-build
 *      assertion in `scripts/check-dist-exports.mjs` enforces this).
 *
 *   2. Host the ADR-006 top-level catch. `runMain()` from `./main.ts`
 *      throws `JumpstartError` subclasses on any failure mode the CLI
 *      surfaces; the catch here translates them into the exit-code
 *      contract:
 *
 *        ValidationError → 2
 *        LLMError        → 3
 *        JumpstartError  → exitCode (default 99)
 *        unknown Error   → 1
 *
 *      Per ADR-006, this file + `src/lib/ipc.ts` are the only two
 *      allowlisted `process.exit` sites in the codebase
 *      (gated by `scripts/check-process-exit.mjs`).
 *
 * **Why split bin.ts from main.ts?**  `main.ts` exports `runMain` so
 * tests can drive the citty tree without forking a subprocess. Putting
 * the shebang + top-level catch here keeps `main.ts` import-safe (no
 * side effects on import).
 *
 * @see specs/decisions/adr-006-error-model.md
 * @see specs/implementation-plan.md T5.1
 */

import { JumpstartError } from '../lib/errors.js';
import { runMain } from './main.js';

try {
  await runMain();
} catch (err: unknown) {
  // Map typed errors to exit codes. The IPC envelope (used in
  // subprocess mode) handles its own serialization; this branch
  // is only reached for direct `npx @scombey/jumpstart-mode` invocations
  // where citty's own runMain didn't catch the throw.
  if (err instanceof JumpstartError) {
    if (err.message) console.error(`${err.name}: ${err.message}`);
    process.exit(err.exitCode);
  }
  // Last-resort handler for anything that bubbled out of citty
  // without going through the typed-error layer. We deliberately
  // don't pretty-print the stack here — Node's default uncaught-
  // exception handler does that already if we re-throw, but exit
  // code 1 + message keeps the contract consistent for shell
  // pipelines.
  if (err instanceof Error) {
    console.error(err.stack ?? err.message);
  } else {
    console.error('Unknown CLI error:', err);
  }
  process.exit(1);
}
