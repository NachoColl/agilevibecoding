import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelConfigurator } from '../../cli/init-model-config.js';
import fs from 'fs';
import path from 'path';

describe('ModelConfigurator', () => {
  let testDir;
  let configurator;

  beforeEach(() => {
    // Clear environment variables to avoid pollution from other tests
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    testDir = path.join(process.cwd(), `test-model-config-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, '.avc'), { recursive: true });

    // Create test config with all necessary structure
    const config = {
      settings: {
        ceremonies: [
          {
            name: 'sponsor-call',
            provider: 'claude',
            defaultModel: 'claude-sonnet-4-5-20250929',
            validation: {
              enabled: true,
              provider: 'gemini',
              model: 'gemini-2.5-pro'
            },
            stages: {
              suggestions: {
                provider: 'claude',
                model: 'claude-sonnet-4-5-20250929'
              },
              documentation: {
                provider: 'claude',
                model: 'claude-sonnet-4-5-20250929'
              },
              context: {
                provider: 'claude',
                model: 'claude-sonnet-4-5-20250929'
              }
            }
          }
        ],
        models: {
          'claude-sonnet-4-5-20250929': {
            provider: 'claude',
            displayName: 'Claude Sonnet 4.5',
            pricing: { input: 3.00, output: 15.00 }
          },
          'claude-opus-4-5-20250929': {
            provider: 'claude',
            displayName: 'Claude Opus 4.5',
            pricing: { input: 15.00, output: 75.00 }
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
    };

    fs.writeFileSync(
      path.join(testDir, '.avc', 'avc.json'),
      JSON.stringify(config, null, 2)
    );

    // Create empty .env
    fs.writeFileSync(path.join(testDir, '.env'), '');

    configurator = new ModelConfigurator(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('detectAvailableProviders()', () => {
    it('should return empty array when no API keys are set', () => {
      const providers = configurator.detectAvailableProviders();
      expect(providers).toEqual([]);
    });

    it('should return claude when only ANTHROPIC_API_KEY set', () => {
      fs.writeFileSync(
        path.join(testDir, '.env'),
        'ANTHROPIC_API_KEY=test-key\n'
      );

      const providers = configurator.detectAvailableProviders();
      expect(providers).toEqual(['claude']);
    });

    it('should return claude and gemini when both keys set', () => {
      fs.writeFileSync(
        path.join(testDir, '.env'),
        'ANTHROPIC_API_KEY=key1\nGEMINI_API_KEY=key2\n'
      );

      const providers = configurator.detectAvailableProviders();
      expect(providers).toEqual(['claude', 'gemini']);
    });

    it('should return all providers when all keys set', () => {
      fs.writeFileSync(
        path.join(testDir, '.env'),
        'ANTHROPIC_API_KEY=key1\nGEMINI_API_KEY=key2\nOPENAI_API_KEY=key3\n'
      );

      const providers = configurator.detectAvailableProviders();
      expect(providers).toEqual(['claude', 'gemini', 'openai']);
    });
  });

  describe('readConfig()', () => {
    it('should read and parse avc.json', () => {
      const config = configurator.readConfig();

      expect(config).toBeDefined();
      expect(config.settings).toBeDefined();
      expect(config.settings.ceremonies).toBeInstanceOf(Array);
      expect(config.settings.models).toBeDefined();
    });

    it('should throw error if avc.json not found', () => {
      const invalidConfigurator = new ModelConfigurator('/nonexistent');

      expect(() => {
        invalidConfigurator.readConfig();
      }).toThrow('avc.json not found');
    });
  });

  describe('getCeremonies()', () => {
    it('should return ceremonies with correct structure', () => {
      configurator.readConfig();
      const ceremonies = configurator.getCeremonies();

      expect(ceremonies).toBeInstanceOf(Array);
      expect(ceremonies.length).toBeGreaterThan(0);

      const ceremony = ceremonies[0];
      expect(ceremony).toHaveProperty('name');
      expect(ceremony).toHaveProperty('mainProvider');
      expect(ceremony).toHaveProperty('mainModel');
      expect(ceremony).toHaveProperty('validationProvider');
      expect(ceremony).toHaveProperty('validationModel');
      expect(ceremony).toHaveProperty('stages');
    });

    it('should include main provider and model', () => {
      configurator.readConfig();
      const ceremonies = configurator.getCeremonies();
      const ceremony = ceremonies[0];

      expect(ceremony.mainProvider).toBe('claude');
      expect(ceremony.mainModel).toBe('claude-sonnet-4-5-20250929');
    });

    it('should include validation provider and model', () => {
      configurator.readConfig();
      const ceremonies = configurator.getCeremonies();
      const ceremony = ceremonies[0];

      expect(ceremony.validationProvider).toBe('gemini');
      expect(ceremony.validationModel).toBe('gemini-2.5-pro');
    });

    it('should include stage-specific configs', () => {
      configurator.readConfig();
      const ceremonies = configurator.getCeremonies();
      const ceremony = ceremonies[0];

      expect(ceremony.stages).toBeDefined();
      expect(ceremony.stages.suggestions).toBeDefined();
      expect(ceremony.stages.documentation).toBeDefined();
      expect(ceremony.stages.context).toBeDefined();
    });
  });

  describe('getStagesForCeremony()', () => {
    beforeEach(() => {
      configurator.readConfig();
    });

    it('should return main generation stage with descriptive name', () => {
      const stages = configurator.getStagesForCeremony('sponsor-call');
      const mainStage = stages.find(s => s.id === 'main');

      expect(mainStage).toBeDefined();
      expect(mainStage.name).toBe('Project Definition & Planning');
      expect(mainStage.provider).toBe('claude');
      expect(mainStage.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should return validation stage with descriptive name', () => {
      const stages = configurator.getStagesForCeremony('sponsor-call');
      const validationStage = stages.find(s => s.id === 'validation');

      expect(validationStage).toBeDefined();
      expect(validationStage.name).toBe('Quality Validation & Verification');
      expect(validationStage.provider).toBe('gemini');
      expect(validationStage.model).toBe('gemini-2.5-pro');
    });

    it('should return stage-specific overrides with descriptive names', () => {
      const stages = configurator.getStagesForCeremony('sponsor-call');
      const suggestionsStage = stages.find(s => s.id === 'stage-suggestions');
      const documentationStage = stages.find(s => s.id === 'stage-documentation');
      const contextStage = stages.find(s => s.id === 'stage-context');

      expect(suggestionsStage).toBeDefined();
      expect(suggestionsStage.name).toBe('Questionnaire Suggestions - AI analyzes project name and suggests answers');

      expect(documentationStage).toBeDefined();
      expect(documentationStage.name).toBe('Documentation Generation - AI creates initial project documentation');

      expect(contextStage).toBeDefined();
      expect(contextStage.name).toBe('Context File Creation - AI generates initial project context.md');
    });

    it('should return empty array for unknown ceremony', () => {
      const stages = configurator.getStagesForCeremony('nonexistent');
      expect(stages).toEqual([]);
    });

    it('should provide ceremony-specific main stage names', () => {
      const sponsorStages = configurator.getStagesForCeremony('sponsor-call');
      const sponsorMain = sponsorStages.find(s => s.id === 'main');
      expect(sponsorMain.name).toBe('Project Definition & Planning');
    });
  });

  describe('getAvailableModels()', () => {
    beforeEach(() => {
      configurator.readConfig();
      configurator.availableProviders = ['claude']; // Only Claude API key available
    });

    it('should return all models from settings', () => {
      const models = configurator.getAvailableModels();

      expect(models.length).toBe(4);
      expect(models.map(m => m.id)).toContain('claude-sonnet-4-5-20250929');
      expect(models.map(m => m.id)).toContain('claude-opus-4-5-20250929');
      expect(models.map(m => m.id)).toContain('gemini-2.5-pro');
      expect(models.map(m => m.id)).toContain('gpt-5.2-chat-latest');
    });

    it('should include hasApiKey indicator for each model', () => {
      const models = configurator.getAvailableModels();

      // Claude models should have hasApiKey = true
      const claudeSonnet = models.find(m => m.id === 'claude-sonnet-4-5-20250929');
      expect(claudeSonnet.hasApiKey).toBe(true);

      // Gemini model should have hasApiKey = false
      const gemini = models.find(m => m.id === 'gemini-2.5-pro');
      expect(gemini.hasApiKey).toBe(false);

      // OpenAI model should have hasApiKey = false
      const openai = models.find(m => m.id === 'gpt-5.2-chat-latest');
      expect(openai.hasApiKey).toBe(false);
    });

    it('should filter by provider when specified', () => {
      const claudeModels = configurator.getAvailableModels('claude');

      expect(claudeModels.length).toBe(2);
      expect(claudeModels.every(m => m.provider === 'claude')).toBe(true);
    });

    it('should sort by provider then by price', () => {
      const models = configurator.getAvailableModels();

      // Claude models should come first (alphabetically)
      expect(models[0].provider).toBe('claude');
      expect(models[1].provider).toBe('claude');

      // Within Claude models, Opus (higher price) should come before Sonnet
      expect(models[0].pricing.input).toBeGreaterThan(models[1].pricing.input);
    });

    it('should include all model properties', () => {
      const models = configurator.getAvailableModels();
      const model = models[0];

      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('displayName');
      expect(model).toHaveProperty('provider');
      expect(model).toHaveProperty('pricing');
      expect(model).toHaveProperty('hasApiKey');
      expect(model.pricing).toHaveProperty('input');
      expect(model.pricing).toHaveProperty('output');
    });
  });

  describe('updateStage()', () => {
    beforeEach(() => {
      configurator.readConfig();
    });

    it('should update main generation config', () => {
      configurator.updateStage('sponsor-call', 'main', 'claude-opus-4-5-20250929');

      const ceremony = configurator.config.settings.ceremonies[0];
      expect(ceremony.provider).toBe('claude');
      expect(ceremony.defaultModel).toBe('claude-opus-4-5-20250929');
    });

    it('should update validation config', () => {
      configurator.updateStage('sponsor-call', 'validation', 'claude-sonnet-4-5-20250929');

      const ceremony = configurator.config.settings.ceremonies[0];
      expect(ceremony.validation.provider).toBe('claude');
      expect(ceremony.validation.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should update stage-specific config', () => {
      configurator.updateStage('sponsor-call', 'stage-suggestions', 'gemini-2.5-pro');

      const ceremony = configurator.config.settings.ceremonies[0];
      expect(ceremony.stages.suggestions.provider).toBe('gemini');
      expect(ceremony.stages.suggestions.model).toBe('gemini-2.5-pro');
    });

    it('should throw error for unknown ceremony', () => {
      expect(() => {
        configurator.updateStage('nonexistent', 'main', 'claude-sonnet-4-5-20250929');
      }).toThrow('Ceremony nonexistent not found');
    });

    it('should throw error for unknown model', () => {
      expect(() => {
        configurator.updateStage('sponsor-call', 'main', 'nonexistent-model');
      }).toThrow('Model nonexistent-model not found');
    });

    it('should create validation object if it does not exist', () => {
      // Remove validation from config
      delete configurator.config.settings.ceremonies[0].validation;

      configurator.updateStage('sponsor-call', 'validation', 'claude-sonnet-4-5-20250929');

      const ceremony = configurator.config.settings.ceremonies[0];
      expect(ceremony.validation).toBeDefined();
      expect(ceremony.validation.enabled).toBe(true);
      expect(ceremony.validation.provider).toBe('claude');
      expect(ceremony.validation.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should create stages object if it does not exist', () => {
      // Remove stages from config
      delete configurator.config.settings.ceremonies[0].stages;

      configurator.updateStage('sponsor-call', 'stage-newstage', 'claude-sonnet-4-5-20250929');

      const ceremony = configurator.config.settings.ceremonies[0];
      expect(ceremony.stages).toBeDefined();
      expect(ceremony.stages.newstage).toBeDefined();
      expect(ceremony.stages.newstage.provider).toBe('claude');
      expect(ceremony.stages.newstage.model).toBe('claude-sonnet-4-5-20250929');
    });
  });

  describe('validateConfig()', () => {
    beforeEach(() => {
      configurator.readConfig();
    });

    it('should return empty array when all providers have keys', () => {
      configurator.availableProviders = ['claude', 'gemini'];

      const issues = configurator.validateConfig();
      expect(issues).toEqual([]);
    });

    it('should return issues when provider missing API key', () => {
      configurator.availableProviders = ['claude']; // Only claude available

      const issues = configurator.validateConfig();
      expect(issues.length).toBe(1);
      expect(issues[0]).toEqual({
        ceremony: 'sponsor-call',
        stage: 'validation',
        provider: 'gemini'
      });
    });

    it('should check main provider', () => {
      configurator.availableProviders = ['gemini']; // Claude missing

      const issues = configurator.validateConfig();
      const mainIssue = issues.find(i => i.stage === 'main');

      expect(mainIssue).toBeDefined();
      expect(mainIssue.provider).toBe('claude');
    });

    it('should check validation provider', () => {
      configurator.availableProviders = ['claude']; // Gemini missing

      const issues = configurator.validateConfig();
      const validationIssue = issues.find(i => i.stage === 'validation');

      expect(validationIssue).toBeDefined();
      expect(validationIssue.provider).toBe('gemini');
    });

    it('should check stage-specific providers', () => {
      // Change one stage to use OpenAI
      configurator.config.settings.ceremonies[0].stages.suggestions.provider = 'openai';
      configurator.config.settings.ceremonies[0].stages.suggestions.model = 'gpt-5.2-chat-latest';
      configurator.availableProviders = ['claude', 'gemini']; // OpenAI missing

      const issues = configurator.validateConfig();
      const stageIssue = issues.find(i => i.stage === 'suggestions');

      expect(stageIssue).toBeDefined();
      expect(stageIssue.provider).toBe('openai');
    });

    it('should return all issues for multiple missing providers', () => {
      configurator.availableProviders = []; // No API keys

      const issues = configurator.validateConfig();
      expect(issues.length).toBeGreaterThan(1);
    });
  });

  describe('saveConfig()', () => {
    beforeEach(() => {
      configurator.readConfig();
    });

    it('should write updated config to avc.json', () => {
      configurator.updateStage('sponsor-call', 'main', 'claude-opus-4-5-20250929');
      configurator.saveConfig();

      const savedConfig = JSON.parse(
        fs.readFileSync(path.join(testDir, '.avc', 'avc.json'), 'utf8')
      );

      expect(savedConfig.settings.ceremonies[0].defaultModel).toBe('claude-opus-4-5-20250929');
    });

    it('should preserve JSON structure', () => {
      configurator.updateStage('sponsor-call', 'validation', 'claude-sonnet-4-5-20250929');
      configurator.saveConfig();

      const savedConfig = JSON.parse(
        fs.readFileSync(path.join(testDir, '.avc', 'avc.json'), 'utf8')
      );

      expect(savedConfig.settings).toBeDefined();
      expect(savedConfig.settings.ceremonies).toBeInstanceOf(Array);
      expect(savedConfig.settings.models).toBeDefined();
    });

    it('should create valid JSON', () => {
      configurator.updateStage('sponsor-call', 'main', 'claude-opus-4-5-20250929');
      configurator.saveConfig();

      const fileContent = fs.readFileSync(path.join(testDir, '.avc', 'avc.json'), 'utf8');

      expect(() => {
        JSON.parse(fileContent);
      }).not.toThrow();
    });

    it('should throw error if no configuration loaded', () => {
      const freshConfigurator = new ModelConfigurator(testDir);

      expect(() => {
        freshConfigurator.saveConfig();
      }).toThrow('No configuration loaded');
    });
  });
});
