---
applyTo: "specs/**/*.md"
---

# Jump Start Spec Artifact Guidelines

When editing or generating files in the `specs/` directory:

1. Always use the corresponding template from `.jumpstart/templates/` as the starting structure.
2. Never leave bracket placeholders like `[DATE]` or `[description]` in the final version. Replace them with real content.
3. Every artifact must have a populated Phase Gate Approval section at the bottom.
4. Maintain traceability: every Must Have item should reference upstream artifacts (e.g., a PRD story references a Product Brief capability, which references a Challenger Brief validation criterion).
5. Use Markdown tables for structured data. Keep tables readable.
6. Do not introduce content that belongs in a different phase's artifact.
7. For brownfield projects, `specs/codebase-context.md` uses the template from `.jumpstart/templates/codebase-context.md`. C4 diagrams use Mermaid syntax.
8. For greenfield projects, per-directory `AGENTS.md` files use the template from `.jumpstart/templates/agents-md.md`.
