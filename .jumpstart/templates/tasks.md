---
id: tasks
phase: 3
agent: Architect
status: Draft
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs:
  - specs/prd.md
  - specs/architecture.md
  - specs/implementation-plan.md
dependencies:
  - prd
  - architecture
  - implementation-plan
risk_level: medium
owners: []
sha256: null
---

# Task Breakdown

> **Phase:** 3 — Solutioning
> **Agent:** The Architect
> **Status:** Draft
> **Created:** [DATE]
> **Upstream References:**
> - [specs/prd.md](prd.md)
> - [specs/implementation-plan.md](implementation-plan.md)

---

## Task ID Convention

Tasks follow the pattern `M{milestone}-T{sequence}`:
- **M01-T01** = Milestone 1, Task 1
- **M02-T03** = Milestone 2, Task 3

---

## Milestone: [M01 — Name]

### M01-T01: [Task Title]

| Field | Value |
|-------|-------|
| **Story** | [E01-S01] |
| **Component** | [Architecture component] |
| **Layer** | Data / Model / Service / API / UI |
| **Depends On** | — |
| **Estimate** | [S / M / L / XL] |
| **Priority** | Must / Should / Could |

**Description:**
[What needs to be built, in 2-3 sentences. Reference the acceptance criteria from the PRD.]

**Acceptance Criteria:**
```gherkin
Given [precondition]
When  [action]
Then  [outcome]
```

**Files to Create/Edit:**
- `src/[path]` — [description]
- `tests/[path]` — [test description]

---

### M01-T02: [Task Title]

[Repeat for each task]

---

## Milestone: [M02 — Name]

[Repeat for each milestone]

---

## Dependency Graph

See [specs/task-dependencies.md](task-dependencies.md) for the full dependency audit and build-order visualization.

---

## Coverage Summary

| Total Stories | Covered | Uncovered | Coverage |
|---------------|---------|-----------|----------|
| [N] | [N] | [N] | [N]% |

Target: **100% coverage** — every PRD story maps to at least one task.

---

## Phase Gate Approval

- [ ] Every PRD story has at least one task
- [ ] Tasks follow build order (data → model → service → API → UI)
- [ ] Estimates are provided for all tasks
- [ ] Dependencies are explicit and acyclic
- [ ] Acceptance criteria use Gherkin format

**Approved by:** Pending
**Approval date:** Pending
