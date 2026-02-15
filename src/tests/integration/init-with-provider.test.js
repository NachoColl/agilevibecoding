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

    it('returns valid result when API key validation succeeds', async () => {
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

      const result = await initiator.validateProviderApiKey();

      expect(result.valid).toBe(true);
    });
  });

  describe('Interactive model configuration', () => {
    it('should offer model configuration after init', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      // Mock file system to simulate project structure
      vi.spyOn(fs, 'existsSync').mockImplementation((filepath) => {
        // Return true for avc.json after init creates it
        if (filepath.toString().includes('avc.json')) return true;
        if (filepath.toString().includes('.env')) return true;
        return false; // Project not initialized initially
      });
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // Mock readFileSync for config file
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929',
              validation: {
                enabled: true,
                provider: 'gemini',
                model: 'gemini-2.5-pro'
              }
            }],
            models: {
              'claude-sonnet-4-5-20250929': {
                provider: 'claude',
                displayName: 'Claude Sonnet 4.5',
                pricing: { input: 3.00, output: 15.00 }
              },
              'gemini-2.5-pro': {
                provider: 'gemini',
                displayName: 'Gemini 2.5 Pro',
                pricing: { input: 1.25, output: 5.00 }
              }
            }
          }
        })
      );

      await initiator.init();

      // init() no longer returns configuration data
      // Test configureModelsInteractively() directly (used by /models command)
      const result = await initiator.configureModelsInteractively();

      expect(result).toBeDefined();
      expect(result.shouldConfigure).toBe(true);
      expect(result.configurator).toBeDefined();
    });

    it('should detect available providers from .env', async () => {
      // Clear environment variables so only .env file is checked
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockImplementation((filepath) => {
        if (filepath.toString().includes('avc.json')) return true;
        if (filepath.toString().includes('.env')) return true;
        return false;
      });
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // First call for init check, second for config read, third for .env check
      let callCount = 0;
      vi.spyOn(fs, 'readFileSync').mockImplementation((filepath) => {
        callCount++;
        if (filepath.toString().endsWith('.env')) {
          return 'ANTHROPIC_API_KEY=test-key\n';
        }
        return JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929',
              validation: {
                provider: 'gemini',
                model: 'gemini-2.5-pro'
              }
            }],
            models: {
              'claude-sonnet-4-5-20250929': {
                provider: 'claude',
                displayName: 'Claude Sonnet 4.5',
                pricing: { input: 3.00, output: 15.00 }
              },
              'gemini-2.5-pro': {
                provider: 'gemini',
                displayName: 'Gemini 2.5 Pro',
                pricing: { input: 1.25, output: 5.00 }
              }
            }
          }
        });
      });

      await initiator.init();

      // Test configureModelsInteractively() directly
      const result = await initiator.configureModelsInteractively();

      expect(result.configurator).toBeDefined();
      const providers = result.configurator.availableProviders;
      expect(providers).toContain('claude');
      expect(providers).not.toContain('gemini'); // No gemini key in .env
    });

    it('should show all models regardless of API key availability', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockImplementation((filepath) => {
        if (filepath.toString().includes('avc.json')) return true;
        if (filepath.toString().includes('.env')) return true;
        return false;
      });
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929'
            }],
            models: {
              'claude-sonnet-4-5-20250929': {
                provider: 'claude',
                displayName: 'Claude Sonnet 4.5',
                pricing: { input: 3.00, output: 15.00 }
              },
              'gemini-2.5-pro': {
                provider: 'gemini',
                displayName: 'Gemini 2.5 Pro',
                pricing: { input: 1.25, output: 5.00 }
              },
              'gpt-5.2-chat-latest': {
                provider: 'openai',
                displayName: 'OpenAI GPT-5.2',
                pricing: { input: 1.75, output: 14.00 }
              }
            }
          }
        })
      );

      await initiator.init();

      // Test configureModelsInteractively() directly
      const result = await initiator.configureModelsInteractively();
      const models = result.configurator.getAvailableModels();

      // All models should be returned
      expect(models.length).toBe(3);
      expect(models.map(m => m.id)).toContain('claude-sonnet-4-5-20250929');
      expect(models.map(m => m.id)).toContain('gemini-2.5-pro');
      expect(models.map(m => m.id)).toContain('gpt-5.2-chat-latest');
    });

    it('should update ceremony configuration correctly', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockImplementation((filepath) => {
        if (filepath.toString().includes('avc.json')) return true;
        if (filepath.toString().includes('.env')) return true;
        return false;
      });
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      let savedConfig = null;
      vi.spyOn(fs, 'writeFileSync').mockImplementation((filepath, content) => {
        if (filepath.toString().endsWith('avc.json')) {
          savedConfig = content;
        }
      });

      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929',
              validation: {
                enabled: true,
                provider: 'gemini',
                model: 'gemini-2.5-pro'
              }
            }],
            models: {
              'claude-sonnet-4-5-20250929': {
                provider: 'claude',
                displayName: 'Claude Sonnet 4.5',
                pricing: { input: 3.00, output: 15.00 }
              }
            }
          }
        })
      );

      await initiator.init();

      // Test configureModelsInteractively() directly
      const result = await initiator.configureModelsInteractively();

      // Change validation to use claude instead of gemini
      result.configurator.updateStage('sponsor-call', 'validation', 'claude-sonnet-4-5-20250929');
      result.configurator.saveConfig();

      expect(savedConfig).toBeTruthy();
      const config = JSON.parse(savedConfig);
      expect(config.settings.ceremonies[0].validation.provider).toBe('claude');
      expect(config.settings.ceremonies[0].validation.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should warn about missing API keys but allow configuration', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      // Only set ANTHROPIC_API_KEY
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      vi.spyOn(fs, 'existsSync').mockImplementation((filepath) => {
        if (filepath.toString().includes('avc.json')) return true;
        if (filepath.toString().includes('.env')) return true;
        return false;
      });
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [{
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929',
              validation: {
                provider: 'gemini',
                model: 'gemini-2.5-pro'
              }
            }],
            models: {
              'claude-sonnet-4-5-20250929': {
                provider: 'claude',
                displayName: 'Claude Sonnet 4.5',
                pricing: { input: 3.00, output: 15.00 }
              },
              'gemini-2.5-pro': {
                provider: 'gemini',
                displayName: 'Gemini 2.5 Pro',
                pricing: { input: 1.25, output: 5.00 }
              }
            }
          }
        })
      );

      await initiator.init();

      // Test configureModelsInteractively() directly
      const result = await initiator.configureModelsInteractively();
      const issues = result.configurator.validateConfig();

      // Should detect missing gemini key
      expect(issues.length).toBeGreaterThan(0);
      const validationIssue = issues.find(i => i.stage === 'validation');
      expect(validationIssue).toBeDefined();
      expect(validationIssue.provider).toBe('gemini');

      // But user should still be able to select gemini model
      const models = result.configurator.getAvailableModels();
      const geminiModel = models.find(m => m.provider === 'gemini');
      expect(geminiModel).toBeDefined();
      expect(geminiModel.hasApiKey).toBe(false); // Warning indicator
    });

    it('should handle multiple ceremonies', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      vi.spyOn(fs, 'existsSync').mockImplementation((filepath) => {
        if (filepath.toString().includes('avc.json')) return true;
        if (filepath.toString().includes('.env')) return true;
        return false;
      });
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          settings: {
            ceremonies: [
              {
                name: 'sponsor-call',
                provider: 'claude',
                defaultModel: 'claude-sonnet-4-5-20250929'
              },
              {
                name: 'sprint-planning',
                provider: 'gemini',
                defaultModel: 'gemini-2.5-pro'
              }
            ],
            models: {
              'claude-sonnet-4-5-20250929': {
                provider: 'claude',
                displayName: 'Claude Sonnet 4.5',
                pricing: { input: 3.00, output: 15.00 }
              },
              'gemini-2.5-pro': {
                provider: 'gemini',
                displayName: 'Gemini 2.5 Pro',
                pricing: { input: 1.25, output: 5.00 }
              }
            }
          }
        })
      );

      await initiator.init();

      // Test configureModelsInteractively() directly
      const result = await initiator.configureModelsInteractively();
      const ceremonies = result.configurator.getCeremonies();

      expect(ceremonies.length).toBe(2);
      expect(ceremonies[0].name).toBe('sponsor-call');
      expect(ceremonies[1].name).toBe('sprint-planning');
    });
  });
});
