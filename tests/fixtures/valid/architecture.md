---
id: test-architecture
phase: 3
agent: Architect
status: Approved
created: 2026-01-20
version: 1.0.0
risk_level: medium
upstream_refs:
  - test-prd
  - product-brief
---

# Architecture Document — Test App

## Technical Overview

A Node.js REST API with PostgreSQL backend and React frontend.

## Technology Stack

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| Runtime | Node.js | 20 LTS | Stable, broad ecosystem |
| Framework | Express | 4.x | Lightweight, well-understood |
| Database | PostgreSQL | 16 | Relational, JSON support |
| Frontend | React | 18 | Component-based UI |

## Components

### Component: API Server

- **Purpose:** Handle HTTP requests and business logic
- **Interface:** REST JSON API
- **Dependencies:** Express, pg

### Component: Database

- **Purpose:** Persistent data storage
- **Interface:** SQL via pg driver
- **Dependencies:** PostgreSQL

### Component: Frontend

- **Purpose:** User interface
- **Interface:** React SPA
- **Dependencies:** React, React Router

## Data Model

### Entity: User

| Field | Type | Constraints |
|-------|------|------------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Unique, not null |
| password_hash | VARCHAR(255) | Not null |
| created_at | TIMESTAMP | Default now() |

### Entity: Todo

| Field | Type | Constraints |
|-------|------|------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key → User |
| title | VARCHAR(500) | Not null |
| completed | BOOLEAN | Default false |

## API Contracts

### POST /api/auth/register

**Request:**
```json
{ "email": "user@example.com", "password": "secret123" }
```

**Response (201):**
```json
{ "id": "uuid", "email": "user@example.com" }
```

## Deployment

- **Environment:** Docker containers
- **Hosting:** Cloud provider (configurable)
- **CI/CD:** GitHub Actions

## Phase Gate Approval

- [x] Technology stack justified
- [x] Components defined with interfaces
- [x] Data model specified
- [x] API contracts documented

**Approved by:** Jane Smith
**Approval date:** 2026-01-20
