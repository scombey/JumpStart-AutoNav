---
id: correction-entry
phase: all
agent: all
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "N/A"
approval_date: ""
upstream_refs: []
dependencies: []
risk_level: low
owners: []
sha256: ""
---

# Correction Entry Template

> **Format for recording rejected agent proposals and lessons learned**

## Purpose

When a human rejects an agent's proposal, the agent must record the rejection in the correction log (`.jumpstart/correction-log.md`). This prevents the same mistake from being repeated and builds an institutional memory of constraints and preferences.

---

## Entry Format

```markdown
### COR-{{NNN}}: {{Brief Title}}

**Date:** {{ISO 8601 UTC}}
**Agent:** {{Agent name}}
**Phase:** {{Phase number or "advisory"}}
**Artifact:** {{Which artifact contained the rejected proposal}}
**Section:** {{Which section of the artifact}}

**Rejected Proposal:**
> {{What the agent proposed — be specific}}

**Rejection Reason:**
> {{Why the human rejected it — quote the human's feedback if available}}

**New Constraint Learned:**
> {{The rule or constraint that this rejection establishes — phrased as a positive directive}}

**Corrective Action:**
> {{What was done to fix the proposal}}

**Applies To:** {{Which agents or phases should be aware of this constraint}}
**Severity:** Minor | Moderate | Major
**Recurring:** First occurrence | Repeated (see COR-{{ref}})
```

---

## Example

```markdown
### COR-001: Excessive Microservice Decomposition

**Date:** 2026-02-08T15:30:00Z
**Agent:** Architect
**Phase:** 3
**Artifact:** specs/architecture.md
**Section:** System Components

**Rejected Proposal:**
> Proposed 7 separate microservices for the MVP: auth-service, user-service, project-service, task-service, notification-service, analytics-service, and gateway-service.

**Rejection Reason:**
> "This is way too many services for an MVP. The Simplicity Gate should have caught this. Start with a monolith and extract services only when there's a proven need."

**New Constraint Learned:**
> MVP architectures must start as a monolith unless there is a documented, quantified reason for service decomposition. The burden of proof is on decomposition, not on monolith.

**Corrective Action:**
> Redesigned as a modular monolith with clear module boundaries that can be extracted into services later. Created ADR-004 documenting this decision.

**Applies To:** Architect agent, Simplicity Gate
**Severity:** Major
**Recurring:** First occurrence
```

---

## Validation Rules

1. Every entry MUST have a unique, sequential COR-NNN identifier
2. Every entry MUST specify which agent generated the rejected proposal
3. Every entry MUST include a "New Constraint Learned" to prevent recurrence
4. Agents MUST check the correction log before generating proposals in the affected area
5. Entries are append-only — never delete or modify previous entries
