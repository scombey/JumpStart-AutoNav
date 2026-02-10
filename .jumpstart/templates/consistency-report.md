---
id: consistency-report
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

# Consistency Analysis Report

> **Generated:** [DATE]
> **Tool:** `bin/lib/analyzer.js`
> **Command:** `/jumpstart.analyze`

---

## Summary

| Metric | Value |
|--------|-------|
| **Artifacts analyzed** | [N] |
| **Contradictions found** | [N] |
| **Missing coverage** | [N stories/tasks without mapping] |
| **Terminology drift** | [N inconsistent terms] |
| **Overall consistency score** | [0-100]% |

---

## Contradictions

Mismatches between PRD, architecture, implementation plan, and contracts.

| ID | Artifact A | Artifact B | Description | Severity |
|----|-----------|-----------|-------------|----------|
| CON-001 | [file:section] | [file:section] | [What contradicts] | critical / major / minor |

---

## Missing Coverage

Stories or requirements not mapped to any downstream artifact.

| Source | ID | Title | Missing From |
|--------|----|-------|-------------|
| PRD | [E01-S01] | [Story title] | Implementation Plan / Architecture / Contracts |

---

## Terminology Drift

Terms used inconsistently across artifacts.

| Term in PRD | Term in Architecture | Term in Tasks | Recommended |
|-------------|---------------------|---------------|-------------|
| [e.g., "user"] | [e.g., "account holder"] | [e.g., "customer"] | [canonical term] |

---

## NFR Coverage Gaps

Non-functional requirements without architectural backing.

| NFR ID | Description | Architecture Mapping | Status |
|--------|-------------|---------------------|--------|
| [NFR-01] | [description] | [component or "MISSING"] | Covered / Gap |

---

## Recommendations

1. [Actionable fix for the most critical contradiction]
2. [Actionable fix for coverage gaps]
3. [Terminology standardization action]

---

## Artifacts Analyzed

| Artifact | Path | Last Modified |
|----------|------|---------------|
| Challenger Brief | `specs/challenger-brief.md` | [date] |
| Product Brief | `specs/product-brief.md` | [date] |
| PRD | `specs/prd.md` | [date] |
| Architecture | `specs/architecture.md` | [date] |
| Implementation Plan | `specs/implementation-plan.md` | [date] |
| Contracts | `specs/contracts.md` | [date] |
| Data Model | `specs/data-model.md` | [date] |
