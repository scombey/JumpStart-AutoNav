# AutoNav VS Code Copilot Agent Hooks

This directory contains the first 23 priority agent hooks identified for AutoNav (JumpStart). Each hook is a Node.js script that reads the hook JSON payload from stdin and emits a decision via exit code and/or stdout JSON.

Hooks are registered in workspace hook config files under this directory. AutoNav ships [`autonav.json`](./autonav.json), which VS Code discovers automatically from `.github/hooks/*.json`.

## Why these hooks

AutoNav is a spec-driven, phase-gated framework. The hooks convert advisory principles into **deterministic lifecycle enforcement**:

| # | Event | Script | Maps to Roadmap / Config |
|---|---|---|---|
| 1 | `SessionStart` | `session-start.js` | Auto-resume briefing (replaces manual `/jumpstart.resume`) |
| 2 | `PreCompact` | `pre-compact.js` | Preserves `resume_context` + unresolved `[NEEDS CLARIFICATION]` across context compactions |
| 3 | `PreToolUse` | `block-agent-self-modification.js` | §Stay in Lane — block edits to agent-governance files |
| 4 | `PreToolUse` | `inject-adr-context.js` | §IV Upstream Traceability — inject relevant ADRs when specs/src are touched |
| 5 | `PreToolUse` | `capture-plan.js` | Appends pre-execution intent to phase insights (design log) |
| 6 | `PreToolUse` | `retry-escalation.js` | §Ambiguity Handling — escalate repeated-retry loops to `correction-log.md` |
| 7 | `PostToolUse` | `enforce-test-cochange.js` | Article III (`test_drive_mandate`) — warn on Phase 4 src edits without test edits |
| 8 | `Stop` | `draft-changelog.js` | Draft `specs/changelog-drafts/{date}-{session}.md` from multi-file sessions |
| 9 | `PreToolUse` | `phase-boundary-guard.js` | Sequential phase integrity — block implementation work when PRD / architecture / implementation plan are missing or unapproved |
| 10 | `UserPromptSubmit` | `qa-log-capture.js` | `workflow.qa_log` — append significant user prompts to `specs/qa-log.md` for early traceability |
| 11 | `PostToolUse` | `schema-on-write-validator.js` | Schema enforcement — validate edited spec artifacts immediately after write |
| 12 | `PostToolUse` | `spec-graph-updater.js` | Dependency graph — rebuild `.jumpstart/spec-graph.json` when specs or mapped files change |
| 13 | `Stop` | `session-analytics.js` | Timeline-style observability — emit per-session analytics covering tools, hotspots, retries, and validation outcomes |
| 14 | `SessionStart` | `workspace-fingerprint.js` | Inject repo root, branch, dirty state, Node version, and package manager into context |
| 15 | `SessionStart` | `phase-gate-status.js` | Summarise approved, pending, and missing upstream artifacts at session start |
| 16 | `SessionStart` | `timeline-warmup.js` | Confirm timeline state and inject last-session summary from `.jumpstart/state/timeline.json` |
| 17 | `UserPromptSubmit` | `prompt-classifier.js` | Tag incoming prompts as discovery / planning / build / debug / review |
| 18 | `UserPromptSubmit` | `ambiguity-detector.js` | Inject `[NEEDS CLARIFICATION]` reminders for vague prompts |
| 19 | `PreToolUse` | `spec-drift-guard.js` | Warn when traced code changes lack a touched or cited governing spec |
| 20 | `PreToolUse` | `dangerous-operation-escalator.js` | Block destructive shell or delete operations until the human explicitly approves |
| 21 | `PreToolUse` | `dependency-risk-precheck.js` | Detect dependency add/update operations and inject advisory/security reminders |
| 22 | `PreToolUse` | `secrets-path-blocker.js` | Block reads/writes targeting secrets, deploy keys, or restricted env files |
| 23 | `PreToolUse` | `simplicity-gate-guard.js` | Warn when a proposed file path would introduce a new counted top-level directory beyond the configured limit |

## Installation

The hooks are enabled for every user of this workspace — `.github/hooks/autonav.json` is committed. VS Code Copilot will pick it up automatically because `.github/hooks/*.json` is a default workspace hook location.

**User-level opt-out:** set `JUMPSTART_HOOK_ALLOW_AGENT_EDITS=1` in your shell to let agents modify agent-governance files (Hook #3).

**Requirements:** Node.js ≥ 14 (already required by this project's `package.json`).

## Contract

Each script follows the same shape:

- Reads a JSON payload from **stdin** containing at minimum `{ sessionId, hookEventName, tool_name, tool_input, cwd }`.
- Exits with one of:
  - `0` — allow / no-op.
  - `2` — **block** the tool call (VS Code convention); reason written to stderr.
- Optionally emits a JSON envelope on **stdout** carrying `hookSpecificOutput.additionalContext` (injected into the agent's context) or `decision: "block"` with a `reason`.

All scripts are **fail-safe**: an exception during hook execution will never crash the agent session — errors are swallowed and the hook exits 0.

## Testing

Hook logic is unit-tested in [`../../tests/test-hooks.test.js`](../../tests/test-hooks.test.js). Each script exposes a pure `handle(input, ctx)` function that takes the payload and a synthetic context `{ root, now }`, making the behaviour deterministic without mocking stdio.

Run:

```bash
npm test -- tests/test-hooks.test.js
```

## State files touched

| Path | Purpose |
|---|---|
| `.jumpstart/state/state.json` | `resume_context` updated by `pre-compact.js`; read by `session-start.js` |
| `.jumpstart/state/hook-state.json` | Transient: recent tool calls, startup context, workspace metadata, tool counts, prompts, validations, blocked actions, and per-session edit logs |
| `.jumpstart/correction-log.md` | Appended by `retry-escalation.js` when a retry loop is detected |
| `specs/insights/{phase}-insights.md` | Appended by `capture-plan.js` with planned-step entries |
| `specs/changelog-drafts/*.md` | Written by `draft-changelog.js` at session end |
| `specs/qa-log.md` | Appended by `qa-log-capture.js` with significant user prompts |
| `.jumpstart/spec-graph.json` | Refreshed by `spec-graph-updater.js` after relevant spec/code edits |
| `.jumpstart/state/session-analytics/*.md` | Written by `session-analytics.js` with end-of-session observability summaries |

All of these are existing AutoNav-managed paths — no new top-level directory is introduced (honours `simplicity_gate` in `config.yaml`).

## Security note

Per the VS Code hooks safety guidance, this directory **must not be writable by the agent itself**. Hook #3 (`block-agent-self-modification.js`) enforces this by blocking any edit targeting `.github/hooks/`. If you need to update a hook, edit it directly (outside the agent session) or temporarily set `JUMPSTART_HOOK_ALLOW_AGENT_EDITS=1`.
