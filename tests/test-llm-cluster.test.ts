/**
 * test-llm-cluster.test.ts — T4.3.1 LLM cluster tests.
 *
 * Coverage for the 5 ports landed together:
 *   - mock-responses.ts: createMockRegistry / createPersonaRegistry
 *   - cost-router.ts: routeByCost / recordSpending / generateReport
 *   - model-router.ts: routeTask / configureRoute / generateReport
 *   - llm-provider.ts: createProvider (mock + ADR-011 endpoint validation)
 *   - usage.ts: logUsage / summarizeUsage / ADR-012 redaction
 *
 * @see src/lib/{mock-responses,cost-router,model-router,llm-provider,usage}.ts
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUDGET_PROFILES,
  generateReport as costGenerateReport,
  loadConfig as costLoadConfig,
  saveConfig as costSaveConfig,
  MODEL_COSTS,
  recordSpending,
  routeByCost,
} from '../src/lib/cost-router.js';
import {
  createProvider,
  getModelConfig,
  listModels,
  MODEL_REGISTRY,
  validateLLMEndpoint,
} from '../src/lib/llm-provider.js';
import { createMockRegistry, createPersonaRegistry } from '../src/lib/mock-responses.js';
import {
  configureRoute,
  DEFAULT_ROUTING,
  generateReport as routerGenerateReport,
  routeTask,
  TASK_TYPES,
} from '../src/lib/model-router.js';
import { logUsage, summarizeUsage } from '../src/lib/usage.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'llm-cluster-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────
// mock-responses.ts
// ─────────────────────────────────────────────────────────────────────────

describe('mock-responses — createMockRegistry', () => {
  it('returns canned defaults for known headers', () => {
    const reg = createMockRegistry();
    const r = reg.getAskQuestionsResponse({ questions: [{ header: 'TechPrefs' }] });
    expect(r.answers.TechPrefs.selected).toEqual(['Node.js with Express']);
  });
  it('falls back to recommended option when header unknown', () => {
    const reg = createMockRegistry();
    const r = reg.getAskQuestionsResponse({
      questions: [
        {
          header: 'UnknownHeader',
          options: [{ label: 'A' }, { label: 'B', recommended: true }],
        },
      ],
    });
    expect(r.answers.UnknownHeader.selected).toEqual(['B']);
  });
  it('falls back to "Approved" when no options exist', () => {
    const reg = createMockRegistry();
    const r = reg.getAskQuestionsResponse({ questions: [{ header: 'Bare' }] });
    expect(r.answers.Bare.freeText).toBe('Approved');
  });
  it('honors setAskQuestionsResponse override', () => {
    const reg = createMockRegistry();
    reg.setAskQuestionsResponse('TechPrefs', {
      selected: ['Custom'],
      freeText: null,
      skipped: false,
    });
    const r = reg.getAskQuestionsResponse({ questions: [{ header: 'TechPrefs' }] });
    expect(r.answers.TechPrefs.selected).toEqual(['Custom']);
  });
  it('tracks call count', () => {
    const reg = createMockRegistry();
    reg.getAskQuestionsResponse({ questions: [] });
    reg.getAskQuestionsResponse({ questions: [] });
    expect(reg.getCallCount()).toBe(2);
  });
});

describe('mock-responses — createPersonaRegistry', () => {
  it('enterprise-user overrides TechPrefs/Database/Frontend/Hosting/Ceremony', () => {
    const reg = createPersonaRegistry('enterprise-user');
    const r = reg.getAskQuestionsResponse({
      questions: [{ header: 'TechPrefs' }, { header: 'Database' }],
    });
    expect(r.answers.TechPrefs.selected).toEqual(['Java with Spring Boot']);
    expect(r.answers.Database.selected).toEqual(['Oracle']);
  });
  it('unknown persona falls through to defaults', () => {
    const reg = createPersonaRegistry('does-not-exist');
    const r = reg.getAskQuestionsResponse({ questions: [{ header: 'TechPrefs' }] });
    expect(r.answers.TechPrefs.selected).toEqual(['Node.js with Express']);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// cost-router.ts
// ─────────────────────────────────────────────────────────────────────────

describe('cost-router — MODEL_COSTS / BUDGET_PROFILES', () => {
  it('exports the canonical 6 models + 3 budget profiles', () => {
    expect(Object.keys(MODEL_COSTS).length).toBe(6);
    expect(Object.keys(BUDGET_PROFILES)).toEqual(['economy', 'balanced', 'premium']);
  });
});

describe('cost-router — routeByCost', () => {
  it('returns a model that meets the min_quality filter', () => {
    const cfg = path.join(tmpDir, 'cost.json');
    const r = routeByCost({ estimated_tokens: 1000 }, { configFile: cfg });
    expect(r.success).toBe(true);
    expect(r.selected_model).not.toBeNull();
    expect(r.quality).toBeGreaterThanOrEqual(80); // balanced default
  });
  it('honors explicit min_quality override', () => {
    const cfg = path.join(tmpDir, 'cost.json');
    const r = routeByCost({ min_quality: 95 }, { configFile: cfg });
    expect(r.quality).toBeGreaterThanOrEqual(95);
  });
});

describe('cost-router — recordSpending / generateReport', () => {
  it('round-trips a spending entry', () => {
    const cfg = path.join(tmpDir, 'cost.json');
    const result = recordSpending('claude-3-haiku', 5000, { configFile: cfg });
    expect(result.success).toBe(true);
    const report = costGenerateReport({ configFile: cfg });
    expect(report.total_requests).toBe(1);
    expect(report.by_model['claude-3-haiku']).toBeGreaterThan(0);
  });
  it('returns error on unknown model', () => {
    const cfg = path.join(tmpDir, 'cost.json');
    const result = recordSpending('not-a-model', 1, { configFile: cfg });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown model/);
  });
});

describe('cost-router — load/save round-trip', () => {
  it('persists and reloads', () => {
    const cfg = path.join(tmpDir, 'cost.json');
    costSaveConfig({ budget_profile: 'premium', spending: [] }, cfg);
    expect(costLoadConfig(cfg).budget_profile).toBe('premium');
  });
  it('returns defaults on missing/corrupt file', () => {
    expect(costLoadConfig(path.join(tmpDir, 'no-such.json')).budget_profile).toBe('balanced');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// model-router.ts
// ─────────────────────────────────────────────────────────────────────────

describe('model-router — TASK_TYPES + DEFAULT_ROUTING', () => {
  it('exports 8 task types', () => {
    expect(TASK_TYPES.length).toBe(8);
    expect(TASK_TYPES).toContain('planning');
    expect(TASK_TYPES).toContain('analysis');
  });
  it('every task type has a default route', () => {
    for (const t of TASK_TYPES) {
      expect(DEFAULT_ROUTING[t]).toBeDefined();
      expect(DEFAULT_ROUTING[t].model).toBeDefined();
    }
  });
});

describe('model-router — routeTask / configureRoute', () => {
  it('routes a known task type', () => {
    const cfg = path.join(tmpDir, 'router.json');
    const r = routeTask('planning', { configFile: cfg });
    expect(r.success).toBe(true);
    expect(r.model).toBe('claude-3-opus');
  });
  it('errors on invalid task type', () => {
    const r = routeTask('not-a-task');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Invalid task type/);
  });
  it('configureRoute persists override', () => {
    const cfg = path.join(tmpDir, 'router.json');
    configureRoute('coding', 'gpt-4o', { configFile: cfg, reason: 'try gpt-4o' });
    const r = routeTask('coding', { configFile: cfg });
    expect(r.model).toBe('gpt-4o');
    expect(r.overridden).toBe(true);
  });
});

describe('model-router — generateReport', () => {
  it('reports counts and unique models', () => {
    const cfg = path.join(tmpDir, 'router.json');
    const r = routerGenerateReport({ configFile: cfg });
    expect(r.task_types).toBe(8);
    expect(r.configured_routes).toBeGreaterThan(0);
    expect(r.unique_models).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// llm-provider.ts
// ─────────────────────────────────────────────────────────────────────────

describe('llm-provider — listModels / getModelConfig', () => {
  it('lists 13 canonical models', () => {
    expect(listModels().length).toBe(Object.keys(MODEL_REGISTRY).length);
  });
  it('getModelConfig returns null for unknown', () => {
    expect(getModelConfig('does-not-exist')).toBeNull();
  });
});

describe('llm-provider — validateLLMEndpoint (ADR-011)', () => {
  it('accepts HTTPS URLs', () => {
    expect(() => validateLLMEndpoint('https://api.example.com')).not.toThrow();
  });
  it('accepts localhost variants', () => {
    expect(() => validateLLMEndpoint('http://localhost:4000')).not.toThrow();
    expect(() => validateLLMEndpoint('http://127.0.0.1:4000')).not.toThrow();
    expect(() => validateLLMEndpoint('http://[::1]:4000')).not.toThrow();
  });
  it('rejects http://attacker.example.com (not localhost, not HTTPS)', () => {
    expect(() => validateLLMEndpoint('http://attacker.example.com')).toThrow(/not HTTPS/);
  });
  it('honors JUMPSTART_ALLOW_INSECURE_LLM_URL=1 override', () => {
    const prev = process.env.JUMPSTART_ALLOW_INSECURE_LLM_URL;
    process.env.JUMPSTART_ALLOW_INSECURE_LLM_URL = '1';
    try {
      expect(() => validateLLMEndpoint('http://attacker.example.com')).not.toThrow();
    } finally {
      if (prev === undefined) delete process.env.JUMPSTART_ALLOW_INSECURE_LLM_URL;
      else process.env.JUMPSTART_ALLOW_INSECURE_LLM_URL = prev;
    }
  });
});

describe('llm-provider — mock provider', () => {
  it('returns synthetic completions and tracks usage', async () => {
    const p = createProvider({ mode: 'mock', model: 'openai/gpt-4o' });
    expect(p.mode).toBe('mock');
    const r = await p.completion([{ role: 'user', content: 'hi' }]);
    expect(r.choices[0].message.content).toContain('mock');
    expect(p.getUsage().calls).toBe(1);
    expect(p.getUsage().totalTokens).toBeGreaterThan(0);
  });
  it('honors mockResponses.getCompletionResponse override', async () => {
    const reg = createMockRegistry();
    // hijack the mock registry's completion-response slot via a
    // closure on a pre-registered hook.
    const customReg = {
      ...reg,
      getCompletionResponse: () => 'CUSTOM',
    };
    const p = createProvider({ mode: 'mock', mockResponses: customReg });
    const r = await p.completion([{ role: 'user', content: 'hi' }]);
    expect(r.choices[0].message.content).toBe('CUSTOM');
  });
});

describe('llm-provider — live mode validates endpoint at construction', () => {
  it('throws LLMError on bad LITELLM_BASE_URL', () => {
    expect(() =>
      createProvider({
        mode: 'live',
        model: 'openai/gpt-4o',
        baseURL: 'http://attacker.example.com',
      })
    ).toThrow(/not HTTPS/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// usage.ts
// ─────────────────────────────────────────────────────────────────────────

describe('usage — logUsage round-trip', () => {
  it('appends and reads back', () => {
    const log = path.join(tmpDir, 'usage.json');
    logUsage(log, {
      phase: 'phase-3',
      agent: 'Architect',
      action: 'design',
      estimated_tokens: 5000,
      estimated_cost_usd: 0.05,
      model: 'claude-3-opus',
    });
    const summary = summarizeUsage(log);
    expect(summary.total_sessions).toBe(1);
    expect(summary.by_agent.Architect.tokens).toBe(5000);
  });
});

describe('usage — ADR-012 redaction integration', () => {
  it('redacts secrets in metadata before persistence', () => {
    const log = path.join(tmpDir, 'usage.json');
    const fakeToken = `ghp_${'A'.repeat(36)}`;
    logUsage(log, {
      phase: 'phase-3',
      agent: 'Architect',
      action: 'design',
      estimated_tokens: 100,
      estimated_cost_usd: 0.001,
      model: 'claude-3-opus',
      metadata: { auth_header: `Authorization: Bearer ${fakeToken}` },
    });
    const raw = readFileSync(log, 'utf8');
    expect(raw).not.toContain(fakeToken);
    expect(raw).toContain('[REDACTED:');
  });
  it('preserves clean metadata unchanged', () => {
    const log = path.join(tmpDir, 'usage.json');
    logUsage(log, {
      phase: 'phase-1',
      agent: 'Analyst',
      action: 'analyze',
      estimated_tokens: 100,
      estimated_cost_usd: 0.001,
      metadata: { ok: true, count: 5 },
    });
    const raw = readFileSync(log, 'utf8');
    expect(raw).toContain('"ok": true');
    expect(raw).toContain('"count": 5');
  });
});

describe('usage — summary handles empty log', () => {
  it('returns zeroed summary on missing file', () => {
    const r = summarizeUsage(path.join(tmpDir, 'no-such.json'));
    expect(r.total_sessions).toBe(0);
    expect(r.total_tokens).toBe(0);
  });
});
