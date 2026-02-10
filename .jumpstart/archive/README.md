# Archive Directory

> **Auto-managed by Jump Start Framework (Item 40/50)**

This directory stores timestamped copies of spec artifacts before they are overwritten or regenerated. This prevents accidental loss of approved work.

## Archive Naming Convention

```
{original-filename}.{YYYY-MM-DDTHHMMSS}.md
```

Example:
```
architecture.2026-02-08T143000.md
prd.2026-02-08T150000.md
```

## Metadata

Each archived file has a companion `.meta.json` file containing:

```json
{
  "original_path": "specs/architecture.md",
  "archived_at": "2026-02-08T14:30:00Z",
  "archived_by": "revert",
  "phase": 3,
  "reason": "Pre-revert backup"
}
```

## Retention Policy

- Archives are never automatically deleted
- Manual cleanup is the human operator's responsibility
- Use `git log` for version history beyond what's archived here

## Usage

Archives are created automatically by:
- `/jumpstart.revert` — before reverting an artifact to a previous state
- Phase transitions — when an artifact is regenerated for a new sprint
- Manual archival via CLI commands
