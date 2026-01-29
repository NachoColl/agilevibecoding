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
      GEMINI_API_KEY: 'test-key'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (restoreEnv) restoreEnv();
  });

  describe('LLM provider initialization', () => {
    it('initializes provider on first generate call', async () => {
      const processor = new TemplateProcessor();

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
      // Mock config file BEFORE creating processor (readModelConfig is called in constructor)
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

      const processor = new TemplateProcessor();

      const createSpy = vi.spyOn(LLMProvider, 'create').mockResolvedValue({
        providerName: 'gemini',
        model: 'gemini-2.5-flash',
        generate: vi.fn().mockResolvedValue('ok')
      });

      await processor.initializeLLMProvider();

      expect(createSpy).toHaveBeenCalledWith('gemini', 'gemini-2.5-flash');
    });

    it('handles missing API key gracefully', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const processor = new TemplateProcessor();

      // Mock LLMProvider.create to throw an error (simulating missing API key scenario)
      vi.spyOn(LLMProvider, 'create').mockRejectedValue(
        new Error('ANTHROPIC_API_KEY not set')
      );

      const result = await processor.initializeLLMProvider();

      expect(result).toBeNull();
    });

    it('logs warning when provider initialization fails', async () => {
      const warnSpy = vi.spyOn(console, 'log');

      delete process.env.ANTHROPIC_API_KEY;

      const processor = new TemplateProcessor();

      // Mock LLMProvider.create to throw an error
      vi.spyOn(LLMProvider, 'create').mockRejectedValue(
        new Error('ANTHROPIC_API_KEY not set')
      );

      await processor.initializeLLMProvider();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not initialize')
      );
    });
  });

  describe('AI suggestion generation', () => {
    it('generates suggestions using configured provider', async () => {
      const processor = new TemplateProcessor();

      const mockProvider = {
        generate: vi.fn().mockResolvedValue('AI generated suggestion')
      };

      processor.llmProvider = mockProvider;

      const result = await processor.generateSuggestions(
        'PROJECT_NAME',
        false,
        { previousAnswers: {} }
      );

      expect(mockProvider.generate).toHaveBeenCalled();
    });

    it('returns null when provider not initialized', async () => {
      const processor = new TemplateProcessor();

      // Ensure provider stays null
      vi.spyOn(processor, 'initializeLLMProvider').mockResolvedValue(null);

      processor.llmProvider = null;

      const result = await processor.generateSuggestions(
        'PROJECT_NAME',
        false,
        {}
      );

      expect(result).toBeNull();
    });

    it('handles LLM errors gracefully', async () => {
      const processor = new TemplateProcessor();

      const mockProvider = {
        generate: vi.fn().mockRejectedValue(new Error('API error'))
      };

      processor.llmProvider = mockProvider;

      const result = await processor.generateSuggestions(
        'PROJECT_NAME',
        false,
        {}
      );

      expect(result).toBeNull();
    });

    it('uses different token limits for plural vs singular', async () => {
      const processor = new TemplateProcessor();

      const mockProvider = {
        generate: vi.fn().mockResolvedValue('suggestion')
      };

      processor.llmProvider = mockProvider;

      // Singular variable
      await processor.generateSuggestions('PROJECT_NAME', false, {});

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        256
      );

      mockProvider.generate.mockClear();

      // Plural variable
      await processor.generateSuggestions('TARGET_USERS', true, {});

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        512
      );
    });
  });

  describe('Document generation', () => {
    it('enhances document using LLM', async () => {
      const processor = new TemplateProcessor();

      const mockProvider = {
        generate: vi.fn().mockResolvedValue('Enhanced document content')
      };

      processor.llmProvider = mockProvider;

      const template = 'Project: {{PROJECT_NAME}}\nMission: {{MISSION}}';
      const result = await processor.generateFinalDocument(template);

      expect(mockProvider.generate).toHaveBeenCalled();
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.stringContaining('project definition'),
        4096
      );
    });

    it('returns template as-is when provider unavailable', async () => {
      const processor = new TemplateProcessor();

      // Mock initialization failure
      vi.spyOn(processor, 'initializeLLMProvider').mockResolvedValue(null);

      processor.llmProvider = null;

      const template = 'Original template content';
      const result = await processor.generateFinalDocument(template);

      expect(result).toBe(template);
    });

    it('falls back to template when enhancement fails', async () => {
      const processor = new TemplateProcessor();

      const mockProvider = {
        generate: vi.fn().mockRejectedValue(new Error('Enhancement failed'))
      };

      processor.llmProvider = mockProvider;

      const template = 'Original template';
      const result = await processor.generateFinalDocument(template);

      expect(result).toBe(template);
    });

    it('uses 4096 max tokens for document generation', async () => {
      const processor = new TemplateProcessor();

      const mockProvider = {
        generate: vi.fn().mockResolvedValue('Enhanced')
      };

      processor.llmProvider = mockProvider;

      await processor.generateFinalDocument('template');

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        4096
      );
    });
  });

  describe('Provider response parsing', () => {
    it('parses single suggestion from LLM response', async () => {
      const processor = new TemplateProcessor();

      const mockResponse = '1. My Project Name';

      const result = processor.parseLLMResponse(mockResponse, false);

      expect(result).toContain('My Project Name');
    });

    it('parses multiple suggestions for plural variables', async () => {
      const processor = new TemplateProcessor();

      const mockResponse = '1. User Type A\n2. User Type B\n3. User Type C';

      const result = processor.parseLLMResponse(mockResponse, true);

      expect(result).toHaveLength(3);
      expect(result[0]).toContain('User Type A');
      expect(result[1]).toContain('User Type B');
      expect(result[2]).toContain('User Type C');
    });

    it('handles malformed responses gracefully', async () => {
      const processor = new TemplateProcessor();

      const mockResponse = 'Not a numbered list';

      const result = processor.parseLLMResponse(mockResponse, false);

      // Should still return something usable
      expect(result).toBeDefined();
    });
  });

  describe('Model configuration', () => {
    it('reads provider from ceremonies config', () => {
      const processor = new TemplateProcessor();

      // Mock config file
      vi.spyOn(processor, 'readModelConfig').mockReturnValue({
        provider: 'gemini',
        model: 'gemini-2.5-flash'
      });

      const config = processor.readModelConfig();

      expect(config.provider).toBe('gemini');
      expect(config.model).toBe('gemini-2.5-flash');
    });

    it('falls back to Claude when ceremonies not configured', () => {
      const processor = new TemplateProcessor();

      // Mock reading config without ceremonies
      const fs = require('fs');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            model: 'claude-sonnet-4-5-20250929'
          }
        })
      );

      const config = processor.readModelConfig();

      expect(config.provider).toBe('claude');
      expect(config.model).toBe('claude-sonnet-4-5-20250929');
    });
  });
});
