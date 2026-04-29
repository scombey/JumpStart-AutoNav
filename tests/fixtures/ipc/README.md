# IPC v0/v1 fixture pairs

Per the per-module port recipe step 11 (specs/implementation-plan.md lines 148–160) and ADR-007 (IPC envelope versioning), every IPC-eligible module ships a fixture pair under `tests/fixtures/ipc/<name>/v0/{input,expected-stdout}.json` + `v1/{input,expected-stdout}.json`. The pair pins:

- **v0**: the legacy CLI driver's stdin/stdout shape (no `version` field, raw result object).
- **v1**: the future `runIpc()` wrapper shape (per ADR-007 — `{"version":1,"input":...}` in, `{"version":1,"ok":true,"timestamp":...,"result":...}` out).

## Modules with fixtures

| Module | Why IPC-eligible | v0 driver |
|---|---|---|
| `timestamps` | `bin/lib/timestamps.mjs:163-193` action: now/validate/audit | legacy JS |
| `locks` | `bin/lib/locks.mjs:152-185` action: acquire/release/status/list | legacy JS |
| `diff` | `bin/lib/diff.mjs:196-218` stdin → generateDiff | legacy JS |
| `complexity` | `bin/lib/complexity.mjs:116-130` stdin → calculateComplexity | legacy JS |

## How the v0 fixtures were authored

Each `expected-stdout.json` was captured from the live legacy CLI driver (M2 Pit Crew remediation timestamp). The replay test in `tests/test-ipc-fixtures.test.ts` pipes `input.json` to `node bin/lib/<name>.js` and compares stdout to `expected-stdout.json`. Any change to the legacy module's CLI output breaks the replay — which is the entire point of the fixture: it locks down the v0 envelope contract that v1's `runIpc()` (M5) must produce byte-equivalent output for.

## v1 fixture status (currently dormant)

The v1 fixtures encode the wrapper shape ADR-007 specifies; the `timestamp` field in `expected-stdout.json` carries the literal placeholder `<<RUNTIME_ISO>>` so the M5 replay test can substitute the actual timestamp at runtime. Until `runIpc()` lands at M5/T4.1.8, the v1 fixtures are tested only for SHAPE (parses as JSON, has `version: 1`, `ok: true`, `result` field present); the byte-identical replay activates in M5.

## See also

- `specs/decisions/adr-007-ipc-envelope-versioning.md` — envelope shape spec
- `specs/implementation-plan.md` — per-module port recipe step 11
- `tests/test-ipc-fixtures.test.ts` — replay test
- M2 Pit Crew QA-F2 / Reviewer-B2 — finding that motivated this
