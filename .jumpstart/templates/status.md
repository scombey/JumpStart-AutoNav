---
id: status
phase: any
agent: System
status: Generated
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs: []
dependencies: []
risk_level: low
owners: []
sha256: null
---

# Project Status Dashboard

> **Generated:** [DATE]
> **Command:** `/jumpstart.status`

---

## Phase Progress

| Phase | Agent | Status | Artifact | Approved |
|-------|-------|--------|----------|----------|
| Pre-0: Scout | Scout | [Not Started / Complete] | `specs/codebase-context.md` | [Yes / No / N/A] |
| 0: Challenge | Challenger | [Not Started / In Progress / Complete] | `specs/challenger-brief.md` | [Yes / No] |
| 1: Analyze | Analyst | [Not Started / In Progress / Complete] | `specs/product-brief.md` | [Yes / No] |
| 2: Plan | PM | [Not Started / In Progress / Complete] | `specs/prd.md` | [Yes / No] |
| 3: Architect | Architect | [Not Started / In Progress / Complete] | `specs/architecture.md` | [Yes / No] |
| 4: Build | Developer | [Not Started / In Progress / Complete] | `src/` | [Yes / No] |

```
[Scout] ──▶ [Challenge] ──▶ [Analyze] ──▶ [Plan] ──▶ [Architect] ──▶ [Build]
  ○           ○              ○             ○           ○              ○
```

Legend: ○ Not Started | ◐ In Progress | ● Complete

---

## Current Phase Detail

| Field | Value |
|-------|-------|
| **Active Phase** | [Phase N: Name] |
| **Active Agent** | [Agent Name] |
| **Protocol Step** | [Step X of Y] |
| **Blocking Issues** | [None / list] |

---

## Artifact Inventory

| Artifact | Path | Exists | Valid | Approved |
|----------|------|--------|-------|----------|
| Challenger Brief | `specs/challenger-brief.md` | [Yes/No] | [Yes/No] | [Yes/No] |
| Product Brief | `specs/product-brief.md` | [Yes/No] | [Yes/No] | [Yes/No] |
| PRD | `specs/prd.md` | [Yes/No] | [Yes/No] | [Yes/No] |
| Architecture | `specs/architecture.md` | [Yes/No] | [Yes/No] | [Yes/No] |
| Implementation Plan | `specs/implementation-plan.md` | [Yes/No] | [Yes/No] | [Yes/No] |
| Data Model | `specs/data-model.md` | [Yes/No] | [Yes/No] | [Yes/No] |
| Contracts | `specs/contracts.md` | [Yes/No] | [Yes/No] | [Yes/No] |

---

## Quality Metrics

| Check | Result | Tool |
|-------|--------|------|
| Schema Validation | [Pass / Fail / N/A] | `bin/lib/validator.js` |
| Cross-Reference Links | [Pass / Fail / N/A] | `bin/lib/crossref.js` |
| Spec Smells | [N findings] | `bin/lib/smell-detector.js` |
| Story-Task Coverage | [N%] | `bin/lib/coverage.js` |
| Consistency | [N contradictions] | `bin/lib/analyzer.js` |
| Timestamp Audit | [Pass / Fail] | `bin/lib/timestamps.js` |

---

## Open Clarifications

| # | Location | Question | Status |
|---|----------|----------|--------|
| [from needs-clarification tags across all artifacts] |

---

## ADR Summary

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001] | [title] | Accepted | [date] |

---

## Timeline

| Milestone | Target | Status |
|-----------|--------|--------|
| Phase 0 Complete | [date] | [Done / Pending] |
| Phase 1 Complete | [date] | [Done / Pending] |
| Phase 2 Complete | [date] | [Done / Pending] |
| Phase 3 Complete | [date] | [Done / Pending] |
| Phase 4 Complete | [date] | [Done / Pending] |

---

## Usage & Cost Tracking

> Populated from `.jumpstart/usage-log.json` when usage tracking is enabled.

| Metric | Value |
|--------|-------|
| Total Tokens | [number] |
| Estimated Cost | $[amount] |
| Total Sessions | [number] |

### By Phase

| Phase | Tokens | Cost | Sessions |
|-------|--------|------|----------|
| Phase 0 | [tokens] | $[cost] | [n] |
| Phase 1 | [tokens] | $[cost] | [n] |
| Phase 2 | [tokens] | $[cost] | [n] |
| Phase 3 | [tokens] | $[cost] | [n] |
| Phase 4 | [tokens] | $[cost] | [n] |
