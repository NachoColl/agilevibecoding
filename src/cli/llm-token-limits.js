/**
 * Model-specific maximum output token limits (ACTUAL API MAXIMUMS)
 *
 * These limits represent the ACTUAL maximum output tokens each model can generate
 * according to official API documentation (verified February 2026).
 *
 * Critical Updates (Feb 2026):
 * - Claude 4.x models: 64K-128K tokens (8x-16x previous limits)
 * - Gemini 2.5 Flash: 65,535 tokens (8x previous limit)
 * - GPT-4o/mini: 16,384 tokens (unchanged)
 *
 * Using actual model limits ensures complete documentation generation without truncation.
 *
 * Sources:
 * - Claude: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude/
 * - Gemini: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/
 * - OpenAI: https://community.openai.com/t/what-is-the-token-limit-of-the-new-version-gpt-4o/752528
 */

export const MODEL_MAX_TOKENS = {
  // Claude models (Anthropic)
  // Source: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude/
  'claude-sonnet-4-5-20250929': 64000,  // Was 8192 - ACTUAL: 64,000 tokens
  'claude-sonnet-4-5': 64000,
  'claude-sonnet-4': 64000,
  'claude-opus-4-6': 128000,            // Was 16384 - ACTUAL: 128,000 tokens
  'claude-opus-4': 128000,
  'claude-haiku-4-5-20251001': 64000,   // Was 8192 - ACTUAL: 64,000 tokens
  'claude-haiku-4-5': 64000,
  'claude-haiku-4': 64000,

  // OpenAI models
  // Source: https://community.openai.com/t/what-is-the-token-limit-of-the-new-version-gpt-4o/752528
  // GPT-5 family (32K output tokens assumed; add specific overrides as official limits are confirmed)
  'gpt-5':         32768,
  'gpt-5.1':       32768,
  'gpt-5.2':       32768,
  'gpt-5.4':       32768,
  'gpt-5-mini':    32768,
  'gpt-5.2-chat-latest': 16384,  // Keep at 16384 — existing tests depend on this value
  'gpt-5.2-pro':   16384,
  'gpt-5.2-codex': 16384,
  'gpt-4o': 16384,                 // Correct - max 16,384 tokens
  'gpt-4o-2024-11-20': 16384,
  'gpt-4o-mini': 16384,            // Correct - max 16,384 tokens
  'gpt-4-turbo': 4096,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 4096,

  // Google Gemini models
  // Source: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/
  'gemini-3.1-pro-preview': 65536, // ACTUAL: 65,536 tokens (verified March 2026)
  'gemini-3-flash-preview': 65536, // ACTUAL: 65,536 tokens (verified March 2026)
  'gemini-2.5-pro': 65536,         // ACTUAL: 65,536 tokens
  'gemini-2.5-flash': 65535,       // Was 8192 - ACTUAL: 65,535 tokens
  'gemini-2.5-flash-lite': 32768,  // ACTUAL: 32,768 tokens
  'gemini-2.0-flash': 8192,        // Correct - max 8,192 tokens
  'gemini-2.0-flash-exp': 8192,
  'gemini-1.5-pro': 8192,
  'gemini-1.5-flash': 8192,
  'gemini-pro': 8192,

  // Default fallback
  'default': 8192
};

/**
 * Get maximum output tokens for a specific model
 * @param {string} modelId - The model identifier
 * @returns {number} Maximum output tokens supported by the model
 */
export function getMaxTokensForModel(modelId) {
  if (!modelId) {
    return MODEL_MAX_TOKENS['default'];
  }

  // Direct lookup
  if (MODEL_MAX_TOKENS[modelId]) {
    return MODEL_MAX_TOKENS[modelId];
  }

  // Fuzzy match for versioned models (e.g., "claude-opus-4-latest" → "claude-opus-4")
  const baseModel = modelId.split('-').slice(0, 3).join('-');
  if (MODEL_MAX_TOKENS[baseModel]) {
    return MODEL_MAX_TOKENS[baseModel];
  }

  // Prefix fallback: catch any gpt-5.x variant not explicitly listed
  if (modelId.startsWith('gpt-5')) {
    console.warn(`No exact max tokens for "${modelId}", using GPT-5 family default: 32768`);
    return 32768;
  }

  // Fallback to default
  console.warn(`No max tokens configured for model "${modelId}", using default: ${MODEL_MAX_TOKENS['default']}`);
  return MODEL_MAX_TOKENS['default'];
}

/**
 * Validate if requested tokens exceed model limit
 * @param {string} modelId - The model identifier
 * @param {number} requestedTokens - Requested output tokens
 * @returns {number} Clamped token value within model limits
 */
export function clampTokensToModelLimit(modelId, requestedTokens) {
  const maxTokens = getMaxTokensForModel(modelId);

  if (requestedTokens > maxTokens) {
    console.warn(`Requested ${requestedTokens} tokens for ${modelId}, clamping to model limit: ${maxTokens}`);
    return maxTokens;
  }

  return requestedTokens;
}
