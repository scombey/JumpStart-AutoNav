---
id: research
phase: advisory
agent: researcher
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs: []
dependencies: []
risk_level: medium
owners: []
sha256: ""
---

# Research Report: {{Topic}}

> **Evidence-Based Technology Evaluation and Validation**

## Metadata

| Field | Value |
|---|---|
| Topic | {{Research topic}} |
| Researcher | AI Domain Researcher |
| Date | {{Date}} |
| Requested By | {{Agent or human who requested the research}} |
| Input Document | {{Spec artifact containing claims to validate}} |

---

## 1. Claims Registry

| Claim ID | Source | Claim | Status | Citation |
|---|---|---|---|---|
| C-001 | {{architecture.md}} | {{Claim about a technology}} | VERIFIED / OUTDATED / INCORRECT / UNVERIFIABLE | [Context7: {{library@version}}] |
| C-002 | {{architecture.md}} | {{Another claim}} | {{Status}} | {{Citation}} |

### Verification Summary

| Status | Count |
|---|---|
| Verified | {{n}} |
| Outdated | {{n}} |
| Incorrect | {{n}} |
| Unverifiable | {{n}} |
| Partially True | {{n}} |

---

## 2. Library Health Assessment

| Package | Version | Last Release | Open Issues | CVEs | License | Health |
|---|---|---|---|---|---|---|
| {{react}} | {{18.3.1}} | {{2024-MM-DD}} | {{N}} | {{0}} | MIT | ✅ Healthy |
| {{express}} | {{4.18.2}} | {{2023-MM-DD}} | {{N}} | {{1}} | MIT | ⚠️ Review |

### Health Criteria

| Criterion | Weight | Assessment |
|---|---|---|
| Last release < 6 months | High | {{Pass / Fail per package}} |
| No known CVEs | High | {{Pass / Fail per package}} |
| License compatible | High | {{Pass / Fail per package}} |
| Active maintainers | Medium | {{Pass / Fail per package}} |
| Documentation quality | Medium | {{Pass / Fail per package}} |
| Community activity | Low | {{Pass / Fail per package}} |

---

## 3. Version-Pinned Dependencies

| Package | Pinned Version | Min Version | Max Tested | License | Breaking Changes Horizon |
|---|---|---|---|---|---|
| {{package}} | {{exact version}} | {{oldest compatible}} | {{newest tested}} | {{SPDX}} | {{Expected next major date}} |

---

## 4. Competitive Analysis (if applicable)

### {{Category}}: {{Option A}} vs. {{Option B}} vs. {{Option C}}

| Criterion | {{Option A}} | {{Option B}} | {{Option C}} |
|---|---|---|---|
| Performance | {{Assessment}} | {{Assessment}} | {{Assessment}} |
| Developer Experience | {{Assessment}} | {{Assessment}} | {{Assessment}} |
| Community / Support | {{Assessment}} | {{Assessment}} | {{Assessment}} |
| Learning Curve | {{Assessment}} | {{Assessment}} | {{Assessment}} |
| Cost | {{Assessment}} | {{Assessment}} | {{Assessment}} |
| Production Readiness | {{Assessment}} | {{Assessment}} | {{Assessment}} |

**Recommendation**: {{Recommended option with justification}}

---

## 5. Risks and Recommendations

| ID | Finding | Severity | Recommendation |
|---|---|---|---|
| R-001 | {{Risk or finding}} | High / Medium / Low | {{Specific action}} |
| R-002 | {{Risk or finding}} | {{Severity}} | {{Specific action}} |

---

## 6. Sources

All claims verified using Context7 MCP unless otherwise noted.

| Source | Type | Date Accessed | Reliability |
|---|---|---|---|
| [Context7: {{library@version}}] | Documentation | {{Date}} | Authoritative |
| {{URL}} | {{Blog / Benchmark / RFC}} | {{Date}} | {{High / Medium / Low}} |

---

## Stack Metadata Reference

> **Version Pinning:** For the complete version-pinned dependency list, compatibility matrix, and breaking changes horizon, see the Tech Stack Metadata document (`.jumpstart/templates/stack-metadata.md`). All versions listed in this research document must be exact and verified via Context7 or official documentation.

---

## Phase Gate Approval

- [ ] All technology claims verified against current documentation
- [ ] Library health assessed for all recommended dependencies
- [ ] Versions pinned with compatibility ranges
- [ ] Risks documented with mitigations
- [ ] All sources cited
- **Approved by:** Pending
- **Date:** Pending

