# AGENTS.md Template

> **Purpose:** Template for per-directory `AGENTS.md` files generated during greenfield projects.
> **Created by:** The Architect (Phase 3) and The Developer (Phase 4)
> **Updated by:** The Developer after each milestone

---

## Template

The following template should be adapted for each directory. Not all sections apply to every directory — omit sections that are not relevant (e.g., a `utils/` directory may not have a "Public API" section).

```markdown
# [Directory Name]

## Module Purpose

[1-3 sentences describing what this directory/module does and its role in the overall system. Reference the Architecture Document component it belongs to.]

## Public API / Exports

[List the key interfaces, functions, classes, or types that this module exposes to other parts of the system. For internal-only modules, describe what is consumed by sibling or parent modules.]

| Export | Type | Description |
|--------|------|-------------|
| `[name]` | [function / class / interface / type / constant] | [What it does and when to use it] |

## Dependencies

### Internal
- `[module-path]` — [What is imported and why]

### External
- `[package-name]` — [What it provides to this module]

## Patterns and Conventions

- **File naming:** [Convention used in this directory, e.g., kebab-case, PascalCase]
- **Error handling:** [How errors are handled in this module]
- **Testing:** [Test file location and naming convention for this module]
- **[Other relevant pattern]:** [Description]

## AI Agent Guidelines

> Rules for AI coding agents working in this directory.

- [DO: Follow the established patterns visible in existing files]
- [DO: Write tests for new functionality following the test conventions above]
- [DO: Use the module's error handling pattern consistently]
- [DON'T: Import from peer modules except through their public API]
- [DON'T: Add new external dependencies without checking the Architecture Document]
- [DON'T: Modify the public API without updating this file and consumers]

## Key Files

| File | Purpose |
|------|---------|
| `[filename]` | [Brief description of what this file does] |
```

---

## Usage Guidelines

### When to Create

- **Architect (Phase 3):** Define which directories will receive `AGENTS.md` files in the architecture document's Project Structure section. Include initial `AGENTS.md` creation tasks in the implementation plan.
- **Developer (Phase 4):** Create `AGENTS.md` files during project scaffolding (Step 2) and update them after each milestone as module APIs and patterns solidify.

### Depth Configuration

The `agents.developer.agents_md_depth` config setting controls which directories get `AGENTS.md` files:

- **`all`**: Every directory containing source code gets an `AGENTS.md`
- **`module`**: Major module directories (e.g., `src/api/`, `src/services/`, `src/models/`) — directories that represent a distinct functional area
- **`top-level`**: Only top-level directories directly under the source root (e.g., `src/`)
- **`2`, `3`, etc.**: Numeric depth limit measured from the source root directory

### When to Update

Update an `AGENTS.md` file when:
- A new public export is added to or removed from the module
- The module's error handling or testing patterns change
- New AI-relevant guidelines are discovered during implementation
- Dependencies (internal or external) change significantly
- After each milestone verification (Developer Step 4)

### Quality Standards

- Keep `AGENTS.md` files concise and actionable — they are working documents, not documentation novels
- Focus on information that an AI coding agent would need to work effectively in this directory
- Ensure the "AI Agent Guidelines" section contains specific, actionable rules (not generic advice)
- Update the "Key Files" section to reflect the current state of the directory
