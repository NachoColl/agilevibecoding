import OpenAI from 'openai';
import { LLMProvider } from './llm-provider.js';

export class OpenAIProvider extends LLMProvider {
  constructor(model = 'gpt-5.2-chat-latest') { super('openai', model); }

  _createClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set. Add it to your .env file.');
    return new OpenAI({ apiKey });
  }

  async _callProvider(prompt, maxTokens, systemInstructions) {
    const messages = [];

    // OpenAI uses message array - system instructions go first as system role
    if (systemInstructions) {
      messages.push({ role: 'system', content: systemInstructions });
    }

    messages.push({ role: 'user', content: prompt });

    const response = await this._client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages
    });

    this._trackTokens(response.usage);
    return response.choices[0].message.content;
  }

  async generateJSON(prompt, agentInstructions = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that always returns valid JSON. Your response must be a valid JSON object or array, nothing else.'
      },
      {
        role: 'user',
        content: fullPrompt
      }
    ];

    // Use native JSON mode for GPT-4+ models
    const params = {
      model: this.model,
      max_tokens: 8000,
      messages
    };

    // Enable JSON mode if model supports it (GPT-4+)
    if (this.model.startsWith('gpt-4') || this.model.startsWith('gpt-5') || this.model.startsWith('o')) {
      params.response_format = { type: 'json_object' };
    }

    const response = await this._client.chat.completions.create(params);

    this._trackTokens(response.usage);
    const content = response.choices[0].message.content;

    // Strip markdown code fences if present (defense-in-depth)
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

    const messages = [
      {
        role: 'user',
        content: fullPrompt
      }
    ];

    const response = await this._client.chat.completions.create({
      model: this.model,
      max_tokens: 8000,
      messages
    });

    this._trackTokens(response.usage);
    return response.choices[0].message.content;
  }
}
