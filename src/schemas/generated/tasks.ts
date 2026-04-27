/**
 * Tasks — generated Zod schema. DO NOT EDIT.
 *
 * Generator: `scripts/generate-zod-schemas.mjs`
 * Source:    `.jumpstart/schemas/tasks.schema.json`
 *
 * Edit the source JSON Schema and re-run the generator. The
 * `zod-codegen-fresh` gate in `scripts/verify-baseline.mjs` runs
 * `git diff --exit-code src/schemas/generated/` so any drift between
 * the committed output and the canonical source fails CI.
 *
 * @see specs/decisions/adr-004-schema-direction.md
 */

import { z } from 'zod';

export const TasksSchema = z.object({ "metadata": z.any(), "plan_summary": z.object({ "total_milestones": z.number().int().gte(1).optional(), "total_tasks": z.number().int().gte(1).optional(), "tasks_completed": z.number().int().gte(0).optional(), "status": z.enum(["Not Started","In Progress","Complete"]).optional() }).optional(), "milestones": z.array(z.object({ "id": z.string().regex(new RegExp("^M\\d+$")).describe("Milestone identifier (e.g., 'M1')."), "name": z.string(), "goal": z.string().optional(), "prd_stories": z.array(z.string()).describe("PRD story IDs included in this milestone.").optional(), "tasks": z.array(z.object({ "id": z.string().regex(new RegExp("^M\\d+-T\\d+$")).describe("Task identifier (e.g., 'M1-T01')."), "title": z.string(), "component": z.string(), "story_ref": z.string().optional(), "files": z.array(z.string()).describe("File paths to create or modify."), "dependencies": z.array(z.string()).describe("Task IDs that must be completed first.").optional(), "description": z.string().optional(), "tests_required": z.string().optional(), "done_when": z.string().optional(), "execution_order": z.enum(["S","P","R","M","D"]).describe("S=Sequential, P=Parallel, R=Refactor, M=Migration, D=Documentation.").optional(), "status": z.enum(["Not Started","In Progress","Complete","Blocked"]).default("Not Started"), "prior_art_reference": z.string().describe("(Brownfield) File path to an existing example in the codebase.").optional(), "reference_test_file": z.string().describe("(Brownfield) File path to an existing test file to mimic.").optional(), "context7_references": z.array(z.string()).describe("(Greenfield) Context7 tags for third-party libraries.").optional() })).min(1) })).min(1) }).describe("Schema for validating implementation plan task structures.")

export type Tasks = z.infer<typeof TasksSchema>;
