/**
 * Adr — generated Zod schema. DO NOT EDIT.
 *
 * Generator: `scripts/generate-zod-schemas.mjs`
 * Source:    `.jumpstart/schemas/adr.schema.json`
 *
 * Edit the source JSON Schema and re-run the generator. The
 * `zod-codegen-fresh` gate in `scripts/verify-baseline.mjs` runs
 * `git diff --exit-code src/schemas/generated/` so any drift between
 * the committed output and the canonical source fails CI.
 *
 * @see specs/decisions/adr-004-schema-direction.md
 */

import { z } from 'zod';

export const AdrSchema = z.object({ "metadata": z.object({ "id": z.string().regex(new RegExp("^ADR-\\d{3}$")).describe("ADR identifier (e.g., 'ADR-001')."), "title": z.string().min(5), "status": z.enum(["Proposed","Accepted","Deprecated","Superseded"]), "date": z.string().date(), "decision_maker": z.string().optional(), "superseded_by": z.union([z.string().describe("ADR ID that supersedes this one."), z.null().describe("ADR ID that supersedes this one.")]).describe("ADR ID that supersedes this one.").optional() }), "context": z.string().min(20).describe("What issue or question motivates this decision."), "decision": z.string().min(10).describe("The change or choice being made."), "consequences": z.object({ "positive": z.array(z.string()).min(1), "negative": z.array(z.string()), "neutral": z.array(z.string()).optional() }), "alternatives_considered": z.array(z.object({ "name": z.string(), "description": z.string().optional(), "pros": z.array(z.string()).optional(), "cons": z.array(z.string()).optional(), "reason_rejected": z.string() })).optional() }).describe("Schema for validating Architecture Decision Record structure.")

export type Adr = z.infer<typeof AdrSchema>;
