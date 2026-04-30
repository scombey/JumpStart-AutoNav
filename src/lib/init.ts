/**
 * init.ts -- Interactive Init (Item 76).
 *
 * Adjusts explanation detail based on user's chosen skill level.
 * Pure in-memory computation — no file I/O, no process.exit (ADR-006).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkillLevel = 'beginner' | 'intermediate' | 'expert';
export type ProjectType = 'greenfield' | 'brownfield';

export interface SkillPreset {
  explanation_depth: string;
  show_examples: boolean;
  verbose_gates: boolean;
  auto_hints: boolean;
  config_overrides: Record<string, boolean | string>;
  recommendations: string[];
}

export interface InitConfig {
  skill_level: string;
  project_type: string;
  explanation_depth: string;
  show_examples: boolean;
  verbose_gates: boolean;
  auto_hints: boolean;
  config_overrides: Record<string, boolean | string>;
  recommendations: string[];
}

export interface GenerateInitConfigInput {
  skill_level?: string | undefined;
  project_type?: string | undefined;
}

// ─── Skill-level presets ──────────────────────────────────────────────────────

export const SKILL_PRESETS: Record<SkillLevel, SkillPreset> = {
  beginner: {
    explanation_depth: 'detailed',
    show_examples: true,
    verbose_gates: true,
    auto_hints: true,
    config_overrides: {
      'workflow.explanation_level': 'detailed',
      'workflow.show_hints': true,
      'workflow.verbose_gates': true,
    },
    recommendations: [
      'Read the AGENTS.md file for an overview of the workflow',
      'Start with /jumpstart.challenge to define your problem',
      'Follow each phase sequentially — do not skip ahead',
      'Use /jumpstart.help at any time for phase-specific guidance',
      'Review the Gherkin guide for writing acceptance criteria',
    ],
  },
  intermediate: {
    explanation_depth: 'standard',
    show_examples: false,
    verbose_gates: true,
    auto_hints: false,
    config_overrides: {
      'workflow.explanation_level': 'standard',
      'workflow.show_hints': false,
      'workflow.verbose_gates': true,
    },
    recommendations: [
      'Run /jumpstart.status to see project progress at any time',
      'Use /jumpstart.pitcrew for multi-agent advisory discussions',
      'Review specs/ artifacts before advancing phases',
    ],
  },
  expert: {
    explanation_depth: 'minimal',
    show_examples: false,
    verbose_gates: false,
    auto_hints: false,
    config_overrides: {
      'workflow.explanation_level': 'minimal',
      'workflow.show_hints': false,
      'workflow.verbose_gates': false,
    },
    recommendations: [
      'Use /jumpstart.quick for small changes that skip full flow',
      'Run /jumpstart.crossref to validate spec linkage',
      'Consider /jumpstart.scan for brownfield projects',
    ],
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate initialization configuration based on skill level.
 */
export function generateInitConfig(input: GenerateInitConfigInput): InitConfig {
  const { skill_level = 'intermediate', project_type = 'greenfield' } = input;
  const normalizedLevel = skill_level.toLowerCase();

  // Use Object.prototype.hasOwnProperty to safely check the preset exists
  // (prevents __proto__/constructor/prototype keys from causing pollution).
  const validLevels: SkillLevel[] = ['beginner', 'intermediate', 'expert'];
  const safeLevel: SkillLevel = validLevels.includes(normalizedLevel as SkillLevel)
    ? (normalizedLevel as SkillLevel)
    : 'intermediate';

  const preset: SkillPreset = SKILL_PRESETS[safeLevel];

  // Add project-type-specific recommendations
  const recommendations = [...preset.recommendations];
  if (project_type === 'brownfield') {
    recommendations.unshift('Run /jumpstart.scout first to analyze your existing codebase');
    recommendations.push('The Scout output will inform all subsequent phases');
  }

  return {
    skill_level: normalizedLevel,
    project_type,
    explanation_depth: preset.explanation_depth,
    show_examples: preset.show_examples,
    verbose_gates: preset.verbose_gates,
    auto_hints: preset.auto_hints,
    config_overrides: preset.config_overrides,
    recommendations,
  };
}
