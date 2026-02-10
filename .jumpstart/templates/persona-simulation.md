---
id: persona-simulation
phase: "1"
agent: analyst
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - product-brief
dependencies: []
risk_level: low
owners: []
sha256: ""
---

# Persona Simulation: {{Project Name}}

> **Persona-Driven Scenario Walkthroughs and Gap Analysis**

## Metadata

| Field | Value |
|---|---|
| Project | {{Project Name}} |
| Analyst | AI Analyst Agent |
| Date | {{Date}} |
| Product Brief | `specs/product-brief.md` |

---

## 1. Simulation Overview

For each persona defined in the Product Brief, simulate their experience through key scenarios to identify gaps, friction points, and unmet needs that static analysis may miss.

---

## 2. Persona Simulations

### Persona: {{Persona Name}}

> **Background**: {{Brief persona description}}
> **Goal**: {{What they are trying to accomplish}}
> **Context**: {{When and where they interact with the product}}
> **Tech Comfort**: {{Low / Medium / High}}

#### Scenario 1: {{Scenario Name — e.g., "First-Time Setup"}}

**Simulation Walkthrough:**

| Step | Persona Thinks | Persona Does | System Response | Gap? |
|---|---|---|---|---|
| 1 | "{{Internal monologue}}" | {{Action taken}} | {{What happens}} | {{Yes/No — describe gap}} |
| 2 | "{{Internal monologue}}" | {{Action taken}} | {{What happens}} | |
| 3 | "{{Internal monologue}}" | {{Action taken}} | {{What happens}} | |
| 4 | "{{Internal monologue}}" | {{Action taken}} | {{What happens}} | |

**Friction Points Identified:**
1. {{Where the persona struggled or hesitated}}
2. {{Where the persona might abandon the flow}}

**Unmet Needs:**
1. {{What the persona wanted but the product doesn't provide}}

**Emotional State at Exit**: {{How the persona feels after this scenario — satisfied, frustrated, confused, delighted}}

#### Scenario 2: {{Scenario Name — e.g., "Daily Use After 30 Days"}}

| Step | Persona Thinks | Persona Does | System Response | Gap? |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |

**Friction Points Identified:**
1. {{Friction}}

**Unmet Needs:**
1. {{Need}}

**Emotional State at Exit**: {{State}}

> Repeat for each key scenario per persona.

---

## 3. Cross-Persona Analysis

### Common Gaps

Gaps that appear across multiple personas:

| Gap | Personas Affected | Severity | Category |
|---|---|---|---|
| {{Gap description}} | {{Persona A, Persona B}} | High / Medium / Low | UX / Feature / Performance / Accessibility |

### Conflicting Needs

Where different personas need different things:

| Need | Persona A Wants | Persona B Wants | Resolution Strategy |
|---|---|---|---|
| {{Topic}} | {{Preference}} | {{Conflicting preference}} | {{How to handle — e.g., setting, progressive disclosure}} |

---

## 4. Gap Summary

| ID | Gap | Persona | Scenario | Severity | Recommendation |
|---|---|---|---|---|---|
| G-001 | {{Gap description}} | {{Persona}} | {{Scenario}} | High / Medium / Low | {{What to add/change}} |
| G-002 | | | | | |

---

## 5. Impact on Product Brief

Based on simulation findings, recommend updates to the Product Brief:

| Section | Current State | Recommended Change | Justification |
|---|---|---|---|
| {{User Journeys}} | {{What's there now}} | {{What should change}} | {{Based on simulation finding G-XXX}} |
| {{MVP Scope}} | {{What's there now}} | {{Add / Remove / Modify}} | {{Justification}} |

---

## Phase Gate Approval

- [ ] All personas from Product Brief simulated
- [ ] At least 2 scenarios per persona walked through
- [ ] Friction points and unmet needs documented
- [ ] Cross-persona analysis completed
- [ ] Gaps summarised with severity and recommendations
- [ ] Product Brief impact assessment provided
- **Approved by:** Pending
- **Date:** Pending

