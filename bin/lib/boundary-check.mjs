/**
 * boundary-check.js — Boundary Validation (Item 74)
 *
 * Validates that the implementation plan does not drift beyond
 * the "Constraints and Boundaries" defined in the product brief.
 *
 * Usage:
 *   echo '{"brief":"specs/product-brief.md","plan":"specs/implementation-plan.md"}' | node bin/lib/boundary-check.js
 *
 * Input (stdin JSON):
 *   {
 *     "brief": "specs/product-brief.md",
 *     "plan": "specs/implementation-plan.md",
 *     "root": "."
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "boundaries": [...],
 *     "violations": [...],
 *     "warnings": [...],
 *     "score": 90,
 *     "pass": true
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

/**
 * Extract boundary statements from the product brief.
 * Looks for "Constraints", "Boundaries", "Out of Scope", "Exclusions" sections.
 *
 * @param {string} content - Product brief markdown.
 * @returns {Array<{ type: string, statement: string }>}
 */
function extractBoundaries(content) {
  const boundaries = [];
  const lines = content.split('\n');
  let inBoundarySection = false;
  let sectionType = '';

  const boundaryHeaders = [
    /^#{2,4}\s+(?:constraints?\s+(?:and\s+)?)?boundar(?:y|ies)/i,
    /^#{2,4}\s+out\s+of\s+scope/i,
    /^#{2,4}\s+exclusions?/i,
    /^#{2,4}\s+constraints?/i,
    /^#{2,4}\s+(?:what\s+(?:we|this)\s+(?:will\s+)?)?not\s+(?:do|build|include)/i,
    /^#{2,4}\s+limitations?/i,
    /^#{2,4}\s+scope\s+(?:boundaries|limits)/i
  ];

  for (const line of lines) {
    // Check if we've hit a boundary section
    for (const pattern of boundaryHeaders) {
      if (pattern.test(line)) {
        inBoundarySection = true;
        sectionType = line.replace(/^#+\s+/, '').trim();
        break;
      }
    }

    // Check if we've left the boundary section (hit another heading)
    if (inBoundarySection && /^#{1,4}\s+/.test(line) && !boundaryHeaders.some(p => p.test(line))) {
      inBoundarySection = false;
      continue;
    }

    // Extract bullet points and list items from boundary sections
    if (inBoundarySection) {
      const bulletMatch = line.match(/^\s*[-*+]\s+(.+)/);
      if (bulletMatch) {
        boundaries.push({
          type: sectionType,
          statement: bulletMatch[1].trim()
        });
      }
      // Also catch numbered lists
      const numMatch = line.match(/^\s*\d+[.)]\s+(.+)/);
      if (numMatch) {
        boundaries.push({
          type: sectionType,
          statement: numMatch[1].trim()
        });
      }
    }
  }

  return boundaries;
}

/**
 * Extract task descriptions and scope indicators from the implementation plan.
 *
 * @param {string} content - Implementation plan markdown.
 * @returns {Array<{ id: string, description: string, scope_terms: string[] }>}
 */
function extractPlanScope(content) {
  const tasks = [];
  const taskSections = content.split(/###\s+/);

  for (const section of taskSections) {
    const idMatch = section.match(/^(M\d+-T\d+)\s*[:\-—]\s*(.+)/);
    if (!idMatch) continue;

    const id = idMatch[1];
    const description = idMatch[2].trim();

    // Extract technology and scope-relevant terms
    const scopeTerms = [];
    const techRegex = /\b((?:React|Angular|Vue|Svelte|Next|Nuxt|Express|Fastify|Django|Flask|Rails|Spring|Laravel|Prisma|Sequelize|TypeORM|MongoDB|PostgreSQL|MySQL|Redis|GraphQL|REST|gRPC|Docker|Kubernetes|AWS|Azure|GCP|Firebase|Supabase|Vercel|Netlify|Heroku)(?:\.js)?)\b/gi;
    let tm;
    while ((tm = techRegex.exec(section)) !== null) {
      scopeTerms.push(tm[1]);
    }

    tasks.push({ id, description, scope_terms: [...new Set(scopeTerms)] });
  }

  return tasks;
}

/**
 * Check plan against boundaries.
 *
 * @param {object} input - Check options.
 * @returns {object} Validation results.
 */
function checkBoundaries(input) {
  const {
    brief = 'specs/product-brief.md',
    plan = 'specs/implementation-plan.md',
    root = '.'
  } = input;

  const briefPath = path.resolve(root, brief);
  const planPath = path.resolve(root, plan);

  let briefContent = '';
  let planContent = '';

  try {
    briefContent = fs.readFileSync(briefPath, 'utf8');
  } catch {
    return { error: `Cannot read brief: ${briefPath}`, pass: false, score: 0 };
  }

  try {
    planContent = fs.readFileSync(planPath, 'utf8');
  } catch {
    return { error: `Cannot read plan: ${planPath}`, pass: false, score: 0 };
  }

  const boundaries = extractBoundaries(briefContent);
  const tasks = extractPlanScope(planContent);
  const violations = [];
  const warnings = [];

  // Check each boundary against plan content
  for (const boundary of boundaries) {
    const stmt = boundary.statement.toLowerCase();

    // Look for "not", "no", "exclude", "avoid", "without" patterns
    const exclusionPatterns = [
      /\bno\s+(\w+)/g,
      /\bnot\s+(?:include|build|implement|support|use)\s+(.+)/g,
      /\bexclude[sd]?\s+(.+)/g,
      /\bavoid\s+(.+)/g,
      /\bwithout\s+(.+)/g,
      /\bwill\s+not\s+(.+)/g,
      /\bdo\s+not\s+(.+)/g
    ];

    for (const pattern of exclusionPatterns) {
      let em;
      while ((em = pattern.exec(stmt)) !== null) {
        const excluded = em[1].trim().replace(/[.,;]$/, '');
        // Check if plan mentions the excluded item
        if (planContent.toLowerCase().includes(excluded) && excluded.length > 3) {
          violations.push({
            boundary: boundary.statement,
            boundary_type: boundary.type,
            excluded_term: excluded,
            found_in: 'implementation-plan.md',
            severity: 'major'
          });
        }
      }
    }
  }

  // Warn if plan has no boundary references
  if (boundaries.length === 0) {
    warnings.push({
      message: 'No boundary statements found in product brief. Consider adding a "Constraints and Boundaries" section.',
      severity: 'minor'
    });
  }

  // Score
  const totalChecks = Math.max(1, boundaries.length);
  const score = Math.max(0, Math.round(((totalChecks - violations.length) / totalChecks) * 100));

  return {
    boundaries,
    violations,
    warnings,
    task_count: tasks.length,
    boundary_count: boundaries.length,
    score,
    pass: violations.filter(v => v.severity === 'major').length === 0
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (process.argv[1] && (
  process.argv[1].endsWith('boundary-check.mjs') ||
  process.argv[1].endsWith('boundary-check')
)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const parsed = input.trim() ? JSON.parse(input) : {};
      const result = checkBoundaries(parsed);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.pass ? 0 : 1);
    } catch (err) {
      process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });

  if (process.stdin.isTTY) {
    const result = checkBoundaries({});
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.pass ? 0 : 1);
  }
}

export { checkBoundaries, extractBoundaries, extractPlanScope };
