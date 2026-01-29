import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeminiProvider } from '../../cli/llm-gemini.js';

describe('GeminiProvider', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key-12345';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  describe('constructor', () => {
    it('sets providerName to "gemini"', () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      expect(provider.providerName).toBe('gemini');
    });

    it('stores model name', () => {
      const provider = new GeminiProvider('gemini-2.0-pro');

      expect(provider.model).toBe('gemini-2.0-pro');
    });

    it('uses default model when not provided', () => {
      const provider = new GeminiProvider();

      expect(provider.model).toBe('gemini-2.5-flash');
    });

    it('initializes _client to null', () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      expect(provider._client).toBeNull();
    });
  });

  describe('_createClient()', () => {
    it('throws error when GEMINI_API_KEY not set', () => {
      delete process.env.GEMINI_API_KEY;

      const provider = new GeminiProvider('gemini-2.5-flash');

      expect(() => provider._createClient()).toThrow('GEMINI_API_KEY not set');
    });

    it('includes helpful message about .env file', () => {
      delete process.env.GEMINI_API_KEY;

      const provider = new GeminiProvider('gemini-2.5-flash');

      expect(() => provider._createClient()).toThrow('Add it to your .env file');
    });

    it('creates GoogleGenAI client when API key present', () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      const client = provider._createClient();

      expect(client).toBeDefined();
      expect(client.constructor.name).toBe('GoogleGenAI');
    });

    it('passes API key to GoogleGenAI constructor', () => {
      process.env.GEMINI_API_KEY = 'custom-gemini-key';

      const provider = new GeminiProvider('gemini-2.5-flash');
      const client = provider._createClient();

      expect(client).toBeDefined();
    });
  });

  describe('_callProvider()', () => {
    it('calls GoogleGenAI models.generateContent with correct parameters', async () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      // Mock the Google GenAI client
      const mockClient = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: 'Generated response'
          })
        }
      };

      provider._client = mockClient;

      const result = await provider._callProvider('Test prompt', 512);

      expect(mockClient.models.generateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: 'Test prompt',
        generationConfig: { maxOutputTokens: 512 }
      });

      expect(result).toBe('Generated response');
    });

    it('extracts text from response', async () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      const mockClient = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: 'Expected output'
          })
        }
      };

      provider._client = mockClient;

      const result = await provider._callProvider('prompt', 256);

      expect(result).toBe('Expected output');
    });

    it('throws error when response has no text', async () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      const mockClient = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: null
          })
        }
      };

      provider._client = mockClient;

      await expect(provider._callProvider('prompt', 256))
        .rejects.toThrow('Gemini returned no text');
    });

    it('includes safety filter message in error', async () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      const mockClient = {
        models: {
          generateContent: vi.fn().mockResolvedValue({})
        }
      };

      provider._client = mockClient;

      await expect(provider._callProvider('prompt', 256))
        .rejects.toThrow('possible safety filter block');
    });

    it('handles API errors gracefully', async () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      const mockClient = {
        models: {
          generateContent: vi.fn().mockRejectedValue(new Error('Invalid API key'))
        }
      };

      provider._client = mockClient;

      await expect(provider._callProvider('prompt', 256))
        .rejects.toThrow('Invalid API key');
    });

    it('handles quota exceeded errors', async () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      const error = new Error('Quota exceeded');
      error.code = 429;

      const mockClient = {
        models: {
          generateContent: vi.fn().mockRejectedValue(error)
        }
      };

      provider._client = mockClient;

      try {
        await provider._callProvider('prompt', 256);
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.code).toBe(429);
      }
    });
  });

  describe('generate() integration', () => {
    it('automatically creates client on first call', async () => {
      const provider = new GeminiProvider('gemini-2.5-flash');

      // Mock the API response
      vi.mock('@google/genai', () => ({
        GoogleGenAI: class {
          models = {
            generateContent: vi.fn().mockResolvedValue({
              text: 'Generated response'
            })
          }
        }
      }));

      expect(provider._client).toBeNull();

      const result = await provider.generate('Test prompt');

      expect(provider._client).not.toBeNull();
      expect(result).toBeDefined();
    });
  });

  describe('Default model behavior', () => {
    it('falls back to gemini-2.5-flash when no model specified', () => {
      const provider = new GeminiProvider();

      expect(provider.model).toBe('gemini-2.5-flash');
    });

    it('accepts custom model names', () => {
      const provider = new GeminiProvider('gemini-2.0-pro-exp');

      expect(provider.model).toBe('gemini-2.0-pro-exp');
    });
  });
});
