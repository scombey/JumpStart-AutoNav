---
id: drift-report
phase: advisory
agent: maintenance
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - architecture
  - prd
  - implementation-plan
dependencies: []
risk_level: medium
owners: []
sha256: ""
---

# Drift Report: {{Project Name}}

> **Dependency Health, Specification Drift, and Technical Debt Assessment**

## Metadata

| Field | Value |
|---|---|
| Project | {{Project Name}} |
| Maintenance Agent | AI Maintenance Agent |
| Date | {{Date}} |
| Health Score | **HEALTHY** / **NEEDS ATTENTION** / **AT RISK** / **CRITICAL** |

---

## 1. Dependency Health

### Package Scan

| Package | Current | Latest | Gap | CVEs | Deprecated | Action |
|---|---|---|---|---|---|---|
| {{package}} | {{version}} | {{version}} | Patch / Minor / Major | {{0}} | No | Update / Evaluate / OK |

### Security Vulnerabilities

| Package | CVE | Severity | Description | Fix Version |
|---|---|---|---|---|
| {{package}} | {{CVE-YYYY-NNNNN}} | Critical / High / Medium / Low | {{Brief description}} | {{version}} |

### End of Life Warnings

| Component | Current Version | EOL Date | Upgrade Path |
|---|---|---|---|
| {{Node.js}} | {{18.x}} | {{2025-04}} | {{Upgrade to 20.x}} |

---

## 2. Specification Drift

### Drift Items

| ID | Artifact | Section | Expected | Actual | Drift Type |
|---|---|---|---|---|---|
| DRIFT-001 | {{architecture.md}} | {{Data Model}} | {{Specified schema}} | {{Actual schema}} | Undocumented Addition |
| DRIFT-002 | {{prd.md}} | {{Feature X}} | {{Specified behaviour}} | {{Actual behaviour}} | Missing Implementation |
| DRIFT-003 | {{impl-plan.md}} | {{Task T-07}} | Not Started | Code exists | Status Mismatch |

### Drift Types

| Type | Count | Description |
|---|---|---|
| Undocumented Addition | {{n}} | Code does more than specs say |
| Missing Implementation | {{n}} | Specs promise something code doesn't deliver |
| Scope Creep | {{n}} | Features added without PRD update |
| Status Mismatch | {{n}} | Task statuses don't match reality |
| Invariant Violation | {{n}} | Constraint from invariants.md no longer met |

---

## 3. Technical Debt Inventory

### Code Markers

| Marker | File | Line | Content | Age |
|---|---|---|---|---|
| TODO | {{file}} | {{line}} | {{Comment text}} | {{Days since added}} |
| FIXME | {{file}} | {{line}} | {{Comment text}} | {{Days}} |
| HACK | {{file}} | {{line}} | {{Comment text}} | {{Days}} |

### Debt Categories

| Category | Count | Examples |
|---|---|---|
| Deferred tests | {{n}} | {{Skipped tests with no linked issue}} |
| Hardcoded values | {{n}} | {{Config that should be externalised}} |
| Error swallowing | {{n}} | {{Catch blocks that discard errors}} |
| Stale documentation | {{n}} | {{README sections that reference old features}} |
| Missing error handling | {{n}} | {{Happy path only, no error cases}} |

---

## 4. Test Health

| Metric | Value | Status |
|---|---|---|
| All tests passing | {{Yes / No}} | ✅ / ❌ |
| Flaky tests | {{n}} | {{Count of intermittent failures}} |
| Coverage trend | {{↑ / → / ↓}} | {{Direction of coverage change}} |
| Untested additions | {{n}} files | {{Recently changed files without test updates}} |
| Test-AC alignment | {{%}} | {{% of acceptance criteria with matching tests}} |

---

## 5. Remediation Plan

| ID | Category | Finding | Severity | Effort | Recommendation | Risk of Inaction |
|---|---|---|---|---|---|---|
| REM-001 | Dependency | {{Finding}} | Critical | Small | {{Action}} | {{What happens if ignored}} |
| REM-002 | Drift | {{Finding}} | High | Medium | {{Action}} | {{Risk}} |
| REM-003 | Debt | {{Finding}} | Medium | Small | {{Action}} | {{Risk}} |

### Top 5 Most Urgent Items

1. **REM-{{N}}**: {{Title}} — {{Why it's urgent}}
2. **REM-{{N}}**: {{Title}} — {{Why it's urgent}}
3. **REM-{{N}}**: {{Title}} — {{Why it's urgent}}
4. **REM-{{N}}**: {{Title}} — {{Why it's urgent}}
5. **REM-{{N}}**: {{Title}} — {{Why it's urgent}}

---

## 6. Maintenance Recommendations

| Recommendation | Frequency | Description |
|---|---|---|
| Dependency scan | Weekly | Run `npm audit` / `pip audit` and review |
| Spec drift check | Per sprint | Compare code changes against spec artifacts |
| Debt review | Monthly | Review and triage TODO/FIXME markers |
| Test health audit | Per sprint | Monitor coverage trends and flaky tests |
| EOL tracking | Quarterly | Check runtime and framework EOL dates |

---

## Phase Gate Approval

- [ ] Dependency scan completed with CVE check
- [ ] Specification drift analysis performed
- [ ] Technical debt markers inventoried
- [ ] Test health assessed
- [ ] Remediation plan prioritised
- [ ] Overall health score assigned
- **Approved by:** Pending
- **Date:** Pending

