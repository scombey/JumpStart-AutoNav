---
id: phase-gate
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
risk_level: low
owners: []
sha256: ""
---

# Phase Gate Approval Record

> **Standardised Approval Block for All Phase Artifacts**

## Purpose

This template defines the standard Phase Gate Approval section that must appear at the bottom of every phase artifact. It provides a consistent mechanism for human sign-off before phase transitions.

---

## Standard Phase Gate Block

Copy this block to the bottom of any phase artifact:

```markdown
## Phase Gate Approval

- [ ] Human has reviewed this artifact
- [ ] All required sections are populated (no bracket placeholders remain)
- [ ] Content traces to upstream artifacts
- [ ] Insights document has been maintained alongside this artifact
- [ ] Human has explicitly approved this artifact for next phase handoff

**Approved by:** [Human's name or "Pending"]
**Approval date:** [Date or "Pending"]
**Status:** Draft
```

---

## Approval Rules

1. **No self-approval.** No agent may fill in the "Approved by" field. Only the human operator can approve.
2. **All checkboxes required.** Every checkbox must be checked `[x]` before the artifact is considered approved.
3. **Name and date required.** "Pending" in either field means the artifact is NOT approved.
4. **Status transitions:** Draft → Under Review → Approved → Superseded
5. **Immutable once approved.** Once approved, the artifact should not be modified without creating a new version.

---

## Phase-Specific Checklist Extensions

Each phase may add additional checkboxes specific to its artifact. The standard block above is the minimum. Examples:

### Phase 0 (Challenger Brief)
```markdown
- [ ] Reframed problem statement is present
- [ ] At least one validation criterion defined
- [ ] Constraints and boundaries section populated
```

### Phase 1 (Product Brief)
```markdown
- [ ] At least one user persona defined
- [ ] User journeys mapped (if configured)
- [ ] MVP scope populated
- [ ] Must Have capabilities trace to Phase 0 criteria
```

### Phase 2 (PRD)
```markdown
- [ ] All user stories have acceptance criteria
- [ ] Non-functional requirements are quantified
- [ ] Risk register is populated
- [ ] Task breakdown is complete
```

### Phase 3 (Architecture + Implementation Plan)
```markdown
- [ ] Technology stack decisions have ADRs
- [ ] API contracts are defined
- [ ] Data model is specified
- [ ] Security architecture gate passed
- [ ] Implementation plan has tasks for 100% of stories
```

### Phase 4 (Implementation)
```markdown
- [ ] All tasks are complete
- [ ] All tests pass
- [ ] README is updated
- [ ] No critical TODOs remain
```

---

## Signature Validation

The CLI validates phase gate signatures by checking:

1. The `## Phase Gate Approval` section exists
2. All checkboxes `- [ ]` are checked `- [x]`
3. "Approved by" is not "Pending" or empty
4. "Approval date" is not "Pending" or empty
5. "Status" is "Approved" (not "Draft" or "Under Review")

A validation failure blocks phase advancement when `workflow.require_gate_approval` is `true`.
