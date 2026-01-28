export class LLMProvider {
  constructor(providerName, model) {
    this.providerName = providerName;
    this.model = model;
    this._client = null;
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
      default:
        throw new Error(`Unknown LLM provider: "${providerName}". Supported: claude, gemini`);
    }
  }

  // Public API — single method, callers never touch SDK objects
  async generate(prompt, maxTokens = 256) {
    if (!this._client) {
      this._client = this._createClient();
    }
    return this._callProvider(prompt, maxTokens);
  }

  // Subclass hooks — throw if not overridden
  _createClient() { throw new Error(`${this.constructor.name} must implement _createClient()`); }
  async _callProvider() { throw new Error(`${this.constructor.name} must implement _callProvider()`); }
}
