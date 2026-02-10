import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from '../../cli/llm-openai.js';

describe('OpenAIProvider', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-proj-test-key-12345';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  describe('constructor', () => {
    it('sets providerName to "openai"', () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      expect(provider.providerName).toBe('openai');
    });

    it('stores model name', () => {
      const provider = new OpenAIProvider('gpt-5.2-codex');

      expect(provider.model).toBe('gpt-5.2-codex');
    });

    it('initializes _client to null', () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      expect(provider._client).toBeNull();
    });

    it('uses default model when not specified', () => {
      const provider = new OpenAIProvider();

      expect(provider.model).toBe('gpt-5.2-chat-latest');
    });
  });

  describe('_createClient()', () => {
    it('throws error when OPENAI_API_KEY not set', () => {
      delete process.env.OPENAI_API_KEY;

      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      expect(() => provider._createClient()).toThrow('OPENAI_API_KEY not set');
    });

    it('includes helpful message about .env file', () => {
      delete process.env.OPENAI_API_KEY;

      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      expect(() => provider._createClient()).toThrow('Add it to your .env file');
    });

    it('creates OpenAI client when API key present', () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const client = provider._createClient();

      expect(client).toBeDefined();
      expect(typeof client.chat).toBe('object');
    });

    it('passes API key to OpenAI constructor', () => {
      process.env.OPENAI_API_KEY = 'custom-key-value';

      const provider = new OpenAIProvider('gpt-5.2-chat-latest');
      const client = provider._createClient();

      expect(client).toBeDefined();
    });
  });

  describe('_callProvider()', () => {
    it('calls OpenAI chat.completions.create with correct parameters', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      // Mock the OpenAI client
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Response text' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      const result = await provider._callProvider('Test prompt', 512);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-5.2-chat-latest',
        max_tokens: 512,
        messages: [{ role: 'user', content: 'Test prompt' }]
      });

      expect(result).toBe('Response text');
    });

    it('includes system instructions when provided', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider._callProvider('Test prompt', 512, 'System instructions here');

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-5.2-chat-latest',
        max_tokens: 512,
        messages: [
          { role: 'system', content: 'System instructions here' },
          { role: 'user', content: 'Test prompt' }
        ]
      });
    });

    it('extracts content from response', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Expected output' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      const result = await provider._callProvider('prompt', 256);

      expect(result).toBe('Expected output');
    });

    it('tracks token usage from response', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Response' } }],
              usage: { prompt_tokens: 150, completion_tokens: 200 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider._callProvider('prompt', 256);

      expect(provider.tokenUsage.inputTokens).toBe(150);
      expect(provider.tokenUsage.outputTokens).toBe(200);
      expect(provider.tokenUsage.totalCalls).toBe(1);
    });

    it('handles API errors gracefully', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Invalid API key'))
          }
        }
      };

      provider._client = mockClient;

      await expect(provider._callProvider('prompt', 256))
        .rejects.toThrow('Invalid API key');
    });

    it('preserves error status code from API', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const error = new Error('Rate limit exceeded');
      error.status = 429;

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(error)
          }
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

    it('handles authentication errors with 401 status', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const error = new Error('Incorrect API key provided');
      error.status = 401;

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(error)
          }
        }
      };

      provider._client = mockClient;

      try {
        await provider._callProvider('prompt', 256);
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.message).toContain('Incorrect API key');
        expect(err.status).toBe(401);
      }
    });
  });

  describe('generateJSON()', () => {
    it('uses native JSON mode for GPT-4+ models', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '{"result": "success"}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider.generateJSON('Test prompt');

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.response_format).toEqual({ type: 'json_object' });
    });

    it('includes system instructions for JSON generation', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '{"result": "success"}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider.generateJSON('Test prompt');

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[0].content).toContain('valid JSON');
    });

    it('parses JSON response correctly', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '{"status": "ok", "count": 42}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      const result = await provider.generateJSON('Test prompt');

      expect(result).toEqual({ status: 'ok', count: 42 });
    });

    it('strips markdown code fences from response', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '```json\n{"result": "fenced"}\n```' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      const result = await provider.generateJSON('Test prompt');

      expect(result).toEqual({ result: 'fenced' });
    });

    it('throws helpful error for invalid JSON', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Not valid JSON at all' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await expect(provider.generateJSON('Test prompt'))
        .rejects.toThrow('Failed to parse JSON response');
    });

    it('includes agent instructions when provided', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '{"result": "ok"}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider.generateJSON('Test prompt', 'Agent instructions here');

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.messages[1].content).toContain('Agent instructions here');
      expect(callArgs.messages[1].content).toContain('Test prompt');
    });
  });

  describe('generateText()', () => {
    it('generates plain text response', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Plain text response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      const result = await provider.generateText('Test prompt');

      expect(result).toBe('Plain text response');
    });

    it('includes agent instructions when provided', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider.generateText('Test prompt', 'Agent instructions');

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('Agent instructions');
      expect(callArgs.messages[0].content).toContain('Test prompt');
    });

    it('tracks token usage correctly', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Response' } }],
              usage: { prompt_tokens: 100, completion_tokens: 50 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider.generateText('Test prompt');

      expect(provider.tokenUsage.inputTokens).toBe(100);
      expect(provider.tokenUsage.outputTokens).toBe(50);
    });
  });

  describe('generate() integration', () => {
    it('automatically creates client on first call', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      // Mock the API response
      vi.mock('openai', () => ({
        default: class {
          chat = {
            completions: {
              create: vi.fn().mockResolvedValue({
                choices: [{ message: { content: 'Generated response' } }],
                usage: { prompt_tokens: 10, completion_tokens: 20 }
              })
            }
          }
        }
      }));

      expect(provider._client).toBeNull();

      const result = await provider.generate('Test prompt');

      expect(provider._client).not.toBeNull();
      expect(result).toBeDefined();
    });

    it('reuses client on subsequent calls', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider.generate('First call');
      await provider.generate('Second call');

      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('validateApiKey()', () => {
    it('returns valid true for working API key', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'ok' } }],
              usage: { prompt_tokens: 5, completion_tokens: 1 }
            })
          }
        }
      };

      provider._client = mockClient;

      const result = await provider.validateApiKey();

      expect(result.valid).toBe(true);
    });

    it('returns valid false for auth errors', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const error = new Error('Incorrect API key provided');
      error.status = 401;

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(error)
          }
        }
      };

      provider._client = mockClient;

      const result = await provider.validateApiKey();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Incorrect API key');
      expect(result.code).toBe(401);
    });

    it('returns error code for rate limit errors', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const error = new Error('Rate limit exceeded');
      error.status = 429;

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(error)
          }
        }
      };

      provider._client = mockClient;

      const result = await provider.validateApiKey();

      expect(result.valid).toBe(false);
      expect(result.code).toBe(429);
    });

    it('handles network errors', async () => {
      const provider = new OpenAIProvider('gpt-5.2-chat-latest');

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Network error'))
          }
        }
      };

      provider._client = mockClient;

      const result = await provider.validateApiKey();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });
});
