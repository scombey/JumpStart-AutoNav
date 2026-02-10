# [PROJECT_NAME] Roadmap

> This document defines the non-negotiable principles that govern all AI agent behavior in this project. Roadmap principles supersede agent-specific protocols — no agent may violate a Core Principle, regardless of phase or task context.

---

## Core Principles

### I. [PRINCIPLE_1_NAME]
<!-- Example: Sequential Phase Integrity -->
[PRINCIPLE_1_DESCRIPTION]
<!-- Example: Phases are strictly sequential. No phase may begin until the previous
phase's artifact is explicitly approved by the human operator. Agents must never
skip, combine, or reorder phases. -->

### II. [PRINCIPLE_2_NAME]
<!-- Example: Template Compliance -->
[PRINCIPLE_2_DESCRIPTION]
<!-- Example: All output artifacts must be generated using the markdown templates
in `.jumpstart/templates/`. Agents must not invent new document formats or omit
required template sections. -->

### III. [PRINCIPLE_3_NAME]
<!-- Example: Test-First Development (when enabled) -->
[PRINCIPLE_3_DESCRIPTION]
<!-- Example: When `roadmap.test_drive_mandate` is `true` in config, the Developer
agent must write failing tests first, present them for human approval, and only then
write implementation code. No source code may be written for a task until its tests
exist and the human has confirmed them. -->

### IV. [PRINCIPLE_4_NAME]
<!-- Example: Upstream Traceability -->
[PRINCIPLE_4_DESCRIPTION]
<!-- Example: Every requirement, story, and task must trace back to an upstream artifact.
PRD stories reference Product Brief capabilities. Product Brief capabilities reference
Challenger Brief validation criteria. No orphan requirements are permitted. -->

### V. [PRINCIPLE_5_NAME]
<!-- Example: Human Gate Authority -->
[PRINCIPLE_5_DESCRIPTION]
<!-- Example: No agent may mark a phase as complete or approve its own output. All phase
transitions require explicit human approval. The human operator is the sole authority
on artifact acceptance. -->

---

## [SECTION_2_NAME]
<!-- Example: Additional Constraints, Security Requirements, Compliance Standards, etc. -->

[SECTION_2_CONTENT]
<!-- Example: Technology stack restrictions, data privacy requirements, deployment
policies, regulatory compliance standards, etc. -->

---

## [SECTION_3_NAME]
<!-- Example: Development Workflow, Quality Gates, Review Process, etc. -->

[SECTION_3_CONTENT]
<!-- Example: Code review requirements, testing gates, deployment approval process,
documentation standards, etc. -->

---

## Governance

<!-- The Roadmap supersedes all other agent protocols and practices.
Amendments to a Core Principle require:
1. A written proposal with rationale
2. Explicit human approval
3. A migration plan for any affected artifacts or processes
Roadmap violations must always be reported to the human, never silently ignored. -->

[GOVERNANCE_RULES]

---

**Version**: [ROADMAP_VERSION] | **Ratified**: [RATIFICATION_DATE] | **Last Amended**: [LAST_AMENDED_DATE]
<!-- Example: Version: 1.0.0 | Ratified: 2026-02-08 | Last Amended: 2026-02-08 -->
