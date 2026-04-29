#!/usr/bin/env node

/**
 * holodeck.mjs — Jump Start E2E Simulation Runner.
 *
 * Simulates the complete Jump Start lifecycle using Golden Master fixtures.
 * Validates artifacts, verifies subagent traces, and checks handoff contracts.
 *
 * M9 ESM cutover: renamed `holodeck.js` → `holodeck.mjs` because two of
 * its dependencies (`state-store`, `usage`) ported to ESM (`.mjs`) and
 * CommonJS `require()` cannot synchronously load `.mjs`. The script
 * flips to top-level `import` and reconstructs `__dirname` via
 * `fileURLToPath(import.meta.url)`.
 *
 * Usage:
 *   node bin/holodeck.mjs --scenario ecommerce
 *   node bin/holodeck.mjs --scenario ecommerce --verify-subagents
 *   node bin/holodeck.mjs --all
 *   node bin/holodeck.mjs --list
 *
 * Options:
 *   --scenario <name>    Run a specific scenario
 *   --verify-subagents   Enable strict subagent trace verification
 *   --all                Run all available scenarios
 *   --list               List available scenarios
 *   --output <path>      Output report path (default: tests/e2e/reports/)
 *   --verbose            Enable verbose output
 *   --help               Show help
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateState, resetState } from './lib/state-store.mjs';
import { logUsage, summarizeUsage } from './lib/usage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CJS-only legacy modules in `bin/lib/*.js` (simulation-tracer,
// handoff-validator, validator) are loaded via `createRequire` so
// holodeck doesn't have to wait on the M11 strangler cleanup that turns
// these into ESM ports.
const require = createRequire(import.meta.url);
const { SimulationTracer } = require('./lib/simulation-tracer.js');
const { generateHandoffReport } = require('./lib/handoff-validator.js');
const { validateArtifact, validateMarkdownStructure, checkApproval } = require('./lib/validator.js');

// ─── Configuration ───────────────────────────────────────────────────────────

const SCENARIOS_DIR = path.join(__dirname, '..', 'tests', 'e2e', 'scenarios');
const REPORTS_DIR = path.join(__dirname, '..', 'tests', 'e2e', 'reports');
const HANDOFFS_DIR = path.join(__dirname, '..', '.jumpstart', 'handoffs');
const SCHEMAS_DIR = path.join(__dirname, '..', '.jumpstart', 'schemas');

const PHASE_CONFIG = [
  { name: 'scout', dir: '00-scout', artifacts: ['codebase-context.md', 'insights.md'], hasSubagents: false },
  { name: 'challenger', dir: '01-challenger', artifacts: ['challenger-brief.md', 'insights.md'], hasSubagents: false },
  { name: 'analyst', dir: '02-analyst', artifacts: ['product-brief.md', 'insights.md'], hasSubagents: false },
  { name: 'pm', dir: '03-pm', artifacts: ['prd.md', 'insights.md'], hasSubagents: false },
  { name: 'architect', dir: '04-architect', artifacts: ['architecture.md', 'implementation-plan.md', 'insights.md'], hasSubagents: true, expectedSubagents: ['Jump Start: Security'] },
  { name: 'developer', dir: '05-developer', artifacts: ['TODO.md'], hasSubagents: false }
];

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Parse command line arguments.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    scenario: null,
    verifySubagents: false,
    all: false,
    list: false,
    output: REPORTS_DIR,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--scenario':
      case '-s':
        options.scenario = args[++i];
        break;
      case '--verify-subagents':
        options.verifySubagents = true;
        break;
      case '--all':
      case '-a':
        options.all = true;
        break;
      case '--list':
      case '-l':
        options.list = true;
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Print help message.
 */
function printHelp() {
  console.log(`
Jump Start Holodeck — E2E Simulation Runner

Usage:
  node bin/holodeck.js --scenario <name> [options]
  node bin/holodeck.js --all [options]
  node bin/holodeck.js --list

Options:
  --scenario, -s <name>    Run a specific scenario
  --verify-subagents       Enable strict subagent trace verification
  --all, -a                Run all available scenarios
  --list, -l               List available scenarios
  --output, -o <path>      Output report directory
  --verbose, -v            Enable verbose output
  --help, -h               Show this help message

Examples:
  node bin/holodeck.js --scenario ecommerce
  node bin/holodeck.js --scenario ecommerce --verify-subagents
  node bin/holodeck.js --all --output ./reports
`);
}

/**
 * List available scenarios.
 */
function listScenarios() {
  if (!fs.existsSync(SCENARIOS_DIR)) {
    console.log('No scenarios directory found. Create tests/e2e/scenarios/ first.');
    return [];
  }

  const scenarios = fs.readdirSync(SCENARIOS_DIR)
    .filter(f => fs.statSync(path.join(SCENARIOS_DIR, f)).isDirectory());

  console.log('\nAvailable Scenarios:');
  console.log('────────────────────');
  if (scenarios.length === 0) {
    console.log('  (none found)');
  } else {
    scenarios.forEach(s => {
      const configPath = path.join(SCENARIOS_DIR, s, 'config.yaml');
      const hasConfig = fs.existsSync(configPath) ? '✓' : '○';
      console.log(`  ${hasConfig} ${s}`);
    });
  }
  console.log('');
  return scenarios;
}

/**
 * Create a temporary project directory for simulation.
 */
function setupTempProject(scenario) {
  const tmpDir = path.join(__dirname, '..', 'tests', 'e2e', '.tmp', scenario);
  
  // Clean and recreate
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'specs', 'insights'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'specs', 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.jumpstart', 'state'), { recursive: true });

  // Initialize state
  resetState(path.join(tmpDir, '.jumpstart', 'state', 'state.json'));

  return tmpDir;
}

/**
 * Copy artifacts from scenario to target.
 */
function copyArtifacts(srcDir, targetDir, artifacts, tracer) {
  if (!fs.existsSync(srcDir)) {
    tracer.logWarning(`Source directory not found: ${srcDir}`);
    return [];
  }

  const copied = [];
  for (const artifact of artifacts) {
    const srcPath = path.join(srcDir, artifact);
    if (fs.existsSync(srcPath)) {
      // Determine target path based on artifact type
      let targetPath;
      if (artifact === 'insights.md') {
        targetPath = path.join(targetDir, 'specs', 'insights', artifact);
      } else {
        targetPath = path.join(targetDir, 'specs', artifact);
      }

      // Ensure target directory exists
      const targetDirPath = path.dirname(targetPath);
      if (!fs.existsSync(targetDirPath)) {
        fs.mkdirSync(targetDirPath, { recursive: true });
      }

      fs.copyFileSync(srcPath, targetPath);
      copied.push(artifact);
      tracer.logArtifact(`specs/${artifact}`);
    } else {
      tracer.logWarning(`Artifact not found: ${artifact}`);
    }
  }
  return copied;
}

/**
 * Validate artifacts for a phase.
 */
function validateCurrentArtifacts(targetDir, phase, tracer, verbose) {
  const errors = [];
  const specsDir = path.join(targetDir, 'specs');

  // Get phase artifacts
  const phaseConfig = PHASE_CONFIG.find(p => p.name === phase);
  if (!phaseConfig) return errors;

  for (const artifact of phaseConfig.artifacts) {
    if (artifact === 'insights.md') continue; // Skip insights validation

    const artifactPath = path.join(specsDir, artifact);
    if (!fs.existsSync(artifactPath)) {
      // Not all artifacts are required (e.g., scout only runs for brownfield)
      if (verbose) console.log(`  ○ Skipping missing artifact: ${artifact}`);
      continue;
    }

    // Validate structure
    const content = fs.readFileSync(artifactPath, 'utf8');
    const structureResult = validateMarkdownStructure(content, ['Phase Gate Approval']);
    if (structureResult.missing.length > 0) {
      errors.push(`${artifact}: Missing sections: ${structureResult.missing.join(', ')}`);
    }

    // Check approval
    const approvalResult = checkApproval(artifactPath);
    if (!approvalResult.approved && verbose) {
      console.log(`  ○ ${artifact} not yet approved`);
    }
  }

  return errors;
}

/**
 * Verify subagent traces in insights file.
 */
function verifySubagentTraces(targetDir, phase, expectedSubagents, tracer) {
  const insightsPath = path.join(targetDir, 'specs', 'insights', 'insights.md');
  
  // Also check phase-specific insights
  const phaseInsightsPath = path.join(targetDir, 'specs', 'insights', `${phase}-insights.md`);

  let content = '';
  if (fs.existsSync(insightsPath)) {
    content += fs.readFileSync(insightsPath, 'utf8');
  }
  if (fs.existsSync(phaseInsightsPath)) {
    content += fs.readFileSync(phaseInsightsPath, 'utf8');
  }

  const missing = [];
  for (const agent of expectedSubagents) {
    // Look for patterns like:
    // - "Invoked @Jump Start: Security"
    // - "**Contribution by Jump Start: Security**"
    // - "[2026-02-09T14:00:00Z] Invoked @Jump Start: Security"
    const patterns = [
      new RegExp(`Invoked @?${agent.replace(':', '\\:')}`, 'i'),
      new RegExp(`Contribution by ${agent.replace(':', '\\:')}`, 'i'),
      new RegExp(`${agent.replace(':', '\\:')}.*(?:consultation|invoked|integrated)`, 'i')
    ];

    const found = patterns.some(p => p.test(content));
    if (found) {
      tracer.logSubagentVerified(agent);
    } else {
      missing.push(agent);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing Subagent Traces: ${missing.join(', ')} not logged in ${phase} insights.`);
  }
}

/**
 * Verify final document creation.
 */
function verifyFinalState(targetDir, tracer) {
  const todoPath = path.join(targetDir, 'specs', 'TODO.md');
  if (fs.existsSync(todoPath)) {
    tracer.logDocumentCreation('TODO.md', 'CREATED');
  } else {
    tracer.logDocumentCreation('TODO.md', 'MISSING');
  }

  // Check for implementation plan
  const implPlanPath = path.join(targetDir, 'specs', 'implementation-plan.md');
  if (fs.existsSync(implPlanPath)) {
    tracer.logDocumentCreation('implementation-plan.md', 'CREATED');
  }
}

// ─── Main Runner ─────────────────────────────────────────────────────────────

/**
 * Run a single scenario simulation.
 */
async function runHolodeck(scenario, options = {}) {
  const { verifySubagents = false, verbose = false } = options;
  const scenarioDir = path.join(SCENARIOS_DIR, scenario);

  if (!fs.existsSync(scenarioDir)) {
    throw new Error(`Scenario not found: ${scenario}`);
  }

  console.log(`\n🚀 Running Holodeck simulation: ${scenario}`);
  console.log(`   Subagent verification: ${verifySubagents ? 'ENABLED' : 'disabled'}\n`);

  const targetDir = setupTempProject(scenario);
  const tracer = new SimulationTracer(targetDir, scenario);
  const usageLogPath = path.join(targetDir, '.jumpstart', 'usage-log.json');
  const statePath = path.join(targetDir, '.jumpstart', 'state', 'state.json');

  for (let i = 0; i < PHASE_CONFIG.length; i++) {
    const phase = PHASE_CONFIG[i];
    const phaseSrcDir = path.join(scenarioDir, phase.dir);

    // Skip phases that don't exist in this scenario
    if (!fs.existsSync(phaseSrcDir)) {
      if (verbose) console.log(`  ○ Skipping ${phase.name} (no fixtures)`);
      continue;
    }

    if (verbose) console.log(`\n  ▸ Phase: ${phase.name}`);
    tracer.startPhase(phase.name);

    try {
      // 1. INJECT: Copy Golden Masters to target specs/
      const copied = copyArtifacts(phaseSrcDir, targetDir, phase.artifacts, tracer);
      if (verbose) console.log(`    Copied ${copied.length} artifacts`);

      // 2. MOCK: Write Usage Logs
      logUsage(usageLogPath, {
        agent: phase.name.charAt(0).toUpperCase() + phase.name.slice(1),
        phase: phase.name,
        action: 'generation',
        estimated_tokens: 1000 + Math.floor(Math.random() * 500)
      });

      // If phase has subagents, log subagent usage
      if (phase.hasSubagents && phase.expectedSubagents) {
        for (const subagent of phase.expectedSubagents) {
          logUsage(usageLogPath, {
            agent: subagent,
            phase: phase.name,
            action: 'consultation',
            estimated_tokens: 300 + Math.floor(Math.random() * 200)
          });
        }
        tracer.logCostTracking(1200, 500);
      } else {
        tracer.logCostTracking(1200, 0);
      }

      // 3. VALIDATE: Run Artifact Validators
      const validationErrors = validateCurrentArtifacts(targetDir, phase.name, tracer, verbose);
      if (validationErrors.length > 0) {
        validationErrors.forEach(e => tracer.logError(e, phase.name));
        throw new Error(`Validation failed for ${phase.name}: ${validationErrors.join('; ')}`);
      }
      if (verbose) console.log(`    Validation: PASS`);

      // 4. VERIFY SUBAGENTS (The "Robust" Check)
      if (verifySubagents && phase.hasSubagents && phase.expectedSubagents) {
        verifySubagentTraces(targetDir, phase.name, phase.expectedSubagents, tracer);
        if (verbose) console.log(`    Subagent traces: VERIFIED`);
      }

      // 5. HANDOFF: Verify contract with previous phase
      if (i > 0) {
        const upstream = PHASE_CONFIG[i - 1].name;
        // Find the main artifact from upstream
        const upstreamArtifact = PHASE_CONFIG[i - 1].artifacts[0];
        const upstreamPath = path.join(targetDir, 'specs', upstreamArtifact);

        if (fs.existsSync(upstreamPath) && fs.existsSync(HANDOFFS_DIR)) {
          const report = generateHandoffReport(upstreamPath, upstream, phase.name, HANDOFFS_DIR);
          if (report.valid) {
            tracer.logHandoffValidation('PASS', report);
            if (verbose) console.log(`    Handoff (${upstream} → ${phase.name}): PASS`);
          } else {
            tracer.logHandoffValidation('FAIL', report);
            if (verbose) console.log(`    Handoff (${upstream} → ${phase.name}): FAIL - ${report.errors.join(', ')}`);
          }
        } else {
          tracer.logHandoffValidation('SKIP');
          if (verbose) console.log(`    Handoff: SKIPPED (missing artifacts or schemas)`);
        }
      }

      // 6. STATE: Update State Store
      updateState({ phase: phase.name, status: 'approved' }, statePath);

      tracer.endPhase(phase.name, 'PASS');

    } catch (err) {
      tracer.logError(err.message, phase.name);
      tracer.endPhase(phase.name, 'FAIL');
      if (!verbose) console.log(`  ✗ ${phase.name}: ${err.message}`);
    }
  }

  // 7. FINAL: Verify Document Creation
  verifyFinalState(targetDir, tracer);

  // Generate summary
  const usageSummary = summarizeUsage(usageLogPath);
  tracer.printSummary();

  // Save report
  const reportPath = path.join(options.output || REPORTS_DIR, `${scenario}-${Date.now()}.json`);
  tracer.saveReport(reportPath);
  console.log(`Report saved: ${reportPath}\n`);

  return tracer.getReport();
}

/**
 * Run all scenarios.
 */
async function runAllScenarios(options) {
  const scenarios = listScenarios();
  if (scenarios.length === 0) {
    console.log('No scenarios to run.');
    return [];
  }

  const results = [];
  for (const scenario of scenarios) {
    try {
      const report = await runHolodeck(scenario, options);
      results.push({ scenario, success: report.success, report });
    } catch (err) {
      results.push({ scenario, success: false, error: err.message });
    }
  }

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('              ALL SCENARIOS SUMMARY                      ');
  console.log('═══════════════════════════════════════════════════════');
  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;
  console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
  results.forEach(r => {
    const icon = r.success ? '✓' : '✗';
    console.log(`  ${icon} ${r.scenario}`);
  });
  console.log('═══════════════════════════════════════════════════════\n');

  return results;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.list) {
    listScenarios();
    process.exit(0);
  }

  // Ensure output directory exists
  if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
  }

  try {
    if (options.all) {
      const results = await runAllScenarios(options);
      const allPassed = results.every(r => r.success);
      process.exit(allPassed ? 0 : 1);
    } else if (options.scenario) {
      const report = await runHolodeck(options.scenario, options);
      process.exit(report.success ? 0 : 1);
    } else {
      console.log('Error: Please specify --scenario <name> or --all');
      printHelp();
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
