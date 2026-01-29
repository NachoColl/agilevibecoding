import { vi } from 'vitest';

/**
 * Mock Claude provider for testing
 */
export function mockClaudeProvider(options = {}) {
  const {
    shouldSucceed = true,
    response = 'ok',
    error = 'API error'
  } = options;

  return {
    providerName: 'claude',
    model: 'claude-sonnet-4-5-20250929',
    generate: vi.fn().mockImplementation(() =>
      shouldSucceed ? Promise.resolve(response) : Promise.reject(new Error(error))
    ),
    validateApiKey: vi.fn().mockResolvedValue({
      valid: shouldSucceed,
      error: shouldSucceed ? undefined : error
    }),
    _client: null,
    _createClient: vi.fn(),
    _callProvider: vi.fn().mockImplementation(() =>
      shouldSucceed ? Promise.resolve(response) : Promise.reject(new Error(error))
    )
  };
}

/**
 * Mock Gemini provider for testing
 */
export function mockGeminiProvider(options = {}) {
  const {
    shouldSucceed = true,
    response = 'ok',
    error = 'API error'
  } = options;

  return {
    providerName: 'gemini',
    model: 'gemini-2.5-flash',
    generate: vi.fn().mockImplementation(() =>
      shouldSucceed ? Promise.resolve(response) : Promise.reject(new Error(error))
    ),
    validateApiKey: vi.fn().mockResolvedValue({
      valid: shouldSucceed,
      error: shouldSucceed ? undefined : error
    }),
    _client: null,
    _createClient: vi.fn(),
    _callProvider: vi.fn().mockImplementation(() =>
      shouldSucceed ? Promise.resolve(response) : Promise.reject(new Error(error))
    )
  };
}

/**
 * Mock Anthropic SDK for integration tests
 */
export function mockAnthropicSDK(options = {}) {
  const { shouldSucceed = true, response = 'ok' } = options;

  return class MockAnthropic {
    constructor() {
      this.messages = {
        create: vi.fn().mockImplementation(() =>
          shouldSucceed
            ? Promise.resolve({ content: [{ text: response }] })
            : Promise.reject(new Error('Invalid API key'))
        )
      };
    }
  };
}

/**
 * Mock Google GenAI SDK for integration tests
 */
export function mockGoogleGenAI(options = {}) {
  const { shouldSucceed = true, response = 'ok' } = options;

  return class MockGoogleGenAI {
    constructor() {
      this.models = {
        generateContent: vi.fn().mockImplementation(() =>
          shouldSucceed
            ? Promise.resolve({ text: response })
            : Promise.reject(new Error('Invalid API key'))
        )
      };
    }
  };
}
