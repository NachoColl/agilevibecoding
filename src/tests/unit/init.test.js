import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { createTestProject, mockEnv } from '../helpers/test-helpers.js';

// Note: Full file system mocking with memfs requires more complex setup
// These tests focus on logic that can be tested without full FS mocking

describe('ProjectInitiator', () => {
  let ProjectInitiator;
  let restoreEnv;

  beforeEach(async () => {
    // Dynamically import to avoid module caching issues
    const module = await import('../../cli/init.js');
    ProjectInitiator = module.ProjectInitiator;

    // Mock console to avoid test output noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Setup test environment
    restoreEnv = mockEnv({
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      GEMINI_API_KEY: 'test-gemini-key'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (restoreEnv) restoreEnv();
  });

  describe('constructor', () => {
    it('sets projectRoot to current directory when not provided', () => {
      const initiator = new ProjectInitiator();

      expect(initiator.projectRoot).toBe(process.cwd());
    });

    it('accepts custom project root path', () => {
      const customPath = '/tmp/custom-project';
      const initiator = new ProjectInitiator(customPath);

      expect(initiator.projectRoot).toBe(customPath);
    });

    it('sets avcDir to .avc folder', () => {
      const initiator = new ProjectInitiator('/tmp/project');

      expect(initiator.avcDir).toBe('/tmp/project/.avc');
    });

    it('sets avcConfigPath correctly', () => {
      const initiator = new ProjectInitiator('/tmp/project');

      expect(initiator.avcConfigPath).toBe('/tmp/project/.avc/avc.json');
    });

    it('sets progressPath correctly', () => {
      const initiator = new ProjectInitiator('/tmp/project');

      expect(initiator.progressPath).toBe('/tmp/project/.avc/init-progress.json');
    });
  });

  describe('getProjectName()', () => {
    it('extracts project name from path', () => {
      const initiator = new ProjectInitiator('/home/user/my-project');

      const name = initiator.getProjectName();

      expect(name).toBe('my-project');
    });

    it('handles paths with trailing slash', () => {
      const initiator = new ProjectInitiator('/home/user/project/');

      const name = initiator.getProjectName();

      expect(name).toBe('project');
    });

    it('handles single-level paths', () => {
      const initiator = new ProjectInitiator('/project');

      const name = initiator.getProjectName();

      expect(name).toBe('project');
    });
  });

  describe('validateProviderApiKey()', () => {
    let initiator;

    beforeEach(() => {
      initiator = new ProjectInitiator('/tmp/test-project');

      // Mock file system methods
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(createTestProject())
      );
    });

    it('returns valid: true when Claude API key present and working', async () => {
      // Mock LLMProvider.validate to succeed
      const { LLMProvider } = await import('../../cli/llm-provider.js');
      vi.spyOn(LLMProvider, 'validate').mockResolvedValue({ valid: true });

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(true);
      expect(LLMProvider.validate).toHaveBeenCalledWith('claude', 'claude-sonnet-4-5-20250929');
    });

    it('returns error when ANTHROPIC_API_KEY not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(false);
      expect(result.message).toContain('ANTHROPIC_API_KEY not found');
      expect(result.message).toContain('Steps to fix');
    });

    it('includes API key URL in error message', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await initiator.validateProviderApiKey();

      expect(result.message).toContain('https://console.anthropic.com/settings/keys');
    });

    it('returns error when Gemini provider configured but key missing', async () => {
      const geminiConfig = createTestProject();
      geminiConfig.settings.ceremonies[0].provider = 'gemini';

      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(geminiConfig));
      delete process.env.GEMINI_API_KEY;

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(false);
      expect(result.message).toContain('GEMINI_API_KEY not found');
      expect(result.message).toContain('https://aistudio.google.com/app/apikey');
    });

    it('returns error when API call fails', async () => {
      const { LLMProvider } = await import('../../cli/llm-provider.js');
      vi.spyOn(LLMProvider, 'validate').mockResolvedValue({
        valid: false,
        error: 'Invalid API key'
      });

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(false);
      expect(result.message).toContain('API call failed');
      expect(result.message).toContain('Invalid API key');
    });

    it('returns error when no ceremonies configured', async () => {
      const configWithoutCeremonies = createTestProject();
      delete configWithoutCeremonies.settings.ceremonies;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(configWithoutCeremonies));

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(false);
      expect(result.message).toContain('No ceremonies configured');
    });

    it('returns error for unknown provider', async () => {
      const invalidConfig = createTestProject();
      invalidConfig.settings.ceremonies[0].provider = 'openai';

      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(invalidConfig));

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Unknown provider');
      expect(result.message).toContain('Supported providers: claude, gemini');
    });

    it('logs validation message when checking API key', async () => {
      const logSpy = vi.spyOn(console, 'log');
      const { LLMProvider } = await import('../../cli/llm-provider.js');
      vi.spyOn(LLMProvider, 'validate').mockResolvedValue({ valid: true });

      await initiator.validateProviderApiKey();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Validating claude API key'));
    });

    it('logs success message when validation passes', async () => {
      const logSpy = vi.spyOn(console, 'log');
      const { LLMProvider } = await import('../../cli/llm-provider.js');
      vi.spyOn(LLMProvider, 'validate').mockResolvedValue({ valid: true });

      await initiator.validateProviderApiKey();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('API key validated successfully'));
    });
  });

  describe('hasAvcFolder()', () => {
    it('returns true when .avc folder exists', () => {
      const initiator = new ProjectInitiator('/tmp/test-project');

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path === '/tmp/test-project/.avc';
      });

      expect(initiator.hasAvcFolder()).toBe(true);
    });

    it('returns false when .avc folder does not exist', () => {
      const initiator = new ProjectInitiator('/tmp/test-project');

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(initiator.hasAvcFolder()).toBe(false);
    });
  });

  describe('hasAvcConfig()', () => {
    it('returns true when avc.json exists', () => {
      const initiator = new ProjectInitiator('/tmp/test-project');

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path === '/tmp/test-project/.avc/avc.json';
      });

      expect(initiator.hasAvcConfig()).toBe(true);
    });

    it('returns false when avc.json does not exist', () => {
      const initiator = new ProjectInitiator('/tmp/test-project');

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(initiator.hasAvcConfig()).toBe(false);
    });
  });

  describe('isAvcProject()', () => {
    it('returns true when both folder and config exist', () => {
      const initiator = new ProjectInitiator('/tmp/test-project');

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      expect(initiator.isAvcProject()).toBe(true);
    });

    it('returns false when folder missing', () => {
      const initiator = new ProjectInitiator('/tmp/test-project');

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path !== '/tmp/test-project/.avc';
      });

      expect(initiator.isAvcProject()).toBe(false);
    });

    it('returns false when config missing', () => {
      const initiator = new ProjectInitiator('/tmp/test-project');

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path !== '/tmp/test-project/.avc/avc.json';
      });

      expect(initiator.isAvcProject()).toBe(false);
    });
  });

  describe('Default config generation', () => {
    it('includes ceremonies array in default config', () => {
      const initiator = new ProjectInitiator('/tmp/test-project');

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      initiator.createAvcConfig();

      const configCall = writeSpy.mock.calls.find(call =>
        call[0].includes('avc.json')
      );

      expect(configCall).toBeDefined();

      const config = JSON.parse(configCall[1]);

      expect(config.settings.ceremonies).toBeDefined();
      expect(config.settings.ceremonies).toHaveLength(1);
      expect(config.settings.ceremonies[0].name).toBe('sponsor-call');
      expect(config.settings.ceremonies[0].provider).toBe('claude');
      expect(config.settings.ceremonies[0].defaultModel).toBe('claude-sonnet-4-5-20250929');
    });

    it('includes all required context scopes', () => {
      const initiator = new ProjectInitiator('/tmp/test-project');

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      initiator.createAvcConfig();

      const configCall = writeSpy.mock.calls.find(call =>
        call[0].includes('avc.json')
      );

      const config = JSON.parse(configCall[1]);

      expect(config.settings.contextScopes).toEqual(['epic', 'story', 'task', 'subtask']);
    });
  });
});
