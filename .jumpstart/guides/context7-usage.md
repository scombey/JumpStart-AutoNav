# Context7 MCP Usage Guide

> **Purpose:** Authoritative reference for calling Context7 MCP tools correctly across all Jump Start agents.
> **Last Updated:** 2026-02-09
> **Source:** [Context7 Official Documentation](https://context7.com/docs)

---

## Overview

Context7 MCP provides up-to-date, version-specific documentation for libraries, frameworks, and tools. It eliminates hallucinated APIs and outdated code examples by fetching live documentation directly into the AI assistant's context.

**Rule:** Never rely on training data for API signatures, configuration flags, version compatibility, or setup instructions. Always use Context7.

---

## Available Tools

Context7 MCP exposes two tools. When invoked via MCP clients (VS Code Copilot, Cursor, Claude Code, etc.), tools are prefixed with `mcp_context7_`.

### 1. `resolve-library-id`

Resolves a general library name into a Context7-compatible library ID.

**Full MCP Name:** `mcp_context7_resolve-library-id`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `libraryName` | string | Yes | The name of the library to search for (e.g., "nextjs", "prisma", "react") |
| `query` | string | Yes | The user's question or task — used to rank results by relevance |

**Example Invocation:**

```json
{
  "libraryName": "nextjs",
  "query": "How do I set up middleware for authentication?"
}
```

**Returns:** A list of matching libraries with their Context7 library IDs (e.g., `/vercel/next.js`).

---

### 2. `query-docs`

Retrieves documentation for a library using a Context7-compatible library ID.

**Full MCP Name:** `mcp_context7_query-docs`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `libraryId` | string | Yes | Exact Context7-compatible library ID (e.g., `/vercel/next.js`, `/prisma/prisma`) |
| `query` | string | Yes | The question or task to get relevant documentation for |

**Example Invocation:**

```json
{
  "libraryId": "/vercel/next.js",
  "query": "How do I configure middleware to check JWT cookies?"
}
```

**Returns:** Relevant documentation snippets, code examples, and API references for the specified query.

---

## Library ID Format

Context7 library IDs follow the pattern `/{owner}/{repo}`:

| Library | Context7 Library ID |
|---------|---------------------|
| Next.js | `/vercel/next.js` |
| React | `/facebook/react` |
| Prisma | `/prisma/prisma` |
| Tailwind CSS | `/tailwindlabs/tailwindcss` |
| Express | `/expressjs/express` |
| MongoDB Node Driver | `/mongodb/docs` |
| Supabase | `/supabase/supabase` |

**Tip:** If you know the exact library ID, you can skip `resolve-library-id` and call `query-docs` directly.

---

## Standard Calling Pattern

### Two-Step Pattern (Recommended)

Use this when you don't know the exact library ID:

```
Step 1: Resolve the library ID
  Tool: mcp_context7_resolve-library-id
  Input: { "libraryName": "prisma", "query": "database migrations setup" }
  Output: Library ID = /prisma/prisma

Step 2: Fetch documentation
  Tool: mcp_context7_query-docs
  Input: { "libraryId": "/prisma/prisma", "query": "database migrations setup" }
  Output: Documentation snippets about Prisma migrations
```

### Direct Pattern (When Library ID is Known)

Skip resolution when you already have the library ID:

```
Tool: mcp_context7_query-docs
Input: { "libraryId": "/vercel/next.js", "query": "server actions configuration" }
Output: Documentation about Next.js server actions
```

---

## Citation Format

After fetching documentation, add a citation marker to your output:

**Standard Format:** `[Context7: library@version]`

**Examples:**
- `[Context7: next.js@14]`
- `[Context7: prisma@5.22]`
- `[Context7: react@18.3]`

Place the citation marker next to the technology reference in your artifact.

---

## When to Use Context7

| Phase | Agent | When Required |
|-------|-------|---------------|
| Phase 1 | Analyst | Competitive technology evaluation |
| Phase 3 | Architect | Documentation Freshness Audit (hard gate, ≥80% score required) |
| Phase 4 | Developer | Before writing external API integration code |
| Any | Researcher | Technology claim verification |
| Any | Any Agent | When making claims about technology capabilities, limitations, or APIs |

---

## Error Handling

### Library Not Found

If `resolve-library-id` returns no results:
1. Try alternative library names (e.g., "next" vs "nextjs" vs "next.js")
2. Search for the parent organization (e.g., "vercel" for Next.js)
3. Fall back to official documentation URL with manual verification
4. Document in the artifact: "Context7 library not found. Falling back to: [URL]"

### Rate Limiting

If requests are rate-limited:
1. Wait and retry with exponential backoff
2. Prioritize "Must Have" technologies for verification
3. Document unverified technologies as requiring manual verification

### Service Unavailable

If Context7 MCP is unavailable:
1. Document all technologies as "Unverified — Context7 unavailable"
2. Provide official documentation URLs for manual verification
3. Flag in insights file for follow-up verification

---

## MCP Setup Instructions

### Installation

Install Context7 MCP for your AI coding assistant:

```bash
npx add-mcp https://mcp.context7.com/mcp --header "CONTEXT7_API_KEY: YOUR_API_KEY"
```

Add `-y` to skip confirmation and install to all detected agents.

### Get an API Key

For higher rate limits, get a free API key at: https://context7.com/dashboard

### Client-Specific Setup

| Client | Configuration Location |
|--------|------------------------|
| VS Code Copilot | MCP settings in VS Code |
| Cursor | `Cursor Settings > MCP` or marketplace plugin |
| Claude Code | MCP configuration via add-mcp |
| Windsurf | MCP configuration |

---

## Best Practices

1. **Always use the full MCP tool name** (`mcp_context7_query-docs`) in documentation to avoid ambiguity.
2. **Include a descriptive query** — the query parameter helps Context7 return the most relevant documentation.
3. **Verify versions** — confirm the version you're using matches the documentation fetched.
4. **Cite your sources** — always add the `[Context7: lib@version]` marker.
5. **Batch related queries** — if verifying multiple technologies, group related lookups by topic.
6. **Document failures** — if Context7 cannot verify a technology, document the fallback source.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│  CONTEXT7 MCP QUICK REFERENCE                                   │
├─────────────────────────────────────────────────────────────────┤
│  RESOLVE LIBRARY ID                                             │
│  Tool: mcp_context7_resolve-library-id                          │
│  Params: libraryName (required), query (required)               │
│  Example: { "libraryName": "prisma", "query": "setup guide" }   │
├─────────────────────────────────────────────────────────────────┤
│  FETCH DOCUMENTATION                                            │
│  Tool: mcp_context7_query-docs                                  │
│  Params: libraryId (required), query (required)                 │
│  Example: { "libraryId": "/prisma/prisma", "query": "setup" }   │
├─────────────────────────────────────────────────────────────────┤
│  CITATION FORMAT                                                │
│  [Context7: library@version]                                    │
│  Example: [Context7: next.js@14]                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [Context7 Official Docs](https://context7.com/docs)
- [Context7 Troubleshooting](https://context7.com/docs/resources/troubleshooting)
- [MCP Clients List](https://context7.com/docs/resources/all-clients)
- Jump Start: `.jumpstart/templates/documentation-audit.md`
- Jump Start: `.jumpstart/agents/researcher.md`
