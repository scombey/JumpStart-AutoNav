/**
 * Shared helpers for AutoNav VS Code Copilot agent hooks.
 *
 * Each hook script is a thin CLI wrapper around a pure `handle(input, ctx)`
 * function that takes the hook JSON payload and a context object (paths, fs,
 * now) and returns `{ exitCode, stdout, stderr }`. This design keeps the hooks
 * deterministic and unit-testable.
 */

import fs from 'node:fs';
import path from 'node:path';

const TASK_ID_RE = /\b(M\d+-T\d+)\b/g;
const STORY_ID_RE = /\b(E\d+-S\d+)\b/g;
const TRACE_ID_RE = /\b(?:M\d+-T\d+|E\d+-S\d+)\b/g;
const MARKDOWN_HORIZONTAL_RULE_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const PROMPT_SIGNAL_PATTERNS = {
  approval: /\b(approve|approval|accept|reject)\b/i,
  planning: /\b(plan|approach|roadmap|design|outline|how would you)\b/i,
  implementation: /\b(implement|build|fix|change|update|edit|add|create|remove)\b/i,
  clarification: /\b(clarify|why|what|how|question)\b|\?/i,
  debug: /\b(debug|trace|diagnose|investigate|failure|failing|broken|error|bug)\b/i,
  review: /\b(review|audit|validate|check|inspect|assess)\b/i,
  discovery: /\b(explain|discover|understand|analyze|explore|what is|where is)\b/i,
};

function repoRoot(cwd) {
  // Hooks run with cwd = workspaceFolder; allow explicit override for tests.
  return cwd || process.env.JUMPSTART_HOOK_ROOT || process.cwd();
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function appendFileSafe(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, text, 'utf8');
}

function readTextSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function loadState(root) {
  return readJsonSafe(path.join(root, '.jumpstart', 'state', 'state.json'), null);
}

function loadHookState(root) {
  return readJsonSafe(
    path.join(root, '.jumpstart', 'state', 'hook-state.json'),
    { recent_tool_calls: [], sessions: {} }
  );
}

function saveHookState(root, state) {
  writeJsonSafe(path.join(root, '.jumpstart', 'state', 'hook-state.json'), state);
}

function ensureSessionRecord(hookState, sessionId, now, extras = {}) {
  hookState.sessions = hookState.sessions || {};
  const sid = sessionId || 'default';
  const existing = hookState.sessions[sid] || {};
  hookState.sessions[sid] = {
    started_at: existing.started_at || (now ? now.toISOString() : new Date().toISOString()),
    phase: existing.phase ?? null,
    edits: Array.isArray(existing.edits) ? existing.edits : [],
    tool_counts: existing.tool_counts && typeof existing.tool_counts === 'object'
      ? existing.tool_counts
      : {},
    tool_targets: Array.isArray(existing.tool_targets) ? existing.tool_targets : [],
    prompts: Array.isArray(existing.prompts) ? existing.prompts : [],
    validations: Array.isArray(existing.validations) ? existing.validations : [],
    blocked_actions: Array.isArray(existing.blocked_actions) ? existing.blocked_actions : [],
    generated_reports: Array.isArray(existing.generated_reports) ? existing.generated_reports : [],
    startup_context: Array.isArray(existing.startup_context) ? existing.startup_context : [],
    workspace: existing.workspace && typeof existing.workspace === 'object' ? existing.workspace : {},
    ...extras,
  };
  return hookState.sessions[sid];
}

function recordToolObservation(session, input, now) {
  const toolName = input.tool_name || 'unknown';
  session.tool_counts[toolName] = (session.tool_counts[toolName] || 0) + 1;
  const target = extractTargetPath(input.tool_input);
  if (target) {
    session.tool_targets.push({
      at: now.toISOString(),
      tool: toolName,
      path: target,
    });
  }
  return { toolName, target };
}

function promptMatchesSignal(prompt, names) {
  const text = String(prompt || '');
  return names.some(name => PROMPT_SIGNAL_PATTERNS[name] && PROMPT_SIGNAL_PATTERNS[name].test(text));
}

/**
 * Extract the `## Phase Gate Approval` section from an artifact.
 *
 * Scans line-by-line so the section ends at the next H2 heading or horizontal
 * rule instead of relying on whole-document checkbox matches.
 *
 * @param {string} content
 * @returns {string|null}
 */
function getPhaseGateSection(content) {
  if (!content) return null;
  const normalized = String(content).replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const start = lines.findIndex(line => /^## Phase Gate Approval\b/i.test(line));
  if (start === -1) return null;

  const section = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (i > start && /^##\s+/.test(line)) break;
    if (i > start && MARKDOWN_HORIZONTAL_RULE_RE.test(line)) break;
    section.push(line);
  }
  return section.join('\n');
}

/**
 * Parse approval status from an artifact's Phase Gate section.
 *
 * @param {string} content
 * @returns {{
 *   approved: boolean,
 *   approver: string|null,
 *   date: string|null,
 *   hasGate: boolean,
 *   checkedCount: number,
 *   uncheckedCount: number
 * }}
 */
function getPhaseGateApproval(content) {
  const gateSection = getPhaseGateSection(content);
  if (!gateSection) {
    return { approved: false, approver: null, date: null, hasGate: false, checkedCount: 0, uncheckedCount: 0 };
  }

  const unchecked = gateSection.match(/- \[ \]/gi) || [];
  const checked = gateSection.match(/- \[x\]/gi) || [];
  const approverMatch = gateSection.match(/\*\*Approved by:\*\*\s*(.+)/i);
  const dateMatch = gateSection.match(/\*\*(?:Approval date|Date):\*\*\s*(.+)/i);
  const approver = approverMatch ? approverMatch[1].trim() : null;
  const date = dateMatch ? dateMatch[1].trim() : null;
  const approved =
    unchecked.length === 0 &&
    checked.length > 0 &&
    approver &&
    approver.toLowerCase() !== 'pending' &&
    date &&
    date.toLowerCase() !== 'pending';

  return {
    approved: Boolean(approved),
    approver,
    date,
    hasGate: true,
    checkedCount: checked.length,
    uncheckedCount: unchecked.length,
  };
}

/**
 * Derive the target file path from a tool_input object. VS Code Copilot, Claude
 * Code, Cursor and other agents use slightly different field names; accept any.
 */
function extractTargetPath(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  return (
    toolInput.file_path ||
    toolInput.path ||
    toolInput.filePath ||
    toolInput.target_file ||
    toolInput.filename ||
    null
  );
}

function extractCommandString(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  return toolInput.command || toolInput.cmd || toolInput.script || null;
}

function extractSessionId(input) {
  if (!input || typeof input !== 'object') return null;
  return input.sessionId || input.session_id || input.session || null;
}

/**
 * Read the hook payload from stdin. Returns {} on empty/invalid input so that
 * hooks are non-fatal when accidentally invoked outside the agent lifecycle.
 */
function readStdinJson() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { buf += chunk; });
    process.stdin.on('end', () => {
      if (!buf.trim()) { resolve({}); return; }
      try { resolve(JSON.parse(buf)); } catch { resolve({}); }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

/**
 * Standard CLI runner: read stdin, call handler, emit stdout/stderr, exit.
 * Never throws — hooks must be fail-safe. A crashing hook should not break the
 * agent session.
 */
async function runCli(handler) {
  let result = { exitCode: 0, stdout: '', stderr: '' };
  try {
    const input = await readStdinJson();
    const ctx = { root: repoRoot(input.cwd), now: new Date() };
    result = handler(input, ctx) || result;
  } catch (err) {
    result = { exitCode: 0, stdout: '', stderr: `[hook error] ${err.message}` };
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode || 0);
}

/**
 * Match a path against a list of prefixes (POSIX-style) regardless of leading
 * slash or OS separator.
 */
function pathMatchesAny(targetPath, prefixes) {
  if (!targetPath) return false;
  const normalized = targetPath.replace(/\\/g, '/').replace(/^\.\//, '');
  return prefixes.some(p => {
    const prefix = p.replace(/\\/g, '/').replace(/^\.\//, '');
    return normalized === prefix ||
           normalized.startsWith(prefix.endsWith('/') ? prefix : prefix + '/');
  });
}

export {
  repoRoot,
  readJsonSafe,
  writeJsonSafe,
  appendFileSafe,
  readTextSafe,
  loadState,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  recordToolObservation,
  extractTargetPath,
  extractCommandString,
  extractSessionId,
  readStdinJson,
  runCli,
  pathMatchesAny,
  TASK_ID_RE,
  STORY_ID_RE,
  TRACE_ID_RE,
  MARKDOWN_HORIZONTAL_RULE_RE,
  PROMPT_SIGNAL_PATTERNS,
  promptMatchesSignal,
  getPhaseGateSection,
  getPhaseGateApproval,
};
