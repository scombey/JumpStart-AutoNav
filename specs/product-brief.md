---
id: product-brief
phase: 1
agent: Analyst
status: Approved
created: "2026-04-24"
updated: "2026-04-24"
version: "1.0.0"
approved_by: "Samuel Combey"
approval_date: "2026-04-24"
upstream_refs:
  - specs/challenger-brief.md
  - specs/codebase-context.md
  - specs/typescript-rewrite-plan.md
dependencies:
  - challenger-brief
risk_level: medium
owners:
  - Samuel Combey
sha256: null
---

# Product Brief

> **Phase:** 1 -- Analysis
> **Agent:** The Analyst
> **Status:** Approved
> **Created:** 2026-04-24
> **Approval date:** 2026-04-24
> **Approved by:** Samuel Combey
> **Upstream Reference:** [specs/challenger-brief.md](challenger-brief.md)

---

## Analyst Execution Note — Compressed Elicitation + Pit Crew Review

Phase 1 continues Samuel Combey's "starting with phase 0 and keep going" directive (see `specs/challenger-brief.md` → Elicitation Override). The full Analyst protocol includes live `ask_questions` exchanges at Steps 2, 2.5, 3, 4, 5, 7, 8 and a subagent invocation at Step 1.5 (Requirements Extractor). This brief was initially compiled from already-captured context (challenger-brief, codebase-context, rewrite plan, baseline-verification findings) with the Analyst's best inference. Every section is explicit about which inferences are the Analyst's judgment and which are sourced from approved upstream artifacts.

**Pit Crew review pass (2026-04-24T21:00Z):** Before sealing, a four-agent Pit Crew ran in parallel on `specs/product-brief.md` and `specs/requirements-responses.md`:

1. **Adversary** (`.jumpstart/agents/adversary.md`) — stress-tested 5 weakest claims. 3 collapsed, 2 wobbled.
2. **Reviewer** (`.jumpstart/agents/reviewer.md`) — craft + downstream-usability audit. Verdict: APPROVE with minor edits; 3 Must-Fix items.
3. **QA / Quinn** (`.jumpstart/agents/qa.md`) — tested testability of validation criteria and Must Haves. 2 of 4 VCs 🔴; surfaced highest-value missing test.
4. **framework-docs-researcher** (external gap-agent, Context7 attempted + web-verified fallback) — verified library version claims.

Pit Crew outcomes were integrated into this brief (see revisions below and `specs/insights/product-brief-insights.md` entry at `2026-04-24T21:15:00Z`). Samuel approved "accept recommendations" on all six Tier-3 substantive decisions. The brief's state below reflects the post-Pit-Crew revision. A second verification pass may be run before Phase 2 kickoff at Samuel's discretion.

The Requirements Extractor subagent (`Jump Start: Requirements Extractor`) was not invoked separately in this compressed pass; its cross-reference job is absorbed into the Requirements Coverage Summary section below, which assesses each of the 18 PRD-checklist sections against the existing upstream material.

---

## Problem Reference

**Reframed Problem Statement (from Phase 0):**

> As the sole maintainer of `jumpstart-mode`, working primarily with AI coding assistants as contributors, Samuel Combey experiences expensive-feeling maintenance and slow improvement velocity because cross-module public contracts (tracer APIs, handoff schemas, stdin/stdout microservice envelopes) are described in ad-hoc prose and duplicated across producers, consumers, and tests. When contracts drift, drift surfaces at runtime (e.g., the holodeck-tracer mismatch discovered in this session) rather than at author/CI time. The root cause is the absence of a single source of truth for cross-module contracts — not a specific language choice. Samuel wants: (a) contract violations caught before merge, (b) a machine-readable public surface that AI assistants and humans can read the same way, (c) maintenance time spent building rather than verifying — **all achieved by upgrading tooling and contracts to professional production standards, not by lowering the quality bar.** "Fast and easy" is an outcome of rigorous tooling, not a tradeoff against rigor.

**Validation Criteria (Phase 0 + Pit Crew revisions 2026-04-24):**
1. **Contract-drift detection before merge** — target: 0 drift incidents reaching main over 6-month post-adoption window. Operationalized via the new cross-module contract integration test harness (see Must Have #7) + a `type:contract-drift` commit-msg convention enforced by a git hook so retrospective classification is unambiguous.
2. **Machine-readable public surface** — `.d.ts` exists for every `bin/lib/*.ts` module (post-port); `.d.ts` outputs are lint-scanned to forbid `any` in exported signatures (binary existence + content check, not just file presence).
3. **Regression share in weekly commits** — target ≤ 20 % of weekly commits tagged `fix-drift`/`fix-logic` vs `feat`/`chore`/`docs`. Enforced mechanically: commit-msg hook requires a `type:` trailer from a closed vocabulary; a CI cron generates `.jumpstart/metrics/regression-share.json` weekly. Not self-report; not honor-system.

**~~VC-retired:~~** *Former "time-to-first-commit reduces ≥30%" criterion retired 2026-04-24 per Pit Crew finding (Adversary + QA both 🔴): no baseline was measured, tasks were never enumerated, self-timed benchmarks carry motivated-reasoning bias. The underlying intent ("improvements feel fast") is captured qualitatively in Persona 1's future-state journey; the measurable load is carried by VCs 1 + 3 above.*

---

## Vision Statement

> `jumpstart-mode` becomes a framework where adding an improvement takes minutes, not half-hours; where cross-module contracts are declared once and enforced by CI before merge; and where AI coding assistants consuming the library modules read the same machine-readable type surface that humans read in their editor — without anyone lowering the production-quality bar to get there.

---

## User Personas

Persona count per `agents.analyst.persona_count: auto` — one persona per High-impact stakeholder (2) plus one combined persona for Medium-impact stakeholders (1). Low-impact stakeholders surface in the Stakeholder Map and risk register rather than in dedicated personas.

### Persona 1: Samuel Combey, Sole Maintainer

| Attribute | Detail |
|-----------|--------|
| **Goals** | • Land a typed CLI improvement (new subcommand / extended schema / new lib module) in ≤ 10 minutes end-to-end.<br>• Trust CI to catch cross-module contract drift before merge, without running the full holodeck locally.<br>• Spend weekly commits on *building features*, not *verifying what broke*. |
| **Frustrations** | • Opening `bin/cli.js` (5,359 lines) and having to trace whether each lib call is `require`-d or dynamically `import()`-ed.<br>• API drift between `bin/lib/*.js` files surfacing only at runtime (e.g. `SimulationTracer` had 4 methods, `holodeck.js` called 12; shipped to main undetected).<br>• No linter, formatter, or bundler — every editorial cleanup is manual.<br>• `npm audit` flagging 3 known issues with no automated remediation path. |
| **Technical Proficiency** | **High** (authors the framework; comfortable across JS, TS, shell, CI) |
| **Relevant Context** | Single maintainer with AI coding assistants (Claude Code, Cursor) as primary collaborators. Manages the framework in his spare attention; "velocity drain" has a direct personal cost. Young repo (21 commits over 2.5 months) — technical debt is still shallow enough to treat comprehensively. |
| **Current Workaround** | Manual cross-file verification before commits; defensive programming (`if (this.tracer.logUserProxyExchange)` guards); bespoke `npm run test:e2e` holodeck runs — which themselves were silently broken before this session. |
| **Representative Quote** | "I shouldn't need to hold twelve files in my head at once to rename one function. If the machine can check that contract for me, it should." |

### Persona 2: Claude Code Agent, AI Coding Assistant

| Attribute | Detail |
|-----------|--------|
| **Goals** | • Correctly spawn `node bin/lib/<module>.js` subprocesses with well-formed JSON on stdin, first try, without trial-and-error.<br>• Read the public contract of any lib module from a machine-parseable source (not prose in a README) so code suggestions are grounded in actual signatures.<br>• Maintain the dual-mode "library + subprocess" contract across ports without drift. |
| **Frustrations** | • Current public surface is prose: inline JSDoc comments, examples in `CLAUDE.md` / `AGENTS.md`, and implicit argument shapes inferred from code reading.<br>• No `.d.ts` files means no structured autocompletion signal for the tool ecosystem the assistant runs inside.<br>• Contract drift between modules is invisible to the assistant until a runtime failure surfaces it, at which point recovery is reactive, not preventive. |
| **Technical Proficiency** | **High** (agent with full filesystem + CLI access, runs `node` subprocesses, consumes type information programmatically) |
| **Relevant Context** | Primary contributor to `jumpstart-mode` alongside Samuel (per `specs/typescript-rewrite-plan.md` §2.5). Depends on the shipped `.jumpstart/agents/*.md` persona files being byte-stable because they ARE the assistant's execution spec. Represents a broader class: Cursor, VS Code Copilot, Windsurf. |
| **Current Workaround** | Infer from prose; spawn with best-guess JSON; interpret runtime errors as contract violations; escalate to human when runtime surface is too opaque. |
| **Representative Quote** | "When the module signature is in a `.d.ts`, I get it right the first time. When it's only in prose, I spawn three subprocesses before I succeed." |

### Persona 3: NPX Consumer, Medium-Impact Downstream User (combined)

| Attribute | Detail |
|-----------|--------|
| **Goals** | • Run `npx jumpstart-mode init` in a new project and get a working framework scaffold in under 30 seconds.<br>• Upgrade framework versions with confidence that existing `.jumpstart/config.yaml`, `.jumpstart/state/state.json`, and `.jumpstart/installed.json` files continue to parse.<br>• Never be forced to change Node versions unexpectedly. |
| **Frustrations** | • `Module type of file:///…/install.js is not specified` warnings appearing on Node 25+.<br>• No CHANGELOG.md; versioning signals only via git log.<br>• Unknown backward-compatibility posture between minor versions.<br><br>_Frustrations inferred from codebase evidence (mixed CJS/ESM warnings on Node 25+, missing CHANGELOG, `package.json` author field points to Jo Otey suggesting transfer). Not validated with live NPX consumers — PM validates at PRD approval (KU-05)._ |
| **Technical Proficiency** | **Medium** (competent with npm / npx, uses AI coding assistants, not a framework internals expert) |
| **Relevant Context** | Has `jumpstart-mode` installed in one or more projects today. Reads `AGENTS.md` / `CLAUDE.md` integrations via IDE. Updates framework versions infrequently. Represents both hypothetical end users AND the author-of-record `Jo Otey` (who holds the npm publish rights the rewrite's 2.0 ship will need to coordinate with). |
| **Current Workaround** | Pin framework version; tolerate warnings; read README before upgrade. |
| **Representative Quote** | "When I upgrade, I want nothing to change except what the changelog said would change." |

> **Persona Evolution:** If future contributors emerge (currently hypothetical), create a Persona Change Proposal using `.jumpstart/templates/persona-change.md`.

---

## User Journeys

### Current-State Journey — Samuel adds a feature to `bin/lib/`

| Step | Action | Thinking | Feeling | Pain Point (Severity) |
|------|--------|----------|---------|----------------------|
| 1 | Identifies a feature to add (e.g., "log a new event type in simulation-tracer"). | "This should be a 2-line change." | Optimistic | — |
| 2 | Opens `bin/lib/simulation-tracer.js`, `bin/holodeck.js`, `bin/headless-runner.js`, `tests/test-headless.test.js` to trace callers. | "I have to remember which of these uses `require` vs `import`." | Mild friction | Manual cross-file verification — **Moderate** |
| 3 | Adds the new method to SimulationTracer. Adds a call site in holodeck.js. | "Did I match the exact argument shape?" | Slight unease | Contract duplicated in 3 places — **Moderate** |
| 4 | Runs `npm test` — OOMs because of an unrelated infinite-loop bug. Diagnoses, fixes, retries. Suite now passes. | "This wasn't supposed to be part of the task." | Frustrated | Shared vitest worker pool memory leak from unrelated bug — **Critical** (observed 2026-04-24) |
| 5 | Runs `npm run test:e2e` — holodeck fails because a DIFFERENT cross-file API mismatch is silently broken. | "I didn't touch holodeck; why is it crashing?" | Confused + frustrated | Runtime-only contract drift — **Critical** |
| 6 | Spends 30+ minutes diagnosing the unrelated drift, fixes it as collateral, commits both changes. | "Two hours in; the feature itself was simple." | Resigned | Verification time dominates authoring time — **Critical** |

### Future-State Journey — Samuel adds the same feature post-rewrite

| Step | Action | Thinking | Feeling | Improvement |
|------|--------|----------|---------|-------------|
| 1 | Identifies feature. Opens `src/state/simulation-tracer.ts`. | "This should be a 2-line change." | Optimistic | Same starting energy, no architectural dread. |
| 2 | Adds the new method with a typed signature in one file. | "TypeScript will tell me every caller." | Confident | Single source of truth — signature declared once, consumed via type system by all callers. |
| 3 | Saves the file. Biome auto-formats. `tsc --noEmit` reports an error in `holodeck.ts` at the old call site. | "Editor is showing me exactly where to update." | In-flow | Drift surfaces at **author time** via the IDE, not runtime. |
| 4 | Updates the call site. Types check clean. | "I would have missed this file without the compiler." | Relieved | AI assistant also sees the type and suggests the correct call automatically. |
| 5 | Runs `npm test` — 83 files green in < 5s. Runs `node bin/holodeck.js --scenario baseline` — PASS. | "Nothing unrelated blocked me." | Focused | Baseline e2e gate trustworthy; no OOM, no broken tracer, no collateral bugs. |
| 6 | Commits. CI on the PR runs `tsc --noEmit`, `biome check`, vitest, coverage ratchet, holodeck baseline. All green in < 90s. Merges. | "Feature done. No collateral fires." | Satisfied | Total time to commit: 10–12 minutes vs current ~60–90 minutes. |

---

## Value Proposition

### Structured Format

- **For** solo maintainers of CLI frameworks who collaborate primarily with AI coding assistants,
- **Who** are losing velocity to cross-module contract drift surfacing only at runtime and to mixed-module-system friction,
- **The** TypeScript-rewritten `jumpstart-mode` (v2.0)
- **Is a** production-grade, typed, ESM-first agentic engineering framework
- **That** makes cross-module contracts a single source of truth (IDE + CI + `.d.ts`-for-agents) and collapses verification time so improvements land in minutes rather than hours
- **Unlike** keeping the status quo JS (contract drift + no build step + mixed CJS/ESM), a JSDoc+@ts-check gradual overlay (types without ecosystem/modernization), or a runtime port to Bun/Deno (out-of-scope runtime change)
- **Our approach** is strangler-fig migration with native jumpstart agents driving, zero-behavior-change PR discipline, coverage-ratchet CI, and `.d.ts` emission as a first-class agent-facing artifact.

### Narrative

> `jumpstart-mode` is a spec-driven agentic engineering framework whose primary contributors are AI coding assistants. Today those contributors — and its sole human maintainer — lose time to contract drift that only surfaces at runtime, because cross-module public signatures live only in prose and are duplicated across producers, consumers, and tests. The v2.0 TypeScript rewrite turns every exported signature into a single source of truth that the IDE, CI, and AI assistants consume the same way. Adding improvements becomes a matter of minutes rather than hours; production quality is held constant or raised (Biome + coverage ratchets + typed contracts); and the framework's dogfood credibility is earned in public by rewriting itself through its own agentic workflow.

---

## Competitive Landscape

Framed at the *strategy* level (what else could Samuel do with this attention budget), not the *tooling* level (the rewrite plan's §4 dependency matrix covers tooling-level alternatives).

| Alternative | Type | Strengths | Weaknesses | Relevance |
|-------------|------|-----------|------------|-----------|
| **Status quo — keep JS, add stricter discipline** | DIY Workaround | Zero migration risk; no velocity pause; no breaking change to consumers. | Leaves all three Phase-0 root causes in place (contract drift, mixed module system, no machine-readable surface for AI). Phase 0 validation criteria can't be met without changes. | **High** — the null hypothesis; rejected in Challenger per Path α. |
| **JSDoc + `// @ts-check` gradual overlay (type safety only)** | Indirect Substitute | ~1 day of effort for a type-check surface; preserves JS distribution; avoids ESM flip. | Addresses only bucket 1 (type safety) of the rewrite's three value buckets. No `.d.ts` for agents (JSDoc-derived schemas are weaker). Doesn't unify the mixed CJS/ESM module system. Doesn't unlock the modern ecosystem (citty, Zod v4, tsdown, Biome). Production-quality bar (Samuel's clarification) questionable at scale. | **Medium** — represents KU-01 in challenger-brief; documented as the load-bearing untested. Deferred to path δ as an optional Phase 0 side-experiment. |
| **The "JS-plus" bundle: JS + Biome v2 + Zod v4 (JS mode) + kill `createRequire` shims + `citty`-in-JS + `@ts-check` on public-API files only + `tsc --declaration --allowJs` for `.d.ts` emission** | Indirect Substitute (honest competitor) | Addresses ALL three value buckets without a full language migration. Bucket 1 (type safety): `@ts-check` on public-API files catches cross-module drift; `.d.ts` emitted via `tsc --allowJs` (5-min fact: yes, this works). Bucket 2 (modernization): Biome + Zod + citty work fine in JS; ESM flip independent of language. Bucket 3 (ecosystem): citty runs in JS, `.d.ts` for agents emitted from JSDoc. Probably 20–30 % of the full rewrite's effort. | Risk: public-vs-private surface boundary requires discipline. Generics support in JSDoc is weaker than in TS source. Refactor tooling ergonomics (rename/extract) is noticeably worse in JSDoc-typed JS vs native TS. Brief acknowledges this alternative was NOT evaluated during initial Path-α selection — Adversary correctly flagged this as a competitive blind spot. | **Medium-High — newly surfaced 2026-04-24.** Path α remains in force (rewrite proceeds) but PM should document why TS-native is preferred over this bundle in §PRD Decision Rationale. The 5-minute fact check ("name 3 Must Haves that strictly require a TS compiler") identifies `.d.ts` emission as the only candidate — and this bundle provides `.d.ts` via `tsc --allowJs`. The differentiation narrows to: editor tooling ergonomics, ecosystem typings depth, and "feels professional at scale" — honest but softer than the original framing suggested. |
| **Fork to a new language runtime (Bun / Deno / native TS without Node)** | Indirect Substitute | Modern runtime, native TS, fewer npm vulnerabilities. | Explicitly out of scope per Challenger constraints. Would break every AI-assistant integration that expects Node. | **Low** — out of scope. |
| **Competing agentic frameworks** (BMAD-METHOD, Claude Code SDK subagents, Aider, Continue.dev, Roo Code) | Direct Competitor (for developer attention, not for this codebase) | Broader ecosystem reach; some have TS-native implementations already. | Different philosophy (most are agent-runner frameworks, not spec-driven workflow frameworks). Not a drop-in replacement for `jumpstart-mode`'s specific niche (spec-first, phase-gated, dogfood-able). | **Medium** — competitive pressure for Samuel's time/attention rather than for this specific rewrite. If the rewrite fails to deliver, Samuel's energy could redirect here. |
| **Rust / Go CLI rewrite** | Indirect Substitute | Distribution simplicity (single binary); no npm audit surface; blazing fast. | Breaks the Node-ecosystem integration the framework depends on (npm marketplace, LiteLLM via `openai` SDK). Incompatible with AI-assistant `node bin/lib/*.js` subprocess contract. | **Low** — out of scope; would require re-founding the project. |

**Key Insight:** *The real competitor to the rewrite is the status quo — but the "JS-plus" bundle is a credible soft competitor the initial Path α decision did not evaluate.* After Pit Crew Adversary review, the Analyst acknowledges: the "three value buckets" frame was not rigorously independent of the selected path. A bundle of JS + Biome + Zod + `@ts-check` on public API + citty-in-JS + `tsc --allowJs`-generated `.d.ts` addresses all three buckets at perhaps 20–30 % of full rewrite cost. Path α (TS rewrite) remains in force — but the differentiation narrows to editor ergonomics, typings-ecosystem depth, and refactor tooling, not to "only TS can do this." PM to document the preference rationale in §PRD Decision Rationale.

> _This section is based on the human's domain knowledge (the `jumpstart-mode` author's prior research captured in `specs/typescript-rewrite-plan.md` §4) plus the Analyst's pattern-match against common rewrite patterns. Context7 was not invoked in this compressed pass; if the Architect needs live confirmation of any alternative's current capabilities, that's the appropriate phase to do it._

---

## Scope Recommendation

`scope_method: mvp`. Domain-adaptive rigor: `project.domain` is unset (developer-tooling / meta-framework does not map to a domain-complexity-CSV entry). No override applied.

### Must Have (MVP)

Every Must Have traces to a Phase 0 validation criterion.

| # | Capability | Validation Criterion Served | Rationale |
|---|-----------|---------------------------|-----------|
| 1 | Every `bin/lib/*.ts` module (post-port) declares its exported signatures in TypeScript; `tsc --noEmit` passes in CI on every PR. | VC1 (contract-drift caught before merge) | Single source of truth is the core root-cause fix; without this the rewrite delivers no value. |
| 2 | `.d.ts` files (or equivalent machine-readable contract manifest) shipped for every public lib module; AI assistants can consume signatures programmatically. Validated empirically by the KU-04 Phase-1.5 spike (Claude Code + Cursor invocation success-rate test on JSDoc vs `.d.ts`) **before** Phase 2 PM kickoff. | VC2 (machine-readable public surface) | Makes agent-consumers first-class; distinguishes this rewrite from a JSDoc-only overlay. Spike guards against Persona 2's characterization being a hypothesis without empirical backing (Adversary finding). |
| 3 | CLI behavioral contract preserved end-to-end: every existing command name, flag, exit code, stdout/stderr shape, and `bin/lib/<module>.js` IPC envelope continues to work. CI-enforced mechanism proving this is unchanged — concrete technique (snapshot diff, fixture replay, both) TBD by the Architect in Phase 3. | — (non-negotiable constraint from Phase 0) | Users and AI assistants cannot be broken by the rewrite itself. Softened from prescriptive "Golden-master + holodeck" wording per Reviewer finding — Analyst does not specify the test technique; Architect does. |
| 4 | ESM-only at 2.0 cutover; `createRequire` shims eliminated; `bin/lib/config-yaml.cjs` eliminated by absorbing into a typed ESM module. | Production-quality non-negotiable + indirectly VC1 (cleaner module boundaries reduce contract-drift surface area) | Removes the mixed-module-system tax Samuel experiences every time he opens the dispatcher. Trace relabeled per Adversary finding — the link is modernization + module-system unification, not a direct time-to-commit claim. |
| 5 | Production-quality floor enforced by CI: Biome lint + format clean (`biome check --error-on-warnings` exit 0); TypeScript strict flags on (`noImplicitAny`, `strict`); coverage ratchet per-file (no regression; `scripts/check-coverage-ratchet.mjs`); no `any` in public API surfaces — enforced by Biome `noExplicitAny` globally **plus** a bespoke AST-scan `scripts/check-public-any.mjs` over `.d.ts` outputs that fails CI on any `TSAnyKeyword` in exported positions (Biome alone doesn't scope by "public API", per framework-docs-researcher); commit-msg hook enforcing the `type:` trailer vocabulary that powers VC3. | Non-negotiable constraint (Samuel's quality clarification) | Operationalizes "fast and easy" as an *outcome* of tooling, never as permission to cut corners. QA's "honor-system" concern resolved by explicit enforcement mechanisms. |
| 6 | Strangler-fig migration ships incremental 1.2 → 1.3 → … releases with zero behavior change until 2.0 cutover; existing 84-test ratchet remains green throughout. | — (rollout constraint from `specs/typescript-rewrite-plan.md` §7) | De-risks the rewrite; preserves npm consumers; matches the plan's chosen strategy. |
| 7 | **Cross-module contract integration test harness** (`tests/test-public-surface.test.js` or equivalent): for each `bin/lib/<name>.js` or `.ts`, parse its `.d.ts` (or JSDoc-inferred signatures during strangler phase), extract exported shapes, then AST-scan every `require()`/`import` + call site across the repo and assert call shape matches signature. Built in Phase 0 against the 1.1.14 JS baseline **before** the first port PR; used as a CI gate thereafter. | VC1 (contract-drift detection) — this is the mechanized test that would have caught the SimulationTracer 12-vs-4 bug automatically | QA's highest-value missing-test finding. Without this, VC1 is folklore. With it, the rewrite's core premise has objective proof. If the harness passes against 1.1.14 today, baseline is clean; if it fails, we've found the next SimulationTracer-class bug before writing any TS. |

### Should Have

| # | Capability | Rationale |
|---|-----------|-----------|
| 1 | `bin/lib/holodeck.js` / `bin/holodeck.js` duplicate resolved; `bin/lib/headless-runner.js` divergence reconciled. | Pre-existing codebase hygiene surfaced by Scout; cheaper to fix inside the rewrite than afterward. |
| 2 | `.jumpstart/handoffs/` gets missing schemas (`challenger-to-analyst`, `analyst-to-pm`) and ecommerce fixture aligned to `architect-to-dev` schema. | Unblocks the ecommerce holodeck scenario as a second e2e gate. |
| 3 | `CHANGELOG.md` authored and maintained from v2.0 forward (with retrospective entries for 1.1.14). | NPX Consumer persona explicitly flagged "no changelog" as a frustration. |
| 4 | Phase-1.5 KU-04 spike — empirical measurement of AI-assistant invocation success rate against 3 `bin/lib/` modules documented via JSDoc vs `.d.ts`. ~2 hours. Blocks Phase 2 PM kickoff. Validates or invalidates Must Have #2's empirical basis. | Promoted from "deferred" to "pre-Phase-2 gating spike" per Pit Crew Adversary finding: Persona 2's claim that `.d.ts` materially beats JSDoc for agent consumers was a structurally load-bearing hypothesis with no empirical test. Spike either confirms the basis or prompts Must Have #2 revision. |
| 5 | Path δ mini-experiment: `// @ts-check` on 3 representative `bin/lib/` files *inside* the Phase 0 tooling PR (~30 min), as empirical data-point supporting the rewrite decision. | Optional post-hoc validation of the α decision; cheap insurance. Complements Must Have #7 (contract integration harness) with a real-world type-inference-over-JS benchmark. |
| 5 | `npm audit` gate in CI blocking merges on high-severity advisories. | Addresses the 3 known audit findings and prevents new ones creeping in silently. |

### Could Have

| # | Capability | Rationale |
|---|-----------|-----------|
| 1 | `docs_site/` (already Docusaurus + TS config) upgraded to consume the main package's `.d.ts` for live-generated API reference. | Would make the docs site genuinely generated, not curated; Scout flagged `docs_site/` as the *only* TS in the repo today — bringing it inline with main raises consistency. |
| 2 | Shell completion generation (zsh/bash/fish) via citty's completion hooks. | Nice-to-have developer affordance; doesn't move any validation-criterion needle. |
| 3 | Agent-native test: AI-assistant spawns `node dist/lib/<module>.js` against a fixture input set and asserts machine-readable signature consumption works. | Operationalizes criterion 3 empirically; worth once we've shipped. |
| 4 | Archive the `jumpstart-mode-1.1.14.tgz` pack artifact and add `*.tgz` to repo `.gitignore` (minor). | Working-tree hygiene. |

### Won't Have (This Release)

| # | Capability | Reason for Exclusion |
|---|-----------|---------------------|
| 1 | New CLI subcommands or new agent personas. | Scope creep — the plan explicitly forbids "while rewriting, also add features." |
| 2 | Changes to the Skills Marketplace protocol or `.jumpstart/installed.json` shape. | External contract; preserved verbatim. |
| 3 | LiteLLM proxy architectural change (e.g., moving to provider-native SDKs). | External dependency choice; out of scope. |
| 4 | Replacement of the `.jumpstart/agents/*.md` persona files with typed persona definitions. | Personas are *product*, not implementation. Not touched. |
| 5 | Full TS rewrite of `docs_site/`. | Docusaurus site is already partially TS; it has its own separate release cadence. |
| 6 | Removal of any existing CLI subcommand (even deprecated-looking ones). | Backward-compatibility contract — cannot remove without a semver major, and even 2.0 preserves behavior. |
| 7 | Multi-maintainer / team-scaling workflows (CODEOWNERS, advanced branch protection rules, release trains). | Single-maintainer bandwidth constraint. |
| 8 | `npm unpublish`, `npm deprecate` chains, or any public-registry-level action beyond routine `npm publish`. | Risk management; preserved for future decisions. |

### Constraints and Boundaries

These propagate from the Challenger Brief's non-negotiable list and are validated by `bin/lib/boundary-check.js` against the implementation plan.

- Production-grade quality is a hard floor — never lowered in exchange for velocity.
- CLI behavioral contract preserved: command names, flags, exit codes, stdout/stderr shape.
- `.jumpstart/config.yaml`, `.jumpstart/state/state.json`, `.jumpstart/installed.json` — existing consumer files must parse unchanged.
- Stdin/stdout JSON microservice envelope preserved through 1.x; extended with `"version": 1` at 2.0.
- Dual-mode library + runnable-subprocess pattern preserved for every `bin/lib/*` module.
- 84-test ratchet green throughout migration; baseline anchor is `v1.1.14-baseline` (tagged 2026-04-24).
- Holodeck baseline scenario green as the e2e gate; ecommerce scenario's handoff-validation failures are tracked separately.
- **Timeline budget revised 2026-04-24: 9–12 months realistic** for solo-maintainer + AI-agent execution at production-quality floor. Per Pit Crew Adversary analysis, the rewrite plan's original 6.5-month target implied ~6 modules/week throughput — current pace is ~2 commits/week on easier work. The plan §7 28-week target is retained as a stretch goal; the 9–12 month realistic range is the new honest default. If the timeline compresses, it is via scope reduction (more items moved to "Won't Have"), NOT via quality-bar reduction.
- **Node floor at 2.0 cutover: Node 24 (Active LTS through 2028-04-30).** Updated 2026-04-24 per framework-docs-researcher verification: as of late 2025, Node 22 moved to Maintenance LTS; Node 24 became Active LTS (released 2025-10-28, EOL 2028-04-30). A rewrite shipping late 2026 lives comfortably on Active LTS for 18+ months with Node 24 versus 12 months with Node 22. Replaces the prior Node 22 target.
- No feature additions during the rewrite. Zero-behavior-change PRs are the hard rule.

---

## Open Questions

### Resolved (from Phase 0)

- **KU-01** (Has `// @ts-check` + JSDoc been tried? Should we run a 1-day experiment first?) — **Resolved 2026-04-24 Path α**: rewrite proceeds without pre-Phase-0 experiment; optional δ side-experiment may be folded into Phase 0 PR as a subtask.
- **Production-quality meaning** (does "fast and easy" authorize reduced standards?) — **Resolved no**: production-grade quality is a hard floor enforced by tooling. Added as non-negotiable constraint.
- **Node LTS choice** — resolved 2026-04-24: **Node 24 as 2.0 floor** (Active LTS through 2028-04-30), not Node 22 (Maintenance LTS).
- **Timeline realism** — acknowledged 2026-04-24: **9–12 months realistic** for solo+AI at production quality; 6.5-month plan target is a stretch, not a contract.
- **"JS-plus" competitive alternative** — acknowledged as a soft competitor the original Path α didn't evaluate; PM to document preference rationale in PRD.
- **VC2 (time-to-first-commit ≥30%)** — retired 2026-04-24 per QA/Adversary finding (no baseline, self-report bias); validation load redistributed to VC1 + VC2-new (machine-readable surface) + VC3-new (regression share with commit-msg hook).

### New Questions (for Phase 2 / PM)

- **KU-Q-01** — What is the semver discipline within 1.x? Specifically: does each ported module ship as a patch (1.1.14 → 1.1.15 → …) or is the whole rewrite a single 1.2.0 → 1.3.0 → … cadence? *(Impact: shapes release pacing and CI gates.)*
- **KU-Q-02** — Should the path δ mini-experiment (`@ts-check` on 3 files) be scheduled within the Phase 0 tooling PR, or deferred? Samuel has not explicitly adopted it. *(Impact: adds ~30 min to Phase 0.)*
- **KU-Q-03** — What's the testing posture during strangler-fig migration: is `allowJs: true` acceptable indefinitely, or must it be removed at a specific phase gate (e.g., Phase 9)? *(Impact: bounds the migration's "mixed-state" duration.)*
- **KU-Q-04** — What is the communication plan for downstream npm consumers when 2.0 flips `engines.node` to ≥ 22 and publishes ESM-only? *(Impact: rollout risk mitigation; plan §8 lists "stakeholder communication plan" as a sign-off item.)*

### Deferred

- **KU-03** (npm publish rights verification) — Deferred to Phase 3 Architect sign-off; must be resolved before Phase 8 (2.0 cutover). Concrete action: run `npm owner ls jumpstart-mode` and coordinate with Jo Otey (listed author). **Added to Risks table** per Reviewer finding.
- **KU-04** (Do AI assistants measurably benefit from `.d.ts` vs JSDoc?) — **Promoted 2026-04-24 from deferred to pre-Phase-2 gating spike** per Pit Crew Adversary finding. 2-hour test: Claude Code + Cursor invoking 3 representative `bin/lib/*` modules against both JSDoc-documented and `.d.ts`-equipped variants; measure subprocess invocation success-rate. Blocks PM kickoff until resolved. Outcome either confirms or revises Must Have #2's empirical basis.
- **KU-05** (Are there end-users besides Samuel?) — Deferred to Phase 2 PM; Samuel confirms at PRD approval. Default assumption: yes → preserve 1.x compatibility (plan already enforces this).
- **KU-06** (Does Node ≥ 22 lock out material users?) — **Resolved to Node 24** (see Resolved section); PM still confirms with Samuel that Active-LTS-only posture is acceptable given current consumer base.

---

## Requirements Coverage Summary

Coverage of the exhaustive PRD requirements checklist (`.jumpstart/guides/requirements-checklist.md`). This is a meta-tooling / developer-framework project with a single maintainer; several sections of the standard enterprise-product PRD checklist have Low relevance. Gaps are flagged for PM + Architect attention.

| Section | Relevance | Coverage | Key Gaps |
|---------|-----------|----------|----------|
| 1 — Context, Goals | HIGH | 95 % | — (covered in challenger-brief + codebase-context + this product-brief) |
| 2 — System Inventory | HIGH | 95 % | — (Scout covered this exhaustively; minor gap is `docs_site/` relative to main package versioning) |
| 3 — Pain Points | HIGH | 85 % | KU-Q-01 semver discipline not yet decided |
| 4 — Functional Reqs | HIGH | 70 % | PM to decompose Must Have capabilities into user stories with acceptance criteria |
| 5 — NFRs | HIGH | 80 % | Performance targets (e.g., CI wall-clock budget) not yet quantified; Architect to set |
| 6 — Data & Integration | MED | 70 % | State-file schema migration path (during 1.x → 2.0) not yet specified |
| 7 — Compatibility | HIGH | 85 % | `[NEEDS CLARIFICATION]` — KU-Q-04 downstream consumer communication plan |
| 8 — Users & UX | HIGH | 90 % | Personas complete; journey map complete for Persona 1; journeys for Personas 2–3 could deepen |
| 9 — Governance & Risk | MED | 80 % | `[NEEDS CLARIFICATION]` — KU-03 npm publish rights; KU-05 end-user existence |
| 10 — Releases | HIGH | 65 % | `[NEEDS CLARIFICATION]` — KU-Q-01 semver discipline; CHANGELOG.md policy not yet authored |
| 11 — Tech Architecture | HIGH | 60 % | Phase 3 Architect will produce `specs/architecture.md` + `specs/implementation-plan.md` — this is the intended next phase's output |
| 12 — Cost & Budget | LOW | N/A | Solo-maintainer project; no budget process |
| 13 — Team & Staffing | LOW | N/A | Solo-maintainer + AI agents |
| 14 — Documentation | MED | 70 % | No CHANGELOG.md; no generated API reference; `docs_site/` content cadence unclear |
| 15 — AI Components | HIGH | 90 % | LiteLLM proxy documented; agent-consumer first-class in persona & validation criteria |
| 16 — Compliance | LOW | N/A | No regulatory exposure; MIT-licensed OSS |
| 17 — Observability | MED | 60 % | `.jumpstart/usage-log.json` is the only observability surface today; scalable observability not in scope for this release |
| 18 — Vendors | LOW | N/A | No third-party vendor management beyond npm registry and LiteLLM |

> **Full requirements responses:** [`specs/requirements-responses.md`](requirements-responses.md) — produced as a companion artifact.

Sections with HIGH relevance and >50 % gap (marked `[NEEDS CLARIFICATION]` above): Section 7 (Compatibility — KU-Q-04 downstream-consumer communication plan), Section 10 (Releases — KU-Q-01 semver discipline within 1.x), Section 11 (Tech Architecture — by design, this is Phase 3's output).

---

## Risks to the Product Concept

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| Rewrite's velocity payoff is delayed past the maintainer's patience window; project stalls mid-migration with a mixed JS/TS codebase. | **High** | Medium | Strangler-fig with every PR shipping usable 1.x; each phase has go/no-go gates; phase tag rollback anchors in git. |
| Breaking an AI-assistant integration (Claude Code, Cursor, Copilot, Windsurf) during migration due to subprocess IPC surface change. | **High** | Medium | `"version": 1` IPC envelope preserved; per-subcommand integration test in CI; manual smoke-test against all 4 assistants at each phase gate (per plan §7 criteria). |
| Production-quality floor is silently eroded under velocity pressure; `any`-dumping or `// @ts-ignore` creep in. | **High** | Medium | Explicit CI gates: no `any` in public API (lint rule); strict `noImplicitAny`; PR template requires "zero behavior change" affirmation; coverage ratchet per-file. |
| Path α turns out to be wrong (JSDoc + discipline would have sufficed) — discovered only 3–4 months into rewrite. | Medium | Low-Medium | Optional δ mini-experiment in Phase 0 PR gives early signal; strangler-fig is reversible per-module. |
| Scope creep — "while rewriting, also fix X" — balloons timeline. | **High** | High (default behavior) | Hard rule from plan: port PRs change zero behavior; bugs logged as separate issues, fixed in separate commits. |
| Single-maintainer fatigue: Samuel loses motivation mid-rewrite, codebase stalls in hybrid state. | **High** | Medium | Phase plan allows pause at any gate; each phase is independently complete; agent team model spreads cognitive load. |
| Downstream npm consumer breaks when 2.0 flips ESM-only + Node ≥ 22. | Medium | Medium | 2.0.0-rc.x on `next` tag ≥ 2 weeks; feature-flag escape hatches per plan §9. |
| Framework's own dogfood thesis fails — this rewrite IS the credibility test for the framework driving its own rewrite; a failed rewrite damages the framework's narrative. | **XL** | Low | Phase-gate approvals throughout; human-in-the-loop at every artifact; native-agent execution explicitly documented in `specs/typescript-rewrite-plan.md` §2.5. |
| **npm publish rights** — `npm whoami` not configured this session; `package.json` author is Jo Otey, not Samuel Combey. If Samuel does not hold publish rights on the `jumpstart-mode` package, Phase 8 (2.0 cutover) cannot ship to npm under this package name without coordination. | **High** | Medium | Verify at Phase 3: run `npm owner ls jumpstart-mode`. If Samuel is not listed, coordinate with Jo Otey or accept that 2.0 publishes under a scoped name (`@scombey/jumpstart-mode`) or fork. Decision must happen before Phase 8 work starts. Added to Risk table 2026-04-24 per Reviewer finding. |
| **Timeline math honest** — Pit Crew Adversary identified that the original 6.5-month target implied ~6 modules/week throughput vs current ~2 commits/week. Realistic range revised to 9–12 months. Risk if compression is attempted: either quality floor slips (disallowed by hard constraint) or scope balloons. | **High** | High (if timeline pressure applied) | Honest 9–12 month framing baked into Constraints; 6.5 months retained as stretch. Per-phase time budgets sized against realistic throughput, not stretch. |

---

## Insights Reference

**Companion Document:** [`specs/insights/product-brief-insights.md`](insights/product-brief-insights.md)

Key insights that shaped this brief:

1. **Phase 0's root-cause reframe (contract drift) flows cleanly into Phase 1's personas** — Persona 1 (Samuel) experiences drift as manual verification; Persona 2 (AI agents) experiences drift as runtime-only error signals. Solving the root cause serves both personas simultaneously.
2. **The competitive "threat" is the status quo, not other languages or frameworks** — once Path α accepted TS as the approach, inter-tooling comparisons reduce to the rewrite plan's §4 dependency matrix.
3. **Must Have capability #5 (production-quality floor as CI gate) operationalizes Samuel's mid-phase clarification** — this is the single capability that prevents "fast and easy" from ever degrading into "cheap."
4. **Compressed Analyst pass preserves the template's structural integrity** — every required template section is populated; `ask_questions` interactions replaced by explicit surfacing in the brief for Samuel to adjudicate at approval.
5. **Three HIGH-relevance sections have >50 % gap and propagate `[NEEDS CLARIFICATION]` to downstream** — compatibility (KU-Q-04), releases (KU-Q-01), and tech architecture (intentional — Phase 3's job).

See the insights document for the full decision trace.

---

## Stakeholder Map

Inherited from the Phase 0 Challenger Brief's stakeholder map (see `specs/challenger-brief.md` → Stakeholder Map). No new stakeholders identified in Phase 1. A dedicated `specs/stakeholders.md` living registry is NOT produced in this compressed pass (scope_method=mvp; only 2 High-impact stakeholders; Analyst judgment: registry adds bureaucratic weight for a solo-maintainer project). Samuel may override at approval.

---

## Phase Gate Approval

- [x] Human has reviewed this brief
- [x] At least one user persona is defined
- [x] User journeys are mapped (if configured)
- [x] MVP scope is populated
- [x] Every Must Have capability traces to a Phase 0 validation criterion
- [x] All open questions are resolved or explicitly deferred with rationale
- [x] Human has explicitly approved this brief for Phase 2 handoff

**Approved by:** Samuel Combey
**Approval date:** 2026-04-24
**Status:** Approved

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:product-brief",
  "js:phase": 1,
  "js:agent": "Analyst",
  "js:status": "Approved",
  "js:version": "1.0.0",
  "js:upstream": [
    { "@id": "js:challenger-brief" },
    { "@id": "js:codebase-context" }
  ],
  "js:downstream": [
    { "@id": "js:prd" }
  ],
  "js:traces": []
}
```
