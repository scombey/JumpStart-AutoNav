---
id: challenger-log
phase: "0"
agent: challenger
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

# Challenger Log: {{Project Name}}

> **Five Whys Hypothesis Tracking and Uncertainty Capture**

## Metadata

| Field | Value |
|---|---|
| Project | {{Project Name}} |
| Challenger | AI Challenger Agent |
| Date | {{Date}} |
| Input | {{User's initial problem statement}} |

---

## Five Whys Analysis

### Branch 1: {{Primary Problem Thread}}

| Level | Question | Answer | Confidence | Source |
|---|---|---|---|---|
| Why 1 | {{Why is this a problem?}} | {{Answer}} | High / Medium / Low | {{How we know this}} |
| Why 2 | {{Why does that happen?}} | {{Answer}} | High / Medium / Low | {{Source}} |
| Why 3 | {{Why does that occur?}} | {{Answer}} | High / Medium / Low | {{Source}} |
| Why 4 | {{Why does that exist?}} | {{Answer}} | High / Medium / Low | {{Source}} |
| Why 5 | {{Root cause hypothesis}} | {{Answer}} | High / Medium / Low | {{Source}} |

**Root Cause Hypothesis**: {{Statement of the root cause identified by this branch}}

### Branch 2: {{Alternative Problem Thread}}

| Level | Question | Answer | Confidence | Source |
|---|---|---|---|---|
| Why 1 | {{Alternative starting point}} | {{Answer}} | High / Medium / Low | {{Source}} |
| Why 2 | | | | |
| Why 3 | | | | |
| Why 4 | | | | |
| Why 5 | | | | |

**Root Cause Hypothesis**: {{Alternative root cause}}

> Add more branches as needed. The Challenger explores at least 2 branches per problem to avoid premature convergence on a single root cause.

---

## Hypothesis Registry

| ID | Hypothesis | Branch | Confidence | Status | Validation Method |
|---|---|---|---|---|---|
| H-001 | {{Root cause statement}} | Branch 1 | High / Medium / Low | Active / Rejected / Validated | {{How to confirm or deny}} |
| H-002 | {{Alternative root cause}} | Branch 2 | High / Medium / Low | Active / Rejected / Validated | {{How to confirm or deny}} |

---

## Uncertainty Capture

### Known Unknowns

Items the Challenger identified as uncertain but important:

| ID | Uncertainty | Impact if Wrong | Recommended Action |
|---|---|---|---|
| U-001 | {{What we don't know}} | {{What happens if our assumption is wrong}} | {{How to reduce uncertainty}} |
| U-002 | | | |

### Assumptions Made

Assumptions the Challenger accepted to proceed:

| ID | Assumption | Basis | Risk if Invalid |
|---|---|---|---|
| A-001 | {{Statement assumed to be true}} | {{Why we believe this}} | {{Consequence if wrong}} |
| A-002 | | | |

---

## Reframing Log

| Original Framing | Challenger Reframing | Rationale |
|---|---|---|
| {{How the user originally described the problem}} | {{How the Challenger reframed it}} | {{Why the reframing is more productive}} |

---

## Discarded Directions

Paths the Challenger explored but chose not to pursue:

| Direction | Why Explored | Why Discarded |
|---|---|---|
| {{Direction}} | {{What made it seem promising}} | {{What made it a dead end}} |

---

## Phase Gate Approval

- [ ] Five Whys analysis completed with ≥ 2 branches
- [ ] All hypotheses registered with confidence levels
- [ ] Uncertainties captured and flagged
- [ ] Assumptions explicitly documented
- [ ] Reframing rationale provided
- **Approved by:** Pending
- **Date:** Pending

