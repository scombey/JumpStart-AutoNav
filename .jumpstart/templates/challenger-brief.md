---
id: challenger-brief
phase: 0
agent: Challenger
status: Draft
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs: []
dependencies: []
risk_level: low
owners: []
sha256: null
---

# Challenger Brief

> **Phase:** 0 -- Problem / Challenge Discovery
> **Agent:** The Challenger
> **Status:** Draft
> **Created:** [DATE]
> **Approval date:** [DATE or "Pending"]
> **Approved by:** [Human's name or "Pending"]

---

## Original Statement

> [Capture the human's raw idea, problem, or opportunity statement verbatim. Do not edit, interpret, or improve it. This is the unfiltered starting point.]

**Follow-up context (if provided):**

> [Any additional context gathered from the initial clarifying questions.]

---

## Assumptions Identified

| # | Assumption | Category | Status | Evidence / Notes |
|---|-----------|----------|--------|-----------------|
| 1 | [Implicit assumption surfaced from the original statement] | Problem / User / Solution / Market / Feasibility / Value | Validated / Believed / Untested | [Supporting evidence or reason for status] |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

**Summary:** [X] validated, [X] believed, [X] untested.

---

## Root Cause Analysis (Five Whys)

**Starting point:** [The core problem extracted from the original statement]

> **Method:** Ask "Why?" until the root cause is revealed. This may take fewer or more than 5 iterations. Ensure the logic holds by checking backwards: "Root Cause > therefore > ... > Problem."

**Analysis Chain:**

1. **Why?** [Answer 1]
2. **Why?** [Answer 2]
3. **Why?** [Answer 3]
4. **Why?** [Answer 4]
5. **Why?** [Answer 5 - add or remove steps as needed to reach root cause]

**Logic Check (Working Backwards):**
> [Root Cause] **therefore** [Answer N-1] ... **therefore** [Original Problem].
> *Does this chain of causality make logical sense without logical leaps?*

**Root Cause Identified:**
> [Summary of the deepest cause reached]

**Alternative branches (if any):**
- [Branch point] -> [Alternative root cause]

---

## Stakeholder Map

| Stakeholder | Relationship to Problem | Impact Level | Current Workaround |
|-------------|------------------------|--------------|-------------------|
| [Name / Role / Group] | [Experiences it / Causes it / Affected by consequences / Would adopt solution] | High / Medium / Low | [How they cope today] |
| | | | |
| | | | |

**Missing stakeholders check:** [Confirmed by human that no one is missing, or notes on additions]

**Adversely affected parties:** [Anyone who might resist or be negatively impacted by a solution]

---

## Reframed Problem Statement

**Reframe options presented:**

1. [First reframe proposal]
2. [Second reframe proposal]
3. [Third reframe proposal, if applicable]

**Selected problem statement:**

> [The final, human-approved problem statement. This is the canonical definition that all subsequent phases will reference. It should be specific, name the affected stakeholder, describe the impact, and not prescribe a solution.]

---

## Validation Criteria

How will we know the problem has been solved?

| # | Criterion | Type | Measurable? |
|---|-----------|------|------------|
| 1 | [Outcome-based success criterion, solution-agnostic] | Behavioral / Metric / Qualitative | Yes / Needs refinement |
| 2 | | | |
| 3 | | | |

---

## Constraints and Boundaries

### Explicitly Out of Scope
- [What this effort will NOT address]
- [Boundaries the human has drawn]

### Non-Negotiable Constraints
- [Timeline constraints]
- [Budget constraints]
- [Technology mandates]
- [Regulatory requirements]
- [Team size / skill constraints]

### Known Unknowns
- [Things we know we do not know yet, to be resolved in later phases]

---

## Insights Reference

**Companion Document:** [specs/insights/challenger-brief-insights.md](insights/challenger-brief-insights.md)

This artifact was informed by ongoing insights captured during Problem Discovery. Key insights that shaped this document:

1. **[Brief insight title]** - [One sentence summary]
2. **[Brief insight title]** - [One sentence summary]
3. **[Brief insight title]** - [One sentence summary]

See the insights document for complete decision rationale, alternatives considered, and questions explored.

---

## Phase Gate Approval

- [ ] Human has reviewed this brief
- [ ] Problem statement is specific and testable
- [ ] At least one validation criterion is defined
- [ ] Constraints and boundaries section is populated
- [ ] Human has explicitly approved this brief for Phase 1 handoff

**Approved by:** [Human's name or "Pending"]
**Approval date:** [Date or "Pending"]
**Status:** Draft

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:challenger-brief",
  "js:phase": 0,
  "js:agent": "Challenger",
  "js:status": "[STATUS]",
  "js:version": "[VERSION]",
  "js:upstream": [],
  "js:downstream": [
    { "@id": "js:product-brief" }
  ],
  "js:traces": []
}
```
