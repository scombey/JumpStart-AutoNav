#!/usr/bin/env node
/**
 * generate-zod-schemas.mjs — T4.2.1 codegen entry point.
 *
 * Reads every `.jumpstart/schemas/*.schema.json` (the canonical
 * source-of-truth artifacts authored by the Architect agent) and emits
 * a matching TypeScript Zod schema at `src/schemas/generated/<id>.ts`.
 * Per ADR-004 the JSON-Schema artifacts remain the single source of
 * truth; the Zod files are generated, committed, and CI-gated by
 * `git diff --exit-code` so a stale Zod export is impossible to merge.
 *
 * Usage:
 *   node scripts/generate-zod-schemas.mjs            # write
 *   node scripts/generate-zod-schemas.mjs --check    # exit 1 if drift
 *
 * The output file naming maps the JSON Schema's filename stem (minus
 * `.schema`) to camel-/PascalCase exports:
 *
 *   .jumpstart/schemas/spec-metadata.schema.json
 *     → src/schemas/generated/spec-metadata.ts
 *     → export const SpecMetadataSchema = z.object({...});
 *     → export type SpecMetadata = z.infer<typeof SpecMetadataSchema>;
 *
 * The generator is intentionally one-step (no template engine, no
 * post-processing pipeline). The only transform applied to
 * `json-schema-to-zod`'s output is wrapping it with a stable file
 * header + the inferred type alias. Anything more sophisticated
 * (custom enums, brand types, refinements) lives in a separate
 * `src/lib/validator.ts` layer that imports from `generated/`.
 *
 * @see specs/decisions/adr-004-schema-direction.md
 * @see specs/implementation-plan.md T4.2.1
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonSchemaToZod } from 'json-schema-to-zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_SRC_DIR = path.join(REPO_ROOT, '.jumpstart', 'schemas');
const SCHEMA_OUT_DIR = path.join(REPO_ROOT, 'src', 'schemas', 'generated');

const HEADER = (sourceRel, idCamel) =>
  `/**
 * ${idCamel} — generated Zod schema. DO NOT EDIT.
 *
 * Generator: \`scripts/generate-zod-schemas.mjs\`
 * Source:    \`${sourceRel}\`
 *
 * Edit the source JSON Schema and re-run the generator. The
 * \`zod-codegen-fresh\` gate in \`scripts/verify-baseline.mjs\` runs
 * \`git diff --exit-code src/schemas/generated/\` so any drift between
 * the committed output and the canonical source fails CI.
 *
 * @see specs/decisions/adr-004-schema-direction.md
 */

`;

/** kebab-case → PascalCase. `spec-metadata` → `SpecMetadata`. */
function toPascal(stem) {
  return stem
    .split(/[-_]/)
    .map((part) => (part.length === 0 ? '' : part[0].toUpperCase() + part.slice(1)))
    .join('');
}

/** Parse `--check` from argv. */
function isCheckMode() {
  return process.argv.slice(2).includes('--check');
}

/** Read all `*.schema.json` from SCHEMA_SRC_DIR. */
function listSourceSchemas() {
  if (!existsSync(SCHEMA_SRC_DIR)) {
    throw new Error(`Schema source directory not found: ${SCHEMA_SRC_DIR}`);
  }
  return readdirSync(SCHEMA_SRC_DIR)
    .filter((f) => f.endsWith('.schema.json'))
    .sort();
}

/** Generate the Zod TS source for a single JSON-Schema file. */
function generateOneSchema(filename) {
  const stem = filename.replace(/\.schema\.json$/, '');
  const pascal = toPascal(stem);
  const sourceAbs = path.join(SCHEMA_SRC_DIR, filename);
  const sourceRel = path.relative(REPO_ROOT, sourceAbs).replace(/\\/g, '/');
  const json = JSON.parse(readFileSync(sourceAbs, 'utf8'));

  // jsonSchemaToZod returns a full TS module (with `import { z } from
  // "zod"` + `export const <Name> = ...`). We use its module-emitting
  // path so the output is import-ready as-is.
  const body = jsonSchemaToZod(json, { module: 'esm', name: `${pascal}Schema` });

  // The library's emitted `import { z } from "zod"` uses double quotes;
  // our biome config is single-quote-style. Rewrite the import line so
  // biome-check doesn't flag generated output.
  const normalizedBody = body.replace(/^import \{ z \} from "zod"$/m, "import { z } from 'zod';");

  // Append a Zod-inferred type alias for ergonomic consumer use.
  const typeAlias = `\nexport type ${pascal} = z.infer<typeof ${pascal}Schema>;\n`;

  return HEADER(sourceRel, pascal) + normalizedBody + typeAlias;
}

/** Generate the index.ts re-exporting every generated schema. */
function generateIndex(stems) {
  const lines = [];
  lines.push('/**');
  lines.push(' * src/schemas/generated/index.ts — barrel re-export. DO NOT EDIT.');
  lines.push(' *');
  lines.push(' * Generator: `scripts/generate-zod-schemas.mjs`');
  lines.push(' *');
  lines.push(' * Edit the source JSON Schemas in `.jumpstart/schemas/` and re-run');
  lines.push(' * the generator. CI gate `zod-codegen-fresh` enforces parity via');
  lines.push(' * `git diff --exit-code src/schemas/generated/`.');
  lines.push(' */');
  lines.push('');
  for (const stem of stems) {
    lines.push(`export * from './${stem}.js';`);
  }
  return `${lines.join('\n')}\n`;
}

function ensureOutDir() {
  if (!existsSync(SCHEMA_OUT_DIR)) mkdirSync(SCHEMA_OUT_DIR, { recursive: true });
}

function main() {
  const checkMode = isCheckMode();
  const filenames = listSourceSchemas();
  if (filenames.length === 0) {
    console.error('[generate-zod-schemas] No *.schema.json files found.');
    process.exit(1);
  }

  ensureOutDir();
  const stems = [];
  let driftCount = 0;
  for (const filename of filenames) {
    const stem = filename.replace(/\.schema\.json$/, '');
    stems.push(stem);
    const out = generateOneSchema(filename);
    const outPath = path.join(SCHEMA_OUT_DIR, `${stem}.ts`);
    if (checkMode) {
      const existing = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
      if (existing !== out) {
        driftCount++;
        console.error(
          `[generate-zod-schemas] drift detected: ${path.relative(REPO_ROOT, outPath)}`
        );
      }
    } else {
      writeFileSync(outPath, out, 'utf8');
    }
  }

  // Index file
  const indexOut = generateIndex(stems);
  const indexPath = path.join(SCHEMA_OUT_DIR, 'index.ts');
  if (checkMode) {
    const existing = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
    if (existing !== indexOut) {
      driftCount++;
      console.error(
        `[generate-zod-schemas] drift detected: ${path.relative(REPO_ROOT, indexPath)}`
      );
    }
  } else {
    writeFileSync(indexPath, indexOut, 'utf8');
  }

  if (checkMode && driftCount > 0) {
    console.error(
      `[generate-zod-schemas] ${driftCount} file(s) out of date. Run \`node scripts/generate-zod-schemas.mjs\` to regenerate.`
    );
    process.exit(1);
  }

  if (!checkMode) {
    console.log(
      `[generate-zod-schemas] wrote ${stems.length} schema(s) + index.ts to ${path.relative(REPO_ROOT, SCHEMA_OUT_DIR)}/`
    );
  } else {
    console.log(`[generate-zod-schemas] OK — ${stems.length + 1} files in sync.`);
  }
}

main();
