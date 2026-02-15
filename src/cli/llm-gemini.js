import { GoogleGenAI } from '@google/genai';
import { LLMProvider } from './llm-provider.js';
import { getMaxTokensForModel } from './llm-token-limits.js';

export class GeminiProvider extends LLMProvider {
  constructor(model = 'gemini-2.5-flash') { super('gemini', model); }

  _createClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set. Add it to your .env file.');
    return new GoogleGenAI({ apiKey });
  }

  async _callProvider(prompt, maxTokens, systemInstructions) {
    const params = {
      model: this.model,
      contents: prompt,
      generationConfig: { maxOutputTokens: maxTokens }
    };

    if (systemInstructions) {
      params.systemInstruction = systemInstructions;
    }

    const response = await this._client.models.generateContent(params);
    if (!response.text) {
      throw new Error('Gemini returned no text (possible safety filter block).');
    }
    this._trackTokens(response.usageMetadata);
    return response.text;
  }

  async generateJSON(prompt, agentInstructions = null) {
    if (!this._client) {
      this._client = this._createClient();
    }

    const fullPrompt = agentInstructions ? `${agentInstructions}\n\n${prompt}` : prompt;

    // Use model-specific maximum tokens
    const maxTokens = getMaxTokensForModel(this.model);

    const params = {
      model: this.model,
      contents: fullPrompt,
      generationConfig: {
        responseMimeType: 'application/json',  // Gemini's native JSON mode
        maxOutputTokens: maxTokens
      }
    };

    const response = await this._withRetry(
      () => this._client.models.generateContent(params),
      'JSON generation (Gemini)'
    );
    if (!response.text) {
      throw new Error('Gemini returned no text (possible safety filter block).');
    }

    this._trackTokens(response.usageMetadata);
    const content = response.text;

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

    const params = {
      model: this.model,
      contents: fullPrompt,
      generationConfig: {
        maxOutputTokens: maxTokens
      }
    };

    const response = await this._withRetry(
      () => this._client.models.generateContent(params),
      'Text generation (Gemini)'
    );
    if (!response.text) {
      throw new Error('Gemini returned no text (possible safety filter block).');
    }

    this._trackTokens(response.usageMetadata);
    return response.text;
  }
}
