import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mockEnv } from '../helpers/test-helpers.js';

describe('ProjectInitiator with Provider Integration', () => {
  let ProjectInitiator;
  let LLMProvider;
  let testProjectPath;
  let restoreEnv;

  beforeEach(async () => {
    // Import modules
    ProjectInitiator = (await import('../../cli/init.js')).ProjectInitiator;
    LLMProvider = (await import('../../cli/llm-provider.js')).LLMProvider;

    // Setup test project directory
    testProjectPath = path.join('/tmp', `avc-test-${Date.now()}`);

    // Mock console output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock environment with valid keys
    restoreEnv = mockEnv({
      ANTHROPIC_API_KEY: 'sk-ant-test-key-valid',
      GEMINI_API_KEY: 'test-gemini-key-valid'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (restoreEnv) restoreEnv();

    // Clean up test directory
    try {
      if (fs.existsSync(testProjectPath)) {
        fs.rmSync(testProjectPath, { recursive: true, force: true });
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('Full initialization with Claude provider', () => {
    it('validates API key before starting ceremony', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      // Mock successful API validation
      const validateSpy = vi.spyOn(LLMProvider, 'validate').mockResolvedValue({
        valid: true
      });

      // Mock file system operations to avoid actual file creation
      vi.spyOn(fs, 'existsSync').mockReturnValue(true); // Config file exists
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929'
            }]
          }
        })
      );

      const result = await initiator.validateProviderApiKey();

      expect(validateSpy).toHaveBeenCalledWith('claude', 'claude-sonnet-4-5-20250929');
      expect(result.valid).toBe(true);
    });

    it('rejects initialization when API key invalid', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      // Mock failed API validation
      vi.spyOn(LLMProvider, 'validate').mockResolvedValue({
        valid: false,
        error: 'Invalid API key'
      });

      // Mock config file reading
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929'
            }]
          }
        })
      );

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(false);
      expect(result.message).toContain('API call failed');
      expect(result.message).toContain('Invalid API key');
    });
  });

  describe('Provider switching', () => {
    it('validates Gemini API key when configured', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      // Mock Gemini config
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
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

      const validateSpy = vi.spyOn(LLMProvider, 'validate').mockResolvedValue({
        valid: true
      });

      const result = await initiator.validateProviderApiKey();

      expect(validateSpy).toHaveBeenCalledWith('gemini', 'gemini-2.5-flash');
      expect(result.valid).toBe(true);
    });

    it('shows correct error message for missing Gemini key', async () => {
      delete process.env.GEMINI_API_KEY;

      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
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

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(false);
      expect(result.message).toContain('GEMINI_API_KEY not found');
      expect(result.message).toContain('https://aistudio.google.com/app/apikey');
    });
  });

  describe('Error scenarios', () => {
    it('handles network timeout gracefully', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929'
            }]
          }
        })
      );

      vi.spyOn(LLMProvider, 'validate').mockRejectedValue(
        new Error('Network timeout')
      );

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(false);
    });

    it('handles rate limit errors with proper message', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929'
            }]
          }
        })
      );

      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;

      vi.spyOn(LLMProvider, 'validate').mockResolvedValue({
        valid: false,
        error: 'Rate limit exceeded',
        code: 429
      });

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(false);
      expect(result.message).toContain('API call failed');
    });

    it('handles missing config file gracefully', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // This should handle the missing file without crashing
      // Note: In real implementation, this might create default config
      const result = await initiator.validateProviderApiKey();

      // Expect it to handle missing config gracefully
      expect(result).toBeDefined();
    });
  });

  describe('API key validation flow', () => {
    it('makes minimal API call for validation', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929'
            }]
          }
        })
      );

      const validateSpy = vi.spyOn(LLMProvider, 'validate')
        .mockResolvedValue({ valid: true });

      await initiator.validateProviderApiKey();

      // Verify validation was called with correct provider and model
      expect(validateSpy).toHaveBeenCalledWith('claude', 'claude-sonnet-4-5-20250929');
    });

    it('logs validation progress', async () => {
      const logSpy = vi.spyOn(console, 'log');

      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929'
            }]
          }
        })
      );

      vi.spyOn(LLMProvider, 'validate').mockResolvedValue({ valid: true });

      await initiator.validateProviderApiKey();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Validating claude API key')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('API key validated successfully')
      );
    });
  });
});
