# ADR-013: Filesystem-Safe Wrappers (`safeReadFile`, `safeWriteFile`, `safeStat`)

> **Status:** Proposed (stub) · **Date:** 2026-04-27 · **Decision Maker:** The Architect
>
> Authored as a stub during M2 Pit Crew remediation to close the dangling
> ADR-013 references in `bin/lib-ts/hashing.ts`, `bin/lib-ts/path-safety.ts`,
> and `specs/implementation-plan.md` Deviation Log. The ADR will be fleshed
> out and accepted in M5 alongside `bin/lib-ts/ipc.ts` (the IPC subprocess
> runner that introduces the canonical fs-trust-boundary call sites).

---

## Context

ADR-009 introduced the two-layer path-safety primitives:

- **Layer 1**: `safePathSchema(boundaryRoot)` — Zod refinement at envelope-parse time.
- **Layer 2**: `assertInsideRoot(p, root, opts?)` — explicit helper at `fs.*` call sites.

The Pit Crew M2 round (Adversary finding 3) confirmed that Layer 2 is opt-in: any IPC module using bare `fs.readFileSync(input.path)` without first calling `assertInsideRoot` inherits the symlink-escape and absolute-path-disclosure attack classes that `safePathSchema` does not lexically catch.

The forward-secure architectural fix is a **filesystem-safe wrapper family** that bundles the assertInsideRoot check with the fs operation, eliminating the opt-in failure mode. Until ADR-013 lands, every IPC module port carries the responsibility to wire Layer 2 by hand — a discipline that 7 of 7 leaf-utility ports failed to apply in M2 (closed via per-module patches per the Pit Crew remediation commit).

## Decision (provisional)

Author `bin/lib-ts/safe-fs.ts` (filename TBD) exposing wrappers that mirror the `fs.*` signatures the framework uses but require a `boundaryRoot` first parameter:

```ts
import { realpathSync } from 'node:fs';
import { ValidationError } from './errors.js';
import { assertInsideRoot } from './path-safety.js';

export function safeReadFile(boundaryRoot: string, p: string, encoding?: BufferEncoding): string | Buffer {
  assertInsideRoot(p, boundaryRoot, { followSymlinks: true });
  return readFileSync(path.resolve(boundaryRoot, p), encoding);
}

export function safeWriteFile(boundaryRoot: string, p: string, data: string | Buffer): void {
  assertInsideRoot(p, boundaryRoot, { followSymlinks: false });
  // followSymlinks=false on writes — we don't want to follow an
  // attacker-planted symlink at the LEAF position when writing.
  writeFileSync(path.resolve(boundaryRoot, p), data);
}

export function safeStat(boundaryRoot: string, p: string): Stats {
  assertInsideRoot(p, boundaryRoot, { followSymlinks: true });
  return statSync(path.resolve(boundaryRoot, p));
}
```

Plus a Biome custom rule (or scripts/check-bare-fs.mjs) that fails CI when any TS file under `bin/lib-ts/` or `src/` imports `node:fs` directly (allowlisted: `bin/lib-ts/safe-fs.ts` itself, plus the 4-module cluster that needs raw fs because they ARE the wrapper layer: `io.ts`, `errors.ts`, `path-safety.ts`, `hashing.ts`'s manifest-write path which uses an atomic rename trick).

## Consequences

### Positive
- Closes the entire class of "port author forgot to wire Layer 2" attacks at the type-system level — bare `fs.*` is no longer reachable from IPC code paths.
- Centralizes the symlink-follow policy in one auditable file (current state: 14 ports each have to remember the `followSymlinks: true` opt-in).
- Hashing manifest atomicity (Adversary 5) gets a natural home: `safeWriteFile` can do the rename-into-place dance that we currently inline.

### Negative
- Every existing port that touches fs needs a one-time migration. With the M2 cluster's 7 ports + `path-safety.ts` itself + future M3-M8 ports, that's ~15 modules.
- The Biome rule enforcement adds a CI gate that has to be authored and verified; deferring to M5 keeps the M2 close-out scope manageable.
- Writes under symlinks are now refused — current callers don't rely on this, but a future `bin/holodeck.js` flow that legitimately writes under a symlinked workspace would need an explicit opt-in.

### Neutral
- The legacy `bin/lib/*.js` modules continue to use raw `fs.*`. Strangler-fig discipline isolates them.

## Alternatives Considered

### Per-port hand-wiring of `assertInsideRoot`
- **Description:** Continue the current pattern — every port author adds an `assertInsideRoot` call before any `fs.*`.
- **Pros:** No new abstraction; existing pattern.
- **Cons:** 7 of 7 M2 ports failed to do this; pattern relies on author memory + reviewer vigilance.
- **Reason Rejected:** The hand-wiring failure mode is the entire reason this ADR exists.

### Sandboxed subprocesses (e.g. via Node's `--permission` flag)
- **Description:** Run each IPC subprocess with Node's experimental permission model (`--allow-fs-read=<root>`, `--allow-fs-write=<root>`).
- **Pros:** Kernel-level enforcement.
- **Cons:** Experimental flag (Node 22+); doesn't help library-mode callers; spawning each IPC call as a fresh subprocess has unacceptable startup-time cost (NFR-P02).
- **Reason Rejected:** Not stable enough for v2.0 floor; doesn't cover the library-mode trust boundary.

## Scope and Sequencing

- **M5 (T4.1.8 alongside `ipc.ts`)**: Author `bin/lib-ts/safe-fs.ts` + Biome custom rule. Migrate `path-safety.ts` to be the authoritative caller of `assertInsideRoot` from inside `safe-fs.ts`. Migrate `hashing.ts` manifest-write to use `safeWriteFile` with rename-into-place atomicity. Migrate any other ported module that touches fs.
- **M9 (cutover)**: Verify legacy `bin/lib/*.js` is fully retired so the Biome rule can be tightened to forbid raw `fs.*` everywhere except `safe-fs.ts`.

## References

- [`specs/decisions/adr-009-ipc-stdin-path-traversal.md`](./adr-009-ipc-stdin-path-traversal.md) — the two-layer model this builds on.
- [`bin/lib-ts/path-safety.ts`](../../bin/lib-ts/path-safety.ts) — current Layer-2 helper.
- M2 Pit Crew round (commit `<TBD after remediation lands>`) — Adversary findings 3 + 5 that motivated this.
