---
description: "Show the current state of the Jump Start workflow"
agent: agent
---

# Jump Start Status Check

Read `.jumpstart/config.yaml` and check which spec files exist and their approval status. Report the results in this format:

First, check `project.type` in config. Display it as **Project Type: greenfield** or **Project Type: brownfield**.

If brownfield, check the Scout phase first:
- `specs/codebase-context.md` (Pre-Phase: Scout)
- Whether its Phase Gate Approval section has all checkboxes checked

For each phase (0 through 4):
- Whether the artifact file exists in `specs/`
- Whether its Phase Gate Approval section has all checkboxes checked
- Whether the "Approved by" field is populated (not "Pending")

If Phase 4 is in progress, also read `specs/implementation-plan.md` and count how many tasks are marked `[COMPLETE]` vs total tasks.

End with a recommendation for what the human should do next (which agent to select, which command to run). For brownfield projects without an approved `specs/codebase-context.md`, recommend starting with the Scout agent.

Check these files:
- `specs/codebase-context.md` (Pre-Phase: Scout, brownfield only)
- `specs/challenger-brief.md` (Phase 0)
- `specs/product-brief.md` (Phase 1)
- `specs/prd.md` (Phase 2)
- `specs/architecture.md` (Phase 3)
- `specs/implementation-plan.md` (Phase 3/4)
- `specs/decisions/` (count ADR files)
