---
id: nfrs
phase: advisory
agent: performance
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - prd
  - architecture
dependencies: []
risk_level: medium
owners: []
sha256: ""
---

# Non-Functional Requirements: {{Project Name}}

> **Quantified Performance, Scalability, and Operational Targets**

## Metadata

| Field | Value |
|---|---|
| Project | {{Project Name}} |
| Performance Analyst | AI Performance Agent |
| Date | {{Date}} |
| PRD Reference | `specs/prd.md` |
| Architecture Reference | `specs/architecture.md` |

---

## 1. Performance SLAs

| NFR ID | Metric | Target | Measurement | SLA Tier | Percentile |
|---|---|---|---|---|---|
| NFR-P01 | API response time | < {{X}}ms | Load test ({{tool}}) | Tier 1 | p95 |
| NFR-P02 | Page load time | < {{X}}s | Synthetic monitoring | Tier 1 | p95 |
| NFR-P03 | Database query time | < {{X}}ms | Query profiler | Tier 2 | p95 |
| NFR-P04 | Cold start time | < {{X}}s | Synthetic monitoring | Tier 2 | p99 |

---

## 2. Throughput Targets

| NFR ID | Metric | Target | Sustained Duration | Burst Capacity |
|---|---|---|---|---|
| NFR-T01 | Requests per second | {{N}} req/s | 15 minutes | {{2N}} req/s for 60s |
| NFR-T02 | Concurrent users | {{N}} | Steady state | {{Peak}} at spike |
| NFR-T03 | Data processing | {{N}} records/min | Batch window | — |

---

## 3. Availability and Reliability

| NFR ID | Metric | Target | Measurement Period | Allowed Downtime |
|---|---|---|---|---|
| NFR-A01 | Uptime | {{99.X}}% | Monthly | {{N}} min/month |
| NFR-A02 | Recovery time (RTO) | < {{X}} min | Per incident | — |
| NFR-A03 | Recovery point (RPO) | < {{X}} min | Per incident | — |
| NFR-A04 | Error rate | < {{X}}% | Rolling 5 min | — |

---

## 4. Load Profile

### Normal Load
- Concurrent users: {{N}}
- Request rate: {{N}} req/s
- Data volume: {{N}} records

### Peak Load
- Concurrent users: {{N}}
- Request rate: {{N}} req/s
- Trigger: {{What causes peak — time of day, event, etc.}}

### Growth Projection
| Timeframe | Users | Requests/s | Data Volume (GB) |
|---|---|---|---|
| Current | {{N}} | {{N}} | {{N}} |
| 6 months | {{N}} | {{N}} | {{N}} |
| 12 months | {{N}} | {{N}} | {{N}} |
| 24 months | {{N}} | {{N}} | {{N}} |

---

## 5. Architecture Bottleneck Analysis

| Component | Scaling Model | Risk Level | Bottleneck | Mitigation |
|---|---|---|---|---|
| {{API Server}} | Horizontal | Low | {{None identified}} | Auto-scaling |
| {{Database}} | Vertical | High | {{Connection pool}} | {{Read replicas}} |
| {{Cache}} | Horizontal | Low | {{None identified}} | {{Clustering}} |

### Critical Path

```
User Request → {{Component 1}} → {{Component 2}} → {{Component 3}} → Response
               {{X}}ms            {{X}}ms            {{X}}ms          Total: {{X}}ms
```

---

## 6. Cost Budget

| Scenario | Monthly Cost | Per-User Cost | Per-Transaction Cost |
|---|---|---|---|
| Normal load | ${{N}} | ${{N}} | ${{N}} |
| Peak load | ${{N}} | ${{N}} | ${{N}} |
| Growth (12mo) | ${{N}} | ${{N}} | ${{N}} |

### Cost Cliffs

| Trigger | Current Cost | Post-Trigger Cost | Description |
|---|---|---|---|
| {{N}} concurrent users | ${{N}}/mo | ${{N}}/mo | {{Why cost jumps — e.g., need database cluster}} |

---

## 7. Performance Test Strategy

| Test Type | Tool | Duration | Virtual Users | Success Criteria |
|---|---|---|---|---|
| Baseline | {{k6/Locust}} | 5 min | 10 | Establish metrics |
| Load | {{tool}} | 15 min | {{N}} | All SLAs met |
| Stress | {{tool}} | 30 min | Ramp to failure | Document breaking point |
| Endurance | {{tool}} | 2 hours | {{N}} | No memory leaks, stable p95 |
| Spike | {{tool}} | 10 min | 0→{{N}}→0 | Recovery < {{X}}s |

---

## Phase Gate Approval

- [ ] All PRD NFRs quantified with measurable targets
- [ ] Load profile defined (normal, peak, growth)
- [ ] Architecture bottleneck analysis completed
- [ ] Cost budget estimated
- [ ] Performance test strategy defined
- [ ] SLA tiers assigned and prioritised
- **Approved by:** Pending
- **Date:** Pending

