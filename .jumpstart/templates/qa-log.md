# Q&A Decision Log

> **Project:** [Project Name]
> **Created:** [DATE]
> **Last Updated:** [DATE]

---

## About This Document

This is a **living log of every question asked by agents and the corresponding response from the human operator**. It serves as an audit trail of decisions, preferences, and clarifications that shaped the project throughout all phases.

**Purpose:**
- **Traceability** — Link every decision back to the question that prompted it
- **Onboarding** — New team members can understand *why* decisions were made
- **Conflict resolution** — When downstream agents encounter ambiguity, they can check if it was already answered
- **Accountability** — Records who answered, when, and in what context

**All agents must append to this log whenever they ask the human a question and receive a response.** This includes questions via `ask_questions` tool, free-text clarification requests, and phase gate approval exchanges.

---

## Log Format

Each entry follows this structure:

```markdown
### Q-[NNN] | Phase [X] — [Agent Name] | [DATE]

**Context:** [Brief context for why this question was asked]

**Question:** [The exact question asked]

**Options presented (if any):**
- [ ] Option A — [description]
- [x] Option B — [description] ← Selected
- [ ] Option C — [description]

**Response:** [The human's answer, verbatim or summarized]

**Impact:** [What this answer influenced — e.g., "Determined tech stack choice", "Shaped persona priorities"]

**Referenced in:** [Link to artifact section where this decision is reflected]
```

---

## Decision Log

<!-- Agents: Append new entries below this line. Use sequential numbering (Q-001, Q-002, etc.). -->
<!-- Do NOT delete or modify previous entries. This is an append-only log. -->

