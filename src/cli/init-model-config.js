import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Handles interactive model configuration during project initialization.
 * Allows users to select which LLM models to use for ceremonies and stages.
 */
export class ModelConfigurator {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.avcConfigPath = path.join(projectRoot, '.avc', 'avc.json');
    this.envPath = path.join(projectRoot, '.env');
    this.availableProviders = [];
    this.config = null;
  }

  /**
   * Detect which API keys are available in .env file.
   * Returns array of provider names (informational - used for UI indicators).
   * @returns {string[]} Array of provider names: ['claude', 'gemini', 'openai']
   */
  detectAvailableProviders() {
    // Load .env file if it exists
    if (fs.existsSync(this.envPath)) {
      dotenv.config({ path: this.envPath });
    }

    const providers = [];

    // Check for each provider's API key
    if (process.env.ANTHROPIC_API_KEY) {
      providers.push('claude');
    }
    if (process.env.GEMINI_API_KEY) {
      providers.push('gemini');
    }
    if (process.env.OPENAI_API_KEY) {
      providers.push('openai');
    }

    return providers;
  }

  /**
   * Read current ceremony configuration from avc.json.
   * @returns {Object} Parsed configuration object
   */
  readConfig() {
    if (!fs.existsSync(this.avcConfigPath)) {
      throw new Error('avc.json not found. Run /init first.');
    }

    const raw = fs.readFileSync(this.avcConfigPath, 'utf8');
    this.config = JSON.parse(raw);
    return this.config;
  }

  /**
   * Get all ceremonies with their stage configurations.
   * @returns {Array} Array of ceremony objects with provider/model info
   */
  getCeremonies() {
    if (!this.config) {
      this.readConfig();
    }

    return this.config.settings.ceremonies.map(ceremony => ({
      name: ceremony.name,
      mainProvider: ceremony.provider,
      mainModel: ceremony.defaultModel,
      validationProvider: ceremony.validation?.provider,
      validationModel: ceremony.validation?.model,
      stages: ceremony.stages || {}
    }));
  }

  /**
   * Get descriptive name for a stage based on its type and ceremony context.
   * @param {string} stageName - The stage identifier (e.g., 'suggestions', 'documentation')
   * @param {string} ceremonyName - The ceremony name for context
   * @returns {string} Descriptive stage name
   */
  _getStageDisplayName(stageName, ceremonyName) {
    // Stage name mappings with descriptive action-oriented titles
    const stageDescriptions = {
      suggestions: 'AI-Assisted Questionnaire',
      documentation: 'Project Documentation Creation',
      context: 'Project Context Generation',
      decomposition: 'Work Item Decomposition',
      'context-generation': 'Context Scope Definition',
      'documentation-update': 'Documentation Refinement',
      'context-refinement': 'Context Enhancement',
      enhancement: 'Content Enhancement'
    };

    return stageDescriptions[stageName] || `${stageName.charAt(0).toUpperCase()}${stageName.slice(1)}`;
  }

  /**
   * Get all stages for a specific ceremony.
   * @param {string} ceremonyName - Name of the ceremony
   * @returns {Array} Array of stage objects with id, name, provider, model
   */
  getStagesForCeremony(ceremonyName) {
    if (!this.config) {
      this.readConfig();
    }

    const ceremony = this.config.settings.ceremonies.find(c => c.name === ceremonyName);
    if (!ceremony) {
      return [];
    }

    // Determine main stage description based on ceremony type
    let mainStageName = 'Primary Execution';
    if (ceremonyName === 'sponsor-call') {
      mainStageName = 'Project Definition & Planning';
    } else if (ceremonyName === 'sprint-planning') {
      mainStageName = 'Epic & Story Expansion';
    } else if (ceremonyName === 'context-retrospective') {
      mainStageName = 'Context & Documentation Review';
    } else if (ceremonyName === 'seed') {
      mainStageName = 'Task & Subtask Planning';
    }

    const stages = [
      {
        id: 'main',
        name: mainStageName,
        provider: ceremony.provider,
        model: ceremony.defaultModel
      }
    ];

    // Add validation stage if configured
    if (ceremony.validation) {
      stages.push({
        id: 'validation',
        name: 'Quality Validation & Verification',
        provider: ceremony.validation.provider || ceremony.provider,
        model: ceremony.validation.model || ceremony.defaultModel
      });
    }

    // Add stage-specific overrides with descriptive names
    if (ceremony.stages) {
      Object.keys(ceremony.stages).forEach(stageName => {
        const stage = ceremony.stages[stageName];
        stages.push({
          id: `stage-${stageName}`,
          name: this._getStageDisplayName(stageName, ceremonyName),
          provider: stage.provider,
          model: stage.model
        });
      });
    }

    return stages;
  }

  /**
   * Get available models, optionally filtered by provider.
   * Shows ALL models from settings, regardless of API key availability.
   * @param {string|null} providerFilter - Optional provider to filter by
   * @returns {Array} Array of model objects with hasApiKey indicator
   */
  getAvailableModels(providerFilter = null) {
    if (!this.config) {
      this.readConfig();
    }

    const allModels = this.config.settings.models;
    const filtered = [];

    for (const [modelId, modelInfo] of Object.entries(allModels)) {
      // Filter by provider if specified
      if (providerFilter && modelInfo.provider !== providerFilter) {
        continue;
      }

      // Add indicator if API key is available (informational only)
      const hasApiKey = this.availableProviders.includes(modelInfo.provider);

      filtered.push({
        id: modelId,
        displayName: modelInfo.displayName,
        provider: modelInfo.provider,
        pricing: modelInfo.pricing,
        hasApiKey  // User can still select models without keys
      });
    }

    // Sort by provider, then by input price (high to low for quality indication)
    return filtered.sort((a, b) => {
      if (a.provider !== b.provider) {
        return a.provider.localeCompare(b.provider);
      }
      return b.pricing.input - a.pricing.input;
    });
  }

  /**
   * Update stage configuration with new model.
   * @param {string} ceremonyName - Name of the ceremony
   * @param {string} stageId - ID of the stage (main, validation, stage-*)
   * @param {string} newModel - New model ID to use
   */
  updateStage(ceremonyName, stageId, newModel) {
    if (!this.config) {
      this.readConfig();
    }

    const ceremony = this.config.settings.ceremonies.find(c => c.name === ceremonyName);
    if (!ceremony) {
      throw new Error(`Ceremony ${ceremonyName} not found`);
    }

    const modelInfo = this.config.settings.models[newModel];
    if (!modelInfo) {
      throw new Error(`Model ${newModel} not found`);
    }

    // Update the appropriate configuration section
    if (stageId === 'main') {
      ceremony.provider = modelInfo.provider;
      ceremony.defaultModel = newModel;
    } else if (stageId === 'validation') {
      if (!ceremony.validation) {
        ceremony.validation = { enabled: true };
      }
      ceremony.validation.provider = modelInfo.provider;
      ceremony.validation.model = newModel;
    } else if (stageId.startsWith('stage-')) {
      const stageName = stageId.replace('stage-', '');
      if (!ceremony.stages) {
        ceremony.stages = {};
      }
      if (!ceremony.stages[stageName]) {
        ceremony.stages[stageName] = {};
      }
      ceremony.stages[stageName].provider = modelInfo.provider;
      ceremony.stages[stageName].model = newModel;
    }
  }

  /**
   * Save updated configuration to avc.json.
   */
  saveConfig() {
    if (!this.config) {
      throw new Error('No configuration loaded');
    }

    fs.writeFileSync(
      this.avcConfigPath,
      JSON.stringify(this.config, null, 2),
      'utf8'
    );
  }

  /**
   * Check if configuration has providers without API keys.
   * Returns array of issues (informational warnings).
   * @returns {Array} Array of issue objects with ceremony, stage, provider
   */
  validateConfig() {
    if (!this.config) {
      this.readConfig();
    }

    const issues = [];
    const ceremonies = this.config.settings.ceremonies;

    ceremonies.forEach(ceremony => {
      // Check main provider
      if (!this.availableProviders.includes(ceremony.provider)) {
        issues.push({
          ceremony: ceremony.name,
          stage: 'main',
          provider: ceremony.provider
        });
      }

      // Check validation provider
      if (ceremony.validation && !this.availableProviders.includes(ceremony.validation.provider)) {
        issues.push({
          ceremony: ceremony.name,
          stage: 'validation',
          provider: ceremony.validation.provider
        });
      }

      // Check stage-specific providers
      if (ceremony.stages) {
        Object.keys(ceremony.stages).forEach(stageName => {
          const stage = ceremony.stages[stageName];
          if (stage.provider && !this.availableProviders.includes(stage.provider)) {
            issues.push({
              ceremony: ceremony.name,
              stage: stageName,
              provider: stage.provider
            });
          }
        });
      }
    });

    return issues;
  }
}
