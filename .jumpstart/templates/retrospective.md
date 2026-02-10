---
id: retrospective
phase: post-build
agent: retrospective
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - specs/implementation-plan.md
  - specs/architecture.md
  - specs/prd.md
dependencies:
  - implementation-plan
  - architecture
  - prd
risk_level: low
owners: []
sha256: ""
---

# Implementation Retrospective

> **Post-Build Learnings and Process Assessment**

## Retrospective Metadata

| Field | Value |
|---|---|
| Project | {{Project name}} |
| Date | {{Date}} |
| Facilitator | AI Retrospective Agent |
| Phases Covered | Phase 0–4 |
| Implementation Duration | {{Start date}} to {{End date}} |

---

## 1. Plan vs. Reality

### Task Completion Summary

| Metric | Planned | Actual | Delta |
|---|---|---|---|
| Total tasks | {{N}} | {{N}} | {{+/-N}} |
| Tasks completed as planned | | {{N}} | |
| Tasks modified during implementation | | {{N}} | |
| Tasks added (unplanned work) | 0 | {{N}} | {{+N}} |
| Tasks dropped | 0 | {{N}} | {{-N}} |

### Scope Changes

| Change | Type | Reason | Impact |
|---|---|---|---|
| {{Description}} | Added / Removed / Modified | {{Why the scope changed}} | {{Effect on timeline/quality}} |

### Estimation Accuracy

| Story/Task | Estimated | Actual | Variance | Root Cause |
|---|---|---|---|---|
| {{ID}} | {{estimate}} | {{actual}} | {{+/-}} | {{Why the estimate was off}} |

---

## 2. Deviation Catalogue

| Deviation ID | Planned | Actual | Root Cause | Impact | Resolution |
|---|---|---|---|---|---|
| DEV-001 | {{What was planned}} | {{What happened}} | {{Why}} | {{Effect}} | {{How it was handled}} |

---

## 3. Technical Debt Inventory

### Intentional Debt

| ID | Description | Location | Severity | Effort to Resolve | Timeline |
|---|---|---|---|---|---|
| TD-001 | {{Shortcut taken deliberately}} | {{file paths}} | High / Medium / Low | {{estimate}} | {{When to address}} |

### Accidental Debt

| ID | Description | Location | Severity | Effort to Resolve | Discovery Point |
|---|---|---|---|---|---|
| TD-002 | {{Complexity or issue found during build}} | {{file paths}} | High / Medium / Low | {{estimate}} | {{When discovered}} |

### Debt Markers in Code

| Marker | Count | Files | Severity |
|---|---|---|---|
| TODO | {{N}} | {{file list}} | Medium |
| FIXME | {{N}} | {{file list}} | High |
| HACK | {{N}} | {{file list}} | High |

### Test Gaps

| Area | Current Coverage | Target Coverage | Gap |
|---|---|---|---|
| {{Module/component}} | {{N}}% | {{N}}% | {{N}}% |

---

## 4. Process Assessment

| Phase | Agent | Effectiveness (1-5) | What Worked | What Didn't | Improvement |
|---|---|---|---|---|---|
| Pre-0 | Scout | {{N/A or 1-5}} | {{Specifics}} | {{Specifics}} | {{Recommendation}} |
| 0 | Challenger | {{1-5}} | | | |
| 1 | Analyst | {{1-5}} | | | |
| 2 | PM | {{1-5}} | | | |
| 3 | Architect | {{1-5}} | | | |
| 4 | Developer | {{1-5}} | | | |

### Process Metrics

| Metric | Value | Assessment |
|---|---|---|
| Phases completed | {{N}} / 5 | |
| Artifacts generated | {{N}} | |
| Q&A log entries | {{N}} | |
| Insight entries captured | {{N}} | |
| ADRs created | {{N}} | |
| Phase gate rejections | {{N}} | |

---

## 5. Framework Issues

### Template Gaps

| Template | Issue | Recommendation |
|---|---|---|
| {{template}} | {{What was missing or unclear}} | {{Proposed improvement}} |

### Schema Issues

| Schema | Issue | Impact |
|---|---|---|
| {{schema}} | {{Validation problem}} | {{How it affected work}} |

### Agent Protocol Gaps

| Agent | Gap | Recommendation |
|---|---|---|
| {{agent}} | {{Missing instruction or unclear guidance}} | {{Proposed fix}} |

---

## 6. Key Learnings

### What Went Well

1. **{{Title}}** — {{Description of what worked and why}}
2. **{{Title}}** — {{Description}}

### What Could Be Improved

1. **{{Title}}** — {{Description and specific recommendation}}
2. **{{Title}}** — {{Description}}

### Surprises

1. **{{Title}}** — {{What was unexpected and what was learned}}

---

## 7. Recommendations for Next Iteration

| Priority | Recommendation | Category | Effort |
|---|---|---|---|
| 1 | {{Recommendation}} | Process / Technical / Documentation | Low / Medium / High |
| 2 | {{Recommendation}} | {{Category}} | {{Effort}} |
| 3 | {{Recommendation}} | {{Category}} | {{Effort}} |

---

## Phase Gate Approval

- [ ] Human has reviewed this retrospective
- [ ] Technical debt items are acknowledged
- [ ] Process improvements are noted for next iteration
- [ ] Key learnings are documented

**Approved by:** [Human's name or "Pending"]
**Approval date:** [Date or "Pending"]
**Status:** Draft

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:retrospective",
  "js:phase": "post-build",
  "js:agent": "Retrospective",
  "js:status": "[STATUS]",
  "js:version": "[VERSION]",
  "js:upstream": [
    { "@id": "js:implementation-plan" },
    { "@id": "js:architecture" },
    { "@id": "js:prd" }
  ],
  "js:downstream": [],
  "js:traces": []
}
```
