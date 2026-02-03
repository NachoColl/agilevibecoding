import { GoogleGenAI } from '@google/genai';
import { LLMProvider } from './llm-provider.js';

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

    const params = {
      model: this.model,
      contents: fullPrompt,
      generationConfig: {
        responseMimeType: 'application/json',  // Gemini's native JSON mode
        maxOutputTokens: 8000
      }
    };

    const response = await this._client.models.generateContent(params);
    if (!response.text) {
      throw new Error('Gemini returned no text (possible safety filter block).');
    }

    this._trackTokens(response.usageMetadata);
    const content = response.text;

    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error.message}\n\nResponse was:\n${content}`);
    }
  }
}
