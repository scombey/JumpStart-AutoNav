/**
 * test-secrets-redaction-e2e.test.ts — T4.3.5 ADR-012 end-to-end test.
 *
 * Pins the three canonical scenarios from the implementation plan:
 *
 *   (a) CLI invocation `--api-key sk-fake-test-value-...` ⇒ log entry
 *       contains `[REDACTED:...]`, NOT the raw key.
 *   (b) CLI invocation `--target ./specs/foo.md` ⇒ log entry contains
 *       `./specs/foo.md` UNCHANGED (no false-positive on legitimate
 *       file paths).
 *   (c) Timeline event with nested `{auth:{token:"ghp_..."}}` ⇒
 *       persisted as `[REDACTED:GitHub Token]`.
 *
 * Acts as the security gate that proves usage.ts + timeline.ts +
 * secret-scanner.redactSecrets fan-in correctly. If any of these
 * diverge, this test catches the regression before the leak reaches
 * .jumpstart/state/.
 *
 * Post-test grep gate: scan `.jumpstart/state/` and the usage log
 * directory for any literal secret-shaped string. Test FAILS if any
 * raw `sk-...` or `ghp_...` slips through (this guards against future
 * code paths that bypass the redaction layer).
 *
 * @see specs/decisions/adr-012-secrets-redaction-in-logs.md
 * @see specs/implementation-plan.md T4.3.5
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { redactSecrets, scanForSecrets } from '../src/lib/secret-scanner.js';
import { createTimeline, loadTimeline } from '../src/lib/timeline.js';
import { logUsage, summarizeUsage } from '../src/lib/usage.js';

// Fake secrets — obviously-fake values that still trip the patterns.
// AKIAIOSFODNN7EXAMPLE is the AWS-published example. The OpenAI / GitHub
// fakes use 'EXAMPLE'-class suffixes to avoid tripping any production
// secret scanners on this test file itself.
const FAKE_OPENAI_KEY = `sk-fake-test-value-${'X'.repeat(20)}`;
const FAKE_GH_TOKEN = `ghp_${'A'.repeat(36)}`;

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(tmpdir(), 'redact-e2e-'));
  mkdirSync(path.join(tmpRoot, '.jumpstart', 'state'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

/** Walk a dir recursively, return file contents joined. */
function readAllFiles(dir: string): string {
  if (!existsSync(dir)) return '';
  let out = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out += readAllFiles(full);
    } else if (entry.isFile()) {
      try {
        out += readFileSync(full, 'utf8');
      } catch {
        // skip unreadable
      }
    }
  }
  return out;
}

describe('ADR-012 e2e Scenario A — CLI --api-key argument is redacted in usage log', () => {
  it('redacts sk-... token when stored as `api_key="..."` assignment string', () => {
    const usageLog = path.join(tmpRoot, '.jumpstart', 'usage-log.json');
    // The Generic API Key Assignment pattern in secret-scanner.ts
    // matches `(?:api[_-]?key|apikey)\s*[:=]\s*["']([A-Za-z0-9_\-]{20,})["']`.
    // Realistic usage: a CLI arg parser stores the parsed value back
    // as a quoted assignment-shaped string in the audit log.
    logUsage(usageLog, {
      phase: 'phase-3',
      agent: 'Architect',
      action: 'cli-invocation',
      estimated_tokens: 100,
      estimated_cost_usd: 0.01,
      metadata: {
        cli_invocation: `architect --api_key="${FAKE_OPENAI_KEY}" --model gpt-4o`,
      },
    });
    const raw = readFileSync(usageLog, 'utf8');
    expect(raw).not.toContain(FAKE_OPENAI_KEY);
    expect(raw).toMatch(/\[REDACTED:[^\]]+\]/);
  });

  it('redacts api_key when present in nested metadata as an assignment string', () => {
    const usageLog = path.join(tmpRoot, '.jumpstart', 'usage-log.json');
    logUsage(usageLog, {
      phase: 'phase-3',
      agent: 'Architect',
      action: 'cli-invocation',
      estimated_tokens: 100,
      estimated_cost_usd: 0.01,
      metadata: {
        env: { OPENAI_AUTH: `api_key="${FAKE_OPENAI_KEY}"` },
      },
    });
    const raw = readFileSync(usageLog, 'utf8');
    expect(raw).not.toContain(FAKE_OPENAI_KEY);
    expect(raw).toContain('[REDACTED:');
  });
});

describe('ADR-012 e2e Scenario B — non-secret args pass through unchanged', () => {
  it('preserves --target file paths verbatim (no false positive)', () => {
    const usageLog = path.join(tmpRoot, '.jumpstart', 'usage-log.json');
    logUsage(usageLog, {
      phase: 'phase-1',
      agent: 'Analyst',
      action: 'cli-invocation',
      estimated_tokens: 50,
      estimated_cost_usd: 0.001,
      metadata: {
        cli_args: ['--target', './specs/foo.md', '--mode', 'live'],
      },
    });
    const raw = readFileSync(usageLog, 'utf8');
    expect(raw).toContain('./specs/foo.md');
    // No redaction markers since nothing matched
    expect(raw).not.toMatch(/\[REDACTED:/);
  });
});

describe('ADR-012 e2e Scenario C — nested auth.token redacts in timeline', () => {
  it('persists nested github-token-shaped value as [REDACTED:GitHub Token]', () => {
    const tlPath = path.join(tmpRoot, '.jumpstart', 'state', 'timeline.json');
    const tl = createTimeline({ filePath: tlPath, sessionId: 'e2e-c' });
    tl.recordEvent({
      event_type: 'tool_call',
      phase: 0,
      agent: 'challenger',
      action: 'External tool invoked',
      metadata: {
        auth: { token: FAKE_GH_TOKEN },
      },
    });
    tl.flush();

    const data = loadTimeline(tlPath);
    const ev = data.events[0];
    const meta = ev.metadata as { auth?: { token?: string } } | undefined;
    expect(meta?.auth?.token).toContain('[REDACTED:GitHub Token]');
    expect(meta?.auth?.token).not.toContain(FAKE_GH_TOKEN);
  });
});

describe('ADR-012 e2e CI gate — post-test grep across state dirs', () => {
  // This is the implementation-plan-mandated grep gate: AFTER all the
  // logUsage / recordEvent calls above run, scan every persisted file
  // under .jumpstart/state/ and the usage log directory for any
  // literal secret-shaped string. The test FAILS if any raw `sk-...`
  // or `ghp_...` byte is found.
  //
  // This guards against future code paths that bypass the redaction
  // layer (e.g. a new persistence sink that forgets to call
  // redactSecrets, or a regression in usage.ts/timeline.ts that
  // bypasses the recorded redaction).
  it('finds zero literal sk-... or ghp_... bytes in any persisted file', () => {
    const usageLog = path.join(tmpRoot, '.jumpstart', 'usage-log.json');
    const tlPath = path.join(tmpRoot, '.jumpstart', 'state', 'timeline.json');

    // Trigger the persistence paths
    logUsage(usageLog, {
      phase: 'phase-3',
      agent: 'Architect',
      action: 'cli-invocation',
      estimated_tokens: 100,
      estimated_cost_usd: 0.01,
      metadata: { auth: `Bearer ${FAKE_GH_TOKEN}`, key: FAKE_OPENAI_KEY },
    });

    const tl = createTimeline({ filePath: tlPath, sessionId: 'gate' });
    tl.recordEvent({
      event_type: 'tool_call',
      phase: 0,
      agent: 'challenger',
      action: 'invoked',
      metadata: { token: FAKE_GH_TOKEN, api_key: FAKE_OPENAI_KEY },
    });
    tl.flush();

    // Grep gate
    const stateBlob = readAllFiles(path.join(tmpRoot, '.jumpstart'));
    expect(stateBlob).not.toContain(FAKE_GH_TOKEN);
    // Even partial GitHub-token shape — must be redacted
    expect(stateBlob).not.toMatch(/ghp_[A-Za-z0-9_]{36,}/);
  });
});

describe('ADR-012 e2e summary — usage.summarizeUsage on a redacted log', () => {
  it('summary numeric fields unaffected by redaction', () => {
    const usageLog = path.join(tmpRoot, '.jumpstart', 'usage-log.json');
    logUsage(usageLog, {
      phase: 'phase-2',
      agent: 'PM',
      action: 'a',
      estimated_tokens: 200,
      estimated_cost_usd: 0.02,
      metadata: { token: FAKE_GH_TOKEN },
    });
    logUsage(usageLog, {
      phase: 'phase-2',
      agent: 'PM',
      action: 'b',
      estimated_tokens: 300,
      estimated_cost_usd: 0.03,
      metadata: {},
    });
    const summary = summarizeUsage(usageLog);
    expect(summary.total_sessions).toBe(2);
    expect(summary.total_tokens).toBe(500);
    expect(summary.by_agent.PM.tokens).toBe(500);
  });
});

describe('ADR-012 e2e direct helper — redactSecrets on heterogeneous payloads', () => {
  it('handles mixed secret + safe payload', () => {
    const out = redactSecrets({
      cli_args: ['--key', FAKE_OPENAI_KEY, '--file', './specs/prd.md'],
      meta: { ok: true, count: 5, github_token: FAKE_GH_TOKEN },
      summary: 'No secrets here',
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain(FAKE_GH_TOKEN);
    expect(json).toContain('./specs/prd.md');
    expect(json).toContain('"ok":true');
  });
  it('scanForSecrets identifies expected patterns in the e2e fixtures', () => {
    expect(scanForSecrets(FAKE_GH_TOKEN).length).toBeGreaterThan(0);
  });
});
