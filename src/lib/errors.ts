/**
 * errors.ts — minimal typed-error hierarchy (per ADR-006).
 *
 * This is the strangler-phase home for the typed error classes. At the M9
 * cutover the same module re-emerges as `src/errors.ts` with full
 * contents — for now we ship only the two subclasses M1 actually needs:
 *
 *   - JumpstartError  (base — exitCode 99 default)
 *   - ValidationError (exitCode 2 — schema/path/input failures)
 *
 * GateFailureError + LLMError land alongside the modules that throw them
 * (per ADR-006's "stitch types in at port time, not up front" guidance).
 *
 * Design constraints:
 *   - Subclasses must not call `process.exit()` (gated by
 *     `scripts/check-process-exit.mjs`); only `src/cli/main.ts` and
 *     `src/lib/ipc.ts` are allowlisted.
 *   - Every typed error includes structured fields (`schemaId`, `issues`)
 *     so the IPC envelope can render them without string-parsing.
 *   - `Error.captureStackTrace` is invoked so the stack starts at the
 *     throw site, not at the constructor.
 *
 * @see specs/decisions/adr-006-error-model.md
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 */

import type { ZodIssue } from 'zod';

/**
 * Base typed error. Default exit code 99 = "unspecified failure"; subclass
 * authors override this. Use `phase` + `artifact` to thread context the
 * IPC envelope can serialize.
 */
export class JumpstartError extends Error {
  exitCode: number = 99;
  phase?: number | undefined;
  artifact?: string | undefined;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Validation failure — schema-shape mismatch, path-traversal rejection,
 * malformed CLI arg, etc. Exit code 2 by ADR-006 contract.
 *
 * The `issues` field carries Zod's structured issue array when the failure
 * came from a `ZodSchema.parse()`; for hand-thrown ValidationErrors (like
 * `assertInsideRoot`) it's an empty array and the human message lives in
 * `.message`. Either way, IPC envelopes can render `{ code, message,
 * details: { schemaId, issues } }` without string-parsing.
 */
export class ValidationError extends JumpstartError {
  exitCode = 2;
  schemaId: string;
  issues: ZodIssue[];

  constructor(message: string, schemaId: string, issues: ZodIssue[] = []) {
    super(message);
    this.schemaId = schemaId;
    this.issues = issues;
  }
}

/**
 * LLM-layer failure — provider configuration error, endpoint validation
 * rejection, upstream API error, malformed completion response. Exit
 * code 3 by ADR-006 contract; surfaced via IPC envelope as
 * `{code: 'LLM', message, details}`.
 *
 * Lands here in T4.3.1 alongside `bin/lib-ts/llm-provider.ts` per
 * ADR-006's "stitch types in at port time, not up front" guidance.
 */
export class LLMError extends JumpstartError {
  exitCode = 3;
  /** Optional structured detail field (provider, model, status code,
   *  upstream error body) for the IPC envelope renderer. */
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.details = details;
  }
}
