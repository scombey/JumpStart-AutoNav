<!--
PR template for the post-2.0 codebase. The strangler-fig migration
(M0–M11) is complete; this template covers the steady-state engineering
contract enforced by CI.
-->

## What this PR does

<!-- 1-3 sentences: what changed and why. -->

## Behavior-change posture

**Choose one** (delete the other):

- [ ] **No user-visible behavior change.** Same CLI output, same exit codes, same stdout/stderr, same IPC envelope shape. Cross-module contract harness reports zero new drift.
- [ ] **Intentional behavior change.** Documented in `CHANGELOG.md` under `[Unreleased]`. Commit message starts with `feat:` or `BREAKING CHANGE:` per the semver discipline ADR.

If the first checkbox is checked, the reviewer's job is to confirm the assertion; if any of the harness / coverage ratchet / CLI help snapshot / holodeck baseline gates fail, this is by definition NOT zero-behavior-change.

## Tests added or updated

- [ ] Cross-module contract harness: zero new drift
- [ ] Coverage ratchet: at or above baseline (see `scripts/check-coverage-ratchet.mjs` output)
- [ ] CLI help snapshot: byte-identical pre/post (when CLI surface changes)
- [ ] Holodeck `--scenario baseline`: PASS
- [ ] IPC v0/v1 fixture pair committed (per ADR-007) — only required for IPC-eligible lib modules
- [ ] Production-quality CI floor: `tsc --noEmit` + `biome check` + `check-public-any` + `check-process-exit` all green

## Linked specs

<!-- For traceability. PR reviewer cross-checks claims against these. -->

- specs/architecture.md §
- specs/decisions/adr-XXX-...
- specs/prd.md E?-S?

## Reviewer checklist

- [ ] Behavior-change checkbox above is honest (verified against CI green)
- [ ] No `any` type in any newly-exported `.d.ts` (Biome `noExplicitAny` + `scripts/check-public-any.mjs` confirm)
- [ ] No new `process.exit(` outside `src/cli/bin.ts` and `src/lib/ipc.ts` (`scripts/check-process-exit.mjs` confirms)
- [ ] No empty catch blocks swallowing thrown typed errors (per ADR-006)
- [ ] Path-typed input fields use `safePathSchema` from `src/lib/path-safety.ts` (per ADR-009) — only required for IPC-eligible modules with paths
