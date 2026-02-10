---
id: insight-entry
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

# Insight Entry Template

> **Standardised format for individual insight entries within insight logs**

## Purpose

This template defines the canonical format for a single insight entry. Use this structure when adding entries to any `specs/insights/*.md` file. Standardised entries enable automated parsing, searching, and cross-referencing across the project's insight corpus.

---

## Entry Format

```markdown
### [Entry Title — Brief, Descriptive]

**Timestamp:** [ISO 8601 UTC — e.g., 2026-02-08T14:23:00Z]
**Type:** Decision | Discovery | Trade-Off | Rejected Alternative | Open Question | Pattern | Constraint
**Confidence:** High | Medium | Low
**Source:** [What prompted this insight — user feedback, analysis, research, testing, etc.]

**Insight:**
[2-5 sentences describing the insight. Be specific: what was learned, decided, or discovered.]

**Evidence:**
- [Concrete evidence supporting this insight — data, quotes, test results, research findings]

**Alternatives Considered:**
- [What else was considered and why it was rejected — only for Decision/Trade-Off types]

**Impact:**
- [How this insight affects the project — which artifacts, decisions, or plans it influences]

**Cross-References:**
- → See [Related Section](../artifact.md#section) 
- → Influences [Downstream Artifact](../artifact.md)
- → Triggered by [Upstream Decision](../decisions/NNN-decision.md)

**Tags:** [comma-separated tags for searchability — e.g., architecture, performance, ux, security]
```

---

## Entry Types

| Type | When to Use | Required Fields |
|---|---|---|
| **Decision** | A choice was made between alternatives | Alternatives Considered, Evidence |
| **Discovery** | Something new was learned | Evidence, Source |
| **Trade-Off** | A conscious compromise was accepted | Alternatives Considered, Impact |
| **Rejected Alternative** | An option was explicitly ruled out | Evidence (why rejected) |
| **Open Question** | Something unresolved that needs future attention | Impact, Tags |
| **Pattern** | A recurring theme or observation | Evidence (examples) |
| **Constraint** | An external limitation was identified | Source, Impact |

---

## Validation Rules

1. Every entry MUST have a Timestamp in ISO 8601 UTC format
2. Every entry MUST have a Type from the enumerated list
3. Every entry MUST have a Confidence level
4. Decision and Trade-Off entries MUST include Alternatives Considered
5. Every entry SHOULD have at least one Cross-Reference
6. Tags SHOULD use consistent terminology (see `.jumpstart/glossary.md` if available)

---

## Example

```markdown
### Database Selection: PostgreSQL over MongoDB

**Timestamp:** 2026-02-08T14:23:00Z
**Type:** Decision
**Confidence:** High
**Source:** Architecture Phase — tech stack evaluation

**Insight:**
Chose PostgreSQL 16 over MongoDB 7 for the primary datastore. The project's data model is highly relational (user → organisation → project → task) with complex join queries. PostgreSQL's ACID compliance and mature ORM support (Prisma) align better with the NFRs.

**Evidence:**
- Data model analysis shows 8 entities with 12 foreign key relationships
- NFR-P01 requires < 200ms p95 latency — PostgreSQL benchmarks show 50ms for typical queries
- Context7 verification confirmed Prisma 5.x has full PostgreSQL 16 support

**Alternatives Considered:**
- MongoDB 7: Better for document-oriented data but would require denormalisation of relational data, increasing write complexity
- SQLite: Insufficient for multi-connection production workloads

**Impact:**
- Architecture document updated to specify PostgreSQL 16
- Hosting decision must support managed PostgreSQL (influences cloud provider choice)

**Cross-References:**
- → See [Technology Stack](../architecture.md#technology-stack)
- → Influences [ADR-003: Database Selection](../decisions/003-database-selection.md)
- → Traces to [NFR-P01](../prd.md#performance)

**Tags:** architecture, database, postgresql, decision
```
