/**
 * Model-specific maximum output token limits
 *
 * These limits represent the maximum output tokens each model can generate.
 * Using model-specific limits ensures we get complete documentation without truncation.
 */

export const MODEL_MAX_TOKENS = {
  // Claude models (Anthropic)
  'claude-sonnet-4-5-20250929': 8192,
  'claude-sonnet-4-5': 8192,
  'claude-sonnet-4': 8192,
  'claude-opus-4-6': 16384,
  'claude-opus-4': 16384,
  'claude-haiku-4-5-20251001': 8192,
  'claude-haiku-4-5': 8192,
  'claude-haiku-4': 8192,

  // OpenAI models
  'gpt-5.2-chat-latest': 16384,    // Test/future model
  'gpt-5.2-pro': 16384,
  'gpt-5.2-codex': 16384,
  'gpt-4o': 16384,
  'gpt-4o-2024-11-20': 16384,
  'gpt-4o-mini': 16384,
  'gpt-4-turbo': 4096,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 4096,

  // Google Gemini models
  'gemini-2.5-flash': 8192,
  'gemini-2.0-flash': 8192,
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
