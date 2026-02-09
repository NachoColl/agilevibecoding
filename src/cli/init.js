#!/usr/bin/env node

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { TemplateProcessor } from './template-processor.js';

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
      console.log('✓ Created .avc/ folder');
      return true;
    }
    console.log('✓ .avc/ folder already exists');
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
      console.log('✓ Created src/ folder (for AVC-managed code)');
      return true;
    }
    console.log('✓ src/ folder already exists');
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
      console.log('✓ Created worktrees/ folder (for git worktrees)');
      return true;
    }
    console.log('✓ worktrees/ folder already exists');
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
        contextScopes: ['epic', 'story', 'task', 'subtask'],
        workItemStatuses: ['ready', 'pending', 'implementing', 'implemented', 'testing', 'completed', 'blocked', 'feedback'],
        agentTypes: ['product-owner', 'server', 'client', 'infrastructure', 'testing'],
        documentation: {
          port: 4173
        },
        ceremonies: [
          {
            name: 'sponsor-call',
            provider: 'claude',
            defaultModel: 'claude-sonnet-4-5-20250929',
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
            },
            agents: [
              {
                name: 'project-documentation-creator',
                instruction: 'project-documentation-creator.md',
                stage: 'documentation-generation'
              },
              {
                name: 'project-context-generator',
                instruction: 'project-context-generator.md',
                stage: 'context-generation'
              },
              {
                name: 'validator-documentation',
                instruction: 'validator-documentation.md',
                stage: 'documentation-validation',
                group: 'validators'
              },
              {
                name: 'validator-context',
                instruction: 'validator-context.md',
                stage: 'context-validation',
                group: 'validators'
              }
            ],
            validation: {
              enabled: true,
              maxIterations: 2,
              acceptanceThreshold: 75,
              skipOnCriticalIssues: false,
              provider: 'gemini',
              model: 'gemini-2.5-pro',
              documentation: {
                provider: 'gemini',
                model: 'gemini-2.5-pro'
              },
              context: {
                provider: 'gemini',
                model: 'gemini-2.5-pro'
              }
            }
          },
          {
            name: 'project-expansion',
            provider: 'claude',
            defaultModel: 'claude-sonnet-4-5-20250929',
            agents: [
              {
                name: 'epic-story-decomposer',
                instruction: 'epic-story-decomposer.md',
                stage: 'decomposition'
              },
              {
                name: 'feature-context-generator',
                instruction: 'feature-context-generator.md',
                stage: 'context-generation'
              }
            ]
          },
          {
            name: 'context-retrospective',
            provider: 'claude',
            defaultModel: 'claude-sonnet-4-5-20250929',
            agents: [
              {
                name: 'documentation-updater',
                instruction: 'documentation-updater.md',
                stage: 'documentation-update'
              },
              {
                name: 'context-refiner',
                instruction: 'context-refiner.md',
                stage: 'context-refinement'
              }
            ]
          },
          {
            name: 'seed',
            provider: 'claude',
            defaultModel: 'claude-sonnet-4-5-20250929',
            agents: [
              {
                name: 'task-subtask-decomposer',
                instruction: 'task-subtask-decomposer.md',
                stage: 'decomposition'
              },
              {
                name: 'feature-context-generator',
                instruction: 'feature-context-generator.md',
                stage: 'context-generation'
              }
            ]
          }
        ],
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
          'claude-sonnet-4-5-20250929': {
            provider: 'claude',
            displayName: 'Claude Sonnet 4.5',
            pricing: {
              input: 3.00,      // $3 per 1M tokens
              output: 15.00,    // $15 per 1M tokens
              unit: 'million'   // per million tokens
            }
          },
          'claude-3-5-haiku-20241022': {
            provider: 'claude',
            displayName: 'Claude Haiku 3.5',
            pricing: {
              input: 1.00,
              output: 5.00,
              unit: 'million'
            }
          },
          'claude-opus-4-5-20250929': {
            provider: 'claude',
            displayName: 'Claude Opus 4.5',
            pricing: {
              input: 5.00,
              output: 25.00,
              unit: 'million'
            }
          },

          // Google Gemini models (prices per 1M tokens in USD)
          'gemini-2.5-flash': {
            provider: 'gemini',
            displayName: 'Gemini 2.5 Flash',
            pricing: {
              input: 0.15,
              output: 0.60,
              unit: 'million'
            }
          },
          'gemini-2.5-flash-lite': {
            provider: 'gemini',
            displayName: 'Gemini 2.5 Flash-Lite',
            pricing: {
              input: 0.10,
              output: 0.40,
              unit: 'million'
            }
          },
          'gemini-2.5-pro': {
            provider: 'gemini',
            displayName: 'Gemini 2.5 Pro',
            pricing: {
              input: 1.25,
              output: 5.00,
              unit: 'million'
            }
          },

          // OpenAI models (prices per 1M tokens in USD)
          'gpt-5.2-chat-latest': {
            provider: 'openai',
            displayName: 'GPT-5.2 Instant',
            pricing: {
              input: 1.75,
              output: 14.00,
              unit: 'million'
            }
          },
          'gpt-5.2': {
            provider: 'openai',
            displayName: 'GPT-5.2 Thinking',
            pricing: {
              input: 1.75,
              output: 14.00,
              unit: 'million'
            }
          },
          'gpt-5.2-pro': {
            provider: 'openai',
            displayName: 'GPT-5.2 Pro',
            pricing: {
              input: 1.75,
              output: 14.00,
              unit: 'million'
            }
          },
          'o3-mini': {
            provider: 'openai',
            displayName: 'o3-mini',
            pricing: {
              input: 0.50,
              output: 2.00,
              unit: 'million'
            }
          },
          'gpt-5.3-codex': {
            provider: 'openai',
            displayName: 'GPT-5.3-Codex',
            pricing: {
              input: 2.00,
              output: 16.00,
              unit: 'million'
            }
          },
          'gpt-5.2-codex': {
            provider: 'openai',
            displayName: 'GPT-5.2-Codex',
            pricing: {
              input: 1.75,
              output: 14.00,
              unit: 'million'
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
      console.log('✓ Created .avc/avc.json configuration file');
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
        console.log('✓ Updated .avc/avc.json with new configuration attributes');
        return true;
      }

      console.log('✓ .avc/avc.json is up to date');
      return false;
    } catch (error) {
      console.error(`⚠️  Warning: Could not merge avc.json: ${error.message}`);
      console.log('✓ .avc/avc.json already exists (merge skipped)');
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
      console.log('✓ Created .env file for API keys');
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
      console.log(`✓ Added ${missingKeys.length} missing API key variable(s) to .env file:`);
      missingKeys.forEach(key => console.log(`   • ${key}`));
      return true;
    }

    console.log('✓ .env file already exists with all API key variables');
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
      console.log(`✓ Added to .gitignore: ${addedItems.join(', ')}`);
    } else {
      console.log('✓ .gitignore already up to date');
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
      console.log('✓ Created .avc/documentation/.vitepress/ folder');
    } else {
      console.log('✓ .avc/documentation/.vitepress/ folder already exists');
    }

    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
      console.log('✓ Created .avc/documentation/public/ folder');
    } else {
      console.log('✓ .avc/documentation/public/ folder already exists');
    }

    // Create VitePress config
    const configPath = path.join(vitepressDir, 'config.mts');
    if (!fs.existsSync(configPath)) {
      const templatePath = path.join(__dirname, 'templates/vitepress-config.mts.template');
      let configContent = fs.readFileSync(templatePath, 'utf8');
      configContent = configContent.replace('{{PROJECT_NAME}}', this.getProjectName());
      fs.writeFileSync(configPath, configContent, 'utf8');
      console.log('✓ Created .avc/documentation/.vitepress/config.mts');
    } else {
      console.log('✓ .avc/documentation/.vitepress/config.mts already exists');
    }

    // Create initial index.md
    const indexPath = path.join(docsDir, 'index.md');
    if (!fs.existsSync(indexPath)) {
      const indexContent = `# ${this.getProjectName()}

## Project Status

This project is being developed using the [Agile Vibe Coding](https://agilevibecoding.org) framework.

**Current Stage**: Initial Setup

Project documentation will be generated automatically as the project is defined and developed.

## About This Documentation

This site provides comprehensive documentation about **${this.getProjectName()}**, including:

- Project overview and objectives
- Feature specifications organized by epics and stories
- Technical architecture and design decisions
- Implementation progress and status

Documentation is automatically updated from the AVC project structure as development progresses.

## Getting Started with AVC

If you're new to Agile Vibe Coding, visit the [AVC Documentation](https://agilevibecoding.org) to learn about:

- [CLI Commands](https://agilevibecoding.org/commands) - Available commands and their usage
- [Installation Guide](https://agilevibecoding.org/install) - Setup instructions
- [Framework Overview](https://agilevibecoding.org) - Core concepts and workflow

---

*Documentation powered by [Agile Vibe Coding](https://agilevibecoding.org)*
`;
      fs.writeFileSync(indexPath, indexContent, 'utf8');
      console.log('✓ Created .avc/documentation/index.md');
    } else {
      console.log('✓ .avc/documentation/index.md already exists');
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
    const mainModel = ceremony.defaultModel || 'claude-sonnet-4-5-20250929';

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
  async generateProjectDocument(progress = null, progressPath = null, nonInteractive = false, progressCallback = null) {
    const processor = new TemplateProcessor('sponsor-call', progressPath || this.sponsorCallProgressPath, nonInteractive);

    // Set progress callback if provided
    if (progressCallback) {
      processor.setProgressCallback(progressCallback);
    }

    const result = await processor.processTemplate(progress);

    // Store processor for token usage retrieval
    this._lastTemplateProcessor = processor;

    return result;
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
    console.log('\n🚀 AVC Project Initiator\n');
    console.log(`Project directory: ${this.projectRoot}\n`);

    if (this.isAvcProject()) {
      // Project already initialized
      console.log('✓ AVC project already initialized');
      console.log('\nProject is ready to use.');
      return;
    }

    // Suppress all console output during initialization
    const originalLog = console.log;
    console.log = () => {};

    try {
      // Create project structure silently
      this.createAvcFolder();
      this.createSrcFolder();
      this.createWorktreesFolder();
      this.createAvcConfig();
      this.createEnvFile();
      this.addToGitignore();
      this.createVitePressStructure();
    } finally {
      console.log = originalLog;
    }

    console.log('\n✅ AVC project initialized!\n');
    console.log('Next steps:');
    console.log('  1. Add your API key(s) to .env file');
    console.log('     • ANTHROPIC_API_KEY for Claude');
    console.log('     • GEMINI_API_KEY for Gemini');
    console.log('     • OPENAI_API_KEY for OpenAI');
    console.log('  2. Run /sponsor-call to start\n');
  }

  /**
   * Run Sponsor Call ceremony with pre-filled answers from REPL questionnaire
   * Used when all answers are collected via REPL UI
   */
  async sponsorCallWithAnswers(answers, progressCallback = null) {
    // Remove initial ceremony banner - will be shown in summary

    // Check if project is initialized
    if (!this.isAvcProject()) {
      console.log('❌ Project not initialized\n');
      console.log('Please run /init first to create the project structure.\n');
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

    // Validate API key before starting ceremony
    const validationResult = await this.validateProviderApiKey();
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
      const result = await this.generateProjectDocument(progress, progressPath, true, progressCallback);

      // Get token usage from template processor
      const tokenUsage = this.getLastTokenUsage();

      // Get model ID from ceremony config
      const ceremony = this.readCeremonyConfig('sponsor-call');
      const modelId = ceremony?.defaultModel || 'claude-sonnet-4-5-20250929';

      // Calculate cost using token tracker
      const { TokenTracker } = await import('./token-tracker.js');
      const tracker = new TokenTracker(this.avcDir);
      const cost = tracker.calculateCost(
        tokenUsage?.inputTokens || 0,
        tokenUsage?.outputTokens || 0,
        modelId
      );

      // Mark execution as completed with metadata
      history.completeExecution('sponsor-call', executionId, 'success', {
        answers,
        filesGenerated: [
          path.join(this.avcDir, 'project/doc.md'),
          path.join(this.avcDir, 'project/context.md')
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
      progress.stage = 'completed';
      progress.lastUpdate = new Date().toISOString();
      this.writeProgress(progress, progressPath);
      this.clearProgress(progressPath);

      // Return result for display in REPL
      return result;

    } catch (error) {
      // Mark execution as aborted on error
      history.completeExecution('sponsor-call', executionId, 'abrupt-termination', {
        answers,
        stage: 'llm-generation',
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Display token usage statistics and costs
   */
  async showTokenStats() {
    console.log('\n📊 Token Usage Statistics\n');

    const { TokenTracker } = await import('./token-tracker.js');
    const tracker = new TokenTracker(this.avcDir);
    tracker.init();
    tracker.load();

    const data = tracker.data;

    // All-time totals
    const allTime = data.totals.allTime;
    console.log('All-Time Totals:');
    console.log(`   Input Tokens: ${allTime.input.toLocaleString()}`);
    console.log(`   Output Tokens: ${allTime.output.toLocaleString()}`);
    console.log(`   Total Tokens: ${allTime.total.toLocaleString()}`);
    console.log(`   Executions: ${allTime.executions}`);

    if (allTime.cost && allTime.cost.total > 0) {
      console.log(`\n💰 Estimated Total Cost:`);
      console.log(`   Input: $${allTime.cost.input.toFixed(4)}`);
      console.log(`   Output: $${allTime.cost.output.toFixed(4)}`);
      console.log(`   Total: $${allTime.cost.total.toFixed(4)}`);
    }

    // Show breakdown by ceremony type
    console.log(`\n📋 By Ceremony Type:`);
    const ceremonyTypes = Object.keys(data).filter(k => !['version', 'lastUpdated', 'totals'].includes(k));

    for (const ceremonyType of ceremonyTypes) {
      const ceremony = data[ceremonyType];
      if (ceremony.allTime && ceremony.allTime.executions > 0) {
        console.log(`\n   ${ceremonyType}:`);
        console.log(`      Executions: ${ceremony.allTime.executions}`);
        console.log(`      Tokens: ${ceremony.allTime.total.toLocaleString()}`);
        if (ceremony.allTime.cost && ceremony.allTime.cost.total > 0) {
          console.log(`      Cost: $${ceremony.allTime.cost.total.toFixed(4)}`);
        }
      }
    }

    console.log('');
  }

  /**
   * Run Project Expansion ceremony to create/expand Epics and Stories
   */
  async projectExpansion() {
    console.log('\n🚀 Starting Project Expansion ceremony...\n');

    if (!this.isAvcProject()) {
      console.log('❌ Project not initialized\n');
      console.log('Please run /init first.\n');
      return;
    }

    const { ProjectExpansionProcessor } = await import('./project-expansion-processor.js');
    const processor = new ProjectExpansionProcessor();
    await processor.execute();
  }

  /**
   * Run Seed ceremony to decompose a Story into Tasks and Subtasks
   * @param {string} storyId - Story ID (e.g., context-0001-0001)
   */
  async seed(storyId) {
    console.log(`\n🌱 Seeding Story: ${storyId}\n`);

    if (!this.isAvcProject()) {
      console.log('❌ Project not initialized\n');
      console.log('Please run /init first.\n');
      return;
    }

    if (!storyId) {
      console.log('❌ Story ID required\n');
      console.log('Usage: /seed <story-id>\n');
      console.log('Example: /seed context-0001-0001\n');
      return;
    }

    const { SeedProcessor } = await import('./seed-processor.js');
    const processor = new SeedProcessor(storyId);
    await processor.execute();
  }

  /**
   * Run Sponsor Call ceremony to define project with AI assistance
   * Requires API keys to be configured in .env file
   */
  async sponsorCall() {
    console.log('\n🎯 Sponsor Call Ceremony\n');
    console.log(`Project directory: ${this.projectRoot}\n`);

    // Check if running in REPL mode
    const isReplMode = process.env.AVC_REPL_MODE === 'true';
    if (isReplMode) {
      // REPL mode is handled by repl-ink.js questionnaire display
      // This code path shouldn't be reached from REPL
      console.log('⚠️  Unexpected: Ceremony called directly from REPL');
      return;
    }

    // Check if project is initialized
    if (!this.isAvcProject()) {
      console.log('❌ Project not initialized\n');
      console.log('Please run /init first to create the project structure.\n');
      return; // Don't exit in REPL mode
    }

    // Check if sponsor call has already completed successfully
    const { CeremonyHistory } = await import('./ceremony-history.js');
    const history = new CeremonyHistory(this.avcDir);

    if (history.hasSuccessfulCompletion('sponsor-call')) {
      console.log('❌ Sponsor Call has already completed successfully\n');
      console.log('Project documentation already exists at .avc/project/doc.md\n');
      console.log('To regenerate documentation, first run /remove to clear the project,');
      console.log('then run /init followed by /sponsor-call again.\n');
      return; // Don't allow re-running
    }

    let progress = null;
    const progressPath = this.sponsorCallProgressPath;

    // Check for incomplete ceremony
    if (this.hasIncompleteProgress(progressPath)) {
      progress = this.readProgress(progressPath);

      if (progress && progress.stage !== 'completed') {
        console.log('⚠️  Found incomplete ceremony from previous session');
        console.log(`   Last activity: ${new Date(progress.lastUpdate).toLocaleString()}`);
        console.log(`   Stage: ${progress.stage}`);
        console.log(`   Progress: ${progress.answeredQuestions || 0}/${progress.totalQuestions || 0} questions answered`);
        console.log('\n▶️  Continuing from where you left off...\n');
      }
    } else {
      // Fresh start
      console.log('Starting Sponsor Call ceremony...\n');
    }

    // Validate API key before starting ceremony
    const validationResult = await this.validateProviderApiKey();
    if (!validationResult.valid) {
      console.log('\n❌ API Key Validation Failed\n');
      console.log(`   ${validationResult.message}\n`);
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

    console.log('\n✅ Project defined successfully!');
    console.log('\nNext steps:');
    console.log('  1. Review .avc/project/doc.md for your project definition');
    console.log('  2. Review .avc/avc.json configuration');
    console.log('  3. Create your project context and work items');
    console.log('  4. Use AI agents to implement features');
  }

  /**
   * Display current project status
   */
  status() {
    console.log('\n📊 AVC Project Status\n');
    console.log(`Project directory: ${this.projectRoot}`);
    console.log(`Project name: ${this.getProjectName()}\n`);

    console.log('Components:');
    console.log(`  .avc/ folder:      ${this.hasAvcFolder() ? '✓' : '✗'}`);
    console.log(`  src/ folder:       ${this.hasSrcFolder() ? '✓' : '✗'}`);
    console.log(`  worktrees/ folder: ${this.hasWorktreesFolder() ? '✓' : '✗'}`);
    console.log(`  avc.json:          ${this.hasAvcConfig() ? '✓' : '✗'}`);

    console.log(`\nStatus: ${this.isAvcProject() ? '✅ Initialized' : '⚠️  Not initialized'}`);

    if (!this.isAvcProject()) {
      console.log('\nRun "avc init" to initialize the project.');
    }
  }

  /**
   * Remove AVC project structure (destructive operation)
   * Requires confirmation by typing "delete all"
   */
  async remove() {
    console.log('\n🗑️  Remove AVC Project Structure\n');
    console.log(`Project directory: ${this.projectRoot}\n`);

    // Check if project is initialized
    if (!this.isAvcProject()) {
      console.log('⚠️  No AVC project found in this directory.\n');
      console.log('Nothing to remove.\n');
      return;
    }

    // Show what will be deleted
    console.log('⚠️  WARNING: This is a DESTRUCTIVE operation!\n');
    console.log('The following will be PERMANENTLY DELETED:\n');

    // List contents of .avc folder
    const avcContents = this.getAvcContents();
    if (avcContents.length > 0) {
      console.log('📁 .avc/ folder contents:');
      avcContents.forEach(item => {
        console.log(`   • ${item}`);
      });
      console.log('');
    }

    console.log('❌ All project definitions, epics, stories, tasks, and documentation will be lost.');
    console.log('❌ All VitePress documentation will be deleted.');
    console.log('❌ This action CANNOT be undone.\n');

    // Check for .env file
    const envPath = path.join(this.projectRoot, '.env');
    const hasEnvFile = fs.existsSync(envPath);
    if (hasEnvFile) {
      console.log('ℹ️  Note: The .env file will NOT be deleted.');
      console.log('You may want to manually remove API keys if no longer needed.\n');
    }

    // Check for src folder
    const hasSrcFolder = this.hasSrcFolder();
    if (hasSrcFolder) {
      console.log('✅ IMPORTANT: The src/ folder will NOT be deleted.');
      console.log('All your AVC-managed code will be preserved.\n');
    }

    // Check for worktrees folder
    const hasWorktreesFolder = this.hasWorktreesFolder();
    if (hasWorktreesFolder) {
      console.log('✅ IMPORTANT: The worktrees/ folder will NOT be deleted.');
      console.log('All your git worktrees will be preserved.\n');
    }

    // Check if running in REPL mode
    const isReplMode = process.env.AVC_REPL_MODE === 'true';

    if (isReplMode) {
      // In REPL mode, interactive confirmation is handled by repl-ink.js
      // This code path shouldn't be reached from REPL
      console.log('⚠️  Unexpected: Remove called directly from REPL');
      console.log('Interactive confirmation should be handled by REPL interface.');
      return;
    }

    console.log('─'.repeat(60));
    console.log('To confirm deletion, type exactly: delete all');
    console.log('To cancel, type anything else or press Ctrl+C');
    console.log('─'.repeat(60));
    console.log('');

    // Create readline interface for confirmation
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Confirmation: ', (answer) => {
        rl.close();
        console.log('');

        if (answer.trim() === 'delete all') {
          // Proceed with deletion
          console.log('🗑️  Deleting AVC project structure...\n');

          try {
            // Get list of what's being deleted before deletion
            const deletedItems = this.getAvcContents();

            // Delete .avc folder
            fs.rmSync(this.avcDir, { recursive: true, force: true });

            console.log('✅ Successfully deleted:\n');
            console.log('📁 .avc/ folder and all contents:');
            deletedItems.forEach(item => {
              console.log(`      • ${item}`);
            });
            console.log('');

            // Reminder about preserved files
            if (hasEnvFile || hasSrcFolder || hasWorktreesFolder) {
              console.log('ℹ️  Preserved files:\n');

              if (hasEnvFile) {
                console.log('The .env file was NOT deleted and still contains:');
                console.log('   • ANTHROPIC_API_KEY');
                console.log('   • GEMINI_API_KEY');
                console.log('   • OPENAI_API_KEY');
                console.log('   • (and any other API keys you added)');
                console.log('If these API keys are not used elsewhere in your project,');
                console.log('you may want to manually delete the .env file or remove');
                console.log('the unused keys.\n');
              }

              if (hasSrcFolder) {
                console.log('✅ The src/ folder was NOT deleted.');
                console.log('All your AVC-managed code has been preserved.\n');
              }

              if (hasWorktreesFolder) {
                console.log('✅ The worktrees/ folder was NOT deleted.');
                console.log('All your git worktrees have been preserved.\n');
              }
            }

            console.log('✅ AVC project structure has been completely removed.\n');
            console.log('You can re-initialize anytime by running /init\n');

            resolve();
          } catch (error) {
            console.log(`❌ Error during deletion: ${error.message}\n`);
            console.log('The .avc folder may be partially deleted.');
            console.log('You may need to manually remove it.\n');
            resolve();
          }
        } else {
          // Cancellation
          console.log('❌ Operation cancelled.\n');
          console.log('No files were deleted.\n');
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
    case 'remove':
      initiator.remove();
      break;
    default:
      console.log('Unknown command. Available commands: init, sponsor-call, status, remove');
      process.exit(1);
  }
}
