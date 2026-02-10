#!/usr/bin/env node

/**
 * io.js — CLI-First IO helpers for stdin/stdout JSON communication.
 * 
 * Part of Jump Start Framework (Item 2: CLI-First Mandate).
 * 
 * All internal tools must accept stdin/JSON and emit stdout/JSON for agent piping.
 * This module provides helpers for:
 * - Reading JSON from stdin
 * - Writing structured JSON to stdout
 * - Formatting errors as JSON
 * - Wrapping tool functions with IO contracts
 */

'use strict';

const { Readable } = require('stream');

/**
 * Read JSON input from stdin.
 * Returns a promise that resolves with the parsed JSON object.
 * If stdin is a TTY (interactive terminal), returns an empty object.
 * 
 * @returns {Promise<object>}
 */
async function readStdin() {
  if (process.stdin.isTTY) {
    return {};
  }

  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Invalid JSON on stdin: ${err.message}`));
      }
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Write a structured JSON result to stdout.
 * 
 * @param {object} result - The result object to emit.
 * @param {object} [options] - Options.
 * @param {boolean} [options.pretty=false] - Pretty-print the JSON.
 */
function writeResult(result, options = {}) {
  const { pretty = false } = options;
  const output = {
    ok: true,
    timestamp: new Date().toISOString(),
    ...result
  };
  const json = pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
  process.stdout.write(json + '\n');
}

/**
 * Write a structured JSON error to stderr and optionally exit.
 * 
 * @param {string} code - Machine-readable error code.
 * @param {string} message - Human-readable error message.
 * @param {object} [details] - Additional error details.
 * @param {boolean} [exit=false] - Whether to exit the process.
 */
function writeError(code, message, details = {}, exit = false) {
  const output = {
    ok: false,
    timestamp: new Date().toISOString(),
    error: { code, message, ...details }
  };
  process.stderr.write(JSON.stringify(output) + '\n');
  if (exit) {
    process.exit(1);
  }
}

/**
 * Wrap a tool function with standard IO contract.
 * The wrapped function reads JSON from stdin, passes it to the handler,
 * and writes the result as JSON to stdout.
 * 
 * @param {function} handler - Async function that receives input object and returns result object.
 * @returns {function} Wrapped function.
 */
function wrapTool(handler) {
  return async function wrappedTool(cliArgs = {}) {
    try {
      const stdinInput = await readStdin();
      const input = { ...stdinInput, ...cliArgs };
      const result = await handler(input);
      writeResult(result);
    } catch (err) {
      writeError('TOOL_ERROR', err.message, { stack: err.stack });
      process.exit(1);
    }
  };
}

/**
 * Parse CLI arguments into a key-value object.
 * Supports --key value and --flag (boolean true) formats.
 * 
 * @param {string[]} argv - Process.argv.slice(2) or equivalent.
 * @returns {object}
 */
function parseToolArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

module.exports = {
  readStdin,
  writeResult,
  writeError,
  wrapTool,
  parseToolArgs
};
