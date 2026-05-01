/**
 * versioning.ts — git-tag-driven spec versioning.
 *
 * Tags use the scheme `spec/<artifact>/vX.Y.Z`. The "auto-bump minor
 * on tag" semver heuristic and the spec-file frontmatter injection
 * logic are part of the contract.
 *
 * **Security note (ADR-009):** all five exports use the array-args
 * form of execFileSync so arguments pass to git directly without
 * shell interpretation. A shell-template implementation would have
 * run a malicious tag-message such as `"; rm -rf ~"` against the
 * user's shell; the array form rejects those as literal strings
 * (git's own validation handles them).
 *
 * @see specs/decisions/adr-009-ipc-stdin-path-traversal.md
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Result of `createVersionTag`. */
export interface CreateTagResult {
  success: boolean;
  tag: string;
  error?: string | undefined;
}

/** A single entry returned by `listVersions`. */
export interface VersionEntry {
  artifact: string;
  version: string;
  tag: string;
}

/**
 * Build the canonical tag string for an artifact + version.
 * Format: `spec/<artifactName>/v<version>` — matches legacy verbatim.
 */
export function generateTag(artifactName: string, version: string): string {
  return `spec/${artifactName}/v${version}`;
}

/**
 * Determine the next semver-minor for `artifactName`. Lists existing
 * `spec/<artifactName>/v*` tags, picks the highest, increments
 * `minor`. Returns `'1.0.0'` when no prior tags exist or when git is
 * unavailable.
 *
 * Invariants: identical sort key + identical fallback-to-1.0.0
 * branches as the legacy module.
 */
export function getNextVersion(artifactName: string, cwd?: string): string {
  const workDir = cwd || process.cwd();

  try {
    const tags = execFileSync('git', ['tag', '-l', `spec/${artifactName}/v*`], {
      cwd: workDir,
      encoding: 'utf8',
    }).trim();

    if (!tags) return '1.0.0';

    const versions = tags
      .split('\n')
      .map((tag) => tag.replace(`spec/${artifactName}/v`, ''))
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
      .map((v) => v.split('.').map(Number))
      .sort((a, b) => {
        for (let i = 0; i < 3; i++) {
          const ai = a[i] ?? 0;
          const bi = b[i] ?? 0;
          if (ai !== bi) return bi - ai;
        }
        return 0;
      });

    if (versions.length === 0) return '1.0.0';

    const latest = versions[0];
    if (latest === undefined) return '1.0.0';
    const major = latest[0] ?? 1;
    const minor = latest[1] ?? 0;
    return `${major}.${minor + 1}.0`;
  } catch {
    return '1.0.0';
  }
}

/**
 * Create a git tag for the approved artifact. Uses the array-args form
 * so user-controlled `artifactName` / `version` / `message` cannot
 * escape into shell context (security improvement vs legacy).
 */
export function createVersionTag(
  artifactName: string,
  version: string,
  message?: string,
  cwd?: string
): CreateTagResult {
  const workDir = cwd || process.cwd();
  const tag = generateTag(artifactName, version);
  const tagMessage = message || `Approved: ${artifactName} v${version}`;

  try {
    execFileSync('git', ['tag', '-a', tag, '-m', tagMessage], {
      cwd: workDir,
      encoding: 'utf8',
    });
    return { success: true, tag };
  } catch (err) {
    return { success: false, tag, error: (err as Error).message };
  }
}

/**
 * Validate that `version` is a well-formed semver string (with optional
 * pre-release + build-metadata suffix). Pit Crew Adversary 2 (CRITICAL)
 * closed: the legacy injectVersion interpolated `version` into YAML +
 * markdown unescaped, so an attacker passing
 * `'1.0.0"\n\nmalicious_field: "owned'` could inject arbitrary
 * frontmatter fields and forge approval state. Gating with semver
 * rejects every shape that could carry control bytes.
 */
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

/**
 * Inject `version: "<version>"` into the spec file's YAML frontmatter
 * AND update any `**Version:**` header line in the body. Returns
 * `false` if the file does not exist OR `version` is not a valid
 * semver shape (Pit Crew Adversary 2 hardening); returns `true` after
 * a successful write even if no fields actually changed.
 *
 * Frontmatter regex anchored to line start (Pit Crew Reviewer H2): the
 * legacy regex `/version:\s*.+/` was an unanchored substring match that
 * clobbered the FIRST occurrence of `version:` anywhere — including
 * inside another field's quoted value. The `m` flag + `^` anchor makes
 * sure only a true field declaration matches.
 */
export function injectVersion(filePath: string, version: string): boolean {
  if (!existsSync(filePath)) return false;
  if (!SEMVER_REGEX.test(version)) return false;

  let content = readFileSync(filePath, 'utf8');

  if (content.startsWith('---\n')) {
    const endIdx = content.indexOf('\n---', 4);
    if (endIdx !== -1) {
      let frontmatter = content.substring(4, endIdx);
      // Anchored: only matches lines that START with `version:` (i.e.,
      // a real top-level frontmatter field), never substring matches
      // inside another field's value (Reviewer H2).
      if (/^version:/m.test(frontmatter)) {
        frontmatter = frontmatter.replace(/^version:[ \t]*.*/m, `version: "${version}"`);
      } else {
        frontmatter += `\nversion: "${version}"`;
      }
      content = `---\n${frontmatter}${content.substring(endIdx)}`;
    }
  }

  // Body **Version:** header — anchored to line end via $ + m flag to
  // prevent any leftover newline from carrying a payload. Since
  // `version` is validated as semver above, the right-hand side
  // can't contain control bytes; the anchor is defense-in-depth.
  const versionPattern = /(\*\*Version:\*\*[ \t]*).*$/m;
  if (versionPattern.test(content)) {
    content = content.replace(versionPattern, `$1${version}`);
  }

  writeFileSync(filePath, content, 'utf8');
  return true;
}

/**
 * Enumerate every `spec/*` git tag in the working tree. Returns an
 * empty array when no tags exist or when git is unavailable.
 */
export function listVersions(cwd?: string): VersionEntry[] {
  const workDir = cwd || process.cwd();

  try {
    const tags = execFileSync('git', ['tag', '-l', 'spec/*'], {
      cwd: workDir,
      encoding: 'utf8',
    }).trim();

    if (!tags) return [];

    return tags
      .split('\n')
      .map((tag): VersionEntry | null => {
        const match = tag.match(/^spec\/(.+)\/v(.+)$/);
        if (match?.[1] !== undefined && match[2] !== undefined) {
          return { artifact: match[1], version: match[2], tag };
        }
        return null;
      })
      .filter((entry): entry is VersionEntry => entry !== null);
  } catch {
    return [];
  }
}
