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

/**
 * Mock OpenAI provider for testing
 */
export function mockOpenAIProvider(options = {}) {
  const {
    shouldSucceed = true,
    response = 'ok',
    error = 'API error',
    usage = { prompt_tokens: 10, completion_tokens: 20 }
  } = options;

  return {
    providerName: 'openai',
    model: 'gpt-5.2-chat-latest',
    generate: vi.fn().mockImplementation(() =>
      shouldSucceed ? Promise.resolve(response) : Promise.reject(new Error(error))
    ),
    validateApiKey: vi.fn().mockResolvedValue({
      valid: shouldSucceed,
      error: shouldSucceed ? undefined : error
    }),
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalCalls: 0
    },
    _trackTokens: vi.fn(),
    _client: null,
    _createClient: vi.fn(),
    _callProvider: vi.fn().mockImplementation(() =>
      shouldSucceed ? Promise.resolve(response) : Promise.reject(new Error(error))
    )
  };
}

/**
 * Mock OpenAI SDK for integration tests
 */
export function mockOpenAISDK(options = {}) {
  const { shouldSucceed = true, response = 'ok' } = options;

  return class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: vi.fn().mockImplementation(() =>
            shouldSucceed
              ? Promise.resolve({
                  choices: [{ message: { content: response } }],
                  usage: { prompt_tokens: 10, completion_tokens: 20 }
                })
              : Promise.reject(new Error('Invalid API key'))
          )
        }
      };
    }
  };
}
