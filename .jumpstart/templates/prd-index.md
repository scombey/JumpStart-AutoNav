# PRD Shard Index

> **Phase:** 2 -- Planning
> **Agent:** The Product Manager
> **Status:** Draft
> **Created:** [DATE]
> **Parent PRD:** [specs/prd.md](prd.md) (if monolithic) or N/A (if fully sharded)

---

## About This Index

When a PRD exceeds the context window threshold (configurable in `.jumpstart/config.yaml`), it is broken into smaller, self-contained shards — one per epic or domain. This index tracks all shards and their cross-references.

---

## Shard Registry

| Shard ID | Epic | File | Status | Stories |
|----------|------|------|--------|---------|
| PRD-001 | E1: [Epic Name] | `specs/prd/prd-001-[slug].md` | Draft / Approved | S01, S02, S03 |
| PRD-002 | E2: [Epic Name] | `specs/prd/prd-002-[slug].md` | Draft / Approved | S04, S05 |
| PRD-003 | E3: [Epic Name] | `specs/prd/prd-003-[slug].md` | Draft / Approved | S06, S07, S08 |

---

## Cross-Shard Dependencies

| From (Story) | To (Story) | Dependency Type | Notes |
|--------------|------------|-----------------|-------|
| S02 (PRD-001) | S04 (PRD-002) | Data dependency | S02 creates entities consumed by S04 |
| S06 (PRD-003) | S01 (PRD-001) | Auth dependency | S06 requires auth flow from S01 |

---

## Shared Sections

The following sections apply across all shards and are maintained here (not duplicated):

### Non-Functional Requirements

[Reference or embed the NFR section that applies globally]

### Milestone Mapping

| Milestone | Shards Included | Goal |
|-----------|----------------|------|
| M1 | PRD-001 | [Milestone 1 goal] |
| M2 | PRD-001, PRD-002 | [Milestone 2 goal] |
| M3 | PRD-002, PRD-003 | [Milestone 3 goal] |

---

## Integrity Check

- [ ] Every story in the monolithic PRD is represented in exactly one shard
- [ ] Cross-shard dependencies are documented above
- [ ] All shards use the same template structure
- [ ] NFRs are not duplicated across shards
- [ ] Milestone mapping covers all shards
