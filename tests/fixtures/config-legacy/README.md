# Legacy config.yaml fixture matrix (T4.1.12)

Per `specs/implementation-plan.md` T4.1.12: ten historical `.jumpstart/config.yaml` shapes spanning the framework's evolution from 1.0 through 1.1.14. Every shape must produce **byte-identical** parse output between the legacy JS and the TS port — `tests/test-config-legacy-fixtures.test.ts` runs `flattenYaml`, `mergeConfigs`, `loadConfig`, and `parseConfigDocument` against each fixture and compares the result of the JS module side-by-side with the TS port.

This is the load-bearing acceptance test for the **config-cluster (T4.1.8 – T4.1.11) port**. If it fails after a future port-pattern refactor, we know the new TS surface diverged from legacy semantics for some real-world config shape.

## The 10 shapes

| File | Era | Why representative |
|---|---|---|
| `01-minimal-1.0.0.yaml` | 1.0 | Smallest valid config — just `project.name` and `project.type`. The minimum-viable shape. |
| `02-bootstrap-1.0.0.yaml` | 1.0 | Bootstrap-stage config: project name + type + approver, no workflow yet. |
| `03-workflow-active-1.1.0.yaml` | 1.1.0 | Mid-flow with `workflow.current_phase` + `workflow.auto_handoff` set. Most-used shape. |
| `04-ceremony-quick-1.1.0.yaml` | 1.1.0 | Ceremony profile = `quick` (T4.1.9's profile-expansion path). |
| `05-ceremony-standard-1.1.0.yaml` | 1.1.0 | Ceremony profile = `standard` — the no-op skip path. |
| `06-with-hooks-1.1.13.yaml` | 1.1.13 | Has the protected `hooks:` section that mergeConfigs must NEVER overwrite. |
| `07-comments-and-blanks-1.1.13.yaml` | 1.1.13 | Heavy comment + blank-line usage; tests yaml package's Document-AST round-trip preservation. |
| `08-deeply-nested-1.1.14.yaml` | 1.1.14 | 4-level deep nesting (e.g. `hooks.pre.upgrade.command`); tests dotted-key flattening. |
| `09-quoted-values-1.1.14.yaml` | 1.1.14 | Strings with single + double quotes, special chars (`:`), inline comments. |
| `10-full-shape-1.1.14.yaml` | 1.1.14 | Complete production config — every section the framework ships with defaults for. |

## What the test enforces

1. **`flattenYaml` parity**: TS and JS produce the same `Record<string, rawValueString>` flat map.
2. **`loadConfig` parity**: full merge result (config + sources + overrides_applied) round-trips byte-identical when the same project root is supplied to both implementations.
3. **`parseConfigDocument` round-trip**: the yaml package's `Document.toString()` after parse-then-write produces byte-identical output to the input (proves the AST preserves comments, blank lines, key order — ADR-003 hard requirement).
4. **`mergeConfigs` symmetry**: when used as a `userCurrent` in a 3-way merge with itself as both `oldDefault` and `newDefault`, the result is identical to input (idempotent).

## See also

- `bin/lib-ts/config-loader.ts` (T4.1.9)
- `bin/lib-ts/config-yaml.ts` (T4.1.8)
- `bin/lib-ts/config-merge.ts` (T4.1.10)
- `bin/lib-ts/framework-manifest.ts` (T4.1.11)
- `specs/decisions/adr-003-yaml-roundtrip.md`
- `specs/implementation-plan.md` T4.1.12 (this acceptance test)
