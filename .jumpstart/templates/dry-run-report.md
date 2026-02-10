---
id: dry-run-report
phase: advisory
agent: system
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

# Dry Run Report: {{Operation}}

> **Simulation Mode — No changes were written to disk**

## Simulation Metadata

| Field | Value |
|---|---|
| Operation | {{Phase or command being simulated}} |
| Date | {{Date}} |
| Requested By | {{Human name}} |
| Mode | Dry Run (simulation only) |

---

## 1. Proposed File Changes

### Files to Create

| File Path | Template Source | Estimated Size |
|---|---|---|
| {{path}} | {{template}} | {{lines}} |

### Files to Modify

| File Path | Section | Change Type | Description |
|---|---|---|---|
| {{path}} | {{section}} | Add / Edit / Remove | {{What would change}} |

### Files to Delete

| File Path | Reason |
|---|---|
| {{path}} | {{Why this file would be removed}} |

---

## 2. Change Diff Preview

### {{File Path}}

```diff
- {{old content}}
+ {{new content}}
```

---

## 3. Impact Summary

| Metric | Value |
|---|---|
| Files created | {{N}} |
| Files modified | {{N}} |
| Files deleted | {{N}} |
| Total lines added | {{N}} |
| Total lines removed | {{N}} |
| Net line change | {{+/-N}} |

---

## 4. Dependency Analysis

### New Dependencies

| Dependency | Version | Purpose | Risk |
|---|---|---|---|
| {{package}} | {{version}} | {{Why needed}} | Low / Medium / High |

### Modified Dependencies

| Dependency | Current | Proposed | Breaking? |
|---|---|---|---|
| {{package}} | {{old version}} | {{new version}} | Yes / No |

---

## 5. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| {{Risk}} | Low / Medium / High | Low / Medium / High | {{Mitigation}} |

---

## 6. Proceed?

To execute these changes for real, run the same command without the `--dry-run` flag.

**Human decision required:** Review the proposed changes above and confirm whether to proceed.
