# [Artifact Name] -- Insights Log

> **Phase:** [0-4] -- [Phase Name]
> **Agent:** [Agent Name]
> **Parent Artifact:** [`specs/[artifact-name].md`](../[artifact-name].md)
> **Created:** [DATE]
> **Last Updated:** [DATE]

---

## About This Document

This is a **living insights log** that captures your thinking, observations, and decision-making process as you work through your protocol steps. Think of this as your working notebook—a place to record what you notice, what puzzles you, what patterns emerge, and what choices you make along the way.

**This is not a formal deliverable.** It's a trace of your reasoning that helps humans understand:
- What led to specific decisions in the parent artifact
- What questions or uncertainties you encountered
- What alternatives you considered and why you chose what you did
- What patterns or risks emerged during your investigation

**Update this document naturally as you work**, not just at the end. Add entries when something noteworthy happens—a realization, a decision point, an unexpected finding, a question that needs tracking.

**Keep entries conversational and human-readable.** No need for rigid formatting—write in a way that feels natural to you as an agent. Use whatever structure helps you think clearly.

---

## How to Use This Template

### Entry Types

You can record different kinds of insights. Here are some common types, but don't feel constrained by these categories:

**🔍 Observations** -- Patterns, surprises, or notable findings during your investigation

**❓ Questions** -- Open questions that need resolution or tracking

**💡 Decisions** -- Choices you made and the reasoning behind them

**⚠️ Risks & Concerns** -- Potential issues, trade-offs, or things to watch out for

**🎯 Assumptions** -- Things you're taking for granted (that might need validation)

**🔗 Connections** -- Links between different pieces of information or artifacts

**📊 Evidence** -- Data points, quotes, or feedback that informed your thinking

### Cross-Referencing

When an insight relates to a specific section of the parent artifact, link to it:

```markdown
→ See [Problem Statement](../challenger-brief.md#reframed-problem-statement)
→ Related to [User Persona 2](../product-brief.md#user-personas)
→ Influences [Architecture Decision 003](../decisions/003-api-design.md)
```

### Timestamps

**REQUIRED:** Every insight entry MUST include an ISO 8601 UTC timestamp (e.g., `2026-02-08T14:23:00Z`). Timestamps are validated by `bin/lib/timestamps.js`. Use the standardised insight entry format from `.jumpstart/templates/insight-entry.md` for consistent structure across all insight logs.

Add timestamps for every entry:

```markdown
**Timestamp:** 2026-02-07T14:23:00Z
```

---

## Session Context

> [Optional: Brief note about where you are in your protocol when starting this log. For example: "Beginning Step 3: Stakeholder Mapping" or "Mid-way through user research synthesis"]

---

## Insights

> **Entry Format:** Use the standardised format from `.jumpstart/templates/insight-entry.md` for each entry below. Every entry must include: Timestamp (ISO 8601 UTC), Type, Confidence, Source, and Cross-References.

### [Entry Title or Brief Description]

**Type:** [Observation / Decision / Question / Risk / etc.]

**Context:** [What section of your work or protocol step is this related to?]

[Your insight content -- write naturally, explain your thinking, note what's interesting or important]

**Cross-references:**
- [Link to relevant section of parent artifact or related artifact]

---

### [Another Entry]

**Type:** [Type]

[Content...]

---

## Working Notes

> [Optional section for quick scratchpad notes, reminders, or things to circle back to. Less formal than entries above.]

- [ ] Need to verify assumption about user technical skill level
- [ ] Consider alternative framing noted in conversation
- [ ] Check if stakeholder X should be elevated to primary persona

---

## Examples from Various Phases

Below are examples of what insights might look like in different phases. **Delete this section** when creating actual insight logs.

---

### Example: Phase 0 (Challenger)

#### Unexpected Assumption in Problem Statement

**Type:** Observation

**Context:** Step 2: Surfacing Assumptions

During assumption surfacing, the human initially framed the problem as "developers waste time writing boilerplate code." When I asked about frequency and impact, they revealed this happens primarily during project setup (~5 hours once per project), not throughout development as I initially assumed.

This realization shifted the problem from "ongoing inefficiency" to "high-friction project initialization." The scope and solution implications are very different.

**Cross-references:**
- [Assumption #3](../challenger-brief.md#assumptions-identified) captured this shift
- [Reframed Problem Statement](../challenger-brief.md#reframed-problem-statement) now focuses on "project setup friction"

---

#### Why-Chain Branching Point

**Type:** Decision

**Context:** Step 3: Five Whys

At Why 3, the conversation branched: one path led to "lack of standardized templates" (a tooling problem), the other to "fear of committing to architecture too early" (a psychological/organizational problem).

The human chose to follow the organizational path, which revealed that the root issue is about decision confidence, not tooling. This fundamentally changes what solution space we should explore in later phases.

I noted the tooling branch as "Alternative thread" in the brief—it might resurface during architecture phase.

**Cross-references:**
- [Root Cause Analysis](../challenger-brief.md#root-cause-analysis-five-whys)

---

### Example: Phase 1 (Analyst)

#### Missing Persona Emerged Mid-Research

**Type:** Observation

**Context:** Step 4: User Research Synthesis

While synthesizing interview notes (simulated), I noticed a third distinct behavioral pattern that doesn't fit Persona 1 (Solo Dev) or Persona 2 (Team Lead). There's a "Platform Engineer" profile that cares less about project setup speed and more about enforcement of company standards.

This persona has inverse priorities: they *want* more friction at setup to ensure compliance. Including them changes the requirements—solution needs configuration/policy layer, not just speed.

**Cross-references:**
- Added as [Persona 3: Platform Engineer](../product-brief.md#user-personas)
- Impacts [Feature Priority](../product-brief.md#feature-prioritization)—audit/compliance features elevated

---

#### Competitive Analysis Gap

**Type:** Question

**Context:** Step 5: Competitive Landscape

All identified competitors (Yeoman, create-react-app, cookiecutter) focus on template delivery. None have built-in decision guidance or "why am I being asked this?" explanations.

This could be a meaningful differentiation point—not just templates, but *opinionated scaffolding with rationale*. But need to validate: do users actually want explanation, or do they just want fast?

Noted as open question for PM phase to address with proposed value prop testing.

**Cross-references:**
- [Competitive Analysis](../product-brief.md#competitive-landscape)

---

### Example: Phase 2 (PM)

#### Feature Scope Trade-off

**Type:** Decision

**Context:** Step 6: User Stories & Acceptance Criteria

Initially drafted 23 user stories across all three personas. Applying MoSCoW prioritization, only 8 were Must-Have for MVP. The remaining 15 included a lot of "customization" and "advanced configuration" stories.

Decision: defer all advanced customization to v2. MVP will be opinionated by default. Rationale:
1. Matches Phase 0 insight: users want *speed*, not *flexibility*
2. Platform Engineer persona (compliance focus) can be served with post-setup auditing in v2
3. Reduces implementation complexity by ~40% (Architect estimate)

Trade-off acknowledged: loses Platform Engineer as primary MVP audience. They become secondary (can still use, but won't get custom policy enforcement).

**Cross-references:**
- [MVP Scope](../prd.md#mvp-scope)
- [Persona 3 deprioritized rationale](../prd.md#out-of-scope)

---

#### Success Metric Ambiguity

**Type:** Risk

**Context:** Step 8: Success Metrics

Proposed metric: "80% of projects created with tool are still active after 30 days."

Problem: "active" is vague. Active in what sense? Commits? Deploys? Team still exists? This metric sounds good but is hard to measure and might not correlate with actual value delivered.

Alternative: "Users report 50% reduction in setup time" (survey-based, direct). Suggested we use both: time saved (short-term) and project longevity (long-term quality signal).

**Cross-references:**
- [Success Metrics](../prd.md#success-metrics)—now includes both

---

### Example: Phase 3 (Architect)

#### Database Choice Debate

**Type:** Decision

**Context:** Step 3: Component Design

Three options considered for storing project templates:
1. Static files in repo (simple, version-controlled)
2. Database (dynamic, allows runtime template additions)
3. Plugin system (extensible, community-driven)

Decision: Static files for MVP, with plugin hooks designed but not implemented.

Reasoning:
- Requirements (from PRD) show 5 core templates needed, no runtime additions
- Database adds operational complexity (hosting, migrations, backups)
- Plugin system is over-engineering until we validate community interest
- Static files get us to MVP fastest; can migrate to DB later if template count grows beyond ~20

Trade-off: Hard to add community-contributed templates without code changes. Acceptable for MVP.

**Cross-references:**
- [Architecture Decision Record 004](../decisions/004-template-storage.md)
- [Component: Template Engine](../architecture.md#component-template-engine)

---

#### Non-Functional Requirement Tension

**Type:** Risk

**Context:** Step 5: Cross-Cutting Concerns (Performance)

PRD states "Template scaffolding completes in <10 seconds for typical project."

During architecture design, I realized Node.js fs operations + file copying for a 50+ file template can easily hit 8-12 seconds on slower hardware. We're close to the edge, and that's before adding any "smart" features (validation, post-processing, etc.).

Options:
1. Parallelize file writes (gains 20-30% speed)
2. Stream instead of buffer large files (helps with memory, not speed)
3. Challenge the 10-second requirement with PM (maybe 15s is acceptable?)

Chose #1 + note to revisit in developer phase. Flagged as performance testing requirement in implementation plan.

**Cross-references:**
- [Performance Requirements](../architecture.md#non-functional-requirements)
- [Implementation Task: Optimize File I/O](../implementation-plan.md#phase-1-tasks)

---

### Example: Phase 4 (Developer)

#### Test Coverage Gap Discovered

**Type:** Observation

**Context:** Implementing feature: "Template variable substitution"

While writing unit tests, I noticed the architecture spec assumes all template variables will be alphanumeric identifiers (`{{projectName}}`). But what if a user wants to include special characters in a variable value? Or multi-line strings?

Current implementation doesn't escape or validate. This could break templating or inject unintended code.

Added test cases for edge cases. Also flagged as potential security consideration—if templates allow arbitrary injection, that's a risk.

**Cross-references:**
- [Test: Template Variable Edge Cases](tests/template-engine.test.js#L127)
- Issue created: #42 "Validate template variable escaping"

---

#### Refactor Decision

**Type:** Decision

**Context:** Implementing component: CLI argument parser

Original implementation plan specified using `yargs` library. During implementation, I noticed all our arg parsing is extremely simple (2-3 flags, no complex validation).

Decision: use native Node.js `process.argv` parsing with simple regex, skip `yargs` dependency.

Reasoning:
- Reduces bundle size by 400KB
- Eliminates 1 external dependency (fewer supply chain risks)
- Our use case doesn't need yargs' features (nested commands, auto-help generation)

Trade-off: if we expand CLI to 10+ commands later, we might regret this. For MVP, correct choice.

**Cross-references:**
- [Implementation: CLI module](src/cli.js)
- [Dependency Justification](../architecture.md#external-dependencies)—updated to remove yargs

---

## Tips for Effective Insights

1. **Write for future you (and future readers).** Assume someone reading this in 6 months won't remember the context. Explain why something mattered.

2. **Capture the "why" of decisions.** What alternatives did you consider? What tipped the balance?

3. **Note surprises and pattern shifts.** When something challenges your initial mental model, record it.

4. **Track open loops.** Questions you can't resolve yet, assumptions you're making that need validation later.

5. **Link liberally.** Connect insights to the artifacts they inform. Makes it easier to trace decisions back to their origins.

6. **Don't overthink it.** This isn't a formal document. Speed and honesty > polish and completeness.

---

## End of Template

**When creating an actual insights log, delete everything from "Examples from Various Phases" onward, and start adding your own insights as you work.**
