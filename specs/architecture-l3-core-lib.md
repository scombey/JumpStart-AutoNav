# Level-3 Component Diagram — Core Lib

**Container under decomposition:** `Core Lib (Ports of bin/lib/*)` (from `specs/architecture.md` §Component Interaction Diagram, Level 2).

**Source tree:** `src/lib/` (111 modules post-M9 cutover).

This diagram lists the Core Lib's components grouped by cluster — the same clusters Scout identified in the legacy `bin/lib/` codebase and that the implementation plan's port stages (Stage 4.1 through 4.7) tracked individually. Showing every one of the 111 modules would defeat the diagram's purpose; the components below are **cluster anchors** — the module that the rest of the cluster depends on. The full module list per cluster lives in `specs/architecture.md` §System Components.

> **Turn-2 commitment.** This file (alongside [`architecture-l3-cli-dispatcher.md`](./architecture-l3-cli-dispatcher.md)) fulfills the Architect Turn-2 promise from `architecture.md` §Component Interaction Diagram. Implementation tracker: T6.9.

## Diagram

```mermaid
C4Component
    title Component Diagram — Core Lib (src/lib/, 111 modules grouped by cluster)

    Container(cli, "CLI Dispatcher", "TypeScript / citty", "src/cli/* — invokes Core Lib functions per dispatched command")
    Container(testing, "Testing + E2E Infra", "TypeScript / vitest + bespoke", "Holodeck e2e + headless runner subprocesses")
    System_Ext(liteLLM, "LiteLLM Proxy", "Local OpenAI-compatible gateway")
    System_Ext(userRepo, "User project files", ".jumpstart/ + specs/")

    Container_Boundary(libCore, "Core Lib (src/lib/)") {

        Component_Boundary(foundation, "Foundation cluster (8 modules)") {
            Component(errors, "errors.ts", "JumpstartError hierarchy", "Base error class + ValidationError(2) + LLMError(3). Every cluster throws subclasses; bin.ts catches.")
            Component(ipc, "ipc.ts", "isDirectRun + runIpc", "Dual-mode subprocess shim. Second of two allowlisted process.exit sites.")
            Component(pathSafety, "path-safety.ts", "assertInsideRoot", "Trust-boundary guard — every user-supplied path goes through it (ADR-009).")
            Component(io, "io.ts", "writeResult + wrapTool", "Throw-based contract — wrapTool catches and shapes IPC envelopes.")
            Component(hashing, "hashing.ts", "hashContent + hashFile", "SHA-256 helpers; pinned binary-vs-utf8 semantics.")
            Component(otherFoundation, "locks · timestamps · diff · secret-scanner", "4 leaves", "Locks (file-locks); timestamps (ISO_UTC + audit); diff (unified-diff); secret-scanner (redactSecrets — used by bin.ts via ADR-012).")
        }

        Component_Boundary(config, "Config cluster (5 modules)") {
            Component(configLoader, "config-loader.ts", "loadConfig", "Project + global merge with profile expansion via dynamic import.")
            Component(otherConfig, "config-yaml · config-merge · framework-manifest", "3 leaves", "YAML round-trip; three-way-merge for upgrade safety; framework-owned manifest for upgrade-time conflict detection.")
        }

        Component_Boundary(specVal, "Spec validation cluster (~12 modules)") {
            Component(validator, "validator.ts", "validate + validateArtifact", "Zod-primary + JSON-Schema-walker fallback. MODULE_DIR = path.dirname(fileURLToPath(import.meta.url)) for schemas dir lookup.")
            Component(otherSpecVal, "ambiguity-heatmap · complexity · context-chunker · invariants · template-watcher · smell-detector · spec-drift · simplicity-gate · scanner · proactive-validator", "10 leaves")
        }

        Component_Boundary(specGraph, "Spec graph + traceability (6 modules)") {
            Component(graph, "graph.ts", "buildFromSpecs + getCoverage", "Story↔task dependency graph used by handoff coverage + dashboard.")
            Component(otherGraph, "traceability · bidirectional-trace · impact-analysis · adr-index · repo-graph", "5 leaves")
        }

        Component_Boundary(state, "State + lifecycle (~10 modules)") {
            Component(stateStore, "state-store.ts", "loadState + updateState", "ESM module — `.jumpstart/state/state.json` r/w.")
            Component(dashboard, "dashboard.ts", "gatherDashboardData (async)", "Aggregates state + timeline + coverage. Loads handoff + next-phase legacy siblings via async dynamic import (post-M9 Pit Crew B1 fix).")
            Component(otherState, "timeline · usage · governance-dashboard · approve · checkpoint · focus · next-phase · …", "rest of cluster")
        }

        Component_Boundary(llm, "LLM cluster (~6 modules)") {
            Component(llmProvider, "llm-provider.ts", "createLLMProvider", "openai SDK against LITELLM_BASE_URL with HTTPS-or-localhost allowlist (ADR-011). Lazy-loads `openai` via createRequire so mock-only consumers don't pay the import cost.")
            Component(otherLlm, "model-router · cost-router · mock-responses · model-governance · prompt-governance", "5 leaves")
        }

        Component_Boundary(marketplace, "Marketplace cluster (4 modules)") {
            Component(install, "install.ts", "installItem + uninstallItem", "ZIP fetch + SHA-256 verify + ZIP-slip-safe extract (ADR-010). Uses redactSecrets when logging response bodies.")
            Component(otherMkt, "integrate · registry · upgrade", "3 leaves")
        }

        Component_Boundary(governance, "Governance + enterprise + collaboration (~70 modules)") {
            Component(complexClusters, "compliance-packs · risk-register · waiver-workflow · evidence-collector · policy-engine · …", "Largest cluster aggregate", "~70 mostly-self-contained modules across the governance/enterprise/collaboration roll-ups. Most are thin wrappers around state files; a handful (data-contracts, contract-checker, regulatory-gate) cross into spec-validation.")
        }

        Component_Boundary(testInfra, "Testing/e2e helpers (8 modules)") {
            Component(holodeck, "holodeck.ts", "runScenario", "Library port; the bin/holodeck.mjs runner imports it for E2E scenario execution.")
            Component(otherTest, "headless-runner · simulation-tracer · smoke-tester · regression · verify-diagrams · context7-setup · tool-bridge · tool-schemas", "7 leaves")
        }
    }

    Rel(cli, errors, "Throws + catches typed errors", "throw / instanceof")
    Rel(cli, pathSafety, "Gates every user-supplied path", "assertInsideRoot")
    Rel(cli, io, "Writes IPC-shaped JSON results", "writeResult")
    Rel(cli, configLoader, "Loads project + global config", "ESM import")
    Rel(cli, validator, "Validates artifacts on demand", "ESM import")
    Rel(cli, graph, "Builds spec graph", "ESM import")
    Rel(cli, stateStore, "Reads/writes phase state", "ESM import")
    Rel(cli, dashboard, "Renders progress + governance dashboards", "ESM import")
    Rel(cli, llmProvider, "Creates LLM provider", "ESM import")
    Rel(cli, install, "Installs marketplace items", "ESM import")

    Rel(dashboard, stateStore, "Loads state.json", "ESM import")
    Rel(dashboard, graph, "Pulls coverage", "ESM import")
    Rel(validator, errors, "Throws ValidationError on schema mismatch", "throw")
    Rel(install, errors, "Throws ValidationError on ZIP-slip + LLMError on registry HTTP", "throw")
    Rel(install, pathSafety, "Gates each ZIP entry's resolved path", "assertInsideRoot")
    Rel(llmProvider, liteLLM, "Chat completions", "HTTPS via openai SDK")
    Rel(install, userRepo, "Writes installed items into .jumpstart/skills/", "fs")
    Rel(stateStore, userRepo, "Reads/writes .jumpstart/state/state.json", "fs")
    Rel(dashboard, userRepo, "Reads .jumpstart/usage-log.json + specs/", "fs")
    Rel(testing, holodeck, "Runs E2E scenarios", "ESM import")
    Rel(ipc, errors, "Catches JumpstartError → exitCode", "instanceof")
    Rel(complexClusters, stateStore, "Reads/writes governance state files", "ESM import")
    Rel(complexClusters, errors, "Throws on policy violations + missing inputs", "throw")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Cluster overview

| Cluster | Module count | Anchor | Cross-cluster deps | Notes |
|---|---|---|---|---|
| **Foundation** | 8 | `errors.ts`, `path-safety.ts`, `ipc.ts` | None — cluster is the foundation | Every other cluster imports from here. `errors.ts` defines the typed-error contract; `ipc.ts` is the dual-mode subprocess shim. |
| **Config** | 5 | `config-loader.ts` | Foundation (errors + path-safety) | Three-way-merge logic preserves user customizations across framework upgrades. |
| **Spec validation** | ~12 | `validator.ts` | Foundation, Schemas (in `src/schemas/`) | Zod-primary; JSON-Schema-walker fallback for inline schemas in tests. `MODULE_DIR` resolves via `import.meta.url`. |
| **Spec graph** | 6 | `graph.ts` | Foundation, Spec validation | Story↔task graph drives handoff coverage + dashboard summary. |
| **State + lifecycle** | ~10 | `state-store.ts`, `dashboard.ts` | Foundation, Config, Graph | `dashboard.ts` is async post-M9 (B1 fix) so its handoff/next-phase ESM legacy siblings load correctly. |
| **LLM** | ~6 | `llm-provider.ts` | Foundation | `LITELLM_BASE_URL` validated at startup per ADR-011. `openai` SDK lazy-loaded via `createRequire`. |
| **Marketplace** | 4 | `install.ts` | Foundation, Path safety, Errors | ZIP-slip prevention per ADR-010. SHA-256 + manifest hashing + IDE-canonical remap. |
| **Governance + enterprise + collaboration** | ~70 | (no single anchor — distributed) | State, Spec validation | Largest aggregate cluster. Most modules are thin wrappers around `.jumpstart/state/*.json` files; some cross into spec-validation (data contracts, regulatory gate). |
| **Testing/e2e helpers** | 8 | `holodeck.ts` | All clusters (it exercises them) | Library ports of the runners. The `bin/holodeck.mjs` runner imports `holodeck.ts` + state-store + usage. |

Total: **8 + 5 + 12 + 6 + 10 + 6 + 4 + 70 + 8 ≈ 129** named modules. The discrepancy with the 111-file count comes from one-module-per-row vs. one-module-per-`.ts`-file: a few clusters double-count (e.g. `simulation-tracer.ts` is in both Foundation/io and Testing). The on-disk file count is the load-bearing one.

## Key invariants

| Invariant | Enforced by | Notes |
|---|---|---|
| Foundation modules have no cross-cluster imports | Static analysis via `scripts/extract-public-surface.mjs` | The cluster is the foundation; cycles surface immediately. |
| Every module is dual-mode (library + subprocess) | The IPC entry-block at the bottom of each module + `tests/fixtures/ipc/` | Either `await runIpc(handler, schema)` if `isDirectRun(import.meta.url)` (subprocess path) or normal ESM exports (library path). |
| `process.exit` is forbidden in cluster code | `scripts/check-process-exit.mjs` allowlist of `[src/cli/bin.ts, src/lib/ipc.ts]` | Library functions throw `JumpstartError` subclasses; the IPC adapter or the CLI bin does the exit translation. |
| Path-safety guards every user input | `assertInsideRoot` from `path-safety.ts` is the canonical gate | Documented in ADR-009; pinned by `tests/test-m8-pitcrew-regressions.test.ts` + `tests/test-m9-pitcrew-regressions.test.ts`. |
| Dashboard's lazy sibling-loaders degrade to `null` (never throw) | `try/catch` with debug-only error logging | Post-M9 the loaders are async to handle ESM legacy modules correctly; the silent-degrade contract is preserved. |

## See also

- [`specs/architecture.md`](./architecture.md) §Component Interaction Diagram — parent L2 container view
- [`specs/architecture-l3-cli-dispatcher.md`](./architecture-l3-cli-dispatcher.md) — companion L3 for the CLI Dispatcher container
- [`specs/decisions/adr-006-error-model.md`](./decisions/adr-006-error-model.md) — typed-error contract that constrains the cluster boundary
- [`specs/decisions/adr-009-ipc-stdin-path-traversal.md`](./decisions/adr-009-ipc-stdin-path-traversal.md) — path-safety boundary
- [`specs/decisions/adr-010-zipslip-prevention.md`](./decisions/adr-010-zipslip-prevention.md) — install.ts ZIP-slip contract
- [`specs/decisions/adr-011-llm-endpoint-validation.md`](./decisions/adr-011-llm-endpoint-validation.md) — LLM provider startup gate
- [`specs/decisions/adr-012-secrets-redaction.md`](./decisions/adr-012-secrets-redaction.md) — secret-scanner redaction contract
