# E2E Test Reports

This directory contains generated simulation reports from holodeck runs.

Reports are named: `{scenario}-{timestamp}.json`

## Report Structure

```json
{
  "scenario": "ecommerce",
  "success": true,
  "total_duration_ms": 1500,
  "phases": [...],
  "document_creation": {...},
  "summary": {...},
  "errors": [],
  "warnings": []
}
```

## Cleaning Up

Run `git clean -fd tests/e2e/reports/` to remove all generated reports.
