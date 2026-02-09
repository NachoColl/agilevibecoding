export class LLMProvider {
  constructor(providerName, model) {
    this.providerName = providerName;
    this.model = model;
    this._client = null;
    this.tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalCalls: 0
    };
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
    return this._callProvider(prompt, maxTokens, systemInstructions);
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
