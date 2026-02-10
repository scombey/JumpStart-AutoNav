---
id: metrics
phase: 1
agent: analyst
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - specs/product-brief.md
  - specs/prd.md
dependencies:
  - product-brief
risk_level: medium
owners: []
sha256: ""
---

# Success Metrics

> **Measurable outcomes and KPIs for the product**

## Purpose

Every product must define measurable success criteria. Each epic should have at least one metric tied to a business outcome. Metrics without baselines, targets, and measurement methods are considered incomplete.

---

## 1. North Star Metric

| Attribute | Value |
|---|---|
| **Metric** | {{The single metric that best captures product value}} |
| **Current Baseline** | {{Current value, or "N/A" if new}} |
| **Target** | {{Target value within timeframe}} |
| **Timeframe** | {{e.g., 6 months post-launch}} |
| **Measurement** | {{How it's measured — tool, query, survey}} |

---

## 2. Epic-Level Metrics

| Epic | Metric | Baseline | Target | Measurement | Frequency |
|---|---|---|---|---|---|
| {{E1}} | {{Metric name}} | {{Current state}} | {{Success threshold}} | {{How captured}} | {{How often}} |
| {{E2}} | {{Metric name}} | {{Baseline}} | {{Target}} | {{Method}} | {{Frequency}} |

---

## 3. User Experience Metrics

| Metric | Category | Baseline | Target | Measurement |
|---|---|---|---|---|
| {{Task completion rate}} | Usability | {{N/A}} | {{> 90%}} | {{Usability testing}} |
| {{Time to complete key task}} | Efficiency | {{N/A}} | {{< 30s}} | {{Analytics}} |
| {{User satisfaction (CSAT/NPS)}} | Satisfaction | {{N/A}} | {{CSAT > 4.0}} | {{Survey}} |
| {{Error rate}} | Reliability | {{N/A}} | {{< 1%}} | {{Error tracking}} |

---

## 4. Technical Metrics

| Metric | Category | Baseline | Target | Measurement |
|---|---|---|---|---|
| {{Response time (p95)}} | Performance | {{N/A}} | {{< 200ms}} | {{APM tool}} |
| {{Uptime}} | Availability | {{N/A}} | {{99.9%}} | {{Monitoring}} |
| {{Test coverage}} | Quality | {{0%}} | {{> 80%}} | {{Coverage tool}} |
| {{Build time}} | DevEx | {{N/A}} | {{< 2min}} | {{CI pipeline}} |

---

## 5. Business Metrics

| Metric | Category | Baseline | Target | Timeframe | Measurement |
|---|---|---|---|---|---|
| {{User adoption rate}} | Growth | {{0}} | {{1000 monthly active users}} | {{6 months}} | {{Analytics}} |
| {{Feature adoption}} | Engagement | {{N/A}} | {{60% of users use key feature}} | {{3 months}} | {{Analytics}} |
| {{Cost per user}} | Economics | {{N/A}} | {{< $X/month}} | {{Ongoing}} | {{Infrastructure costs / MAU}} |

---

## 6. Metric Dependencies

| Metric | Depends On | Required Infrastructure |
|---|---|---|
| {{Metric name}} | {{What must exist for measurement}} | {{Analytics tool, logging, monitoring}} |

---

## 7. Measurement Readiness

| Metric | Infrastructure Ready | Data Source | Owner | Status |
|---|---|---|---|---|
| {{Metric}} | Yes / No | {{Where data comes from}} | {{Who monitors}} | Ready / Needs Setup / Blocked |

---

## Validation Rules

1. Every epic MUST have at least one measurable metric
2. Every metric MUST have a target value (not just a direction like "improve")
3. Every metric MUST have a measurement method
4. Business metrics MUST have a timeframe
5. Metrics without baselines must note "N/A — new metric, baseline TBD"

---

## Linked Data

```json-ld
{
  "@context": { "js": "https://jumpstart.dev/schema/" },
  "@type": "js:SpecArtifact",
  "@id": "js:metrics",
  "js:phase": 1,
  "js:agent": "Analyst",
  "js:status": "[STATUS]",
  "js:version": "[VERSION]",
  "js:upstream": [
    { "@id": "js:product-brief" }
  ],
  "js:downstream": [
    { "@id": "js:prd" }
  ],
  "js:traces": []
}
```
