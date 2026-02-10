# User Proxy Personas

This directory contains persona definitions for the User Proxy LLM in headless agent testing.

## Purpose

When running agents in headless mode, the `ask_questions` tool calls are routed to a User Proxy LLM instead of a real human. The User Proxy behaves according to its persona, providing consistent, predictable responses for testing.

## Available Personas

| Persona | Description | Use Case |
|---------|-------------|----------|
| `compliant-user.md` | Approves quickly, picks sensible defaults | Happy path testing |
| `strict-user.md` | Asks follow-ups, may reject first proposals | Edge case testing |
| `enterprise-user.md` | Enterprise preferences, security-focused | Enterprise scenario testing |

## Persona Format

Each persona is a markdown file containing a system prompt that defines:
1. The user's decision-making style
2. Technology preferences (if any)
3. Approval behavior
4. Response patterns

## Usage

```bash
# Use compliant user (default)
node bin/headless-runner.js --agent architect --persona compliant-user

# Use strict user for edge case testing
node bin/headless-runner.js --agent architect --persona strict-user

# Use enterprise user
node bin/headless-runner.js --agent architect --persona enterprise-user
```

## Creating Custom Personas

1. Create a new `.md` file in this directory
2. Define the system prompt following the existing format
3. Reference by filename (without .md extension) via `--persona` flag

## Mock vs Live Mode

- **Mock mode** (`--mock`): Uses `MockResponseRegistry` from `bin/lib/mock-responses.js` - no LLM calls
- **Live mode** (default): Calls the User Proxy LLM with the persona prompt to generate responses

Mock mode is faster and free, useful for CI testing. Live mode provides more realistic, varied responses.
