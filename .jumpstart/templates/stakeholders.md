---
id: stakeholders
phase: 1
agent: analyst
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - specs/challenger-brief.md
dependencies:
  - challenger-brief
risk_level: low
owners: []
sha256: ""
---

# Stakeholder Map

> **Persistent stakeholder registry informing elicitation depth and acceptance criteria**

## Purpose

This document maintains a living registry of all project stakeholders, their concerns, influence levels, and communication preferences. The stakeholder map informs elicitation depth (who to involve in which decisions) and shapes acceptance criteria (whose needs must be met).

---

## 1. Stakeholder Registry

| ID | Name/Role | Category | Influence | Interest | Engagement Level |
|---|---|---|---|---|---|
| SH-001 | {{Name or role title}} | User / Sponsor / Technical / Regulatory / Business | High / Medium / Low | High / Medium / Low | Manage Closely / Keep Satisfied / Keep Informed / Monitor |
| SH-002 | {{Name}} | {{Category}} | {{Influence}} | {{Interest}} | {{Engagement}} |

### Influence-Interest Matrix

```
                    High Interest
                         │
    Keep Satisfied        │     Manage Closely
    (SH-xxx)             │     (SH-xxx)
                         │
  Low Influence ─────────┼───────── High Influence
                         │
    Monitor              │     Keep Informed
    (SH-xxx)             │     (SH-xxx)
                         │
                    Low Interest
```

---

## 2. Stakeholder Concerns

| Stakeholder ID | Primary Concern | Success Criteria | Risk if Ignored |
|---|---|---|---|
| SH-001 | {{What they care about most}} | {{How they measure success}} | {{What happens if not addressed}} |
| SH-002 | {{Concern}} | {{Criteria}} | {{Risk}} |

---

## 3. Concern-to-Requirement Mapping

| Concern | NFR/Story | Priority | Status |
|---|---|---|---|
| {{Stakeholder concern}} | {{NFR-P01 or E1-S1}} | Must / Should / Could | Addressed / Partial / Open |

---

## 4. Communication Plan

| Stakeholder | Channel | Frequency | Content | Owner |
|---|---|---|---|---|
| SH-001 | {{Email / Meeting / Report / Demo}} | {{Weekly / Milestone / On demand}} | {{What they receive}} | {{Who communicates}} |

---

## 5. Decision Authority

| Decision Type | Authority | Consulted | Informed |
|---|---|---|---|
| Scope changes | {{SH-xxx}} | {{SH-xxx}} | {{SH-xxx}} |
| Technical choices | {{SH-xxx}} | {{SH-xxx}} | {{SH-xxx}} |
| UX decisions | {{SH-xxx}} | {{SH-xxx}} | {{SH-xxx}} |
| Budget/timeline | {{SH-xxx}} | {{SH-xxx}} | {{SH-xxx}} |

---

## 6. Change Log

| Date | Change | Reason |
|---|---|---|
| {{Date}} | {{What changed in the stakeholder map}} | {{Why}} |

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:stakeholders",
  "js:phase": 1,
  "js:agent": "Analyst",
  "js:status": "[STATUS]",
  "js:version": "[VERSION]",
  "js:upstream": [
    { "@id": "js:challenger-brief" }
  ],
  "js:downstream": [
    { "@id": "js:product-brief" },
    { "@id": "js:prd" }
  ],
  "js:traces": []
}
```
