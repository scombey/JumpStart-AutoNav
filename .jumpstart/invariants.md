# Environment Invariants

> **Purpose:** Non-negotiable rules that must be enforced across all phases. These are "roadmapal invariants" — they cannot be waived by any agent.
> **Enforcement:** Checked by `bin/lib/invariants-check.js` during Phase 3 (Architecture) and Phase 4 (Build) gates.
> **Authority:** Only the human operator can add, modify, or remove invariants.

---

## About Invariants

Invariants are environment-level, domain-level, or compliance-level rules that apply regardless of what is being built. They represent non-negotiable constraints such as:

- Security baselines (encryption, authentication)
- Compliance requirements (GDPR, HIPAA, SOC2)
- Infrastructure standards (logging, monitoring)
- Code quality floors (test coverage, linting)

Unlike the Roadmap (which governs agent behavior), invariants govern the **system being built**.

---

## Invariant Registry

| ID | Name | Category | Requirement | Verification |
|----|------|----------|-------------|--------------|
| INV-001 | Encryption at Rest | Security | All persistent data stores must use encryption at rest | Architecture review: verify storage encryption is specified |
| INV-002 | Encryption in Transit | Security | All network communication must use TLS 1.2+ | Architecture review: verify TLS in API contracts and deployment |
| INV-003 | Authentication Required | Security | All user-facing endpoints must require authentication (except explicitly public routes) | Implementation plan: verify auth middleware in task descriptions |
| INV-004 | Audit Logging | Compliance | All state-changing operations must produce audit log entries | Architecture review: verify logging component exists |
| INV-005 | Input Validation | Security | All external inputs must be validated at system boundaries | Implementation plan: verify validation in API endpoint tasks |
| INV-006 | Error Handling | Reliability | No unhandled exceptions in production; errors must be caught, logged, and return safe responses | Code review: verify error handling patterns |
| INV-007 | Dependency Pinning | Maintainability | All dependencies must use pinned or locked versions (lockfile required) | Scaffolding task: verify lockfile generation |
| INV-008 | Test Coverage Floor | Quality | All code paths with acceptance criteria must have at least one test | Phase 4 gate: verify test mapping |

---

## How to Add Invariants

1. Add a new row to the registry table above
2. Use sequential ID numbering (INV-NNN)
3. Specify a concrete verification method
4. Invariants take effect immediately for all subsequent phases

---

## Enforcement Points

| Phase | Enforcement |
|-------|-------------|
| Phase 3 (Architect) | Architecture must address all invariants. `invariants-check` validates coverage. |
| Phase 4 (Developer) | Implementation must satisfy invariant requirements. Tests must verify compliance. |
| Phase Gate | Invariant compliance is a prerequisite for phase approval. |

---

## Domain-Specific Invariants

When `project.domain` is set in `.jumpstart/config.yaml`, additional domain-specific invariants may apply. Consult `.jumpstart/domain-complexity.csv` for domain-specific requirements.

| Domain | Additional Invariants |
|--------|--------------------|
| healthcare | HIPAA data handling, PHI encryption, access audit trail |
| fintech | PCI-DSS compliance, transaction logging, fraud detection hooks |
| govtech | FedRAMP baseline, accessibility (WCAG 2.1 AA), data residency |

---

**Version:** 1.0.0 | **Last Updated:** [DATE]
