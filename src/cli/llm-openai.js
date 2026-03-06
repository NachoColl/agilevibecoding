import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';
import { LLMProvider } from './llm-provider.js';
import { getMaxTokensForModel } from './llm-token-limits.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export class OpenAIProvider extends LLMProvider {
  constructor(model = 'gpt-5.2-chat-latest', reasoningEffort = 'medium') {
    super('openai', model);
    this.reasoningEffort = reasoningEffort;
  }

  _createClient() {
    if (process.env.OPENAI_AUTH_MODE === 'oauth') {
      return { mode: 'oauth' };
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set. Add it to your .env file.');
    return new OpenAI({ apiKey });
  }

  /**
   * Load OAuth tokens from .avc/openai-oauth.json, refreshing if close to expiry.
   */
  async _loadOAuthTokens() {
    const oauthPath = path.join(process.cwd(), '.avc', 'openai-oauth.json');
    const raw = await fs.readFile(oauthPath, 'utf8');
    let tokens = JSON.parse(raw);

    // Refresh if within 60s of expiry
    if (tokens.expires - Date.now() < 60_000) {
      const body = new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     'app_EMoamEEZ73f0CkXaXp7hrann',
        refresh_token: tokens.refresh,
      });
      const resp = await fetch('https://auth.openai.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!resp.ok) throw new Error(`OAuth token refresh failed: ${resp.status}`);
      const refreshed = await resp.json();
      tokens = {
        access:    refreshed.access_token,
        refresh:   refreshed.refresh_token || tokens.refresh,
        expires:   Date.now() + (refreshed.expires_in || 3600) * 1000,
        accountId: tokens.accountId,
      };
      await fs.writeFile(oauthPath, JSON.stringify(tokens, null, 2), 'utf8');
    }

    return { access: tokens.access, accountId: tokens.accountId };
  }

  /**
   * Call the ChatGPT Codex endpoint using OAuth bearer token.
   */
  async _callChatGPTCodex(prompt, agentInstructions) {
    const { access, accountId } = await this._loadOAuthTokens();

    const t0 = Date.now();
    const resp = await fetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      headers: {
        'Authorization':       `Bearer ${access}`,
        'chatgpt-account-id':  accountId,
        'Content-Type':        'application/json',
        'OpenAI-Beta':         'responses=experimental',
        'accept':              'application/json',
      },
      body: JSON.stringify({
        model:        this.model,
        instructions: agentInstructions || 'You are a helpful assistant.',
        input:        [{ role: 'user', content: prompt }],
        store:        false,
        stream:       true,
      }),
    });

    if (!resp.ok) {
      const raw = await resp.text();
      throw new Error(`ChatGPT Codex API error (${resp.status}): ${raw}`);
    }

    // Parse SSE stream — accumulate text from delta events; use response.done for final text + usage
    const body = await resp.text();
    let text = '';
    let finalEvent = null;
    for (const line of body.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const chunk = line.slice(6).trim();
      if (chunk === '[DONE]') break;
      try {
        const event = JSON.parse(chunk);
        if (event.type === 'response.output_text.delta') {
          text += event.delta ?? '';
        } else if (event.type === 'response.output_text.done') {
          text = event.text ?? text;   // prefer the complete text when available
        } else if (event.type === 'response.done' || event.type === 'response.completed') {
          finalEvent = event.response ?? event;
          // response.done may carry output_text if delta events were absent
          if (!text) {
            text = finalEvent?.output_text ?? finalEvent?.output?.[0]?.content?.[0]?.text ?? '';
          }
          break;
        }
      } catch { /* skip malformed lines */ }
    }
    const usage = finalEvent?.usage ?? null;

    this._trackTokens(usage, {
      prompt,
      agentInstructions: agentInstructions ?? null,
      response: text,
      elapsed: Date.now() - t0,
    });

    return text;
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

    // max_completion_tokens is the modern unified parameter; max_tokens is only for legacy gpt-3.5-turbo
    if (this.model.startsWith('gpt-3.5')) {
      params.max_tokens = maxTokens;
    } else {
      params.max_completion_tokens = maxTokens;
    }

    const response = await this._client.chat.completions.create(params);

    this._trackTokens(response.usage);
    return response.choices[0].message.content;
  }

  /**
   * Call using Responses API (pro/codex models)
   * @param {string} prompt
   * @param {string|null} systemInstructions
   * @param {Object|null} [promptPayload] - Partial payload { prompt, agentInstructions } to log
   */
  async _callResponsesAPI(prompt, systemInstructions, promptPayload = null) {
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

    const _t0 = Date.now();
    const response = await this._withRetry(
      () => this._client.responses.create(params),
      'Responses API call'
    );
    const _elapsed = Date.now() - _t0;

    const text = response.output_text;

    // Track tokens if usage data is available
    if (response.usage) {
      const finalPayload = promptPayload ? {
        ...promptPayload,
        response: text,
        elapsed: _elapsed,
      } : null;
      this._trackTokens(response.usage, finalPayload);
    }

    return text;
  }

  async _callProvider(prompt, maxTokens, systemInstructions) {
    if (this._usesResponsesAPI()) {
      return await this._callResponsesAPI(prompt, systemInstructions);
    } else {
      return await this._callChatCompletions(prompt, maxTokens, systemInstructions);
    }
  }

  /** True when oauth mode is active AND fallback to api-key is enabled AND key is present */
  _hasFallback() {
    return process.env.OPENAI_AUTH_MODE === 'oauth'
      && process.env.OPENAI_OAUTH_FALLBACK === 'true'
      && !!process.env.OPENAI_API_KEY;
  }

  /** Create a plain OpenAI SDK client using OPENAI_API_KEY (for fallback) */
  _createApiKeyClient() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generateJSON(prompt, agentInstructions = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    // OAuth path — route through ChatGPT Codex endpoint
    if (this._client?.mode === 'oauth') {
      try {
        const jsonInstructions = (agentInstructions ? agentInstructions + '\n\n' : '')
          + 'You are a helpful assistant that always returns valid JSON. Your response must be a valid JSON object or array, nothing else.';
        const text = await this._callChatGPTCodex(prompt, jsonInstructions);
        let jsonStr = text.trim();
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim();
        }
        try {
          return JSON.parse(jsonStr);
        } catch (firstError) {
          if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
            try { return JSON.parse(jsonrepair(jsonStr)); } catch { /* fall through */ }
          }
          throw new Error(`Failed to parse JSON response: ${firstError.message}\n\nResponse was:\n${text}`);
        }
      } catch (oauthErr) {
        if (!this._hasFallback()) throw oauthErr;
        console.warn(`[openai] OAuth call failed, falling back to API key: ${oauthErr.message}`);
        this._client = this._createApiKeyClient();
        // fall through to standard paths below
      }
    }

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    if (this._usesResponsesAPI()) {
      // Responses API: Use system instructions to enforce JSON
      const systemInstructions = 'You are a helpful assistant that always returns valid JSON. Your response must be a valid JSON object or array, nothing else.';
      const _rApiPayload = this._promptLogger ? { prompt: fullPrompt, agentInstructions: agentInstructions ?? null } : null;
      const response = await this._callResponsesAPI(fullPrompt, systemInstructions, _rApiPayload);

      // Parse and return JSON
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
        jsonStr = jsonStr.replace(/\n?\s*```\s*$/, '');
        jsonStr = jsonStr.trim();
      }

      try {
        return JSON.parse(jsonStr);
      } catch (firstError) {
        if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
          try {
            return JSON.parse(jsonrepair(jsonStr));
          } catch { /* fall through to throw */ }
        }
        throw new Error(`Failed to parse JSON response: ${firstError.message}\n\nResponse was:\n${response}`);
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

      // Use model-specific maximum tokens
      const maxTokens = getMaxTokensForModel(this.model);

      // max_completion_tokens is the modern unified parameter; max_tokens is only for legacy gpt-3.5-turbo
      if (this.model.startsWith('gpt-3.5')) {
        params.max_tokens = maxTokens;
      } else {
        params.max_completion_tokens = maxTokens;
      }

      // Enable JSON mode if model supports it (GPT-4+)
      if (this.model.startsWith('gpt-4') || this.model.startsWith('gpt-5') || this.model.startsWith('o')) {
        params.response_format = { type: 'json_object' };
      }

      const _t0Json = Date.now();
      const response = await this._withRetry(
        () => this._client.chat.completions.create(params),
        'JSON generation (Chat Completions)'
      );

      const content = response.choices[0].message.content;
      this._trackTokens(response.usage, {
        prompt: fullPrompt,
        agentInstructions: agentInstructions ?? null,
        response: content,
        elapsed: Date.now() - _t0Json,
      });

      // Strip markdown code fences if present (defense-in-depth)
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
        jsonStr = jsonStr.replace(/\n?\s*```\s*$/, '');
        jsonStr = jsonStr.trim();
      }

      try {
        return JSON.parse(jsonStr);
      } catch (firstError) {
        if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
          try {
            return JSON.parse(jsonrepair(jsonStr));
          } catch { /* fall through to throw */ }
        }
        throw new Error(`Failed to parse JSON response: ${firstError.message}\n\nResponse was:\n${content}`);
      }
    }
  }

  async generateText(prompt, agentInstructions = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    // OAuth path — route through ChatGPT Codex endpoint
    if (this._client?.mode === 'oauth') {
      try {
        return await this._callChatGPTCodex(prompt, agentInstructions);
      } catch (oauthErr) {
        if (!this._hasFallback()) throw oauthErr;
        console.warn(`[openai] OAuth call failed, falling back to API key: ${oauthErr.message}`);
        this._client = this._createApiKeyClient();
        // fall through to standard paths below
      }
    }

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    if (this._usesResponsesAPI()) {
      // Responses API
      const _rApiPayload = this._promptLogger ? { prompt: fullPrompt, agentInstructions: agentInstructions ?? null } : null;
      return await this._callResponsesAPI(fullPrompt, null, _rApiPayload);
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

      // Use model-specific maximum tokens
      const maxTokens = getMaxTokensForModel(this.model);

      // max_completion_tokens is the modern unified parameter; max_tokens is only for legacy gpt-3.5-turbo
      if (this.model.startsWith('gpt-3.5')) {
        params.max_tokens = maxTokens;
      } else {
        params.max_completion_tokens = maxTokens;
      }

      const _t0Text = Date.now();
      const response = await this._withRetry(
        () => this._client.chat.completions.create(params),
        'Text generation (Chat Completions)'
      );

      const textContent = response.choices[0].message.content;
      this._trackTokens(response.usage, {
        prompt: fullPrompt,
        agentInstructions: agentInstructions ?? null,
        response: textContent,
        elapsed: Date.now() - _t0Text,
      });
      return textContent;
    }
  }
}
