---
id: contracts
phase: 3
agent: Architect
status: Draft
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs:
  - specs/prd.md
  - specs/architecture.md
  - specs/data-model.md
dependencies:
  - prd
  - architecture
  - data-model
risk_level: high
owners: []
sha256: null
---

# API Contracts

> **Phase:** 3 — Solutioning
> **Agent:** The Architect
> **Status:** Draft
> **Created:** [DATE]
> **Upstream References:**
> - [specs/prd.md](prd.md)
> - [specs/architecture.md](architecture.md)
> - [specs/data-model.md](data-model.md)

---

## Overview

[Brief description of the API style (REST, GraphQL, gRPC, WebSocket), base URL, versioning strategy, authentication method, and content types.]

---

## Authentication

| Method | Header / Mechanism | Format | Notes |
|--------|--------------------|--------|-------|
| [e.g., Bearer Token] | `Authorization: Bearer <token>` | JWT | [expiry, refresh policy] |

---

## Common Response Envelope

```json
{
  "data": {},
  "meta": {
    "timestamp": "ISO-8601",
    "request_id": "uuid"
  },
  "errors": [
    {
      "code": "ERROR_CODE",
      "message": "Human-readable message",
      "field": "optional_field_name"
    }
  ]
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Authenticated but insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Resource state conflict |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Endpoints

### `[METHOD] /api/v1/[resource]`

**Description:** [What this endpoint does]
**Story:** [PRD story ID, e.g., E01-S01]
**Component:** [Architecture component name]

**Request:**

| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| `[param]` | path / query / body | string | Yes | [description] |

```json
// Request body example
{
  "field": "value"
}
```

**Response (200):**

```json
{
  "data": {
    "id": "uuid",
    "field": "value"
  }
}
```

**Error Responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | [condition] |
| 404 | `NOT_FOUND` | [condition] |

---

### `[METHOD] /api/v1/[resource]`

[Repeat for each endpoint]

---

## WebSocket / Event Contracts (if applicable)

### Event: `[event.name]`

**Direction:** Server → Client / Client → Server
**Trigger:** [What causes this event]

```json
{
  "event": "event.name",
  "payload": {
    "field": "value"
  }
}
```

---

## Rate Limiting

| Tier | Requests / Window | Window | Response on Exceed |
|------|-------------------|--------|--------------------|
| Default | [e.g., 100] | [e.g., 1 minute] | 429 Too Many Requests |

---

## Versioning Policy

[Describe how API versions are managed: URL path (`/v1/`), header-based, query param. Deprecation timeline and migration strategy.]

---

## Cross-References

| Endpoint | PRD Story | Data Model Entity | Architecture Component |
|----------|-----------|-------------------|----------------------|
| `POST /api/v1/[resource]` | [E01-S01] | [Entity] | [Component] |

---

## Contract Validation

This document is validated by `bin/lib/contract-checker.js` against the data model (`specs/data-model.md`). Run:

```bash
echo '{"contracts":"specs/contracts.md","data_model":"specs/data-model.md"}' | node bin/lib/contract-checker.js
```

---

## Phase Gate Approval

- [ ] All PRD stories with API interactions have corresponding endpoints
- [ ] Request/response schemas align with the data model
- [ ] Error codes are consistent and documented
- [ ] Authentication and authorization are specified
- [ ] Rate limiting is defined

**Approved by:** Pending
**Approval date:** Pending
