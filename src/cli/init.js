#!/usr/bin/env node

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { TemplateProcessor } from './template-processor.js';
import { ModelConfigurator } from './init-model-config.js';
import { MESSAGES, getCeremonyHeader } from './message-constants.js';
import { sendError, sendWarning, sendSuccess, sendInfo, sendOutput, sendIndented, sendSectionHeader } from './messaging-api.js';
import { boldCyan, yellow, green, cyan } from './ansi-colors.js';

/**
 * Write a structured entry to the active command log file only.
 * Uses [DEBUG] prefix so ConsoleOutputManager routes to file, never terminal.
 */
function fileLog(level, message, data = null) {
  const ts = new Date().toISOString();
  if (data !== null) {
    console.log(`[DEBUG] [${level}] [${ts}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[DEBUG] [${level}] [${ts}] ${message}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AVC Project Initiator
 *
 * Checks if an AVC project exists in the current directory and creates
 * the necessary files and folders if they don't exist:
 * - .avc/ folder
 * - .avc/avc.json settings file
 */

class ProjectInitiator {
  constructor(projectRoot = null) {
    this.projectRoot = projectRoot || process.cwd();
    this.avcDir = path.join(this.projectRoot, '.avc');
    this.srcDir = path.join(this.projectRoot, 'src');
    this.worktreesDir = path.join(this.projectRoot, 'worktrees');
    this.avcConfigPath = path.join(this.avcDir, 'avc.json');
    // Progress files are ceremony-specific
    this.initProgressPath = path.join(this.avcDir, 'init-progress.json');
    this.sponsorCallProgressPath = path.join(this.avcDir, 'sponsor-call-progress.json');

    // Template processor for token usage tracking
    this._lastTemplateProcessor = null;

    // Load environment variables from project .env file
    // Use override: true to reload even if already set (user may have edited .env)
    dotenv.config({
      path: path.join(this.projectRoot, '.env'),
      override: true
    });
  }

  /**
   * Get the project name from the current folder name
   */
  getProjectName() {
    return path.basename(this.projectRoot);
  }

  /**
   * Get the current AVC package version
   */
  getAvcVersion() {
    try {
      const packagePath = path.join(__dirname, '../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return packageJson.version;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Deep merge objects - adds new keys, preserves existing values
   * @param {Object} target - The target object (user's config)
   * @param {Object} source - The source object (default config)
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (key in result) {
          // Key exists in target
          if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
            // Recursively merge objects
            result[key] = this.deepMerge(result[key], source[key]);
          }
          // else: Keep existing value (don't overwrite)
        } else {
          // New key - add it
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Check if .avc folder exists
   */
  hasAvcFolder() {
    return fs.existsSync(this.avcDir);
  }

  /**
   * Check if avc.json exists
   */
  hasAvcConfig() {
    return fs.existsSync(this.avcConfigPath);
  }

  /**
   * Create .avc folder
   */
  createAvcFolder() {
    if (!this.hasAvcFolder()) {
      fs.mkdirSync(this.avcDir, { recursive: true });
      return true;
    }
    return false;
  }

  /**
   * Check if src folder exists
   */
  hasSrcFolder() {
    return fs.existsSync(this.srcDir);
  }

  /**
   * Create src folder for AVC-managed code
   */
  createSrcFolder() {
    if (!this.hasSrcFolder()) {
      fs.mkdirSync(this.srcDir, { recursive: true });
      return true;
    }
    return false;
  }

  /**
   * Check if worktrees folder exists
   */
  hasWorktreesFolder() {
    return fs.existsSync(this.worktreesDir);
  }

  /**
   * Create worktrees folder for git worktree management
   */
  createWorktreesFolder() {
    if (!this.hasWorktreesFolder()) {
      fs.mkdirSync(this.worktreesDir, { recursive: true });
      return true;
    }
    return false;
  }

  /**
   * Create or update avc.json with default settings
   * Merges new attributes from version updates while preserving existing values
   */
  createAvcConfig() {
    const defaultConfig = {
      version: '1.0.0',
      avcVersion: this.getAvcVersion(),
      projectName: this.getProjectName(),
      framework: 'avc',
      created: new Date().toISOString(),
      settings: {
        workItemStatuses: ['ready', 'pending', 'implementing', 'implemented', 'testing', 'completed', 'blocked', 'feedback'],
        agentTypes: ['product-owner', 'server', 'client', 'infrastructure', 'testing'],
        documentation: {
          port: 4173
        },
        ceremonies: [
          {
            name: 'sponsor-call',
            provider: 'claude',
            defaultModel: 'claude-sonnet-4-6',
            stages: {
              suggestions: {
                provider: 'claude',
                model: 'claude-sonnet-4-6'
              },
              documentation: {
                provider: 'claude',
                model: 'claude-sonnet-4-6'
              },
              'architecture-recommendation': {
                provider: 'claude',
                model: 'claude-opus-4-6'
              },
              'question-prefilling': {
                provider: 'claude',
                model: 'claude-sonnet-4-6'
              }
            },
            agents: [
              {
                name: 'project-documentation-creator',
                instruction: 'project-documentation-creator.md',
                stage: 'documentation-generation'
              },
              {
                name: 'validator-documentation',
                instruction: 'validator-documentation.md',
                stage: 'documentation-validation',
                group: 'validators'
              },
            ],
            validation: {
              enabled: true,
              maxIterations: 100,
              acceptanceThreshold: 90,
              skipOnCriticalIssues: false,
              provider: 'claude',
              model: 'claude-haiku-4-5-20251001',
              documentation: {
                provider: 'claude',
                model: 'claude-haiku-4-5-20251001'
              },
              refinement: {
                provider: 'claude',
                model: 'claude-sonnet-4-6'
              }
            },
            crossValidation: {
              enabled: true,
              maxIterations: 3
            }
          },
          {
            name: 'sprint-planning',
            provider: 'claude',
            defaultModel: 'claude-sonnet-4-6',
            stages: {
              decomposition: {
                provider: 'claude',
                model: 'claude-opus-4-6'
              },
              validation: {
                provider: 'claude',
                model: 'claude-sonnet-4-6'
              },
              'doc-distribution': {
                provider: 'claude',
                model: 'claude-sonnet-4-6'
              },
              solver: {
                provider: 'claude',
                model: 'claude-sonnet-4-6',
                maxIterations: 3,
                acceptanceThreshold: 90
              }
            },
            agents: [
              {
                name: 'epic-story-decomposer',
                instruction: 'epic-story-decomposer.md',
                stage: 'decomposition'
              },
              {
                name: 'doc-distributor',
                instruction: 'doc-distributor.md',
                stage: 'doc-distribution'
              }
            ]
          },
          {
            name: 'seed',
            provider: 'claude',
            defaultModel: 'claude-sonnet-4-6',
            stages: {
              decomposition: {
                provider: 'claude',
                model: 'claude-opus-4-6'
              }
            },
            agents: [
              {
                name: 'task-subtask-decomposer',
                instruction: 'task-subtask-decomposer.md',
                stage: 'decomposition'
              }
            ]
          }
        ],
        missionGenerator: {
          validation: {
            maxIterations: 3,
            acceptanceThreshold: 90
          }
        },
        costThresholds: {
          'sponsor-call': null,
          'sprint-planning': null,
          'seed': null
        },
        questionnaire: {
          defaults: {
            MISSION_STATEMENT: null,
            TARGET_USERS: null,
            INITIAL_SCOPE: null,
            DEPLOYMENT_TARGET: null,
            TECHNICAL_CONSIDERATIONS: null,
            SECURITY_AND_COMPLIANCE_REQUIREMENTS: null
          }
        },
        models: {
          // Anthropic Claude models (prices per 1M tokens in USD)
          // Source: https://www.anthropic.com/pricing
          'claude-opus-4-6': {
            provider: 'claude',
            displayName: 'Claude Opus 4.6',
            pricing: {
              input: 5.00,
              output: 25.00,
              unit: 'million',
              source: 'https://www.anthropic.com/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'claude-sonnet-4-6': {
            provider: 'claude',
            displayName: 'Claude Sonnet 4.6',
            pricing: {
              input: 3.00,
              output: 15.00,
              unit: 'million',
              source: 'https://www.anthropic.com/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'claude-haiku-4-5-20251001': {
            provider: 'claude',
            displayName: 'Claude Haiku 4.5',
            pricing: {
              input: 1.00,
              output: 5.00,
              unit: 'million',
              source: 'https://www.anthropic.com/pricing',
              lastUpdated: '2026-02-24'
            }
          },

          // Google Gemini models (prices per 1M tokens in USD)
          // Source: https://ai.google.dev/pricing
          'gemini-2.5-pro': {
            provider: 'gemini',
            displayName: 'Gemini 2.5 Pro',
            pricing: {
              input: 1.25,
              output: 10.00,
              unit: 'million',
              source: 'https://ai.google.dev/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'gemini-2.5-flash': {
            provider: 'gemini',
            displayName: 'Gemini 2.5 Flash',
            pricing: {
              input: 0.30,
              output: 2.50,
              unit: 'million',
              source: 'https://ai.google.dev/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'gemini-2.5-flash-lite': {
            provider: 'gemini',
            displayName: 'Gemini 2.5 Flash-Lite',
            pricing: {
              input: 0.10,
              output: 0.40,
              unit: 'million',
              source: 'https://ai.google.dev/pricing',
              lastUpdated: '2026-02-24'
            }
          },

          // OpenAI models (prices per 1M tokens in USD)
          // Source: https://openai.com/api/pricing
          'gpt-5.2': {
            provider: 'openai',
            displayName: 'GPT-5.2',
            pricing: {
              input: 1.75,
              output: 14.00,
              unit: 'million',
              source: 'https://openai.com/api/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'gpt-5.1': {
            provider: 'openai',
            displayName: 'GPT-5.1',
            pricing: {
              input: 1.25,
              output: 10.00,
              unit: 'million',
              source: 'https://openai.com/api/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'gpt-5-mini': {
            provider: 'openai',
            displayName: 'GPT-5 mini',
            pricing: {
              input: 0.25,
              output: 2.00,
              unit: 'million',
              source: 'https://openai.com/api/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'o4-mini': {
            provider: 'openai',
            displayName: 'o4-mini',
            pricing: {
              input: 1.10,
              output: 4.40,
              unit: 'million',
              source: 'https://openai.com/api/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'o3': {
            provider: 'openai',
            displayName: 'o3',
            pricing: {
              input: 2.00,
              output: 8.00,
              unit: 'million',
              source: 'https://openai.com/api/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'o3-mini': {
            provider: 'openai',
            displayName: 'o3-mini',
            pricing: {
              input: 0.50,
              output: 2.00,
              unit: 'million',
              source: 'https://openai.com/api/pricing',
              lastUpdated: '2026-02-24'
            }
          },
          'gpt-5.2-codex': {
            provider: 'openai',
            displayName: 'GPT-5.2-Codex',
            pricing: {
              input: 1.75,
              output: 14.00,
              unit: 'million',
              source: 'https://openai.com/api/pricing',
              lastUpdated: '2026-02-24'
            }
          }
        }
      }
    };

    if (!this.hasAvcConfig()) {
      // Create new config
      fs.writeFileSync(
        this.avcConfigPath,
        JSON.stringify(defaultConfig, null, 2),
        'utf8'
      );
      return true;
    }

    // Config exists - check for merge
    try {
      const existingConfig = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));

      // Merge: add new keys, keep existing values
      const mergedConfig = this.deepMerge(existingConfig, defaultConfig);

      // Update avcVersion to track CLI version
      mergedConfig.avcVersion = this.getAvcVersion();
      mergedConfig.updated = new Date().toISOString();

      // Check if anything changed
      const existingJson = JSON.stringify(existingConfig, null, 2);
      const mergedJson = JSON.stringify(mergedConfig, null, 2);

      if (existingJson !== mergedJson) {
        fs.writeFileSync(this.avcConfigPath, mergedJson, 'utf8');
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Warning: Could not merge avc.json: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if current directory is a git repository
   */
  isGitRepository() {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create .env file for API keys
   * If .env exists, check and add any missing API key variables
   */
  createEnvFile() {
    const envPath = path.join(this.projectRoot, '.env');

    // Define required API key variables with metadata
    const requiredApiKeys = [
      {
        key: 'ANTHROPIC_API_KEY',
        comment: 'Anthropic API Key for AI-powered Sponsor Call ceremony',
        url: 'https://console.anthropic.com/settings/keys'
      },
      {
        key: 'GEMINI_API_KEY',
        comment: 'Google Gemini API Key (alternative LLM provider)',
        url: 'https://aistudio.google.com/app/apikey'
      },
      {
        key: 'OPENAI_API_KEY',
        comment: 'OpenAI API Key (alternative LLM provider)',
        url: 'https://platform.openai.com/api-keys'
      }
    ];

    if (!fs.existsSync(envPath)) {
      // Create new .env file with all API keys
      let envContent = '';
      requiredApiKeys.forEach(({ key, comment, url }, index) => {
        if (index > 0) envContent += '\n';
        envContent += `# ${comment}\n`;
        envContent += `# Get your key at: ${url}\n`;
        envContent += `${key}=\n`;
      });
      fs.writeFileSync(envPath, envContent, 'utf8');
      return true;
    }

    // .env exists - check for missing API keys
    const existingContent = fs.readFileSync(envPath, 'utf8');
    const missingKeys = [];

    // Check which API keys are missing
    requiredApiKeys.forEach(({ key }) => {
      const keyPattern = new RegExp(`^${key}=`, 'm');
      if (!keyPattern.test(existingContent)) {
        missingKeys.push(key);
      }
    });

    if (missingKeys.length > 0) {
      // Add missing API keys to .env file
      let appendContent = '\n';
      requiredApiKeys.forEach(({ key, comment, url }) => {
        if (missingKeys.includes(key)) {
          appendContent += `\n# ${comment}\n`;
          appendContent += `# Get your key at: ${url}\n`;
          appendContent += `${key}=\n`;
        }
      });

      fs.appendFileSync(envPath, appendContent, 'utf8');
      return true;
    }

    return false;
  }

  /**
   * Add .env to .gitignore if git repository
   */
  addToGitignore() {
    if (!this.isGitRepository()) {
      return;
    }

    const gitignorePath = path.join(this.projectRoot, '.gitignore');

    let gitignoreContent = '';
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    }

    // Items to add to gitignore
    const itemsToIgnore = [
      { pattern: '.env', comment: 'Environment variables' },
      { pattern: '.avc/documentation/.vitepress/dist', comment: 'VitePress build output' },
      { pattern: '.avc/documentation/.vitepress/cache', comment: 'VitePress cache' },
      { pattern: '.avc/logs', comment: 'Command execution logs' },
      { pattern: '.avc/token-history.json', comment: 'Token usage tracking' },
      { pattern: '.avc/ceremonies-history.json', comment: 'Ceremony execution history' }
    ];

    let newContent = gitignoreContent;
    let addedItems = [];

    for (const item of itemsToIgnore) {
      if (!newContent.includes(item.pattern)) {
        if (!newContent.endsWith('\n') && newContent.length > 0) {
          newContent += '\n';
        }
        if (!newContent.includes(`# ${item.comment}`)) {
          newContent += `\n# ${item.comment}\n`;
        }
        newContent += `${item.pattern}\n`;
        addedItems.push(item.pattern);
      }
    }

    if (addedItems.length > 0) {
      fs.writeFileSync(gitignorePath, newContent, 'utf8');
    }
  }

  /**
   * Create VitePress documentation structure (folders and config files)
   * Note: VitePress is bundled with AVC, no need to modify user's package.json
   */
  createVitePressStructure() {
    const docsDir = path.join(this.avcDir, 'documentation');
    const vitepressDir = path.join(docsDir, '.vitepress');
    const publicDir = path.join(docsDir, 'public');

    // Create directory structure
    if (!fs.existsSync(vitepressDir)) {
      fs.mkdirSync(vitepressDir, { recursive: true });
    }

    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Create VitePress config
    const configPath = path.join(vitepressDir, 'config.mts');
    if (!fs.existsSync(configPath)) {
      const templatePath = path.join(__dirname, 'templates/vitepress-config.mts.template');
      let configContent = fs.readFileSync(templatePath, 'utf8');
      configContent = configContent.replace('{{PROJECT_NAME}}', this.getProjectName());
      fs.writeFileSync(configPath, configContent, 'utf8');
    }

    // Create initial index.md
    const indexPath = path.join(docsDir, 'index.md');
    if (!fs.existsSync(indexPath)) {
      const indexContent = `# ${this.getProjectName()}

Documentation for this project will be generated automatically once the project is defined via the Sponsor Call ceremony. Use the **Start Project** button in the [Kanban board](http://localhost:4174) to get started.
`;
      fs.writeFileSync(indexPath, indexContent, 'utf8');
    }
  }

  /**
   * Check if there's an incomplete ceremony in progress
   */
  hasIncompleteProgress(progressPath) {
    return fs.existsSync(progressPath);
  }

  /**
   * Read progress from file
   */
  readProgress(progressPath) {
    try {
      const content = fs.readFileSync(progressPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Write progress to file
   */
  writeProgress(progress, progressPath) {
    if (!fs.existsSync(this.avcDir)) {
      fs.mkdirSync(this.avcDir, { recursive: true });
    }
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf8');
  }

  /**
   * Clear progress file (ceremony completed successfully)
   */
  clearProgress(progressPath) {
    if (fs.existsSync(progressPath)) {
      fs.unlinkSync(progressPath);
    }
  }


  /**
   * Parse and simplify API error messages for better UX
   * @param {string|object} error - Error from API call
   * @returns {string} - Human-readable error message
   */
  parseApiError(error) {
    let errorStr = typeof error === 'string' ? error : JSON.stringify(error);

    // Try to parse as JSON to extract meaningful information
    let errorObj = null;
    try {
      errorObj = typeof error === 'object' ? error : JSON.parse(error);
    } catch (e) {
      // Not JSON, use as-is
    }

    // Check for common error patterns
    if (errorStr.includes('quota') || errorStr.includes('RESOURCE_EXHAUSTED')) {
      return 'API quota exceeded. You have reached your free tier limit.\n\n   Please check your usage at the provider dashboard or upgrade your plan.';
    }

    if (errorStr.includes('rate limit') || errorStr.includes('429')) {
      const retryMatch = errorStr.match(/retry.*?(\d+)\.?\d*s/i);
      const retryTime = retryMatch ? ` Try again in ${Math.ceil(parseFloat(retryMatch[1]))} seconds.` : '';
      return `Rate limit exceeded.${retryTime}\n\n   Please wait before making more requests.`;
    }

    if (errorStr.includes('401') || errorStr.includes('authentication') || errorStr.includes('unauthorized')) {
      return 'Invalid API key or authentication failed.\n\n   Please verify your API key is correct.';
    }

    if (errorStr.includes('403') || errorStr.includes('forbidden')) {
      return 'Access forbidden. Your API key may not have permission for this operation.\n\n   Check your API key permissions or contact support.';
    }

    if (errorStr.includes('404') || errorStr.includes('not found')) {
      return 'API endpoint not found. The model or API version may not be available.\n\n   Check that you\'re using a valid model name.';
    }

    if (errorStr.includes('timeout') || errorStr.includes('ETIMEDOUT')) {
      return 'Request timed out.\n\n   Check your internet connection and try again.';
    }

    if (errorStr.includes('ENOTFOUND') || errorStr.includes('DNS')) {
      return 'Network error: Could not reach API server.\n\n   Check your internet connection.';
    }

    // Extract just the error message if it's an object with a message field
    if (errorObj) {
      if (errorObj.error?.message) {
        // Take first line or first 150 characters of the message
        const msg = errorObj.error.message.split('\n')[0];
        return msg.length > 150 ? msg.substring(0, 150) + '...' : msg;
      }
      if (errorObj.message) {
        const msg = errorObj.message.split('\n')[0];
        return msg.length > 150 ? msg.substring(0, 150) + '...' : msg;
      }
    }

    // Fallback: truncate the error if it's too long
    if (errorStr.length > 200) {
      return errorStr.substring(0, 200) + '...\n\n   (Full error logged to console)';
    }

    return errorStr;
  }

  /**
   * Validate that the configured provider's API key is present and working
   */
  async validateProviderApiKey() {
    // Import LLMProvider dynamically to avoid circular dependencies
    const { LLMProvider } = await import('./llm-provider.js');

    // Check if config file exists
    if (!fs.existsSync(this.avcConfigPath)) {
      return {
        valid: false,
        message: 'Configuration file not found at .avc/avc.json.\n   Please run /init first to set up your project.'
      };
    }

    // Read ceremony config
    const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
    const ceremony = config.settings?.ceremonies?.[0];

    if (!ceremony) {
      return {
        valid: false,
        message: 'No ceremonies configured in .avc/avc.json.\n   Please check your configuration.'
      };
    }

    const mainProvider = ceremony.provider || 'claude';
    const mainModel = ceremony.defaultModel || 'claude-sonnet-4-6';

    // Check validation provider if validation is enabled
    const validationEnabled = ceremony.validation?.enabled !== false;
    const validationProvider = ceremony.validation?.provider || null;
    const validationModel = ceremony.validation?.model || null;

    const envVarMap = {
      'claude': 'ANTHROPIC_API_KEY',
      'gemini': 'GEMINI_API_KEY',
      'openai': 'OPENAI_API_KEY'
    };

    const urlMap = {
      'claude': 'https://console.anthropic.com/settings/keys',
      'gemini': 'https://aistudio.google.com/app/apikey',
      'openai': 'https://platform.openai.com/api-keys'
    };

    // Validate main provider
    const mainEnvVar = envVarMap[mainProvider];
    if (!mainEnvVar) {
      return {
        valid: false,
        message: `Unknown provider "${mainProvider}".\n   Supported providers: claude, gemini, openai`
      };
    }

    if (!process.env[mainEnvVar]) {
      return {
        valid: false,
        message: `${mainEnvVar} not found in .env file.\n\n   Steps to fix:\n   1. Open .env file in the current directory\n   2. Add your API key: ${mainEnvVar}=your-key-here\n   3. Save the file and run /sponsor-call again\n\n   Get your API key:\n   • ${urlMap[mainProvider]}`
      };
    }

    // Test the API key with a minimal call
    let result;
    try {
      result = await LLMProvider.validate(mainProvider, mainModel);
    } catch (error) {
      const parsedError = this.parseApiError(error.message || error);
      return {
        valid: false,
        message: `${mainEnvVar} validation failed.\n\n   ${parsedError}\n\n   Get a new API key if needed:\n   • ${urlMap[mainProvider]}`
      };
    }

    if (!result.valid) {
      const parsedError = this.parseApiError(result.error || 'Unknown error');
      return {
        valid: false,
        message: `${mainEnvVar} is set but API call failed.\n\n   ${parsedError}\n\n   Get a new API key if needed:\n   • ${urlMap[mainProvider]}`
      };
    }

    // Validate validation provider if enabled and different from main
    if (validationEnabled && validationProvider && validationProvider !== mainProvider) {
      const validationEnvVar = envVarMap[validationProvider];

      if (!validationEnvVar) {
        return {
          valid: false,
          message: `Unknown validation provider "${validationProvider}".\n   Supported providers: claude, gemini, openai`
        };
      }

      if (!process.env[validationEnvVar]) {
        // Enhanced error message with 3 options
        return {
          valid: false,
          validationProviderMissing: true,
          ceremonyConfig: {
            mainProvider,
            mainModel,
            validationProvider,
            validationModel
          },
          message: `Validation Provider API Key Missing\n\nYour ceremony is configured to use:\n  • Generation: ${mainProvider} (${mainModel}) ✓\n  • Validation: ${validationProvider} (${validationModel}) ✗ (${validationEnvVar} not found)\n\nYou have 3 options:\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nOption 1: Add the missing API key\n\n  1. Get API key: ${urlMap[validationProvider]}\n  2. Add to .env file: ${validationEnvVar}=your-key-here\n  3. Run /sponsor-call again\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nOption 2: Disable validation (faster, lower quality)\n\n  1. Edit .avc/avc.json\n  2. Find "sponsor-call" ceremony config\n  3. Set:\n     "validation": {\n       "enabled": false\n     }\n  4. Run /sponsor-call again\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nOption 3: Use same provider for validation (simpler setup)\n\n  1. Edit .avc/avc.json\n  2. Find "sponsor-call" ceremony config\n  3. Change:\n     "validation": {\n       "enabled": true,\n       "provider": "${mainProvider}",\n       "model": "${mainModel}"\n     }\n  4. Run /sponsor-call again\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        };
      }

      try {
        result = await LLMProvider.validate(validationProvider, validationModel);
      } catch (error) {
        const parsedError = this.parseApiError(error.message || error);
        return {
          valid: false,
          message: `${validationEnvVar} validation failed.\n\n   ${parsedError}\n\n   Get a new API key if needed:\n   • ${urlMap[validationProvider]}`
        };
      }

      if (!result.valid) {
        const parsedError = this.parseApiError(result.error || 'Unknown error');
        return {
          valid: false,
          message: `${validationEnvVar} is set but API call failed.\n\n   ${parsedError}\n\n   Get a new API key if needed:\n   • ${urlMap[validationProvider]}`
        };
      }

    }

    return { valid: true };
  }

  /**
   * Generate project document via Sponsor Call ceremony
   */
  async generateProjectDocument(progress = null, progressPath = null, nonInteractive = false, progressCallback = null, options = {}) {
    const processor = new TemplateProcessor('sponsor-call', progressPath || this.sponsorCallProgressPath, nonInteractive, options);

    // Set before await so processor is reachable even if processTemplate throws
    this._lastTemplateProcessor = processor;

    if (progressCallback) {
      processor.setProgressCallback(progressCallback);
    }

    return await processor.processTemplate(progress);
  }

  /**
   * Get token usage from last template processor execution
   * @returns {Object|null} Token usage object or null
   */
  getLastTokenUsage() {
    if (this._lastTemplateProcessor) {
      return this._lastTemplateProcessor.getLastTokenUsage();
    }
    return null;
  }

  /**
   * Read ceremony configuration from avc.json
   * @param {string} ceremonyName - Name of the ceremony
   * @returns {Object|null} Ceremony config or null
   */
  readCeremonyConfig(ceremonyName) {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      return config.settings?.ceremonies?.find(c => c.name === ceremonyName);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if the current directory is an AVC project
   */
  isAvcProject() {
    return this.hasAvcFolder() && this.hasAvcConfig();
  }

  /**
   * Initialize the AVC project structure (no API keys required)
   * Creates .avc folder, avc.json config, .env file, and gitignore entry
   */
  async init() {
    const startTime = Date.now();
    fileLog('INFO', 'init() started', { projectRoot: this.projectRoot });

    if (this.isAvcProject()) {
      // Project already initialized
      fileLog('INFO', 'Project already initialized — skipping structure creation');
      sendOutput('Project already initialized.');
      sendOutput('');
      return;
    }

    fileLog('INFO', 'New project — creating structure');
    fileLog('DEBUG', 'Creating components: .avc/, src/, worktrees/, avc.json, .env, .gitignore, VitePress');

    // Suppress all console output during initialization
    const originalLog = console.log;
    console.log = () => { };

    let initError = null;
    try {
      // Create project structure silently
      this.createAvcFolder();
      this.createSrcFolder();
      this.createWorktreesFolder();
      this.createAvcConfig();
      this.createEnvFile();
      this.addToGitignore();
      this.createVitePressStructure();
    } catch (err) {
      initError = err;
    } finally {
      console.log = originalLog;
    }

    if (initError) {
      fileLog('ERROR', 'Structure creation failed', { error: initError.message, stack: initError.stack });
      throw initError;
    }

    const duration = Date.now() - startTime;
    fileLog('INFO', 'Structure creation complete', {
      duration: `${duration}ms`,
      avcFolder: this.hasAvcFolder(),
      srcFolder: this.hasSrcFolder(),
      worktreesFolder: this.hasWorktreesFolder(),
      avcConfig: this.hasAvcConfig(),
    });

    sendOutput('Project initialized.');
    sendOutput('');

    return;
  }

  /**
   * Configure models command
   * Shows current model configuration and offers interactive editing
   */
  async models() {
    sendOutput('Model Configuration\n');
    sendOutput('Ceremonies are structured workflows (sponsor-call, sprint-planning, seed) that guide your project through key decisions. Each ceremony runs multiple stages in sequence, and you can assign a different LLM model to each stage.\n');

    // Check if project is initialized
    if (!this.isAvcProject()) {
      sendError(MESSAGES.PROJECT_NOT_INITIALIZED.error);
      sendOutput('');
      sendOutput(MESSAGES.PROJECT_NOT_INITIALIZED.help);
      sendOutput('');
      return;
    }

    // Use the shared configuration method
    return this.configureModelsInteractively();
  }

  /**
   * Interactive model configuration flow
   * Shared by both /init and /models commands
   */
  configureModelsInteractively() {
    fileLog('INFO', 'configureModels() called', { projectRoot: this.projectRoot });

    const configurator = new ModelConfigurator(this.projectRoot);

    // Detect available providers (used for model indicators)
    configurator.availableProviders = configurator.detectAvailableProviders();
    configurator.readConfig();

    fileLog('DEBUG', 'Model configurator loaded', {
      availableProviders: configurator.availableProviders,
      configPath: this.avcConfigPath,
    });

    // Show current configuration
    const ceremonies = configurator.getCeremonies();
    fileLog('INFO', 'Ceremony model configs', {
      count: ceremonies.length,
      names: ceremonies.map(c => c.name),
    });

    ceremonies.forEach(c => {
      const ceremonyUrl = `https://agilevibecoding.org/ceremonies/${c.name}.html`;

      const hasMainKey = configurator.availableProviders.includes(c.mainProvider);
      const stageDetails = {};
      Object.keys(c.stages).forEach(stageName => {
        const stage = c.stages[stageName];
        stageDetails[stageName] = {
          model: stage.model,
          provider: stage.provider,
          hasApiKey: configurator.availableProviders.includes(stage.provider),
        };
      });
      fileLog('DEBUG', `Ceremony: ${c.name}`, {
        mainModel: c.mainModel,
        mainProvider: c.mainProvider,
        hasMainKey,
        validationModel: c.validationModel || null,
        validationProvider: c.validationProvider || null,
        hasValidationKey: c.validationProvider ? configurator.availableProviders.includes(c.validationProvider) : null,
        stages: stageDetails,
      });

      sendOutput(boldCyan(c.name));
      sendOutput(`${yellow('default')}: ${green(c.mainModel)} (${c.mainProvider})`);
      if (c.validationProvider) {
        const hasValidationKey = configurator.availableProviders.includes(c.validationProvider);
        const keyWarning = hasValidationKey ? '' : ' [no API key]';
        sendOutput(`${yellow('validation')}: ${green(c.validationModel)} (${c.validationProvider})${keyWarning}`);
      }
      Object.keys(c.stages).forEach(stageName => {
        const stage = c.stages[stageName];
        const hasStageKey = configurator.availableProviders.includes(stage.provider);
        const keyWarning = hasStageKey ? '' : ' [no API key]';
        sendOutput(`${yellow(stageName)}: ${green(stage.model)} (${stage.provider})${keyWarning}`);
      });
      sendOutput('');
    });

    fileLog('INFO', 'configureModels() complete');
    // Return configurator for REPL to use
    return {
      shouldConfigure: true,
      configurator,
      ceremonies: ceremonies.map(c => c.name) // List of ceremony names for selection
    };
  }

  /**
   * Run Sponsor Call ceremony with pre-filled answers from REPL questionnaire
   * Used when all answers are collected via REPL UI
   */
  async sponsorCallWithAnswers(answers, progressCallback = null, options = {}) {
    const startTime = Date.now();
    fileLog('INFO', 'sponsorCallWithAnswers() called', {
      answerKeys: Object.keys(answers || {}),
      answeredCount: Object.values(answers || {}).filter(v => v !== null && v !== '').length,
      hasProgressCallback: !!progressCallback,
      projectRoot: this.projectRoot,
    });

    // Remove initial ceremony banner - will be shown in summary

    // Check if project is initialized
    if (!this.isAvcProject()) {
      fileLog('ERROR', 'Project not initialized — aborting sponsor call');
      sendError(MESSAGES.PROJECT_NOT_INITIALIZED.error);
      return;
    }

    const progressPath = this.sponsorCallProgressPath;

    // Initialize ceremony history
    const { CeremonyHistory } = await import('./ceremony-history.js');
    const history = new CeremonyHistory(this.avcDir);
    history.init();

    // Get or create execution record
    let executionId;
    const lastExecution = history.getLastExecution('sponsor-call');

    if (lastExecution && lastExecution.status === 'in-progress' && lastExecution.stage === 'llm-generation') {
      // Resume existing execution (from REPL flow)
      executionId = lastExecution.id;
    } else {
      // This shouldn't normally happen if called from REPL, but handle it
      executionId = history.startExecution('sponsor-call', 'llm-generation');
    }

    // Count answers provided (for logging)
    const answeredCount = Object.values(answers).filter(v => v !== null && v !== '').length;
    fileLog('DEBUG', 'Ceremony history state', {
      executionId,
      lastExecutionStatus: lastExecution?.status,
      lastExecutionStage: lastExecution?.stage,
      answeredCount,
      totalQuestions: Object.keys(answers).length,
    });

    // Validate API key before starting ceremony
    fileLog('INFO', 'Validating API key before ceremony start');
    const validationResult = await this.validateProviderApiKey();
    fileLog(validationResult.valid ? 'INFO' : 'ERROR', 'API key validation result', {
      valid: validationResult.valid,
      message: validationResult.message || 'OK',
    });
    if (!validationResult.valid) {
      // Mark execution as aborted
      history.completeExecution('sponsor-call', executionId, 'abrupt-termination', {
        answers,
        stage: 'llm-generation',
        error: 'API key validation failed'
      });

      // Return error for REPL to display
      return {
        error: true,
        message: `API Key Validation Failed: ${validationResult.message}`
      };
    }

    // Create progress with pre-filled answers
    const progress = {
      stage: 'questionnaire',
      totalQuestions: 5,
      answeredQuestions: 5,
      collectedValues: answers,
      lastUpdate: new Date().toISOString()
    };
    this.writeProgress(progress, progressPath);

    try {
      // Generate project document with pre-filled answers
      const result = await this.generateProjectDocument(progress, progressPath, true, progressCallback, options);

      fileLog('INFO', 'generateProjectDocument() complete', { resultKeys: result ? Object.keys(result) : [] });

      // Notify progress during cleanup
      if (progressCallback) await progressCallback(null, 'Calculating token usage costs...');

      // Get token usage from template processor
      const tokenUsage = this.getLastTokenUsage();

      // Get model ID from ceremony config
      const ceremony = this.readCeremonyConfig('sponsor-call');
      const modelId = ceremony?.defaultModel || 'claude-sonnet-4-6';

      // Calculate cost using token tracker
      const { TokenTracker } = await import('./token-tracker.js');
      const tracker = new TokenTracker(this.avcDir);
      const cost = tracker.calculateCost(
        tokenUsage?.inputTokens || 0,
        tokenUsage?.outputTokens || 0,
        modelId
      );

      // Mark execution as completed with metadata
      if (progressCallback) await progressCallback(null, 'Saving ceremony history...');
      history.completeExecution('sponsor-call', executionId, 'success', {
        answers,
        filesGenerated: [
          path.join(this.avcDir, 'project/doc.md')
        ],
        tokenUsage: {
          input: tokenUsage?.inputTokens || 0,
          output: tokenUsage?.outputTokens || 0,
          total: tokenUsage?.totalTokens || 0
        },
        model: modelId,
        cost: cost,
        stage: 'completed'
      });

      // Mark progress as completed and clean up
      if (progressCallback) await progressCallback(null, 'Finalizing ceremony...');
      progress.stage = 'completed';
      progress.lastUpdate = new Date().toISOString();
      this.writeProgress(progress, progressPath);
      this.clearProgress(progressPath);

      // Emit a final main progress message so the UI log clearly shows completion
      if (progressCallback) await progressCallback('✓ Documentation generated successfully!');

      fileLog('INFO', 'sponsorCallWithAnswers() complete', {
        duration: `${Date.now() - startTime}ms`,
        outputPath: result?.outputPath,
        tokenInput: result?.tokenUsage?.input,
        tokenOutput: result?.tokenUsage?.output,
        estimatedCost: result?.cost?.total,
      });

      // Persist answers and generate Q&A documentation page (non-fatal)
      this.saveProjectBriefAnswers(answers);

      // Return result for display in REPL
      return result;

    } catch (error) {
      const isCancelled = error.message === 'CEREMONY_CANCELLED';

      // Save any tokens spent before cancellation/error
      try {
        this._lastTemplateProcessor?.saveCurrentTokenTracking();
      } catch (trackErr) {
        fileLog('WARN', 'Could not save partial token tracking', { error: trackErr.message });
      }

      if (!isCancelled) {
        fileLog('ERROR', 'sponsorCallWithAnswers() failed', {
          error: error.message,
          stack: error.stack,
          duration: `${Date.now() - startTime}ms`,
        });
      }

      // Mark execution as aborted on error/cancel
      history.completeExecution('sponsor-call', executionId, 'abrupt-termination', {
        answers,
        stage: isCancelled ? 'cancelled' : 'llm-generation',
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Display token usage statistics and costs
   */
  async showTokenStats() {
    fileLog('INFO', 'showTokenStats() called', { avcDir: this.avcDir });

    const { TokenTracker } = await import('./token-tracker.js');
    const tracker = new TokenTracker(this.avcDir);
    tracker.init();
    tracker.load();

    const data = tracker.data;
    fileLog('DEBUG', 'Token history loaded', {
      version: data.version,
      lastUpdated: data.lastUpdated,
      ceremonyTypes: Object.keys(data).filter(k => !['version', 'lastUpdated', 'totals'].includes(k)),
      allTimeTotal: data.totals?.allTime?.total,
      allTimeExecutions: data.totals?.allTime?.executions,
    });

    const allTime = data.totals.allTime;
    const costStr = (allTime.cost && allTime.cost.total > 0) ? ` / $${allTime.cost.total.toFixed(4)}` : '';
    sendOutput(`All-time: ${allTime.total.toLocaleString()} tokens / ${allTime.executions} executions${costStr}`);

    const ceremonyTypes = Object.keys(data).filter(k => !['version', 'lastUpdated', 'totals'].includes(k));
    for (const ceremonyType of ceremonyTypes) {
      const ceremony = data[ceremonyType];
      if (ceremony.allTime && ceremony.allTime.executions > 0) {
        const cCostStr = (ceremony.allTime.cost && ceremony.allTime.cost.total > 0) ? ` / $${ceremony.allTime.cost.total.toFixed(4)}` : '';
        sendIndented(`${ceremonyType}: ${ceremony.allTime.total.toLocaleString()} tokens / ${ceremony.allTime.executions} runs${cCostStr}`, 1);
      }
    }

    fileLog('INFO', 'showTokenStats() complete', {
      allTimeInput: data.totals?.allTime?.input,
      allTimeOutput: data.totals?.allTime?.output,
      allTimeTotal: data.totals?.allTime?.total,
      estimatedCost: data.totals?.allTime?.cost?.total,
    });
  }

  /**
   * Run Sprint Planning ceremony to create/expand Epics and Stories
   */
  async sprintPlanning() {
    const startTime = Date.now();
    fileLog('INFO', 'sprintPlanning() called', { projectRoot: this.projectRoot });

    if (!this.isAvcProject()) {
      fileLog('ERROR', 'Project not initialized — aborting sprint planning');
      sendError('Project not initialized. Run /init first.');
      return;
    }

    fileLog('INFO', 'Loading SprintPlanningProcessor');
    const { SprintPlanningProcessor } = await import('./sprint-planning-processor.js');
    const processor = new SprintPlanningProcessor();
    fileLog('DEBUG', 'SprintPlanningProcessor created', {
      projectPath: processor.projectPath,
      provider: processor._providerName,
      model: processor._modelName,
    });

    await processor.execute();
    fileLog('INFO', 'sprintPlanning() complete', { duration: `${Date.now() - startTime}ms` });
  }

  /**
   * Run Sprint Planning ceremony with a progress callback (used by kanban board)
   * @param {Function|null} progressCallback - Called with (msg, substep, meta) on each stage
   * @returns {Promise<object>} Result with epicsCreated, storiesCreated, tokenUsage, model
   */
  async sprintPlanningWithCallback(progressCallback = null, options = {}) {
    fileLog('INFO', 'sprintPlanningWithCallback() called', { projectRoot: this.projectRoot });
    if (!this.isAvcProject()) {
      throw new Error('Project not initialized. Run /init first.');
    }
    const { SprintPlanningProcessor } = await import('./sprint-planning-processor.js');
    const processor = new SprintPlanningProcessor(options);
    return await processor.execute(progressCallback);
  }

  /**
   * Run Seed ceremony to decompose a Story into Tasks and Subtasks
   * @param {string} storyId - Story ID (e.g., context-0001-0001)
   */
  async seed(storyId) {
    const startTime = Date.now();
    fileLog('INFO', 'seed() called', { storyId, projectRoot: this.projectRoot });

    if (!this.isAvcProject()) {
      fileLog('ERROR', 'Project not initialized — aborting seed');
      sendError('Project not initialized. Run /init first.');
      return;
    }

    if (!storyId) {
      fileLog('ERROR', 'No story ID provided — aborting seed');
      sendError('Story ID required. Usage: /seed <story-id>');
      return;
    }

    fileLog('INFO', 'Loading SeedProcessor', { storyId });
    const { SeedProcessor } = await import('./seed-processor.js');
    const processor = new SeedProcessor(storyId);
    fileLog('DEBUG', 'SeedProcessor created', {
      storyId,
      storyPath: processor.storyPath,
      provider: processor._providerName,
      model: processor._modelName,
    });

    await processor.execute();
    fileLog('INFO', 'seed() complete', { storyId, duration: `${Date.now() - startTime}ms` });
  }

  /**
   * Run Sponsor Call ceremony to define project with AI assistance
   * Requires API keys to be configured in .env file
   */
  async sponsorCall() {
    const header = getCeremonyHeader('sponsor-call');
    sendOutput('');
    sendOutput(header.title);
    sendOutput('');
    sendOutput(`Project directory: ${this.projectRoot}`);
    sendOutput('');

    // Check if running in REPL mode
    const isReplMode = process.env.AVC_REPL_MODE === 'true';
    if (isReplMode) {
      // REPL mode is handled by repl-ink.js questionnaire display
      // This code path shouldn't be reached from REPL
      sendWarning('Unexpected: Ceremony called directly from REPL');
      return;
    }

    // Check if project is initialized
    if (!this.isAvcProject()) {
      sendError(MESSAGES.PROJECT_NOT_INITIALIZED.error);
      sendOutput('');
      sendOutput(MESSAGES.PROJECT_NOT_INITIALIZED.help);
      sendOutput('');
      return; // Don't exit in REPL mode
    }

    // Check if sponsor call has already completed successfully
    const { CeremonyHistory } = await import('./ceremony-history.js');
    const history = new CeremonyHistory(this.avcDir);

    if (history.hasSuccessfulCompletion('sponsor-call')) {
      sendError('Sponsor Call has already completed successfully');
      sendOutput('');
      sendOutput('Project documentation already exists at .avc/project/doc.md');
      sendOutput('');
      sendOutput('To regenerate documentation, first run /remove to clear the project,');
      sendOutput('then run /init followed by /sponsor-call again.');
      sendOutput('');
      return; // Don't allow re-running
    }

    let progress = null;
    const progressPath = this.sponsorCallProgressPath;

    // Check for incomplete ceremony
    if (this.hasIncompleteProgress(progressPath)) {
      progress = this.readProgress(progressPath);

      if (progress && progress.stage !== 'completed') {
        sendWarning('Found incomplete ceremony from previous session');
        sendIndented(`Last activity: ${new Date(progress.lastUpdate).toLocaleString()}`, 1);
        sendIndented(`Stage: ${progress.stage}`, 1);
        sendIndented(`Progress: ${progress.answeredQuestions || 0}/${progress.totalQuestions || 0} questions answered`, 1);
        sendOutput('');
        sendInfo('Continuing from where you left off...');
        sendOutput('');
      }
    } else {
      // Fresh start
      sendOutput('Starting Sponsor Call ceremony...');
      sendOutput('');
    }

    // Validate API key before starting ceremony
    const validationResult = await this.validateProviderApiKey();
    if (!validationResult.valid) {
      sendOutput('');
      sendError('API Key Validation Failed');
      sendOutput('');
      sendIndented(validationResult.message, 1);
      sendOutput('');
      return; // Don't exit in REPL mode
    }

    // Save initial progress
    if (!progress) {
      progress = {
        stage: 'questionnaire',
        totalQuestions: 5,
        answeredQuestions: 0,
        collectedValues: {},
        lastUpdate: new Date().toISOString()
      };
      this.writeProgress(progress, progressPath);
    }

    // Generate project document via Sponsor Call ceremony
    await this.generateProjectDocument(progress, progressPath, isReplMode);

    // Mark as completed and clean up
    progress.stage = 'completed';
    progress.lastUpdate = new Date().toISOString();
    this.writeProgress(progress, progressPath);
    this.clearProgress(progressPath);

    sendOutput('');
    sendSuccess('Project defined successfully!');
    sendOutput('');
    sendOutput('Next steps:');
    sendIndented('1. Review .avc/project/doc.md for your project definition', 1);
    sendIndented('2. Review .avc/avc.json configuration', 1);
    sendIndented('3. Create your project documentation and work items', 1);
    sendIndented('4. Use AI agents to implement features', 1);
  }

  /**
   * Display current project status
   */
  status() {
    fileLog('INFO', 'status() called', { projectRoot: this.projectRoot });

    const hasAvc = this.hasAvcFolder();
    const hasSrc = this.hasSrcFolder();
    const hasWorktrees = this.hasWorktreesFolder();
    const hasConfig = this.hasAvcConfig();
    const isInitialized = this.isAvcProject();
    const projectName = this.getProjectName();

    fileLog('DEBUG', 'Component check results', {
      '.avc/': hasAvc,
      'src/': hasSrc,
      'worktrees/': hasWorktrees,
      'avc.json': hasConfig,
      isAvcProject: isInitialized,
      projectName,
    });

    if (isInitialized) {
      sendOutput(`${projectName}: Initialized`);
      fileLog('INFO', 'status() complete — project is initialized');
    } else {
      fileLog('WARNING', 'Project not initialized — components missing', { hasAvc, hasConfig });
      sendOutput(`${projectName}: Not initialized. Run /init to start.`);
    }
  }

  /**
   * Remove AVC project structure (destructive operation)
   * Requires confirmation by typing "delete all"
   */
  async remove() {
    sendSectionHeader('Remove AVC Project Structure');
    sendOutput('');
    sendOutput(`Project directory: ${this.projectRoot}`);
    sendOutput('');

    // Check if project is initialized
    if (!this.isAvcProject()) {
      sendWarning('No AVC project found in this directory.');
      sendOutput('Nothing to remove.');
      sendOutput('');
      return;
    }

    // Show what will be deleted
    sendWarning('WARNING: This is a DESTRUCTIVE operation!');
    sendOutput('');
    sendOutput('The following will be PERMANENTLY DELETED:');
    sendOutput('');

    // List contents of .avc folder
    const avcContents = this.getAvcContents();
    if (avcContents.length > 0) {
      sendOutput('.avc/ folder contents:');
      sendOutput('');
      avcContents.forEach(item => {
        sendIndented(`• ${item}`, 1);
      });
      sendOutput('');
    }

    sendError('All project definitions, epics, stories, tasks, and documentation will be lost.');
    sendError('All VitePress documentation will be deleted.');
    sendError('This action CANNOT be undone.');
    sendOutput('');

    // Check for .env file
    const envPath = path.join(this.projectRoot, '.env');
    const hasEnvFile = fs.existsSync(envPath);
    if (hasEnvFile) {
      sendInfo('Note: The .env file will NOT be deleted.');
      sendOutput('You may want to manually remove API keys if no longer needed.');
      sendOutput('');
    }

    // Check for src folder
    const hasSrcFolder = this.hasSrcFolder();
    if (hasSrcFolder) {
      sendSuccess('IMPORTANT: The src/ folder will NOT be deleted.');
      sendOutput('All your AVC-managed code will be preserved.');
      sendOutput('');
    }

    // Check for worktrees folder
    const hasWorktreesFolder = this.hasWorktreesFolder();
    if (hasWorktreesFolder) {
      sendSuccess('IMPORTANT: The worktrees/ folder will NOT be deleted.');
      sendOutput('All your git worktrees will be preserved.');
      sendOutput('');
    }

    // Check if running in REPL mode
    const isReplMode = process.env.AVC_REPL_MODE === 'true';

    if (isReplMode) {
      // In REPL mode, interactive confirmation is handled by repl-ink.js
      // This code path shouldn't be reached from REPL
      sendWarning('Unexpected: Remove called directly from REPL');
      sendOutput('Interactive confirmation should be handled by REPL interface.');
      return;
    }

    sendOutput('─'.repeat(60));
    sendOutput('To confirm deletion, type exactly: delete all');
    sendOutput('To cancel, type anything else or press Ctrl+C');
    sendOutput('─'.repeat(60));
    sendOutput('');

    // Create readline interface for confirmation
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Confirmation: ', (answer) => {
        rl.close();
        sendOutput('');

        if (answer.trim() === 'delete all') {
          // Proceed with deletion
          sendOutput('Deleting AVC project structure...');
          sendOutput('');

          try {
            // Get list of what's being deleted before deletion
            const deletedItems = this.getAvcContents();

            // Delete .avc folder
            fs.rmSync(this.avcDir, { recursive: true, force: true });

            sendSuccess('Successfully deleted:');
            sendOutput('');
            sendOutput('.avc/ folder and all contents:');
            sendOutput('');
            deletedItems.forEach(item => {
              sendIndented(`• ${item}`, 3);
            });
            sendOutput('');

            // Reminder about preserved files
            if (hasEnvFile || hasSrcFolder || hasWorktreesFolder) {
              sendInfo('Preserved files:');
              sendOutput('');

              if (hasEnvFile) {
                sendOutput('The .env file was NOT deleted and still contains:');
                sendOutput('');
                sendIndented('• ANTHROPIC_API_KEY', 1);
                sendIndented('• GEMINI_API_KEY', 1);
                sendIndented('• OPENAI_API_KEY', 1);
                sendIndented('• (and any other API keys you added)', 1);
                sendOutput('If these API keys are not used elsewhere in your project,');
                sendOutput('you may want to manually delete the .env file or remove');
                sendOutput('the unused keys.');
                sendOutput('');
              }

              if (hasSrcFolder) {
                sendSuccess('The src/ folder was NOT deleted.');
                sendOutput('All your AVC-managed code has been preserved.');
                sendOutput('');
              }

              if (hasWorktreesFolder) {
                sendSuccess('The worktrees/ folder was NOT deleted.');
                sendOutput('All your git worktrees have been preserved.');
                sendOutput('');
              }
            }

            sendSuccess('AVC project structure has been completely removed.');
            sendOutput('You can re-initialize anytime by running /init');
            sendOutput('');

            resolve();
          } catch (error) {
            sendError(`Error during deletion: ${error.message}`);
            sendOutput('');
            sendOutput('The .avc folder may be partially deleted.');
            sendOutput('You may need to manually remove it.');
            sendOutput('');
            resolve();
          }
        } else {
          // Cancellation
          sendError('Operation cancelled.');
          sendOutput('No files were deleted.');
          sendOutput('');
          resolve();
        }
      });
    });
  }

  /**
   * Get list of contents in .avc folder for display
   */
  getAvcContents() {
    const contents = [];

    try {
      if (!fs.existsSync(this.avcDir)) {
        return contents;
      }

      // Read .avc directory
      const items = fs.readdirSync(this.avcDir);

      items.forEach(item => {
        const itemPath = path.join(this.avcDir, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          // Count items in subdirectories
          const subItems = this.countItemsRecursive(itemPath);
          contents.push(`${item}/ (${subItems} items)`);
        } else {
          contents.push(item);
        }
      });
    } catch (error) {
      // Ignore errors, return what we have
    }

    return contents;
  }

  /**
   * Save sponsor-call Q&A answers to avc.json and generate VitePress Q&A page.
   * Wrapped in try/catch — failures are non-fatal.
   */
  saveProjectBriefAnswers(answers) {
    try {
      // Normalize: CLI path has top-level keys; Kanban path may nest under .requirements
      const qa = answers.MISSION_STATEMENT ? answers : (answers.requirements || answers);

      // Read current avc.json and persist answers
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      if (!config.settings) config.settings = {};
      if (!config.settings.projectBrief) config.settings.projectBrief = {};
      config.settings.projectBrief.answers = {
        MISSION_STATEMENT: qa.MISSION_STATEMENT || null,
        TARGET_USERS: qa.TARGET_USERS || null,
        INITIAL_SCOPE: qa.INITIAL_SCOPE || null,
        DEPLOYMENT_TARGET: qa.DEPLOYMENT_TARGET || null,
        TECHNICAL_CONSIDERATIONS: qa.TECHNICAL_CONSIDERATIONS || null,
        TECHNICAL_EXCLUSIONS: qa.TECHNICAL_EXCLUSIONS || null,
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: qa.SECURITY_AND_COMPLIANCE_REQUIREMENTS || null,
      };
      config.settings.projectBrief.savedAt = new Date().toISOString();
      fs.writeFileSync(this.avcConfigPath, JSON.stringify(config, null, 2), 'utf8');

      fileLog('INFO', 'saveProjectBriefAnswers() — answers persisted to avc.json');

      this.generateQADocumentationPage(qa);
    } catch (error) {
      fileLog('WARN', 'saveProjectBriefAnswers() failed (non-fatal)', { error: error.message });
    }
  }

  /**
   * Generate .avc/documentation/questions-and-answers.md with the sponsor-call answers.
   * No-ops silently if the documentation directory doesn't exist yet.
   */
  generateQADocumentationPage(qa) {
    const docDir = path.join(this.avcDir, 'documentation');
    if (!fs.existsSync(docDir)) {
      fileLog('INFO', 'generateQADocumentationPage() — documentation dir not found, skipping');
      return;
    }

    const lines = ['# Questions & Answers', ''];
    lines.push('Sponsor-call questionnaire answers captured during project brief generation.', '');

    lines.push('## Mission Statement', '');
    lines.push(qa.MISSION_STATEMENT || '_Not provided._', '');

    lines.push('## Initial Scope', '');
    lines.push(qa.INITIAL_SCOPE || '_Not provided._', '');

    lines.push('## Target Users', '');
    lines.push(qa.TARGET_USERS || '_Not provided._', '');

    lines.push('## Deployment Target', '');
    lines.push(qa.DEPLOYMENT_TARGET || '_Not provided._', '');

    lines.push('## Technical Considerations', '');
    lines.push(qa.TECHNICAL_CONSIDERATIONS || '_Not provided._', '');

    if (qa.TECHNICAL_EXCLUSIONS) {
      lines.push('## Technical Exclusions', '');
      lines.push(qa.TECHNICAL_EXCLUSIONS, '');
    }

    lines.push('## Security & Compliance Requirements', '');
    lines.push(qa.SECURITY_AND_COMPLIANCE_REQUIREMENTS || '_Not provided._', '');

    const qaPath = path.join(docDir, 'questions-and-answers.md');
    fs.writeFileSync(qaPath, lines.join('\n'), 'utf8');

    fileLog('INFO', 'generateQADocumentationPage() — written', { qaPath });

    this.addQAToVitePressConfig();
  }

  /**
   * Insert "Questions & Answers" into the VitePress sidebar, immediately after "Project Brief".
   * Idempotent — skips if already present.
   */
  addQAToVitePressConfig() {
    const configPath = path.join(this.avcDir, 'documentation', '.vitepress', 'config.mts');
    if (!fs.existsSync(configPath)) {
      fileLog('INFO', 'addQAToVitePressConfig() — config.mts not found, skipping');
      return;
    }

    let content = fs.readFileSync(configPath, 'utf8');

    if (content.includes('questions-and-answers')) {
      fileLog('INFO', 'addQAToVitePressConfig() — already present, skipping');
      return;
    }

    // Insert after the Project Brief link line
    const projectBriefLine = "{ text: 'Project Brief', link: '/' }";
    const qaLine = "{ text: 'Questions & Answers', link: '/questions-and-answers' }";
    content = content.replace(
      projectBriefLine,
      `${projectBriefLine},\n          ${qaLine}`
    );

    fs.writeFileSync(configPath, content, 'utf8');
    fileLog('INFO', 'addQAToVitePressConfig() — sidebar updated', { configPath });
  }

  /**
   * Recursively count items in a directory
   */
  countItemsRecursive(dirPath) {
    let count = 0;

    try {
      const items = fs.readdirSync(dirPath);
      count += items.length;

      items.forEach(item => {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          count += this.countItemsRecursive(itemPath);
        }
      });
    } catch (error) {
      // Ignore errors
    }

    return count;
  }
}

// Export for use in REPL
export { ProjectInitiator };

// CLI execution (only when run directly, not when imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'init';
  const initiator = new ProjectInitiator();

  switch (command) {
    case 'init':
      initiator.init();
      break;
    case 'sponsor-call':
      initiator.sponsorCall();
      break;
    case 'status':
      initiator.status();
      break;
    case 'models':
      initiator.models();
      break;
    case 'remove':
      initiator.remove();
      break;
    default:
      sendError('Unknown command. Available commands: init, sponsor-call, status, models, remove');
      process.exit(1);
  }
}
