---
id: traceability
phase: 3
agent: architect
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
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
sha256: ""
---

# Traceability Matrix

> **Requirement → Story → Task → Test — End-to-End Traceability**

## Purpose

This document provides a single table showing the complete traceability chain from validation criteria through user stories, implementation tasks, and tests. Every requirement must trace forward to at least one test. Every test must trace back to at least one requirement.

---

## 1. Full Traceability Chain

| Validation Criterion (Phase 0) | Capability (Phase 1) | Story ID (Phase 2) | Task IDs (Phase 3) | Test IDs (Phase 4) | Status |
|---|---|---|---|---|---|
| {{VC-01: criterion}} | {{Cap-01: capability}} | {{E1-S1}} | {{T001, T002}} | {{test-e1s1-01, test-e1s1-02}} | ✅ Covered / ⚠️ Partial / ❌ Gap |
| {{VC-02: criterion}} | {{Cap-02: capability}} | {{E1-S2}} | {{T003}} | {{test-e1s2-01}} | {{Status}} |

---

## 2. Forward Traceability (Requirements → Tests)

### Orphan Check — Requirements Without Tests

| Requirement | Story | Tasks | Tests | Gap |
|---|---|---|---|---|
| {{Every requirement should have ≥ 1 test}} | | | | ❌ No test coverage |

---

## 3. Backward Traceability (Tests → Requirements)

### Orphan Check — Tests Without Requirements

| Test ID | Test Description | Story | Requirement | Gap |
|---|---|---|---|---|
| {{Every test should trace to a story/requirement}} | | | | ❌ Orphan test |

---

## 4. NFR Traceability

| NFR ID | Requirement | Architecture Component | Task | Verification | Status |
|---|---|---|---|---|---|
| {{NFR-P01}} | {{Response time < 200ms}} | {{API Layer}} | {{T005}} | {{Load test}} | {{Status}} |

---

## 5. Coverage Summary

| Level | Total Items | Fully Traced | Partially Traced | Not Traced | Coverage % |
|---|---|---|---|---|---|
| Validation Criteria → Stories | {{N}} | {{N}} | {{N}} | {{N}} | {{N}}% |
| Stories → Tasks | {{N}} | {{N}} | {{N}} | {{N}} | {{N}}% |
| Tasks → Tests | {{N}} | {{N}} | {{N}} | {{N}} | {{N}}% |
| NFRs → Verification | {{N}} | {{N}} | {{N}} | {{N}} | {{N}}% |
| **Overall** | | | | | **{{N}}%** |

---

## 6. Gap Analysis

| Gap Type | Count | Items | Recommended Action |
|---|---|---|---|
| Requirements without tests | {{N}} | {{list}} | Write tests before Phase 4 completion |
| Tests without requirements | {{N}} | {{list}} | Trace to requirement or remove |
| Stories without tasks | {{N}} | {{list}} | Update implementation plan |
| NFRs without verification | {{N}} | {{list}} | Define verification approach |

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:traceability",
  "js:phase": 3,
  "js:agent": "Architect",
  "js:status": "[STATUS]",
  "js:version": "[VERSION]",
  "js:upstream": [
    { "@id": "js:prd" },
    { "@id": "js:architecture" },
    { "@id": "js:implementation-plan" }
  ],
  "js:downstream": [],
  "js:traces": []
}
```
