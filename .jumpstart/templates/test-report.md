---
id: test-report
phase: "4"
agent: qa
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - test-plan
  - prd
dependencies: []
risk_level: medium
owners: []
sha256: ""
---

# Test Report: {{Project Name}}

> **Release Readiness Assessment**

## Metadata

| Field | Value |
|---|---|
| Project | {{Project Name}} |
| QA Agent | Quinn |
| Date | {{Date}} |
| Test Plan Reference | `specs/test-plan.md` |
| Build / Commit | {{SHA or version}} |

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| **Recommendation** | **READY** / **READY WITH CAVEATS** / **NOT READY** |
| Total Tests | {{count}} |
| Passed | {{count}} ({{%}}) |
| Failed | {{count}} ({{%}}) |
| Skipped | {{count}} ({{%}}) |
| Story Coverage | {{%}} |
| Line Coverage | {{%}} |
| Branch Coverage | {{%}} |

---

## 2. Test Results by Suite

| Suite | Tests | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| {{Unit - Module A}} | {{n}} | {{n}} | {{n}} | {{n}} | {{time}} |
| {{Integration}} | {{n}} | {{n}} | {{n}} | {{n}} | {{time}} |
| {{E2E}} | {{n}} | {{n}} | {{n}} | {{n}} | {{time}} |

---

## 3. Failed Tests

### {{Test ID}}: {{Test Name}}

- **Suite**: {{Module}}
- **Type**: Unit / Integration / E2E
- **Error**: {{Error message}}
- **Impact**: {{What functionality is affected}}
- **Root Cause**: {{Known / Under investigation}}
- **Severity**: Critical / High / Medium / Low

> Repeat for each failed test.

---

## 4. Coverage Analysis

### Story Coverage

| Req ID | Description | Tests | Status |
|---|---|---|---|
| {{E01-S01}} | {{Story}} | T-E01-S01-01, T-E01-S01-02 | ✅ Covered |
| {{E01-S02}} | {{Story}} | — | ❌ No tests |

### Uncovered Areas

| Area | Risk | Recommendation |
|---|---|---|
| {{Component or feature}} | {{Risk level}} | {{Add tests / Accept risk}} |

---

## 5. NFR Compliance

| NFR ID | Metric | Target | Actual | Status |
|---|---|---|---|---|
| NFR-1 | API response time (p95) | < 200ms | {{actual}}ms | ✅ / ❌ |
| NFR-2 | Throughput | 500 req/s | {{actual}} req/s | ✅ / ❌ |
| NFR-3 | Availability | 99.9% | {{actual}}% | ✅ / ❌ |

---

## 6. Outstanding Risks

| Risk ID | Description | Severity | Mitigation |
|---|---|---|---|
| R-001 | {{Risk description}} | {{Severity}} | {{What can be done}} |

---

## 7. Caveats (if READY WITH CAVEATS)

Items accepted as known limitations for this release:

1. {{Caveat description — what's not ideal and why it's acceptable}}
2. {{Caveat description}}

---

## Phase Gate Approval

- [ ] All critical tests passing
- [ ] No critical or high severity failures unresolved
- [ ] Coverage meets configured thresholds
- [ ] NFR compliance verified
- [ ] Outstanding risks documented and accepted
- [ ] Release recommendation stated with justification
- **Approved by:** Pending
- **Date:** Pending

