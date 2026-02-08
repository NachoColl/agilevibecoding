import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { LLMProvider } from './llm-provider.js';
import { LLMVerifier } from './llm-verifier.js';
import { TokenTracker } from './token-tracker.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * TemplateProcessor - Handles interactive template processing with AI suggestions
 *
 * Core workflow:
 * 1. Parse template to extract variables
 * 2. Prompt user for each variable (with singular/plural detection)
 * 3. Generate AI suggestions for skipped variables
 * 4. Replace variables in template
 * 5. Enhance final document with AI
 * 6. Write to .avc/project/doc.md
 */
class TemplateProcessor {
  constructor(ceremonyName = 'sponsor-call', progressPath = null, nonInteractive = false) {
    // Load environment variables from project .env
    dotenv.config({ path: path.join(process.cwd(), '.env') });

    this.ceremonyName = ceremonyName;
    this.templatePath = path.join(__dirname, 'templates/project.md');
    this.outputDir = path.join(process.cwd(), '.avc/project');
    this.outputPath = path.join(this.outputDir, 'doc.md');
    this.avcConfigPath = path.join(process.cwd(), '.avc/avc.json');
    this.agentsPath = path.join(__dirname, 'agents');
    this.avcPath = path.join(process.cwd(), '.avc');
    this.progressPath = progressPath;
    this.nonInteractive = nonInteractive;

    // Read ceremony-specific configuration
    const { provider, model, validationConfig } = this.readCeremonyConfig(ceremonyName);
    this._providerName = provider;
    this._modelName = model;
    this.llmProvider = null;

    // Read validation provider config
    this._validationProvider = null;
    this._validationModel = null;
    this.validationLLMProvider = null;
    this.validationConfig = validationConfig;

    if (validationConfig?.enabled) {
      this._validationProvider = validationConfig.provider;
      this._validationModel = validationConfig.model;

      // Validate required fields
      if (!this._validationProvider || !this._validationModel) {
        throw new Error(
          `Validation is enabled for '${ceremonyName}' but validation.provider or validation.model is not configured in avc.json`
        );
      }
    }

    // Initialize token tracker
    this.tokenTracker = new TokenTracker(this.avcPath);
    this.tokenTracker.init();

    // Track last token usage for ceremony history
    this._lastTokenUsage = null;

    // Progress reporting
    this.progressCallback = null;
    this.activityLog = [];
  }

  /**
   * Set progress callback for updating UI during execution
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * Report progress to callback and log activity
   */
  reportProgress(message, activity = null) {
    if (this.progressCallback) {
      this.progressCallback(message);
    }
    if (activity) {
      this.activityLog.push(activity);
    }
  }

  /**
   * Report substep to callback (for detailed progress tracking)
   * @param {string} substep - The substep message
   * @param {Object} metadata - Additional metadata (tokensUsed, filesCreated)
   */
  reportSubstep(substep, metadata = {}) {
    if (this.progressCallback) {
      this.progressCallback(null, substep, metadata);
    }
  }

  /**
   * Read ceremony-specific configuration from avc.json
   */
  readCeremonyConfig(ceremonyName) {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      const ceremony = config.settings?.ceremonies?.find(c => c.name === ceremonyName);

      if (!ceremony) {
        console.warn(`⚠️  Ceremony '${ceremonyName}' not found in config, using defaults`);
        return {
          provider: 'claude',
          model: 'claude-sonnet-4-5-20250929',
          validationConfig: null
        };
      }

      return {
        provider: ceremony.provider || 'claude',
        model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929',
        validationConfig: ceremony.validation || null
      };
    } catch (error) {
      console.warn(`⚠️  Could not read ceremony config: ${error.message}`);
      return {
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        validationConfig: null
      };
    }
  }

  /**
   * Read guidelines from avc.json questionnaire configuration
   */
  readGuidelines() {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      return config.settings?.questionnaire?.guidelines || {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Get guideline value for a specific variable
   * New format uses UPPER_SNAKE_CASE keys directly in settings.questionnaire.guidelines
   * @param {string} variableName - Variable name in UPPER_SNAKE_CASE
   * @returns {string|null} - Guideline value or null if not found
   */
  getGuidelineForVariable(variableName) {
    const guidelines = this.readGuidelines();

    // New format uses UPPER_SNAKE_CASE keys directly
    // e.g., guidelines.MISSION_STATEMENT, guidelines.TECHNICAL_CONSIDERATIONS
    const guidelineValue = guidelines[variableName];
    return guidelineValue || null;
  }

  /**
   * Load agent instructions from markdown file
   * @param {string} agentFileName - Filename in src/cli/agents/
   * @returns {string|null} - Agent instructions content or null if not found
   */
  loadAgentInstructions(agentFileName) {
    try {
      const agentPath = path.join(__dirname, 'agents', agentFileName);
      if (!fs.existsSync(agentPath)) {
        console.warn(`⚠️  Agent instruction file not found: ${agentFileName}`);
        return null;
      }
      return fs.readFileSync(agentPath, 'utf8');
    } catch (error) {
      console.warn(`⚠️  Could not load agent instructions: ${error.message}`);
      return null;
    }
  }

  /**
   * Get agent instructions for a specific ceremony stage
   * @param {string} stage - Ceremony stage (e.g., 'enhancement', 'suggestion', 'validation')
   * @returns {string|null} - Agent instructions or null if not configured/found
   */
  getAgentForStage(stage) {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      const ceremony = config.settings?.ceremonies?.[0];

      if (!ceremony?.agents || ceremony.agents.length === 0) {
        return null;
      }

      const agent = ceremony.agents.find(a => a.stage === stage);
      if (!agent) {
        return null;
      }

      return this.loadAgentInstructions(agent.instruction);
    } catch (error) {
      console.warn(`⚠️  Could not get agent for stage ${stage}: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract variables from template content
   * Returns array of variable objects with metadata
   */
  extractVariables(content) {
    const pattern = /\{\{([A-Z_]+)\}\}/g;
    const matches = [...content.matchAll(pattern)];

    return Array.from(new Set(matches.map(m => m[1]))).map(name => ({
      name,
      placeholder: `{{${name}}}`,
      isPlural: this.isPlural(name),
      displayName: this.toDisplayName(name),
      guidance: this.getGuidance(name)
    }));
  }

  /**
   * Detect if variable expects plural values based on naming conventions
   */
  isPlural(variableName) {
    const pluralIndicators = [
      'REQUIREMENTS', 'OBJECTIVES', 'FEATURES', 'USERS',
      'WORKFLOWS', 'CONSIDERATIONS'
    ];
    return pluralIndicators.some(indicator => variableName.includes(indicator));
  }

  /**
   * Convert variable name to display format
   * Example: "BUSINESS_CONTEXT" -> "Business Context"
   */
  toDisplayName(variableName) {
    return variableName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Get guidance text for each variable
   */
  getGuidance(variableName) {
    const guidance = {
      'MISSION_STATEMENT': 'A concise statement describing the core purpose and value proposition of your application.\n   Example: "Enable small businesses to manage inventory and sales through an intuitive mobile-first platform."',

      'TARGET_USERS': 'Who will use this application? List different user types and their roles.\n   Examples: "Small business owners", "Inventory managers", "Sales staff", "Administrators"',

      'INITIAL_SCOPE': 'Describe the initial scope of your application: key features, main workflows, and core functionality.\n   What will users be able to do? What are the essential capabilities?\n   Example: "Users can create tasks, assign them to team members, track progress, set deadlines, and receive notifications."',

      'DEPLOYMENT_TARGET': 'Where will this application be deployed and hosted?\n   Consider: Cloud providers (AWS, Google Cloud, Azure, DigitalOcean, Vercel, Netlify), platform types (serverless, containerized, VM-based, static hosting), local deployment (desktop app, mobile app, browser extension), CMS platforms (WordPress plugin, Shopify app), hybrid approaches (local with cloud sync, PWA), infrastructure constraints (on-premises, air-gapped, specific regions)\n   Example: "AWS cloud using Lambda and S3, with CloudFront CDN for global distribution"',

      'TECHNICAL_CONSIDERATIONS': 'Technical stack and requirements for your application (backend AND frontend).\n   Backend examples: "Node.js with Express API", "PostgreSQL database", "Real-time data sync with WebSockets"\n   Frontend examples: "React SPA with TypeScript", "VitePress for documentation", "Next.js with SSR for e-commerce", "Material-UI design system"\n   UI/UX examples: "Mobile-first responsive design", "WCAG 2.1 AA accessibility", "Must work offline", "Multi-language support"',

      'SECURITY_AND_COMPLIANCE_REQUIREMENTS': 'Security, privacy, or regulatory requirements your application must meet.\n   Examples: "GDPR compliance for EU users", "PCI DSS for payment data", "Two-factor authentication", "Data encryption at rest"'
    };

    return guidance[variableName] || '';
  }

  /**
   * Create readline interface
   */
  createInterface() {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Promisified readline question
   */
  question(rl, query) {
    return new Promise(resolve => rl.question(query, resolve));
  }

  /**
   * Prompt user for singular value
   * Returns string or null if skipped
   */
  async promptSingular(name, guidance) {
    const rl = this.createInterface();

    console.log(`\n📝 ${name}`);
    if (guidance) {
      console.log(`${guidance}`);
    }
    console.log('Enter response (press Enter twice when done, or Enter immediately to skip):\n');

    const lines = [];
    let emptyLineCount = 0;
    let firstInput = true;

    return new Promise((resolve) => {
      rl.on('line', (line) => {
        // If first input is empty, user wants to skip
        if (firstInput && line.trim() === '') {
          rl.close();
          resolve(null);
          return;
        }

        firstInput = false;

        if (line.trim() === '') {
          emptyLineCount++;
          if (emptyLineCount >= 1) {
            rl.close();
            resolve(lines.join('\n').trim());
            return;
          }
        } else {
          emptyLineCount = 0;
          lines.push(line);
        }
      });

      rl.on('close', () => {
        if (lines.length === 0) {
          resolve(null);
        }
      });
    });
  }

  /**
   * Prompt user for plural values (list)
   * Returns array or null if skipped
   */
  async promptPlural(name, guidance) {
    const rl = this.createInterface();

    console.log(`\n📝 ${name}`);
    if (guidance) {
      console.log(`${guidance}`);
    }
    console.log('Enter items one per line (empty line to finish, or Enter immediately to skip):\n');

    const items = [];
    let itemNumber = 1;
    let firstInput = true;

    return new Promise((resolve) => {
      const promptForItem = () => {
        rl.question(`   ${itemNumber}. `, (answer) => {
          // If first input is empty, user wants to skip
          if (firstInput && answer.trim() === '') {
            rl.close();
            resolve(null);
            return;
          }

          firstInput = false;

          if (answer.trim() === '') {
            rl.close();
            resolve(items.length > 0 ? items : null);
            return;
          }

          items.push(answer.trim());
          itemNumber++;
          promptForItem();
        });
      };

      promptForItem();
    });
  }

  /**
   * Initialize LLM provider
   */
  async initializeLLMProvider() {
    try {
      // Initialize main provider
      this.llmProvider = await LLMProvider.create(this._providerName, this._modelName);
      console.log(`   Using ${this._providerName} (${this._modelName}) for generation\n`);

      // Initialize validation provider if validation is enabled
      if (this._validationProvider) {
        console.log(`   Using ${this._validationProvider} (${this._validationModel}) for validation\n`);
        this.validationLLMProvider = await LLMProvider.create(
          this._validationProvider,
          this._validationModel
        );
      }

      return this.llmProvider;
    } catch (error) {
      console.log(`⚠️  Could not initialize LLM provider`);
      console.log(`${error.message}`);
      throw error;
    }
  }

  /**
   * Retry wrapper for LLM calls with exponential backoff
   * @param {Function} fn - Async function to retry
   * @param {string} operation - Description of operation for logging
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @returns {Promise} Result from function call
   */
  async retryWithBackoff(fn, operation, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const isRetriable = error.message?.includes('rate limit') ||
                          error.message?.includes('timeout') ||
                          error.message?.includes('503') ||
                          error.message?.includes('network');

        if (isLastAttempt || !isRetriable) {
          throw error;
        }

        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⚠️  Retry ${attempt}/${maxRetries} in ${delay/1000}s: ${operation}`);
        console.log(`Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Get domain-specific agent for a variable
   * Returns agent instructions for generating suggestions
   */
  getAgentForVariable(variableName) {
    const agentMap = {
      'MISSION_STATEMENT': 'suggestion-business-analyst.md',
      'TARGET_USERS': 'suggestion-ux-researcher.md',
      'INITIAL_SCOPE': 'suggestion-product-manager.md',
      'TECHNICAL_CONSIDERATIONS': 'suggestion-technical-architect.md',
      'SECURITY_AND_COMPLIANCE_REQUIREMENTS': 'suggestion-security-specialist.md'
    };

    const agentFile = agentMap[variableName];
    if (!agentFile) {
      return null;
    }

    const agentPath = path.join(this.agentsPath, agentFile);
    if (!fs.existsSync(agentPath)) {
      console.warn(`⚠️  Agent file not found: ${agentFile}`);
      return null;
    }

    return fs.readFileSync(agentPath, 'utf8');
  }

  /**
   * Build context-aware prompt for AI suggestions
   */
  buildPrompt(variableName, isPlural, context) {
    const displayName = this.toDisplayName(variableName);

    // Build context section from previously collected values
    let contextSection = '';
    if (Object.keys(context).length > 0) {
      contextSection = 'Project context so far:\n\n';
      for (const [key, value] of Object.entries(context)) {
        const keyDisplay = this.toDisplayName(key);
        if (Array.isArray(value)) {
          contextSection += `${keyDisplay}:\n${value.map(v => `- ${v}`).join('\n')}\n`;
        } else {
          contextSection += `${keyDisplay}: ${value}\n`;
        }
      }
      contextSection += '\n';
    }

    // Create simple user prompt with context
    return `${contextSection}Please provide your response for "${displayName}".`;
  }

  /**
   * Parse Claude's response into structured format
   */
  parseLLMResponse(response, isPlural) {
    if (isPlural) {
      return response.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => line.replace(/^[0-9\-*.]+\s+/, '')); // Remove list prefixes
    }
    return response.trim();
  }

  /**
   * Generate AI suggestions for a variable using domain-specific agent
   */
  async generateSuggestions(variableName, isPlural, context) {
    if (!this.llmProvider && !(await this.initializeLLMProvider())) {
      return null;
    }

    try {
      // Get domain-specific agent for this variable
      const agentInstructions = this.getAgentForVariable(variableName);

      if (agentInstructions) {
        // Use domain-specific agent with context
        const prompt = this.buildPrompt(variableName, isPlural, context);
        console.log(`Using specialized agent: ${variableName.toLowerCase().replace(/_/g, '-')}`);

        const text = await this.retryWithBackoff(
          () => this.llmProvider.generate(prompt, isPlural ? 512 : 1024, agentInstructions),
          `${variableName} suggestion`
        );

        return this.parseLLMResponse(text, isPlural);
      } else {
        // Fallback to generic prompt if no agent available
        const prompt = this.buildPrompt(variableName, isPlural, context);
        const text = await this.llmProvider.generate(prompt, isPlural ? 512 : 256);
        return this.parseLLMResponse(text, isPlural);
      }
    } catch (error) {
      console.warn(`⚠️  Could not generate suggestions: ${error.message}`);
      return null;
    }
  }

  /**
   * Prompt user for a variable value
   * Returns { variable, value, source, skipped }
   */
  async promptUser(variable, context) {
    let value;

    // In non-interactive mode, skip readline prompts and use guidelines/AI
    if (this.nonInteractive) {
      console.log(`\n📝 ${variable.displayName}`);
      if (variable.guidance) {
        console.log(`   ${variable.guidance}`);
      }
      console.log('Generating AI response...');
      value = null; // Force AI generation
    } else {
      // Interactive mode - use readline prompts
      if (variable.isPlural) {
        value = await this.promptPlural(variable.displayName, variable.guidance);
      } else {
        value = await this.promptSingular(variable.displayName, variable.guidance);
      }
    }

    // If user skipped (or non-interactive mode), try to use guideline or generate AI suggestions
    if (value === null) {
      // Check if there's a guideline for this variable
      const guidelines = this.readGuidelines();
      const guidelineKey = variable.name.toLowerCase().replace(/_/g, '');

      if (guidelines[guidelineKey]) {
        console.log('📋 Using default guideline...');
        value = variable.isPlural
          ? [guidelines[guidelineKey]]  // Wrap in array for plural variables
          : guidelines[guidelineKey];

        console.log('✅ Guideline applied:');
        if (Array.isArray(value)) {
          value.forEach((item, idx) => console.log(`${idx + 1}. ${item}`));
        } else {
          console.log(`${value}`);
        }
        return { variable: variable.name, value, source: 'guideline', skipped: true };
      }

      // No guideline available, try AI suggestions
      console.log('✨ Generating AI suggestion...');
      value = await this.generateSuggestions(variable.name, variable.isPlural, context);

      if (value) {
        console.log('✅ AI suggestion:');
        if (Array.isArray(value)) {
          value.forEach((item, idx) => console.log(`${idx + 1}. ${item}`));
        } else {
          console.log(`${value}`);
        }
        return { variable: variable.name, value, source: 'ai', skipped: true };
      } else {
        // No AI available or error
        return { variable: variable.name, value: '', source: 'empty', skipped: true };
      }
    }

    return { variable: variable.name, value, source: 'user', skipped: false };
  }

  /**
   * Replace variables in template with collected values
   */
  replaceVariables(template, variables) {
    let result = template;

    for (const [variableName, value] of Object.entries(variables)) {
      const placeholder = `{{${variableName}}}`;

      let replacement;
      if (Array.isArray(value)) {
        replacement = value.map(item => `- ${item}`).join('\n');
      } else {
        replacement = value || '(Not specified)';
      }

      result = result.replace(
        new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
        replacement
      );
    }

    return result;
  }

  /**
   * Generate final document with LLM enhancement
   */
  async generateFinalDocument(templateWithValues) {
    if (!this.llmProvider && !(await this.initializeLLMProvider())) {
      // No provider available - save template as-is
      return templateWithValues;
    }

    try {
      // Try to load agent instructions for enhancement stage
      this.reportSubstep('Reading agent: project-documentation-creator.md');
      const agentInstructions = this.getAgentForStage('enhancement');

      if (agentInstructions) {
        // Use agent instructions as system context
        const userPrompt = `Here is the project information with all variables filled in:

${templateWithValues}

Please review and enhance this document according to your role.`;

        this.reportSubstep('Generating Project Brief (this may take 20-30 seconds)...');
        const enhanced = await this.retryWithBackoff(
          () => this.llmProvider.generate(userPrompt, 4096, agentInstructions),
          'document enhancement'
        );

        // Report token usage after generation
        if (this.llmProvider && typeof this.llmProvider.getTokenUsage === 'function') {
          const usage = this.llmProvider.getTokenUsage();
          this.reportSubstep('Processing generated content...', {
            tokensUsed: {
              input: usage.inputTokens,
              output: usage.outputTokens
            }
          });
        }

        // Post-process verification
        this.reportSubstep('Verifying documentation quality...');
        const verifier = new LLMVerifier(this.llmProvider, 'project-documentation-creator');
        const verificationResult = await verifier.verify(
          enhanced,
          (mainMsg, substep) => this.reportSubstep(substep)
        );

        if (verificationResult.rulesApplied.length > 0) {
          this.reportSubstep(`Applied ${verificationResult.rulesApplied.length} fixes`);
        }

        return verificationResult.content;
      } else {
        // Fallback to legacy hardcoded prompt for backward compatibility
        const legacyPrompt = `You are creating a project definition document for an Agile Vibe Coding (AVC) project.

Here is the project information with all variables filled in:

${templateWithValues}

Please review and enhance this document to ensure:
1. All sections are well-formatted and clear
2. Content is professional and actionable
3. Sections flow logically
4. Any incomplete sections are identified

Return the enhanced markdown document.`;

        const enhanced = await this.retryWithBackoff(
          () => this.llmProvider.generate(legacyPrompt, 4096),
          'document enhancement (legacy)'
        );
        return enhanced;
      }
    } catch (error) {
      return templateWithValues;
    }
  }

  /**
   * Save progress to file
   */
  saveProgress(progress) {
    if (this.progressPath) {
      fs.writeFileSync(this.progressPath, JSON.stringify(progress, null, 2), 'utf8');
    }
  }

  /**
   * Sync project documentation to VitePress documentation folder
   */
  syncToVitePress(content) {
    try {
      const docsDir = path.join(process.cwd(), '.avc/documentation');
      const indexPath = path.join(docsDir, 'index.md');

      // Check if documentation folder exists
      if (!fs.existsSync(docsDir)) {
        console.log('ℹ️  VitePress documentation folder not found, skipping sync');
        return false;
      }

      // Write to .avc/documentation/index.md
      fs.writeFileSync(indexPath, content, 'utf8');
      console.log(`   ✓ Synced to .avc/documentation/index.md`);
      return true;
    } catch (error) {
      console.warn(`   ⚠️  Could not sync to VitePress: ${error.message}`);
      return false;
    }
  }

  /**
   * Build VitePress documentation site
   */
  async buildVitePress() {
    try {
      const docsDir = path.join(process.cwd(), '.avc/documentation');
      const packagePath = path.join(process.cwd(), 'package.json');

      // Check if VitePress is configured
      if (!fs.existsSync(docsDir) || !fs.existsSync(packagePath)) {
        return false;
      }

      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (!packageJson.scripts?.['docs:build']) {
        return false;
      }

      console.log('\n📚 Building VitePress documentation...');

      // Import execSync for running build command
      const { execSync } = await import('child_process');

      // Run VitePress build
      execSync('npm run docs:build', {
        cwd: process.cwd(),
        stdio: 'inherit'
      });

      console.log('✓ VitePress build completed');
      return true;
    } catch (error) {
      console.warn(`⚠️  VitePress build failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Write document to file
   */
  async writeDocument(content) {
    // Create .avc/project/ directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Write doc.md
    const fileSize = Math.ceil(Buffer.byteLength(content, 'utf8') / 1024); // Size in KB
    this.reportSubstep(`Writing doc.md (${fileSize} KB)`);
    fs.writeFileSync(this.outputPath, content, 'utf8');

    // Report files created
    const filesCreated = ['.avc/project/project/doc.md'];
    this.reportSubstep('Project Brief created successfully', { filesCreated });

    // Sync to VitePress if configured (silent for sponsor-call)
    const synced = this.syncToVitePress(content);

    // Optionally build VitePress (commented out by default to avoid slow builds during dev)
    // if (synced) {
    //   await this.buildVitePress();
    // }
  }

  /**
   * Main workflow - process template and generate document
   */
  async processTemplate(initialProgress = null) {
    console.log('\n📋 Project Setup Questionnaire\n');

    // 1. Read template
    const templateContent = fs.readFileSync(this.templatePath, 'utf8');

    // 2. Extract variables
    const variables = this.extractVariables(templateContent);

    // 3. Initialize or restore progress
    let collectedValues = {};
    let answeredCount = 0;

    if (initialProgress && initialProgress.collectedValues) {
      collectedValues = { ...initialProgress.collectedValues };
      answeredCount = Object.keys(collectedValues).length;

      // Check if ALL answers are pre-filled (from REPL questionnaire)
      if (answeredCount === variables.length) {
        console.log(`✅ Using ${answeredCount} pre-filled answers from questionnaire.\n`);

        // Use pre-filled answers, but check guidelines or AI for skipped (null) answers
        for (const variable of variables) {
          if (collectedValues[variable.name] === null) {
            console.log(`\n📝 ${variable.displayName}`);

            // First, check if there's a guideline for this question
            const guideline = this.getGuidelineForVariable(variable.name);

            if (guideline) {
              console.log('✓ Using guideline from avc.json');
              collectedValues[variable.name] = guideline;
            } else {
              // No guideline found, generate AI suggestion
              console.log('Generating AI suggestion...');
              const aiValue = await this.generateSuggestions(variable.name, variable.isPlural, collectedValues);
              collectedValues[variable.name] = aiValue || '';
            }
          }
        }
      } else {
        console.log(`Resuming with ${answeredCount}/${variables.length} questions already answered.\n`);

        // Continue with normal interactive flow for remaining questions
        for (const variable of variables) {
          if (collectedValues[variable.name] === undefined) {
            const result = await this.promptUser(variable, collectedValues);
            collectedValues[result.variable] = result.value;
            answeredCount++;

            // Save progress after each question
            if (this.progressPath) {
              const progress = {
                stage: 'questionnaire',
                totalQuestions: variables.length,
                answeredQuestions: answeredCount,
                collectedValues: collectedValues,
                lastUpdate: new Date().toISOString()
              };
              this.saveProgress(progress);
            }
          }
        }
      }
    } else {
      console.log(`Found ${variables.length} sections to complete.\n`);

      // 4. Collect values with context accumulation
      for (const variable of variables) {
        const result = await this.promptUser(variable, collectedValues);
        collectedValues[result.variable] = result.value;
        answeredCount++;

        // Save progress after each question
        if (this.progressPath) {
          const progress = {
            stage: 'questionnaire',
            totalQuestions: variables.length,
            answeredQuestions: answeredCount,
            collectedValues: collectedValues,
            lastUpdate: new Date().toISOString()
          };
          this.saveProgress(progress);
        }
      }
    }

    // Report questionnaire completion
    this.reportProgress('Stage 1/5: Processing questionnaire answers...', 'Processed questionnaire responses');

    // 5. Replace variables in template
    this.reportProgress('Stage 2/5: Preparing project template...', 'Template preparation complete');
    this.reportSubstep('Reading template: project.md');
    const templateWithValues = this.replaceVariables(templateContent, collectedValues);
    this.reportSubstep('Replaced 6 template variables');

    // Preparation complete
    this.reportProgress('Stage 3/5: Preparing for documentation generation...', 'Ready to generate documentation');

    // 6. Enhance document with LLM
    this.reportProgress('Stage 4/5: Creating project documentation...', 'Created project documentation');
    let finalDocument = await this.generateFinalDocument(templateWithValues);

    // 7. Validate and improve documentation (if validation enabled)
    if (this.ceremonyName === 'sponsor-call' && this.isValidationEnabled()) {
      finalDocument = await this.iterativeValidation(finalDocument, 'documentation', collectedValues);
    }

    // 8. Generate project context only (for Sponsor Call)
    let contextContent = null;
    let contextPath = null;
    if (this.ceremonyName === 'sponsor-call') {
      // Only generate project context if provider is initialized and has generateJSON method
      if (!this.llmProvider) {
        await this.initializeLLMProvider();
      }

      if (this.llmProvider && typeof this.llmProvider.generateJSON === 'function') {
        this.reportProgress('Stage 5/5: Creating context scope...', 'Created context scope');
        contextContent = await this.generateProjectContextContent(collectedValues);

        // 9. Validate and improve context (if validation enabled)
        if (this.isValidationEnabled()) {
          contextContent = await this.iterativeValidation(contextContent, 'context', collectedValues, finalDocument);
        }

        // Write context.md - ensure directory exists first
        if (!fs.existsSync(this.outputDir)) {
          fs.mkdirSync(this.outputDir, { recursive: true });
        }
        contextPath = path.join(this.outputDir, 'context.md');

        // Calculate token count for context
        const contextTokenCount = Math.ceil(contextContent.length / 4); // Rough estimate: 4 chars per token
        this.reportSubstep(`Writing context.md (~${contextTokenCount} tokens)`);
        fs.writeFileSync(contextPath, contextContent, 'utf8');

        // Report files created
        const filesCreated = [];
        if (contextPath) filesCreated.push('.avc/project/project/context.md');
        this.reportSubstep('Project context created successfully', { filesCreated });
      }
    }

    // 10. Write documentation to file
    await this.writeDocument(finalDocument);

    // 11. Track token usage (only for sponsor-call)
    let tokenUsage = null;
    let cost = null;
    if (this.ceremonyName === 'sponsor-call' && this.llmProvider && typeof this.llmProvider.getTokenUsage === 'function') {
      const usage = this.llmProvider.getTokenUsage();
      tokenUsage = {
        input: usage.inputTokens,
        output: usage.outputTokens,
        total: usage.totalTokens,
        calls: usage.totalCalls
      };

      // Calculate cost
      cost = this.tokenTracker.calculateCost(
        usage.inputTokens,
        usage.outputTokens,
        this._modelName
      );

      // Track in token history
      this.tokenTracker.addExecution(this.ceremonyName, {
        input: usage.inputTokens,
        output: usage.outputTokens
      }, this._modelName);

      // Store usage for ceremony history
      this._lastTokenUsage = usage;
    }

    // 12. Return comprehensive result
    return {
      outputPath: this.outputPath,
      contextPath: contextPath,
      activities: this.activityLog,
      tokenUsage: tokenUsage,
      cost: cost,
      model: this._modelName
    };
  }

  /**
   * Generate project context content (for Sponsor Call ceremony)
   * Returns the markdown content without writing to file
   * @param {Object} collectedValues - Values from questionnaire
   * @returns {string} Context markdown content
   */
  async generateProjectContextContent(collectedValues) {
    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    if (!this.llmProvider || typeof this.llmProvider.generateJSON !== 'function') {
      return null;
    }

    // Read agent instructions
    this.reportSubstep('Reading agent: project-context-generator.md');
    const projectContextGeneratorAgent = fs.readFileSync(
      path.join(this.agentsPath, 'project-context-generator.md'),
      'utf8'
    );

    // Generate project context
    this.reportSubstep('Generating project context (target: ~500 tokens)...');
    const projectContext = await this.retryWithBackoff(
      () => this.generateContext('project', 'project', collectedValues, projectContextGeneratorAgent),
      'project context'
    );

    // Report token usage and validation
    if (this.llmProvider && typeof this.llmProvider.getTokenUsage === 'function') {
      const usage = this.llmProvider.getTokenUsage();
      this.reportSubstep('Validating context token count...', {
        tokensUsed: {
          input: usage.inputTokens,
          output: usage.outputTokens
        }
      });
    }

    // Post-process verification
    this.reportSubstep('Verifying context quality...');
    const verifier = new LLMVerifier(this.llmProvider, 'project-context-generator');
    const verificationResult = await verifier.verify(
      projectContext.contextMarkdown,
      (mainMsg, substep) => this.reportSubstep(substep)
    );

    if (verificationResult.rulesApplied.length > 0) {
      this.reportSubstep(`Applied ${verificationResult.rulesApplied.length} context fixes`);
    }

    return verificationResult.content;
  }

  /**
   * Get token usage from last LLM execution
   * @returns {Object|null} Token usage object or null
   */
  getLastTokenUsage() {
    return this._lastTokenUsage;
  }

  /**
   * Generate hierarchical work items (Project → Epic → Story) with context.md files
   * (Now used by Project Expansion ceremony)
   * @param {Object} collectedValues - Values from questionnaire
   */
  async generateHierarchy(collectedValues) {
    console.log('\n📊 Generating project hierarchy...\n');

    // Read agent instructions
    const epicStoryDecomposerAgent = fs.readFileSync(
      path.join(this.agentsPath, 'epic-story-decomposer.md'),
      'utf8'
    );
    const projectContextGeneratorAgent = fs.readFileSync(
      path.join(this.agentsPath, 'project-context-generator.md'),
      'utf8'
    );
    const featureContextGeneratorAgent = fs.readFileSync(
      path.join(this.agentsPath, 'feature-context-generator.md'),
      'utf8'
    );

    // 1. Decompose into Epics and Stories
    console.log('🔄 Stage 5/7: Decomposing features into Epics and Stories...');
    const decompositionPrompt = this.buildDecompositionPrompt(collectedValues);
    const hierarchy = await this.retryWithBackoff(
      () => this.llmProvider.generateJSON(decompositionPrompt, epicStoryDecomposerAgent),
      'hierarchy decomposition'
    );

    // Validate response structure
    if (!hierarchy.epics || !Array.isArray(hierarchy.epics)) {
      throw new Error('Invalid hierarchy response: missing epics array');
    }

    console.log(`✅ Generated ${hierarchy.epics.length} Epics with ${hierarchy.validation?.storyCount || 0} Stories\n`);

    // 2. Generate context.md files for each level
    console.log('📝 Stage 6/7: Generating context.md files...\n');

    // Calculate total contexts to generate
    const totalStories = hierarchy.epics.reduce((sum, epic) => sum + (epic.stories?.length || 0), 0);
    const totalContexts = 1 + hierarchy.epics.length + totalStories;
    let currentContext = 0;

    // Generate Project context
    currentContext++;
    console.log(`   → Project context.md (${currentContext}/${totalContexts})`);
    const projectContext = await this.retryWithBackoff(
      () => this.generateContext('project', 'project', collectedValues, projectContextGeneratorAgent),
      'project context'
    );

    // Generate Epic contexts
    const epicContexts = [];
    for (const epic of hierarchy.epics) {
      currentContext++;
      console.log(`   → Epic ${epic.id}: ${epic.name} (${currentContext}/${totalContexts})`);
      const epicContext = await this.retryWithBackoff(
        () => this.generateContext('epic', epic.id, { ...collectedValues, epic }, featureContextGeneratorAgent),
        `epic ${epic.id} context`
      );
      epicContexts.push({ id: epic.id, context: epicContext });

      // Generate Story contexts for this Epic
      for (const story of epic.stories || []) {
        currentContext++;
        console.log(`      → Story ${story.id}: ${story.name} (${currentContext}/${totalContexts})`);
        await this.retryWithBackoff(
          () => this.generateContext('story', story.id, { ...collectedValues, epic, story }, featureContextGeneratorAgent),
          `story ${story.id} context`
        );
      }
    }

    console.log('\n✅ Context generation complete\n');

    // 3. Write all files to disk
    console.log('💾 Stage 7/7: Writing files to disk...\n');
    await this.writeHierarchyToFiles(hierarchy, projectContext, collectedValues);

    // Display token usage statistics
    if (this.llmProvider) {
      const mainUsage = this.llmProvider.getTokenUsage();

      console.log('\n📊 Token Usage:\n');

      // Main provider usage
      console.log(`   Main Provider (${this._providerName}):`);
      console.log(`     Input: ${mainUsage.inputTokens.toLocaleString()} tokens`);
      console.log(`     Output: ${mainUsage.outputTokens.toLocaleString()} tokens`);
      console.log(`     Calls: ${mainUsage.totalCalls}`);

      // Validation provider usage (if used)
      if (this.validationLLMProvider) {
        const validationUsage = this.validationLLMProvider.getTokenUsage();
        console.log(`\n   Validation Provider (${this._validationProvider}):`);
        console.log(`     Input: ${validationUsage.inputTokens.toLocaleString()} tokens`);
        console.log(`     Output: ${validationUsage.outputTokens.toLocaleString()} tokens`);
        console.log(`     Calls: ${validationUsage.totalCalls}`);

        // Total
        const totalInput = mainUsage.inputTokens + validationUsage.inputTokens;
        const totalOutput = mainUsage.outputTokens + validationUsage.outputTokens;
        const totalCalls = mainUsage.totalCalls + validationUsage.totalCalls;

        console.log(`\n   Total:`);
        console.log(`     Input: ${totalInput.toLocaleString()} tokens`);
        console.log(`     Output: ${totalOutput.toLocaleString()} tokens`);
        console.log(`     Calls: ${totalCalls}`);
      }

      // Save token history for main provider
      this.tokenTracker.addExecution(this.ceremonyName, {
        provider: this._providerName,
        model: this._modelName,
        input: mainUsage.inputTokens,
        output: mainUsage.outputTokens
      });

      // Save token history for validation provider
      if (this.validationLLMProvider) {
        const validationUsage = this.validationLLMProvider.getTokenUsage();
        this.tokenTracker.addExecution(`${this.ceremonyName}-validation`, {
          provider: this._validationProvider,
          model: this._validationModel,
          input: validationUsage.inputTokens,
          output: validationUsage.outputTokens
        });
      }

      console.log('\n✅ Token history updated');
    }
  }

  /**
   * Build prompt for Epic/Story decomposition
   * @param {Object} collectedValues - Questionnaire responses
   * @returns {string} Prompt for decomposition agent
   */
  buildDecompositionPrompt(collectedValues) {
    const { INITIAL_SCOPE, TARGET_USERS, MISSION_STATEMENT, TECHNICAL_CONSIDERATIONS, SECURITY_AND_COMPLIANCE_REQUIREMENTS } = collectedValues;

    return `Given the following project definition:

**Initial Scope (Features to Implement):**
${INITIAL_SCOPE}

**Target Users:**
${TARGET_USERS}

**Mission Statement:**
${MISSION_STATEMENT}

**Technical Considerations:**
${TECHNICAL_CONSIDERATIONS}

**Security and Compliance Requirements:**
${SECURITY_AND_COMPLIANCE_REQUIREMENTS}

Decompose this project into Epics (3-7 domain-based groupings) and Stories (2-8 user-facing capabilities per Epic).

Return your response as JSON following the exact structure specified in your instructions.`;
  }

  /**
   * Generate context.md for a specific node
   * @param {string} level - 'project', 'epic', or 'story'
   * @param {string} id - Node ID (e.g., 'project', 'context-0001', 'context-0001-0001')
   * @param {Object} data - Context data (collectedValues + epic/story if applicable)
   * @param {string} agentInstructions - Context generator agent instructions
   * @returns {Promise<Object>} Context generation result with markdown content
   */
  async generateContext(level, id, data, agentInstructions) {
    const prompt = this.buildContextPrompt(level, id, data);
    const result = await this.llmProvider.generateJSON(prompt, agentInstructions);

    // Validate response
    if (!result.contextMarkdown || !result.tokenCount) {
      throw new Error(`Invalid context response for ${id}: missing required fields`);
    }

    if (!result.withinBudget) {
      console.warn(`⚠️  Warning: ${id} context exceeds token budget (${result.tokenCount} tokens)`);
    }

    return result;
  }

  /**
   * Build prompt for context.md generation
   * @param {string} level - 'project', 'epic', or 'story'
   * @param {string} id - Node ID
   * @param {Object} data - Context data
   * @returns {string} Prompt for context generator agent
   */
  buildContextPrompt(level, id, data) {
    const { INITIAL_SCOPE, TARGET_USERS, MISSION_STATEMENT, TECHNICAL_CONSIDERATIONS, SECURITY_AND_COMPLIANCE_REQUIREMENTS, epic, story } = data;

    let prompt = `Generate a context.md file for the following ${level}:\n\n`;
    prompt += `**Level:** ${level}\n`;
    prompt += `**ID:** ${id}\n\n`;

    if (level === 'project') {
      prompt += `**Mission Statement:**\n${MISSION_STATEMENT}\n\n`;
      prompt += `**Target Users:**\n${TARGET_USERS}\n\n`;
      prompt += `**Technical Considerations:**\n${TECHNICAL_CONSIDERATIONS}\n\n`;
      prompt += `**Security and Compliance:**\n${SECURITY_AND_COMPLIANCE_REQUIREMENTS}\n\n`;
    } else if (level === 'epic') {
      prompt += `**Epic Name:** ${epic.name}\n`;
      prompt += `**Epic Domain:** ${epic.domain}\n`;
      prompt += `**Epic Description:** ${epic.description}\n`;
      prompt += `**Features in Epic:** ${epic.features.join(', ')}\n\n`;
      prompt += `**Project Mission Statement:**\n${MISSION_STATEMENT}\n\n`;
      prompt += `**Technical Considerations:**\n${TECHNICAL_CONSIDERATIONS}\n\n`;
      prompt += `**Security and Compliance:**\n${SECURITY_AND_COMPLIANCE_REQUIREMENTS}\n\n`;
    } else if (level === 'story') {
      prompt += `**Story Name:** ${story.name}\n`;
      prompt += `**Story Description:** ${story.description}\n`;
      prompt += `**User Type:** ${story.userType}\n`;
      prompt += `**Acceptance Criteria:**\n${story.acceptance.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}\n\n`;
      prompt += `**Epic Context:**\n`;
      prompt += `- Epic: ${epic.name}\n`;
      prompt += `- Domain: ${epic.domain}\n`;
      prompt += `- Features: ${epic.features.join(', ')}\n\n`;
      prompt += `**Project Mission Statement:**\n${MISSION_STATEMENT}\n\n`;
      prompt += `**Technical Considerations:**\n${TECHNICAL_CONSIDERATIONS}\n\n`;
    }

    prompt += `Return your response as JSON following the exact structure specified in your instructions.`;

    return prompt;
  }

  /**
   * Write hierarchy files to .avc/project/ directory
   * @param {Object} hierarchy - Decomposition result (epics array)
   * @param {Object} projectContext - Project-level context
   * @param {Object} collectedValues - Questionnaire responses
   */
  async writeHierarchyToFiles(hierarchy, projectContext, collectedValues) {
    const projectPath = path.join(this.avcPath, 'project');

    // 1. Write project-level files
    const projectDir = path.join(projectPath, 'project');
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Write project context.md (doc.md is written separately by writeDocument method)
    fs.writeFileSync(
      path.join(projectDir, 'context.md'),
      projectContext.contextMarkdown,
      'utf8'
    );
    console.log('✅ project/context.md\n');

    // 2. Write Epic and Story files
    for (const epic of hierarchy.epics) {
      const epicDir = path.join(projectPath, epic.id);
      if (!fs.existsSync(epicDir)) {
        fs.mkdirSync(epicDir, { recursive: true });
      }

      // Write Epic doc.md (initially empty, updated by retrospective ceremony)
      fs.writeFileSync(
        path.join(epicDir, 'doc.md'),
        `# ${epic.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*\n`,
        'utf8'
      );
      console.log(`   ✅ ${epic.id}/doc.md`);

      // Generate and write Epic context.md
      const epicContext = await this.generateContext('epic', epic.id, { ...collectedValues, epic },
        fs.readFileSync(path.join(this.agentsPath, 'feature-context-generator.md'), 'utf8')
      );
      fs.writeFileSync(
        path.join(epicDir, 'context.md'),
        epicContext.contextMarkdown,
        'utf8'
      );
      console.log(`   ✅ ${epic.id}/context.md`);

      // Write Epic work.json
      const epicWorkJson = {
        id: epic.id,
        name: epic.name,
        type: 'epic',
        domain: epic.domain,
        description: epic.description,
        features: epic.features,
        status: 'planned',
        dependencies: epic.dependencies || [],
        children: (epic.stories || []).map(s => s.id),
        metadata: {
          created: new Date().toISOString(),
          ceremony: 'sponsor-call',
          tokenBudget: epicContext.tokenCount
        }
      };
      fs.writeFileSync(
        path.join(epicDir, 'work.json'),
        JSON.stringify(epicWorkJson, null, 2),
        'utf8'
      );
      console.log(`   ✅ ${epic.id}/work.json`);

      // Write Story files
      for (const story of epic.stories || []) {
        const storyDir = path.join(projectPath, story.id);
        if (!fs.existsSync(storyDir)) {
          fs.mkdirSync(storyDir, { recursive: true });
        }

        // Write Story doc.md (initially empty, updated by retrospective ceremony)
        fs.writeFileSync(
          path.join(storyDir, 'doc.md'),
          `# ${story.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*\n`,
          'utf8'
        );
        console.log(`      ✅ ${story.id}/doc.md`);

        // Generate and write Story context.md
        const storyContext = await this.generateContext('story', story.id, { ...collectedValues, epic, story },
          fs.readFileSync(path.join(this.agentsPath, 'feature-context-generator.md'), 'utf8')
        );
        fs.writeFileSync(
          path.join(storyDir, 'context.md'),
          storyContext.contextMarkdown,
          'utf8'
        );
        console.log(`      ✅ ${story.id}/context.md`);

        // Write Story work.json
        const storyWorkJson = {
          id: story.id,
          name: story.name,
          type: 'story',
          userType: story.userType,
          description: story.description,
          acceptance: story.acceptance,
          status: 'planned',
          dependencies: story.dependencies || [],
          children: [],
          metadata: {
            created: new Date().toISOString(),
            ceremony: 'sponsor-call',
            tokenBudget: storyContext.tokenCount
          }
        };
        fs.writeFileSync(
          path.join(storyDir, 'work.json'),
          JSON.stringify(storyWorkJson, null, 2),
          'utf8'
        );
        console.log(`      ✅ ${story.id}/work.json`);
      }

      console.log(''); // Empty line between epics
    }

    console.log(`✅ Hierarchy written to ${projectPath}/\n`);
    console.log(`📊 Summary:`);
    console.log(`   • 1 Project (doc.md + context.md)`);
    console.log(`   • ${hierarchy.epics.length} Epics (doc.md + context.md + work.json each)`);
    console.log(`   • ${hierarchy.validation?.storyCount || 0} Stories (doc.md + context.md + work.json each)`);

    const epicCount = hierarchy.epics.length;
    const storyCount = hierarchy.validation?.storyCount || 0;
    const totalFiles = 2 + (3 * epicCount) + (3 * storyCount); // Project: 2, Epic: 3 each, Story: 3 each
    console.log(`   • ${totalFiles} files created\n`);
  }

  /**
   * Get validation settings from ceremony configuration
   */
  getValidationSettings() {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      const ceremony = config.settings?.ceremonies?.find(c => c.name === this.ceremonyName);

      return ceremony?.validation || {
        enabled: true,
        maxIterations: 2,
        acceptanceThreshold: 75,
        skipOnCriticalIssues: false
      };
    } catch (error) {
      // Default settings if config can't be read
      return {
        enabled: true,
        maxIterations: 2,
        acceptanceThreshold: 75,
        skipOnCriticalIssues: false
      };
    }
  }

  /**
   * Check if validation is enabled for this ceremony
   */
  isValidationEnabled() {
    const settings = this.getValidationSettings();
    return settings.enabled !== false;
  }

  /**
   * Validate documentation (doc.md) using validator-documentation agent
   */
  async validateDocument(docContent, questionnaire, contextContent = null) {
    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    // Use validation provider if available, otherwise skip validation
    const provider = this.validationLLMProvider;
    if (!provider || typeof provider.generateJSON !== 'function') {
      console.log('⚠️  Skipping validation (validation provider not available)\n');
      return {
        validationStatus: 'acceptable',
        overallScore: 75,
        issues: [],
        strengths: ['Validation skipped - validation provider not available'],
        improvementPriorities: [],
        readyForPublication: true
      };
    }

    // Read validator agent instructions
    const validatorAgent = this.loadAgentInstructions('validator-documentation.md');

    // Build validation prompt
    let prompt = `Validate the following project documentation:\n\n`;
    prompt += `**doc.md Content:**\n\`\`\`markdown\n${docContent}\n\`\`\`\n\n`;

    prompt += `**Original Questionnaire Data:**\n`;
    prompt += `- MISSION_STATEMENT: ${questionnaire.MISSION_STATEMENT || 'N/A'}\n`;
    prompt += `- TARGET_USERS: ${questionnaire.TARGET_USERS || 'N/A'}\n`;
    prompt += `- INITIAL_SCOPE: ${questionnaire.INITIAL_SCOPE || 'N/A'}\n`;
    prompt += `- TECHNICAL_CONSIDERATIONS: ${questionnaire.TECHNICAL_CONSIDERATIONS || 'N/A'}\n`;
    prompt += `- SECURITY_AND_COMPLIANCE_REQUIREMENTS: ${questionnaire.SECURITY_AND_COMPLIANCE_REQUIREMENTS || 'N/A'}\n\n`;

    if (contextContent) {
      prompt += `**context.md Content (for cross-validation):**\n\`\`\`markdown\n${contextContent}\n\`\`\`\n\n`;
    }

    prompt += `Return your validation as JSON following the exact structure specified in your instructions.`;

    // Call validation provider for validation
    const validation = await this.retryWithBackoff(
      () => provider.generateJSON(prompt, validatorAgent),
      'documentation validation'
    );

    // Post-process verification of validator output
    const verifier = new LLMVerifier(provider, 'validator-documentation');
    const verificationResult = await verifier.verify(JSON.stringify(validation, null, 2));

    if (verificationResult.rulesApplied.length > 0) {
      // Parse corrected JSON back to object
      return JSON.parse(verificationResult.content);
    }

    return validation;
  }

  /**
   * Validate context (context.md) using validator-context agent
   */
  async validateContext(contextContent, level, questionnaire, parentContext = null) {
    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    // Use validation provider if available, otherwise skip validation
    const provider = this.validationLLMProvider;
    if (!provider || typeof provider.generateJSON !== 'function') {
      console.log('⚠️  Skipping validation (validation provider not available)\n');
      return {
        validationStatus: 'acceptable',
        overallScore: 75,
        issues: [],
        strengths: ['Validation skipped - validation provider not available'],
        improvementPriorities: [],
        estimatedTokenBudget: 500,
        readyForUse: true
      };
    }

    // Read validator agent instructions
    const validatorAgent = this.loadAgentInstructions('validator-context.md');

    // Build validation prompt
    let prompt = `Validate the following context file:\n\n`;
    prompt += `**Context Level:** ${level}\n\n`;
    prompt += `**context.md Content:**\n\`\`\`markdown\n${contextContent}\n\`\`\`\n\n`;

    if (level === 'project' && questionnaire) {
      prompt += `**Original Questionnaire Data:**\n`;
      prompt += `- MISSION_STATEMENT: ${questionnaire.MISSION_STATEMENT || 'N/A'}\n`;
      prompt += `- TARGET_USERS: ${questionnaire.TARGET_USERS || 'N/A'}\n`;
      prompt += `- INITIAL_SCOPE: ${questionnaire.INITIAL_SCOPE || 'N/A'}\n`;
      prompt += `- TECHNICAL_CONSIDERATIONS: ${questionnaire.TECHNICAL_CONSIDERATIONS || 'N/A'}\n`;
      prompt += `- SECURITY_AND_COMPLIANCE_REQUIREMENTS: ${questionnaire.SECURITY_AND_COMPLIANCE_REQUIREMENTS || 'N/A'}\n\n`;
    }

    if (parentContext) {
      prompt += `**Parent Context (for consistency check):**\n\`\`\`markdown\n${parentContext}\n\`\`\`\n\n`;
    }

    prompt += `Return your validation as JSON following the exact structure specified in your instructions.`;

    // Call validation provider for validation
    const validation = await this.retryWithBackoff(
      () => provider.generateJSON(prompt, validatorAgent),
      'context validation'
    );

    // Post-process verification of validator output
    const verifier = new LLMVerifier(provider, 'validator-context');
    const verificationResult = await verifier.verify(JSON.stringify(validation, null, 2));

    if (verificationResult.rulesApplied.length > 0) {
      // Parse corrected JSON back to object
      return JSON.parse(verificationResult.content);
    }

    return validation;
  }

  /**
   * Improve documentation based on validation feedback
   */
  async improveDocument(docContent, validationResult, questionnaire) {
    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    // Use validation provider if available, otherwise skip improvement
    const provider = this.validationLLMProvider;
    if (!provider || typeof provider.generateText !== 'function') {
      console.log('⚠️  Skipping improvement (validation provider not available)\n');
      return docContent;
    }

    // Read documentation creator agent
    const creatorAgent = this.loadAgentInstructions('project-documentation-creator.md');

    // Build improvement prompt with validation feedback
    let prompt = `Improve the following project documentation based on validation feedback:\n\n`;

    prompt += `**Current doc.md:**\n\`\`\`markdown\n${docContent}\n\`\`\`\n\n`;

    prompt += `**Validation Feedback:**\n`;
    prompt += `- Overall Score: ${validationResult.overallScore}/100\n`;
    prompt += `- Status: ${validationResult.validationStatus}\n\n`;

    if (validationResult.structuralIssues && validationResult.structuralIssues.length > 0) {
      prompt += `**Structural Issues to Fix:**\n`;
      validationResult.structuralIssues.forEach((issue, i) => {
        prompt += `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.section}: ${issue.issue}\n`;
        prompt += `   Suggestion: ${issue.suggestion}\n`;
      });
      prompt += `\n`;
    }

    if (validationResult.contentIssues && validationResult.contentIssues.length > 0) {
      prompt += `**Content Issues to Fix:**\n`;
      validationResult.contentIssues.forEach((issue, i) => {
        prompt += `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.section}: ${issue.description}\n`;
        prompt += `   Suggestion: ${issue.suggestion}\n`;
      });
      prompt += `\n`;
    }

    if (validationResult.applicationFlowGaps && validationResult.applicationFlowGaps.length > 0) {
      prompt += `**Application Flow Gaps to Address:**\n`;
      validationResult.applicationFlowGaps.forEach((gap, i) => {
        prompt += `${i + 1}. Missing: ${gap.missingFlow}\n`;
        prompt += `   Impact: ${gap.impact}\n`;
        prompt += `   Suggestion: ${gap.suggestion}\n`;
      });
      prompt += `\n`;
    }

    prompt += `**Improvement Priorities:**\n`;
    validationResult.improvementPriorities.forEach((priority, i) => {
      prompt += `${i + 1}. ${priority}\n`;
    });
    prompt += `\n`;

    prompt += `**Original Questionnaire Data:**\n`;
    prompt += `- MISSION_STATEMENT: ${questionnaire.MISSION_STATEMENT || 'N/A'}\n`;
    prompt += `- TARGET_USERS: ${questionnaire.TARGET_USERS || 'N/A'}\n`;
    prompt += `- INITIAL_SCOPE: ${questionnaire.INITIAL_SCOPE || 'N/A'}\n`;
    prompt += `- TECHNICAL_CONSIDERATIONS: ${questionnaire.TECHNICAL_CONSIDERATIONS || 'N/A'}\n`;
    prompt += `- SECURITY_AND_COMPLIANCE_REQUIREMENTS: ${questionnaire.SECURITY_AND_COMPLIANCE_REQUIREMENTS || 'N/A'}\n\n`;

    prompt += `Generate an improved version of the project documentation that addresses all the issues identified above. `;
    prompt += `Maintain the existing strengths while fixing the identified problems. `;
    prompt += `Return ONLY the improved markdown content, not wrapped in JSON.`;

    // Call validation provider to regenerate documentation
    const improvedDoc = await this.retryWithBackoff(
      () => provider.generateText(prompt, creatorAgent),
      'documentation improvement'
    );

    return improvedDoc;
  }

  /**
   * Improve context based on validation feedback
   */
  async improveContext(contextContent, validationResult, level, questionnaire) {
    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    // Use validation provider if available, otherwise skip improvement
    const provider = this.validationLLMProvider;
    if (!provider || typeof provider.generateText !== 'function') {
      console.log('⚠️  Skipping improvement (validation provider not available)\n');
      return contextContent;
    }

    // Read context generator agent
    const generatorAgent = this.loadAgentInstructions('project-context-generator.md');

    // Build improvement prompt with validation feedback
    let prompt = `Improve the following project context based on validation feedback:\n\n`;

    prompt += `**Context Level:** ${level}\n\n`;
    prompt += `**Current context.md:**\n\`\`\`markdown\n${contextContent}\n\`\`\`\n\n`;

    prompt += `**Validation Feedback:**\n`;
    prompt += `- Overall Score: ${validationResult.overallScore}/100\n`;
    prompt += `- Status: ${validationResult.validationStatus}\n`;
    prompt += `- Estimated Token Budget: ${validationResult.estimatedTokenBudget} tokens\n\n`;

    if (validationResult.issues && validationResult.issues.length > 0) {
      prompt += `**Issues to Fix:**\n`;
      validationResult.issues.forEach((issue, i) => {
        prompt += `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category} - ${issue.section}: ${issue.description}\n`;
        prompt += `   Suggestion: ${issue.suggestion}\n`;
      });
      prompt += `\n`;
    }

    prompt += `**Improvement Priorities:**\n`;
    validationResult.improvementPriorities.forEach((priority, i) => {
      prompt += `${i + 1}. ${priority}\n`;
    });
    prompt += `\n`;

    if (level === 'project' && questionnaire) {
      prompt += `**Original Questionnaire Data:**\n`;
      prompt += `- MISSION_STATEMENT: ${questionnaire.MISSION_STATEMENT || 'N/A'}\n`;
      prompt += `- TARGET_USERS: ${questionnaire.TARGET_USERS || 'N/A'}\n`;
      prompt += `- INITIAL_SCOPE: ${questionnaire.INITIAL_SCOPE || 'N/A'}\n`;
      prompt += `- TECHNICAL_CONSIDERATIONS: ${questionnaire.TECHNICAL_CONSIDERATIONS || 'N/A'}\n`;
      prompt += `- SECURITY_AND_COMPLIANCE_REQUIREMENTS: ${questionnaire.SECURITY_AND_COMPLIANCE_REQUIREMENTS || 'N/A'}\n\n`;
    }

    prompt += `Generate an improved version of the context that addresses all the issues identified above. `;
    prompt += `Maintain the existing strengths while fixing the identified problems. `;
    prompt += `Aim for ${validationResult.estimatedTokenBudget} tokens or less. `;
    prompt += `Return ONLY the improved markdown content, not wrapped in JSON.`;

    // Call validation provider to regenerate context
    const improvedContext = await this.retryWithBackoff(
      () => provider.generateText(prompt, generatorAgent),
      'context improvement'
    );

    return improvedContext;
  }

  /**
   * Iterative validation and improvement loop
   */
  async iterativeValidation(content, type, questionnaire, contextContent = null) {
    const settings = this.getValidationSettings();
    const maxIterations = settings.maxIterations || 2;
    const threshold = settings.acceptanceThreshold || 75;

    let currentContent = content;
    let iteration = 0;

    while (iteration < maxIterations) {
      // Report validation iteration progress
      const validationType = type === 'documentation' ? 'Project Brief structure' : 'project context';
      this.reportSubstep(`Validation ${iteration + 1}/${maxIterations}: Validating ${validationType}...`);
      const validation = type === 'documentation'
        ? await this.validateDocument(currentContent, questionnaire, contextContent)
        : await this.validateContext(currentContent, 'project', questionnaire);

      this.reportSubstep('Analyzing validation results...');

      // Report token usage
      if (this.validationLLMProvider && typeof this.validationLLMProvider.getTokenUsage === 'function') {
        const usage = this.validationLLMProvider.getTokenUsage();
        this.reportSubstep('Validation complete', {
          tokensUsed: {
            input: usage.inputTokens,
            output: usage.outputTokens
          }
        });
      }

      // Display results
      console.log(`📊 Score: ${validation.overallScore}/100`);
      console.log(`   Status: ${validation.validationStatus}`);

      // Count issues by severity
      const issues = validation.issues || validation.contentIssues || [];
      const structuralIssues = validation.structuralIssues || [];
      const flowGaps = validation.applicationFlowGaps || [];
      const allIssues = [...issues, ...structuralIssues];

      const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
      const majorCount = allIssues.filter(i => i.severity === 'major').length;
      const minorCount = allIssues.filter(i => i.severity === 'minor').length;

      if (allIssues.length > 0 || flowGaps.length > 0) {
        console.log(`   Issues: ${criticalCount} critical, ${majorCount} major, ${minorCount} minor`);
        if (flowGaps.length > 0) {
          console.log(`   Flow gaps: ${flowGaps.length}`);
        }

        // Show top 3 issues
        const topIssues = allIssues.slice(0, 3);
        topIssues.forEach(issue => {
          const icon = issue.severity === 'critical' ? '❌' : issue.severity === 'major' ? '⚠️' : 'ℹ️';
          const section = issue.section || issue.category;
          const desc = issue.description || issue.issue;
          console.log(`   ${icon} ${section}: ${desc.substring(0, 80)}${desc.length > 80 ? '...' : ''}`);
        });
      } else {
        console.log(`   ✅ No issues found`);
      }

      // Check if ready
      const isReady = type === 'documentation'
        ? validation.readyForPublication
        : validation.readyForUse;

      if (isReady && validation.overallScore >= threshold) {
        console.log(`\n   ✅ ${type === 'context' ? 'context scope' : type} passed validation!\n`);
        break;
      }

      // Check if max iterations reached
      if (iteration + 1 >= maxIterations) {
        console.log(`\n   ⚠️  Max iterations reached. Accepting current version.\n`);
        break;
      }

      // Improve
      console.log(`\n🔄 Improving ${type === 'context' ? 'context scope' : type} based on feedback...\n`);
      const improvementType = type === 'documentation' ? 'Project Brief' : 'project context';
      this.reportSubstep(`Improving ${improvementType} based on validation...`);
      currentContent = type === 'documentation'
        ? await this.improveDocument(currentContent, validation, questionnaire)
        : await this.improveContext(currentContent, validation, 'project', questionnaire);

      // Report token usage after improvement
      if (this.validationLLMProvider && typeof this.validationLLMProvider.getTokenUsage === 'function') {
        const usage = this.validationLLMProvider.getTokenUsage();
        this.reportSubstep('Applying improvements...', {
          tokensUsed: {
            input: usage.inputTokens,
            output: usage.outputTokens
          }
        });
      } else {
        this.reportSubstep('Applying improvements...');
      }

      iteration++;
    }

    return currentContent;
  }
}

export { TemplateProcessor };
