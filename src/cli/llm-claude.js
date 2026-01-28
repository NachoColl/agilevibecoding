import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './llm-provider.js';

export class ClaudeProvider extends LLMProvider {
  constructor(model) { super('claude', model); }

  _createClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set. Add it to your .env file.');
    return new Anthropic({ apiKey });
  }

  async _callProvider(prompt, maxTokens) {
    const response = await this._client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });
    return response.content[0].text;
  }
}
