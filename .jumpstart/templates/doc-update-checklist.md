---
id: doc-update-checklist
phase: "4"
agent: tech-writer
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - architecture
  - implementation-plan
dependencies: []
risk_level: low
owners: []
sha256: ""
---

# Documentation Update Checklist: {{Project Name}}

> **Documentation Freshness Audit and Update Tracking**

## Metadata

| Field | Value |
|---|---|
| Project | {{Project Name}} |
| Tech Writer | AI Technical Writer Agent |
| Date | {{Date}} |
| Audit Scope | Full / Incremental |

---

## 1. Documentation Inventory

| Document | Location | Exists | Last Updated | Status |
|---|---|---|---|---|
| Project README | `README.md` | ✅ / ❌ | {{Date}} | Current / Stale / Missing |
| API Documentation | `docs/api.md` | ✅ / ❌ | {{Date}} | Current / Stale / Missing |
| Setup Guide | `docs/setup.md` | ✅ / ❌ | {{Date}} | Current / Stale / Missing |
| Configuration Reference | `docs/config.md` | ✅ / ❌ | {{Date}} | Current / Stale / Missing |
| Architecture Overview | `specs/architecture.md` | ✅ / ❌ | {{Date}} | Current / Stale / Missing |
| CHANGELOG | `CHANGELOG.md` | ✅ / ❌ | {{Date}} | Current / Stale / Missing |

---

## 2. README Checklist

- [ ] Project description matches current functionality
- [ ] Prerequisites are accurate (tools, versions, accounts)
- [ ] Installation steps work when followed literally
- [ ] Quick start example works end-to-end
- [ ] Configuration options are documented with defaults
- [ ] Available commands / CLI usage is current
- [ ] Testing instructions are accurate
- [ ] Architecture overview reflects current design
- [ ] Badge links (CI, coverage, etc.) are valid
- [ ] License information is correct

---

## 3. API Documentation Checklist

| Endpoint / Interface | Documented | Accurate | Example | Notes |
|---|---|---|---|---|
| {{GET /api/users}} | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | {{Status}} |
| {{POST /api/auth/login}} | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | {{Status}} |

---

## 4. AGENTS.md File Status

| Directory | AGENTS.md Exists | Current | Key Updates Needed |
|---|---|---|---|
| `src/` | ✅ / ❌ | ✅ / ❌ | {{What needs updating}} |
| `src/{{module}}/` | ✅ / ❌ | ✅ / ❌ | {{What needs updating}} |

---

## 5. Inline Documentation

| File | Comments Current | JSDoc/Docstrings | Notes |
|---|---|---|---|
| `src/{{file}}` | ✅ / ❌ | ✅ / ❌ | {{Status}} |

---

## 6. Freshness Summary

| Category | Total | Current | Stale | Missing | Score |
|---|---|---|---|---|---|
| Core docs | {{n}} | {{n}} | {{n}} | {{n}} | {{%}} |
| API docs | {{n}} | {{n}} | {{n}} | {{n}} | {{%}} |
| AGENTS.md | {{n}} | {{n}} | {{n}} | {{n}} | {{%}} |
| Inline docs | {{n}} | {{n}} | {{n}} | {{n}} | {{%}} |
| **Overall** | **{{n}}** | **{{n}}** | **{{n}}** | **{{n}}** | **{{%}}** |

---

## 7. Action Items

| Priority | Document | Action | Effort |
|---|---|---|---|
| High | {{Document}} | {{What to update}} | Small / Medium / Large |
| Medium | {{Document}} | {{What to update}} | Small / Medium / Large |
| Low | {{Document}} | {{What to update}} | Small / Medium / Large |

---

## Phase Gate Approval

- [ ] Documentation inventory completed
- [ ] README checklist reviewed
- [ ] API documentation audited
- [ ] AGENTS.md files checked for each module
- [ ] Freshness score calculated
- [ ] Action items prioritised
- **Approved by:** Pending
- **Date:** Pending

