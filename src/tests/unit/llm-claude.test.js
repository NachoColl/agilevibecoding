import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClaudeProvider } from '../../cli/llm-claude.js';

describe('ClaudeProvider', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-12345';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('constructor', () => {
    it('sets providerName to "claude"', () => {
      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      expect(provider.providerName).toBe('claude');
    });

    it('stores model name', () => {
      const provider = new ClaudeProvider('claude-opus-4-5-20250929');

      expect(provider.model).toBe('claude-opus-4-5-20250929');
    });

    it('initializes _client to null', () => {
      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      expect(provider._client).toBeNull();
    });
  });

  describe('_createClient()', () => {
    it('throws error when ANTHROPIC_API_KEY not set', () => {
      delete process.env.ANTHROPIC_API_KEY;

      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      expect(() => provider._createClient()).toThrow('ANTHROPIC_API_KEY not set');
    });

    it('includes helpful message about .env file', () => {
      delete process.env.ANTHROPIC_API_KEY;

      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      expect(() => provider._createClient()).toThrow('Add it to your .env file');
    });

    it('creates Anthropic client when API key present', () => {
      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      const client = provider._createClient();

      expect(client).toBeDefined();
      expect(typeof client.messages).toBe('object');
    });

    it('passes API key to Anthropic constructor', () => {
      process.env.ANTHROPIC_API_KEY = 'custom-key-value';

      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');
      const client = provider._createClient();

      expect(client).toBeDefined();
    });
  });

  describe('_callProvider()', () => {
    it('calls Anthropic messages.create with correct parameters', async () => {
      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      // Mock the Anthropic client
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: 'Response text' }]
          })
        }
      };

      provider._client = mockClient;

      const result = await provider._callProvider('Test prompt', 512);

      expect(mockClient.messages.create).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 512,
        messages: [{ role: 'user', content: 'Test prompt' }]
      });

      expect(result).toBe('Response text');
    });

    it('extracts text from response content', async () => {
      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: 'Expected output' }]
          })
        }
      };

      provider._client = mockClient;

      const result = await provider._callProvider('prompt', 256);

      expect(result).toBe('Expected output');
    });

    it('handles API errors gracefully', async () => {
      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      const mockClient = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('Invalid API key'))
        }
      };

      provider._client = mockClient;

      await expect(provider._callProvider('prompt', 256))
        .rejects.toThrow('Invalid API key');
    });

    it('preserves error status code from API', async () => {
      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      const error = new Error('Rate limit exceeded');
      error.status = 429;

      const mockClient = {
        messages: {
          create: vi.fn().mockRejectedValue(error)
        }
      };

      provider._client = mockClient;

      try {
        await provider._callProvider('prompt', 256);
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.status).toBe(429);
      }
    });
  });

  describe('generate() integration', () => {
    it('automatically creates client on first call', async () => {
      const provider = new ClaudeProvider('claude-sonnet-4-5-20250929');

      // Mock the API response
      vi.mock('@anthropic-ai/sdk', () => ({
        default: class {
          messages = {
            create: vi.fn().mockResolvedValue({
              content: [{ text: 'Generated response' }]
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
});
