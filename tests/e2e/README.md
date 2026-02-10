# E2E Holodeck Test Suite

The Jump Start Holodeck is an E2E simulation and observability framework for validating the complete Jump Start lifecycle.

## Quick Start

```bash
# List available scenarios
npm run holodeck:list

# Run all scenarios
npm run test:e2e

# Run a specific scenario
npm run test:e2e:scenario -- ecommerce

# Run with subagent verification
npm run test:e2e:verify

# Run with verbose output
node bin/holodeck.js --scenario ecommerce --verbose
```

## Directory Structure

```
tests/e2e/
├── scenarios/           # Golden Master scenarios
│   ├── ecommerce/       # Full e-commerce platform scenario
│   │   ├── config.yaml
│   │   ├── 01-challenger/
│   │   ├── 02-analyst/
│   │   ├── 03-pm/
│   │   ├── 04-architect/   # Contains subagent traces
│   │   └── 05-developer/
│   └── baseline/        # Minimal test scenario
├── reports/             # Generated simulation reports
└── .tmp/                # Temporary simulation projects (gitignored)
```

## How It Works

1. **Setup**: Creates a temporary project directory
2. **Inject**: Copies Golden Master artifacts from scenario to temp project
3. **Validate**: Runs artifact validators against each phase
4. **Verify Subagents**: (Optional) Checks for subagent invocation traces
5. **Handoff Check**: Validates handoff contracts between phases
6. **Report**: Generates JSON report with observability data

## Creating New Scenarios

1. Create a directory under `scenarios/`
2. Add `config.yaml` with scenario settings
3. Create phase directories (01-challenger, 02-analyst, etc.)
4. Add Golden Master artifacts to each phase

### Required Artifacts by Phase

| Phase | Directory | Required Artifacts |
|-------|-----------|-------------------|
| Challenger | 01-challenger | challenger-brief.md, insights.md |
| Analyst | 02-analyst | product-brief.md, insights.md |
| PM | 03-pm | prd.md, insights.md |
| Architect | 04-architect | architecture.md, implementation-plan.md, insights.md |
| Developer | 05-developer | TODO.md |

### Subagent Breadcrumbs

For `--verify-subagents` mode, architect insights must contain traces:

```markdown
## Subagent Invocations
- [2026-02-09T14:00:00Z] Invoked @Jump Start: Security for threat modeling.
```

Or in-artifact markers:

```markdown
> **Contribution by Jump Start: Security**
> ...
```

## Report Format

```json
{
  "scenario": "ecommerce",
  "success": true,
  "total_duration_ms": 1500,
  "phases": [
    {
      "name": "architect",
      "status": "PASS",
      "artifacts": ["specs/architecture.md"],
      "subagents_verified": ["Jump Start: Security"],
      "handoff_validation": "PASS",
      "cost_tracking": { "main_agent": 1200, "subagents": 500 }
    }
  ],
  "document_creation": {
    "TODO.md": "CREATED"
  },
  "summary": {
    "total_phases": 5,
    "passed": 5,
    "failed": 0
  }
}
```

## Utility Libraries

The holodeck uses several lib modules that can be reused:

- `bin/lib/validator.js` - Schema and artifact validation
- `bin/lib/handoff-validator.js` - Phase handoff validation
- `bin/lib/usage.js` - Cost tracking and usage logging
- `bin/lib/state-store.js` - Workflow state persistence
- `bin/lib/simulation-tracer.js` - Observability and reporting
