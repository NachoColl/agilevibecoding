#!/usr/bin/env node

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
    this.progressPath = path.join(this.avcDir, 'init-progress.json');
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
        ceremonies: [
          {
            name: 'sponsor-call',
            defaultModel: 'claude-sonnet-4-5-20250929',
            provider: 'claude',
            guidelines: {
              technicalConsiderations: 'Use AWS serverless stack with Lambda functions for compute, API Gateway for REST APIs, DynamoDB for database, S3 for storage. Use CloudFormation for infrastructure definition and AWS CodePipeline/CodeBuild for CI/CD deployment.'
            }
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

    // Check if .env is already in .gitignore
    if (gitignoreContent.includes('.env')) {
      console.log('✓ .env already in .gitignore');
      return;
    }

    // Add .env to .gitignore
    const newContent = gitignoreContent
      ? `${gitignoreContent}\n# Environment variables\n.env\n`
      : '# Environment variables\n.env\n';

    fs.writeFileSync(gitignorePath, newContent, 'utf8');
    console.log('✓ Added .env to .gitignore');
  }

  /**
   * Check if there's an incomplete init in progress
   */
  hasIncompleteInit() {
    return fs.existsSync(this.progressPath);
  }

  /**
   * Read progress from file
   */
  readProgress() {
    try {
      const content = fs.readFileSync(this.progressPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Write progress to file
   */
  writeProgress(progress) {
    if (!fs.existsSync(this.avcDir)) {
      fs.mkdirSync(this.avcDir, { recursive: true });
    }
    fs.writeFileSync(this.progressPath, JSON.stringify(progress, null, 2), 'utf8');
  }

  /**
   * Clear progress file (init completed successfully)
   */
  clearProgress() {
    if (fs.existsSync(this.progressPath)) {
      fs.unlinkSync(this.progressPath);
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
  async generateProjectDocument(progress = null) {
    const processor = new TemplateProcessor(this.progressPath);
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

    console.log('Initializing AVC project structure...\n');

    // Create .avc folder
    this.createAvcFolder();

    // Create or update avc.json
    this.createAvcConfig();

    // Create .env file for API keys (if it doesn't exist)
    this.createEnvFile();

    // Add .env to .gitignore if git repository
    this.addToGitignore();

    console.log('\n✅ AVC project structure created successfully!\n');
    console.log('Next steps:');
    console.log('  1. Open .env file and add your API key(s)');
    console.log('     • ANTHROPIC_API_KEY for Claude');
    console.log('     • GEMINI_API_KEY for Gemini');
    console.log('  2. Run /sponsor-call to define your project\n');
  }

  /**
   * Run Sponsor Call ceremony to define project with AI assistance
   * Requires API keys to be configured in .env file
   */
  async sponsorCall() {
    console.log('\n🎯 Sponsor Call Ceremony\n');
    console.log(`Project directory: ${this.projectRoot}\n`);

    // Check if project is initialized
    if (!this.isAvcProject()) {
      console.log('❌ Project not initialized\n');
      console.log('   Please run /init first to create the project structure.\n');
      process.exit(1);
    }

    let progress = null;

    // Check for incomplete ceremony
    if (this.hasIncompleteInit()) {
      progress = this.readProgress();

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
      process.exit(1);
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
      this.writeProgress(progress);
    }

    // Generate project document via Sponsor Call ceremony
    await this.generateProjectDocument(progress);

    // Mark as completed and clean up
    progress.stage = 'completed';
    progress.lastUpdate = new Date().toISOString();
    this.writeProgress(progress);
    this.clearProgress();

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
    default:
      console.log('Unknown command. Available commands: init, sponsor-call, status');
      process.exit(1);
  }
}
