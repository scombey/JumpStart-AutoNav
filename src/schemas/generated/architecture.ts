/**
 * Architecture — generated Zod schema. DO NOT EDIT.
 *
 * Generator: `scripts/generate-zod-schemas.mjs`
 * Source:    `.jumpstart/schemas/architecture.schema.json`
 *
 * Edit the source JSON Schema and re-run the generator. The
 * `zod-codegen-fresh` gate in `scripts/verify-baseline.mjs` runs
 * `git diff --exit-code src/schemas/generated/` so any drift between
 * the committed output and the canonical source fails CI.
 *
 * @see specs/decisions/adr-004-schema-direction.md
 */

import { z } from 'zod';

export const ArchitectureSchema = z.object({ "metadata": z.any(), "technical_overview": z.string().min(50).describe("Summary of target architecture."), "technology_stack": z.array(z.object({ "layer": z.string(), "choice": z.string(), "version": z.string().optional(), "justification": z.string().min(10), "alternatives_considered": z.string().optional(), "documentation_urls": z.array(z.string()).optional(), "context7_identifiers": z.array(z.string()).optional() })).min(1), "canonical_patterns": z.array(z.object({ "title": z.string(), "code": z.string(), "anti_pattern": z.string().optional() })).describe("(Greenfield) Architect-defined code snippets establishing the baseline patterns.").optional(), "components": z.array(z.object({ "name": z.string(), "responsibility": z.string(), "depends_on": z.array(z.string()).optional(), "exposes": z.array(z.string()).optional(), "key_stories": z.array(z.string()).optional() })).min(1), "data_model": z.object({ "entities": z.array(z.object({ "name": z.string(), "description": z.string().optional(), "fields": z.array(z.object({ "name": z.string(), "type": z.string(), "constraints": z.string().optional(), "description": z.string().optional() })) })).optional(), "relationships": z.array(z.object({ "from": z.string(), "to": z.string(), "type": z.enum(["one-to-one","one-to-many","many-to-many"]), "cascade": z.string().optional() })).optional() }).optional(), "api_contracts": z.array(z.object({ "method": z.string(), "path": z.string(), "description": z.string(), "auth": z.string().optional(), "request_schema": z.record(z.string(), z.any()).optional(), "response_schema": z.record(z.string(), z.any()).optional(), "error_responses": z.array(z.any()).optional(), "related_story": z.string().optional() })).optional(), "deployment": z.object({ "strategy": z.string().optional(), "environments": z.array(z.string()).optional(), "ci_cd": z.string().optional(), "env_vars": z.array(z.string()).optional() }).optional() }).describe("Schema for validating Architecture Document structure.")

export type Architecture = z.infer<typeof ArchitectureSchema>;
