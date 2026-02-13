/**
 * Tests for OpenAI provider GPT-5 parameter handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../cli/llm-openai.js';

describe('OpenAIProvider - GPT-5 Parameter Handling', () => {
  let provider;
  let mockClient;

  beforeEach(() => {
    // Set environment variable
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('max_completion_tokens vs max_tokens', () => {
    it('should use max_completion_tokens for GPT-5 models', async () => {
      provider = new OpenAIProvider('gpt-5.2-chat-latest');

      // Mock the client
      mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Test response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider._callChatCompletions('Test prompt', 1000, null);

      // Verify max_completion_tokens was used, not max_tokens
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_completion_tokens: 1000
        })
      );

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          max_tokens: expect.anything()
        })
      );
    });

    it('should use max_tokens for GPT-4 models', async () => {
      provider = new OpenAIProvider('gpt-4o');

      // Mock the client
      mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Test response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider._callChatCompletions('Test prompt', 1000, null);

      // Verify max_tokens was used, not max_completion_tokens
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 1000
        })
      );

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          max_completion_tokens: expect.anything()
        })
      );
    });

    it('should use max_tokens for GPT-3.5 models', async () => {
      provider = new OpenAIProvider('gpt-3.5-turbo');

      // Mock the client
      mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Test response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider._callChatCompletions('Test prompt', 1000, null);

      // Verify max_tokens was used
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 1000
        })
      );
    });

    it('should use max_completion_tokens for o1 models', async () => {
      provider = new OpenAIProvider('o1-preview');

      mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Test response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider._callChatCompletions('Test prompt', 1000, null);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_completion_tokens: 1000
        })
      );
    });

    it('should use max_completion_tokens for o3 models', async () => {
      provider = new OpenAIProvider('o3-mini');

      mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Test response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider._callChatCompletions('Test prompt', 1000, null);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_completion_tokens: 1000
        })
      );
    });
  });

  describe('generateText with GPT-5', () => {
    it('should use max_completion_tokens in generateText', async () => {
      provider = new OpenAIProvider('gpt-5.2-chat-latest');

      mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Test response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider.generateText('Test prompt');

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_completion_tokens: 8000
        })
      );
    });
  });

  describe('generateJSON with GPT-5', () => {
    it('should use max_completion_tokens in generateJSON', async () => {
      provider = new OpenAIProvider('gpt-5.2-chat-latest');

      mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '{"test": "value"}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            })
          }
        }
      };

      provider._client = mockClient;

      await provider.generateJSON('Test prompt');

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_completion_tokens: 8000
        })
      );
    });
  });
});
