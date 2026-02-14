import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getModelPricing, calculateCost, formatCost, getEstimatedTokens } from './model-pricing.js';

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

    return this.config.settings.ceremonies.map(ceremony => {
      // Build stages object with all available stages for this ceremony
      const stages = {};

      // Define available stages per ceremony (excluding 'main' and 'validation' which are handled separately)
      const ceremonyStages = {
        'sponsor-call': ['suggestions', 'architecture-recommendation', 'question-prefilling', 'documentation', 'context'],
        'sprint-planning': ['decomposition', 'context-generation', 'validation'],
        'seed': ['decomposition', 'validation', 'context-generation'],
        'context-retrospective': ['documentation-update', 'context-refinement']
      };

      const availableStages = ceremonyStages[ceremony.name] || [];

      // Build stages object with effective provider/model for each stage
      availableStages.forEach(stageName => {
        const stageConfig = ceremony.stages?.[stageName];

        if (stageConfig) {
          // Stage is explicitly configured
          stages[stageName] = {
            provider: stageConfig.provider,
            model: stageConfig.model
          };
        } else {
          // Stage not configured, use ceremony default
          stages[stageName] = {
            provider: ceremony.provider,
            model: ceremony.defaultModel
          };
        }
      });

      return {
        name: ceremony.name,
        mainProvider: ceremony.provider,
        mainModel: ceremony.defaultModel,
        validationProvider: ceremony.validation?.provider,
        validationModel: ceremony.validation?.model,
        stages
      };
    });
  }

  /**
   * Get descriptive name for a stage based on its type and ceremony context.
   * @param {string} stageName - The stage identifier (e.g., 'suggestions', 'documentation')
   * @param {string} ceremonyName - The ceremony name for context
   * @returns {string} Descriptive stage name
   */
  _getStageDisplayName(stageName, ceremonyName) {
    // Context-aware stage descriptions that explain what each stage does
    const ceremonyStageDescriptions = {
      'sponsor-call': {
        'suggestions': 'Questionnaire Suggestions - AI analyzes project name and suggests answers',
        'architecture-recommendation': 'Architecture Recommendation - AI suggests 3-5 deployment architectures based on project scope',
        'question-prefilling': 'Question Pre-filling - AI generates intelligent answers based on selected architecture',
        'documentation': 'Documentation Generation - AI creates initial project documentation',
        'context': 'Context File Creation - AI generates initial project context.md'
      },
      'sprint-planning': {
        'decomposition': 'Epic & Story Decomposition - AI breaks down project scope into epics and stories',
        'validation': 'Multi-Agent Validation - Domain experts validate each epic and story',
        'context-generation': 'Context File Generation - AI creates context.md for each epic and story'
      },
      'seed': {
        'decomposition': 'Task Decomposition - AI breaks down stories into tasks and subtasks',
        'validation': 'Task Validation - AI validates task hierarchy and completeness',
        'context-generation': 'Task Context Generation - AI creates context.md for each task'
      },
      'context-retrospective': {
        'documentation-update': 'Documentation Enhancement - AI refines and improves project documentation',
        'context-refinement': 'Context Enhancement - AI enriches context.md files with learned insights'
      }
    };

    // Try ceremony-specific description first, then fallback to generic
    const ceremonyDescriptions = ceremonyStageDescriptions[ceremonyName];
    if (ceremonyDescriptions && ceremonyDescriptions[stageName]) {
      return ceremonyDescriptions[stageName];
    }

    // Generic fallback descriptions
    const genericDescriptions = {
      suggestions: 'AI-Assisted Questionnaire',
      documentation: 'Project Documentation Creation',
      context: 'Project Context Generation',
      decomposition: 'Work Item Decomposition',
      'context-generation': 'Context Scope Definition',
      'documentation-update': 'Documentation Refinement',
      'context-refinement': 'Context Enhancement',
      enhancement: 'Content Enhancement'
    };

    return genericDescriptions[stageName] || `${stageName.charAt(0).toUpperCase()}${stageName.slice(1)}`;
  }

  /**
   * Get all stages for a specific ceremony.
   * @param {string} ceremonyName - Name of the ceremony
   * @returns {Array} Array of stage objects with id, name, provider, model, hasValidationTypes
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
        model: ceremony.defaultModel,
        hasValidationTypes: false
      }
    ];

    // Add validation stage if configured
    if (ceremony.validation) {
      stages.push({
        id: 'validation',
        name: 'Quality Validation & Verification',
        provider: ceremony.validation.provider || ceremony.provider,
        model: ceremony.validation.model || ceremony.defaultModel,
        hasValidationTypes: false
      });
    }

    // Define available stages per ceremony (same as getCeremonies)
    const ceremonyStages = {
      'sponsor-call': ['suggestions', 'documentation', 'context'],
      'sprint-planning': ['decomposition', 'context-generation', 'validation'],
      'seed': ['decomposition', 'validation', 'context-generation'],
      'context-retrospective': ['documentation-update', 'context-refinement']
    };

    const availableStages = ceremonyStages[ceremonyName] || [];

    // Add all available stages with effective provider/model
    availableStages.forEach(stageName => {
      const stageConfig = ceremony.stages?.[stageName];

      // Check if this is the validation stage for sprint-planning
      const hasValidationTypes = (ceremonyName === 'sprint-planning' && stageName === 'validation');

      stages.push({
        id: `stage-${stageName}`,
        name: this._getStageDisplayName(stageName, ceremonyName),
        provider: stageConfig?.provider || ceremony.provider,
        model: stageConfig?.model || ceremony.defaultModel,
        hasValidationTypes,
        stageName  // Store original stage name for validation type lookup
      });
    });

    return stages;
  }

  /**
   * Get validation types for sprint-planning validation stage
   * @returns {Array} Array of validation type objects
   */
  getValidationTypes() {
    return [
      {
        id: 'universal',
        name: 'Universal Validators',
        description: 'Always-applied (solution-architect, security, developer, qa, test-architect)'
      },
      {
        id: 'domain',
        name: 'Domain Validators',
        description: 'Domain-specific (devops, database, frontend, api, backend, cloud, mobile, ui, ux, data)'
      },
      {
        id: 'feature',
        name: 'Feature Validators',
        description: 'Inferred from acceptance criteria keywords'
      },
      {
        id: 'default',
        name: 'Default (All Validators)',
        description: 'Fallback configuration for all validation types'
      }
    ];
  }

  /**
   * Get current model configuration for a validation type
   * @param {string} ceremonyName - Ceremony name (should be 'sprint-planning')
   * @param {string} validationType - Validation type ID ('universal', 'domain', 'feature', 'default')
   * @returns {Object|null} { provider, model } or null if not configured
   */
  getValidationTypeConfig(ceremonyName, validationType) {
    if (!this.config) {
      this.readConfig();
    }

    const ceremony = this.config.settings.ceremonies.find(c => c.name === ceremonyName);
    if (!ceremony || !ceremony.stages || !ceremony.stages.validation) {
      return null;
    }

    const validationStage = ceremony.stages.validation;
    const validationTypeConfig = validationStage.validationTypes?.[validationType];

    if (validationTypeConfig) {
      return {
        provider: validationTypeConfig.provider,
        model: validationTypeConfig.model
      };
    }

    // Return default validation stage config if validation type not configured
    return {
      provider: validationStage.provider || ceremony.provider,
      model: validationStage.model || ceremony.defaultModel
    };
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
   * @param {string|null} validationType - Optional validation type for sprint-planning validation stage
   */
  updateStage(ceremonyName, stageId, newModel, validationType = null) {
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

      // Handle validation type sub-configuration for sprint-planning validation stage
      if (validationType && stageName === 'validation' && ceremonyName === 'sprint-planning') {
        if (!ceremony.stages[stageName].validationTypes) {
          ceremony.stages[stageName].validationTypes = {};
        }
        ceremony.stages[stageName].validationTypes[validationType] = {
          provider: modelInfo.provider,
          model: newModel
        };
      } else {
        ceremony.stages[stageName].provider = modelInfo.provider;
        ceremony.stages[stageName].model = newModel;
      }
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

  /**
   * Get complete configuration overview with cost estimates for a ceremony
   * @param {string} ceremonyName - Name of ceremony (e.g., 'sprint-planning')
   * @returns {Object} Configuration overview with costs
   */
  getConfigurationOverview(ceremonyName) {
    if (!this.config) {
      this.readConfig();
    }

    const ceremony = this.config.settings.ceremonies.find(c => c.name === ceremonyName);
    if (!ceremony) {
      throw new Error(`Ceremony '${ceremonyName}' not found in configuration`);
    }

    // Get ceremony-specific main label
    const mainLabels = {
      'sponsor-call': 'Default Fallback Model - Used when specific stages are not configured',
      'sprint-planning': 'Default Fallback Model - Used when specific stages are not configured',
      'seed': 'Default Fallback Model - Used when specific stages are not configured',
      'context-retrospective': 'Default Fallback Model - Used when specific stages are not configured'
    };

    const overview = {
      ceremony: ceremonyName,
      main: {
        label: mainLabels[ceremonyName] || 'Default Fallback Model',
        provider: ceremony.provider || 'claude',
        model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929',
        calls: 0,
        cost: 0,
        formattedCost: 'Free',
        isDefault: true,
        level: 0
      },
      stages: [],
      validationTypes: null,
      totalCost: 0,
      totalCalls: 0
    };

    // Add stages
    const stages = this.getStagesForCeremony(ceremonyName);
    stages.forEach(stage => {
      // Skip 'main' stage as it's already in overview.main
      if (stage.id === 'main') {
        return;
      }

      if (stage.id.startsWith('stage-') && stage.stageName === 'validation' && ceremonyName === 'sprint-planning') {
        // Handle validation stage specially for sprint-planning
        overview.stages.push(this._getValidationStageOverview(ceremony, stage));
      } else {
        const stageProvider = stage.provider || ceremony.provider;
        const stageModel = stage.model || ceremony.defaultModel;

        // Use stageName (without 'stage-' prefix) for lookups, fallback to id
        const lookupName = stage.stageName || stage.id.replace('stage-', '');
        const tokens = getEstimatedTokens(ceremonyName, lookupName);
        const calls = this._getCallCount(ceremonyName, lookupName);
        const cost = calculateCost(stageModel, tokens);

        overview.stages.push({
          id: stage.id,
          label: stage.name,
          provider: stageProvider,
          model: stageModel,
          calls,
          cost,
          formattedCost: formatCost(cost),
          usingDefault: !stage.provider,
          level: 1
        });

        overview.totalCost += cost;
        overview.totalCalls += calls;
      }
    });

    return overview;
  }

  /**
   * Get validation stage overview with validation types (sprint-planning only)
   */
  _getValidationStageOverview(ceremony, validationStage) {
    const validationConfig = ceremony.stages?.validation || {};
    const validationProvider = validationConfig.provider || ceremony.provider;
    const validationModel = validationConfig.model || ceremony.defaultModel;

    const overview = {
      id: 'validation',
      label: 'Multi-Agent Validation - Domain experts validate each epic and story',
      provider: validationProvider,
      model: validationModel,
      calls: 145,
      cost: 0, // Calculated from types
      formattedCost: '', // Set after calculating types
      usingDefault: !validationConfig.provider,
      level: 1,
      validationTypes: []
    };

    const types = [
      {
        id: 'universal',
        name: 'Universal Validators - Always applied (architecture, security, quality)',
        calls: 30,
        validators: ['solution-architect', 'developer', 'security', 'qa', 'test-architect']
      },
      {
        id: 'domain',
        name: 'Domain Validators - Applied based on project tech stack',
        calls: 90,
        validators: ['devops', 'database', 'api', 'frontend', 'backend', 'cloud', 'mobile', 'ui', 'ux', 'data']
      },
      {
        id: 'feature',
        name: 'Feature Validators - Applied based on acceptance criteria keywords',
        calls: 25,
        validators: ['testing', 'security', 'file-upload', 'notifications', 'reporting']
      }
    ];

    let totalValidationCost = 0;

    types.forEach(type => {
      const typeConfig = validationConfig.validationTypes?.[type.id];
      const typeProvider = typeConfig?.provider || validationProvider;
      const typeModel = typeConfig?.model || validationModel;
      const tokens = getEstimatedTokens('sprint-planning', `validation-${type.id}`);
      const cost = calculateCost(typeModel, tokens);

      overview.validationTypes.push({
        id: type.id,
        label: `${type.name} Validators`,
        provider: typeProvider,
        model: typeModel,
        calls: type.calls,
        cost,
        formattedCost: formatCost(cost),
        validators: type.validators,
        usingDefault: !typeConfig,
        level: 2
      });

      totalValidationCost += cost;
    });

    overview.cost = totalValidationCost;
    overview.formattedCost = formatCost(totalValidationCost);

    return overview;
  }

  /**
   * Get call count for a stage
   */
  _getCallCount(ceremonyName, stageId) {
    const callCounts = {
      'sprint-planning': {
        'decomposition': 1,
        'context-generation': 25,
        'validation': 145
      },
      'sponsor-call': {
        'suggestions': 1,
        'documentation': 1,
        'context': 1
      },
      'seed': {
        'decomposition': 1,
        'validation': 20,
        'context-generation': 10
      },
      'context-retrospective': {
        'documentation-update': 10,
        'context-refinement': 15
      }
    };

    return callCounts[ceremonyName]?.[stageId] || 0;
  }

  /**
   * Reset a configuration path to use main default
   * @param {string} ceremonyName - Ceremony name
   * @param {string} path - Configuration path (e.g., 'stages.decomposition')
   */
  resetToDefault(ceremonyName, configPath) {
    if (!this.config) {
      this.readConfig();
    }

    const ceremony = this.config.settings.ceremonies.find(c => c.name === ceremonyName);
    if (!ceremony) {
      throw new Error(`Ceremony '${ceremonyName}' not found`);
    }

    // Delete the configuration at the path to fall back to default
    const pathParts = configPath.split('.');
    let current = ceremony;

    for (let i = 0; i < pathParts.length - 1; i++) {
      current = current[pathParts[i]];
      if (!current) return; // Path doesn't exist, nothing to reset
    }

    delete current[pathParts[pathParts.length - 1]];

    this.saveConfig(this.config);
  }
}
