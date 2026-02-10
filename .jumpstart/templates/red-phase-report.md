---
id: red-phase-report
phase: "4"
agent: developer
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "Pending"
approval_date: ""
upstream_refs:
  - implementation-plan
  - prd
dependencies: []
risk_level: low
owners: []
sha256: ""
---

# Red Phase Report: {{Task ID}}

> **TDD Red Phase Evidence — Failing Test Capture**

## Metadata

| Field | Value |
|---|---|
| Task | {{Task ID and title}} |
| Developer | AI Developer Agent |
| Date | {{Date}} |
| Story Reference | {{E01-S01}} |
| TDD Mode | Enabled (`roadmap.test_drive_mandate: true`) |

---

## 1. Acceptance Criteria Under Test

| AC ID | Acceptance Criterion | Test File | Test Name |
|---|---|---|---|
| AC-1 | {{Acceptance criterion from PRD}} | `tests/{{file}}` | `{{test name}}` |
| AC-2 | {{Acceptance criterion}} | `tests/{{file}}` | `{{test name}}` |

---

## 2. Failing Tests (Red Phase)

### Test 1: {{Test Name}}

```
File: tests/{{test-file}}
Test: {{describe block}} > {{test name}}
```

**Test Code:**
```{{language}}
{{The actual test code written before implementation}}
```

**Failure Output:**
```
{{The exact error output when running the test}}
```

**Why This Test:**
{{Brief explanation of what user-facing behaviour this test verifies, traced back to the acceptance criterion}}

---

### Test 2: {{Test Name}}

```
File: tests/{{test-file}}
Test: {{describe block}} > {{test name}}
```

**Test Code:**
```{{language}}
{{Test code}}
```

**Failure Output:**
```
{{Error output}}
```

**Why This Test:**
{{Explanation}}

> Repeat for each test written in the Red phase.

---

## 3. Red Phase Checklist

- [ ] All acceptance criteria for this task have at least one failing test
- [ ] Tests are written BEFORE any implementation code
- [ ] Each test clearly maps to a specific acceptance criterion
- [ ] Tests verify behaviour, not implementation details
- [ ] Failure output confirms the test is detecting the right absence
- [ ] No production code was written to make tests pass (yet)

---

## 4. Green Phase Readiness

| Test | Failure Type | Implementation Needed |
|---|---|---|
| {{Test 1}} | {{TypeError / AssertionError / Module not found}} | {{What code needs to be written}} |
| {{Test 2}} | {{Failure type}} | {{What code needs to be written}} |

**Minimum implementation to pass all tests:**
{{Brief description of the simplest code that would make all tests pass}}

---

## Notes

{{Any observations about test design decisions, edge cases deferred to later tasks, or complexities discovered during test writing}}

