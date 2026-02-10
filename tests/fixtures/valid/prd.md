---
id: test-prd
phase: 2
agent: PM
status: Approved
created: 2026-01-15
updated: 2026-01-20
version: 1.0.0
approved_by: Jane Smith
approval_date: 2026-01-20
upstream_refs:
  - challenger-brief
  - product-brief
---

# Product Requirements Document — Test PRD

## Product Overview

This is a test PRD for schema validation testing. It defines the requirements for a simple todo application.

## Epics

### Epic 1: User Authentication (E01)

#### E01-S01: User Registration

**As a** new user, **I want to** create an account **so that** I can save my todos.

**Acceptance Criteria:**
- Given a valid email and password, when the user submits the form, then an account is created
- Given an existing email, when the user submits the form, then an error message is shown

**Priority:** Must Have

#### E01-S02: User Login

**As a** registered user, **I want to** log in **so that** I can access my todos.

**Acceptance Criteria:**
- Given valid credentials, when the user logs in, then they are redirected to the dashboard
- Given invalid credentials, when the user logs in, then an error is shown

**Priority:** Must Have

### Epic 2: Todo Management (E02)

#### E02-S01: Create Todo

**As a** logged-in user, **I want to** create a todo item **so that** I can track my tasks.

**Acceptance Criteria:**
- Given a title, when the user creates a todo, then it appears in the list

**Priority:** Must Have

## Non-Functional Requirements

### NFR-01: Performance

The application must respond to user actions within 200ms under normal load.

### NFR-02: Security

All user passwords must be hashed using bcrypt with a salt factor of 12.

## Milestones

| Milestone | Target Date | Stories |
|-----------|-------------|---------|
| M1: Auth | 2026-02-01 | E01-S01, E01-S02 |
| M2: Todos | 2026-02-15 | E02-S01 |

## Phase Gate Approval

- [x] All user stories have acceptance criteria
- [x] Non-functional requirements are defined
- [x] Milestones are planned

**Approved by:** Jane Smith
**Approval date:** 2026-01-20
