# Test Failure Evidence

> **Purpose:** Captures proof that tests genuinely fail _before_ implementation (Red Phase of TDD). Required when `roadmap.test_drive_mandate` is `true`.

---

## Task Reference

| Field | Value |
|-------|-------|
| **Task ID** | [M01-T01] |
| **Story ID** | [E01-S01] |
| **Description** | [Brief task description] |
| **Timestamp** | [ISO 8601 UTC] |

---

## Test File(s)

| Test File | Test Name | Framework |
|-----------|-----------|-----------|
| `tests/[path]` | [test name / describe block] | [Vitest / Jest / Pytest / etc.] |

---

## Failing Test Output

```
[Paste the exact terminal output showing the test failure here.
Must include the test runner output, assertion error message,
expected vs. actual values, and exit code.]
```

---

## Exit Code

```
Process exited with code 1
```

---

## Assertion Details

| Test | Expected | Actual | Assertion Type |
|------|----------|--------|---------------|
| [test name] | [expected value] | [actual value / undefined / throws] | [toBe / toThrow / toEqual] |

---

## Verification Checklist

- [ ] Tests were written BEFORE implementation code
- [ ] Tests fail for the RIGHT reason (not syntax errors or missing imports)
- [ ] Each test maps to a specific acceptance criterion
- [ ] Test names clearly describe the expected behavior
- [ ] Edge cases are included

---

## Notes

[Optional: Any context about the test approach, unusual setup requirements, or mock strategies.]
