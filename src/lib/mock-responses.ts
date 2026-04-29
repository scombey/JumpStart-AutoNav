/**
 * mock-responses.ts — mock response registry port (T4.3.1).
 *
 * Pure-library port of `bin/lib/mock-responses.js`. Public surface
 * preserved verbatim by name + signature:
 *
 *   - `createMockRegistry()` => MockRegistry
 *   - `createPersonaRegistry(persona)` => MockRegistry
 *
 * Behavior parity:
 *   - DEFAULT_ASK_RESPONSES (8 canned headers) preserved verbatim.
 *   - PERSONA_OVERRIDES (compliant-user, enterprise-user, strict-user)
 *     preserved verbatim.
 *   - Lookup priority: custom > default > recommended option > first
 *     option > {selected:[], freeText:'Approved'} fallback.
 *   - getCompletionResponse always returns null (no override hook
 *     wired today; left in place for future mock LLM provider
 *     interop).
 *
 * @see bin/lib/mock-responses.js (legacy reference)
 * @see specs/implementation-plan.md T4.3.1
 */

// Public types

export interface AskQuestionsAnswer {
  selected: string[];
  freeText: string | null;
  skipped: boolean;
}

export interface AskQuestionOption {
  label: string;
  recommended?: boolean | undefined;
}

export interface AskQuestion {
  header: string;
  options?: AskQuestionOption[];
}

export interface AskQuestionsArgs {
  questions: AskQuestion[];
}

export interface AskQuestionsResult {
  answers: Record<string, AskQuestionsAnswer>;
}

export interface MockRegistry {
  getAskQuestionsResponse(args: AskQuestionsArgs): AskQuestionsResult;
  setAskQuestionsResponse(header: string, response: AskQuestionsAnswer): void;
  getCallCount(): number;
  getCompletionResponse(messages: unknown[]): string | null;
}

// Defaults preserved verbatim from legacy

const DEFAULT_ASK_RESPONSES: Record<string, AskQuestionsAnswer> = {
  TechPrefs: { selected: ['Node.js with Express'], freeText: null, skipped: false },
  Database: { selected: ['PostgreSQL'], freeText: null, skipped: false },
  Frontend: { selected: ['React'], freeText: null, skipped: false },
  Hosting: { selected: ['Vercel'], freeText: null, skipped: false },
  TestFramework: { selected: ['Vitest'], freeText: null, skipped: false },
  Ceremony: { selected: ['Standard'], freeText: null, skipped: false },
  ProjectType: { selected: ['greenfield'], freeText: null, skipped: false },
  Approval: { selected: ['Approved'], freeText: null, skipped: false },
};

const PERSONA_OVERRIDES: Record<string, Record<string, AskQuestionsAnswer>> = {
  'compliant-user': {
    // Uses all defaults — approves quickly, picks sensible options
  },
  'enterprise-user': {
    TechPrefs: { selected: ['Java with Spring Boot'], freeText: null, skipped: false },
    Database: { selected: ['Oracle'], freeText: null, skipped: false },
    Frontend: { selected: ['Angular'], freeText: null, skipped: false },
    Hosting: { selected: ['AWS ECS'], freeText: null, skipped: false },
    Ceremony: { selected: ['Rigorous'], freeText: null, skipped: false },
  },
  'strict-user': {
    Ceremony: { selected: ['Rigorous'], freeText: null, skipped: false },
  },
};

// Implementation

/**
 * Create a mock response registry with default responses. Each call
 * to `getAskQuestionsResponse` increments the internal call counter.
 */
export function createMockRegistry(): MockRegistry {
  const customResponses: Record<string, AskQuestionsAnswer> = {};
  let callCount = 0;

  return {
    getAskQuestionsResponse(args: AskQuestionsArgs): AskQuestionsResult {
      callCount++;
      const answers: Record<string, AskQuestionsAnswer> = {};

      for (const q of args.questions) {
        const header = q.header;

        // 1. Custom override
        if (customResponses[header]) {
          answers[header] = customResponses[header];
          continue;
        }

        // 2. Default registry
        if (DEFAULT_ASK_RESPONSES[header]) {
          answers[header] = DEFAULT_ASK_RESPONSES[header];
          continue;
        }

        // 3. Fallback: pick recommended option, else first option
        if (q.options && q.options.length > 0) {
          const recommended = q.options.find((o) => o.recommended);
          const selected = recommended ? recommended.label : q.options[0]?.label;
          if (selected !== undefined) {
            answers[header] = { selected: [selected], freeText: null, skipped: false };
          } else {
            answers[header] = { selected: [], freeText: 'Approved', skipped: false };
          }
        } else {
          answers[header] = { selected: [], freeText: 'Approved', skipped: false };
        }
      }

      return { answers };
    },

    setAskQuestionsResponse(header: string, response: AskQuestionsAnswer): void {
      customResponses[header] = response;
    },

    getCallCount(): number {
      return callCount;
    },

    getCompletionResponse(_messages: unknown[]): string | null {
      // Default: let mock provider use its own default. Hook left in
      // place for future override; signature preserved verbatim from
      // legacy.
      return null;
    },
  };
}

/**
 * Create a persona-specific mock registry. Unknown personas fall
 * through to base defaults (legacy behavior — no error thrown).
 */
export function createPersonaRegistry(persona: string): MockRegistry {
  const registry = createMockRegistry();
  const overrides = PERSONA_OVERRIDES[persona] || {};

  for (const [header, response] of Object.entries(overrides)) {
    registry.setAskQuestionsResponse(header, response);
  }

  return registry;
}
