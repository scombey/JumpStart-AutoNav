---
id: deploy
phase: "4"
agent: DevOps
status: draft
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs:
  - "specs/architecture.md"
  - "specs/implementation-plan.md"
dependencies: []
risk_level: medium
owners: []
sha256: null
---

# Deployment Plan

> **Project:** [PROJECT_NAME]
> **Command:** `/jumpstart.deploy`

---

## Deployment Target

| Field | Value |
|-------|-------|
| **Provider** | [AWS / Azure / GCP / Vercel / Netlify / Self-hosted] |
| **Environment** | [Production / Staging / Preview] |
| **Region** | [e.g., us-east-1, westeurope] |
| **Strategy** | [Rolling / Blue-Green / Canary / Recreate] |

---

## Pipeline Architecture

```
[Source] → [Lint] → [Test] → [Build] → [Deploy Staging] → [Smoke Test] → [Deploy Prod]
```

### Pipeline Stages

| Stage | Tool | Trigger | Timeout |
|-------|------|---------|---------|
| Lint | [linter] | Push/PR | 5m |
| Test | [test runner] | Push/PR | 10m |
| Build | [build tool] | Push/PR | 5m |
| Deploy Staging | [deploy tool] | Merge to main | 5m |
| Smoke Test | [test tool] | After staging deploy | 5m |
| Deploy Production | [deploy tool] | Manual approval | 5m |

---

## Environment Variables

| Variable | Source | Required | Description |
|----------|--------|----------|-------------|
| [VAR_NAME] | [Secret / Config] | Yes/No | [Description] |

> **Security:** All secrets must be stored in the CI provider's secret store. Never commit secrets to source control.

---

## Infrastructure Requirements

| Resource | Specification | Purpose |
|----------|--------------|---------|
| [Compute] | [spec] | [purpose] |
| [Database] | [spec] | [purpose] |
| [Storage] | [spec] | [purpose] |
| [CDN] | [spec] | [purpose] |

---

## Rollback Plan

| Scenario | Action | RTO |
|----------|--------|-----|
| Failed deployment | [Auto-rollback / Manual revert] | [time] |
| Data corruption | [Restore from backup] | [time] |
| Service degradation | [Scale / Circuit break] | [time] |

---

## Monitoring & Alerts

| Metric | Threshold | Alert Channel |
|--------|-----------|---------------|
| Error rate | > [N]% | [Slack / PagerDuty / Email] |
| Response time (p99) | > [N]ms | [channel] |
| CPU utilization | > [N]% | [channel] |
| Memory utilization | > [N]% | [channel] |

---

## Generated Pipeline

The CI/CD pipeline configuration is generated from `.jumpstart/templates/ci-cd.yml`. Customize it based on the architecture choices in `specs/architecture.md`.

---

## Phase Gate Approval

- [ ] Pipeline stages defined and documented
- [ ] Environment variables catalogued
- [ ] Secrets stored securely (never in source)
- [ ] Rollback plan tested
- [ ] Monitoring and alerting configured

**Approved by:** Pending
**Approval date:** Pending
