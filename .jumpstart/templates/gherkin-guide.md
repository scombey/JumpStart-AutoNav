# Gherkin Acceptance Criteria Guide

> **Purpose:** All acceptance criteria in user stories MUST use the Given/When/Then (GWT) format. This guide provides the structure, rules, and examples for writing Gherkin-style acceptance criteria.

---

## Format

```gherkin
Given [precondition / initial context]
When  [action / event]
Then  [expected outcome / observable result]
```

### Optional Clauses

```gherkin
Given [precondition]
  And [additional precondition]
When  [action]
  And [additional action]
Then  [expected outcome]
  And [additional outcome]
  But [negative outcome that must NOT occur]
```

---

## Rules

1. **One scenario per acceptance criterion.** Do not combine unrelated behaviors.
2. **Given** describes the system state _before_ the action. Use past tense or present state.
3. **When** describes exactly _one_ user action or system event. Use present tense.
4. **Then** describes the _observable_ outcome. Must be verifiable (no vague adjectives).
5. **And/But** extend the preceding clause. Use sparingly — prefer separate scenarios for clarity.
6. **No implementation details.** Focus on _what_, not _how_.
7. **Every `Then` must be testable.** If you can't write an assertion, rewrite the criterion.

---

## Examples

### Good

```gherkin
Given the user is logged in
  And the user has items in their cart
When  the user clicks "Checkout"
Then  the order summary page is displayed
  And the total reflects the cart contents including tax
```

### Bad (vague, untestable)

```
When the user checks out, the experience should be seamless and fast.
```

### Bad (implementation leak)

```
Given the React component renders with props { items: [...] }
When  setState is called with { checkout: true }
Then  the Redux store dispatches ORDER_CREATED
```

---

## Scenario Outline (parameterized)

Use `Scenario Outline` when the same behavior applies to multiple inputs:

```gherkin
Scenario Outline: Password validation
  Given the user is on the registration page
  When  the user enters a password of length <length>
  Then  the validation message shows "<message>"

  Examples:
    | length | message                          |
    | 3      | Password must be at least 8 chars |
    | 8      | Password accepted                 |
    | 100    | Password accepted                 |
```

---

## Checklist for PM Agent

- [ ] Every user story has at least one GWT acceptance criterion
- [ ] No criterion uses vague language (fast, easy, seamless, etc.)
- [ ] Each `Then` is directly testable with an assertion
- [ ] Scenarios are independent — no implicit ordering
- [ ] Edge cases have dedicated scenarios
- [ ] Error paths have dedicated scenarios
- [ ] No implementation details leak into criteria

---

## Integration

- **PM Agent** must enforce GWT format when writing user stories in the PRD.
- **Spec Tester** (`bin/lib/spec-tester.js`) validates that acceptance criteria follow this format.
- **Developer Agent** uses GWT criteria to derive test cases in Phase 4.

---

## References

- [Cucumber Gherkin Reference](https://cucumber.io/docs/gherkin/reference/)
- `.jumpstart/templates/prd.md` — User Stories section
- `bin/lib/spec-tester.js` — Automated GWT validation
