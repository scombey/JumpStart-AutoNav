/**
 * simulation-tracer.js — Headless Agent Simulation Tracer
 *
 * Records phases, LLM calls, tool interceptions, user proxy exchanges,
 * errors, warnings, subagent verifications, document creations, and
 * handoff validations during headless agent runs. Produces structured
 * reports for analysis (both HeadlessRunner and Holodeck consume this).
 *
 * When a timeline instance is attached via setTimeline(), events are also
 * forwarded to the timeline module for unified interaction recording.
 */

'use strict';

const fs = require('fs');
const path = require('path');

class SimulationTracer {
  /**
   * @param {string} workspaceDir — Workspace root for this simulation
   * @param {string} scenario — Scenario or run name
   */
  constructor(workspaceDir, scenario) {
    this.workspaceDir = workspaceDir;
    this.scenario = scenario;
    this.phases = [];
    this.currentPhase = null;
    this.transcript = [];
    this.llmCalls = [];
    this.toolInterceptionCount = 0;

    // Holodeck-oriented collectors. Kept empty for pure headless runs; the
    // fields appear in the report either way so downstream consumers can rely
    // on their presence.
    this.errors = [];
    this.warnings = [];
    this.verifiedSubagents = [];
    this.documentCreations = [];
    this.handoffValidations = [];
    this.costTracking = { totalPromptTokens: 0, totalCompletionTokens: 0 };

    /** @type {import('./timeline.js').Timeline|null} */
    this._timeline = null;
  }

  /**
   * Attach a timeline instance for event delegation.
   * When set, all tracer events are also recorded to the timeline.
   * @param {import('./timeline.js').Timeline} timeline
   */
  setTimeline(timeline) {
    this._timeline = timeline;
  }

  /**
   * Mark the start of a phase.
   * @param {string} name — Phase/agent name
   */
  startPhase(name) {
    this.currentPhase = {
      name,
      status: 'RUNNING',
      startTime: Date.now(),
      endTime: null,
      artifacts: [],
      toolCalls: 0,
      llmCalls: 0,
      errors: [],
      promptTokens: 0,
      completionTokens: 0
    };
    this.phases.push(this.currentPhase);
    if (this._timeline) {
      this._timeline.setPhase(name);
      this._timeline.recordEvent({ event_type: 'phase_start', action: `Phase started: ${name}`, metadata: { phase: name } });
    }
  }

  /**
   * Mark the end of a phase.
   * @param {string} name — Phase/agent name
   * @param {string} status — 'PASS', 'FAIL', or 'INCOMPLETE'
   */
  endPhase(name, status) {
    if (this.currentPhase && this.currentPhase.name === name) {
      this.currentPhase.status = status;
      this.currentPhase.endTime = Date.now();
      if (this._timeline) {
        this._timeline.recordEvent({
          event_type: 'phase_end',
          action: `Phase ended: ${name} (${status})`,
          metadata: { phase: name, status },
          duration_ms: this.currentPhase.endTime - this.currentPhase.startTime
        });
      }
    }
  }

  /**
   * Log an artifact created during the current phase.
   * @param {string} artifactName
   */
  logArtifact(artifactName) {
    if (this.currentPhase) {
      this.currentPhase.artifacts.push(artifactName);
    }
    if (this._timeline) {
      this._timeline.recordEvent({ event_type: 'artifact_write', action: `Artifact created: ${artifactName}`, metadata: { file: artifactName } });
    }
  }

  /**
   * Log an LLM API call.
   * @param {string} model — Model ID
   * @param {number} promptTokens
   * @param {number} completionTokens
   * @param {number} [cost] — Estimated cost in USD
   */
  logLLMCall(model, promptTokens, completionTokens, cost) {
    const entry = {
      model,
      promptTokens,
      completionTokens,
      cost: cost || 0,
      timestamp: Date.now()
    };
    this.llmCalls.push(entry);

    if (this.currentPhase) {
      this.currentPhase.llmCalls++;
    }
    if (this._timeline) {
      this._timeline.recordEvent({
        event_type: 'llm_turn_end',
        action: `LLM call: ${model}`,
        metadata: { model, prompt_tokens: promptTokens, completion_tokens: completionTokens, cost_usd: cost || 0 }
      });
    }
  }

  /**
   * Log a tool call interception.
   * @param {string} toolName
   * @param {object} args
   * @param {object} result
   */
  logToolInterception(toolName, args, result) {
    this.toolInterceptionCount++;
    this.transcript.push({
      type: 'tool_call',
      tool: toolName,
      args,
      result,
      timestamp: Date.now()
    });

    if (this.currentPhase) {
      this.currentPhase.toolCalls++;
    }
    if (this._timeline) {
      this._timeline.recordEvent({
        event_type: 'tool_call',
        action: `Tool: ${toolName}`,
        metadata: { tool: toolName, args_keys: args ? Object.keys(args) : [] }
      });
    }
  }

  /**
   * Log a user proxy question-answer exchange.
   * @param {object} questionArgs — ask_questions arguments
   * @param {string} answer — User proxy response
   */
  logUserProxyExchange(questionArgs, answer) {
    this.transcript.push({
      type: 'user_proxy_question',
      data: questionArgs,
      timestamp: Date.now()
    });
    this.transcript.push({
      type: 'user_proxy_response',
      data: answer,
      timestamp: Date.now()
    });
    if (this._timeline) {
      this._timeline.recordEvent({ event_type: 'question_asked', action: 'User proxy question', metadata: { question_count: questionArgs?.questions?.length || 1 } });
      this._timeline.recordEvent({ event_type: 'question_answered', action: 'User proxy response', metadata: { answer_preview: typeof answer === 'string' ? answer.slice(0, 200) : '(object)' } });
    }
  }

  /**
   * Log an error encountered during the current phase (or a named phase).
   * Does not throw — errors are collected and surfaced in the report.
   * @param {string} message
   * @param {string} [phase] — Override phase name; defaults to currentPhase.
   */
  logError(message, phase) {
    const phaseName = phase || (this.currentPhase && this.currentPhase.name) || null;
    const entry = { message, phase: phaseName, timestamp: Date.now() };
    this.errors.push(entry);
    if (this.currentPhase) {
      this.currentPhase.errors.push(message);
    }
    if (this._timeline) {
      this._timeline.recordEvent({
        event_type: 'error',
        action: `Error: ${message}`,
        metadata: { phase: phaseName }
      });
    }
  }

  /**
   * Log a non-fatal warning (e.g. missing source dir or artifact).
   * @param {string} message
   */
  logWarning(message) {
    const phaseName = this.currentPhase ? this.currentPhase.name : null;
    const entry = { message, phase: phaseName, timestamp: Date.now() };
    this.warnings.push(entry);
    if (this._timeline) {
      this._timeline.recordEvent({
        event_type: 'warning',
        action: `Warning: ${message}`,
        metadata: { phase: phaseName }
      });
    }
  }

  /**
   * Log that a subagent trace was verified present in insights.
   * @param {string} agent — Subagent name (e.g. 'Jump Start: Security')
   */
  logSubagentVerified(agent) {
    const phaseName = this.currentPhase ? this.currentPhase.name : null;
    const entry = { agent, phase: phaseName, timestamp: Date.now() };
    this.verifiedSubagents.push(entry);
    if (this._timeline) {
      this._timeline.recordEvent({
        event_type: 'subagent_verified',
        action: `Subagent verified: ${agent}`,
        metadata: entry
      });
    }
  }

  /**
   * Log the outcome of a final-state document check.
   * @param {string} document — Document filename
   * @param {string} status — 'CREATED' or 'MISSING'
   */
  logDocumentCreation(document, status) {
    const entry = { document, status, timestamp: Date.now() };
    this.documentCreations.push(entry);
    if (this._timeline) {
      this._timeline.recordEvent({
        event_type: 'document_check',
        action: `Document ${document}: ${status}`,
        metadata: entry
      });
    }
  }

  /**
   * Log aggregated cost for a phase (prompt + completion tokens).
   * Kept separate from logLLMCall: holodeck emits per-phase aggregates that
   * do not correspond to an individual model call.
   * @param {number} promptTokens
   * @param {number} completionTokens
   */
  logCostTracking(promptTokens, completionTokens) {
    this.costTracking.totalPromptTokens += promptTokens || 0;
    this.costTracking.totalCompletionTokens += completionTokens || 0;
    if (this.currentPhase) {
      this.currentPhase.promptTokens += promptTokens || 0;
      this.currentPhase.completionTokens += completionTokens || 0;
    }
  }

  /**
   * Log the outcome of a cross-phase handoff validation.
   * @param {string} status — 'PASS', 'FAIL', or 'SKIP'
   * @param {object} [report] — Handoff report (may contain an errors array)
   */
  logHandoffValidation(status, report) {
    const phaseName = this.currentPhase ? this.currentPhase.name : null;
    const entry = {
      status,
      phase: phaseName,
      errors: report && Array.isArray(report.errors) ? report.errors : [],
      timestamp: Date.now()
    };
    this.handoffValidations.push(entry);
    if (this._timeline) {
      this._timeline.recordEvent({
        event_type: 'handoff_validation',
        action: `Handoff: ${status}`,
        metadata: { phase: phaseName, status, error_count: entry.errors.length }
      });
    }
  }

  /**
   * Get LLM usage summary across all calls.
   * @returns {object}
   */
  getLLMUsageSummary() {
    const byModel = {};
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;

    for (const call of this.llmCalls) {
      totalPromptTokens += call.promptTokens;
      totalCompletionTokens += call.completionTokens;
      totalCost += call.cost;

      if (!byModel[call.model]) {
        byModel[call.model] = { calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
      }
      byModel[call.model].calls++;
      byModel[call.model].promptTokens += call.promptTokens;
      byModel[call.model].completionTokens += call.completionTokens;
      byModel[call.model].cost += call.cost;
    }

    return {
      totalCalls: this.llmCalls.length,
      totalPromptTokens,
      totalCompletionTokens,
      totalCost,
      byModel
    };
  }

  /**
   * Get the full conversation transcript.
   * @returns {Array}
   */
  getConversationTranscript() {
    return this.transcript;
  }

  /**
   * Generate a structured report of the simulation.
   *
   * Includes a `success` field that is true only when every phase passed,
   * no errors were recorded, and no handoff validation FAILed. Holodeck
   * reads `success` to decide scenario pass/fail in runAllScenarios.
   *
   * @returns {object}
   */
  getReport() {
    const phases = this.phases.map(p => ({
      name: p.name,
      status: p.status,
      artifacts: p.artifacts,
      duration_ms: p.endTime ? p.endTime - p.startTime : null,
      toolCalls: p.toolCalls,
      llmCalls: p.llmCalls,
      errors: Array.isArray(p.errors) ? [...p.errors] : [],
      promptTokens: p.promptTokens || 0,
      completionTokens: p.completionTokens || 0
    }));

    const hasFailedPhase = phases.some(p => p.status === 'FAIL');
    const hasFailedHandoff = this.handoffValidations.some(h => h.status === 'FAIL');
    const success =
      phases.length > 0 &&
      !hasFailedPhase &&
      !hasFailedHandoff &&
      this.errors.length === 0;

    return {
      scenario: this.scenario,
      timestamp: new Date().toISOString(),
      success,
      phases,
      errors: this.errors,
      warnings: this.warnings,
      verifiedSubagents: this.verifiedSubagents,
      documentCreations: this.documentCreations,
      handoffValidations: this.handoffValidations,
      costTracking: {
        totalPromptTokens: this.costTracking.totalPromptTokens,
        totalCompletionTokens: this.costTracking.totalCompletionTokens
      },
      headless: {
        llm_usage: this.getLLMUsageSummary(),
        tool_interceptions: this.toolInterceptionCount,
        transcript_length: this.transcript.length
      }
    };
  }

  /**
   * Alias for getReport() — used by HeadlessRunner.
   * @returns {object}
   */
  generateReport() {
    return this.getReport();
  }

  /**
   * Print a human-readable summary of the simulation to stdout.
   */
  printSummary() {
    const r = this.getReport();
    const line = '─'.repeat(60);
    const passedPhases = r.phases.filter(p => p.status === 'PASS').length;
    const failedPhases = r.phases.filter(p => p.status === 'FAIL').length;
    const handoffPass = r.handoffValidations.filter(h => h.status === 'PASS').length;
    const handoffFail = r.handoffValidations.filter(h => h.status === 'FAIL').length;
    const handoffSkip = r.handoffValidations.filter(h => h.status === 'SKIP').length;
    const artifactsTotal = r.phases.reduce((n, p) => n + (p.artifacts ? p.artifacts.length : 0), 0);

    console.log('\n' + line);
    console.log(`  Scenario:            ${this.scenario}`);
    console.log(`  Result:              ${r.success ? '✓ PASS' : '✗ FAIL'}`);
    console.log(line);
    console.log(`  Phases:              ${r.phases.length} (${passedPhases} passed, ${failedPhases} failed)`);
    console.log(`  Artifacts logged:    ${artifactsTotal}`);
    console.log(`  Tool calls:          ${this.toolInterceptionCount}`);
    console.log(`  LLM calls:           ${this.llmCalls.length}`);
    console.log(`  Prompt tokens:       ${r.costTracking.totalPromptTokens}`);
    console.log(`  Completion tokens:   ${r.costTracking.totalCompletionTokens}`);
    console.log(`  Subagents verified:  ${this.verifiedSubagents.length}`);
    console.log(`  Handoff validations: ${r.handoffValidations.length} (${handoffPass} pass, ${handoffFail} fail, ${handoffSkip} skip)`);
    console.log(`  Documents checked:   ${r.documentCreations.length}`);
    console.log(`  Warnings:            ${this.warnings.length}`);
    console.log(`  Errors:              ${this.errors.length}`);
    console.log(line);

    if (this.errors.length) {
      console.log('  Errors:');
      for (const e of this.errors) {
        console.log(`    ✗ [${e.phase || '?'}] ${e.message}`);
      }
    }
    if (this.warnings.length && this.warnings.length <= 10) {
      console.log('  Warnings:');
      for (const w of this.warnings) {
        console.log(`    ⚠ ${w.message}`);
      }
    } else if (this.warnings.length > 10) {
      console.log(`  Warnings: ${this.warnings.length} (suppressed from summary; see report JSON)`);
    }
    console.log('');
  }

  /**
   * Persist the report as JSON to the given path. Creates parent dirs.
   * @param {string} reportPath — Absolute or relative file path
   */
  saveReport(reportPath) {
    const dir = path.dirname(reportPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(reportPath, JSON.stringify(this.getReport(), null, 2));
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { SimulationTracer };
