#!/usr/bin/env node
// ============================================================================
// Context7 MCP Setup Module
// ============================================================================
// Handles interactive setup of the Context7 MCP (Model Context Protocol)
// server for AI coding assistants. Integrates with the JumpStart CLI to
// optionally configure Context7 during framework installation.
//
// Supported clients:
//   - VS Code (GitHub Copilot)
//   - Cursor
//   - Claude Code (CLI)
//   - Claude Desktop
//   - Windsurf
//   - Generic (manual instructions)
// ============================================================================

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const prompts = require('prompts');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_KEY_PREFIX = 'ctx7sk-';

// Client configuration templates
const CLIENT_CONFIGS = {
  vscode: {
    name: 'VS Code (GitHub Copilot)',
    configFileName: '.vscode/mcp.json',
    generateConfig: (apiKey) => ({
      servers: {
        context7: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp', '--api-key', apiKey]
        }
      }
    })
  },
  cursor: {
    name: 'Cursor',
    configFileName: '.cursor/mcp.json',
    generateConfig: (apiKey) => ({
      mcpServers: {
        context7: {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp', '--api-key', apiKey]
        }
      }
    })
  },
  'claude-code': {
    name: 'Claude Code (CLI)',
    useCli: true,
    cliCommand: (apiKey) =>
      `claude mcp add context7 -- npx -y @upstash/context7-mcp --api-key ${apiKey}`
  },
  'claude-desktop': {
    name: 'Claude Desktop',
    configFileName: null, // Platform-specific path resolved at runtime
    getConfigPath: () => {
      if (process.platform === 'win32') {
        return path.join(
          process.env.APPDATA || '',
          'Claude',
          'claude_desktop_config.json'
        );
      } else if (process.platform === 'darwin') {
        return path.join(
          process.env.HOME || '',
          'Library',
          'Application Support',
          'Claude',
          'claude_desktop_config.json'
        );
      }
      return path.join(process.env.HOME || '', '.config', 'claude', 'claude_desktop_config.json');
    },
    generateConfig: (apiKey) => ({
      mcpServers: {
        context7: {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp', '--api-key', apiKey]
        }
      }
    })
  },
  windsurf: {
    name: 'Windsurf',
    configFileName: null,
    getConfigPath: () => {
      if (process.platform === 'win32') {
        return path.join(
          process.env.APPDATA || process.env.USERPROFILE || '',
          '.codeium',
          'windsurf',
          'mcp_config.json'
        );
      }
      return path.join(process.env.HOME || '', '.codeium', 'windsurf', 'mcp_config.json');
    },
    generateConfig: (apiKey) => ({
      mcpServers: {
        context7: {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp', '--api-key', apiKey]
        }
      }
    })
  }
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates that an API key has the expected Context7 format.
 */
function validateApiKey(value) {
  if (!value || typeof value !== 'string') {
    return 'API key is required';
  }
  value = value.trim();
  if (!value.startsWith(API_KEY_PREFIX)) {
    return `Invalid format. Context7 API keys start with "${API_KEY_PREFIX}"`;
  }
  if (value.length < 10) {
    return 'API key appears too short';
  }
  return true;
}

// ---------------------------------------------------------------------------
// Configuration writers
// ---------------------------------------------------------------------------

/**
 * Merges the Context7 MCP server block into an existing JSON config file,
 * or creates the file if it doesn't exist.
 */
function mergeJsonConfig(filePath, newConfig) {
  let existing = {};

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      existing = JSON.parse(raw);
    } catch {
      // If the file is malformed, back it up and start fresh
      const backup = filePath + '.bak';
      fs.copyFileSync(filePath, backup);
      console.log(chalk.yellow(`  ⚠  Backed up malformed ${path.basename(filePath)} to ${path.basename(backup)}`));
    }
  }

  // Deep-merge: add context7 into the appropriate nested key
  const merged = deepMerge(existing, newConfig);

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}

/**
 * Simple recursive merge (source wins on conflict).
 */
function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

// ---------------------------------------------------------------------------
// Client installers
// ---------------------------------------------------------------------------

/**
 * Installs MCP configuration for a specific client.
 * @returns {{ success: boolean, message: string }}
 */
function installForClient(clientKey, apiKey, targetDir) {
  const client = CLIENT_CONFIGS[clientKey];
  if (!client) {
    return { success: false, message: `Unknown client: ${clientKey}` };
  }

  // CLI-based installation (Claude Code)
  if (client.useCli) {
    const cmd = client.cliCommand(apiKey);
    try {
      execSync(cmd, { stdio: 'pipe', cwd: targetDir });
      return { success: true, message: `Configured via CLI: ${cmd.split('--api-key')[0].trim()}...` };
    } catch (err) {
      return {
        success: false,
        message: `CLI command failed. You can run it manually:\n  ${cmd}`
      };
    }
  }

  // File-based installation
  let configPath;
  if (client.getConfigPath) {
    configPath = client.getConfigPath();
  } else if (client.configFileName) {
    configPath = path.join(targetDir, client.configFileName);
  } else {
    return { success: false, message: 'Cannot determine config path for this client.' };
  }

  try {
    const config = client.generateConfig(apiKey);
    mergeJsonConfig(configPath, config);
    return { success: true, message: `Config written to ${configPath}` };
  } catch (err) {
    return { success: false, message: `Failed to write config: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Interactive setup (exported for use in CLI)
// ---------------------------------------------------------------------------

/**
 * Runs the interactive Context7 MCP setup flow.
 * Called from the JumpStart CLI after the main installation.
 *
 * @param {Object} options
 * @param {string} options.targetDir - Project target directory
 * @param {boolean} [options.dryRun=false] - If true, show what would happen
 * @returns {Promise<{ installed: boolean, clients: string[], apiKey?: string }>}
 */
async function setupContext7({ targetDir, dryRun = false }) {
  console.log(chalk.cyan('\n🔌 Context7 MCP Integration\n'));
  console.log(
    chalk.gray(
      '   Context7 provides up-to-date library documentation to your AI coding\n' +
      '   assistant via the Model Context Protocol (MCP). This is optional.\n' +
      '   Get your API key at: https://context7.com\n'
    )
  );

  // Step 1: Ask if user wants to install
  const { installMcp } = await prompts({
    type: 'confirm',
    name: 'installMcp',
    message: 'Would you like to install the Context7 MCP for your AI agents?',
    initial: true
  });

  if (!installMcp) {
    console.log(chalk.gray('   Skipped Context7 MCP setup.\n'));
    return { installed: false, clients: [] };
  }

  // Step 2: Capture API key
  const { apiKey } = await prompts({
    type: 'text',
    name: 'apiKey',
    message: `Enter your Context7 API key (${API_KEY_PREFIX}...):`,
    validate: validateApiKey
  });

  if (!apiKey) {
    console.log(chalk.yellow('   No API key provided. Skipping Context7 setup.\n'));
    return { installed: false, clients: [] };
  }

  const trimmedKey = apiKey.trim();

  // Step 3: Select target clients
  const clientChoices = Object.entries(CLIENT_CONFIGS).map(([key, cfg]) => ({
    title: cfg.name,
    value: key,
    selected: key === 'vscode' // Pre-select VS Code
  }));

  const { selectedClients } = await prompts({
    type: 'multiselect',
    name: 'selectedClients',
    message: 'Which AI clients should be configured?',
    choices: clientChoices,
    hint: '- Space to select, Enter to confirm',
    instructions: false,
    min: 1
  });

  if (!selectedClients || selectedClients.length === 0) {
    console.log(chalk.yellow('   No clients selected. Skipping Context7 setup.\n'));
    return { installed: false, clients: [] };
  }

  // Step 4: Security notice
  console.log(
    chalk.yellow(
      '\n   ⚠  Your API key will be stored in local configuration files.\n' +
      '   Make sure these files are listed in your .gitignore.\n'
    )
  );

  // Step 5: Install for each selected client
  if (dryRun) {
    console.log(chalk.yellow.bold('   [DRY RUN] Would configure Context7 for:'));
    selectedClients.forEach((c) =>
      console.log(chalk.gray(`     - ${CLIENT_CONFIGS[c].name}`))
    );
    console.log('');
    return { installed: false, clients: selectedClients };
  }

  const results = [];
  for (const clientKey of selectedClients) {
    const clientName = CLIENT_CONFIGS[clientKey].name;
    const result = installForClient(clientKey, trimmedKey, targetDir);
    results.push({ clientKey, ...result });

    if (result.success) {
      console.log(chalk.green(`   ✅ ${clientName}: ${result.message}`));
    } else {
      console.log(chalk.red(`   ❌ ${clientName}: ${result.message}`));
    }
  }

  // Step 6: Ensure .gitignore entries exist
  ensureGitignoreEntries(targetDir, selectedClients, dryRun);

  const successClients = results.filter((r) => r.success).map((r) => r.clientKey);
  console.log(chalk.green(`\n   Context7 MCP configured for ${successClients.length} client(s).\n`));

  return { installed: true, clients: successClients, apiKey: trimmedKey };
}

/**
 * Ensures that MCP config files containing API keys are gitignored.
 */
function ensureGitignoreEntries(targetDir, selectedClients, dryRun) {
  const gitignorePath = path.join(targetDir, '.gitignore');
  const entriesToAdd = [];

  // Map client keys to gitignore patterns
  const gitignorePatterns = {
    vscode: '.vscode/mcp.json',
    cursor: '.cursor/mcp.json'
  };

  for (const clientKey of selectedClients) {
    if (gitignorePatterns[clientKey]) {
      entriesToAdd.push(gitignorePatterns[clientKey]);
    }
  }

  if (entriesToAdd.length === 0) return;

  let existing = '';
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, 'utf8');
  }

  const missing = entriesToAdd.filter((e) => !existing.includes(e));
  if (missing.length === 0) return;

  if (dryRun) {
    console.log(chalk.gray(`   Would add to .gitignore: ${missing.join(', ')}`));
    return;
  }

  const block = '\n# Context7 MCP config (contains API key)\n' + missing.join('\n') + '\n';
  fs.appendFileSync(gitignorePath, block, 'utf8');
  console.log(chalk.gray(`   Updated .gitignore with: ${missing.join(', ')}`));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  setupContext7,
  validateApiKey,
  installForClient,
  CLIENT_CONFIGS
};
