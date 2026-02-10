---
id: refactor-report
phase: advisory
agent: refactor
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - architecture
dependencies: []
risk_level: low
owners: []
sha256: ""
---

# Refactoring Report: {{Project Name}}

> **Complexity Analysis, Code Smells, and Structural Improvement Recommendations**

## Metadata

| Field | Value |
|---|---|
| Project | {{Project Name}} |
| Refactoring Agent | AI Refactoring Agent |
| Date | {{Date}} |
| Architecture Reference | `specs/architecture.md` |
| Codebase Scope | `src/` |

---

## 1. Complexity Heatmap

| File | Lines | Functions | Max CC | Avg CC | Max Nesting | Status |
|---|---|---|---|---|---|---|
| {{src/file.js}} | {{N}} | {{N}} | {{N}} | {{N}} | {{N}} | OK / Review / Critical |
| {{src/other.js}} | {{N}} | {{N}} | {{N}} | {{N}} | {{N}} | {{Status}} |

### Thresholds

| Metric | OK | Review | Critical |
|---|---|---|---|
| Cyclomatic Complexity (per function) | ≤ 5 | 6-10 | > 10 |
| File Length | ≤ 200 | 201-300 | > 300 |
| Function Length | ≤ 30 | 31-50 | > 50 |
| Nesting Depth | ≤ 2 | 3 | > 3 |
| Parameters | ≤ 3 | 4 | > 4 |

---

## 2. Code Smells

| ID | Type | Location | Description | Severity |
|---|---|---|---|---|
| SMELL-001 | Duplication | {{file:line}} | {{What's duplicated and where}} | High / Medium / Low |
| SMELL-002 | Dead Code | {{file:line}} | {{Unreachable / Unused}} | {{Severity}} |
| SMELL-003 | God Object | {{file}} | {{Too many responsibilities}} | {{Severity}} |
| SMELL-004 | Feature Envy | {{file:line}} | {{Uses another module's data}} | {{Severity}} |
| SMELL-005 | Long Params | {{file:line}} | {{N parameters}} | {{Severity}} |

---

## 3. Pattern Alignment

| Architecture Pattern | Expected | Actual | Aligned |
|---|---|---|---|
| {{Pattern from architecture.md}} | {{How it should be used}} | {{How it's actually used}} | ✅ / ❌ |

### Inconsistencies

| Area | Inconsistency | Files Affected | Recommendation |
|---|---|---|---|
| {{Topic}} | {{Description of inconsistency}} | {{file1, file2}} | {{How to standardise}} |

---

## 4. Naming Review

| Category | Consistent | Issues Found |
|---|---|---|
| Variables | ✅ / ❌ | {{List specific naming issues}} |
| Functions | ✅ / ❌ | {{List specific naming issues}} |
| Files | ✅ / ❌ | {{List specific naming issues}} |
| Constants | ✅ / ❌ | {{List specific naming issues}} |

---

## 5. Refactoring Recommendations

### REF-001: {{Recommendation Title}}

| Field | Value |
|---|---|
| **Type** | Complexity / Duplication / Smell / Naming / Structure |
| **Severity** | High / Medium / Low |
| **Location** | {{file:line range}} |
| **Description** | {{What the issue is}} |
| **Technique** | {{Extract Method / Move Field / Inline / etc.}} |
| **Impact** | {{What improves — readability, testability, maintainability}} |
| **Risk** | {{What could go wrong}} |
| **Test Coverage** | {{Are there tests? Yes / No / Partial}} |
| **Effort** | Small / Medium / Large |

> Repeat for each recommendation.

---

## 6. Summary

| Category | Count | High | Medium | Low |
|---|---|---|---|---|
| Complexity | {{n}} | {{n}} | {{n}} | {{n}} |
| Code Smells | {{n}} | {{n}} | {{n}} | {{n}} |
| Naming | {{n}} | {{n}} | {{n}} | {{n}} |
| Structure | {{n}} | {{n}} | {{n}} | {{n}} |
| **Total** | **{{n}}** | **{{n}}** | **{{n}}** | **{{n}}** |

### Top 5 Highest-Impact Opportunities

1. **REF-{{N}}**: {{Title}} — {{Effort}} effort, {{Impact}}
2. **REF-{{N}}**: {{Title}} — {{Effort}} effort, {{Impact}}
3. **REF-{{N}}**: {{Title}} — {{Effort}} effort, {{Impact}}
4. **REF-{{N}}**: {{Title}} — {{Effort}} effort, {{Impact}}
5. **REF-{{N}}**: {{Title}} — {{Effort}} effort, {{Impact}}

---

## Phase Gate Approval

- [ ] Complexity heatmap generated for all source files
- [ ] Code smells identified and categorised
- [ ] Pattern alignment checked against architecture
- [ ] Naming consistency reviewed
- [ ] Recommendations prioritised with effort estimates
- [ ] Test coverage assessed for each recommendation
- **Approved by:** Pending
- **Date:** Pending

