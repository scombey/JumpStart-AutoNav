# Level-3 Component Diagram — CLI Dispatcher

**Container under decomposition:** `CLI Dispatcher` (from `specs/architecture.md` §Component Interaction Diagram, Level 2).

**Source tree:** `src/cli/`

This diagram lists the components inside the `CLI Dispatcher` container and their relationships at strict-C4 Level 3 — the granularity the implementation plan's sprint allocation reasons about. The Level-2 diagram in `architecture.md` rendered `Deps Injection Seam` and `Error Hierarchy` as containers for narrative convenience; here they appear as components nested inside the CLI Dispatcher boundary, which is their actual scope.

> **Turn-2 commitment.** This file fulfills the Architect Turn-2 promise (`architecture.md` §Component Interaction Diagram diagram-level note: *"a separate Level-3 Component Diagram per container WILL be produced in Turn 2 for at least `CLI Dispatcher` and `Core Lib`"*). The companion file is [`architecture-l3-core-lib.md`](./architecture-l3-core-lib.md). Implementation tracker: T6.9.

## Diagram

```mermaid
C4Component
    title Component Diagram — CLI Dispatcher (src/cli/)

    Person(dev, "Developer", "Runs jumpstart-mode <subcommand>")
    Person(aiAgent, "AI Coding Assistant", "Spawns the CLI as a subprocess for tool calls")

    Container_Boundary(cli, "CLI Dispatcher (src/cli/)") {
        Component(bin, "bin.ts", "TypeScript / ESM entry", "npm-bin entry point. Carries the shebang. Awaits runMain() and translates JumpstartError subclasses to exit codes via redactSecrets-wrapped stderr (ADR-006 + ADR-012). One of two allowlisted process.exit sites.")
        Component(main, "main.ts", "TypeScript / citty", "Root citty defineCommand. Owns the lazy subCommands map (147 entries → 14 cluster modules). Reads FRAMEWORK_VERSION from package.json via createRequire(import.meta.url).")
        Component(deps, "deps.ts", "TypeScript", "Deps injection seam. Exports createRealDeps() and createTestDeps(). The CliProcess shape deliberately omits `exit` so commands cannot bypass the bin.ts catch.")

        Component_Boundary(commands, "commands/ (14 cluster files, 147 leaf commands)") {
            Component(specVal, "spec-validation.ts", "12 commands", "validate, spec-drift, hash, graph, simplicity, scan-wrappers, invariants, template-check, freshness-audit, shard, checklist, smells")
            Component(handoff, "handoff.ts", "12 commands", "handoff-check, coverage, consistency, lint, contracts, regulatory, boundaries, task-deps, diff (async), modules, validate-module, handoff")
            Component(lifecycle, "lifecycle.ts", "11 commands", "approve, reject, checkpoint, agent-checkpoint, focus, …")
            Component(cleanup, "cleanup.ts", "57 commands", "Largest cluster — adr (async), revert (async), timestamp, semantic-diff, sla-slo, … built via thinWrapper factory.")
            Component(otherClusters, "10 other clusters", "marketplace · runners · spec-quality · llm · governance · collaboration · enterprise · deferred · version-tag · _helpers")
            Component(helpers, "_helpers.ts", "TypeScript", "Shared utilities: legacyRequire (sync, .js only), legacyImport (async, tries .mjs then .js), safeJoin (assertInsideRoot-gated), assertUserPath (path-safety boundary). PACKAGE_ROOT anchored at fileURLToPath(import.meta.url) — NOT cwd (post-M9 Pit Crew B3 fix).")
        }
    }

    Container_Boundary(libCore, "Core Lib (src/lib/)") {
        Component(errors, "errors.ts", "JumpstartError hierarchy", "Base + ValidationError(2) + LLMError(3). Throw site for every command failure mode.")
        Component(secretScanner, "secret-scanner.ts", "redactSecrets()", "Imported by bin.ts to scrub stderr lines before emit (ADR-012).")
        Component(libModules, "*.ts", "111 leaf modules", "Domain logic — see architecture-l3-core-lib.md for the L3 decomposition.")
    }

    Container_Boundary(legacyTail, "Legacy Strangler Tail (bin/lib/, M11 cleanup)") {
        Component(legacyMjs, "*.mjs", "38 ESM legacy modules", "handoff, next-phase, dashboard, install, locks, timestamps, diff, complexity, … — loaded via legacyImport()")
        Component(legacyJs, "*.js", "155 CJS legacy modules", "io, ai-evaluation, fitness-functions, … — loaded via legacyRequire()")
    }

    Rel(dev, bin, "Invokes", "shell pipe / npx")
    Rel(aiAgent, bin, "Spawns subprocess", "child_process.spawn")
    Rel(bin, main, "Calls runMain()", "ESM import")
    Rel(bin, errors, "Branches on JumpstartError subclass for exitCode", "instanceof")
    Rel(bin, secretScanner, "Wraps stderr lines", "ESM import")
    Rel(main, deps, "Constructs Deps", "createRealDeps()")

    Rel(main, specVal, "Lazy-loads on dispatch", "dynamic import")
    Rel(main, handoff, "Lazy-loads on dispatch", "dynamic import")
    Rel(main, lifecycle, "Lazy-loads on dispatch", "dynamic import")
    Rel(main, cleanup, "Lazy-loads on dispatch", "dynamic import")
    Rel(main, otherClusters, "Lazy-loads on dispatch", "dynamic import")

    Rel(specVal, libModules, "Calls library functions", "ESM import")
    Rel(handoff, libModules, "Calls library functions", "ESM import")
    Rel(lifecycle, libModules, "Calls library functions", "ESM import")
    Rel(cleanup, helpers, "Uses safeJoin / legacyImport", "ESM import")
    Rel(cleanup, libModules, "Calls library functions", "ESM import")
    Rel(otherClusters, libModules, "Calls library functions", "ESM import")

    Rel(helpers, legacyMjs, "legacyImport(name) → await import('.../bin/lib/<name>.mjs')", "dynamic import")
    Rel(helpers, legacyJs, "legacyRequire(name) → require('.../bin/lib/<name>.js')", "createRequire")
    Rel(specVal, errors, "Throws ValidationError on bad input", "throw")
    Rel(handoff, errors, "Throws ValidationError on bad input", "throw")
    Rel(cleanup, errors, "Throws ValidationError on bad input", "throw")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Key invariants

| Invariant | Enforced by | Notes |
|---|---|---|
| `process.exit` is called from exactly two sites | `scripts/check-process-exit.mjs` allowlist | `src/cli/bin.ts` (CLI path) + `src/lib/ipc.ts` `runIpc()` (subprocess path) |
| Every command's `Impl` is a pure function | `tests/test-cli-*.test.ts` per-cluster smoke tests | Returns `CommandResult{exitCode, message?}`; the citty `run()` wrapper translates the result into a throw |
| `legacyImport` and `legacyRequire` resolve from the package root, not cwd | `tests/test-m9-pitcrew-regressions.test.ts` B3 cases | Anchored at `fileURLToPath(import.meta.url)` — defends against attacker-cwd RCE |
| `subCommands` is lazy | `src/cli/main.ts` `lazy()` thunk wrapper | `node dist/cli/bin.mjs --version` imports zero command modules |
| Stderr is redaction-wrapped | `src/cli/bin.ts` `emitErrorLine` | Prevents env-var-shaped LLM error payloads + absolute filesystem paths from leaking (ADR-012) |

## Strangler-tail timeline

The legacy boundary on the right of the diagram (`bin/lib/*.{js,mjs}`) is **transitional**. Three of the deepest-used legacy modules already have TS ports in `src/lib/` that the dashboard cluster could call directly; doing so retires the corresponding `legacyImport`/`legacyRequire` callsite. M11 cleanup completes the retirement and deletes the entire `bin/lib/` boundary:

| Module group | Status post-M9 | Retired in |
|---|---|---|
| `bin/lib-ts/*` (the 1.x strangler staging area) | **deleted** at M9 cutover (`git mv` to `src/lib/`) | M9 |
| `bin/lib/*.mjs` (38 ESM legacy) | **retained** under `bin/package.json {"type": "commonjs"}` scope | M11 |
| `bin/lib/*.js` (155 CJS legacy) | **retained** for the RC soak window | M11 |
| `bin/cli.js` (5,359-line monolith) | **retained as dead code** in the published package | M11 |
| 82 obsolete `tests/*.test.js` | **retained** until target modules go | M11 |

Once M11 deletes the legacy tail, the right-hand `Container_Boundary` in this diagram disappears and the `_helpers.ts` component shrinks to just `safeJoin` + `assertUserPath` (the two path-safety helpers stay).

## See also

- `specs/architecture.md` §Component Interaction Diagram — the parent L2 container view
- [`specs/architecture-l3-core-lib.md`](./architecture-l3-core-lib.md) — companion L3 decomposition for the `Core Lib` container
- `specs/decisions/adr-002-cli-framework.md` — citty selection + lazy `subCommands` rationale
- `specs/decisions/adr-006-error-model.md` — typed-error → exitCode contract pinned by the bin.ts catch
- `specs/decisions/adr-009-ipc-stdin-path-traversal.md` — path-safety boundary shared with `_helpers.safeJoin`
- `specs/decisions/adr-012-secrets-redaction.md` — stderr-redaction contract pinned in `bin.ts`
