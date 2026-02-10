# Base Roadmap (Organization-Wide Defaults)

> This file provides organization-wide default principles that project-level roadmaps inherit from. Projects can override or extend these defaults in their own `.jumpstart/roadmap.md`.

---

## Inheritance Rules

1. **Project roadmap inherits** all articles from this base unless explicitly overridden
2. **Project-level overrides win** — if a project defines the same article, the project version takes precedence
3. **Additive extensions** — projects can add new articles that don't exist in the base
4. **No silent deletion** — to disable a base article, projects must explicitly mark it `status: disabled` with a justification

---

## Base Articles

### Article B-I: Code Quality Standards

All code must pass linting with zero errors before merge. Warning thresholds are project-configurable.

### Article B-II: Documentation Requirements

Every public API, module, and configuration option must have inline documentation. README files must be kept current with implementation.

### Article B-III: Security Baseline

- No secrets in source code
- Dependencies must be scanned for known vulnerabilities
- Authentication and authorization patterns must follow organizational standards

### Article B-IV: Testing Baseline

- Unit test coverage minimum: 70%
- Integration tests required for all external service boundaries
- No merge without passing CI

### Article B-V: Specification Standards

All spec artifacts must use Jump Start templates with valid YAML frontmatter. Schema validation is required before phase gate approval.

---

## Extending This Roadmap

To override or extend in your project:

```yaml
# .jumpstart/config.yaml
template_inheritance:
  enabled: true
  base_path: ".jumpstart/base/roadmap.md"
  merge_strategy: "project-wins"
```

Use `bin/lib/template-merge.js` to resolve merged content.
