/**
 * Module — generated Zod schema. DO NOT EDIT.
 *
 * Generator: `scripts/generate-zod-schemas.mjs`
 * Source:    `.jumpstart/schemas/module.schema.json`
 *
 * Edit the source JSON Schema and re-run the generator. The
 * `zod-codegen-fresh` gate in `scripts/verify-baseline.mjs` runs
 * `git diff --exit-code src/schemas/generated/` so any drift between
 * the committed output and the canonical source fails CI.
 *
 * @see specs/decisions/adr-004-schema-direction.md
 */

import { z } from 'zod';

export const ModuleSchema = z.object({ "name": z.string().regex(new RegExp("^[a-z][a-z0-9-]*$")).describe("Module name (lowercase, kebab-case)."), "version": z.string().regex(new RegExp("^\\d+\\.\\d+\\.\\d+")).describe("Semantic version string."), "description": z.string().min(10).describe("Human-readable description of the module's purpose."), "author": z.string().describe("Module author name or organization.").optional(), "license": z.string().describe("SPDX license identifier.").optional(), "homepage": z.string().url().describe("URL to the module's homepage or repository.").optional(), "engines": z.object({ "jumpstart": z.string().describe("Required Jump Start framework version range.").optional() }).optional(), "agents": z.array(z.string()).describe("Relative paths to agent persona files this module provides.").optional(), "templates": z.array(z.string()).describe("Relative paths to template files this module provides.").optional(), "commands": z.array(z.string()).describe("Relative paths to command definition files this module provides.").optional(), "checks": z.array(z.string()).describe("Relative paths to quality check scripts this module provides.").optional(), "skills": z.array(z.string()).describe("Relative paths to skill directories this module provides.").optional(), "dependencies": z.array(z.string()).describe("Other Jump Start modules this module depends on.").optional(), "keywords": z.array(z.string()).describe("Discovery keywords for marketplace search.").optional() }).strict().describe("Schema for validating Jump Start add-on module manifests.")

export type Module = z.infer<typeof ModuleSchema>;
