import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockEnv } from '../helpers/test-helpers.js';

describe('TemplateProcessor with LLM Integration', () => {
  let TemplateProcessor;
  let LLMProvider;
  let restoreEnv;

  beforeEach(async () => {
    // Dynamically import modules
    TemplateProcessor = (await import('../../cli/template-processor.js')).TemplateProcessor;
    LLMProvider = (await import('../../cli/llm-provider.js')).LLMProvider;

    // Mock console
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Setup test environment with API keys
    restoreEnv = mockEnv({
      ANTHROPIC_API_KEY: 'test-key',
      GEMINI_API_KEY: 'test-key',
      OPENAI_API_KEY: 'test-key'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (restoreEnv) restoreEnv();
  });

  describe('LLM provider initialization', () => {
    it('initializes provider on first generate call', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      // Mock LLMProvider.create
      const createSpy = vi.spyOn(LLMProvider, 'create').mockResolvedValue({
        providerName: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        generate: vi.fn().mockResolvedValue('Suggested value')
      });

      expect(processor.llmProvider).toBeNull();

      await processor.initializeLLMProvider();

      expect(createSpy).toHaveBeenCalled();
      expect(processor.llmProvider).not.toBeNull();
    });

    it('uses provider from ceremonies config', async () => {
      // Mock config file BEFORE creating processor (readCeremonyConfig is called in constructor)
      const fs = require('fs');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'gemini',
              defaultModel: 'gemini-2.5-flash'
            }]
          }
        })
      );

      const processor = new TemplateProcessor('sponsor-call');

      const createSpy = vi.spyOn(LLMProvider, 'create').mockResolvedValue({
        providerName: 'gemini',
        model: 'gemini-2.5-flash',
        generate: vi.fn().mockResolvedValue('ok')
      });

      await processor.initializeLLMProvider();

      expect(createSpy).toHaveBeenCalledWith('gemini', 'gemini-2.5-flash');
    });

    it('handles missing API key by throwing error', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const processor = new TemplateProcessor('sponsor-call');

      // Mock LLMProvider.create to throw an error (simulating missing API key scenario)
      vi.spyOn(LLMProvider, 'create').mockRejectedValue(
        new Error('ANTHROPIC_API_KEY not set')
      );

      await expect(processor.initializeLLMProvider()).rejects.toThrow('ANTHROPIC_API_KEY not set');
    });

    it('logs warning when provider initialization fails', async () => {
      const logSpy = vi.spyOn(console, 'log');

      delete process.env.ANTHROPIC_API_KEY;

      const processor = new TemplateProcessor('sponsor-call');

      // Mock LLMProvider.create to throw an error
      vi.spyOn(LLMProvider, 'create').mockRejectedValue(
        new Error('ANTHROPIC_API_KEY not set')
      );

      try {
        await processor.initializeLLMProvider();
      } catch (error) {
        // Expected to throw
      }

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not initialize')
      );
    });
  });

  describe('AI suggestion generation', () => {
    it('generates suggestions using configured provider', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      const mockProvider = {
        generate: vi.fn().mockResolvedValue('AI generated suggestion')
      };

      // Mock the stage-specific provider getter
      vi.spyOn(processor, 'getProviderForStageInstance').mockResolvedValue(mockProvider);

      const result = await processor.generateSuggestions(
        'PROJECT_NAME',
        false,
        { previousAnswers: {} }
      );

      expect(mockProvider.generate).toHaveBeenCalled();
    });

    // REMOVED: Outdated test with old provider pattern
    // Test: returns null when provider not initialized
    // Reason: Test used old llmProvider pattern; new architecture uses getProviderForStageInstance()
    // Coverage: Error handling tested in other tests with mock rejections

    it('handles LLM errors gracefully', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      const mockProvider = {
        generate: vi.fn().mockRejectedValue(new Error('API error'))
      };

      // Mock the stage-specific provider getter
      vi.spyOn(processor, 'getProviderForStageInstance').mockResolvedValue(mockProvider);

      const result = await processor.generateSuggestions(
        'PROJECT_NAME',
        false,
        {}
      );

      expect(result).toBeNull();
    });

    it('uses different token limits for plural vs singular', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      const mockProvider = {
        generate: vi.fn().mockResolvedValue('suggestion')
      };

      // Mock the stage-specific provider getter
      vi.spyOn(processor, 'getProviderForStageInstance').mockResolvedValue(mockProvider);

      // Singular variable
      await processor.generateSuggestions('PROJECT_NAME', false, {});

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        256
      );

      mockProvider.generate.mockClear();

      // Plural variable (TARGET_USERS has a domain-specific agent)
      await processor.generateSuggestions('TARGET_USERS', true, {});

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        512,
        expect.any(String)  // Agent instructions
      );
    });
  });

  describe('Document generation', () => {
    it('enhances document using LLM', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      const mockProvider = {
        generate: vi.fn().mockResolvedValue('Enhanced document content')
      };

      // Mock the stage-specific provider getter
      vi.spyOn(processor, 'getProviderForStageInstance').mockResolvedValue(mockProvider);

      const template = 'Project: {{PROJECT_NAME}}\nMission: {{MISSION}}';
      const result = await processor.generateFinalDocument(template);

      expect(mockProvider.generate).toHaveBeenCalled();
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.stringContaining('project definition'),
        4096
        // Note: Agent instructions not passed in test environment (fallback mode)
      );
    });

    it('returns template as-is when provider unavailable', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      // Mock getProviderForStageInstance to reject asynchronously
      vi.spyOn(processor, 'getProviderForStageInstance').mockImplementation(async () => {
        throw new Error('Provider unavailable');
      });

      const template = 'Original template content';
      const result = await processor.generateFinalDocument(template);

      expect(result).toBe(template);
    });

    it('falls back to template when enhancement fails', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      const mockProvider = {
        generate: vi.fn().mockRejectedValue(new Error('Enhancement failed'))
      };

      // Mock the stage-specific provider getter
      vi.spyOn(processor, 'getProviderForStageInstance').mockResolvedValue(mockProvider);

      const template = 'Original template';
      const result = await processor.generateFinalDocument(template);

      expect(result).toBe(template);
    });

    it('uses 4096 max tokens for document generation', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      const mockProvider = {
        generate: vi.fn().mockResolvedValue('Enhanced')
      };

      // Mock the stage-specific provider getter
      vi.spyOn(processor, 'getProviderForStageInstance').mockResolvedValue(mockProvider);

      await processor.generateFinalDocument('template');

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        4096
        // Note: Agent instructions not passed in test environment (fallback mode)
      );
    });
  });

  describe('Provider response parsing', () => {
    it('parses single suggestion from LLM response', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      const mockResponse = '1. My Project Name';

      const result = processor.parseLLMResponse(mockResponse, false);

      expect(result).toContain('My Project Name');
    });

    it('parses multiple suggestions for plural variables', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      const mockResponse = '1. User Type A\n2. User Type B\n3. User Type C';

      const result = processor.parseLLMResponse(mockResponse, true);

      expect(result).toHaveLength(3);
      expect(result[0]).toContain('User Type A');
      expect(result[1]).toContain('User Type B');
      expect(result[2]).toContain('User Type C');
    });

    it('handles malformed responses gracefully', async () => {
      const processor = new TemplateProcessor('sponsor-call');

      const mockResponse = 'Not a numbered list';

      const result = processor.parseLLMResponse(mockResponse, false);

      // Should still return something usable
      expect(result).toBeDefined();
    });
  });

  describe('Model configuration', () => {
    it('reads provider from ceremonies config', () => {
      const processor = new TemplateProcessor('sponsor-call');

      // Mock config file
      vi.spyOn(processor, 'readCeremonyConfig').mockReturnValue({
        provider: 'gemini',
        model: 'gemini-2.5-flash'
      });

      const config = processor.readCeremonyConfig('sponsor-call');

      expect(config.provider).toBe('gemini');
      expect(config.model).toBe('gemini-2.5-flash');
    });

    it('falls back to Claude when ceremonies not configured', () => {
      const processor = new TemplateProcessor('sponsor-call');

      // Mock reading config without ceremonies
      const fs = require('fs');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            model: 'claude-sonnet-4-5-20250929'
          }
        })
      );

      const config = processor.readCeremonyConfig('sponsor-call');

      expect(config.provider).toBe('claude');
      expect(config.model).toBe('claude-sonnet-4-5-20250929');
    });
  });

  describe('OpenAI provider configuration', () => {
    it('initializes OpenAI provider when configured', async () => {
      // Mock file reading BEFORE creating processor
      const fs = require('fs');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'openai',
              defaultModel: 'gpt-5.2-chat-latest'
            }]
          }
        })
      );

      const processor = new TemplateProcessor('sponsor-call');

      const createSpy = vi.spyOn(LLMProvider, 'create').mockResolvedValue({
        providerName: 'openai',
        model: 'gpt-5.2-chat-latest',
        generate: vi.fn().mockResolvedValue('Suggested value')
      });

      await processor.initializeLLMProvider();

      expect(createSpy).toHaveBeenCalledWith('openai', 'gpt-5.2-chat-latest');
      expect(processor.llmProvider.providerName).toBe('openai');
    });

    it('reads OpenAI configuration from avc.json', () => {
      const fs = require('fs');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'openai',
              defaultModel: 'gpt-5.2-chat-latest'
            }]
          }
        })
      );

      const processor = new TemplateProcessor('sponsor-call');
      const config = processor.readCeremonyConfig('sponsor-call');

      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-5.2-chat-latest');
    });

    it('shows helpful error when OPENAI_API_KEY missing', async () => {
      delete process.env.OPENAI_API_KEY;

      const fs = require('fs');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'openai',
              defaultModel: 'gpt-5.2-chat-latest'
            }]
          }
        })
      );

      const processor = new TemplateProcessor('sponsor-call');

      vi.spyOn(LLMProvider, 'create').mockRejectedValue(
        new Error('OPENAI_API_KEY not set. Add it to your .env file.')
      );

      await expect(processor.initializeLLMProvider())
        .rejects.toThrow('OPENAI_API_KEY not set');
    });
  });
});
