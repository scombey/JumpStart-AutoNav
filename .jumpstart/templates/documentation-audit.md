# Documentation Freshness Audit

> **Phase:** 3 -- Solutioning (required sub-step)
> **Agent:** The Architect
> **Status:** Draft
> **Created:** [DATE]
> **Upstream Reference:** [specs/research/research.md](../research/research.md) (if available)

---

## About This Audit

This audit ensures that every external technology referenced in the architecture is backed by **live, verified documentation** fetched via Context7 MCP — not stale training data. The Architect must complete this audit before Phase 3 approval.

---

## Technology Registry

Enumerate every external library, framework, CLI tool, or service referenced in the architecture:

| # | Technology | Version | Context7 Library ID | Docs Fetched | Citation Marker | Status |
|---|-----------|---------|---------------------|--------------|-----------------|--------|
| 1 | [e.g., Next.js] | [e.g., 14.x] | [e.g., /vercel/next.js] | Yes / No | `[Context7: next.js@14]` | Verified / Unverified / Unavailable |
| 2 | [e.g., Prisma] | [e.g., 5.x] | [e.g., /prisma/prisma] | Yes / No | `[Context7: prisma@5]` | |
| 3 | [e.g., Tailwind CSS] | [e.g., 3.x] | | | | |

---

## Audit Protocol

> **Reference:** See `.jumpstart/guides/context7-usage.md` for complete Context7 MCP calling instructions.

For each technology in the registry:

1. **Resolve** the Context7 library ID using `mcp_context7_resolve-library-id`:
   - `libraryName` (required): The technology name (e.g., "nextjs", "prisma")
   - `query` (required): Your specific question (e.g., "setup and configuration")
2. **Fetch** current documentation using `mcp_context7_query-docs`:
   - `libraryId` (required): The resolved ID (e.g., `/vercel/next.js`)
   - `query` (required): Topics relevant to your usage (setup, configuration, API, breaking changes)
3. **Verify** that the version referenced in the Architecture Document matches the latest stable version (or document why an older version is chosen)
4. **Record** a citation marker in the Architecture Document next to each technology reference
5. **Flag** any breaking changes between the version in use and the latest version

---

## Verification Results

### Verified Technologies

[List technologies where Context7 docs were successfully fetched and version was confirmed]

- **[Technology]** — v[X.Y.Z] confirmed via Context7. No breaking changes from documented version. `[Context7: lib@version]`

### Unverified Technologies

[List technologies where Context7 docs could not be fetched or version could not be confirmed]

- **[Technology]** — Context7 library not found. Falling back to: [official docs URL]. Manual verification required.

### Breaking Change Alerts

[List any technologies where Context7 revealed breaking changes affecting the architecture]

- **[Technology]** — Breaking change in v[X]: [description]. Architecture impact: [how this affects the design]. Mitigation: [what to do].

---

## Freshness Score

| Metric | Value |
|--------|-------|
| Total technologies referenced | [N] |
| Verified via Context7 | [N] |
| Manually verified | [N] |
| Unverified | [N] |
| **Freshness Score** | [N]% |

**Threshold:** Architecture approval requires a freshness score of ≥ 80%. Technologies that cannot be verified via Context7 must be manually verified with a documented source URL.

---

## Sign-off

- [ ] All "Must Have" technologies have been verified
- [ ] Breaking change alerts have been reviewed and mitigated
- [ ] Citation markers are embedded in the Architecture Document
- [ ] Freshness score meets the ≥ 80% threshold
