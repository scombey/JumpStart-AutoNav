/**
 * ipc.ts — shared subprocess runner (T4.1.8).
 *
 * The canonical IPC adapter for every dual-mode (library + subprocess)
 * module per ADR-006 + ADR-007. Every IPC-eligible TS port pairs a
 * handler function with this runner via:
 *
 *   if (isDirectRun(import.meta.url)) {
 *     await runIpc(myHandler, MyInputSchema);
 *   }
 *
 * **One of the two `process.exit()` allowlisted sites (per ADR-006).**
 * The other is `src/cli/main.ts`. Every other lib module throws typed
 * errors into this runner; runIpc translates them to the right exit
 * code:
 *
 *   ValidationError  → exit 2
 *   LLMError         → exit 3
 *   GateFailureError → exit 1
 *   JumpstartError   → exit 99 (or err.exitCode)
 *   anything else    → exit 99
 *
 * **ADR-007 envelope versioning.** v0 envelopes (no `version` field)
 * are accepted as-is and produce v0-shaped output. v1 envelopes
 * (`{"version": 1, "input": {...}}`) produce v1-shaped output
 * (`{"version": 1, "ok": true, "timestamp": "...", "result": {...}}`).
 * The detection happens at envelope-parse time; the same handler
 * answers both versions. Per-module v0/v1 fixture pairs at
 * `tests/fixtures/ipc/<name>/v{0,1}/` lock down the contract.
 *
 * @see specs/decisions/adr-006-error-model.md
 * @see specs/decisions/adr-007-ipc-envelope-versioning.md
 * @see specs/architecture.md §IPC module contract
 */

import { fileURLToPath } from 'node:url';
import type { ZodType } from 'zod';
import { JumpstartError, ValidationError } from './errors.js';
import { readStdin, writeError, writeResult } from './io.js';

/**
 * Handler signature: takes typed input, returns typed result. Sync or
 * async — runIpc awaits either. Errors thrown bubble to the typed-
 * error → exit-code translation below.
 */
export type IpcHandler<TIn, TOut> = (input: TIn) => Promise<TOut> | TOut;

/**
 * V1 envelope shape for input. v0 has no wrapper — the entire payload
 * IS the input.
 */
interface V1Input {
  version: 1;
  input: unknown;
}

/**
 * Heuristic check: was THIS module loaded as the entry point of a
 * `node <path>` invocation? Used by IPC modules to opt into the
 * subprocess path only when they were the direct target.
 *
 * `import.meta.url` is `file:///abs/path/to/module.ts`. We compare to
 * `process.argv[1]`'s file URL form via substring-suffix match so the
 * helper works under tsx (sources at `src/lib/<name>.ts`) and under
 * tsdown emit (`dist/lib/<name>.mjs`) without separate code paths.
 */
export function isDirectRun(fileUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const modulePath = fileURLToPath(fileUrl);
  // Exact match for `node <path>` invocations; suffix match handles
  // package-bin shims (`npx jumpstart-mode` → `bin/cli.js` resolved
  // through symlinks).
  return modulePath === argv1 || argv1.endsWith(modulePath);
}

/**
 * Detect v1 envelope: `{"version": 1, "input": {...}}`. Anything else
 * (missing `version`, `version: 0`, `version: 2`+) is treated as v0
 * for forward-compat — a v1 consumer should NEVER reach a v2 producer
 * since the version is bumped only on breaking change. Per ADR-007 we
 * keep the door open for additive v1 → v1.x evolution.
 */
function isV1Envelope(payload: unknown): payload is V1Input {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'version' in payload &&
    (payload as { version: unknown }).version === 1 &&
    'input' in payload
  );
}

/**
 * Subprocess entry-point runner. Reads stdin, parses + version-detects,
 * validates input via the supplied Zod schema (if any), invokes the
 * handler, writes the result envelope, and **calls `process.exit()`**
 * with the appropriate code per ADR-006's typed-error → exit-code
 * mapping.
 *
 * The optional `schema` parameter is intentional for the strangler
 * phase: not every legacy module's input has a Zod schema yet. As the
 * config layer stabilizes (T4.1.8 → T4.1.12) we expect ~all callers
 * to pass one.
 */
export async function runIpc<TIn, TOut>(
  handler: IpcHandler<TIn, TOut>,
  schema?: ZodType<TIn>
): Promise<void> {
  let exitCode = 0;
  // Hoist isV1 out of the try block so the catch path can render
  // v1-shaped error envelopes per ADR-007. Pit Crew M2-Final
  // Reviewer #3 caught the v1-error-shape regression.
  let isV1 = false;
  try {
    const raw = await readStdin();

    // Distinguish v0 (raw input) from v1 (wrapped input). The two-step
    // `unknown` cast is necessary because `readStdin`'s return type
    // (`Record<string, unknown>`) doesn't structurally overlap with
    // `V1Input` enough for TS's `as` to allow a direct cast — but
    // `isV1Envelope` does the actual runtime narrowing.
    isV1 = isV1Envelope(raw);
    const rawInput = isV1 ? (raw as unknown as V1Input).input : raw;

    // Validate via Zod if a schema is supplied. Failure → ValidationError
    // with structured Zod issues for the IPC envelope renderer.
    let typedInput: TIn;
    if (schema) {
      const parsed = schema.safeParse(rawInput);
      if (!parsed.success) {
        throw new ValidationError(
          `Input validation failed: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
          'runIpc.input',
          parsed.error.issues
        );
      }
      typedInput = parsed.data;
    } else {
      typedInput = rawInput as TIn;
    }

    const result = await handler(typedInput);

    // Envelope-version-aware emit per ADR-007. Field order matters —
    // some downstream consumers parse via streaming JSON or grep
    // leading bytes (Pit Crew M2-Final QA F2 caught this).
    //
    //   v0: { ok: true, timestamp: <ISO>, ...result }
    //   v1: { version: 1, ok: true, timestamp: <ISO>, result: {...} }
    //
    // v0 routes through writeResult (legacy emit shape preserved).
    // v1 bypasses writeResult and writes the envelope directly so
    // `version` comes BEFORE `ok` per the ADR-007 fixture contract.
    //
    // Result shape sanity: handlers may legitimately return `null`,
    // a scalar, or undefined (e.g. readFrameworkManifest returns
    // `Manifest | null`). For v0 we wrap with `{ ok, timestamp,
    // result }` if the value is non-object; for v1 we always have a
    // dedicated `result` key so any value type round-trips faithfully
    // (Pit Crew F4).
    if (isV1) {
      const envelope = {
        version: 1,
        ok: true,
        timestamp: new Date().toISOString(),
        result,
      };
      process.stdout.write(`${JSON.stringify(envelope)}\n`);
    } else if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
      writeResult(result as Record<string, unknown>);
    } else {
      // Non-object/null/array result — wrap explicitly so it survives
      // the v0 envelope without silent loss to spread.
      const envelope = {
        ok: true,
        timestamp: new Date().toISOString(),
        result,
      };
      process.stdout.write(`${JSON.stringify(envelope)}\n`);
    }
  } catch (err) {
    // Typed-error → exit-code translation per ADR-006.
    exitCode = computeExitCode(err);
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof ValidationError ? 'VALIDATION' : errorCode(err);
    const details: Record<string, unknown> = {};
    // Always emit schemaId for ValidationError, regardless of issues
    // count. Pit Crew M2-Final Reviewer #3: assertInsideRoot and many
    // hand-thrown ValidationErrors ship with empty issues but DO have
    // a schemaId — the IPC envelope renderer needs it to identify the
    // schema that rejected the input.
    if (err instanceof ValidationError) {
      details.schemaId = err.schemaId;
      if (err.issues.length > 0) {
        details.issues = err.issues;
      }
    }
    if (err instanceof Error && err.stack) {
      details.stack = err.stack;
    }
    // v1 envelope error shape per ADR-007 — wrap in version + ok=false
    // so v1 callers parse the same shape they expect on success.
    if (isV1) {
      const errorEnvelope = {
        version: 1,
        ok: false,
        timestamp: new Date().toISOString(),
        error: { code, message, ...details },
        exitCode,
      };
      try {
        process.stderr.write(`${JSON.stringify(errorEnvelope)}\n`);
      } catch {
        // stderr unavailable; nothing to do but exit.
      }
    } else {
      try {
        writeError(code, message, details);
      } catch {
        // stderr unavailable; nothing to do but exit.
      }
    }
  }
  // Single allowlisted process.exit per ADR-006. The
  // check-process-exit gate (scripts/check-process-exit.mjs) lists
  // src/lib/ipc.ts on its allowlist for exactly this line.
  process.exit(exitCode);
}

function computeExitCode(err: unknown): number {
  if (err instanceof JumpstartError) {
    return err.exitCode;
  }
  return 99;
}

function errorCode(err: unknown): string {
  if (err instanceof Error && err.name) return err.name.toUpperCase();
  return 'TOOL_ERROR';
}
