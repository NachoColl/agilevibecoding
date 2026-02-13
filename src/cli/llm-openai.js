import OpenAI from 'openai';
import { LLMProvider } from './llm-provider.js';

export class OpenAIProvider extends LLMProvider {
  constructor(model = 'gpt-5.2-chat-latest', reasoningEffort = 'medium') {
    super('openai', model);
    this.reasoningEffort = reasoningEffort;
  }

  _createClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set. Add it to your .env file.');
    return new OpenAI({ apiKey });
  }

  /**
   * Determine if model uses Responses API instead of Chat Completions API
   * Models that use Responses API: gpt-5.2-pro, gpt-5.2-codex
   */
  _usesResponsesAPI() {
    const responsesAPIModels = ['gpt-5.2-pro', 'gpt-5.2-codex'];
    return responsesAPIModels.includes(this.model);
  }

  /**
   * Call using Chat Completions API (standard models)
   */
  async _callChatCompletions(prompt, maxTokens, systemInstructions) {
    const messages = [];

    // OpenAI uses message array - system instructions go first as system role
    if (systemInstructions) {
      messages.push({ role: 'system', content: systemInstructions });
    }

    messages.push({ role: 'user', content: prompt });

    const params = {
      model: this.model,
      messages
    };

    // GPT-5+ models use max_completion_tokens, older models use max_tokens
    if (this.model.startsWith('gpt-5') || this.model.startsWith('o1') || this.model.startsWith('o3')) {
      params.max_completion_tokens = maxTokens;
    } else {
      params.max_tokens = maxTokens;
    }

    const response = await this._client.chat.completions.create(params);

    this._trackTokens(response.usage);
    return response.choices[0].message.content;
  }

  /**
   * Call using Responses API (pro/codex models)
   */
  async _callResponsesAPI(prompt, systemInstructions) {
    // Combine system instructions with prompt
    const fullInput = systemInstructions
      ? `${systemInstructions}\n\n${prompt}`
      : prompt;

    const params = {
      model: this.model,
      input: fullInput
    };

    // Add reasoning effort for models that support it
    if (this.model === 'gpt-5.2-codex' || this.model === 'gpt-5.2-pro') {
      params.reasoning = { effort: this.reasoningEffort };
    }

    const response = await this._withRetry(
      () => this._client.responses.create(params),
      'Responses API call'
    );

    // Track tokens if usage data is available
    if (response.usage) {
      this._trackTokens(response.usage);
    }

    return response.output_text;
  }

  async _callProvider(prompt, maxTokens, systemInstructions) {
    if (this._usesResponsesAPI()) {
      return await this._callResponsesAPI(prompt, systemInstructions);
    } else {
      return await this._callChatCompletions(prompt, maxTokens, systemInstructions);
    }
  }

  async generateJSON(prompt, agentInstructions = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    if (this._usesResponsesAPI()) {
      // Responses API: Use system instructions to enforce JSON
      const systemInstructions = 'You are a helpful assistant that always returns valid JSON. Your response must be a valid JSON object or array, nothing else.';
      const response = await this._callResponsesAPI(fullPrompt, systemInstructions);

      // Parse and return JSON
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
        jsonStr = jsonStr.replace(/\n?\s*```\s*$/, '');
        jsonStr = jsonStr.trim();
      }

      try {
        return JSON.parse(jsonStr);
      } catch (error) {
        throw new Error(`Failed to parse JSON response: ${error.message}\n\nResponse was:\n${response}`);
      }
    } else {
      // Chat Completions API: Use native JSON mode
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

      const params = {
        model: this.model,
        messages
      };

      // GPT-5+ models use max_completion_tokens, older models use max_tokens
      if (this.model.startsWith('gpt-5') || this.model.startsWith('o1') || this.model.startsWith('o3')) {
        params.max_completion_tokens = 8000;
      } else {
        params.max_tokens = 8000;
      }

      // Enable JSON mode if model supports it (GPT-4+)
      if (this.model.startsWith('gpt-4') || this.model.startsWith('gpt-5') || this.model.startsWith('o')) {
        params.response_format = { type: 'json_object' };
      }

      const response = await this._withRetry(
        () => this._client.chat.completions.create(params),
        'JSON generation (Chat Completions)'
      );

      this._trackTokens(response.usage);
      const content = response.choices[0].message.content;

      // Strip markdown code fences if present (defense-in-depth)
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
        jsonStr = jsonStr.replace(/\n?\s*```\s*$/, '');
        jsonStr = jsonStr.trim();
      }

      try {
        return JSON.parse(jsonStr);
      } catch (error) {
        throw new Error(`Failed to parse JSON response: ${error.message}\n\nResponse was:\n${content}`);
      }
    }
  }

  async generateText(prompt, agentInstructions = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    if (this._usesResponsesAPI()) {
      // Responses API
      return await this._callResponsesAPI(fullPrompt, null);
    } else {
      // Chat Completions API
      const messages = [
        {
          role: 'user',
          content: fullPrompt
        }
      ];

      const params = {
        model: this.model,
        messages
      };

      // GPT-5+ models use max_completion_tokens, older models use max_tokens
      if (this.model.startsWith('gpt-5') || this.model.startsWith('o1') || this.model.startsWith('o3')) {
        params.max_completion_tokens = 8000;
      } else {
        params.max_tokens = 8000;
      }

      const response = await this._withRetry(
        () => this._client.chat.completions.create(params),
        'Text generation (Chat Completions)'
      );

      this._trackTokens(response.usage);
      return response.choices[0].message.content;
    }
  }
}
