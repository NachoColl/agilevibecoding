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
    this.avcConfigPath = path.join(this.avcDir, 'avc.json');
    // Progress files are ceremony-specific
    this.initProgressPath = path.join(this.avcDir, 'init-progress.json');
    this.sponsorCallProgressPath = path.join(this.avcDir, 'sponsor-call-progress.json');

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
            agents: [
              {
                name: 'project-documentation-creator',
                instruction: 'project-documentation-creator.md',
                stage: 'enhancement'
              },
              {
                name: 'project-context-generator',
                instruction: 'project-context-generator.md',
                stage: 'project-context-generation'
              }
            ],
            guidelines: {
              technicalConsiderations: 'Use AWS serverless stack with Lambda functions for compute, API Gateway for REST APIs, DynamoDB for database, S3 for storage. Use CloudFormation for infrastructure definition and AWS CodePipeline/CodeBuild for CI/CD deployment.'
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
        ]
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
   */
  createEnvFile() {
    const envPath = path.join(this.projectRoot, '.env');

    if (!fs.existsSync(envPath)) {
      const envContent = `# Anthropic API Key for AI-powered Sponsor Call ceremony
# Get your key at: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=

# Google Gemini API Key (alternative LLM provider)
# Get your key at: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=
`;
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('✓ Created .env file for API keys');
      return true;
    }
    console.log('✓ .env file already exists');
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
      { pattern: '.avc/token-history.json', comment: 'Token usage tracking' }
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
   * Create VitePress documentation setup
   */
  createVitePressSetup() {
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

    // Update package.json with VitePress scripts
    this.updatePackageJsonForVitePress();
  }

  /**
   * Update package.json with VitePress dependencies and scripts
   */
  updatePackageJsonForVitePress() {
    const packagePath = path.join(this.projectRoot, 'package.json');

    let packageJson;
    if (fs.existsSync(packagePath)) {
      packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    } else {
      packageJson = {
        name: this.getProjectName(),
        version: '1.0.0',
        private: true
      };
    }

    // Add scripts
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    const scriptsToAdd = {
      'docs:dev': 'vitepress dev .avc/documentation',
      'docs:build': 'vitepress build .avc/documentation',
      'docs:preview': 'vitepress preview .avc/documentation'
    };

    let addedScripts = [];
    for (const [name, command] of Object.entries(scriptsToAdd)) {
      if (!packageJson.scripts[name]) {
        packageJson.scripts[name] = command;
        addedScripts.push(name);
      }
    }

    // Add devDependencies
    if (!packageJson.devDependencies) {
      packageJson.devDependencies = {};
    }

    let addedDeps = false;
    if (!packageJson.devDependencies.vitepress) {
      packageJson.devDependencies.vitepress = '^1.6.4';
      addedDeps = true;
    }

    // Write package.json
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

    if (addedScripts.length > 0 || addedDeps) {
      console.log('✓ Updated package.json with VitePress configuration');
      if (addedScripts.length > 0) {
        console.log(`  Added scripts: ${addedScripts.join(', ')}`);
      }
      if (addedDeps) {
        console.log('  Added devDependency: vitepress');
      }
    } else {
      console.log('✓ package.json already has VitePress configuration');
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

    // Read provider config from avc.json
    const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
    const ceremony = config.settings?.ceremonies?.[0];

    if (!ceremony) {
      return {
        valid: false,
        message: 'No ceremonies configured in .avc/avc.json.\n   Please check your configuration.'
      };
    }

    const providerName = ceremony.provider || 'claude';
    const modelName = ceremony.defaultModel || 'claude-sonnet-4-5-20250929';

    // Check which env var is required
    const envVarMap = {
      'claude': 'ANTHROPIC_API_KEY',
      'gemini': 'GEMINI_API_KEY'
    };

    const requiredEnvVar = envVarMap[providerName];
    if (!requiredEnvVar) {
      return {
        valid: false,
        message: `Unknown provider "${providerName}".\n   Supported providers: claude, gemini`
      };
    }

    // Check if API key is set in environment
    if (!process.env[requiredEnvVar]) {
      return {
        valid: false,
        message: `${requiredEnvVar} not found in .env file.\n\n   Steps to fix:\n   1. Open .env file in the current directory\n   2. Add your API key: ${requiredEnvVar}=your-key-here\n   3. Save the file and run /init again\n\n   Get your API key:\n   ${providerName === 'claude' ? '• https://console.anthropic.com/settings/keys' : '• https://aistudio.google.com/app/apikey'}`
      };
    }

    console.log(`\n🔑 Validating ${providerName} API key...`);

    // Test the API key with a minimal call
    let result;
    try {
      result = await LLMProvider.validate(providerName, modelName);
    } catch (error) {
      return {
        valid: false,
        message: `${requiredEnvVar} validation failed.\n\n   Error: ${error.message}\n\n   This could be due to:\n   • Network connectivity issues\n   • API service temporarily unavailable\n   • Invalid API key\n\n   Please check your connection and try again.`
      };
    }

    if (!result.valid) {
      const errorMsg = result.error || 'Unknown error';
      return {
        valid: false,
        message: `${requiredEnvVar} is set but API call failed.\n\n   Error: ${errorMsg}\n\n   Steps to fix:\n   1. Verify your API key is correct in .env file\n   2. Check that the key has not expired\n   3. Ensure you have API credits/quota available\n\n   Get a new API key if needed:\n   ${providerName === 'claude' ? '• https://console.anthropic.com/settings/keys' : '• https://aistudio.google.com/app/apikey'}`
      };
    }

    console.log(`✓ API key validated successfully\n`);
    return { valid: true };
  }

  /**
   * Generate project document via Sponsor Call ceremony
   */
  async generateProjectDocument(progress = null, progressPath = null, nonInteractive = false) {
    const processor = new TemplateProcessor('sponsor-call', progressPath || this.sponsorCallProgressPath, nonInteractive);
    await processor.processTemplate(progress);
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
      this.createAvcConfig();
      this.createEnvFile();
      this.addToGitignore();
      this.createVitePressSetup();
    } finally {
      console.log = originalLog;
    }

    console.log('\n✅ AVC project initialized!\n');
    console.log('Next steps:');
    console.log('  1. Add your API key(s) to .env file');
    console.log('     • ANTHROPIC_API_KEY for Claude');
    console.log('     • GEMINI_API_KEY for Gemini');
    console.log('  2. Run /sponsor-call to start\n');
  }

  /**
   * Run Sponsor Call ceremony with pre-filled answers from REPL questionnaire
   * Used when all answers are collected via REPL UI
   */
  async sponsorCallWithAnswers(answers) {
    console.log('\n🎯 Sponsor Call Ceremony\n');
    console.log(`Project directory: ${this.projectRoot}\n`);

    // Check if project is initialized
    if (!this.isAvcProject()) {
      console.log('❌ Project not initialized\n');
      console.log('   Please run /init first to create the project structure.\n');
      return;
    }

    const progressPath = this.sponsorCallProgressPath;

    console.log('Starting Sponsor Call ceremony with provided answers...\n');

    // Count answers provided
    const answeredCount = Object.values(answers).filter(v => v !== null && v !== '').length;
    console.log(`📊 Received ${answeredCount}/5 answers from questionnaire\n`);

    // Validate API key before starting ceremony
    console.log('Step 1/3: Validating API configuration...');
    const validationResult = await this.validateProviderApiKey();
    if (!validationResult.valid) {
      console.log('\n❌ API Key Validation Failed\n');
      console.log(`   ${validationResult.message}\n`);
      return;
    }

    // Create progress with pre-filled answers
    console.log('Step 2/3: Processing questionnaire answers...');
    const progress = {
      stage: 'questionnaire',
      totalQuestions: 5,
      answeredQuestions: 5,
      collectedValues: answers,
      lastUpdate: new Date().toISOString()
    };
    this.writeProgress(progress, progressPath);

    // Generate project document with pre-filled answers
    console.log('Step 3/3: Generating project document...');
    await this.generateProjectDocument(progress, progressPath, true); // nonInteractive = true

    // Mark as completed and clean up
    progress.stage = 'completed';
    progress.lastUpdate = new Date().toISOString();
    this.writeProgress(progress, progressPath);
    this.clearProgress(progressPath);

    console.log('\n✅ Project defined successfully!');
    console.log('\nNext steps:');
    console.log('  1. Review .avc/project/doc.md for your project definition');
    console.log('  2. Review .avc/avc.json configuration');
  }

  /**
   * Run Project Expansion ceremony to create/expand Epics and Stories
   */
  async projectExpansion() {
    console.log('\n🚀 Starting Project Expansion ceremony...\n');

    if (!this.isAvcProject()) {
      console.log('❌ Project not initialized\n');
      console.log('   Please run /init first.\n');
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
      console.log('   Please run /init first.\n');
      return;
    }

    if (!storyId) {
      console.log('❌ Story ID required\n');
      console.log('   Usage: /seed <story-id>\n');
      console.log('   Example: /seed context-0001-0001\n');
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
      console.log('   Please run /init first to create the project structure.\n');
      return; // Don't exit in REPL mode
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
    console.log(`  .avc/ folder:   ${this.hasAvcFolder() ? '✓' : '✗'}`);
    console.log(`  avc.json:       ${this.hasAvcConfig() ? '✓' : '✗'}`);

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
      console.log('   You may want to manually remove API keys if no longer needed.\n');
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
            console.log('   📁 .avc/ folder and all contents:');
            deletedItems.forEach(item => {
              console.log(`      • ${item}`);
            });
            console.log('');

            // Reminder about .env file
            if (hasEnvFile) {
              console.log('ℹ️  Manual cleanup reminder:\n');
              console.log('   The .env file was NOT deleted and still contains:');
              console.log('   • ANTHROPIC_API_KEY');
              console.log('   • GEMINI_API_KEY');
              console.log('   • (and any other API keys you added)\n');
              console.log('   If these API keys are not used elsewhere in your project,');
              console.log('   you may want to manually delete the .env file or remove');
              console.log('   the unused keys.\n');
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
