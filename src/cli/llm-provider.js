export class LLMProvider {
  constructor(providerName, model, retryConfig = {}) {
    this.providerName = providerName;
    this.model = model;
    this._client = null;
    this.tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalCalls: 0
    };

    // Retry configuration
    this.retryConfig = {
      maxRetries: retryConfig.maxRetries || 5,
      initialDelay: retryConfig.initialDelay || 1000, // 1 second
      maxDelay: retryConfig.maxDelay || 32000, // 32 seconds
      backoffMultiplier: retryConfig.backoffMultiplier || 2
    };
  }

  /**
   * Check if error is retryable (high demand, rate limit, temporary failures)
   * Provider-specific error codes:
   * - OpenAI: 429 (rate limit), 503 (overloaded)
   * - Claude: 429 (rate_limit_error), 529 (overloaded_error)
   * - Gemini: 429 (RESOURCE_EXHAUSTED), 503 (UNAVAILABLE/overloaded)
   *
   * @param {Error} error - The error to check
   * @returns {boolean} True if error is retryable
   */
  _isRetryableError(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.status || error.code;
    const errorType = error.type || error.error?.type || '';

    // Check for provider-specific error codes
    const retryableStatusCodes = [
      429,  // Rate limit (all providers)
      503,  // Service unavailable (OpenAI, Gemini)
      529   // Overloaded (Claude/Anthropic)
    ];

    const hasRetryableCode = retryableStatusCodes.includes(errorCode);

    // Check for provider-specific error types
    const retryableErrorTypes = [
      'rate_limit_error',      // Claude
      'overloaded_error',      // Claude
      'resource_exhausted',    // Gemini
      'unavailable'            // Gemini
    ];

    const hasRetryableType = retryableErrorTypes.some(type =>
      errorType.toLowerCase().includes(type)
    );

    // Check for high demand/overload message patterns
    const highDemandPatterns = [
      'high demand',
      'experiencing high demand',
      'spikes in demand',
      'try again later',
      'temporarily unavailable',
      'service unavailable',
      'overloaded',
      'model is overloaded',
      'too many requests',
      'rate limit',
      'quota exceeded',
      'resource exhausted',
      'resource has been exhausted'
    ];

    const hasHighDemandMessage = highDemandPatterns.some(pattern =>
      errorMessage.includes(pattern)
    );

    return hasRetryableCode || hasRetryableType || hasHighDemandMessage;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract retry delay from error headers (e.g., Claude's retry-after header)
   * @param {Error} error - The error object
   * @returns {number|null} Delay in milliseconds, or null if not found
   */
  _getRetryAfterDelay(error) {
    // Check for retry-after header (Claude provides this)
    const retryAfter = error.headers?.['retry-after'] || error.error?.headers?.['retry-after'];

    if (retryAfter) {
      // retry-after can be in seconds
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000; // Convert to milliseconds
      }
    }

    return null;
  }

  /**
   * Execute an async function with exponential backoff retry strategy
   * Uses retry-after header when available (Claude), otherwise exponential backoff
   *
   * @param {Function} fn - Async function to execute
   * @param {string} operationName - Name of operation for logging
   * @returns {Promise<any>} Result of the function
   */
  async _withRetry(fn, operationName = 'API call') {
    let lastError;
    let delay = this.retryConfig.initialDelay;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Don't retry if it's not a retryable error
        if (!this._isRetryableError(error)) {
          throw error;
        }

        // Don't retry if we've exhausted all attempts
        if (attempt === this.retryConfig.maxRetries) {
          console.error(`\n⚠️  ${operationName} failed after ${this.retryConfig.maxRetries + 1} attempts`);
          throw error;
        }

        // Check for retry-after header (Claude provides this)
        const retryAfterDelay = this._getRetryAfterDelay(error);
        const currentDelay = retryAfterDelay || delay;

        // Log retry attempt with helpful info
        const retrySource = retryAfterDelay ? 'server directive' : 'exponential backoff';
        console.log(`\n⏳ ${operationName} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Retrying in ${currentDelay / 1000}s (${retrySource})...`);

        // Wait before retrying
        await this._sleep(currentDelay);

        // Exponential backoff with max cap (only if not using retry-after)
        if (!retryAfterDelay) {
          delay = Math.min(
            delay * this.retryConfig.backoffMultiplier,
            this.retryConfig.maxDelay
          );
        }
      }
    }

    throw lastError;
  }

  /**
   * Track token usage from API response
   * @param {Object} usage - Usage object from API response
   */
  _trackTokens(usage) {
    if (usage) {
      this.tokenUsage.inputTokens += usage.input_tokens || usage.inputTokens || usage.promptTokenCount || usage.prompt_tokens || 0;
      this.tokenUsage.outputTokens += usage.output_tokens || usage.outputTokens || usage.candidatesTokenCount || usage.completion_tokens || 0;
      this.tokenUsage.totalCalls++;
    }
  }

  /**
   * Get token usage statistics with cost estimate
   * @returns {Object} Token usage and cost information
   */
  getTokenUsage() {
    const total = this.tokenUsage.inputTokens + this.tokenUsage.outputTokens;

    // Pricing per 1M tokens (as of 2026-02)
    const pricing = {
      'claude': { input: 3.00, output: 15.00 },  // Claude Sonnet 4.5
      'gemini': { input: 0.15, output: 0.60 },   // Gemini 2.0 Flash
      'openai': { input: 1.75, output: 14.00 }   // GPT-5.2
    };

    const rates = pricing[this.providerName] || { input: 0, output: 0 };
    const inputCost = (this.tokenUsage.inputTokens / 1000000) * rates.input;
    const outputCost = (this.tokenUsage.outputTokens / 1000000) * rates.output;
    const estimatedCost = inputCost + outputCost;

    return {
      inputTokens: this.tokenUsage.inputTokens,
      outputTokens: this.tokenUsage.outputTokens,
      totalTokens: total,
      totalCalls: this.tokenUsage.totalCalls,
      estimatedCost,
      provider: this.providerName,
      model: this.model
    };
  }

  // Factory — async because of dynamic import (only loads the SDK you need)
  static async create(providerName, model) {
    switch (providerName) {
      case 'claude': {
        const { ClaudeProvider } = await import('./llm-claude.js');
        return new ClaudeProvider(model);
      }
      case 'gemini': {
        const { GeminiProvider } = await import('./llm-gemini.js');
        return new GeminiProvider(model);
      }
      case 'openai': {
        const { OpenAIProvider } = await import('./llm-openai.js');
        return new OpenAIProvider(model);
      }
      default:
        throw new Error(`Unknown LLM provider: "${providerName}". Supported: claude, gemini, openai`);
    }
  }

  // Public API — single method, callers never touch SDK objects
  async generate(prompt, maxTokens = 256, systemInstructions = null) {
    if (!this._client) {
      this._client = this._createClient();
    }
    return this._withRetry(
      () => this._callProvider(prompt, maxTokens, systemInstructions),
      'Text generation'
    );
  }

  // Validate API key and provider connectivity with a minimal test call
  async validateApiKey() {
    try {
      // Make a minimal API call (just asks for a single word)
      await this.generate('Reply with only the word "ok"', 10);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        code: error.status || error.code
      };
    }
  }

  // Static helper to validate a provider config
  static async validate(providerName, model) {
    try {
      const provider = await LLMProvider.create(providerName, model);
      return await provider.validateApiKey();
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Generate structured JSON output
  async generateJSON(prompt, agentInstructions = null) {
    throw new Error(`${this.constructor.name} must implement generateJSON()`);
  }

  // Subclass hooks — throw if not overridden
  _createClient() { throw new Error(`${this.constructor.name} must implement _createClient()`); }
  async _callProvider(prompt, maxTokens, systemInstructions) { throw new Error(`${this.constructor.name} must implement _callProvider()`); }
}
