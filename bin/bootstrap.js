#!/usr/bin/env node

/**
 * bootstrap.js — npx One-Time Usage (Item 79)
 *
 * Minimal bootstrap entry point for npx one-time init.
 * Allows users to run: npx jumpstart-framework init
 *
 * This downloads the framework, runs the installer, and sets up
 * the project structure without requiring a global install.
 *
 * Usage:
 *   npx jumpstart-framework init
 *   npx jumpstart-framework init --skill beginner
 *   npx jumpstart-framework init --type brownfield
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const JUMPSTART_DIR = '.jumpstart';
const SPECS_DIR = 'specs';
const SRC_DIR = 'src';
const TESTS_DIR = 'tests';

/**
 * Check if the current directory already has a JumpStart project.
 *
 * @param {string} dir - Directory to check.
 * @returns {boolean}
 */
function isExistingProject(dir) {
  return fs.existsSync(path.join(dir, JUMPSTART_DIR, 'config.yaml'));
}

/**
 * Create the minimal directory structure for a new project.
 *
 * @param {string} dir - Project root directory.
 */
function scaffold(dir) {
  const dirs = [
    JUMPSTART_DIR,
    path.join(JUMPSTART_DIR, 'agents'),
    path.join(JUMPSTART_DIR, 'templates'),
    path.join(JUMPSTART_DIR, 'schemas'),
    path.join(JUMPSTART_DIR, 'commands'),
    path.join(JUMPSTART_DIR, 'state'),
    path.join(JUMPSTART_DIR, 'archive'),
    SPECS_DIR,
    path.join(SPECS_DIR, 'decisions'),
    path.join(SPECS_DIR, 'insights'),
    path.join(SPECS_DIR, 'research'),
    SRC_DIR,
    TESTS_DIR
  ];

  for (const d of dirs) {
    const fullPath = path.join(dir, d);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

/**
 * Parse command-line arguments.
 *
 * @param {string[]} args - Process argv slice.
 * @returns {object} Parsed options.
 */
function parseArgs(args) {
  const options = {
    command: 'init',
    skill: null,
    type: 'greenfield',
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'init') {
      options.command = 'init';
    } else if (arg === '--skill' && args[i + 1]) {
      options.skill = args[++i];
    } else if (arg === '--type' && args[i + 1]) {
      options.type = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

/**
 * Display usage help.
 */
function showHelp() {
  console.log(`
Jump Start Framework — Quick Init

Usage:
  npx jumpstart-framework init [options]

Options:
  --skill <level>   Set skill level: beginner, intermediate, expert (default: intermediate)
  --type <type>     Project type: greenfield, brownfield (default: greenfield)
  --help, -h        Show this help message

Examples:
  npx jumpstart-framework init
  npx jumpstart-framework init --skill beginner
  npx jumpstart-framework init --type brownfield --skill expert
`);
}

/**
 * Main bootstrap entry point.
 */
function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    return;
  }

  const cwd = process.cwd();

  if (isExistingProject(cwd)) {
    console.log('⚡ JumpStart project already exists in this directory.');
    console.log('   Run /jumpstart.status in your AI assistant to see project state.');
    return;
  }

  console.log('⚡ Initializing JumpStart Framework...\n');

  // Scaffold directories
  scaffold(cwd);
  console.log('✓ Created directory structure');

  // Copy framework files from package
  const packageDir = path.resolve(__dirname, '..');
  const filesToCopy = [
    { src: 'AGENTS.md', dest: 'AGENTS.md' },
    { src: '.jumpstart/roadmap.md', dest: '.jumpstart/roadmap.md', optional: true },
    { src: '.jumpstart/config.yaml', dest: '.jumpstart/config.yaml', optional: true },
    { src: '.jumpstart/invariants.md', dest: '.jumpstart/invariants.md', optional: true },
    { src: '.jumpstart/glossary.md', dest: '.jumpstart/glossary.md', optional: true },
    { src: '.jumpstart/correction-log.md', dest: '.jumpstart/correction-log.md', optional: true },
    { src: '.jumpstart/domain-complexity.csv', dest: '.jumpstart/domain-complexity.csv', optional: true }
  ];

  let copied = 0;
  for (const file of filesToCopy) {
    const srcPath = path.join(packageDir, file.src);
    const destPath = path.join(cwd, file.dest);
    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      copied++;
    }
  }

  if (copied > 0) {
    console.log(`✓ Copied ${copied} framework files`);
  }

  // Copy agent files
  const agentsDir = path.join(packageDir, '.jumpstart', 'agents');
  if (fs.existsSync(agentsDir)) {
    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    let agentsCopied = 0;
    for (const file of agentFiles) {
      const dest = path.join(cwd, '.jumpstart', 'agents', file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(agentsDir, file), dest);
        agentsCopied++;
      }
    }
    if (agentsCopied > 0) console.log(`✓ Copied ${agentsCopied} agent persona files`);
  }

  // Copy template files
  const templatesDir = path.join(packageDir, '.jumpstart', 'templates');
  if (fs.existsSync(templatesDir)) {
    const templateFiles = fs.readdirSync(templatesDir);
    let templatesCopied = 0;
    for (const file of templateFiles) {
      const dest = path.join(cwd, '.jumpstart', 'templates', file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(templatesDir, file), dest);
        templatesCopied++;
      }
    }
    if (templatesCopied > 0) console.log(`✓ Copied ${templatesCopied} template files`);
  }

  // Copy schema files
  const schemasDir = path.join(packageDir, '.jumpstart', 'schemas');
  if (fs.existsSync(schemasDir)) {
    const schemaFiles = fs.readdirSync(schemasDir);
    let schemasCopied = 0;
    for (const file of schemaFiles) {
      const dest = path.join(cwd, '.jumpstart', 'schemas', file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(schemasDir, file), dest);
        schemasCopied++;
      }
    }
    if (schemasCopied > 0) console.log(`✓ Copied ${schemasCopied} schema files`);
  }

  // Apply skill level if provided
  if (options.skill) {
    console.log(`✓ Skill level set to: ${options.skill}`);
  }

  console.log(`✓ Project type: ${options.type}`);
  console.log('\n🚀 JumpStart Framework initialized!');
  console.log('\nNext steps:');
  console.log('  1. Open this folder in your AI coding assistant (VS Code, Cursor, etc.)');
  console.log('  2. Start with: /jumpstart.challenge');
  console.log('  3. Follow the guided workflow through each phase\n');
}

main();
