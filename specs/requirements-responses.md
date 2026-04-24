---
id: requirements-responses
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
  - specs/product-brief.md
  - specs/typescript-rewrite-plan.md
  - .jumpstart/guides/requirements-checklist.md
dependencies:
  - challenger-brief
risk_level: low
owners:
  - Samuel Combey
sha256: null
---

# Requirements Responses

> **Phase:** 1 -- Analysis
> **Agent:** The Analyst (Requirements Extractor subagent not separately invoked in compressed-elicitation mode — see Executive Summary)
> **Status:** Approved
> **Created:** 2026-04-24
> **Updated:** 2026-04-24
> **Upstream References:** [specs/challenger-brief.md](challenger-brief.md), [specs/codebase-context.md](codebase-context.md), [specs/product-brief.md](product-brief.md), [requirements-checklist.md](../.jumpstart/guides/requirements-checklist.md)
> **Companion Artifact:** [specs/product-brief.md](product-brief.md)

---

## Executive Summary

**Project Type:** `brownfield` (self-rewrite of an existing codebase)
**Domain:** `null` / meta-tooling / developer-framework (does not match any entry in `.jumpstart/domain-complexity.csv`; no regulated-domain flags)
**Domain Complexity:** `low-general` (no compliance / safety / clinical constraints; single-maintainer MIT OSS)

**Coverage Statistics:**

| Metric | Value |
|--------|-------|
| Total checklist sections | 18 (+1 appendix) |
| Sections evaluated | 13 |
| Sections marked N/A with rationale | 5 (Sections 7 — partially, 12, 13, 16, 18) |
| Representative questions answered per section | 4–8 (sampled from the checklist's ~10–20 per section) |
| Pre-answered from upstream (of those sampled) | ~85 % |
| Requiring user follow-up at PM / Architect phase | ~15 % (flagged as `[NEEDS CLARIFICATION]` in product-brief + here) |
| Cost, Budget, Staffing, Compliance, Vendor questions | Marked N/A — solo-maintainer MIT OSS |

**Methodology note:** The Analyst protocol calls for a Requirements Extractor subagent to systematically walk the full 100+ question checklist and produce structured responses. Per Samuel Combey's compressed-elicitation directive ("starting with phase 0 and keep going"), this document is produced without a separate subagent invocation. Instead: representative questions are selected per section, answered against upstream artifacts with source citations, and sections that are wholly out of scope are explicitly marked N/A rather than padded with synthetic answers. If a PM or Architect phase needs deeper coverage on a specific area, that phase can request expanded responses against this template.

**Key Gaps:** Sections 10 (Releases — semver discipline within 1.x undecided), 7 (Compatibility — downstream consumer communication plan undefined), 11 (Tech Architecture — intentionally deferred to Phase 3 output). All three are noted in the product-brief with `[NEEDS CLARIFICATION]` markers.

**Domain Flags:** None. No regulated-domain signals detected. No PCI / HIPAA / GDPR / FERPA / SOX / aerospace / energy triggers in the problem statement, stakeholder map, or codebase.

---

## Pre-Answered Items

### Section 1 — Context, Goals, and Scope

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 1.1 | What is the current system supposed to do from a business perspective? | Provide a spec-driven agentic coding framework: convert problem statements into production code via phased AI-agent workflow (scout → challenger → analyst → pm → architect → developer). Published as `jumpstart-mode` npm package. | `specs/codebase-context.md` § Project Overview | High |
| 1.2 | Who are the primary and secondary users today? | Primary: solo maintainer (Samuel Combey). Secondary: AI coding assistants (Claude Code, Cursor, VS Code Copilot, Windsurf) as subprocess consumers. Tertiary: NPX consumers running the CLI. | `specs/challenger-brief.md` § Stakeholder Map | High |
| 1.3 | What business outcomes must this project achieve? | Not a commercial project. Outcomes are maintainer-facing: (a) reduce time-to-ship per improvement, (b) eliminate cross-module contract-drift runtime surprises, (c) make the framework agent-navigable via machine-readable type surfaces. | `specs/challenger-brief.md` § Reframed Problem + § Validation Criteria | High |
| 1.4 | What is the strategic rationale for modernizing now vs continuing status quo? | Young repo (21 commits, 2.5 months) — technical debt is still shallow enough to treat comprehensively. Cross-module drift has already caused one silent production bug (`SimulationTracer` 8-method mismatch); waiting compounds drift risk. | `specs/codebase-context.md` § Project Overview + § Technical Debt | High |
| 1.5 | What is the cost of inaction? | Each unaddressed drift incident costs ~2 hours of verification overhead per related improvement (observed 2026-04-24 baseline-verification session). Over 12-24 months, compounds into significant velocity loss; also erodes Samuel's confidence in running holodeck locally as an e2e gate. | `specs/product-brief.md` § Current-State Journey | High |
| 1.6 | What prior attempts to modernize have been made, and why did they succeed/fail? | None. This is the first rewrite attempt. | Session record; no prior branches visible in git log | High |
| 1.7 | Is there an executive sponsor / single accountable decision-maker? | Samuel Combey — sole maintainer; all phase-gate approvals flow to this name. No other approvers in scope. | `.jumpstart/config.yaml` § project.approver | High |
| 1.8 | Is this a refactor, replatform, feature extension, or replacement? | Language migration + modernization. JS → TS (replatform within the Node runtime), ESM-only at 2.0, CLI framework replacement (hand-rolled dispatcher → citty), build tooling introduction (tsdown + Biome). NOT a feature extension — scope explicitly forbids new features during migration. | `specs/typescript-rewrite-plan.md` § TL;DR + § 2.5 + § 7 | High |

### Section 2 — Existing System Inventory and Behavior _(brownfield)_

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 2.1 | What languages, runtimes, and frameworks does the system use today? | JavaScript (CommonJS + ESM mixed); Node.js (engines `>=14.0.0` declared; observed dev env Node 25.9). No application framework. TypeScript only in `docs_site/` as editor-experience config, not runtime. | `specs/codebase-context.md` § Technology Stack | High |
| 2.2 | What are the primary entry points and their approximate sizes? | `bin/cli.js` (5,359 lines CJS main dispatcher), `bin/bootstrap.js` (234 lines ESM init), `bin/headless-runner.js` (808 lines), `bin/holodeck.js` (512 lines), `bin/verify-diagrams.js`, `bin/context7-setup.js`; 159 feature modules in `bin/lib/`. | `specs/codebase-context.md` § Repository Structure | High |
| 2.3 | What integrations exist with external systems? | LiteLLM proxy (primary LLM gateway via `openai` SDK with `baseURL` override); OpenAI direct (fallback); JumpStart Skills Registry (GitHub-hosted HTTPS); Context7 MCP (docs freshness via `npx`); npm registry (distribution). | `specs/codebase-context.md` § External Integrations | High |
| 2.4 | What data stores or persistence mechanisms are in use? | No database. File-system state only — YAML (`.jumpstart/config.yaml`), JSON (`.jumpstart/state/*.json`, `.jumpstart/installed.json`, `.jumpstart/usage-log.json`), Markdown (`specs/*.md`, `.jumpstart/agents/*.md`, `.jumpstart/templates/*`). | `specs/codebase-context.md` § Technology Stack | High |
| 2.5 | What is the existing test coverage and health? | 84 `*.test.js` files, 1,930 assertions (post-1.1.14 chunker fix). `vitest@3.2.4` currently installed; **rewrite will target vitest@4.1.x** (v4 stable since 2025-10; breaking changes include `coverage.all` removal, `workspace`→`projects` rename, mandatory AST-based v8 remapping — previously opt-in). `test-agent-intelligence.test.js` intentionally excluded in `vitest.config.js`. Full suite passes in ~3.5s on the dev env. | `specs/codebase-context.md` § Testing Patterns + `specs/typescript-rewrite-plan.md` Appendix D + framework-docs-researcher Pit Crew review 2026-04-24 | High |
| 2.6 | What CI/CD pipelines exist? | `.github/workflows/quality.yml` — triggers on PR or push-to-main when `specs/`, `.jumpstart/`, or `tests/` change. Does NOT trigger on `bin/**` changes (known gap). Node 20, batched vitest runs. No lint, no coverage gate, no holodeck e2e in CI today. | `specs/codebase-context.md` § Directory Purposes + `specs/typescript-rewrite-plan.md` CI section | High |

### Section 3 — Current Pain Points and Gaps

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 3.1 | What is the top pain point for users of the current system? | Cross-module contract drift surfaces at runtime, not author/CI time — forces manual cross-file verification per change. Concrete case observed 2026-04-24: `bin/holodeck.js` called 12 methods on `SimulationTracer`; only 4 existed. Shipped to main undetected. | `specs/challenger-brief.md` § Root Cause + `specs/typescript-rewrite-plan.md` Appendix D | High |
| 3.2 | What are the top technical-debt items from the maintainer's perspective? | (a) Mixed CJS/ESM module system with `createRequire` shims in 38 files; (b) 5,359-line monolithic `bin/cli.js` with ~120 inline string-dispatch branches; (c) Duplicate files: `bin/lib/holodeck.js` ≡ `bin/holodeck.js`; `bin/lib/headless-runner.js` differs from `bin/headless-runner.js`; (d) Hand-rolled YAML parser in `config-loader.js` competes with `yaml` package already in deps; (e) 184 scattered `process.exit()` calls with no typed error hierarchy; (f) No lint / format / bundler configured. | `specs/codebase-context.md` § Structural Observations | High |
| 3.3 | Are there known silent-failure classes today? | Yes. Holodeck scenarios had never run end-to-end in 1.1.13 because `tracer.logError` et al. were missing methods — surfaced in this session (Appendix D of the rewrite plan). `test-context-chunker.test.js` OOMed the shared worker pool due to an infinite loop in `chunkContent()`. Both fixed in commit `92daf04`. | `specs/typescript-rewrite-plan.md` Appendix D | High |
| 3.4 | What current workarounds are in use? | Defensive guards (`if (this.tracer.logUserProxyExchange)`); manual cross-file verification; split-test scripts in `package.json` to work around OOM (`test:unit`, `test:integration`, `test:regression` as separate commands rather than one `npm test`). | `specs/codebase-context.md` § Coding Patterns + `specs/challenger-brief.md` § Stakeholder Map | High |

### Section 4 — Functional Requirements

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 4.1 | What must the system still be able to do after the rewrite? | Every existing CLI subcommand (120+) must continue to work with identical name, flag parsing, exit code, and stdout/stderr format. Every `bin/lib/*.js` must remain runnable as `node <path>` with JSON-on-stdin and JSON-on-stdout semantics. `.jumpstart/` state file shapes must parse unchanged. AI-assistant integration contracts (Claude Code, Cursor, Copilot, Windsurf) unchanged. | `specs/challenger-brief.md` § Non-Negotiable Constraints | High |
| 4.2 | What new functional capabilities does the rewrite introduce? | (a) Typed public surface with `.d.ts` emission for every lib module. (b) `tsc --noEmit` CI gate catching contract drift before merge. (c) Coverage ratchet enforcement per-file. (d) Biome lint/format gates. (e) Machine-readable contract manifest (or `.d.ts`) consumable by AI assistants. | `specs/product-brief.md` § Must Have | High |
| 4.3 | Are there features to be explicitly removed? | No. Zero-removal rule — even deprecated-looking subcommands stay through 1.x. At 2.0 cutover, Node/ESM requirements change but no command is removed. | `specs/challenger-brief.md` § Out of Scope | High |
| 4.4 | What is the expected user input / output format? | Input: shell invocation with flags + positional args; stdin JSON for lib-module microservices. Output: stdout text (for `--help`, status, results) + stdout JSON (for microservices) + stderr warnings/errors + exit codes. | `specs/codebase-context.md` § Reference Implementations | High |

### Section 5 — Non-Functional Requirements (NFRs)

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 5.1 | What are the performance expectations? | Not explicit today. Inferred: `npm test` must stay sub-10-seconds; `node bin/cli.js --help` must stay sub-500ms cold start; PR CI budget ≤90s (currently no CI budget enforced). Architect to set concrete numbers. | Inferred from observed baseline (1,930 tests / 3.43s) + `specs/typescript-rewrite-plan.md` § 8 budget | Medium |
| 5.2 | What are the reliability and availability targets? | N/A in traditional sense — this is a CLI tool, not a service. "Reliability" = no regression on 83 passing test files; holodeck baseline scenario must stay PASS. | `specs/challenger-brief.md` § Non-Negotiable Constraints | High |
| 5.3 | What security posture must be maintained? | Maintain sha256 verification on marketplace ZIPs (`bin/lib/install.js`); no hardcoded credentials (existing `bin/lib/secret-scanner.js` covers); `npm audit --audit-level=high` in CI; preserve sandboxed subprocess model for AI-assistant-spawned lib modules. | `specs/codebase-context.md` § Security Observations + `specs/typescript-rewrite-plan.md` § 6 | High |
| 5.4 | What are the supportability / observability expectations? | `.jumpstart/usage-log.json` captures per-phase usage. Timeline recording in `state-store.js`. No structured logger today. Architect decision whether to introduce one. | `specs/codebase-context.md` § Coding Patterns | Medium |
| 5.5 | What is the Node version floor? | `engines.node: ">=14.0.0"` declared today (fictional — `yaml@2` requires newer). **Plan target updated 2026-04-24: `>=24` at 2.0 cutover** (Node 24 is current Active LTS through 2028-04-30, released 2025-10-28; Node 22 moved to Maintenance LTS in late 2025). A rewrite shipping late 2026 gets 18+ months on Active LTS with 24 vs ~12 months on 22. PM still confirms Active-LTS-only posture is acceptable. | `specs/typescript-rewrite-plan.md` § TL;DR + § 8 risk register + framework-docs-researcher Pit Crew 2026-04-24 | High |

### Section 6 — Data, Integrations, and Migration

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 6.1 | What file formats must continue to parse correctly? | `.jumpstart/config.yaml` (existing user configs must parse); `.jumpstart/state/state.json`; `.jumpstart/installed.json`; `.jumpstart/handoffs/*.schema.json`; stdin/stdout JSON microservice envelopes. | `specs/challenger-brief.md` § Non-Negotiable Constraints | High |
| 6.2 | Are there schema-migration needs? | Forward-compatible: the rewrite adds a `"version": 1` field to IPC envelopes but does NOT change `config.yaml` or `state.json` shapes. Zod schemas (introduced in Phase 2 of rewrite) will be generated from the existing JSON Schemas — direction A of the plan's §4. | `specs/typescript-rewrite-plan.md` § 4 (JSON Schema ↔ Zod direction) | High |
| 6.3 | What external integrations must continue to work? | LiteLLM proxy (pin `openai@6.34.x`; baseURL preserved). Skills Registry URL + SHA256-verified ZIP downloads. Context7 MCP via `npx`. npm registry publish path. | `specs/codebase-context.md` § External Integrations + `specs/typescript-rewrite-plan.md` § 4 | High |
| 6.4 | Is there data in flight that must not be lost during migration? | No runtime user data. `.jumpstart/state/*` files in consumer projects ARE user data and must parse across the migration — forward-compat with `.passthrough()` on Zod schemas. | `specs/typescript-rewrite-plan.md` § 8 risk #1 | High |

### Section 7 — Backwards Compatibility and Cutover _(brownfield)_

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 7.1 | What must remain backward-compatible through 1.x? | CLI command names + flags + exit codes + stdout/stderr; `.jumpstart/config.yaml` schema; `state.json`, `installed.json`; stdin/stdout microservice envelope; dual-mode (library + subprocess) lib module pattern; 84-test ratchet. | `specs/challenger-brief.md` § Non-Negotiable Constraints | High |
| 7.2 | What breaks at 2.0, and how is it communicated? | **[NEEDS CLARIFICATION — KU-Q-04]** `engines.node: >=22` + ESM-only. Communication plan not yet authored. Plan's §8 names "stakeholder communication plan for each AI-assistant integration" as a sign-off item. PM to define. | `specs/typescript-rewrite-plan.md` § 8 sign-off checklist | Medium |
| 7.3 | What is the cutover strategy? | Strangler-fig: ship 1.2, 1.3, 1.4 … continuously with zero behavior change during rewrite. `2.0.0-rc.x` on `next` tag ≥ 2 weeks with live soak against all 4 AI assistants. Promote to `latest` dist-tag. Rollback = dist-tag flip. | `specs/typescript-rewrite-plan.md` § 2 + § 7 + § 9 rollback | High |
| 7.4 | What user-facing breaking changes are acceptable? | Only those signaled by a semver major (2.0). Node bump (≥ 14 → ≥ 22), ESM-only, and `bin` path change (`./bin/cli.js` → `./dist/cli.js`) are the signaled breaks. Everything else preserved. | `specs/typescript-rewrite-plan.md` § 4 + § 7 Phase 8 | High |

### Section 8 — Users, UX, and Change Management

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 8.1 | Who are the primary users and what is their proficiency? | Persona 1: Samuel Combey (High proficiency, sole maintainer). Persona 2: AI coding assistants (High proficiency, subprocess-consumers). Persona 3: NPX consumers (Medium proficiency). | `specs/product-brief.md` § User Personas | High |
| 8.2 | What is the change-management plan? | Strangler-fig rollout masks the change inside 1.x minor releases. AI-assistant IDE integrations don't require user action — config.yaml / agent persona files unchanged. At 2.0 cutover: changelog + RC soak + dist-tag promotion. | `specs/typescript-rewrite-plan.md` § 7 + § 9 | High |
| 8.3 | Are there critical user journeys that must not break? | (a) Samuel's "add an improvement" journey (current-state → future-state in product-brief). (b) AI assistant's "spawn `node bin/lib/<name>` with JSON stdin" flow. (c) NPX consumer's `npx jumpstart-mode init` scaffold. | `specs/product-brief.md` § User Journeys + § Constraints | High |
| 8.4 | What onboarding or training is required? | None for users. For future contributors (hypothetical): Biome + TypeScript familiarity; read `CLAUDE.md` + agent persona files; run `scripts/verify-baseline.mjs` (to be created in Phase 0). | Inferred + `specs/typescript-rewrite-plan.md` § 10 immediate first moves | Medium |

### Section 9 — Governance, Risks, and Constraints

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 9.1 | Who approves phase artifacts? | Samuel Combey (project.approver). No other signers. Two-party approval not applicable — solo maintainer. | `.jumpstart/config.yaml` | High |
| 9.2 | What is the top product-concept risk? | Scope creep (plan §8 risk #6) — the default behavior is "while rewriting, also fix / add X." Probability High, Impact XL. Mitigation: hard "port PRs change zero behavior" rule; bugs logged as separate follow-up issues. | `specs/typescript-rewrite-plan.md` § 8 risk register + `specs/product-brief.md` § Risks | High |
| 9.3 | What are the non-negotiable constraints? | Production-quality floor; CLI contract preserved; config/state schemas preserved; IPC envelope preserved; dual-mode lib pattern preserved; 84-test ratchet; holodeck baseline green; ≤ 6.5 month timeline target; no new features. | `specs/challenger-brief.md` § Non-Negotiable Constraints | High |
| 9.4 | What external dependencies carry risk? | `openai@6.x` SDK (LiteLLM proxy compatibility); transitive `vitest → vite` vulnerability; `npm owner ls jumpstart-mode` reveals publish authority (KU-03 — Jo Otey listed as author). | `specs/typescript-rewrite-plan.md` § 8 risk #8 + npm audit output | High |

### Section 10 — Releases, Acceptance, and Validation

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 10.1 | What is the release cadence? | **[NEEDS CLARIFICATION — KU-Q-01]** Plan § 7 names ~28-week phase schedule but not per-minor semver discipline. PM to decide: does each ported module ship as a patch (1.1.14 → 1.1.15 → …) or is the whole migration a minor cadence (1.2.0 → 1.3.0 → …)? | `specs/product-brief.md` § Open Questions | Low |
| 10.2 | What are the acceptance criteria per phase? | Per rewrite plan § 7: tests green, coverage ratchet clean, holodeck baseline PASS, `npm pack` byte-identical check (Phase 0), per-phase CLI help snapshot diff (Phases 1+). Human approval mandatory. | `specs/typescript-rewrite-plan.md` § 7 go/no-go gates | High |
| 10.3 | What is the validation process for 2.0 cutover? | 2.0.0-rc.x on `next` tag ≥ 2 weeks soak with zero issues filed; manual smoke against Claude Code + Cursor + Copilot + Windsurf; then dist-tag flip to `latest`. | `specs/typescript-rewrite-plan.md` § 7 Phase 8 + § 9 rollback | High |
| 10.4 | What happens if a phase gate fails? | Revert the phase's merge commit via `git revert` (strangler-fig keeps JS siblings throughout, so revert restores the JS call path untouched). Per-module feature-flag escape hatch available (`JUMPSTART_USE_TS_<MODULE>=1`). | `specs/typescript-rewrite-plan.md` § 9 rollback plan | High |

### Section 11 — Technical Architecture and Design Constraints

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 11.1 | What is the target package layout? | **[DEFERRED — Phase 3 Architect output]** Plan § 3 proposes a single `jumpstart-mode` package with `src/` TS source + `dist/` tsdown output + preserved `.jumpstart/` data assets. Architect to finalize. | `specs/typescript-rewrite-plan.md` § 3 | Medium (plan-level) / Low (Architect-final) |
| 11.2 | What is the module system target? | ESM-only at 2.0 (`"type": "module"`). During 1.x: CJS-compatible TS output via tsdown; `allowJs: true` in tsconfig for gradual port. | `specs/typescript-rewrite-plan.md` § 3 + § 5 | High |
| 11.3 | What CLI framework? | **[DEFERRED to Phase 3 — Architect decides]** Plan recommends `citty` (ESM-first, TS-native, lazy `subCommands`). Commander v12 named as safe fallback. | `specs/typescript-rewrite-plan.md` § 4 + Appendix A | Medium |
| 11.4 | What runtime validation library? | **[DEFERRED to Phase 3]** Plan recommends Zod v4 with JSON-Schema-to-Zod codegen (direction A) as the default, with an option to flip to Zod-as-canonical (direction B) at 2.0. | `specs/typescript-rewrite-plan.md` § 4 (JSON Schema ↔ Zod direction) | Medium |
| 11.5 | Are there design-pattern constraints? | Dual-mode lib modules (library + subprocess) preserved; strangler-fig migration (no big-bang); constructor-injected `Deps` for test seams (fs, llm, prompt, clock); no IoC container. | `specs/typescript-rewrite-plan.md` § 3 | High |

### Section 12 — Cost, Budget, and Financial Constraints

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| — | **Section marked N/A.** Solo-maintainer MIT OSS project. No budget process, no commercial spend, no vendor contracts tied to this project. LiteLLM proxy runs locally; Context7 MCP is free; npm registry is free for public packages. The "cost" is Samuel's attention. | `specs/challenger-brief.md` § Stakeholder Map | High |

### Section 13 — Team, Staffing, and Organizational Readiness

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| — | **Section marked N/A.** Team = Samuel Combey + AI coding assistants (per `specs/typescript-rewrite-plan.md` § 2.5). No organizational readiness concerns, no hiring plan, no role gaps (non-applicable at this scale). | `specs/typescript-rewrite-plan.md` § 2.5 + § 8 risk #6 single-maintainer fatigue | High |

### Section 14 — Documentation and Knowledge Transfer

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 14.1 | What documentation exists today? | `README.md` (51 KB user-facing); `docs/` (4 Markdown files: onboarding 40KB, how-jumpstart-works 23KB, quickstart, agent-access-reference); `docs_site/` (Docusaurus site); `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules` (AI-assistant integrations). No `CHANGELOG.md`, no generated API docs. | `specs/codebase-context.md` § Existing Documentation | High |
| 14.2 | What documentation must be produced during the rewrite? | (a) `CHANGELOG.md` authored from v2.0 forward + retroactive entry for 1.1.14. (b) `.d.ts` files (machine-readable — serves as API docs for agents). (c) Updated README sections reflecting ESM-only, Node ≥ 22 at 2.0. (d) `specs/architecture.md` + `specs/implementation-plan.md` (Phase 3 Architect output). | `specs/product-brief.md` § Should Have + § Scope | High |
| 14.3 | What knowledge transfer is needed? | Minimal — solo maintainer. AI-assistant integrations DO need updated agent persona files if slash commands change (they don't in this rewrite). `docs_site/` eventually links to generated API reference. | `specs/product-brief.md` § Could Have #1 | Medium |

### Section 15 — AI-Assisted or Modernized Components

_(Highly relevant — this framework ITSELF is an AI-assisted system.)_

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 15.1 | Where are AI/LLM calls made in the runtime? | `bin/lib/llm-provider.js` (factory returning mock vs live provider). `bin/lib/model-router.js` + `cost-router.js` (task-type routing). `bin/headless-runner.js` (emulation harness). All go through the LiteLLM proxy or direct OpenAI SDK as fallback. | `specs/codebase-context.md` § External Integrations + § Key Files Reference (`bin/lib/llm-provider.js`) | High |
| 15.2 | What model governance policies apply? | Model registry pinned in `llm-provider.js` (OpenAI, Anthropic, Gemini model IDs). `model-governance.js` module exists for policy enforcement. No external compliance binding (solo OSS project). | `specs/codebase-context.md` § Cluster E | High |
| 15.3 | Is there AI-specific risk management? | Yes — `bin/lib/tool-guardrails.js`, `bin/lib/secret-scanner.js`, `bin/lib/credential-boundary.js`, `bin/lib/policy-engine.js` ship as part of the framework. Preserved through rewrite. | `specs/codebase-context.md` § Security Observations + § Repository Structure (`bin/lib/` governance modules) | High |
| 15.4 | How do AI agents consume the framework? | Via slash commands (read `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`) + via subprocess invocation (`node bin/lib/<name>.js` with JSON-on-stdin). Target post-rewrite: ALSO via `.d.ts` type-level consumption. | `specs/product-brief.md` § Persona 2 (Claude Code Agent) + § Must Have #2 | High |

### Section 16 — Compliance, Legal, and Regulatory Deep Dive

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| — | **Section marked N/A.** No regulated-domain signals. MIT license; no GDPR/HIPAA/PCI/SOX/FERPA applicability (no personal data, no payment data, no health data, no educational records, no SEC reporting). Sub-processor inventory N/A. | `specs/challenger-brief.md` § Domain Detection (no domain match) + MIT LICENSE | High |

### Section 17 — Observability, Incident Management, and Operational Readiness

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| 17.1 | What observability exists today? | `.jumpstart/usage-log.json` (per-phase LLM usage + cost tracking). Timeline recording in `bin/lib/state-store.js` + `bin/lib/timeline.js`. No APM, no metrics scraper, no structured log aggregation. | `specs/codebase-context.md` § External Integrations | High |
| 17.2 | What must survive the rewrite? | `.jumpstart/usage-log.json` format (consumers may parse it). Timeline JSON shape. Both preserved through 2.0 via forward-compat schemas. | `specs/challenger-brief.md` § Non-Negotiable Constraints | High |
| 17.3 | What is the incident-management process? | For runtime bugs: `npm deprecate` + dist-tag flip to last-good version. No PagerDuty / OpsGenie — solo maintainer. | `specs/typescript-rewrite-plan.md` § 9 rollback | High |
| 17.4 | Are new observability capabilities added? | Plan proposes `scripts/verify-baseline.mjs` (baseline drift detection). Optional: CI-time structured logging of phase gate outcomes. Not in MVP. | `specs/typescript-rewrite-plan.md` § 10 + § Sign-off checklist | Medium |

### Section 18 — Vendor and Third-Party Management

| # | Question | Answer | Source | Confidence |
|---|----------|--------|--------|------------|
| — | **Section marked N/A.** No paid vendors. npm registry is free/public. LiteLLM proxy is self-hosted or user-hosted. Context7 MCP is free. All runtime dependencies are npm OSS with permissive licenses. | `specs/codebase-context.md` § External Integrations + package.json | High |

---

## User Responses

_Not applicable in this compressed-elicitation pass — no separate live Requirements Deep Dive session was conducted. Samuel's inputs captured in: (a) the verbatim raw statement in `specs/challenger-brief.md` § Original Statement, (b) the production-quality clarification documented in `specs/challenger-brief.md` § Original Statement follow-up and § Assumption #9, (c) the Path-α / δ-deferred resolution of KU-01, and (d) the "keep going" compressed-mode directive. Any Deep Dive question marked `[NEEDS CLARIFICATION]` above is resolved by Samuel during PM / Architect phases as applicable._

---

## Deferred and Not Applicable

| # | Section | Question | Status | Rationale |
|---|---------|----------|--------|-----------|
| D-1 | 5.5 | Node version floor — does `>=22` lock out users? | Deferred to Phase 2 (PM) | Plan § 8 KU-06; PM confirms with Samuel at PRD approval. |
| D-2 | 7.2 | Downstream consumer communication plan for 2.0 breaking changes | Deferred to Phase 2 (PM) | Plan § 8 sign-off checklist item; PM drafts. |
| D-3 | 9.4 → KU-03 | Does Samuel hold `npm publish` rights on `jumpstart-mode`? | Deferred to Phase 3 (Architect) sign-off | Must be verified before Phase 8 cutover; `npm owner ls jumpstart-mode` + coordinate with Jo Otey. |
| D-4 | 10.1 | Semver discipline within 1.x (patch-per-module vs minor-per-migration) | Deferred to Phase 2 (PM) — **KU-Q-01** | Shapes release pacing and CI gates. |
| D-5 | 11.1 | Final package layout (monorepo vs single package + `exports` map) | Deferred to Phase 3 (Architect) | Plan § 3 proposes single package; Architect finalizes. |
| D-6 | 11.3 | CLI framework final choice (citty vs commander v12) | Deferred to Phase 3 (Architect) | Plan § 4 recommends citty; Architect validates via Context7 before locking. |
| D-7 | 11.4 | Zod direction (JSON Schema canonical vs Zod canonical) | Deferred to Phase 3 (Architect) | Plan § 4 recommends direction A. |
| D-8 | 12 / 13 / 16 / 18 | Cost / Staffing / Compliance / Vendors | N/A | Solo-maintainer MIT OSS with no regulated-domain flags or paid-vendor exposure. |
| D-9 | 14.3 | Future-contributor onboarding docs | Deferred — post-2.0 | Hypothetical contributors; not blocking MVP. |
| D-10 | 17.4 | Additional observability (structured logs / metrics) | Could-Have / Won't Have MVP | Plan § scope §10; defer to post-2.0. |

---

## Coverage Dashboard

| Section | Relevance | Total Qs sampled | Pre-Answered | User-Provided | Deferred | N/A | Gap% |
|---------|-----------|---|---|---|---|---|---|
| 1 — Context, Goals | HIGH | 8 | 8 | 0 | 0 | 0 | 0 % |
| 2 — System Inventory | HIGH | 6 | 6 | 0 | 0 | 0 | 0 % |
| 3 — Pain Points | HIGH | 4 | 4 | 0 | 0 | 0 | 0 % |
| 4 — Functional Reqs | HIGH | 4 | 4 | 0 | 0 | 0 | 0 % |
| 5 — NFRs | HIGH | 5 | 4 | 0 | 1 | 0 | 20 % |
| 6 — Data & Integration | MED | 4 | 4 | 0 | 0 | 0 | 0 % |
| 7 — Compatibility | HIGH | 4 | 3 | 0 | 1 | 0 | 25 % |
| 8 — Users & UX | HIGH | 4 | 4 | 0 | 0 | 0 | 0 % |
| 9 — Governance & Risk | MED | 4 | 4 | 0 | 0 | 0 | 0 % |
| 10 — Releases | HIGH | 4 | 3 | 0 | 1 | 0 | 25 % |
| 11 — Tech Architecture | HIGH | 5 | 2 | 0 | 3 | 0 | 60 % (by design — Phase 3 output) |
| 12 — Cost & Budget | LOW | — | — | — | — | ✓ | 100 % (N/A) |
| 13 — Team & Staffing | LOW | — | — | — | — | ✓ | 100 % (N/A) |
| 14 — Documentation | MED | 3 | 3 | 0 | 0 | 0 | 0 % |
| 15 — AI Components | HIGH | 4 | 4 | 0 | 0 | 0 | 0 % |
| 16 — Compliance | LOW | — | — | — | — | ✓ | 100 % (N/A) |
| 17 — Observability | MED | 4 | 4 | 0 | 0 | 0 | 0 % |
| 18 — Vendors | LOW | — | — | — | — | ✓ | 100 % (N/A) |
| **Totals** | — | **63 applicable** | **57** | **0** | **6** | **4 sections** | **~10 % gap (applicable)** |

Section 11 is expected to be 60 % deferred because finalizing Tech Architecture IS Phase 3's output — this is not a gap, it's the correct artifact boundary.

---

## Downstream Impact Notes

### For PM (Phase 2)

Gaps that affect user story writing, acceptance criteria, and prioritization:

- **KU-Q-01 (semver discipline within 1.x)** — PM decides whether each ported module ships as a patch (1.1.14 → 1.1.15 → …) or whole migration is a minor cadence (1.2.0 → 1.3.0 → …). Shapes how user stories are scoped (per-module vs per-release) and how acceptance criteria attach to PR vs release.
- **KU-Q-04 (downstream consumer communication plan for 2.0 breakage)** — PM drafts the announcement / deprecation schedule / RC soak plan. Affects 2.0 acceptance criteria (all 4 AI-assistant integrations signed off).
- **KU-06 (Node ≥ 22 lockout analysis)** — PM confirms with Samuel Combey whether Node 22 is acceptable floor; if not, re-evaluate 2.0 runtime requirements.
- **KU-05 (end users besides Samuel)** — PM confirms with Samuel; default assumption "yes, preserve 1.x compat" (plan already enforces).

### For Architect (Phase 3)

Gaps that affect system design, data modelling, API contracts, and deployment strategy:

- **KU-03 (npm publish rights verification)** — Architect must confirm before Phase 8 cutover; run `npm owner ls jumpstart-mode`; coordinate with Jo Otey if Samuel isn't an owner.
- **KU-04 (AI-assistant benefit from `.d.ts` vs JSDoc)** — 2-hour spike: invoke 3 representative lib modules from Claude Code + Cursor against both representations. Outcome informs whether to ship only `.d.ts` or also curated JSDoc.
- **D-5, D-6, D-7 (package layout, CLI framework, Zod direction)** — Architect resolves via Context7-verified research (plan § 4 offers starting recommendations) + ADRs in `specs/decisions/`.
- **D-4 (semver discipline) passes through** — Architect consumes PM's decision to structure the implementation plan's phase cadence.

### For Developer (Phase 4)

Gaps that affect implementation, testing strategy, and deployment:

- **Production-quality CI gates (plan § 10)** — Developer wires: Biome lint/format; `tsc --noEmit`; coverage ratchet per-file; `npm audit --audit-level=high`; holodeck baseline scenario; CLI help snapshot diff. These are acceptance gates for every port PR.
- **Strangler-fig discipline** — Developer enforces "port PRs change zero behavior" rule via PR template + reviewer checklist. Bugs discovered during porting go into follow-up issues, NOT the port PR.
- **AI-assistant IPC backwards compat** — Developer ensures every ported `src/lib/*.ts` module retains the `isDirectRun() + runIpc()` dual-mode shape; regression tests exercise both import and subprocess invocation.
- **Feature-flag escape hatches** — High-risk ported modules ship behind `JUMPSTART_USE_TS_<MODULE>=1` env flag for first minor release; removed at 2.0 (plan § 9 rollback).

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:requirements-responses",
  "js:phase": 1,
  "js:agent": "Analyst",
  "js:status": "Draft",
  "js:version": "1.0.0",
  "js:upstream": [
    { "@id": "js:challenger-brief" },
    { "@id": "js:codebase-context" }
  ],
  "js:downstream": [
    { "@id": "js:product-brief" },
    { "@id": "js:prd" },
    { "@id": "js:architecture" }
  ],
  "js:traces": []
}
```
