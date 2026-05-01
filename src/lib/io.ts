/**
 * io.ts — CLI-first IO primitives.
 *
 * Error contract (ADR-006): library bodies throw `JumpstartError`;
 * `runIpc()` in `ipc.ts` catches typed errors at the IPC boundary and
 * converts them to the appropriate exit code. Direct library callers
 * either handle locally or rethrow — `process.exit` lives at the
 * boundary, never in library code.
 *
 * IPC envelope shape (v0 — preserved byte-identical for every consumer):
 *
 *   writeResult({ x: 1 }) →  '{"ok":true,"timestamp":"...","x":1}\n'
 *   writeError('CODE','msg') → '{"ok":false,"timestamp":"...","error":{"code":"CODE","message":"msg"}}\n'
 *
 * @see specs/decisions/adr-006-error-model.md
 */

import { JumpstartError, ValidationError } from './errors.js';

// ─────────────────────────────────────────────────────────────────────────
// Public types — match the legacy module shape with sharper TS types
// ─────────────────────────────────────────────────────────────────────────

/** Catch-all type for tool input; specific tools refine this with Zod. */
export type ToolInput = Record<string, unknown>;

/** Catch-all type for tool result before the io wrapper folds in `ok`/`timestamp`. */
export type ToolResult = Record<string, unknown>;

/** Parsed CLI args. Each value is either the next non-flag token or `true`. */
export type ToolArgs = Record<string, string | true>;

export interface WriteResultOptions {
  /** Pretty-print the JSON output. Default false (matches legacy). */
  pretty?: boolean | undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Read JSON from stdin. Resolves with the parsed object, or `{}` if stdin
 * is a TTY or empty. Rejects with `ValidationError` on malformed JSON.
 *
 * Behavior matches `bin/lib/io.js`'s `readStdin()` for both success
 * paths; the divergence is the rejection error class — legacy throws
 * a generic `Error("Invalid JSON on stdin: ...")`, the TS port throws
 * the same shape (matching message prefix preserved verbatim) but as a
 * typed `JumpstartError` so `runIpc()` can map it to exit 99.
 */
export function readStdin(): Promise<ToolInput> {
  if (process.stdin.isTTY) {
    return Promise.resolve({});
  }

  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data) as ToolInput);
      } catch (err) {
        // Pit Crew M2-Final Reviewer #3: bad JSON is INPUT validation
        // failure, not an internal error. Throw ValidationError so
        // runIpc maps to exit code 2 (matches legacy bin/lib/config-
        // loader.js:233-236 behavior — exit 2 on bad stdin).
        reject(
          new ValidationError(
            `Invalid JSON on stdin: ${(err as Error).message}`,
            'runIpc.stdin',
            []
          )
        );
      }
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Write a structured success result to stdout. The output object is
 * `{ ok: true, timestamp: <ISO>, ...result }` — `ok` and `timestamp`
 * always emit before any caller-supplied fields, matching the legacy
 * `writeResult()` byte ordering exactly.
 */
export function writeResult(result: ToolResult, options: WriteResultOptions = {}): void {
  const { pretty = false } = options;
  const output = {
    ok: true,
    timestamp: new Date().toISOString(),
    ...result,
  };
  const json = pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
  process.stdout.write(`${json}\n`);
}

/**
 * Write a structured error to stderr. The output object is
 * `{ ok: false, timestamp: <ISO>, error: { code, message, ...details } }`.
 *
 * Behavior change vs `bin/lib/io.js`:
 *   - The legacy 4th boolean parameter `exit` (which called
 *     `process.exit(1)` if true) is REMOVED. The new contract: callers
 *     that want process termination throw an error; `runIpc()` catches
 *     and exits with the right code.
 *
 * Migration note: legacy callers passing `writeError(code, msg, details, true)`
 * become `writeError(code, msg, details); throw new JumpstartError(msg);`
 * at port time.
 */
export function writeError(
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): void {
  // Pit Crew Adversary 9: details fields spread AFTER would shadow
  // `code` and `message` if the caller passed `{ code: 'OK' }` (e.g. a
  // raw Zod issue containing its own `code` enum). Spread first; let
  // the canonical args win.
  const output = {
    ok: false,
    timestamp: new Date().toISOString(),
    error: { ...details, code, message },
  };
  process.stderr.write(`${JSON.stringify(output)}\n`);
}

/**
 * Wrap a tool handler with the standard stdin/stdout JSON contract.
 * The wrapped function reads stdin, merges in `cliArgs`, awaits the
 * handler, and writes the result via `writeResult`.
 *
 * On thrown error: writes a `TOOL_ERROR` envelope to stderr (matching
 * legacy shape) and **rethrows** rather than calling `process.exit(1)`.
 * The outer subprocess runner (`runIpc`, M5+) catches the rethrown
 * error and translates it to the right exit code per ADR-006:
 *   - `ValidationError` → exit 2
 *   - `LLMError` → exit 3
 *   - other `JumpstartError` → exit 99
 *   - unknown → exit 99 (uncaught crash; same as legacy `process.exit(1)`
 *     but with a real stack instead of swallowed-then-exit)
 *
 * For library callers (test harnesses, in-proc consumers), the throw
 * surfaces directly — no subprocess involvement.
 */
export function wrapTool<
  TInput extends ToolInput = ToolInput,
  TResult extends ToolResult = ToolResult,
>(
  handler: (input: TInput) => Promise<TResult> | TResult
): (cliArgs?: Partial<TInput>) => Promise<void> {
  return async function wrappedTool(cliArgs: Partial<TInput> = {} as Partial<TInput>) {
    try {
      const stdinInput = await readStdin();
      const input = { ...stdinInput, ...cliArgs } as TInput;
      const result = await handler(input);
      writeResult(result);
    } catch (err) {
      // Non-Error throws (e.g. `throw "boom"` or `throw 42`) — coerce
      // to a string for the error envelope. Pit Crew Reviewer H4 noted
      // this is a tightening vs legacy (legacy emitted no message at
      // all in that case). Documented here so future readers see the
      // deliberate choice.
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      // Pit Crew Adversary 4: if writeError itself throws (broken pipe
      // — common when subprocess parent exits before child finishes
      // writing), the JumpstartError contract is dropped and the EPIPE
      // bubbles out as a plain Error. Wrap in inner try/catch so the
      // typed throw below ALWAYS reaches the runIpc boundary.
      try {
        writeError('TOOL_ERROR', message, stack ? { stack } : {});
      } catch {
        // stderr is unavailable; nothing to do but proceed to throw.
      }
      // Per ADR-006: rethrow as typed error so runIpc can route exit
      // codes. If the caught value is already a JumpstartError, preserve
      // its subclass + exitCode.
      if (err instanceof JumpstartError) throw err;
      throw new JumpstartError(message);
    }
  };
}

/**
 * Parse CLI arguments into a key-value object. Supports `--key value`
 * (string) and `--flag` (boolean true) shapes. Behavior matches legacy
 * `parseToolArgs(argv)` exactly — same ordering, same handling of a
 * trailing `--flag`, same key-name extraction.
 */
export function parseToolArgs(argv: string[]): ToolArgs {
  const args: ToolArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}
