import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './llm-provider.js';
import { getMaxTokensForModel } from './llm-token-limits.js';

export class ClaudeProvider extends LLMProvider {
  constructor(model) { super('claude', model); }

  _createClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set. Add it to your .env file.');
    return new Anthropic({ apiKey });
  }

  async _callProvider(prompt, maxTokens, systemInstructions) {
    const params = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    };

    if (systemInstructions) {
      params.system = systemInstructions;
    }

    const response = await this._client.messages.create(params);
    this._trackTokens(response.usage);
    return response.content[0].text;
  }

  async generateJSON(prompt, agentInstructions = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    // Use model-specific maximum tokens
    const maxTokens = getMaxTokensForModel(this.model);

    const response = await this._withRetry(
      () => this._client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: fullPrompt
        }],
        system: 'You are a helpful assistant that always returns valid JSON. Your response must be a valid JSON object or array, nothing else.'
      }),
      'JSON generation (Claude)'
    );

    this._trackTokens(response.usage);
    const content = response.content[0].text;

    // Extract JSON from response (handle markdown code blocks)
    // Strip markdown code fences if present (more robust)
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      // Remove opening fence (```json or ```)
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
      // Remove closing fence
      jsonStr = jsonStr.replace(/\n?\s*```\s*$/, '');
      jsonStr = jsonStr.trim();
    }

    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error.message}\n\nResponse was:\n${content}`);
    }
  }

  async generateText(prompt, agentInstructions = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    // Use model-specific maximum tokens
    const maxTokens = getMaxTokensForModel(this.model);

    const response = await this._withRetry(
      () => this._client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: fullPrompt
        }]
      }),
      'Text generation (Claude)'
    );

    this._trackTokens(response.usage);
    return response.content[0].text;
  }
}
