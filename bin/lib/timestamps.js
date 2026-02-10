/**
 * timestamps.js — UTC Timestamp Utilities (Item 60)
 *
 * Provides consistent ISO 8601 UTC timestamp generation and validation
 * for use across all insight entries and spec artifacts.
 *
 * Usage:
 *   echo '{"action":"now"}' | node bin/lib/timestamps.js
 *   echo '{"action":"validate","value":"2026-02-08T14:23:00Z"}' | node bin/lib/timestamps.js
 *   echo '{"action":"audit","file":"specs/insights/example.md"}' | node bin/lib/timestamps.js
 *
 * Input (stdin JSON):
 *   action: "now" | "validate" | "audit"
 *   value: timestamp string (for validate)
 *   file: file path (for audit)
 *
 * Output (stdout JSON):
 *   For now: { "timestamp": "2026-02-08T14:23:00Z" }
 *   For validate: { "valid": true/false, "parsed": "...", "error": "..." }
 *   For audit: { "entries": N, "valid": N, "invalid": [...] }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');

/**
 * ISO 8601 UTC timestamp regex.
 * Matches: 2026-02-08T14:23:00Z, 2026-02-08T14:23:00.000Z
 */
const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * Generate a UTC timestamp in ISO 8601 format.
 *
 * @returns {string} ISO 8601 UTC timestamp.
 */
function now() {
  return new Date().toISOString();
}

/**
 * Validate an ISO 8601 UTC timestamp string.
 *
 * @param {string} value - Timestamp string to validate.
 * @returns {{ valid: boolean, parsed: string|null, error: string|null }}
 */
function validate(value) {
  if (!value || typeof value !== 'string') {
    return { valid: false, parsed: null, error: 'Timestamp is empty or not a string' };
  }

  // Check format
  if (!ISO_UTC_REGEX.test(value)) {
    // Check if it's a valid date but not UTC
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return {
        valid: false,
        parsed: d.toISOString(),
        error: `Timestamp is not in UTC format (must end with Z). Did you mean: ${d.toISOString()}?`
      };
    }
    return { valid: false, parsed: null, error: 'Invalid ISO 8601 UTC format. Expected: YYYY-MM-DDTHH:MM:SSZ' };
  }

  // Parse and validate the actual date
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return { valid: false, parsed: null, error: 'Timestamp has valid format but represents an invalid date' };
  }

  // Check for future timestamps (warning, not error)
  const isFuture = d.getTime() > Date.now();

  return {
    valid: true,
    parsed: d.toISOString(),
    warning: isFuture ? 'Timestamp is in the future' : null,
    error: null
  };
}

/**
 * Audit a markdown file for timestamp compliance.
 * Checks that all **Timestamp:** entries contain valid ISO 8601 UTC strings.
 *
 * @param {string} filePath - Path to the markdown file.
 * @returns {{ entries: number, valid: number, invalid: Array<{line: number, value: string, error: string}> }}
 */
function audit(filePath) {
  const result = { entries: 0, valid: 0, invalid: [] };

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ...result, error: `Cannot read file: ${err.message}` };
  }

  const lines = content.split('\n');
  const timestampRegex = /\*\*Timestamp:\*\*\s*(.+)/i;

  lines.forEach((line, idx) => {
    const match = line.match(timestampRegex);
    if (!match) return;

    result.entries++;
    const value = match[1].trim();

    // Skip template placeholders
    if (value.startsWith('{{') || value.startsWith('[')) {
      result.valid++; // Template placeholders are OK
      return;
    }

    const validation = validate(value);
    if (validation.valid) {
      result.valid++;
    } else {
      result.invalid.push({
        line: idx + 1,
        value,
        error: validation.error
      });
    }
  });

  // Also check frontmatter dates
  const frontmatterDates = ['created', 'updated', 'approval_date'];
  const fmRegex = /^---\n([\s\S]*?)\n---/;
  const fmMatch = content.match(fmRegex);

  if (fmMatch) {
    const fm = fmMatch[1];
    for (const field of frontmatterDates) {
      const fieldRegex = new RegExp(`^${field}:\\s*"?(.+?)"?$`, 'm');
      const fieldMatch = fm.match(fieldRegex);
      if (fieldMatch) {
        const value = fieldMatch[1].trim();
        if (value && value !== '' && !value.startsWith('{{') && value !== 'Pending' && value !== 'N/A') {
          result.entries++;
          const validation = validate(value);
          if (validation.valid) {
            result.valid++;
          } else {
            result.invalid.push({
              line: 0, // frontmatter
              field,
              value,
              error: validation.error
            });
          }
        }
      }
    }
  }

  return result;
}

// --- CLI entry point ---
if (process.argv[1] && process.argv[1].endsWith('timestamps.js')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const opts = JSON.parse(input || '{}');
      const action = opts.action || 'now';

      let result;
      switch (action) {
        case 'validate':
          result = validate(opts.value);
          break;
        case 'audit':
          result = audit(opts.file);
          break;
        case 'now':
        default:
          result = { timestamp: now() };
          break;
      }

      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });
}

export { now, validate, audit, ISO_UTC_REGEX };
