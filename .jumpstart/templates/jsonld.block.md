# JSON-LD Specification Block

> **Purpose:** Embed Linked Data blocks in spec artifacts so they become a queryable knowledge graph.
> **Usage:** Include this block at the bottom of any spec artifact, populated with the artifact's relationships.

---

## Template

Add the following fenced block at the bottom of each spec artifact, before the Phase Gate Approval section:

````markdown
## Linked Data

```json-ld
{
  "@context": {
    "js": "https://jumpstart.dev/schema/",
    "schema": "https://schema.org/"
  },
  "@type": "js:SpecArtifact",
  "@id": "js:[ARTIFACT_ID]",
  "js:phase": [PHASE_NUMBER],
  "js:agent": "[AGENT_NAME]",
  "js:status": "[STATUS]",
  "js:version": "[VERSION]",
  "js:created": "[DATE]",
  "js:upstream": [
    { "@id": "js:[UPSTREAM_ARTIFACT_ID]" }
  ],
  "js:downstream": [
    { "@id": "js:[DOWNSTREAM_ARTIFACT_ID]" }
  ],
  "js:traces": [
    {
      "@type": "js:TraceLink",
      "js:from": "[REQUIREMENT_ID]",
      "js:to": "[STORY_OR_TASK_ID]",
      "js:linkType": "implements | derives | tests | validates"
    }
  ]
}
```
````

---

## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `@id` | URI | Unique artifact identifier (e.g., `js:prd`, `js:architecture`) |
| `js:phase` | Integer | Phase number (0-4) |
| `js:agent` | String | Agent persona name |
| `js:status` | String | Draft / Approved / Superseded |
| `js:version` | String | Semantic version |
| `js:upstream` | Array | References to artifacts this one depends on |
| `js:downstream` | Array | References to artifacts derived from this one |
| `js:traces` | Array | Explicit traceability links |
| `js:traces[].linkType` | String | `implements`, `derives`, `tests`, or `validates` |

---

## Link Types

| Type | Direction | Example |
|------|-----------|---------|
| `implements` | Story → Task | A task implements a user story |
| `derives` | Brief → Story | A story derives from a product brief capability |
| `tests` | Test → Requirement | A test verifies a requirement |
| `validates` | Criterion → Feature | A validation criterion confirms a feature |

---

## Example: PRD JSON-LD Block

```json-ld
{
  "@context": {
    "js": "https://jumpstart.dev/schema/",
    "schema": "https://schema.org/"
  },
  "@type": "js:SpecArtifact",
  "@id": "js:prd",
  "js:phase": 2,
  "js:agent": "PM",
  "js:status": "Approved",
  "js:version": "1.0.0",
  "js:upstream": [
    { "@id": "js:challenger-brief" },
    { "@id": "js:product-brief" }
  ],
  "js:downstream": [
    { "@id": "js:architecture" },
    { "@id": "js:implementation-plan" }
  ],
  "js:traces": [
    {
      "@type": "js:TraceLink",
      "js:from": "VC-01",
      "js:to": "E1-S01",
      "js:linkType": "derives"
    },
    {
      "@type": "js:TraceLink",
      "js:from": "E1-S01",
      "js:to": "M1-T01",
      "js:linkType": "implements"
    }
  ]
}
```

---

## Integration Notes

- Agents populate the JSON-LD block when compiling the final artifact.
- The `js:traces` array enables full upstream/downstream traceability across phases.
- Tooling can parse these blocks to build `spec-graph.json` automatically.
- The `@context` uses a virtual namespace; no live URL is required.
