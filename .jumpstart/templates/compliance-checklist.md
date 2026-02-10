---
id: compliance-checklist
phase: 1
agent: Analyst
status: Draft
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs:
  - specs/product-brief.md
dependencies:
  - product-brief
risk_level: critical
owners: []
sha256: null
---

# Regulatory Compliance Checklist

> **Phase:** 1 — Analysis (triggered by risk classification)
> **Agent:** The Analyst
> **Status:** Draft
> **Created:** [DATE]
> **Risk Classification:** [medical / financial / government / education / general]

---

## Project Classification

| Field | Value |
|-------|-------|
| **Domain** | [e.g., healthcare, fintech, edtech] |
| **Risk Level** | [critical / high / medium / low] |
| **Applicable Regulations** | [HIPAA, GDPR, SOC 2, PCI-DSS, FERPA, FDA 21 CFR Part 11, etc.] |
| **Data Sensitivity** | [PII, PHI, PCI, public, internal, confidential] |
| **Geographic Scope** | [US, EU, global, etc.] |

---

## Regulatory Requirements

### Data Protection & Privacy

- [ ] Data classification completed (PII, PHI, PCI identified)
- [ ] Data retention policy defined
- [ ] Right to deletion / data portability supported
- [ ] Privacy policy required and drafted
- [ ] Cookie / tracking consent mechanism required
- [ ] Data Processing Agreement (DPA) required for third parties
- [ ] Cross-border data transfer restrictions identified

### Authentication & Access Control

- [ ] Multi-factor authentication required
- [ ] Role-based access control (RBAC) defined
- [ ] Session management policy specified
- [ ] Password complexity requirements documented
- [ ] Audit logging for access events required

### Encryption & Security

- [ ] Data encrypted at rest (algorithm: [AES-256 / etc.])
- [ ] Data encrypted in transit (TLS 1.2+ minimum)
- [ ] Key management strategy defined
- [ ] Vulnerability scanning cadence specified
- [ ] Penetration testing schedule defined

### Audit & Reporting

- [ ] Audit trail requirements documented
- [ ] Log retention period specified
- [ ] Incident response plan required
- [ ] Breach notification timeline defined (e.g., 72 hours for GDPR)
- [ ] Regulatory reporting requirements identified

### Domain-Specific (if applicable)

#### Healthcare (HIPAA)
- [ ] Business Associate Agreement (BAA) required
- [ ] Minimum Necessary Standard applied
- [ ] PHI de-identification method selected (Safe Harbor / Expert Determination)

#### Financial (PCI-DSS / SOX)
- [ ] PCI scope defined (SAQ level)
- [ ] Cardholder data environment (CDE) boundaries set
- [ ] Financial controls and segregation of duties documented

#### Government (FedRAMP / FISMA)
- [ ] FIPS 140-2 validated cryptography required
- [ ] Authority to Operate (ATO) process identified
- [ ] Impact level classified (Low / Moderate / High)

---

## Impact on Architecture

| Compliance Requirement | Architecture Impact | NFR Reference |
|----------------------|--------------------|--------------| 
| [e.g., HIPAA audit logging] | [Must add audit service component] | [NFR-SEC-01] |
| [e.g., GDPR data deletion] | [Soft-delete → hard-delete pipeline] | [NFR-PRIV-01] |

---

## Validation

Run the regulatory gate check:

```bash
echo '{"project_domain":"[domain]","risk_level":"[level]"}' | node bin/lib/regulatory-gate.js
```

---

## Phase Gate Approval

- [ ] Risk classification is accurate
- [ ] All applicable regulations identified
- [ ] Architecture impact documented
- [ ] Domain-specific checklist items reviewed
- [ ] Compliance requirements traced to NFRs

**Approved by:** Pending
**Approval date:** Pending
