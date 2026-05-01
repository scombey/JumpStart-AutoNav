---
id: "adr-014"
phase: 3
agent: Architect
status: Accepted
created: "2026-05-01"
updated: "2026-05-01"
version: "1.0.0"
approved_by: "Samuel Combey"
approval_date: "2026-05-01"
upstream_refs:
  - specs/decisions/adr-008-npm-publish-rights-semver-cve.md
  - specs/architecture.md
dependencies:
  - adr-008
risk_level: low
owners:
  - Samuel Combey
sha256: null
---

# ADR-014: Post-2.0 Semver Discipline — Steady-State Release Policy

> **Status:** Accepted · **Date:** 2026-05-01 · **Decision Maker:** The Architect

---

## Context

ADR-008 §Semver discipline pinned the strangler-phase release cadence: **minor-per-milestone-batch** during the M2–M8 port (1.2.0 through 1.8.0), with patches reserved for hotfixes. That rule was tied to the migration narrative — each minor release marked a cluster of modules ported.

The strangler-fig migration is complete (M11, 2026-05-01). The 1.x line is frozen at 1.1.14 + security patches; the 2.0 line is the canonical surface. The "minor-per-batch" rule has nothing left to drive — there are no more port batches.

This ADR pins the **steady-state** policy for the 2.x line and beyond. It supersedes ADR-008's strangler-phase semver rule without retracting it (ADR-008 remains the historical record of how 1.x was released).

---

## Decision

### Standard semver (semver.org 2.0.0)

The 2.x line follows standard semver mechanically:

| Bump | Trigger |
|------|---------|
| **Patch** (2.0.x) | Bug fixes, internal refactors, dependency updates, doc-only changes — no externally-visible surface change. |
| **Minor** (2.x.0) | Backwards-compatible additions: new CLI subcommands, new lib exports, new optional config keys, new optional CLI flags. |
| **Major** (3.0.0) | Breaking changes (see §Breaking-change taxonomy below). |

Each release ships from `main` after CI green; pre-releases (e.g. `2.1.0-rc.1`) gate on the `next` dist-tag for ≥ 7 days before promotion to `latest`.

### Breaking-change taxonomy (what triggers a major)

A change is **breaking** (and must wait for a major) if any of these are true:

1. **CLI surface change** — a subcommand is renamed, removed, or moved; a positional arg is added/removed/reordered; an existing `--flag`'s default value changes its observable behavior.
2. **Library export change** — a function is removed, renamed, or has its signature reshaped (parameter added/removed/reordered, return type narrowed, error contract changed).
3. **IPC envelope shape change** — v0 or v1 envelope shape mutates beyond the additive evolution allowed by ADR-007. (Adding a new optional field to the v1 envelope is NOT breaking; renaming `result` to `output` is.)
4. **Config schema change** — a config key is renamed, removed, or its accepted value-type narrowed; a previously-optional key becomes required.
5. **Node engine floor bump** — `engines.node` floor moves up (e.g., 24 → 26). The Node project's own LTS cadence sets the natural cycle here.
6. **State-file format change** — `.jumpstart/state/*.json` schemas evolve in a way that an older binary cannot read newer state without conversion (or vice versa).
7. **Marketplace registry contract change** — the registry index shape, item manifest shape, or download protocol changes incompatibly. (Adding new optional fields is NOT breaking.)

**Not breaking** (these stay patch/minor):
- Bug fixes that align observed behavior with documented behavior.
- Performance improvements with identical observable output.
- Internal refactors, comment cleanup, doc edits.
- New optional CLI flags, new optional lib parameters with defaults, new optional config keys.
- New CLI subcommands (additive minor).
- New lib exports (additive minor).

### Pre-release + dist-tag policy

- **`next`** — pre-release line for the upcoming 2.x.0 minor or 3.0.0 major. Format: `2.1.0-rc.1`, `2.1.0-rc.2`, `3.0.0-rc.1`. Soak window ≥ 7 days for minor RCs, ≥ 14 days for major RCs (per ADR-008's RC-soak precedent on 2.0.0-rc.1).
- **`latest`** — current stable release. Promoted from `next` after the soak window completes with zero filed regressions.
- **`1.x`** — frozen 1.x line; receives security patches only per ADR-008's CVE SLA.

### Versioning of internal modules vs the package

The package version is the **only** semver number visible to consumers. Individual `src/lib/*` modules do not version independently — they all ship as part of the package's public surface map (`exports` field in `package.json`). A breaking change to any single exported module triggers a package-level major.

This is the inverse of the strangler-phase question ("patch-per-module vs minor-per-batch"). The answer in steady state: **neither — package-level only**.

### Conventional Commits + commit message contract

Every commit on `main` should follow Conventional Commits prefix:

| Prefix | Triggers |
|--------|----------|
| `fix:` | Patch (2.0.x) |
| `feat:` | Minor (2.x.0) |
| `BREAKING CHANGE:` (footer) or `feat!:` / `fix!:` | Major (3.0.0) |
| `chore:` / `docs:` / `test:` / `refactor:` / `style:` / `ci:` / `perf:` | No version bump (rolled into next release; `perf:` may bump minor if observable) |

The `BREAKING CHANGE:` footer is the load-bearing signal — semantic-release-shaped tooling reads it as the authoritative trigger. The PR template's "Behavior-change posture" section enforces an explicit choice; CI does not yet auto-bump versions, but the commit-message convention is in place so we can add semantic-release later without retroactive history rewrites.

### CHANGELOG.md cadence

Each release gets one section in `CHANGELOG.md` (Keep a Changelog format). Patch releases collapse multiple `fix:` commits into a single bulleted summary; minor releases enumerate the new features; majors call out every breaking change with migration guidance.

---

## Consequences

### Positive
- Standard semver = zero surprise for consumers familiar with the npm ecosystem.
- Breaking-change taxonomy gives reviewers a checklist when evaluating "is this PR major-significant?"
- Conventional Commits unlocks future automation (semantic-release, conventional-changelog) without retroactive rework.
- Dist-tag policy with explicit soak windows is the same shape that 2.0.0-rc.1 already follows.

### Negative
- The "package-level only versioning" rule means a single broken export forces a package major even if 99% of consumers don't use that export. Mitigation: deprecation notices in JSDoc + a minor release before removal in the next major.
- Conventional Commits are advisory until semantic-release lands; a `fix:`-tagged commit that's actually breaking would slip past CI today. Mitigation: PR template's "Behavior-change posture" checkbox + reviewer manual gate.

### Neutral
- This ADR does not prescribe a release cadence (weekly, monthly, etc.). Releases ship when work is done; the dist-tag soak window is the only timing rule.

---

## Alternatives Considered

### Continue ADR-008's "minor-per-batch" rule into 2.x
- **Description:** Group post-2.0 work into batches; each batch ships as a minor.
- **Pros:** Continuity with the strangler-phase narrative.
- **Cons:** No batches exist post-migration. The rule was tied to "M2 ported, M3 ported, …" — there's no analogous structure for steady-state work.
- **Reason Rejected:** Vestigial. The rule outlived its driver.

### Calendar-based releases (e.g., monthly)
- **Description:** Ship a minor on the first of every month, regardless of changes.
- **Pros:** Predictable cadence for consumers.
- **Cons:** Forces empty releases or stalls real fixes for arbitrary calendar reasons.
- **Reason Rejected:** Solo+AI-paced work doesn't fit a fixed cadence.

### Per-module independent versioning (monorepo-style)
- **Description:** Each `src/lib/*` module has its own `version` and ships as a separate npm subpackage.
- **Pros:** Granular consumer control; "I only use the timestamps lib, I don't care about ceremony changes."
- **Cons:** 100+ subpackage publishes per release; coordination matrix; consumer install complexity. The actual usage pattern is "install jumpstart-mode and use the CLI" — module-level versioning would be ceremony for a use case nobody has.
- **Reason Rejected:** Premature subdivision. Revisit if/when downstream consumers ask for it.

### Drop semver, use date-based versions (`2026.05.01`)
- **Description:** Calver instead of semver.
- **Pros:** No ambiguity about "is this breaking" — just the date.
- **Cons:** Loses the patch/minor/major communication channel that consumers rely on for upgrade decisions. npm tooling assumes semver.
- **Reason Rejected:** Semver carries useful information; calver throws it away.

---

## References

- [specs/decisions/adr-008-npm-publish-rights-semver-cve.md](./adr-008-npm-publish-rights-semver-cve.md) — superseded by this ADR for steady-state; ADR-008 remains authoritative for the 1.x strangler-phase line.
- [specs/decisions/adr-007-ipc-envelope-versioning.md](./adr-007-ipc-envelope-versioning.md) — IPC envelope additive-evolution rules referenced in §Breaking-change taxonomy.
- [docs/upgrade-to-2.0.md](../../docs/upgrade-to-2.0.md) — consumer-facing upgrade guide; this ADR governs how future upgrade guides are versioned.
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
