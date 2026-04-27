/**
 * SpecMetadata — generated Zod schema. DO NOT EDIT.
 *
 * Generator: `scripts/generate-zod-schemas.mjs`
 * Source:    `.jumpstart/schemas/spec-metadata.schema.json`
 *
 * Edit the source JSON Schema and re-run the generator. The
 * `zod-codegen-fresh` gate in `scripts/verify-baseline.mjs` runs
 * `git diff --exit-code src/schemas/generated/` so any drift between
 * the committed output and the canonical source fails CI.
 *
 * @see specs/decisions/adr-004-schema-direction.md
 */

import { z } from 'zod';

export const SpecMetadataSchema = z.object({ "id": z.string().describe("Unique identifier for this artifact (e.g., 'challenger-brief', 'prd', 'architecture')."), "phase": z.number().int().gte(0).lte(4).describe("Phase number (0-4) that produced this artifact."), "agent": z.enum(["Challenger","Analyst","PM","Architect","Developer","Scout"]).describe("Agent persona that generates this artifact."), "status": z.enum(["Draft","In Review","Approved","Superseded","Archived"]).describe("Current lifecycle status."), "created": z.string().date().describe("ISO 8601 creation date."), "updated": z.string().date().describe("ISO 8601 last-updated date.").optional(), "version": z.string().regex(new RegExp("^\\d+\\.\\d+\\.\\d+$")).describe("Semantic version of this artifact (e.g., '1.0.0').").optional(), "approved_by": z.union([z.string().describe("Name of the approver, or null/Pending."), z.null().describe("Name of the approver, or null/Pending.")]).describe("Name of the approver, or null/Pending.").optional(), "approval_date": z.union([z.string().date().describe("ISO 8601 approval date, or null."), z.null().describe("ISO 8601 approval date, or null.")]).describe("ISO 8601 approval date, or null.").optional(), "upstream_refs": z.array(z.string()).describe("Paths to upstream artifacts this one depends on.").optional(), "dependencies": z.array(z.string()).describe("Artifact IDs this spec depends on.").optional(), "risk_level": z.enum(["low","medium","high","critical"]).describe("Assessed risk level of this artifact's scope.").optional(), "owners": z.array(z.string()).describe("Human owners or responsible parties.").optional(), "sha256": z.union([z.string().regex(new RegExp("^[a-f0-9]{64}$")).describe("Content hash for integrity verification (populated by tooling)."), z.null().describe("Content hash for integrity verification (populated by tooling).")]).describe("Content hash for integrity verification (populated by tooling).").optional() }).strict().describe("Schema for the YAML frontmatter metadata block required in every spec artifact.")

export type SpecMetadata = z.infer<typeof SpecMetadataSchema>;
