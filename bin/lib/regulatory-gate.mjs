/**
 * regulatory-gate.js — Regulatory Focus Gate (Item 71)
 *
 * Triggers additional compliance checks based on project domain
 * and risk classification (medical, financial, government, etc.).
 *
 * Usage:
 *   echo '{"project_domain":"healthcare","risk_level":"high"}' | node bin/lib/regulatory-gate.js
 *
 * Input (stdin JSON):
 *   {
 *     "project_domain": "healthcare",
 *     "risk_level": "high",
 *     "data_types": ["PII", "PHI"],
 *     "regions": ["US", "EU"]
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "classification": "medical",
 *     "risk_level": "critical",
 *     "applicable_regulations": [...],
 *     "required_checks": [...],
 *     "checklist_items": [...],
 *     "gate_required": true
 *   }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/**
 * Domain-to-regulation mapping.
 */
const DOMAIN_REGULATIONS = {
  healthcare: {
    classification: 'medical',
    regulations: ['HIPAA', 'HITECH', 'FDA 21 CFR Part 11'],
    data_types: ['PHI', 'PII'],
    min_risk: 'high'
  },
  fintech: {
    classification: 'financial',
    regulations: ['PCI-DSS', 'SOX', 'GLBA'],
    data_types: ['PCI', 'PII'],
    min_risk: 'high'
  },
  finance: {
    classification: 'financial',
    regulations: ['PCI-DSS', 'SOX', 'GLBA'],
    data_types: ['PCI', 'PII'],
    min_risk: 'high'
  },
  banking: {
    classification: 'financial',
    regulations: ['PCI-DSS', 'SOX', 'GLBA', 'BSA/AML'],
    data_types: ['PCI', 'PII'],
    min_risk: 'critical'
  },
  insurance: {
    classification: 'financial',
    regulations: ['SOX', 'GLBA', 'State Insurance Regulations'],
    data_types: ['PII'],
    min_risk: 'high'
  },
  government: {
    classification: 'government',
    regulations: ['FedRAMP', 'FISMA', 'NIST 800-53'],
    data_types: ['CUI', 'PII'],
    min_risk: 'high'
  },
  education: {
    classification: 'education',
    regulations: ['FERPA', 'COPPA'],
    data_types: ['PII', 'Student Records'],
    min_risk: 'medium'
  },
  ecommerce: {
    classification: 'commercial',
    regulations: ['PCI-DSS'],
    data_types: ['PCI', 'PII'],
    min_risk: 'medium'
  }
};

/**
 * Region-to-regulation mapping.
 */
const REGION_REGULATIONS = {
  EU: ['GDPR', 'ePrivacy Directive'],
  US: [],  // US regulations are domain-specific
  UK: ['UK GDPR', 'DPA 2018'],
  CA: ['PIPEDA'],
  AU: ['Australian Privacy Act'],
  BR: ['LGPD'],
  global: ['GDPR', 'CCPA']  // If global, assume strictest
};

/**
 * Generate compliance checklist based on classification.
 *
 * @param {string} classification - Domain classification.
 * @param {string[]} regulations - Applicable regulations.
 * @returns {Array<{ category: string, items: string[] }>}
 */
function generateChecklist(classification, regulations) {
  const checklist = [];

  // Universal items
  checklist.push({
    category: 'Data Protection',
    items: [
      'Data classification completed',
      'Data retention policy defined',
      'Encryption at rest specified',
      'Encryption in transit (TLS 1.2+) required',
      'Key management strategy documented'
    ]
  });

  checklist.push({
    category: 'Access Control',
    items: [
      'Authentication method specified',
      'Authorization model defined (RBAC/ABAC)',
      'Session management policy documented',
      'Audit logging for access events required'
    ]
  });

  // HIPAA-specific
  if (regulations.includes('HIPAA')) {
    checklist.push({
      category: 'HIPAA Compliance',
      items: [
        'BAA required for all vendors handling PHI',
        'Minimum Necessary Standard applied',
        'PHI de-identification method selected',
        'Breach notification procedures (60-day window)',
        'Patient rights (access, amendment, accounting) supported'
      ]
    });
  }

  // PCI-DSS specific
  if (regulations.includes('PCI-DSS')) {
    checklist.push({
      category: 'PCI-DSS Compliance',
      items: [
        'Cardholder data environment (CDE) boundaries defined',
        'PCI scope and SAQ level determined',
        'Card data never stored in plaintext',
        'Network segmentation documented',
        'Vulnerability scanning cadence specified'
      ]
    });
  }

  // GDPR-specific
  if (regulations.includes('GDPR')) {
    checklist.push({
      category: 'GDPR Compliance',
      items: [
        'Lawful basis for processing identified',
        'Right to deletion (erasure) supported',
        'Data portability supported',
        'Privacy impact assessment required',
        'Breach notification (72-hour window)'
      ]
    });
  }

  // FedRAMP-specific
  if (regulations.includes('FedRAMP')) {
    checklist.push({
      category: 'FedRAMP Compliance',
      items: [
        'FIPS 140-2 validated cryptography required',
        'Impact level classified (Low/Moderate/High)',
        'Continuous monitoring plan documented',
        'Authority to Operate (ATO) process identified'
      ]
    });
  }

  return checklist;
}

/**
 * Evaluate regulatory requirements for a project.
 *
 * @param {object} input - Project details.
 * @returns {object} Regulatory gate results.
 */
function evaluateRegulatory(input) {
  const {
    project_domain = 'general',
    risk_level = 'low',
    data_types = [],
    regions = []
  } = input;

  const domainKey = project_domain.toLowerCase();
  const domainInfo = DOMAIN_REGULATIONS[domainKey];

  let classification = 'general';
  let applicableRegulations = [];
  let requiredChecks = [];
  let effectiveRiskLevel = risk_level;

  if (domainInfo) {
    classification = domainInfo.classification;
    applicableRegulations = [...domainInfo.regulations];

    // Elevate risk if domain requires it
    const riskOrder = ['low', 'medium', 'high', 'critical'];
    const domainRiskIdx = riskOrder.indexOf(domainInfo.min_risk);
    const inputRiskIdx = riskOrder.indexOf(risk_level);
    if (domainRiskIdx > inputRiskIdx) {
      effectiveRiskLevel = domainInfo.min_risk;
    }
  }

  // Add region-based regulations
  for (const region of regions) {
    const regionRegs = REGION_REGULATIONS[region] || [];
    for (const reg of regionRegs) {
      if (!applicableRegulations.includes(reg)) {
        applicableRegulations.push(reg);
      }
    }
  }

  // Check data type implications
  if (data_types.includes('PHI') && !applicableRegulations.includes('HIPAA')) {
    applicableRegulations.push('HIPAA');
  }
  if (data_types.includes('PCI') && !applicableRegulations.includes('PCI-DSS')) {
    applicableRegulations.push('PCI-DSS');
  }
  if (data_types.includes('PII')) {
    requiredChecks.push('Privacy impact assessment');
    requiredChecks.push('Data retention policy');
  }

  // Generate checklist
  const checklistItems = generateChecklist(classification, applicableRegulations);
  const gateRequired = applicableRegulations.length > 0 || effectiveRiskLevel === 'critical' || effectiveRiskLevel === 'high';

  return {
    classification,
    risk_level: effectiveRiskLevel,
    applicable_regulations: applicableRegulations,
    required_checks: requiredChecks,
    checklist_items: checklistItems,
    gate_required: gateRequired,
    data_types: data_types.length > 0 ? data_types : (domainInfo ? domainInfo.data_types : []),
    template: '.jumpstart/templates/compliance-checklist.md'
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (process.argv[1] && (
  process.argv[1].endsWith('regulatory-gate.mjs') ||
  process.argv[1].endsWith('regulatory-gate')
)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const parsed = input.trim() ? JSON.parse(input) : {};
      const result = evaluateRegulatory(parsed);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
  });

  if (process.stdin.isTTY) {
    const result = evaluateRegulatory({});
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}

export { evaluateRegulatory, generateChecklist, DOMAIN_REGULATIONS, REGION_REGULATIONS };
