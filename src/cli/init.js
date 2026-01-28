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
  constructor() {
    this.projectRoot = process.cwd();
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
   * Create avc.json with default settings
   */
  createAvcConfig() {
    if (!this.hasAvcConfig()) {
      const defaultConfig = {
        version: '1.0.0',
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
              provider: 'claude'
            }
          ]
        }
      };

      fs.writeFileSync(
        this.avcConfigPath,
        JSON.stringify(defaultConfig, null, 2),
        'utf8'
      );
      console.log('✓ Created .avc/avc.json configuration file');
      return true;
    }
    console.log('✓ .avc/avc.json already exists');
    return false;
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
   * Initialize the AVC project
   */
  async init() {
    console.log('\n🚀 AVC Project Initiator - Sponsor Call Ceremony\n');
    console.log(`Project directory: ${this.projectRoot}\n`);

    let progress = null;

    // Check for incomplete initialization
    if (this.hasIncompleteInit()) {
      progress = this.readProgress();

      if (progress && progress.stage !== 'completed') {
        console.log('⚠️  Found incomplete initialization from previous session');
        console.log(`   Last activity: ${new Date(progress.lastUpdate).toLocaleString()}`);
        console.log(`   Stage: ${progress.stage}`);
        console.log(`   Progress: ${progress.answeredQuestions || 0}/${progress.totalQuestions || 0} questions answered`);
        console.log('\n▶️  Continuing from where you left off...\n');
      }
    } else if (this.isAvcProject()) {
      // No incomplete progress but project exists - already initialized
      console.log('✓ AVC project already initialized');
      console.log('\nProject is ready to use.');
      return;
    } else {
      // Fresh start
      console.log('Initializing AVC project...\n');
    }

    // Create .avc folder
    this.createAvcFolder();

    // Create avc.json
    this.createAvcConfig();

    // Create .env file for API keys
    this.createEnvFile();

    // Add .env to .gitignore if git repository
    this.addToGitignore();

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

    console.log('\n✅ AVC project initialized successfully!');
    console.log('\nNext steps:');
    console.log('  1. Add your ANTHROPIC_API_KEY to .env file');
    console.log('  2. Review .avc/project/doc.md for your project definition');
    console.log('  3. Review .avc/avc.json configuration');
    console.log('  4. Create your project context and work items');
    console.log('  5. Use AI agents to implement features');
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
    case 'status':
      initiator.status();
      break;
    default:
      console.log('Unknown command. Available commands: init, status');
      process.exit(1);
  }
}
