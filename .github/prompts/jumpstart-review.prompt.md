---
description: "Validate current Jump Start artifacts against their templates and gate criteria"
agent: agent
---

# Jump Start Artifact Review

Determine the current phase by reading `.jumpstart/config.yaml` and checking which spec files exist.

For the most recent phase's artifact(s):

1. Read the artifact file from `specs/`.
2. Read the corresponding template from `.jumpstart/templates/`.
3. Compare them section by section. Identify:
   - Missing sections that exist in the template but not the artifact
   - Empty or placeholder fields (still containing `[bracket placeholders]`)
   - Sections with insufficient content (e.g., a table with only the header row)
4. Check the Phase Gate Approval section for unchecked items.
5. For Phase 2 (PRD): verify every Must Have story has at least 2 acceptance criteria.
6. For Phase 3 (Architecture): verify every tech choice has a justification and every PRD story maps to an implementation task.
7. For brownfield projects: verify `specs/codebase-context.md` exists and is approved before any other artifact. Check that brownfield-specific sections (existing system constraints, migration considerations) are addressed in downstream artifacts.
8. For greenfield projects in Phase 3: verify the implementation plan includes `[D]` documentation tasks for per-directory `AGENTS.md` files.

Report findings with specific guidance on what needs to be fixed before the artifact can be approved.
