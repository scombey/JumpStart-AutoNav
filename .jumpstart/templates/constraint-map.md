---
id: constraint-map
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
dependencies:
  - prd
  - architecture
risk_level: medium
owners: []
sha256: ""
---

# Constraint Map

> **NFR → Architecture → Task Traceability**

## Purpose

This document maps every Non-Functional Requirement (NFR) to the architecture components that address it and the implementation tasks that deliver it. Every NFR must have at least one architecture component and one task — gaps indicate incomplete planning.

---

## 1. Performance Constraints

| NFR ID | Requirement | Architecture Component | Implementation Tasks | Verification Method |
|---|---|---|---|---|
| {{NFR-P01}} | {{Response time < 200ms p95}} | {{API Gateway, Cache Layer}} | {{T005, T012}} | {{Load test with k6}} |
| {{NFR-P02}} | {{Throughput > 1000 req/s}} | {{Load Balancer, DB Connection Pool}} | {{T006, T013}} | {{Stress test}} |

---

## 2. Security Constraints

| NFR ID | Requirement | Architecture Component | Implementation Tasks | Verification Method |
|---|---|---|---|---|
| {{NFR-S01}} | {{Encryption at rest}} | {{Database, File Storage}} | {{T007}} | {{Security audit}} |
| {{NFR-S02}} | {{OWASP Top 10 compliance}} | {{API Layer, Auth Module}} | {{T008, T014}} | {{Penetration test}} |

---

## 3. Availability Constraints

| NFR ID | Requirement | Architecture Component | Implementation Tasks | Verification Method |
|---|---|---|---|---|
| {{NFR-A01}} | {{99.9% uptime}} | {{Health Checks, Auto-restart}} | {{T015}} | {{Monitoring}} |

---

## 4. Scalability Constraints

| NFR ID | Requirement | Architecture Component | Implementation Tasks | Verification Method |
|---|---|---|---|---|
| {{NFR-SC01}} | {{Horizontal scaling}} | {{Stateless API, Session Store}} | {{T016}} | {{Scale test}} |

---

## 5. Observability Constraints

| NFR ID | Requirement | Architecture Component | Implementation Tasks | Verification Method |
|---|---|---|---|---|
| {{NFR-O01}} | {{Structured logging}} | {{Logging Module}} | {{T009}} | {{Log review}} |

---

## 6. Coverage Summary

| Category | Total NFRs | Mapped to Architecture | Mapped to Tasks | Fully Verified | Gaps |
|---|---|---|---|---|---|
| Performance | {{N}} | {{N}} | {{N}} | {{N}} | {{N}} |
| Security | {{N}} | {{N}} | {{N}} | {{N}} | {{N}} |
| Availability | {{N}} | {{N}} | {{N}} | {{N}} | {{N}} |
| Scalability | {{N}} | {{N}} | {{N}} | {{N}} | {{N}} |
| Observability | {{N}} | {{N}} | {{N}} | {{N}} | {{N}} |
| **Total** | **{{N}}** | **{{N}}** | **{{N}}** | **{{N}}** | **{{N}}** |

---

## 7. Gap Analysis

| NFR ID | Gap Type | Description | Recommended Action |
|---|---|---|---|
| {{NFR-XX}} | Missing Component / Missing Task / No Verification | {{What's missing}} | {{What to do}} |

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:constraint-map",
  "js:phase": 3,
  "js:agent": "Architect",
  "js:status": "[STATUS]",
  "js:version": "[VERSION]",
  "js:upstream": [
    { "@id": "js:prd" },
    { "@id": "js:architecture" }
  ],
  "js:downstream": [
    { "@id": "js:implementation-plan" }
  ],
  "js:traces": []
}
```
