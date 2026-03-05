/**
 * Model Pricing Information
 *
 * Centralized pricing data for all supported LLM models.
 * Used by cost calculator in model configuration UI.
 *
 * Pricing is per million tokens (input + output).
 */

export const MODEL_PRICING = {
  // Claude models
  'claude-opus-4-6': {
    input: 15.0,
    output: 75.0,
    unit: 1000000,
    displayName: 'Claude Opus 4.6',
    provider: 'claude'
  },
  'claude-sonnet-4-5-20250929': {
    input: 3.0,
    output: 15.0,
    unit: 1000000,
    displayName: 'Claude Sonnet 4.5',
    provider: 'claude'
  },
  'claude-3-5-haiku-20241022': {
    input: 1.0,
    output: 5.0,
    unit: 1000000,
    displayName: 'Claude Haiku 3.5',
    provider: 'claude'
  },

  // Gemini models
  'gemini-3.1-pro-preview': {
    input: 2.0,
    output: 12.0,
    unit: 1000000,
    displayName: 'Gemini 3.1 Pro Preview',
    provider: 'gemini'
  },
  'gemini-3-flash-preview': {
    input: 0.5,
    output: 3.0,
    unit: 1000000,
    displayName: 'Gemini 3 Flash Preview',
    provider: 'gemini'
  },
  'gemini-2.5-pro': {
    input: 1.25,
    output: 10.0,
    unit: 1000000,
    displayName: 'Gemini 2.5 Pro',
    provider: 'gemini'
  },
  'gemini-2.5-flash': {
    input: 0.30,
    output: 2.50,
    unit: 1000000,
    displayName: 'Gemini 2.5 Flash',
    provider: 'gemini'
  },
  'gemini-2.5-flash-lite': {
    input: 0.10,
    output: 0.40,
    unit: 1000000,
    displayName: 'Gemini 2.5 Flash-Lite',
    provider: 'gemini'
  },
  'gemini-2.0-flash-exp': {
    input: 0.0,
    output: 0.0,
    unit: 1000000,
    displayName: 'Gemini 2.0 Flash (Free Tier)',
    provider: 'gemini'
  },
  'gemini-1.5-pro': {
    input: 1.25,
    output: 5.0,
    unit: 1000000,
    displayName: 'Gemini 1.5 Pro',
    provider: 'gemini'
  },

  // OpenAI models
  'gpt-4o': {
    input: 5.0,
    output: 15.0,
    unit: 1000000,
    displayName: 'GPT-4o',
    provider: 'openai'
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
    unit: 1000000,
    displayName: 'GPT-4o Mini',
    provider: 'openai'
  }
};

/**
 * Get pricing information for a model
 */
export function getModelPricing(modelId) {
  return MODEL_PRICING[modelId] || null;
}

/**
 * Calculate cost for given model and token count
 */
export function calculateCost(modelId, tokenCount) {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) return 0;

  // Estimate 60% input, 40% output tokens
  const inputTokens = tokenCount * 0.6;
  const outputTokens = tokenCount * 0.4;

  const inputCost = (inputTokens / pricing.unit) * pricing.input;
  const outputCost = (outputTokens / pricing.unit) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Format cost as currency string
 */
export function formatCost(cost) {
  if (cost === 0) return 'Free';
  if (cost < 0.01) return '< $0.01';
  return `$${cost.toFixed(2)}`;
}

/**
 * Get estimated token count for a stage
 */
export function getEstimatedTokens(ceremonyName, stageId) {
  const avgTokensPerCall = 3000; // Average tokens per LLM call

  const callCounts = {
    'sprint-planning': {
      'decomposition': 1,
      'doc-distribution': 25,
      'validation': 145,
      'validation-universal': 30,
      'validation-domain': 90,
      'validation-feature': 25
    },
    'sponsor-call': {
      'suggestions': 1,
      'documentation': 1,
      'validation': 2,
      'refinement': 2
    },
    'seed': {
      'decomposition': 1,
      'validation': 20,
      'context-generation': 10
    },
    'context-retrospective': {
      'documentation-update': 10,
      'context-refinement': 15
    }
  };

  const calls = callCounts[ceremonyName]?.[stageId] || 0;
  return calls * avgTokensPerCall;
}
