import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMProvider } from '../../cli/llm-provider.js';

// Mock provider for testing retry logic
class MockProvider extends LLMProvider {
  constructor(retryConfig) {
    super('mock', 'mock-model', retryConfig);
  }

  _createClient() {
    return { mock: true };
  }

  async _callProvider(prompt, maxTokens, systemInstructions) {
    return 'mock response';
  }
}

describe('LLMProvider Retry Strategy', () => {
  describe('_isRetryableError()', () => {
    let provider;

    beforeEach(() => {
      provider = new MockProvider();
    });

    describe('OpenAI errors', () => {
      it('detects 429 rate limit error', () => {
        const error = { status: 429, message: 'Rate limit exceeded' };
        expect(provider._isRetryableError(error)).toBe(true);
      });

      it('detects 503 service overloaded error', () => {
        const error = { status: 503, message: 'Service temporarily unavailable' };
        expect(provider._isRetryableError(error)).toBe(true);
      });

      it('detects high demand message', () => {
        const error = {
          status: 429,
          message: 'This model is currently experiencing high demand. Please try again later.'
        };
        expect(provider._isRetryableError(error)).toBe(true);
      });
    });

    describe('Claude/Anthropic errors', () => {
      it('detects 429 rate_limit_error', () => {
        const error = {
          status: 429,
          type: 'rate_limit_error',
          message: 'Rate limit exceeded'
        };
        expect(provider._isRetryableError(error)).toBe(true);
      });

      it('detects 529 overloaded_error', () => {
        const error = {
          status: 529,
          type: 'overloaded_error',
          message: 'API is temporarily overloaded'
        };
        expect(provider._isRetryableError(error)).toBe(true);
      });

      it('detects error type in nested error object', () => {
        const error = {
          status: 429,
          error: { type: 'rate_limit_error' },
          message: 'Rate limit'
        };
        expect(provider._isRetryableError(error)).toBe(true);
      });
    });

    describe('Gemini/Google errors', () => {
      it('detects 429 RESOURCE_EXHAUSTED error', () => {
        const error = {
          code: 429,
          message: 'Resource exhausted: Quota exceeded'
        };
        expect(provider._isRetryableError(error)).toBe(true);
      });

      it('detects 503 UNAVAILABLE error', () => {
        const error = {
          code: 503,
          type: 'unavailable',
          message: 'The model is overloaded'
        };
        expect(provider._isRetryableError(error)).toBe(true);
      });

      it('detects resource exhausted message', () => {
        const error = {
          code: 429,
          message: 'resource has been exhausted (e.g. check quota)'
        };
        expect(provider._isRetryableError(error)).toBe(true);
      });
    });

    describe('non-retryable errors', () => {
      it('does not retry authentication errors', () => {
        const error = { status: 401, message: 'Invalid API key' };
        expect(provider._isRetryableError(error)).toBe(false);
      });

      it('does not retry invalid request errors', () => {
        const error = { status: 400, message: 'Invalid request' };
        expect(provider._isRetryableError(error)).toBe(false);
      });

      it('does not retry not found errors', () => {
        const error = { status: 404, message: 'Model not found' };
        expect(provider._isRetryableError(error)).toBe(false);
      });
    });
  });

  describe('_getRetryAfterDelay()', () => {
    let provider;

    beforeEach(() => {
      provider = new MockProvider();
    });

    it('extracts retry-after from headers', () => {
      const error = {
        headers: { 'retry-after': '5' },
        message: 'Rate limit'
      };
      expect(provider._getRetryAfterDelay(error)).toBe(5000); // 5 seconds in ms
    });

    it('extracts retry-after from nested error headers', () => {
      const error = {
        error: { headers: { 'retry-after': '10' } },
        message: 'Rate limit'
      };
      expect(provider._getRetryAfterDelay(error)).toBe(10000);
    });

    it('returns null when retry-after not present', () => {
      const error = { message: 'Rate limit' };
      expect(provider._getRetryAfterDelay(error)).toBeNull();
    });

    it('handles invalid retry-after values', () => {
      const error = {
        headers: { 'retry-after': 'invalid' },
        message: 'Rate limit'
      };
      expect(provider._getRetryAfterDelay(error)).toBeNull();
    });
  });

  describe('_withRetry()', () => {
    let provider;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('succeeds on first attempt', async () => {
      provider = new MockProvider();
      const fn = vi.fn().mockResolvedValue('success');

      const result = await provider._withRetry(fn, 'Test operation');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error and succeeds', async () => {
      provider = new MockProvider({ maxRetries: 3, initialDelay: 10 });
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 429, message: 'Rate limit' })
        .mockRejectedValueOnce({ status: 503, message: 'Overloaded' })
        .mockResolvedValue('success');

      const result = await provider._withRetry(fn, 'Test operation');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws immediately on non-retryable error', async () => {
      provider = new MockProvider();
      const fn = vi.fn().mockRejectedValue({ status: 401, message: 'Invalid API key' });

      await expect(provider._withRetry(fn, 'Test operation')).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throws after max retries exhausted', async () => {
      provider = new MockProvider({ maxRetries: 2, initialDelay: 10 });
      const error = { status: 429, message: 'Rate limit' };
      const fn = vi.fn().mockRejectedValue(error);

      await expect(provider._withRetry(fn, 'Test operation')).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('uses exponential backoff', async () => {
      provider = new MockProvider({ maxRetries: 3, initialDelay: 100, backoffMultiplier: 2 });
      const sleepSpy = vi.spyOn(provider, '_sleep');
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 429, message: 'Rate limit' })
        .mockRejectedValueOnce({ status: 429, message: 'Rate limit' })
        .mockResolvedValue('success');

      await provider._withRetry(fn, 'Test operation');

      expect(sleepSpy).toHaveBeenNthCalledWith(1, 100);  // First retry: 100ms
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 200);  // Second retry: 200ms
    });

    it('respects max delay cap', async () => {
      provider = new MockProvider({
        maxRetries: 5,
        initialDelay: 1000,
        maxDelay: 2000,
        backoffMultiplier: 3
      });
      const sleepSpy = vi.spyOn(provider, '_sleep');
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 429, message: 'Rate limit' })
        .mockRejectedValueOnce({ status: 429, message: 'Rate limit' })
        .mockRejectedValueOnce({ status: 429, message: 'Rate limit' })
        .mockResolvedValue('success');

      await provider._withRetry(fn, 'Test operation');

      expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);  // 1s
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);  // Capped at 2s (would be 3s)
      expect(sleepSpy).toHaveBeenNthCalledWith(3, 2000);  // Still capped at 2s
    });

    it('uses retry-after header when available', async () => {
      provider = new MockProvider({ maxRetries: 2, initialDelay: 100 });
      const sleepSpy = vi.spyOn(provider, '_sleep');
      const error = {
        status: 429,
        headers: { 'retry-after': '3' },
        message: 'Rate limit'
      };
      const fn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      await provider._withRetry(fn, 'Test operation');

      expect(sleepSpy).toHaveBeenCalledWith(3000); // Uses retry-after (3s)
    });

    it('logs retry attempts with helpful information', async () => {
      provider = new MockProvider({ maxRetries: 2, initialDelay: 100 });
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 429, message: 'High demand error' })
        .mockResolvedValue('success');

      await provider._withRetry(fn, 'API call');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⏳'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('attempt 1/3'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('High demand error'));
    });
  });

  describe('generate() with retry', () => {
    it('wraps API calls with retry logic', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      const provider = new MockProvider({ maxRetries: 2, initialDelay: 10 });
      const callProviderSpy = vi.spyOn(provider, '_callProvider')
        .mockRejectedValueOnce({ status: 503, message: 'Overloaded' })
        .mockResolvedValue('success');

      const result = await provider.generate('Test prompt');

      expect(result).toBe('success');
      expect(callProviderSpy).toHaveBeenCalledTimes(2);

      delete process.env.OPENAI_API_KEY;
    });
  });
});
