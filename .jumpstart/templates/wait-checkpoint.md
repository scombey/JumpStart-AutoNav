---
id: wait-checkpoint
phase: all
agent: all
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

# Human-in-the-Loop Checkpoint

> **Execution paused — human decision required before proceeding**

## Checkpoint Metadata

| Field | Value |
|---|---|
| Phase | {{Current phase}} |
| Agent | {{Current agent}} |
| Step | {{Current protocol step}} |
| Trigger | {{Why execution paused}} |
| Date | {{Date}} |
| Urgency | High / Medium / Low |

---

## Context

### Current State

{{Brief description of what the agent has done so far and where it is in the protocol}}

### Decision Required

{{Clear description of the decision the human needs to make}}

### Why This Checkpoint Exists

{{Why this decision is too consequential for the agent to make autonomously — e.g., irreversible action, security sensitivity, cost implications, architectural impact}}

---

## Options

| Option | Description | Implications | Risk |
|---|---|---|---|
| A | {{Option A}} | {{What happens if chosen}} | Low / Medium / High |
| B | {{Option B}} | {{What happens if chosen}} | Low / Medium / High |
| C | Skip / Defer | {{What happens if deferred}} | {{Risk}} |

---

## Agent Recommendation

**Recommended:** Option {{X}}

**Rationale:** {{Why the agent recommends this option, with evidence}}

**Caveats:** {{What the agent is uncertain about}}

---

## Resolution

**Decision:** {{To be filled by human}}
**Decided by:** {{Human name}}
**Date:** {{Date}}
**Rationale:** {{Human's reasoning — optional but recommended}}

---

## Post-Decision Actions

After the human decides:
1. Agent resumes execution at {{step}}
2. Decision is logged in `specs/qa-log.md` (if `workflow.qa_log` is `true`)
3. Relevant artifacts are updated to reflect the decision
