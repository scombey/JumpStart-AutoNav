---
id: stack-metadata
phase: 3
agent: researcher
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - specs/architecture.md
dependencies:
  - architecture
risk_level: medium
owners: []
sha256: ""
---

# Tech Stack Metadata

> **Version-Pinned Dependencies with Verification Status**

## Purpose

This document prevents hallucinated versions and ambiguous dependencies by recording exact, verified version information for every technology in the stack. All versions must be confirmed via Context7 or official documentation.

---

## 1. Runtime Dependencies

| Package | Pinned Version | Min Compatible | Max Tested | License | Docs URL | Verified Via |
|---|---|---|---|---|---|---|
| {{package}} | {{exact version}} | {{oldest compatible}} | {{newest tested}} | {{SPDX}} | {{URL}} | [Context7: {{lib@version}}] |

---

## 2. Dev Dependencies

| Package | Pinned Version | Purpose | License | Verified Via |
|---|---|---|---|---|
| {{package}} | {{exact version}} | {{Why needed}} | {{SPDX}} | [Context7: {{lib@version}}] |

---

## 3. Infrastructure

| Component | Version | Provider | Configuration | Docs URL |
|---|---|---|---|---|
| {{e.g., Node.js}} | {{20.11.0 LTS}} | {{Official}} | {{engines field in package.json}} | {{URL}} |
| {{e.g., PostgreSQL}} | {{16.2}} | {{Managed / Self-hosted}} | {{connection string}} | {{URL}} |

---

## 4. Version Constraints

| Constraint | Packages Affected | Reason | Risk if Violated |
|---|---|---|---|
| {{e.g., Node >= 18}} | {{All runtime}} | {{ES module support required}} | {{Build failure}} |
| {{e.g., React 18.x only}} | {{react, react-dom}} | {{Server components require 18+}} | {{Runtime errors}} |

---

## 5. Breaking Changes Horizon

| Package | Current | Next Major | Expected Date | Breaking Changes | Migration Effort |
|---|---|---|---|---|---|
| {{package}} | {{current version}} | {{next major}} | {{estimated date}} | {{Summary of breaks}} | Low / Medium / High |

---

## 6. Compatibility Matrix

| Package A | Version | Package B | Version | Compatible? | Notes |
|---|---|---|---|---|---|
| {{React}} | {{18.3}} | {{Next.js}} | {{14.2}} | ✅ Yes | |
| {{Prisma}} | {{5.x}} | {{PostgreSQL}} | {{16}} | ✅ Yes | |

---

## 7. Version Pinning Policy

1. **Production dependencies:** Pin to exact version (e.g., `"react": "18.3.1"`)
2. **Dev dependencies:** Allow patch updates (e.g., `"vitest": "~1.6.0"`)
3. **Lock file:** Always commit lock file (`package-lock.json`, `yarn.lock`, etc.)
4. **Update frequency:** Review dependencies monthly via `/jumpstart.maintenance`
5. **Breaking updates:** Require ADR before adopting a new major version

---

## Verification Status

| Status | Count |
|---|---|
| ✅ Verified via Context7 | {{N}} |
| ✅ Verified via official docs | {{N}} |
| ⚠️ Version assumed (needs verification) | {{N}} |
| ❌ Unverified | {{N}} |
