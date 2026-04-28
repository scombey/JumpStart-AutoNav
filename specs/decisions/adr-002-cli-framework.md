---
id: "adr-002"
phase: 3
agent: Architect
status: Accepted
created: "2026-04-24"
updated: "2026-04-28"
version: "2.0.0"
approved_by: "Samuel Combey"
approval_date: "2026-04-28"
upstream_refs:
  - specs/architecture.md
dependencies:
  - architecture
risk_level: high
owners:
  - Samuel Combey
sha256: null
---

# ADR-002: CLI Framework — citty (resolved 2026-04-28 after T4.7.0 depth-cost analysis)

> **Status:** Accepted (resolved from Provisional after the T4.7.0 [Blocker] analysis)
> **Date:** 2026-04-28 (v2.0.0; supersedes v1.0.0 of 2026-04-24)
> **Decision Maker:** The Architect, confirmed by Samuel Combey

---

## Context

The CLI ships 147 leaf subcommands across a 4–5-level argv dispatch tree (argv[2] through argv[5] depth — confirmed by Pit Crew Adversary code count). The TypeScript rewrite must register all 147 with:
- Byte-identical `--help` output (NFR-R02; `scripts/diff-cli-help.mjs` gate)
- Type-safe argument parsing
- Consistent subprocess IPC dispatch for the dual-mode lib modules (every `bin/lib/<name>.js` is also a runnable subcommand)

Two primary candidates from the PRD and rewrite plan: **commander v14.0.3** (mature) vs **citty v0.2.2** (pre-1.0, UnJS-ecosystem).

Context7 re-verify 2026-04-24 findings:
- Commander is at v14.0.3, **NOT v12 as the rewrite plan originally cited** (2 majors ahead).
- Citty v0.2.0 was a breaking release 3 months ago; breaks were in arg-parser + ESM-only flip — **NOT in `subCommands` registration API**, which is the surface this codebase consumes.
- Commander has 9,700+ npm dependents; citty has an order of magnitude fewer, concentrated in UnJS ecosystem (Nuxt, Nitro).

ADR v1.0.0 (2026-04-24) committed PROVISIONALLY to commander v14, with the final resolution deferred to T4.7.0's quantitative depth-cost analysis. The threshold was set in advance: **if commander's boilerplate exceeded citty's by >1000 lines, invert the decision to citty.**

---

## T4.7.0 depth-cost analysis (resolution evidence — 2026-04-28)

`scripts/estimate-commander-boilerplate.mjs` enumerated `bin/cli.js`'s 147-leaf 4–5-level subcommand tree and computed the line-count cost of each framework's registration boilerplate.

**Result** (`.jumpstart/metrics/cli-framework-cost.json`):

| Metric | Value |
|---|---|
| Source file | `bin/cli.js` (5360 lines) |
| Subcommand count | **147** |
| Nested groups (2nd-level) | **91** |
| Commander lines | 2709 |
| Citty lines | 339 |
| **Delta** | **2370** |
| Decision threshold | >1000 → citty |

**The delta is 2.37× the pre-committed threshold.** Commander's per-subcommand chain registration (`.command()` + `.description()` + `.option()*N` + `.action()` ≈ 8 + N lines per leaf) compounds across 147 leaves and 91 nested groups. Citty's lazy `subCommands` map (1 line per leaf) does not.

---

## Decision

**Adopt citty as the CLI framework for `src/cli/main.ts`.**

- Pin `citty@^0.2.2` (latest at decision time; 0.2.x API is the surface we consume).
- Lazy `subCommands: { name: () => import('./commands/name.js') }` registration pattern.
- Commander dependency NOT added to `package.json`.
- The post-T4.7.0 sweep across 4 specs + 1 ADR amendment is the reason this ADR ships at v2.0.0.

**Upgrade pathway**: citty's API surface for `subCommands` has been stable since v0.1; the 0.2.0 break was scoped to areas we don't consume. Track citty's path to 1.0; bump pin when 1.0 ships AND the upgrade is mechanical.

**Trade-offs accepted**:
- Smaller ecosystem of pre-built plugins (e.g., shell-completion generators favor commander). If we want completion at some point, we'll write the generator ourselves OR adopt a citty plugin if one exists.
- Less Stack-Overflow / training-data depth than commander. Mitigated by writing thorough inline comments + linking to citty docs from `src/cli/main.ts`'s header.
- Pre-1.0 status remains. Mitigated by the analysis showing the consumed API surface is stable; the maintenance signal from UnJS (Pooya Parsa: H3, Nitro, ofetch) is strong.

---

## Consequences

### Positive
- **2370 lines of boilerplate avoided** across `src/cli/commands/*.ts` registration sites — measurable maintenance reduction.
- **Lazy subcommand loading**: `jumpstart --version` / `jumpstart --help` no longer eager-imports all 147 command modules. Startup-time win that scales with subcommand count.
- **ESM-first design** matches the M9 cutover trajectory (Node ≥24, `"type": "module"`, exports map). Citty was built for this world from day 1.
- **Quantitative decision**: the pre-committed threshold + machine-produced JSON report means the choice is reproducible and auditable.
- Removes the "CLI framework" speculation row from the architecture's risk register.

### Negative
- One-time spec sweep cost: ADR-002 v2.0.0, `architecture.md` (Technology Stack + C4 + Project Structure + ADR-002 summary), `implementation-plan.md` T4.7.1 description. Done in this PR.
- Pre-1.0 dependency. Mitigated as above.
- Future contributors familiar with commander will need to read citty's docs.

### Neutral
- Both frameworks support `.d.ts` export; neither blocks Must Have #2 (machine-readable return shapes).
- Both support custom help renderers.

---

## Alternatives Considered

### Commander v14 (the v1.0.0 provisional choice)
- **Description:** Use commander v14.0.3 with explicit `.addCommand()` chain registration per leaf.
- **Pros:** Mature (14+ majors since 2011), 9,700+ dependents, predictable TS types, rich ecosystem of examples. Zero ecosystem-churn risk.
- **Cons:** Per-leaf boilerplate compounds — measured at 2709 lines vs citty's 339 (+2370). Eager-loading subcommand registration. CommonJS-flavored API in an ESM-first project.
- **Reason Rejected**: T4.7.0 analysis showed the boilerplate delta exceeds the pre-committed >1000 threshold. The analysis was authored explicitly to make this decision data-driven; the data points to citty.

### Custom minimal CLI (hand-roll)
- **Description:** Write our own argv parser + subcommand dispatcher.
- **Pros:** Zero third-party lock-in.
- **Cons:** Re-implements the 5,359-line monolith we're trying to escape. No `--help` generation, no completion, no mature argument-parsing primitives.
- **Reason Rejected:** Strictly worse than either candidate; defeats the rewrite's modernization purpose.

### clipanion / cac / oclif
- **Description:** Other CLI frameworks in the ecosystem.
- **Pros:** Each has its strengths; oclif in particular has Salesforce-scale adoption.
- **Cons:** Clipanion stuck on RC for >1 year; cac has low maintenance velocity; oclif is heavier and more opinionated about project structure than needed here.
- **Reason Rejected:** Commander + citty already cover the design space; adding a third candidate doesn't sharpen the decision.

---

## Migration plan (now that the decision is final)

1. **Spec sweep** (this PR, on branch `feat/m8-cli-dispatcher`):
   - ADR-002 amended to v2.0.0 (this document).
   - `specs/architecture.md`: Technology Stack swap, C4 diagram label swap, Project Structure tree swap, ADR-002 summary entry update, narrative references swap.
   - `specs/implementation-plan.md`: T4.7.1 description swap.
   - `tsdown.config.ts`: `'commander'` → `'citty'` in `deps.neverBundle`.
   - `specs/insights/architecture-insights.md`: addendum noting the resolution.

2. **T4.7.1**: author `src/cli/main.ts` — root citty `defineCommand({ subCommands: ... })` program.

3. **T4.7.2**: decompose 120+ subcommands into ~30 command files in `src/cli/commands/`, each exporting a `defineCommand`-shaped default.

4. **T4.7.3**: `scripts/diff-cli-help.mjs` — must produce 0 diffs against committed help-output snapshots.

5. **T4.7.4**: IPC envelope regression test suite for every dual-mode lib.

6. **T4.7.5**: slash-command contract test.

---

## References

- [specs/architecture.md ADR-002 summary](../architecture.md#architecture-decision-records)
- Context7 re-verify 2026-04-24: commander@14.0.3, citty@0.2.2
- Pit Crew Adversary Finding 2 (depth-cost analysis correctness)
- [specs/implementation-plan.md T4.7.0 `[Blocker]`](../implementation-plan.md#milestone-9-m8--cli-dispatcher-stage-47)
- [`scripts/estimate-commander-boilerplate.mjs`](../../scripts/estimate-commander-boilerplate.mjs) — the analysis script
- [`.jumpstart/metrics/cli-framework-cost.json`](../../.jumpstart/metrics/cli-framework-cost.json) — the analysis report (per-subcommand breakdown)
