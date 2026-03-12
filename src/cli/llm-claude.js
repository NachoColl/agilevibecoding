import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { LLMProvider } from './llm-provider.js';
import { getMaxTokensForModel } from './llm-token-limits.js';

export class ClaudeProvider extends LLMProvider {
  constructor(model) { super('claude', model); }

  _createClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set. Add it to your .env file.');
    // 5-minute timeout per request; SDK retries disabled so our retryWithBackoff
    // handles all retries with full logging visibility.
    return new Anthropic({ apiKey, timeout: 5 * 60 * 1000, maxRetries: 0 });
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

  async generateJSON(prompt, agentInstructions = null, cachedContext = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    // Use model-specific maximum tokens
    const maxTokens = getMaxTokensForModel(this.model);

    const JSON_SYSTEM = 'You are a helpful assistant that always returns valid JSON. Your response must be a valid JSON object or array, nothing else.';

    let systemParam;
    let userContent;

    if (cachedContext) {
      // Structured content blocks: cache_control on agentInstructions (system) and
      // cachedContext (first user block) — both stay stable across multiple calls
      // in the same ceremony, hitting the 5-min cache on subsequent validators.
      systemParam = agentInstructions
        ? [
            { type: 'text', text: JSON_SYSTEM },
            { type: 'text', text: agentInstructions, cache_control: { type: 'ephemeral' } },
          ]
        : [{ type: 'text', text: JSON_SYSTEM }];

      userContent = [
        { type: 'text', text: cachedContext, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: prompt },
      ];
    } else {
      systemParam = JSON_SYSTEM;
      userContent = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;
    }

    const requestParams = {
      model: this.model,
      max_tokens: maxTokens,
      system: systemParam,
      messages: [{ role: 'user', content: userContent }],
    };

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    const _t0Json = Date.now();
    const response = await this._withRetry(
      () => this._client.messages.create(requestParams),
      'JSON generation (Claude)'
    );

    const content = response.content[0].text;
    this._trackTokens(response.usage, {
      prompt: fullPrompt,
      agentInstructions: agentInstructions ?? null,
      response: content,
      elapsed: Date.now() - _t0Json,
    });

    // Extract JSON from response (handle markdown code blocks and preamble text)
    let jsonStr = content.trim();

    // Strip markdown code fences if the response starts with one
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
      jsonStr = jsonStr.replace(/\n?\s*```\s*$/, '');
      jsonStr = jsonStr.trim();
    }

    // If model added reasoning preamble before JSON, find the first { or [ and extract from there.
    // This handles Claude responses like "I'll analyze...\n\n```json\n{...}\n```" or "Here is the JSON:\n{...}"
    if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
      const firstBrace = jsonStr.indexOf('{');
      const firstBracket = jsonStr.indexOf('[');
      const jsonStart = firstBrace === -1 ? firstBracket
                      : firstBracket === -1 ? firstBrace
                      : Math.min(firstBrace, firstBracket);
      if (jsonStart > 0) {
        // Also strip trailing markdown fences that may follow the JSON block
        jsonStr = jsonStr.slice(jsonStart).replace(/\n?\s*```\s*$/, '').trim();
      }
    }

    try {
      return JSON.parse(jsonStr);
    } catch (firstError) {
      // Only attempt repair when the content looks like JSON (starts with { or [)
      // — avoids silently accepting completely non-JSON responses
      if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
        try {
          return JSON.parse(jsonrepair(jsonStr));
        } catch { /* fall through to throw */ }
      }
      throw new Error(`Failed to parse JSON response: ${firstError.message}\n\nResponse was:\n${content}`);
    }
  }

  async generateText(prompt, agentInstructions = null, cachedContext = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    // Use model-specific maximum tokens
    const maxTokens = getMaxTokensForModel(this.model);

    let systemParam;
    let userContent;

    if (cachedContext) {
      systemParam = agentInstructions
        ? [
            { type: 'text', text: agentInstructions, cache_control: { type: 'ephemeral' } },
          ]
        : undefined;
      userContent = [
        { type: 'text', text: cachedContext, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: prompt },
      ];
    } else {
      userContent = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;
    }

    const requestParams = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userContent }],
    };
    if (systemParam) requestParams.system = systemParam;

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    const _t0Text = Date.now();
    const response = await this._withRetry(
      () => this._client.messages.create(requestParams),
      'Text generation (Claude)'
    );

    const text = response.content[0].text;
    this._trackTokens(response.usage, {
      prompt: fullPrompt,
      agentInstructions: agentInstructions ?? null,
      response: text,
      elapsed: Date.now() - _t0Text,
    });
    return text;
  }
}
