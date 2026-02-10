# Needs Clarification Tag

> **Purpose:** When any agent encounters an underspecified, ambiguous, or assumption-dependent requirement, it MUST mark the passage with a `[NEEDS CLARIFICATION]` tag rather than guessing. This template defines the tagging format and resolution workflow.

---

## Tag Format

Insert the following inline marker immediately after the ambiguous text:

```
[NEEDS CLARIFICATION: <brief description of what is unclear>]
```

### Examples

```markdown
The system should respond quickly [NEEDS CLARIFICATION: Define "quickly" — target latency in ms at P95?]

Users will be notified [NEEDS CLARIFICATION: Notification channel — email, push, in-app, or all?]

The data should be encrypted [NEEDS CLARIFICATION: At rest, in transit, or both? Which algorithm/standard?]
```

---

## Rules

1. **Never guess.** If a requirement could be interpreted in more than one way, tag it.
2. **Be specific.** The tag description must state exactly what is missing or ambiguous.
3. **No silent assumptions.** If you proceed with an assumption, state it explicitly next to the tag: `[NEEDS CLARIFICATION: Assumed X — confirm or correct]`.
4. **Agents must surface tags.** When generating artifacts, list all `[NEEDS CLARIFICATION]` tags in a summary section.
5. **Resolution is human-owned.** Only the human operator can remove a tag by providing the clarification.
6. **Cascading.** If a tagged requirement flows downstream (PRD → Architecture → Tasks), the tag must be carried forward until resolved.

---

## Detection Patterns

The spec tester (`bin/lib/spec-tester.js`) flags the following "guessing language" patterns that should be replaced with `[NEEDS CLARIFICATION]` tags:

| Pattern | Why It's Risky |
|---------|---------------|
| "probably", "likely", "maybe" | Indicates uncertainty |
| "should be fine", "good enough" | Subjective judgment |
| "as needed", "as appropriate" | Undefined trigger |
| "etc.", "and so on", "among others" | Incomplete enumeration |
| "TBD", "to be determined" | Explicitly unresolved |
| "reasonable", "acceptable" | Unmeasured qualifier |

---

## Summary Section Template

At the end of any artifact containing `[NEEDS CLARIFICATION]` tags, include:

```markdown
## Open Clarifications

| # | Location | Question | Status |
|---|----------|----------|--------|
| 1 | Section X, paragraph Y | [What needs clarifying] | Open |
| 2 | Section Z | [What needs clarifying] | Resolved — [answer] |
```

---

## Integration

- **All agents** must follow this protocol (see `.jumpstart/agents/*.md` behavioral guidelines).
- **Spec Tester** detects guessing language and flags missing tags.
- **Phase gates** should not approve artifacts with unresolved `[NEEDS CLARIFICATION]` tags unless explicitly waived.
