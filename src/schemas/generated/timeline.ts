/**
 * Timeline — generated Zod schema. DO NOT EDIT.
 *
 * Generator: `scripts/generate-zod-schemas.mjs`
 * Source:    `.jumpstart/schemas/timeline.schema.json`
 *
 * Edit the source JSON Schema and re-run the generator. The
 * `zod-codegen-fresh` gate in `scripts/verify-baseline.mjs` runs
 * `git diff --exit-code src/schemas/generated/` so any drift between
 * the committed output and the canonical source fails CI.
 *
 * @see specs/decisions/adr-004-schema-direction.md
 */

import { z } from 'zod';

export const TimelineSchema = z.object({ "version": z.literal("1.0.0").describe("Schema version for forward-compatibility."), "session_id": z.string().regex(new RegExp("^ses-[a-z0-9-]+$")).describe("Unique identifier grouping events from a single run or session."), "started_at": z.string().datetime({ offset: true }).describe("ISO 8601 UTC timestamp when the session started."), "ended_at": z.union([z.string().datetime({ offset: true }).describe("ISO 8601 UTC timestamp when the session ended, or null if still active."), z.null().describe("ISO 8601 UTC timestamp when the session ended, or null if still active.")]).describe("ISO 8601 UTC timestamp when the session ended, or null if still active.").optional(), "events": z.array(z.any()).describe("Ordered array of timeline events.") }).describe("Schema for agent interaction timeline events. Records all agent actions, tool calls, questions, approvals, subagent invocations, and artifacts as a chronological timeline.")

export type Timeline = z.infer<typeof TimelineSchema>;
