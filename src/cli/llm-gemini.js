import { GoogleGenAI } from '@google/genai';
import { LLMProvider } from './llm-provider.js';

export class GeminiProvider extends LLMProvider {
  constructor(model = 'gemini-2.5-flash') { super('gemini', model); }

  _createClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set. Add it to your .env file.');
    return new GoogleGenAI({ apiKey });
  }

  async _callProvider(prompt, maxTokens) {
    const response = await this._client.models.generateContent({
      model: this.model,
      contents: prompt,
      generationConfig: { maxOutputTokens: maxTokens }
    });
    if (!response.text) {
      throw new Error('Gemini returned no text (possible safety filter block).');
    }
    return response.text;
  }
}
