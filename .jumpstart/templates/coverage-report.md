---
id: coverage-report
phase: any
agent: System
status: Generated
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs:
  - specs/prd.md
  - specs/implementation-plan.md
dependencies:
  - prd
  - implementation-plan
risk_level: low
owners: []
sha256: null
---

# Coverage Report: PRD Stories → Implementation Tasks

> **Generated:** [DATE]
> **Tool:** `bin/lib/coverage.js`
> **PRD:** `specs/prd.md`
> **Implementation Plan:** `specs/implementation-plan.md`

---

## Summary

| Metric | Value |
|--------|-------|
| **Total stories** | [N] |
| **Covered stories** | [N] |
| **Uncovered stories** | [N] |
| **Coverage** | [N]% |
| **Total tasks** | [N] |
| **Orphan tasks** (no story mapping) | [N] |

---

## Coverage Matrix

| Story ID | Story Title | Mapped Tasks | Status |
|----------|-------------|-------------|--------|
| E01-S01 | [title] | M01-T01, M01-T02 | Covered |
| E01-S02 | [title] | — | **GAP** |

---

## Uncovered Stories

Stories with zero mapped tasks — these MUST be addressed before Phase 4.

| Story ID | Epic | Title | Priority |
|----------|------|-------|----------|
| [E01-S02] | [Epic 1] | [title] | [Must / Should / Could] |

---

## Orphan Tasks

Tasks that reference no story — may indicate scope creep or missing PRD entries.

| Task ID | Milestone | Description |
|---------|-----------|-------------|
| [M02-T05] | [Milestone 2] | [description] |

---

## Recommendations

1. [Create tasks for uncovered stories]
2. [Map orphan tasks to stories or remove them]
3. [Review coverage threshold: target is 100%]
