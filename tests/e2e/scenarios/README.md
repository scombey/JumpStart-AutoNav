# E2E Scenarios Directory

This directory contains Golden Master scenarios for holodeck simulation testing.

## Structure

Each scenario is a directory containing:

```
scenarios/{scenario-name}/
├── config.yaml                 # Scenario-specific configuration
├── 00-scout/                   # Scout phase outputs (brownfield only)
│   ├── codebase-context.md
│   └── insights.md
├── 01-challenger/              # Challenger phase outputs
│   ├── challenger-brief.md
│   └── insights.md
├── 02-analyst/                 # Analyst phase outputs
│   ├── product-brief.md
│   └── insights.md
├── 03-pm/                      # PM phase outputs
│   ├── prd.md
│   └── insights.md
├── 04-architect/               # Architect phase outputs (with subagent traces)
│   ├── architecture.md
│   ├── implementation-plan.md
│   └── insights.md
└── 05-developer/               # Developer phase outputs
    └── TODO.md
```

## Available Scenarios

- `ecommerce/` - E-commerce platform scenario with full phase coverage
- `baseline/` - Minimal baseline scenario for quick testing

## Creating New Scenarios

1. Create a new directory under `scenarios/`
2. Add `config.yaml` with scenario settings
3. Populate phase directories with Golden Master artifacts
4. Ensure architect insights include subagent traces for `--verify-subagents` mode

## Subagent Breadcrumbs

For subagent verification, insights files must contain traces like:

```markdown
## Subagent Invocations
- [2026-02-09T14:00:00Z] Invoked @Jump Start: Security for threat modeling.
- [2026-02-09T14:05:00Z] Incorporated Security feedback into "Authentication" section.
```

Or in-artifact markers:

```markdown
> **Contribution by Jump Start: Security**
> Recommended implementation of OWASP Top 10 protections...
```
