---
id: diff-summary
phase: any
agent: System
status: Generated
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs: []
dependencies: []
risk_level: low
owners: []
sha256: null
---

# Dry-Run Diff Summary

> **Generated:** [DATE]
> **Mode:** Dry-run (no changes written to disk)
> **Tool:** `bin/lib/diff.js`

---

## Summary

| Metric | Value |
|--------|-------|
| **Files to create** | [N] |
| **Files to modify** | [N] |
| **Files to delete** | [N] |
| **Total lines added** | [N] |
| **Total lines removed** | [N] |

---

## Changes

### New Files

| # | Path | Lines | Description |
|---|------|-------|-------------|
| 1 | `[path/to/file]` | [N] | [brief description] |

### Modified Files

| # | Path | Lines Added | Lines Removed | Description |
|---|------|-------------|---------------|-------------|
| 1 | `[path/to/file]` | [+N] | [-N] | [what changed] |

### Deleted Files

| # | Path | Reason |
|---|------|--------|
| 1 | `[path/to/file]` | [why deleted] |

---

## Diff Detail

### `[path/to/file]`

```diff
- [old line]
+ [new line]
```

---

## Approval

To apply these changes, re-run the command without `--dry-run`:

```bash
jumpstart-mode [command]
```

> **Warning:** Review all changes carefully before applying. Changes cannot be automatically undone without version control.
