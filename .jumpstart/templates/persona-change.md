---
id: persona-change
phase: 1
agent: analyst
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - specs/product-brief.md
dependencies:
  - product-brief
risk_level: low
owners: []
sha256: ""
---

# Persona Change Proposal

> **Feedback-Driven Persona Evolution**

## Metadata

| Field | Value |
|---|---|
| Date | {{Date}} |
| Agent | Analyst |
| Source | {{What triggered this persona update — user feedback, testing, analytics, new requirement}} |
| Affected Persona(s) | {{Persona name(s)}} |

---

## 1. Change Summary

| Persona | Attribute | Current Value | Proposed Value | Rationale |
|---|---|---|---|---|
| {{Persona name}} | {{e.g., Primary Goal}} | {{Current definition}} | {{Proposed update}} | {{Why this change is needed}} |
| {{Persona name}} | {{e.g., Pain Point}} | {{Current}} | {{Proposed}} | {{Rationale}} |

---

## 2. New Persona Proposal (if applicable)

> Fill this section only if the change involves adding an entirely new persona.

### Persona: {{Name}}, {{Role}}

| Attribute | Value |
|---|---|
| **Age / Experience** | {{Demographics relevant to product usage}} |
| **Primary Goal** | {{What they want to achieve}} |
| **Pain Points** | {{What frustrates them}} |
| **Technical Skill Level** | Novice / Intermediate / Advanced |
| **Usage Frequency** | Daily / Weekly / Monthly / Occasional |

**Justification for New Persona:**
{{Why existing personas do not cover this user segment. What evidence exists for this persona?}}

---

## 3. Impact Analysis

### Affected Artifacts

| Artifact | Section | Required Update |
|---|---|---|
| specs/product-brief.md | User Personas | {{Update persona definition}} |
| specs/product-brief.md | User Journeys | {{Update journey maps}} |
| specs/prd.md | User Stories | {{Review AC for affected stories}} |
| specs/ux-design.md | Emotion Maps | {{Update emotional journey}} |

### Affected User Stories

| Story ID | Impact | Required Change |
|---|---|---|
| {{E1-S1}} | {{How the persona change affects this story}} | {{What needs to be updated}} |

---

## 4. Evidence

| Evidence Type | Description | Source |
|---|---|---|
| User Feedback | {{What users reported}} | {{Survey / Interview / Support ticket}} |
| Analytics | {{What data shows}} | {{Analytics platform}} |
| Testing | {{What testing revealed}} | {{Usability test / A-B test}} |
| Market Research | {{What the market shows}} | {{Competitive analysis}} |

---

## 5. Approval

- [ ] Change is supported by evidence
- [ ] Impact on downstream artifacts is assessed
- [ ] Human has reviewed and approved this change

**Approved by:** [Human's name or "Pending"]
**Approval date:** [Date or "Pending"]
