---
id: quickflow
phase: advisory
agent: quick-dev
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
risk_level: low
owners: []
sha256: ""
---

# Quick Flow Report: {{Description}}

> **Abbreviated Change Report — Quick Flow Path**

## Change Metadata

| Field | Value |
|---|---|
| Description | {{Brief description of the change}} |
| Type | Bug Fix / Config Change / Content Update / Minor Feature / Dependency Update |
| Risk Level | Low / Medium |
| Date | {{Date}} |
| Requested By | {{Human name}} |

---

## 1. Impact Analysis

### Scope Assessment

| Criterion | Result |
|---|---|
| Files affected | {{N}} |
| Modules affected | {{N}} |
| Scope Guard | ✅ Qualifies for Quick Flow |
| Risk level | Low / Medium |

### Affected Files

| File | Change Type | Description |
|---|---|---|
| {{file path}} | Modified / Created / Deleted | {{What changed}} |

### Invariant Compliance

| Invariant | Status |
|---|---|
| {{Invariant name}} | ✅ Compliant / ⚠️ Review |

### Architecture Alignment

- [ ] Change fits within existing component boundaries
- [ ] No new external dependencies introduced
- [ ] No API contract changes
- [ ] No database schema changes

---

## 2. Implementation

### Changes Made

{{Narrative description of what was implemented and how}}

### Code Highlights

```{{language}}
// Key change snippet (if applicable)
```

---

## 3. Testing

### Test Results

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| {{Suite name}} | {{N}} | {{N}} | 0 | 0 |
| **Total** | **{{N}}** | **{{N}}** | **0** | **0** |

### New/Modified Tests

| Test | Type | Description |
|---|---|---|
| {{test name}} | Unit / Integration | {{What it verifies}} |

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| {{Potential risk}} | Low / Medium | Low / Medium | {{How mitigated}} |

---

## 5. Verification Checklist

- [ ] All existing tests pass
- [ ] New tests written for the change
- [ ] Invariants checked and compliant
- [ ] Architecture alignment confirmed
- [ ] Linter passes (if configured)
- [ ] Human has reviewed and approved

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:quickflow",
  "js:phase": "advisory",
  "js:agent": "QuickDev",
  "js:status": "[STATUS]",
  "js:version": "[VERSION]",
  "js:upstream": [
    { "@id": "js:architecture" }
  ],
  "js:downstream": [],
  "js:traces": []
}
```
