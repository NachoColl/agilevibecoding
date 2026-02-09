import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMProvider } from '../../cli/llm-provider.js';
import { mockClaudeProvider, mockGeminiProvider } from '../helpers/mock-providers.js';

describe('LLMProvider Factory', () => {
  describe('create()', () => {
    it('creates Claude provider for "claude" config', async () => {
      const provider = await LLMProvider.create('claude', 'claude-sonnet-4-5-20250929');

      expect(provider).toBeDefined();
      expect(provider.providerName).toBe('claude');
      expect(provider.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('creates Gemini provider for "gemini" config', async () => {
      const provider = await LLMProvider.create('gemini', 'gemini-2.5-flash');

      expect(provider).toBeDefined();
      expect(provider.providerName).toBe('gemini');
      expect(provider.model).toBe('gemini-2.5-flash');
    });

    it('creates OpenAI provider for "openai" config', async () => {
      const provider = await LLMProvider.create('openai', 'gpt-5.2-chat-latest');

      expect(provider).toBeDefined();
      expect(provider.providerName).toBe('openai');
      expect(provider.model).toBe('gpt-5.2-chat-latest');
    });

    it('throws error for unknown provider', async () => {
      await expect(LLMProvider.create('unknown-provider', 'model'))
        .rejects.toThrow('Unknown LLM provider: "unknown-provider"');
    });

    it('throws error for undefined provider', async () => {
      await expect(LLMProvider.create(undefined, 'some-model'))
        .rejects.toThrow();
    });

    it('throws error for null provider', async () => {
      await expect(LLMProvider.create(null, 'some-model'))
        .rejects.toThrow();
    });
  });

  describe('validate() static method', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'test-key';
    });

    afterEach(() => {
      vi.restoreAllMocks();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
    });

    it('returns valid: true when provider and key are correct', async () => {
      // Mock the generate method to succeed
      vi.spyOn(LLMProvider.prototype, 'generate').mockResolvedValue('ok');

      const result = await LLMProvider.validate('claude', 'claude-sonnet-4-5-20250929');

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns valid: false with error when API call fails', async () => {
      vi.spyOn(LLMProvider.prototype, 'generate').mockRejectedValue(
        new Error('Invalid API key')
      );

      const result = await LLMProvider.validate('claude', 'claude-sonnet-4-5-20250929');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('handles network errors gracefully', async () => {
      vi.spyOn(LLMProvider.prototype, 'generate').mockRejectedValue(
        new Error('Network timeout')
      );

      const result = await LLMProvider.validate('gemini', 'gemini-2.5-flash');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Network timeout');
    });

    it('handles provider creation errors', async () => {
      const result = await LLMProvider.validate('invalid-provider', 'model');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown LLM provider');
    });

    it('validates OpenAI provider successfully', async () => {
      vi.spyOn(LLMProvider.prototype, 'generate').mockResolvedValue('ok');

      const result = await LLMProvider.validate('openai', 'gpt-5.2-chat-latest');

      expect(result.valid).toBe(true);
    });

    it('handles OpenAI authentication errors', async () => {
      const error = new Error('Incorrect API key provided');
      error.status = 401;
      vi.spyOn(LLMProvider.prototype, 'generate').mockRejectedValue(error);

      const result = await LLMProvider.validate('openai', 'gpt-5.2-chat-latest');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Incorrect API key');
    });
  });

  describe('validateApiKey() instance method', () => {
    it('returns valid: true when API call succeeds', async () => {
      const mockProvider = mockClaudeProvider({ shouldSucceed: true });

      const result = await mockProvider.validateApiKey();

      expect(result.valid).toBe(true);
    });

    it('returns valid: false with error message when API call fails', async () => {
      const mockProvider = mockClaudeProvider({
        shouldSucceed: false,
        error: 'Authentication failed'
      });

      const result = await mockProvider.validateApiKey();

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Authentication failed');
    });

    it('includes error code when available', async () => {
      const provider = await LLMProvider.create('claude', 'claude-sonnet-4-5-20250929');

      vi.spyOn(provider, 'generate').mockRejectedValue({
        message: 'Rate limit exceeded',
        status: 429,
        code: 'rate_limit_error'
      });

      const result = await provider.validateApiKey();

      expect(result.valid).toBe(false);
      expect(result.code).toBe(429); // status takes precedence over code
    });
  });

  describe('generate() method', () => {
    beforeEach(() => {
      // Set up environment for these tests
      process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('lazily initializes client on first call', async () => {
      const provider = await LLMProvider.create('claude', 'claude-sonnet-4-5-20250929');

      // Spy on _createClient and _callProvider
      const createSpy = vi.spyOn(provider, '_createClient').mockReturnValue({
        messages: { create: vi.fn().mockResolvedValue({ content: [{ text: 'ok' }] }) }
      });
      const callSpy = vi.spyOn(provider, '_callProvider').mockResolvedValue('response');

      expect(provider._client).toBeNull();

      await provider.generate('test prompt');

      // Client should be initialized after first call
      expect(createSpy).toHaveBeenCalled();
      expect(provider._client).not.toBeNull();
    });

    it('reuses client on subsequent calls', async () => {
      const provider = await LLMProvider.create('claude', 'claude-sonnet-4-5-20250929');

      const createSpy = vi.spyOn(provider, '_createClient').mockReturnValue({
        messages: { create: vi.fn().mockResolvedValue({ content: [{ text: 'ok' }] }) }
      });
      vi.spyOn(provider, '_callProvider').mockResolvedValue('response');

      await provider.generate('prompt 1');
      await provider.generate('prompt 2');

      // Client should only be created once
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('respects maxTokens parameter', async () => {
      const provider = await LLMProvider.create('claude', 'claude-sonnet-4-5-20250929');
      const spy = vi.spyOn(provider, '_callProvider').mockResolvedValue('response');

      await provider.generate('test', 100);

      expect(spy).toHaveBeenCalledWith('test', 100, null);
    });

    it('uses default maxTokens when not provided', async () => {
      const provider = await LLMProvider.create('claude', 'claude-sonnet-4-5-20250929');
      const spy = vi.spyOn(provider, '_callProvider').mockResolvedValue('response');

      await provider.generate('test');

      expect(spy).toHaveBeenCalledWith('test', 256, null);
    });

    it('passes systemInstructions when provided', async () => {
      const provider = await LLMProvider.create('claude', 'claude-sonnet-4-5-20250929');
      const spy = vi.spyOn(provider, '_callProvider').mockResolvedValue('response');

      await provider.generate('test', 256, 'You are a helpful assistant');

      expect(spy).toHaveBeenCalledWith('test', 256, 'You are a helpful assistant');
    });
  });

  describe('Abstract methods', () => {
    it('throws error when _createClient not implemented', () => {
      const provider = new LLMProvider('test', 'test-model');

      expect(() => provider._createClient()).toThrow('must implement _createClient');
    });

    it('throws error when _callProvider not implemented', async () => {
      const provider = new LLMProvider('test', 'test-model');

      await expect(provider._callProvider()).rejects.toThrow('must implement _callProvider');
    });
  });
});
