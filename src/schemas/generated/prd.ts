/**
 * Prd — generated Zod schema. DO NOT EDIT.
 *
 * Generator: `scripts/generate-zod-schemas.mjs`
 * Source:    `.jumpstart/schemas/prd.schema.json`
 *
 * Edit the source JSON Schema and re-run the generator. The
 * `zod-codegen-fresh` gate in `scripts/verify-baseline.mjs` runs
 * `git diff --exit-code src/schemas/generated/` so any drift between
 * the committed output and the canonical source fails CI.
 *
 * @see specs/decisions/adr-004-schema-direction.md
 */

import { z } from 'zod';

export const PrdSchema = z.object({ "metadata": z.any(), "product_overview": z.string().min(50).describe("Summary paragraph tying together problem, vision, personas, and MVP scope."), "epics": z.array(z.object({ "id": z.string().regex(new RegExp("^E\\d+$")).describe("Epic identifier (e.g., 'E1')."), "name": z.string(), "description": z.string(), "primary_persona": z.string().optional(), "scope_tier": z.enum(["Must Have","Should Have","Could Have","Won't Have"]), "validation_criterion": z.string().optional(), "stories": z.array(z.object({ "id": z.string().regex(new RegExp("^S\\d+$")).describe("Story identifier (e.g., 'S01')."), "title": z.string(), "story": z.string().describe("User story or job story text."), "acceptance_criteria": z.array(z.string()).min(1), "priority": z.enum(["Must Have","Should Have","Could Have"]).optional(), "estimation": z.string().optional() })).min(1) })).min(1), "non_functional_requirements": z.array(z.object({ "id": z.string().regex(new RegExp("^NFR-\\d+$")), "category": z.enum(["Performance","Security","Accessibility","Reliability","Scalability","Maintainability","Compliance"]), "requirement": z.string(), "measurable_target": z.string().optional(), "priority": z.string().optional() })).optional(), "milestones": z.array(z.object({ "id": z.string().regex(new RegExp("^M\\d+$")), "name": z.string(), "goal": z.string(), "stories": z.array(z.string()).optional() })).optional(), "task_breakdown": z.array(z.object({ "id": z.string().regex(new RegExp("^T\\d+$")), "title": z.string(), "story_ref": z.string().optional(), "priority": z.string().optional() })).optional() }).describe("Schema for validating Product Requirements Document structure.")

export type Prd = z.infer<typeof PrdSchema>;
