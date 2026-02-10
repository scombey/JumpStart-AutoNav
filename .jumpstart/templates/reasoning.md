---
id: reasoning
phase: 0
agent: challenger
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

# Reasoning Trace: {{Session Title}}

> **Non-Normative — Raw Discovery Reasoning**
>
> This document preserves the raw reasoning process from a discovery session before it gets compressed into formal artifacts. It is explicitly labelled as **non-normative** — it captures the thought process, not the final decisions.

## Session Metadata

| Field | Value |
|---|---|
| Session | {{Session title or ID}} |
| Phase | {{Current phase}} |
| Agent | {{Agent conducting reasoning}} |
| Date | {{Date}} |
| Input | {{What triggered this reasoning session}} |
| Duration | {{Approximate duration}} |

---

## 1. Initial Understanding

### Raw Input

> {{The exact problem statement, question, or trigger as received}}

### First Impressions

{{Agent's initial interpretation — what patterns are recognised, what assumptions are forming, what feels unclear}}

---

## 2. Reasoning Stream

> Record the reasoning process chronologically. Each entry captures a thought, question, hypothesis, or realisation as it occurs.

### {{Timestamp}} — {{Brief Label}}

**Thought:** {{What the agent is thinking or considering}}

**Trigger:** {{What prompted this thought — prior entry, user input, evidence}}

**Branching?** Yes / No
{{If yes, describe the branch: what fork in reasoning was encountered and which path was taken}}

**Confidence:** High / Medium / Low
{{How confident the agent is in this line of reasoning}}

---

### {{Timestamp}} — {{Brief Label}}

**Thought:** {{Next thought in the chain}}

**Trigger:** {{What prompted it}}

**Branching?** No

**Confidence:** Medium

---

## 3. Hypotheses Generated

| Hypothesis ID | Statement | Evidence For | Evidence Against | Status |
|---|---|---|---|---|
| H-001 | {{Hypothesis statement}} | {{Supporting evidence}} | {{Contradicting evidence}} | Active / Rejected / Confirmed |
| H-002 | {{Hypothesis}} | {{For}} | {{Against}} | {{Status}} |

---

## 4. Dead Ends

{{Document reasoning paths that were explored but abandoned. These are valuable for preventing repeated exploration.}}

### Dead End 1: {{Description}}

**Path explored:** {{What was considered}}
**Why abandoned:** {{Why this direction was dropped}}
**Time spent:** {{Approximate}}

---

## 5. Key Transitions

{{Document moments where understanding shifted significantly}}

### Transition 1: {{From → To}}

**Before:** {{What was believed or assumed}}
**After:** {{What is now understood}}
**Trigger:** {{What caused the shift — evidence, question, insight}}

---

## 6. Reasoning Artefacts

{{Any diagrams, tables, or structured outputs generated during reasoning}}

---

## 7. Carry-Forward

### Confirmed Insights (→ Formal Artifacts)

| Insight | Destination Artifact | Section |
|---|---|---|
| {{What was confirmed}} | {{Which artifact gets this}} | {{Which section}} |

### Open Threads (→ Future Investigation)

| Thread | Priority | Suggested Next Step |
|---|---|---|
| {{Unresolved question or partial insight}} | High / Medium / Low | {{What to do next}} |

### Assumptions Made (→ Risk Register)

| Assumption | Basis | Risk if Wrong |
|---|---|---|
| {{What was assumed}} | Evidence / Experience / Belief | {{Consequence}} |

---

## Non-Normative Notice

> **This document is a reasoning trace, not a specification.** It captures how conclusions were reached, not what the conclusions are. For authoritative content, see the formal artifact produced from this session (referenced in Carry-Forward above).
>
> Reasoning traces are intended for:
> - Understanding *why* decisions were made
> - Preventing repeated exploration of dead ends
> - Training and process improvement
> - Debugging when formal artifacts seem inconsistent
