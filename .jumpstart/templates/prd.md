---
id: prd
phase: 2
agent: PM
status: Draft
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs:
  - specs/challenger-brief.md
  - specs/product-brief.md
dependencies:
  - challenger-brief
  - product-brief
risk_level: medium
owners: []
sha256: null
---

# Product Requirements Document (PRD)

> **Phase:** 2 -- Planning
> **Agent:** The Product Manager
> **Status:** Draft
> **Created:** [DATE]
> **Approval date:** [DATE or "Pending"]
> **Approved by:** [Human's name or "Pending"]
> **Upstream References:**
> - [specs/challenger-brief.md](challenger-brief.md)
> - [specs/product-brief.md](product-brief.md)

---

## Product Overview

[Summary paragraph (3-5 sentences) tying together the problem being solved, the vision, the target personas, and the MVP scope. This paragraph should give any reader enough context to understand what this document specifies and why.]

---

## Epics

### Epic E1: [Epic Name]

**Description:** [2-3 sentences explaining what this epic delivers and why it matters]
**Primary Persona:** [Which persona benefits most]
**Scope Tier:** Must Have / Should Have / Could Have
**Validation Criterion Served:** [From Phase 0, if Must Have]

---

#### Story E1-S1: [Story Title]

**[User Story / Job Story]:**

> As a [persona name/role],
> I want [specific action or capability],
> so that [concrete outcome or benefit].

**Acceptance Criteria:**

```gherkin
Given [precondition or context],
When [action performed by the user],
Then [observable outcome].

Given [precondition or context],
When [action performed by the user],
Then [observable outcome].
```

_Alternative checklist format (if configured):_
- [ ] [Specific, verifiable condition]
- [ ] [Specific, verifiable condition]

| Attribute | Value |
|-----------|-------|
| **Priority** | Must Have / Should Have / Could Have |
| **Size** | XS / S / M / L / XL |
| **Dependencies** | [Other story IDs, or "None"] |

**Notes:** [Edge cases, clarifications, or additional context]

---

#### Story E1-S2: [Story Title]

[Repeat story structure]

---

### Epic E2: [Epic Name]

[Repeat epic structure]

---

<!-- TEMPLATE NOTE: Copy and repeat the Epic and Story blocks as needed. -->
<!-- Each epic should have 2-8 stories. If an epic has more than 8, consider splitting it. -->

---

## Non-Functional Requirements

### Performance

| NFR ID | Requirement | Threshold | Percentile | Verification Method | SLA Tier |
|--------|-------------|-----------|-----------|-------------------|----------|
| NFR-P01 | [Specific performance requirement] | [Measurable value, e.g., "< 200ms"] | [p95 / p99] | [Load test tool] | Tier 1 / Tier 2 |
| NFR-P02 | | | | | |

### Throughput and Scalability

| NFR ID | Requirement | Target | Sustained Duration | Verification Method |
|--------|-------------|--------|-------------------|-------------------|
| NFR-T01 | [Concurrent users] | [N users] | [Steady state] | [Load test] |
| NFR-T02 | [Request throughput] | [N req/s] | [15 min] | [Load test] |

### Availability and Reliability

| NFR ID | Requirement | Target | Measurement Period | Verification Method |
|--------|-------------|--------|-------------------|-------------------|
| NFR-A01 | [Uptime target] | [e.g., 99.9% monthly] | Monthly | [Monitoring tool] |
| NFR-A02 | [Recovery time (RTO)] | [e.g., < 15 min] | Per incident | [Runbook test] |
| NFR-A03 | [Error handling] | [e.g., Structured JSON errors] | — | [Integration tests] |
| NFR-A04 | [Data durability] | [e.g., Daily backups, 30-day retention] | — | [Backup verification script] |

> **Note:** For detailed performance analysis, quantified SLAs, cost budgets, and load profiles, invoke the Performance Analyst agent (`/jumpstart.performance`) after Phase 2 approval. The full NFR document is saved to `specs/nfrs.md`.

### Security

| Requirement | Detail | Verification Method |
|-------------|--------|-------------------|
| [Authentication requirement] | [Specifics] | [How verified] |
| [Authorisation requirement] | [Specifics] | [How verified] |
| [Data handling requirement] | [Specifics] | [How verified] |

**Compliance requirements:** [GDPR / HIPAA / SOC2 / None / Other]

> **Regulatory Focus:** If the project domain triggers regulatory requirements (healthcare, fintech, government, etc.), populate the compliance checklist using `.jumpstart/templates/compliance-checklist.md`. Use `bin/lib/regulatory-gate.js` to determine applicable regulations and required checks based on domain and data types.

### Accessibility

| Requirement | Target | Verification Method |
|-------------|--------|-------------------|
| [WCAG compliance level] | [e.g., WCAG 2.1 AA] | [Automated scan + manual audit] |
| [Specific requirement] | [Detail] | [How verified] |

### Observability

| Requirement | Detail |
|-------------|--------|
| [Logging] | [What is logged, format, retention] |
| [Monitoring] | [What is monitored, alerting thresholds] |
| [Metrics] | [Key metrics to track] |

### Other

| Category | Requirement | Detail |
|----------|-------------|--------|
| [Browser support] | [e.g., Chrome, Firefox, Safari latest 2 versions] | |
| [Internationalisation] | [e.g., English only / Multi-language support] | |
| [Data migration] | [If applicable] | |

---

## Dependencies and Risks

### External Dependencies

| # | Dependency | Type | Impact if Unavailable | Mitigation |
|---|-----------|------|----------------------|------------|
| 1 | [Third-party API, service, dataset, approval, etc.] | API / Service / Data / Approval / Platform | [What happens if this is not available] | [Fallback strategy] |
| 2 | | | | |

### Risk Register

| # | Risk Description | Type | Impact | Probability | Mitigation | Owner |
|---|-----------------|------|--------|------------|------------|-------|
| 1 | [What could go wrong] | Technical / Business / Schedule / Dependency | High / Med / Low | High / Med / Low | [Concrete action] | [Who monitors] |
| 2 | | | | | | |

---

## Success Metrics

| Metric | Phase 0 Criterion | Target | Measurement Method | Frequency | Baseline |
|--------|-------------------|--------|-------------------|-----------|----------|
| [Metric name] | [Which validation criterion this maps to] | [Success threshold] | [How captured: analytics, survey, log, manual] | [How often measured] | [Current state, if known] |
| | | | | | |

---

## Implementation Milestones

### Milestone 1: [Name]

**Goal:** [One sentence describing what is true when this milestone is complete]
**Stories Included:** E1-S1, E1-S2, E2-S1
**Depends On:** None (first milestone)

### Milestone 2: [Name]

**Goal:** [One sentence]
**Stories Included:** E2-S2, E2-S3, E3-S1
**Depends On:** Milestone 1

### Milestone 3: [Name]

**Goal:** [One sentence]
**Stories Included:** [Story IDs]
**Depends On:** Milestone 2

---

## Task Breakdown

> **Purpose:** Decompose user stories into actionable development tasks for the Developer agent (Phase 4). This section bridges requirements and implementation.

**Format:** `[Task ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., E1-S1, E2-S3)

**Path Conventions:** Adjust paths based on project structure:
- Single project: `src/`, `tests/`
- Web app: `backend/src/`, `frontend/src/`
- Mobile: `api/src/`, `mobile/src/`

---

### Stage 1: Setup (Shared Infrastructure)

**Purpose:** Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools
- [ ] T004 [P] Setup environment configuration management

---

### Stage 2: Foundational (Blocking Prerequisites)

**Purpose:** Core infrastructure that MUST be complete before ANY user story implementation

**⚠️ CRITICAL:** No user story work can begin until this stage is complete

- [ ] T005 Setup database schema and migrations framework
- [ ] T006 [P] Implement authentication/authorization framework
- [ ] T007 [P] Setup API routing and middleware structure
- [ ] T008 Create base models/entities that all stories depend on
- [ ] T009 Configure error handling and logging infrastructure

**Checkpoint:** ☐ Foundation ready - user story implementation can now begin

---

### Stage 3: Story E1-S1 - [Story Title] (Priority: Must Have)

**Goal:** [Brief description of what this story delivers]
**Independent Test:** [How to verify this story works on its own]

#### Tests for E1-S1 (Include if tests requested)

> **NOTE:** Write tests FIRST, ensure they FAIL before implementation

- [ ] T010 [P] [E1-S1] Contract test for [endpoint] in `tests/contract/test_[name].[ext]`
- [ ] T011 [P] [E1-S1] Integration test for [user journey] in `tests/integration/test_[name].[ext]`

#### Implementation for E1-S1

- [ ] T012 [P] [E1-S1] Create [Entity] model in `src/models/[entity].[ext]`
- [ ] T013 [E1-S1] Implement [Service] in `src/services/[service].[ext]` (depends on T012)
- [ ] T014 [E1-S1] Implement [endpoint/feature] in `src/[location]/[file].[ext]`
- [ ] T015 [E1-S1] Add validation and error handling
- [ ] T016 [E1-S1] Add logging for story operations

**Checkpoint:** ☐ Story E1-S1 fully functional and independently testable

---

### Stage 4: Story E1-S2 - [Story Title] (Priority: Must Have)

**Goal:** [Brief description]
**Independent Test:** [How to verify this story works on its own]

#### Tests for E1-S2 (Include if tests requested)

- [ ] T017 [P] [E1-S2] Contract test for [endpoint] in `tests/contract/test_[name].[ext]`
- [ ] T018 [P] [E1-S2] Integration test in `tests/integration/test_[name].[ext]`

#### Implementation for E1-S2

- [ ] T019 [P] [E1-S2] Create [Entity] model in `src/models/[entity].[ext]`
- [ ] T020 [E1-S2] Implement [Service] in `src/services/[service].[ext]`
- [ ] T021 [E1-S2] Implement [endpoint/feature] in `src/[location]/[file].[ext]`
- [ ] T022 [E1-S2] Integrate with E1-S1 components (if needed)

**Checkpoint:** ☐ Stories E1-S1 AND E1-S2 both work independently

---

<!-- TEMPLATE NOTE: Repeat Stage blocks for each user story -->
<!-- Organize by priority: Must Have → Should Have → Could Have -->
<!-- Each story should be independently implementable and testable -->

---

### Stage N: Polish & Cross-Cutting Concerns

**Purpose:** Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in `docs/`
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Additional unit tests (if requested) in `tests/unit/`
- [ ] TXXX Security hardening

---

### Dependencies & Execution Order

#### Stage Dependencies

```
Setup (Stage 1)
    ↓
Foundational (Stage 2) ← BLOCKS all user stories
    ↓
User Stories (Stage 3+) → Can proceed in parallel or sequentially by priority
    ↓
Polish (Stage N)
```

#### Within Each User Story

1. Tests (if included) MUST be written and FAIL before implementation
2. Models before services
3. Services before endpoints
4. Core implementation before integration
5. Story complete before moving to next priority

#### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel
- Once Stage 2 (Foundational) completes, all user stories can start in parallel
- Models within a story marked [P] can run in parallel
- Tests within a story marked [P] can run in parallel

---

### Implementation Strategy

#### MVP First (Highest Priority Stories Only)

1. Complete Stage 1: Setup
2. Complete Stage 2: Foundational (CRITICAL - blocks all stories)
3. Complete highest priority user story (e.g., E1-S1)
4. **STOP and VALIDATE:** Test story independently
5. Deploy/demo if ready

#### Incremental Delivery

1. Stage 1 + Stage 2 → Foundation ready
2. Add Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add Story 2 → Test independently → Deploy/Demo
4. Each story adds value without breaking previous stories

---

## Glossary

| Term | Definition |
|------|-----------|
| [Domain-specific term used in this document] | [Clear definition] |
| | |

---
## Insights Reference

**Companion Document:** [specs/insights/prd-insights.md](insights/prd-insights.md)

This artifact was informed by ongoing insights captured during Planning. Key insights that shaped this document:

1. **[Brief insight title]** - [One sentence summary]
2. **[Brief insight title]** - [One sentence summary]
3. **[Brief insight title]** - [One sentence summary]

See the insights document for complete decision rationale, alternatives considered, and questions explored.

---

## Cross-Reference Links

| This Document | Links To | Section |
|---|---|---|
| User Stories | [Architecture](../architecture.md) | Component Mapping |
| NFRs | [Constraint Map](../constraint-map.md) | NFR Traceability |
| Epics | [Implementation Plan](../implementation-plan.md) | Task Mapping |
| Personas | [Product Brief](../product-brief.md) | User Personas |
| Success Metrics | [Metrics](../metrics.md) | Full Metrics Dashboard |

> **Bidirectional Requirement:** Each linked document MUST link back to this PRD. Validate with `bin/lib/crossref.js`.

---

## Glossary Reference

> All domain-specific terms used in this document MUST align with the project glossary at `.jumpstart/glossary.md`. If a term is used here that is not in the glossary, add it. If the glossary definition conflicts with usage here, update one or the other — never leave inconsistencies.

---

## Phase Gate Approval

- [ ] Human has reviewed this PRD
- [ ] Every epic has at least one user story
- [ ] Every Must Have story has at least 2 acceptance criteria
- [ ] Acceptance criteria are specific and testable (no vague qualifiers)
- [ ] Non-functional requirements have measurable thresholds
- [ ] At least one implementation milestone is defined
- [ ] Task breakdown includes Setup, Foundational, and at least one user story stage
- [ ] Dependencies have identified mitigations
- [ ] Risks have identified mitigations
- [ ] Success metrics map to Phase 0 validation criteria
- [ ] Human has explicitly approved this PRD for Phase 3 handoff

**Approved by:** [Human's name or "Pending"]
**Approval date:** [Date or "Pending"]
**Status:** Draft

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:prd",
  "js:phase": 2,
  "js:agent": "PM",
  "js:status": "[STATUS]",
  "js:version": "[VERSION]",
  "js:upstream": [
    { "@id": "js:challenger-brief" },
    { "@id": "js:product-brief" }
  ],
  "js:downstream": [
    { "@id": "js:architecture" },
    { "@id": "js:implementation-plan" }
  ],
  "js:traces": []
}
```
