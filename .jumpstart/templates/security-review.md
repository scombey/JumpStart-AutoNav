---
id: security-review
phase: advisory
agent: security
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - architecture
  - prd
dependencies: []
risk_level: high
owners: []
sha256: ""
---

# Security Review: {{Project Name}}

> **Threat Model, OWASP Audit, and Security Findings**

## Metadata

| Field | Value |
|---|---|
| Project | {{Project Name}} |
| Security Architect | AI Security Agent |
| Date | {{Date}} |
| Architecture Reference | `specs/architecture.md` |
| Posture Assessment | **ACCEPTABLE** / **NEEDS WORK** / **UNACCEPTABLE** |

---

## 1. Asset Inventory

| Asset | Type | Sensitivity | Location | Protection |
|---|---|---|---|---|
| {{User PII}} | Data | Critical | {{Database}} | {{Encryption, access control}} |
| {{API Keys}} | Credential | Critical | {{Env vars}} | {{Secret management}} |
| {{Session tokens}} | Access | High | {{Client cookie}} | {{HttpOnly, Secure, SameSite}} |

---

## 2. Threat Model (STRIDE)

### Component: {{Component Name}}

| Threat | Question | Applies | Risk | Mitigation |
|---|---|---|---|---|
| **S**poofing | Can an attacker impersonate a user/system? | {{Y/N}} | {{H/M/L}} | {{Mitigation}} |
| **T**ampering | Can data be modified without detection? | {{Y/N}} | {{H/M/L}} | {{Mitigation}} |
| **R**epudiation | Can actions be denied without audit trail? | {{Y/N}} | {{H/M/L}} | {{Mitigation}} |
| **I**nformation Disclosure | Can sensitive data be accessed by unauthorised parties? | {{Y/N}} | {{H/M/L}} | {{Mitigation}} |
| **D**enial of Service | Can the system be made unavailable? | {{Y/N}} | {{H/M/L}} | {{Mitigation}} |
| **E**levation of Privilege | Can a low-privilege user gain higher access? | {{Y/N}} | {{H/M/L}} | {{Mitigation}} |

### Trust Boundaries

```
[Client] --HTTPS--> [API Gateway] --Internal--> [Services] --Encrypted--> [Database]
         ^                        ^                         ^
    Trust Boundary 1         Trust Boundary 2          Trust Boundary 3
```

> Repeat STRIDE for each component at each trust boundary.

---

## 3. OWASP Top 10 Audit (2021)

| # | Risk | Status | Notes |
|---|---|---|---|
| A01 | Broken Access Control | {{Pass / Fail / N/A}} | {{Details}} |
| A02 | Cryptographic Failures | {{Pass / Fail / N/A}} | {{Details}} |
| A03 | Injection | {{Pass / Fail / N/A}} | {{Details}} |
| A04 | Insecure Design | {{Pass / Fail / N/A}} | {{Details}} |
| A05 | Security Misconfiguration | {{Pass / Fail / N/A}} | {{Details}} |
| A06 | Vulnerable Components | {{Pass / Fail / N/A}} | {{Details}} |
| A07 | Auth Failures | {{Pass / Fail / N/A}} | {{Details}} |
| A08 | Software and Data Integrity | {{Pass / Fail / N/A}} | {{Details}} |
| A09 | Logging and Monitoring | {{Pass / Fail / N/A}} | {{Details}} |
| A10 | SSRF | {{Pass / Fail / N/A}} | {{Details}} |

---

## 4. Invariant Compliance

| Invariant | Addressed | Location | Verification |
|---|---|---|---|
| {{Invariant from invariants.md}} | {{Yes / No}} | {{Where in architecture}} | {{How to verify}} |

---

## 5. Findings

### SEC-001: {{Finding Title}}

| Field | Value |
|---|---|
| **Severity** | Critical / High / Medium / Low / Informational |
| **OWASP** | {{A01-A10 reference}} |
| **Component** | {{Affected component}} |
| **Description** | {{What the vulnerability is}} |
| **Impact** | {{What an attacker could achieve}} |
| **Recommendation** | {{Specific mitigation steps}} |
| **Effort** | Small / Medium / Large |

> Repeat for each finding.

---

## 6. Summary

| Severity | Count |
|---|---|
| Critical | {{n}} |
| High | {{n}} |
| Medium | {{n}} |
| Low | {{n}} |
| Informational | {{n}} |

### Top 3 Critical Risks

1. {{Most important risk requiring immediate attention}}
2. {{Second priority}}
3. {{Third priority}}

---

## Phase Gate Approval

- [ ] Asset inventory complete
- [ ] STRIDE threat model applied to all components
- [ ] OWASP Top 10 audit completed
- [ ] All invariants checked for compliance
- [ ] Findings documented with severity and recommendations
- [ ] Overall security posture assessed
- **Approved by:** Pending
- **Date:** Pending

