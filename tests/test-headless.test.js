/**
 * test-headless.test.js — Integration tests for headless agent emulation
 * 
 * Tests the core components of the headless runner:
 * - LLM Provider (mock mode)
 * - Tool Bridge
 * - Mock Response Registry
 * - Tool Schemas
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createProvider, getModelConfig, listModels } from '../src/lib/llm-provider.js';
import { createToolBridge } from '../src/lib/tool-bridge.js';
import { createMockRegistry, createPersonaRegistry } from '../src/lib/mock-responses.js';
import { ALL_TOOLS, getToolByName, getToolsForPhase } from '../src/lib/tool-schemas.js';
import { SimulationTracer } from '../src/lib/simulation-tracer.js';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

let tempDir;

beforeEach(() => {
  // Create temp directory for file operation tests
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-test-'));
  
  // Create test file
  fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n');
  fs.mkdirSync(path.join(tempDir, 'subdir'));
  fs.writeFileSync(path.join(tempDir, 'subdir', 'nested.js'), 'console.log("test");');
});

afterEach(() => {
  // Clean up temp directory
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ─── LLM Provider Tests ──────────────────────────────────────────────────────

describe('LLM Provider', () => {
  describe('Model Registry', () => {
    it('lists available models', () => {
      const models = listModels();
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('openai/gpt-5.2');
      expect(models).toContain('anthropic/claude-opus-4-5');
      expect(models).toContain('gemini/gemini-3-flash-preview');
    });
    
    it('gets model configuration', () => {
      const config = getModelConfig('openai/gpt-5-mini');
      expect(config).toBeDefined();
      expect(config.provider).toBe('openai');
      expect(config.apiModel).toBe('gpt-5-mini');
      expect(config.supportsTools).toBe(true);
    });
    
    it('returns null for unknown model', () => {
      const config = getModelConfig('unknown/model');
      expect(config).toBeNull();
    });
  });
  
  describe('Mock Mode', () => {
    it('creates provider in mock mode', () => {
      const provider = createProvider({
        model: 'openai/gpt-4o',
        mode: 'mock'
      });
      expect(provider).toBeDefined();
      expect(provider.mode).toBe('mock');
    });
    
    it('returns mock completion without API call', async () => {
      const provider = createProvider({
        model: 'openai/gpt-4o',
        mode: 'mock'
      });
      
      const response = await provider.completion([
        { role: 'user', content: 'Hello' }
      ]);
      
      expect(response).toBeDefined();
      expect(response.choices).toBeInstanceOf(Array);
      expect(response.choices[0].message.role).toBe('assistant');
    });
    
    it('tracks usage in mock mode', async () => {
      const provider = createProvider({
        model: 'openai/gpt-4o',
        mode: 'mock'
      });
      
      await provider.completion([{ role: 'user', content: 'Test' }]);
      await provider.completion([{ role: 'user', content: 'Test 2' }]);
      
      const usage = provider.getUsage();
      expect(usage.calls).toBe(2);
      expect(usage.totalTokens).toBeGreaterThan(0);
    });
  });
});

// ─── Tool Bridge Tests ───────────────────────────────────────────────────────

describe('Tool Bridge', () => {
  let bridge;
  
  beforeEach(() => {
    bridge = createToolBridge({
      workspaceDir: tempDir,
      dryRun: false
    });
  });
  
  describe('File Operations', () => {
    it('reads file content', async () => {
      const result = await bridge.execute({
        id: 'call-1',
        function: {
          name: 'read_file',
          arguments: JSON.stringify({
            filePath: path.join(tempDir, 'test.txt'),
            startLine: 1,
            endLine: 3
          })
        }
      });
      
      const content = JSON.parse(result.content);
      expect(content.error).toBeUndefined();
      expect(content.content).toContain('Line 1');
      expect(content.content).toContain('Line 3');
      expect(content.totalLines).toBe(6); // Including trailing newline
    });
    
    it('creates new file', async () => {
      const newFilePath = path.join(tempDir, 'new-file.txt');
      
      const result = await bridge.execute({
        id: 'call-2',
        function: {
          name: 'create_file',
          arguments: JSON.stringify({
            filePath: newFilePath,
            content: 'New content'
          })
        }
      });
      
      const content = JSON.parse(result.content);
      expect(content.success).toBe(true);
      expect(fs.existsSync(newFilePath)).toBe(true);
      expect(fs.readFileSync(newFilePath, 'utf8')).toBe('New content');
    });
    
    it('creates nested directories', async () => {
      const nestedPath = path.join(tempDir, 'a', 'b', 'c', 'file.txt');
      
      await bridge.execute({
        id: 'call-3',
        function: {
          name: 'create_file',
          arguments: JSON.stringify({
            filePath: nestedPath,
            content: 'Nested'
          })
        }
      });
      
      expect(fs.existsSync(nestedPath)).toBe(true);
    });
    
    it('lists directory contents', async () => {
      const result = await bridge.execute({
        id: 'call-4',
        function: {
          name: 'list_dir',
          arguments: JSON.stringify({ path: tempDir })
        }
      });
      
      const content = JSON.parse(result.content);
      expect(content.items).toBeInstanceOf(Array);
      expect(content.items.find(i => i.name === 'test.txt')).toBeDefined();
      expect(content.items.find(i => i.name === 'subdir/')).toBeDefined();
    });
    
    it('replaces string in file', async () => {
      const result = await bridge.execute({
        id: 'call-5',
        function: {
          name: 'replace_string_in_file',
          arguments: JSON.stringify({
            filePath: path.join(tempDir, 'test.txt'),
            oldString: 'Line 2',
            newString: 'Modified Line 2'
          })
        }
      });
      
      const content = JSON.parse(result.content);
      expect(content.success).toBe(true);
      
      const fileContent = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf8');
      expect(fileContent).toContain('Modified Line 2');
    });
  });
  
  describe('Search Operations', () => {
    it('searches files by glob pattern', async () => {
      const result = await bridge.execute({
        id: 'call-6',
        function: {
          name: 'file_search',
          arguments: JSON.stringify({ query: '**/*.js' })
        }
      });
      
      const content = JSON.parse(result.content);
      expect(content.matches).toBeInstanceOf(Array);
      expect(content.matches.some(m => m.includes('nested.js'))).toBe(true);
    });
    
    it('does grep search', async () => {
      const result = await bridge.execute({
        id: 'call-7',
        function: {
          name: 'grep_search',
          arguments: JSON.stringify({
            query: 'console',
            isRegexp: false
          })
        }
      });
      
      const content = JSON.parse(result.content);
      expect(content.results).toBeInstanceOf(Array);
      expect(content.results.length).toBeGreaterThan(0);
      expect(content.results[0].content).toContain('console');
    });
  });
  
  describe('ask_questions Handler', () => {
    it('returns default answers when no proxy', async () => {
      const result = await bridge.execute({
        id: 'call-8',
        function: {
          name: 'ask_questions',
          arguments: JSON.stringify({
            questions: [{
              header: 'TechChoice',
              question: 'Which tech?',
              options: [
                { label: 'Option A', recommended: true },
                { label: 'Option B' }
              ]
            }]
          })
        }
      });
      
      const content = JSON.parse(result.content);
      expect(content.answers).toBeDefined();
      expect(content.answers.TechChoice.selected).toContain('Option A'); // Recommended
    });
    
    it('routes to user proxy callback when provided', async () => {
      let proxyCalledWith = null;
      
      const bridgeWithProxy = createToolBridge({
        workspaceDir: tempDir,
        onUserProxyCall: async (args) => {
          proxyCalledWith = args;
          return {
            answers: {
              TestHeader: { selected: ['Custom Answer'], freeText: null, skipped: false }
            }
          };
        }
      });
      
      const result = await bridgeWithProxy.execute({
        id: 'call-9',
        function: {
          name: 'ask_questions',
          arguments: JSON.stringify({
            questions: [{
              header: 'TestHeader',
              question: 'Test question?',
              options: [{ label: 'Custom Answer' }]
            }]
          })
        }
      });
      
      expect(proxyCalledWith).toBeDefined();
      expect(proxyCalledWith.questions[0].header).toBe('TestHeader');
      
      const content = JSON.parse(result.content);
      expect(content.answers.TestHeader.selected).toContain('Custom Answer');
    });
  });
  
  describe('manage_todo_list Handler', () => {
    it('tracks todo state', async () => {
      await bridge.execute({
        id: 'call-10',
        function: {
          name: 'manage_todo_list',
          arguments: JSON.stringify({
            todoList: [
              { id: 1, title: 'Task 1', status: 'completed' },
              { id: 2, title: 'Task 2', status: 'in-progress' }
            ]
          })
        }
      });
      
      const state = bridge.getTodoState();
      expect(state.length).toBe(2);
      expect(state[0].status).toBe('completed');
    });
  });
  
  describe('Dry Run Mode', () => {
    it('does not write files in dry run', async () => {
      const dryBridge = createToolBridge({
        workspaceDir: tempDir,
        dryRun: true
      });
      
      const newFilePath = path.join(tempDir, 'dry-run-file.txt');
      
      const result = await dryBridge.execute({
        id: 'call-11',
        function: {
          name: 'create_file',
          arguments: JSON.stringify({
            filePath: newFilePath,
            content: 'Should not exist'
          })
        }
      });
      
      const content = JSON.parse(result.content);
      expect(content.dryRun).toBe(true);
      expect(fs.existsSync(newFilePath)).toBe(false);
    });
  });
  
  describe('Call History', () => {
    it('tracks call history', async () => {
      await bridge.execute({
        id: 'call-12',
        function: { name: 'list_dir', arguments: JSON.stringify({ path: tempDir }) }
      });
      
      await bridge.execute({
        id: 'call-13',
        function: { 
          name: 'read_file', 
          arguments: JSON.stringify({ 
            filePath: path.join(tempDir, 'test.txt'),
            startLine: 1,
            endLine: 1
          }) 
        }
      });
      
      const history = bridge.getCallHistory();
      expect(history.length).toBe(2);
      expect(history[0].name).toBe('list_dir');
      expect(history[1].name).toBe('read_file');
    });
  });
});

// ─── Mock Response Registry Tests ────────────────────────────────────────────

describe('Mock Response Registry', () => {
  it('provides default ask_questions responses', () => {
    const registry = createMockRegistry();
    
    const response = registry.getAskQuestionsResponse({
      questions: [{
        header: 'TechPrefs',
        question: 'Which stack?',
        options: [{ label: 'Node.js' }, { label: 'Python' }]
      }]
    });
    
    expect(response.answers.TechPrefs.selected).toContain('Node.js with Express');
  });
  
  it('falls back to recommended option', () => {
    const registry = createMockRegistry();
    
    const response = registry.getAskQuestionsResponse({
      questions: [{
        header: 'UnknownQuestion',
        question: 'Unknown?',
        options: [
          { label: 'A' },
          { label: 'B', recommended: true },
          { label: 'C' }
        ]
      }]
    });
    
    expect(response.answers.UnknownQuestion.selected).toContain('B');
  });
  
  it('creates persona-specific registry', () => {
    const registry = createPersonaRegistry('enterprise-user');
    
    const response = registry.getAskQuestionsResponse({
      questions: [{
        header: 'TechPrefs',
        question: 'Which stack?',
        options: [{ label: 'Java' }, { label: 'Node.js' }]
      }]
    });
    
    expect(response.answers.TechPrefs.selected).toContain('Java with Spring Boot');
  });
  
  it('allows custom responses', () => {
    const registry = createMockRegistry();
    registry.setAskQuestionsResponse('CustomKey', {
      selected: ['Custom Value'],
      freeText: null,
      skipped: false
    });
    
    const response = registry.getAskQuestionsResponse({
      questions: [{
        header: 'CustomKey',
        question: 'Custom?',
        options: [{ label: 'Custom Value' }]
      }]
    });
    
    expect(response.answers.CustomKey.selected).toContain('Custom Value');
  });
  
  it('tracks call count', () => {
    const registry = createMockRegistry();
    expect(registry.getCallCount()).toBe(0);
    
    registry.getAskQuestionsResponse({ questions: [{ header: 'A', question: 'Q?' }] });
    registry.getAskQuestionsResponse({ questions: [{ header: 'B', question: 'Q?' }] });
    
    expect(registry.getCallCount()).toBe(2);
  });
});

// ─── Tool Schemas Tests ──────────────────────────────────────────────────────

describe('Tool Schemas', () => {
  it('exports all tools', () => {
    expect(ALL_TOOLS).toBeInstanceOf(Array);
    expect(ALL_TOOLS.length).toBeGreaterThan(5);
  });
  
  it('gets tools for architect phase', () => {
    const tools = getToolsForPhase('architect');
    expect(tools).toBeInstanceOf(Array);
    
    const toolNames = tools.map(t => t.function.name);
    expect(toolNames).toContain('ask_questions');
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('create_file');
  });
  
  it('gets tools for developer phase', () => {
    const tools = getToolsForPhase('developer');
    expect(tools).toBeInstanceOf(Array);
    
    const toolNames = tools.map(t => t.function.name);
    expect(toolNames).toContain('run_in_terminal');
  });
  
  it('finds tool by name', () => {
    const tool = getToolByName('ask_questions');
    expect(tool).toBeDefined();
    expect(tool.function.name).toBe('ask_questions');
    expect(tool.function.parameters.properties.questions).toBeDefined();
  });
  
  it('returns null for unknown tool', () => {
    const tool = getToolByName('unknown_tool');
    expect(tool).toBeNull();
  });
  
  it('ask_questions schema has correct structure', () => {
    const tool = getToolByName('ask_questions');
    const params = tool.function.parameters;
    
    expect(params.properties.questions).toBeDefined();
    expect(params.properties.questions.type).toBe('array');
    expect(params.properties.questions.items.properties.header).toBeDefined();
    expect(params.properties.questions.items.properties.question).toBeDefined();
    expect(params.properties.questions.items.properties.options).toBeDefined();
  });
});

// ─── Simulation Tracer Tests ─────────────────────────────────────────────────

describe('Simulation Tracer', () => {
  let tracer;
  
  beforeEach(() => {
    tracer = new SimulationTracer(tempDir, 'test-scenario');
  });
  
  it('tracks phases', () => {
    tracer.startPhase('architect');
    tracer.logArtifact('architecture.md');
    tracer.endPhase('architect', 'PASS');
    
    const report = tracer.getReport();
    expect(report.phases.length).toBe(1);
    expect(report.phases[0].name).toBe('architect');
    expect(report.phases[0].status).toBe('PASS');
    expect(report.phases[0].artifacts).toContain('architecture.md');
  });
  
  it('tracks LLM calls', () => {
    tracer.startPhase('test');
    tracer.logLLMCall('openai/gpt-4o', 100, 50, 0.01);
    tracer.logLLMCall('openai/gpt-4o', 200, 100, 0.02);
    tracer.endPhase('test', 'PASS');
    
    const usage = tracer.getLLMUsageSummary();
    expect(usage.totalCalls).toBe(2);
    expect(usage.totalPromptTokens).toBe(300);
    expect(usage.totalCompletionTokens).toBe(150);
    expect(usage.byModel['openai/gpt-4o'].calls).toBe(2);
  });
  
  it('tracks tool interceptions', () => {
    tracer.startPhase('test');
    tracer.logToolInterception('read_file', { path: '/test' }, { content: 'data' });
    tracer.endPhase('test', 'PASS');
    
    const transcript = tracer.getConversationTranscript();
    expect(transcript.length).toBeGreaterThan(0);
    expect(transcript.some(t => t.type === 'tool_call')).toBe(true);
  });
  
  it('tracks user proxy exchanges', () => {
    tracer.startPhase('test');
    tracer.logUserProxyExchange(
      { questions: [{ header: 'Test', question: 'Q?' }] },
      'Approved'
    );
    tracer.endPhase('test', 'PASS');
    
    const transcript = tracer.getConversationTranscript();
    expect(transcript.some(t => t.type === 'user_proxy_question')).toBe(true);
    expect(transcript.some(t => t.type === 'user_proxy_response')).toBe(true);
  });
  
  it('includes headless data in report', () => {
    tracer.startPhase('test');
    tracer.logLLMCall('openai/gpt-4o', 100, 50);
    tracer.logToolInterception('list_dir', {}, {});
    tracer.endPhase('test', 'PASS');
    
    const report = tracer.getReport();
    expect(report.headless).toBeDefined();
    expect(report.headless.llm_usage.totalCalls).toBe(1);
    expect(report.headless.tool_interceptions).toBe(1);
  });
  
  it('generateReport is alias for getReport', () => {
    tracer.startPhase('test');
    tracer.endPhase('test', 'PASS');

    const report1 = tracer.getReport();
    const report2 = tracer.generateReport();

    expect(report1.scenario).toBe(report2.scenario);
    expect(report1.phases.length).toBe(report2.phases.length);
  });
});

// ─── Holodeck Tracer API (pin the contract so API drift surfaces in CI) ──────

describe('Simulation Tracer — Holodeck API', () => {
  let tracer;

  beforeEach(() => {
    tracer = new SimulationTracer(tempDir, 'test-scenario');
  });

  it('exposes every method holodeck.js calls', () => {
    const required = [
      'startPhase', 'endPhase', 'logArtifact',
      'logError', 'logWarning', 'logSubagentVerified',
      'logDocumentCreation', 'logCostTracking', 'logHandoffValidation',
      'getReport', 'printSummary', 'saveReport'
    ];
    for (const m of required) {
      expect(typeof tracer[m]).toBe('function');
    }
  });

  it('logError collects error + attaches to current phase', () => {
    tracer.startPhase('validator');
    tracer.logError('missing section X');
    tracer.endPhase('validator', 'FAIL');

    const r = tracer.getReport();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toBe('missing section X');
    expect(r.errors[0].phase).toBe('validator');
    expect(r.phases[0].errors).toContain('missing section X');
  });

  it('logError accepts explicit phase override', () => {
    tracer.logError('boom', 'developer');
    expect(tracer.getReport().errors[0].phase).toBe('developer');
  });

  it('logWarning collects without affecting phase status', () => {
    tracer.startPhase('scout');
    tracer.logWarning('no fixtures found');
    tracer.endPhase('scout', 'PASS');

    const r = tracer.getReport();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].message).toBe('no fixtures found');
    expect(r.phases[0].status).toBe('PASS');
  });

  it('logSubagentVerified records the agent name and phase', () => {
    tracer.startPhase('architect');
    tracer.logSubagentVerified('Jump Start: Security');
    tracer.endPhase('architect', 'PASS');

    const r = tracer.getReport();
    expect(r.verifiedSubagents).toHaveLength(1);
    expect(r.verifiedSubagents[0].agent).toBe('Jump Start: Security');
    expect(r.verifiedSubagents[0].phase).toBe('architect');
  });

  it('logDocumentCreation records status', () => {
    tracer.logDocumentCreation('TODO.md', 'CREATED');
    tracer.logDocumentCreation('implementation-plan.md', 'MISSING');
    const r = tracer.getReport();
    expect(r.documentCreations).toHaveLength(2);
    expect(r.documentCreations[0]).toMatchObject({ document: 'TODO.md', status: 'CREATED' });
    expect(r.documentCreations[1]).toMatchObject({ document: 'implementation-plan.md', status: 'MISSING' });
  });

  it('logCostTracking aggregates prompt + completion tokens', () => {
    tracer.startPhase('pm');
    tracer.logCostTracking(1200, 500);
    tracer.logCostTracking(800, 200);
    tracer.endPhase('pm', 'PASS');

    const r = tracer.getReport();
    expect(r.costTracking.totalPromptTokens).toBe(2000);
    expect(r.costTracking.totalCompletionTokens).toBe(700);
    expect(r.phases[0].promptTokens).toBe(2000);
    expect(r.phases[0].completionTokens).toBe(700);
  });

  it('logHandoffValidation records status and any errors', () => {
    tracer.startPhase('developer');
    tracer.logHandoffValidation('PASS', {});
    tracer.logHandoffValidation('FAIL', { errors: ['Missing required field: project_type'] });
    tracer.logHandoffValidation('SKIP');
    tracer.endPhase('developer', 'PASS');

    const r = tracer.getReport();
    expect(r.handoffValidations).toHaveLength(3);
    expect(r.handoffValidations.map(h => h.status)).toEqual(['PASS', 'FAIL', 'SKIP']);
    expect(r.handoffValidations[1].errors).toContain('Missing required field: project_type');
  });

  it('report.success is true when every phase passes and nothing fails', () => {
    tracer.startPhase('scout');
    tracer.logHandoffValidation('SKIP');
    tracer.endPhase('scout', 'PASS');

    expect(tracer.getReport().success).toBe(true);
  });

  it('report.success is false when any phase FAILs', () => {
    tracer.startPhase('validator');
    tracer.endPhase('validator', 'FAIL');

    expect(tracer.getReport().success).toBe(false);
  });

  it('report.success is false when errors were recorded', () => {
    tracer.startPhase('scout');
    tracer.logError('something blew up');
    tracer.endPhase('scout', 'PASS'); // phase-status alone is PASS...

    expect(tracer.getReport().success).toBe(false); // ...but an error sinks success
  });

  it('report.success is false when a handoff validation FAILs', () => {
    tracer.startPhase('developer');
    tracer.logHandoffValidation('FAIL', { errors: ['schema mismatch'] });
    tracer.endPhase('developer', 'PASS');

    expect(tracer.getReport().success).toBe(false);
  });

  it('report.success is false when no phases ran', () => {
    // Guards against trivially-empty reports being marked "success"
    expect(tracer.getReport().success).toBe(false);
  });

  it('printSummary produces output without throwing', () => {
    tracer.startPhase('scout');
    tracer.logArtifact('codebase-context.md');
    tracer.logCostTracking(1000, 200);
    tracer.logHandoffValidation('SKIP');
    tracer.endPhase('scout', 'PASS');

    const logs = [];
    const orig = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      tracer.printSummary();
    } finally {
      console.log = orig;
    }
    expect(logs.some(l => l.includes('Scenario'))).toBe(true);
    expect(logs.some(l => l.includes('PASS'))).toBe(true);
  });

  it('saveReport writes a JSON file with the expected top-level fields', () => {
    tracer.startPhase('pm');
    tracer.logArtifact('prd.md');
    tracer.endPhase('pm', 'PASS');

    const out = path.join(tempDir, 'nested', 'subdir', 'report.json');
    tracer.saveReport(out);

    expect(fs.existsSync(out)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
    for (const key of [
      'scenario', 'timestamp', 'success', 'phases', 'errors', 'warnings',
      'verifiedSubagents', 'documentCreations', 'handoffValidations',
      'costTracking', 'headless'
    ]) {
      expect(parsed).toHaveProperty(key);
    }
    expect(parsed.success).toBe(true);
    expect(parsed.phases).toHaveLength(1);
  });
});
