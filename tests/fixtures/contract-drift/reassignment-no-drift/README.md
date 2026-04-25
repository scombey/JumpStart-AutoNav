# Reassignment-no-drift fixture

**Defends against a known harness false-positive class.** Pit Crew (QA #4 / Reviewer M1) flagged that a flat last-write-wins variable→class map produces spurious drift incidents when a single variable is reassigned across class types — common in legacy JS during refactors and conditional state machines.

## What this fixture proves

The pattern `let x = new A(); x.aMethod(); x = new B(); x.bMethod()` should produce **ZERO** drift incidents — both calls hit methods declared on the class assigned at the time of the call.

The harness must therefore resolve `x` per call site, not globally.

## Layout

```
reassignment-no-drift/
├── README.md          ← this file
└── reassignment.js    ← const-then-reassigned across two classes
```

## Expected harness behavior

```bash
node scripts/extract-public-surface.mjs --root=tests/fixtures/contract-drift/reassignment-no-drift --out=/tmp/r.json
```

Reports **0** drift incidents. If the count is non-zero, the harness has regressed to flat last-write-wins — this fixture is the canary.

## See also

- `scripts/extract-public-surface.mjs` — per-call-site instantiation resolution
- `tests/test-public-surface.test.ts` — runs this fixture as a 0-incident assertion
- Pit Crew M1 round, QA #4 / Reviewer M1 finding
