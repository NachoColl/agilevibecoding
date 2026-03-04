import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { LLMProvider } from './llm-provider.js';
import { LLMVerifier } from './llm-verifier.js';
import { TokenTracker } from './token-tracker.js';
import { VerificationTracker } from './verification-tracker.js';
import { fileURLToPath } from 'url';
import { sendError, sendWarning, sendSuccess, sendInfo, sendOutput, sendIndented, sendSectionHeader, sendProgress } from './messaging-api.js';
import { loadAgent } from './agent-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Module-level debug log file path.
 * Set via TemplateProcessor.setDebugLogFile() from repl-ink.js before creating
 * any TemplateProcessor instance. When null, debug() is silent (no terminal output).
 * This ensures diagnostic output NEVER corrupts the Ink UI.
 */
let _debugLogFile = null;

/**
 * Debug logging helper - writes directly to the log file, never to the terminal.
 * @param {string} message - Log message
 * @param {Object} data - Optional data to log
 */
function debug(message, data = null) {
  if (!_debugLogFile) return;
  const timestamp = new Date().toISOString();
  const line = data !== null
    ? `[${timestamp}] [DEBUG] ${message}\n${JSON.stringify(data, null, 2)}\n`
    : `[${timestamp}] [DEBUG] ${message}\n`;
  try { fs.appendFileSync(_debugLogFile, line, 'utf8'); } catch (_) {}
}

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
  constructor(ceremonyName = 'sponsor-call', progressPath = null, nonInteractive = false, options = {}) {
    // Load environment variables from project .env
    dotenv.config({ path: path.join(process.cwd(), '.env') });

    debug('TemplateProcessor constructor called', { ceremonyName, nonInteractive });

    this.ceremonyName = ceremonyName;

    // Initialize verification tracker
    this.verificationTracker = new VerificationTracker(ceremonyName);
    this.templatePath = path.join(__dirname, 'templates/project.md');
    this.outputDir = path.join(process.cwd(), '.avc/project');
    this.outputPath = path.join(this.outputDir, 'doc.md');
    this.avcConfigPath = path.join(process.cwd(), '.avc/avc.json');
    this.agentsPath = path.join(__dirname, 'agents');
    this.avcPath = path.join(process.cwd(), '.avc');
    this.progressPath = progressPath;
    this.nonInteractive = nonInteractive;

    // Track verification feedback for agent learning
    this.verificationFeedback = {};

    // Collect validation issues for final ceremony summary
    this.validationIssues = [];

    // Read ceremony-specific configuration
    const { provider, model, validationConfig, stagesConfig } = this.readCeremonyConfig(ceremonyName);
    this._providerName = provider;
    this._modelName = model;
    this.llmProvider = null;
    this.stagesConfig = stagesConfig;

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

    // Read refinement provider config (separate from validator — used in improveDocument)
    const refinementConfig = validationConfig?.refinement;
    this._refinementProvider = refinementConfig?.provider || this._validationProvider;
    this._refinementModel = refinementConfig?.model || this._validationModel;
    this._refinementProviderInstance = null;

    // Initialize token tracker
    this.tokenTracker = new TokenTracker(this.avcPath);
    this.tokenTracker.init();

    // Track last token usage for ceremony history
    this._lastTokenUsage = null;

    // Cost threshold protection
    this._costThreshold = options?.costThreshold ?? null;
    this._costLimitReachedCallback = options?.costLimitReachedCallback ?? null;
    this._runningCost = 0;

    // Progress reporting
    this.progressCallback = null;
    this.activityLog = [];
  }

  /**
   * Strip markdown code fences from content
   * Handles: ```json ... ``` or ``` ... ```
   */
  stripMarkdownCodeFences(content) {
    if (typeof content !== 'string') return content;

    // Remove opening fence (```json, ```JSON, or just ```)
    let stripped = content.replace(/^```(?:json|JSON)?\s*\n?/, '');

    // Remove closing fence (```)
    stripped = stripped.replace(/\n?\s*```\s*$/, '');

    return stripped.trim();
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
  async reportProgress(message, activity = null) {
    if (this.progressCallback) {
      await this.progressCallback(message);
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
  async reportSubstep(substep, metadata = {}) {
    if (this.progressCallback) {
      await this.progressCallback(null, substep, metadata);
    }
  }

  /**
   * Report a level-3 detail line to callback
   * @param {string} detail - The detail message
   */
  async reportDetail(detail) {
    if (this.progressCallback) {
      await this.progressCallback(null, null, { detail });
    }
  }

  /**
   * Report progress with small delay to ensure UI updates
   * Adds async delay to force React state updates and re-renders between stages
   * @param {string} message - Main progress message
   * @param {string} activity - Activity to log
   * @param {number} delayMs - Delay in milliseconds (default 50ms)
   */
  async reportProgressWithDelay(message, activity = null, delayMs = 50) {
    await this.reportProgress(message, activity);
    // Only delay in non-interactive mode (REPL UI) to allow UI re-renders
    if (!this.nonInteractive && this.progressCallback) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
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
        sendWarning(`Ceremony '${ceremonyName}' not found in config, using defaults`);
        return {
          provider: 'claude',
          model: 'claude-sonnet-4-5-20250929',
          validationConfig: null,
          stagesConfig: null
        };
      }

      return {
        provider: ceremony.provider || 'claude',
        model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929',
        validationConfig: ceremony.validation || null,
        stagesConfig: ceremony.stages || null
      };
    } catch (error) {
      sendWarning(`Could not read ceremony config: ${error.message}`);
      return {
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        validationConfig: null,
        stagesConfig: null
      };
    }
  }

  /**
   * Get provider and model for a specific stage
   * Falls back to ceremony-level config if stage-specific config not found
   * @param {string} stageName - Stage name ('suggestions', 'documentation')
   * @returns {Object} { provider, model }
   */
  getProviderForStage(stageName) {
    // Check if stage-specific config exists
    if (this.stagesConfig && this.stagesConfig[stageName]) {
      const stageConfig = this.stagesConfig[stageName];
      return {
        provider: stageConfig.provider || this._providerName,
        model: stageConfig.model || this._modelName
      };
    }

    // Fall back to ceremony-level config
    return {
      provider: this._providerName,
      model: this._modelName
    };
  }

  /**
   * Get provider and model for validation of a specific content type
   * Falls back to ceremony-level validation config if type-specific config not found
   * @param {string} validationType - Validation type ('documentation')
   * @returns {Object} { provider, model }
   */
  getValidationProviderForType(validationType) {
    // Check if type-specific validation config exists
    if (this.validationConfig && this.validationConfig[validationType]) {
      const typeConfig = this.validationConfig[validationType];
      return {
        provider: typeConfig.provider || this._validationProvider,
        model: typeConfig.model || this._validationModel
      };
    }

    // Fall back to ceremony-level validation config
    return {
      provider: this._validationProvider,
      model: this._validationModel
    };
  }

  /**
   * Read defaults from avc.json questionnaire configuration
   */
  readDefaults() {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      return config.settings?.questionnaire?.defaults || {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Get human-readable feedback for a rule violation
   * @param {string} ruleId - Rule ID
   * @returns {string} - Feedback message
   */
  getRuleFeedback(ruleId) {
    const feedbackMap = {
      'valid-json': 'You wrapped JSON in markdown code fences (```json). Output raw JSON only, no markdown formatting.',
      'required-fields': 'You missed required JSON fields. Include all mandatory fields as specified in the output format.',
      'array-fields': 'Field that should be an array was output as a different type. Check array field requirements.',
      'required-validator-fields': 'Validator output missing required fields. Include validationStatus, overallScore, and issues.',
      'score-range': 'Score must be between 0-100. Check your overallScore value.',
      'valid-severity': 'Invalid severity value. Use only: critical, major, or minor.',
      'valid-status': 'Invalid status value. Use only the allowed status values from the spec.'
    };
    return feedbackMap[ruleId] || `Rule "${ruleId}" was violated. Follow the output format exactly.`;
  }

  /**
   * Enhance prompt with verification feedback from previous runs
   * @param {string} prompt - Original prompt
   * @param {string} agentName - Agent name to get feedback for
   * @returns {string} - Enhanced prompt with feedback
   */
  enhancePromptWithFeedback(prompt, agentName) {
    const feedback = this.verificationFeedback[agentName];

    if (!feedback || feedback.length === 0) {
      return prompt;
    }

    const feedbackText = `
WARNING: **LEARN FROM PREVIOUS MISTAKES**

In your last run, verification found these issues that you MUST avoid:

${feedback.map((rule, idx) => `${idx + 1}. **${rule.ruleName}** (${rule.severity}):
   ${this.getRuleFeedback(rule.ruleId)}`).join('\n\n')}

Please carefully follow the output format requirements to avoid these issues.

---

`;

    return feedbackText + prompt;
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
        sendWarning(`Agent instruction file not found: ${agentFileName}`);
        return null;
      }
      return fs.readFileSync(agentPath, 'utf8');
    } catch (error) {
      sendWarning(`Could not load agent instructions: ${error.message}`);
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
      sendWarning(`Could not get agent for stage ${stage}: ${error.message}`);
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

    sendSectionHeader(name);
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

    sendSectionHeader(name);
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
   * Register a per-call token callback on a provider instance.
   * Saves tokens to disk after every LLM API call for crash-safe accounting.
   * @param {LLMProvider} provider - Provider to register on
   * @param {string} ceremonyType - Ceremony type key (e.g., 'sponsor-call')
   */
  _registerTokenCallback(provider, ceremonyType) {
    if (!provider) return;
    provider.onCall((delta) => {
      this.tokenTracker.addIncremental(ceremonyType, delta);
      if (delta.model) {
        const cost = this.tokenTracker.calculateCost(delta.input, delta.output, delta.model);
        this._runningCost += cost?.total ?? 0;
      }
    });
  }

  /**
   * Initialize LLM provider
   */
  async initializeLLMProvider() {
    try {
      // Initialize main provider
      this.llmProvider = await LLMProvider.create(this._providerName, this._modelName);
      this._registerTokenCallback(this.llmProvider, this.ceremonyName);
      debug(`Using ${this._providerName} (${this._modelName}) for generation`);

      // Initialize validation provider if validation is enabled
      if (this._validationProvider) {
        debug(`Using ${this._validationProvider} (${this._validationModel}) for validation`);
        this.validationLLMProvider = await LLMProvider.create(
          this._validationProvider,
          this._validationModel
        );
        this._registerTokenCallback(this.validationLLMProvider, `${this.ceremonyName}-validation`);
      }

      return this.llmProvider;
    } catch (error) {
      sendWarning(`Could not initialize LLM provider`);
      console.log(`${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create LLM provider for a specific stage
   * @param {string} stageName - Stage name ('suggestions', 'documentation')
   * @returns {Promise<LLMProvider>} LLM provider instance
   */
  async getProviderForStageInstance(stageName) {
    const { provider, model } = this.getProviderForStage(stageName);

    // Check if we already have a provider for this stage
    const cacheKey = `${stageName}:${provider}:${model}`;
    if (!this._stageProviders) {
      this._stageProviders = {};
    }

    if (this._stageProviders[cacheKey]) {
      return this._stageProviders[cacheKey];
    }

    // Create new provider
    const providerInstance = await LLMProvider.create(provider, model);
    this._registerTokenCallback(providerInstance, this.ceremonyName);
    this._stageProviders[cacheKey] = providerInstance;

    debug(`Using ${provider} (${model}) for ${stageName}`);

    return providerInstance;
  }

  /**
   * Get or create validation provider for a specific content type
   * @param {string} validationType - Validation type ('documentation')
   * @returns {Promise<LLMProvider>} LLM provider instance
   */
  async getValidationProviderForTypeInstance(validationType) {
    const { provider, model } = this.getValidationProviderForType(validationType);

    // Check if we already have a provider for this validation type
    const cacheKey = `validation:${validationType}:${provider}:${model}`;
    if (!this._validationProviders) {
      this._validationProviders = {};
    }

    if (this._validationProviders[cacheKey]) {
      return this._validationProviders[cacheKey];
    }

    // Create new provider
    const providerInstance = await LLMProvider.create(provider, model);
    this._registerTokenCallback(providerInstance, `${this.ceremonyName}-validation`);
    this._validationProviders[cacheKey] = providerInstance;

    debug(`Using ${provider} (${model}) for ${validationType} validation`);

    return providerInstance;
  }

  /**
   * Get or create LLM provider for document refinement (improvement after validation).
   * Uses validation.refinement config if set, otherwise falls back to validation provider.
   * @returns {Promise<LLMProvider>} LLM provider instance
   */
  async getRefinementProviderInstance() {
    if (this._refinementProviderInstance) {
      return this._refinementProviderInstance;
    }

    const provider = this._refinementProvider;
    const model = this._refinementModel;

    if (!provider || !model) {
      return this.getValidationProviderForTypeInstance('documentation');
    }

    const providerInstance = await LLMProvider.create(provider, model);
    this._registerTokenCallback(providerInstance, `${this.ceremonyName}-refinement`);
    this._refinementProviderInstance = providerInstance;

    debug(`Using ${provider} (${model}) for document refinement`);
    return providerInstance;
  }

  /**
   * Run an async fn while emitting periodic heartbeat substep messages.
   * Clears the interval once fn resolves or rejects.
   * @param {Function} fn - Async function to run
   * @param {Function} getMessageFn - Called with elapsed seconds, returns substep string
   * @param {number} intervalMs - How often to emit (default 10s)
   */
  async withHeartbeat(fn, getMessageFn, intervalMs = 10000) {
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      this.reportDetail(getMessageFn(elapsed)).catch(() => {});
    }, intervalMs);
    try {
      return await fn();
    } finally {
      clearInterval(timer);
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
        sendWarning(`Retry ${attempt}/${maxRetries} in ${delay/1000}s: ${operation}`);
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
      'TARGET_USERS': 'suggestion-ux-researcher.md',
      'INITIAL_SCOPE': 'suggestion-product-manager.md',
      'DEPLOYMENT_TARGET': 'suggestion-deployment-architect.md',
      'TECHNICAL_CONSIDERATIONS': 'suggestion-technical-architect.md',
      'SECURITY_AND_COMPLIANCE_REQUIREMENTS': 'suggestion-security-specialist.md'
    };

    const agentFile = agentMap[variableName];
    if (!agentFile) {
      return null;
    }

    try {
      return loadAgent(agentFile, path.dirname(this.avcPath));
    } catch {
      sendWarning(`Agent file not found: ${agentFile}`);
      return null;
    }
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
    try {
      // Get stage-specific provider for suggestions
      const provider = await this.getProviderForStageInstance('suggestions');

      // Get domain-specific agent for this variable
      const agentInstructions = this.getAgentForVariable(variableName);

      if (agentInstructions) {
        // Use domain-specific agent with context
        const prompt = this.buildPrompt(variableName, isPlural, context);
        debug(`Using specialized agent: ${variableName.toLowerCase().replace(/_/g, '-')}`);

        const text = await this.retryWithBackoff(
          () => provider.generate(prompt, isPlural ? 512 : 1024, agentInstructions),
          `${variableName} suggestion`
        );

        return this.parseLLMResponse(text, isPlural);
      } else {
        // Fallback to generic prompt if no agent available
        const prompt = this.buildPrompt(variableName, isPlural, context);
        const text = await provider.generate(prompt, isPlural ? 512 : 256);
        return this.parseLLMResponse(text, isPlural);
      }
    } catch (error) {
      sendWarning(`Could not generate suggestions: ${error.message}`);
      return null;
    }
  }

  /**
   * Prompt user for a variable value
   * Returns { variable, value, source, skipped }
   */
  async promptUser(variable, context) {
    let value;

    // In non-interactive mode, skip readline prompts and use defaults/AI
    if (this.nonInteractive) {
      // No section header output — silent AI generation to avoid polluting terminal output
      sendProgress(`Generating AI suggestion for ${variable.displayName}...`);
      value = null; // Force AI generation
    } else {
      // Interactive mode - use readline prompts
      if (variable.isPlural) {
        value = await this.promptPlural(variable.displayName, variable.guidance);
      } else {
        value = await this.promptSingular(variable.displayName, variable.guidance);
      }
    }

    // If user skipped (or non-interactive mode), try to use default or generate AI suggestions
    if (value === null) {
      // Check if there's a default for this variable
      const defaults = this.readDefaults();
      const defaultValue = defaults[variable.name];

      if (defaultValue) {
        sendInfo('Using default from settings...');
        value = variable.isPlural
          ? (Array.isArray(defaultValue) ? defaultValue : [defaultValue])
          : defaultValue;

        sendSuccess('Default applied:');
        if (Array.isArray(value)) {
          value.forEach((item, idx) => console.log(`${idx + 1}. ${item}`));
        } else {
          console.log(`${value}`);
        }
        return { variable: variable.name, value, source: 'default', skipped: false };
      }

      // No default available, try AI suggestions
      sendInfo('Generating AI suggestion...');
      value = await this.generateSuggestions(variable.name, variable.isPlural, context);

      if (value) {
        sendSuccess('AI suggestion:');
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
  async generateFinalDocument(templateWithValues, questionnaire = null) {
    const t0 = Date.now();
    debug('generateFinalDocument called', {
      templateLength: templateWithValues?.length,
      hasQuestionnaire: !!questionnaire,
      ceremony: this.ceremonyName
    });
    try {
      // Get stage-specific provider for documentation
      const provider = await this.getProviderForStageInstance('documentation');

      // Try to load agent instructions for enhancement stage
      this.reportSubstep('Reading agent: project-documentation-creator.md');
      const agentInstructions = this.getAgentForStage('enhancement');

      if (agentInstructions) {
        // Use agent instructions as system context
        let userPrompt = `Here is the project information with all variables filled in:

${templateWithValues}`;

        // Inject explicit user choices so the LLM cannot override them with defaults
        if (questionnaire) {
          const deploymentTarget = questionnaire.DEPLOYMENT_TARGET || '';
          const isLocal = /local|localhost|dev\s*machine|on.?prem/i.test(deploymentTarget);

          userPrompt += `\n\n**User's Stated Choices — MUST be respected exactly as provided:**
- MISSION_STATEMENT: ${questionnaire.MISSION_STATEMENT || 'N/A'}
- TARGET_USERS: ${questionnaire.TARGET_USERS || 'N/A'}
- INITIAL_SCOPE: ${questionnaire.INITIAL_SCOPE || 'N/A'}
- TECHNICAL_CONSIDERATIONS: ${questionnaire.TECHNICAL_CONSIDERATIONS || 'N/A'}
- DEPLOYMENT_TARGET: ${deploymentTarget || 'N/A'}
- TECHNICAL_EXCLUSIONS: ${questionnaire.TECHNICAL_EXCLUSIONS || 'None'}
- SECURITY_AND_COMPLIANCE_REQUIREMENTS: ${questionnaire.SECURITY_AND_COMPLIANCE_REQUIREMENTS || 'N/A'}`;

          if (isLocal) {
            userPrompt += `\n\n**DEPLOYMENT CONSTRAINT — CRITICAL:**
The user has chosen LOCAL deployment ("${deploymentTarget}").
- The Deployment Environment section MUST describe local-first setup only (e.g. Docker Compose, localhost, local DB, npm run dev).
- Do NOT add cloud providers (AWS, GCP, Azure), managed services, Kubernetes, Terraform, CI/CD pipelines, or any cloud infrastructure.
- Do NOT suggest migration to cloud unless the user's INITIAL_SCOPE or TECHNICAL_CONSIDERATIONS explicitly requests it.
- Infrastructure means: local processes, local database, local file system.`;
          }

          if (questionnaire.TECHNICAL_EXCLUSIONS) {
            userPrompt += `\n\n**TECHNOLOGY EXCLUSION CONSTRAINT — CRITICAL:**
The user has explicitly excluded the following from this project:
${questionnaire.TECHNICAL_EXCLUSIONS}
- These technologies MUST NOT appear as recommendations anywhere in the document.
- Add an "Explicitly Excluded Technologies" subsection in section 6 (Technical Architecture).
- Do NOT soften with "consider using" or "if needed" language.`;
          }
        }

        userPrompt += `\n\nPlease review and enhance this document according to your role.`;

        // Enhance prompt with verification feedback if available
        userPrompt = this.enhancePromptWithFeedback(userPrompt, 'project-documentation-creator');

        this.reportSubstep('Generating Project Brief (this may take 20-30 seconds)...');
        await this.reportDetail(`Sending to ${provider.providerName || 'LLM'} (${provider.model || ''})…`);
        const enhanced = await this.withHeartbeat(
          () => this.retryWithBackoff(
            () => provider.generate(userPrompt, 4096, agentInstructions),
            'document enhancement'
          ),
          (elapsed) => {
            if (elapsed < 15) return 'Structuring project documentation…';
            if (elapsed < 30) return 'Writing mission and scope sections…';
            if (elapsed < 45) return 'Generating technical architecture…';
            if (elapsed < 60) return 'Finalizing project brief…';
            return `Generating Project Brief… (${elapsed}s)`;
          },
          15000
        );

        // Report token usage after generation
        if (provider && typeof provider.getTokenUsage === 'function') {
          const usage = provider.getTokenUsage();
          this.reportSubstep('Processing generated content...', {
            tokensUsed: {
              input: usage.inputTokens,
              output: usage.outputTokens
            }
          });
          await this.reportDetail(`${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out tokens`);
        }

        // Post-process verification
        this.reportSubstep('Verifying documentation quality...');
        const verifier = new LLMVerifier(provider, 'project-documentation-creator', this.verificationTracker);
        const verificationResult = await verifier.verify(
          enhanced,
          (mainMsg, substep) => this.reportSubstep(substep)
        );

        if (verificationResult.rulesApplied.length > 0) {
          this.reportSubstep(`Applied ${verificationResult.rulesApplied.length} fixes`);

          // Store feedback for agent learning
          this.verificationFeedback['project-documentation-creator'] = verificationResult.rulesApplied.map(rule => ({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity
          }));

          // Collect for final ceremony summary
          for (const rule of verificationResult.rulesApplied) {
            this.validationIssues.push({ stage: 'Project Documentation', ruleId: rule.id, name: rule.name, severity: rule.severity, description: rule.description });
          }
        }

        debug('generateFinalDocument complete (agent path)', { duration: `${Date.now() - t0}ms`, resultLength: verificationResult.content?.length });
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

        this.reportSubstep('Generating Project Brief (this may take 20-30 seconds)...');
        await this.reportDetail(`Sending to ${provider.providerName || 'LLM'} (${provider.model || ''})…`);
        const enhanced = await this.withHeartbeat(
          () => this.retryWithBackoff(
            () => provider.generate(legacyPrompt, 4096),
            'document enhancement (legacy)'
          ),
          (elapsed) => {
            if (elapsed < 15) return 'Structuring project documentation…';
            if (elapsed < 30) return 'Writing mission and scope sections…';
            if (elapsed < 45) return 'Generating technical architecture…';
            return `Generating Project Brief… (${elapsed}s)`;
          },
          15000
        );
        if (provider && typeof provider.getTokenUsage === 'function') {
          const usage = provider.getTokenUsage();
          await this.reportDetail(`${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out tokens`);
        }
        debug('generateFinalDocument complete (legacy path)', { duration: `${Date.now() - t0}ms`, resultLength: enhanced?.length });
        return enhanced;
      }
    } catch (error) {
      debug('generateFinalDocument error - returning template as-is', { error: error.message, duration: `${Date.now() - t0}ms` });
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
        sendInfo('VitePress documentation folder not found, skipping sync');
        return false;
      }

      // Write to .avc/documentation/index.md
      fs.writeFileSync(indexPath, content, 'utf8');
      debug('Synced to .avc/documentation/index.md');
      return true;
    } catch (error) {
      sendWarning(`Could not sync to VitePress: ${error.message}`);
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

      sendSuccess('VitePress build completed');
      return true;
    } catch (error) {
      sendWarning(`VitePress build failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Write document to file
   */
  async writeDocument(content) {
    const fileSize = Math.ceil(Buffer.byteLength(content, 'utf8') / 1024);
    debug('writeDocument called', { outputPath: this.outputPath, sizeKB: fileSize });

    // Create .avc/project/ directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Write doc.md
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
    debug('Starting processTemplate', { hasInitialProgress: !!initialProgress, ceremony: this.ceremonyName });
    debug('Project Setup Questionnaire');

    // Cost threshold protection — wrap callback to check running cost before each progress call
    if (this._costThreshold != null && this.progressCallback) {
      const _origCallback = this.progressCallback;
      this.progressCallback = async (...args) => {
        if (this._costThreshold != null && this._runningCost >= this._costThreshold) {
          if (this._costLimitReachedCallback) {
            this._costThreshold = null; // disable re-triggering
            await this._costLimitReachedCallback(this._runningCost);
            // returns → ceremony continues with limit disabled
          } else {
            throw new Error(`COST_LIMIT_EXCEEDED:${this._runningCost.toFixed(6)}`);
          }
        }
        return _origCallback(...args);
      };
    }

    // 1. Read template
    debug('Reading template file', { templatePath: this.templatePath });
    const templateContent = fs.readFileSync(this.templatePath, 'utf8');
    debug('Template loaded', { size: templateContent.length });

    // 2. Extract variables
    debug('Extracting variables from template');
    const variables = this.extractVariables(templateContent);
    debug('Variables extracted', { count: variables.length, names: variables.map(v => v.name) });

    // 3. Initialize or restore progress
    let collectedValues = {};
    let answeredCount = 0;

    if (initialProgress && initialProgress.collectedValues) {
      debug('Restoring from initial progress', { answeredCount: Object.keys(initialProgress.collectedValues).length });
      collectedValues = { ...initialProgress.collectedValues };
      answeredCount = Object.keys(collectedValues).length;

      // Check if ALL answers are pre-filled (from REPL questionnaire)
      if (answeredCount === variables.length) {
        debug(`Using ${answeredCount} pre-filled answers from questionnaire`);

        // Use pre-filled answers, but check defaults or AI for skipped (null) answers
        for (const variable of variables) {
          if (collectedValues[variable.name] === null) {
            // No section header — silent fill to avoid polluting terminal output during ceremony

            // First, check if there's a default for this question
            const defaults = this.readDefaults();
            const defaultValue = defaults[variable.name];

            if (defaultValue) {
              sendSuccess('Using default from settings');
              collectedValues[variable.name] = variable.isPlural
                ? (Array.isArray(defaultValue) ? defaultValue : [defaultValue])
                : defaultValue;
            } else {
              // No default found, generate AI suggestion
              sendProgress('Generating AI suggestion...');
              const aiValue = await this.generateSuggestions(variable.name, variable.isPlural, collectedValues);
              collectedValues[variable.name] = aiValue || '';
            }
          }
        }
      } else {
        sendOutput(`Resuming with ${answeredCount}/${variables.length} questions already answered.\n`);

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

    // Compute total stages based on what will actually run for this ceremony
    const _scValidation = this.ceremonyName === 'sponsor-call' && this.isValidationEnabled();
    const _T = 5 + (_scValidation ? 1 : 0);
    let _s = 0;

    // Report questionnaire completion (with delay for UI update)
    await this.reportProgressWithDelay(`Stage ${++_s}/${_T}: Processing questionnaire answers...`, 'Processed questionnaire responses');

    // 5. Replace variables in template
    await this.reportProgressWithDelay(`Stage ${++_s}/${_T}: Preparing project template...`, 'Template preparation complete');
    this.reportSubstep('Reading template: project.md');
    const templateWithValues = this.replaceVariables(templateContent, collectedValues);
    this.reportSubstep('Replaced 6 template variables');

    // Preparation complete
    await this.reportProgressWithDelay(`Stage ${++_s}/${_T}: Preparing for documentation generation...`, 'Ready to generate documentation');

    // 6. Enhance document with LLM
    await this.reportProgressWithDelay(`Stage ${++_s}/${_T}: Creating project documentation...`, 'Created project documentation');
    let finalDocument = await this.generateFinalDocument(templateWithValues, collectedValues);

    // 7. Validate and improve documentation (if validation enabled)
    if (this.ceremonyName === 'sponsor-call' && this.isValidationEnabled()) {
      ++_s;
      finalDocument = await this.iterativeValidation(finalDocument, 'documentation', collectedValues, _s, _T);
    }

    // 8. Write documentation to file
    await this.writeDocument(finalDocument);
    this.reportSubstep('Wrapping up...');

    // 11. Track token usage (only for sponsor-call)
    let tokenUsage = null;
    let cost = null;
    if (this.ceremonyName === 'sponsor-call') {
      ({ tokenUsage, cost } = this.saveCurrentTokenTracking());
    }

    // 12. Return comprehensive result
    // Save verification tracking summary
    if (this.verificationTracker) {
      try {
        this.verificationTracker.logCeremonySummary();
        const { jsonPath, summaryPath } = this.verificationTracker.saveToFile();

        if (jsonPath && summaryPath) {
          debug('Verification tracking saved', { json: jsonPath, summary: summaryPath });
        }

        // Clean up old verification logs (keep last 10)
        VerificationTracker.cleanupOldLogs(this.ceremonyName);
      } catch (error) {
        console.error('Error saving verification tracking:', error.message);
      }
    }

    return {
      outputPath: this.outputPath,
      activities: this.activityLog,
      tokenUsage: tokenUsage,
      cost: cost,
      model: this._modelName,
      validationIssues: this.validationIssues
    };
  }

  /**
   * Aggregate token usage from all providers, write to token-history.json, and cache on this instance.
   * Safe to call at any point (success or partial/cancelled run).
   * @returns {{ tokenUsage: Object|null, cost: Object|null }}
   */
  saveCurrentTokenTracking() {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCalls = 0;
    const stageBreakdown = {};

    if (this._stageProviders) {
      for (const [cacheKey, provider] of Object.entries(this._stageProviders)) {
        if (typeof provider.getTokenUsage === 'function') {
          const usage = provider.getTokenUsage();
          totalInput += usage.inputTokens || 0;
          totalOutput += usage.outputTokens || 0;
          totalCalls += usage.totalCalls || 0;
          const stageName = cacheKey.split(':')[0];
          stageBreakdown[stageName] = { input: usage.inputTokens, output: usage.outputTokens, calls: usage.totalCalls };
        }
      }
    }

    if (this._validationProviders) {
      for (const [cacheKey, provider] of Object.entries(this._validationProviders)) {
        if (typeof provider.getTokenUsage === 'function') {
          const usage = provider.getTokenUsage();
          totalInput += usage.inputTokens || 0;
          totalOutput += usage.outputTokens || 0;
          totalCalls += usage.totalCalls || 0;
          const validationType = cacheKey.split(':')[1];
          stageBreakdown[`validation:${validationType}`] = { input: usage.inputTokens, output: usage.outputTokens, calls: usage.totalCalls };
        }
      }
    }

    if (totalInput === 0 && totalOutput === 0 && this.llmProvider && typeof this.llmProvider.getTokenUsage === 'function') {
      const usage = this.llmProvider.getTokenUsage();
      totalInput = usage.inputTokens || 0;
      totalOutput = usage.outputTokens || 0;
      totalCalls = usage.totalCalls || 0;
    }

    if (totalInput === 0 && totalOutput === 0) return { tokenUsage: null, cost: null };

    const cost = this.tokenTracker.calculateCost(totalInput, totalOutput, this._modelName);

    this._lastTokenUsage = {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      totalCalls: totalCalls
    };

    const tokenUsage = {
      input: totalInput,
      output: totalOutput,
      total: totalInput + totalOutput,
      calls: totalCalls,
      stageBreakdown: stageBreakdown
    };

    return { tokenUsage, cost };
  }

  /**
   * Get token usage from last LLM execution
   * @returns {Object|null} Token usage object or null
   */
  getLastTokenUsage() {
    return this._lastTokenUsage;
  }

  /**
   * Generate hierarchical work items (Project → Epic → Story)
   * (Now used by Project Expansion ceremony)
   * @param {Object} collectedValues - Values from questionnaire
   */
  async generateHierarchy(collectedValues) {
    const t0 = Date.now();
    debug('generateHierarchy called', { ceremony: this.ceremonyName, valuesCount: Object.keys(collectedValues).length });
    sendSectionHeader('Generating project hierarchy...');

    // Read agent instructions
    const epicStoryDecomposerAgent = loadAgent('epic-story-decomposer.md', path.dirname(this.avcPath));

    // 1. Decompose into Epics and Stories
    sendInfo('Stage 5/6: Decomposing features into Epics and Stories...');
    const decompositionPrompt = this.buildDecompositionPrompt(collectedValues);
    const hierarchy = await this.retryWithBackoff(
      () => this.llmProvider.generateJSON(decompositionPrompt, epicStoryDecomposerAgent),
      'hierarchy decomposition'
    );

    // Validate response structure
    if (!hierarchy.epics || !Array.isArray(hierarchy.epics)) {
      throw new Error('Invalid hierarchy response: missing epics array');
    }

    sendSuccess(`Generated ${hierarchy.epics.length} Epics with ${hierarchy.validation?.storyCount || 0} Stories`);

    // 2. Write all files to disk
    sendSectionHeader('Stage 6/6: Writing files to disk...');
    await this.writeHierarchyToFiles(hierarchy, collectedValues);

    // Display token usage statistics
    if (this.llmProvider) {
      const mainUsage = this.llmProvider.getTokenUsage();

      sendSectionHeader('Token Usage:');

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

      // Finalize run — tokens already saved per-call via addIncremental
      this.tokenTracker.finalizeRun(this.ceremonyName);

      if (this.validationLLMProvider) {
        this.tokenTracker.finalizeRun(`${this.ceremonyName}-validation`);
      }

      sendSuccess('Token history updated');
      const mainUsageFinal = this.llmProvider.getTokenUsage();
      debug('generateHierarchy complete', {
        duration: `${Date.now() - t0}ms`,
        epicCount: hierarchy?.epics?.length,
        mainProvider: { provider: this._providerName, inputTokens: mainUsageFinal.inputTokens, outputTokens: mainUsageFinal.outputTokens, calls: mainUsageFinal.totalCalls }
      });
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
   * Write hierarchy files to .avc/project/ directory
   * @param {Object} hierarchy - Decomposition result (epics array)
   * @param {Object} collectedValues - Questionnaire responses
   */
  async writeHierarchyToFiles(hierarchy, collectedValues) {
    const projectPath = path.join(this.avcPath, 'project');

    // Write Epic and Story files
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
      sendIndented(`${epic.id}/doc.md`);

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
          ceremony: 'sponsor-call'
        }
      };
      fs.writeFileSync(
        path.join(epicDir, 'work.json'),
        JSON.stringify(epicWorkJson, null, 2),
        'utf8'
      );
      sendIndented(`${epic.id}/work.json`);

      // Write Story files
      for (const story of epic.stories || []) {
        const storyDir = path.join(epicDir, story.id);
        if (!fs.existsSync(storyDir)) {
          fs.mkdirSync(storyDir, { recursive: true });
        }

        // Write Story doc.md (initially empty, updated by retrospective ceremony)
        fs.writeFileSync(
          path.join(storyDir, 'doc.md'),
          `# ${story.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*\n`,
          'utf8'
        );
        sendIndented(`${story.id}/doc.md`);

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
            ceremony: 'sponsor-call'
          }
        };
        fs.writeFileSync(
          path.join(storyDir, 'work.json'),
          JSON.stringify(storyWorkJson, null, 2),
          'utf8'
        );
        sendIndented(`${story.id}/work.json`);
      }

      console.log(''); // Empty line between epics
    }

    sendSuccess(`Hierarchy written to ${projectPath}/`);
    sendSectionHeader(`Summary:`);
    console.log(`   • ${hierarchy.epics.length} Epics (doc.md + work.json each)`);
    console.log(`   • ${hierarchy.validation?.storyCount || 0} Stories (doc.md + work.json each)`);

    const epicCount = hierarchy.epics.length;
    const storyCount = hierarchy.validation?.storyCount || 0;
    const totalFiles = (2 * epicCount) + (2 * storyCount); // Epic: 2 each, Story: 2 each
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
        maxIterations: 3,
        acceptanceThreshold: 95,
        skipOnCriticalIssues: false
      };
    } catch (error) {
      // Default settings if config can't be read
      return {
        enabled: true,
        maxIterations: 3,
        acceptanceThreshold: 95,
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
  async validateDocument(docContent, questionnaire) {
    // Get validation type-specific provider for documentation
    let provider;
    try {
      provider = await this.getValidationProviderForTypeInstance('documentation');
    } catch (error) {
      sendWarning('Skipping validation (validation provider not available)');
      return {
        validationStatus: 'acceptable',
        overallScore: 75,
        issues: [],
        strengths: ['Validation skipped - validation provider not available'],
        improvementPriorities: [],
        readyForPublication: true
      };
    }

    if (!provider || typeof provider.generateJSON !== 'function') {
      sendWarning('Skipping validation (validation provider not available)');
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

    // Enhance prompt with verification feedback if available
    prompt = this.enhancePromptWithFeedback(prompt, 'validator-documentation');

    const deploymentTarget = questionnaire.DEPLOYMENT_TARGET || '';
    const isLocalDeployment = /local|localhost|dev\s*machine|on.?prem/i.test(deploymentTarget);

    prompt += `**Original Questionnaire Data:**\n`;
    prompt += `- MISSION_STATEMENT: ${questionnaire.MISSION_STATEMENT || 'N/A'}\n`;
    prompt += `- TARGET_USERS: ${questionnaire.TARGET_USERS || 'N/A'}\n`;
    prompt += `- INITIAL_SCOPE: ${questionnaire.INITIAL_SCOPE || 'N/A'}\n`;
    prompt += `- TECHNICAL_CONSIDERATIONS: ${questionnaire.TECHNICAL_CONSIDERATIONS || 'N/A'}\n`;
    prompt += `- DEPLOYMENT_TARGET: ${deploymentTarget || 'N/A'}\n`;
    prompt += `- TECHNICAL_EXCLUSIONS: ${questionnaire.TECHNICAL_EXCLUSIONS || 'None'}\n`;
    prompt += `- SECURITY_AND_COMPLIANCE_REQUIREMENTS: ${questionnaire.SECURITY_AND_COMPLIANCE_REQUIREMENTS || 'N/A'}\n\n`;

    if (isLocalDeployment) {
      prompt += `**DEPLOYMENT ALIGNMENT CHECK — CRITICAL:**\n`;
      prompt += `The user chose LOCAL deployment ("${deploymentTarget}").\n`;
      prompt += `Flag as a CRITICAL contentIssue (category: "consistency") any mention of:\n`;
      prompt += `- Cloud providers: AWS, GCP, Google Cloud, Azure, DigitalOcean, Cloudflare, etc.\n`;
      prompt += `- Container orchestration: Kubernetes, ECS, EKS, GKE, AKS, Fargate, etc.\n`;
      prompt += `- Managed cloud services: RDS, S3, CloudFront, Lambda, Firebase, Supabase, etc.\n`;
      prompt += `- CI/CD pipelines: GitHub Actions, GitLab CI, CircleCI, Jenkins, etc. (unless user explicitly mentioned them in TECHNICAL_CONSIDERATIONS)\n`;
      prompt += `- Infrastructure as Code: Terraform, CloudFormation, Pulumi, etc.\n`;
      prompt += `These contradict the user's stated local deployment target and must be removed or replaced with local equivalents.\n\n`;
    }

    if (questionnaire.TECHNICAL_EXCLUSIONS) {
      prompt += `**EXCLUSION ALIGNMENT CHECK — CRITICAL:**\n`;
      prompt += `The user explicitly excluded: ${questionnaire.TECHNICAL_EXCLUSIONS}\n`;
      prompt += `Flag as a CRITICAL contentIssue (category: "consistency") any mention of an excluded technology being recommended, suggested, or used in the document.\n\n`;
    }

    prompt += `Return your validation as JSON following the exact structure specified in your instructions.`;

    // Call validation provider for validation
    const validation = await this.retryWithBackoff(
      () => provider.generateJSON(prompt, validatorAgent),
      'documentation validation'
    );

    // Post-process verification of validator output
    const verifier = new LLMVerifier(provider, 'validator-documentation', this.verificationTracker);
    console.log('[DEBUG] validateDocument - Input to verifier (preview):', JSON.stringify(validation, null, 2).substring(0, 200));
    const verificationResult = await verifier.verify(JSON.stringify(validation, null, 2));
    console.log('[DEBUG] validateDocument - Verification result:', {
      rulesApplied: verificationResult.rulesApplied.map(r => r.id),
      contentLength: verificationResult.content.length,
      contentPreview: verificationResult.content.substring(0, 300)
    });

    if (verificationResult.rulesApplied.length > 0) {
      // Store feedback for agent learning
      this.verificationFeedback['validator-documentation'] = verificationResult.rulesApplied.map(rule => ({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity
      }));

      // Collect for final ceremony summary
      for (const rule of verificationResult.rulesApplied) {
        this.validationIssues.push({ stage: 'Documentation Validation', ruleId: rule.id, name: rule.name, severity: rule.severity, description: rule.description });
      }

      // Parse corrected JSON back to object
      console.log('[DEBUG] validateDocument - Attempting to parse verification result as JSON');

      // Strip markdown code fences if present
      const cleanedContent = this.stripMarkdownCodeFences(verificationResult.content);
      console.log('[DEBUG] validateDocument - After stripping code fences:', {
        originalLength: verificationResult.content.length,
        cleanedLength: cleanedContent.length,
        cleanedPreview: cleanedContent.substring(0, 200)
      });

      try {
        const parsed = JSON.parse(cleanedContent);
        console.log('[DEBUG] validateDocument - Successfully parsed JSON');
        return parsed;
      } catch (error) {
        console.error('[ERROR] validateDocument - JSON parse failed:', error.message);
        console.error('[ERROR] validateDocument - Raw content that failed to parse:', cleanedContent);
        throw error;
      }
    }

    return validation;
  }

  /**
   * Improve documentation based on validation feedback
   */
  async improveDocument(docContent, validationResult, questionnaire) {
    // Use refinement provider (separate model from validator for improve/refine step)
    let provider;
    try {
      provider = await this.getRefinementProviderInstance();
    } catch (error) {
      sendWarning('Skipping improvement (refinement provider not available)');
      return docContent;
    }

    if (!provider || typeof provider.generateText !== 'function') {
      sendWarning('Skipping improvement (validation provider not available)');
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
  /**
   * Iterative validation and improvement loop
   */
  async iterativeValidation(content, type, questionnaire, stageNum = null, stageTotal = null) {
    const settings = this.getValidationSettings();
    const maxIterations = settings.maxIterations || 100;
    const threshold = settings.acceptanceThreshold || 95;

    let currentContent = content;
    let iteration = 0;

    while (iteration < maxIterations) {
      // Emit fractional stage progress so the progress bar moves within this stage
      if (stageNum !== null && stageTotal !== null) {
        const current = parseFloat((stageNum + iteration * 0.2).toFixed(1));
        await this.reportProgressWithDelay(
          `Stage ${current}/${stageTotal}: Validating documentation (pass ${iteration + 1})...`,
          null, 50
        );
      }
      // Report validation iteration progress
      this.reportSubstep(`Validation ${iteration + 1}/${maxIterations}: Validating Project Brief structure...`);
      await this.reportDetail(`Calling ${this.validationLLMProvider?.model || 'LLM'} to validate…`);
      const issueCountBefore = this.validationIssues.length;
      const validation = await this.withHeartbeat(
        () => this.validateDocument(currentContent, questionnaire),
        (elapsed) => {
          if (elapsed < 15) return `Checking structure and completeness…`;
          if (elapsed < 30) return `Reviewing content quality…`;
          if (elapsed < 45) return `Analyzing gaps and issues…`;
          return `Validating documentation… (${elapsed}s)`;
        },
        15000
      );
      // Tag newly-added issues with the current iteration number
      for (let i = issueCountBefore; i < this.validationIssues.length; i++) {
        this.validationIssues[i].iteration = iteration + 1;
      }

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
        await this.reportDetail(`${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out tokens`);
      }

      // Log validation results to debug (not console)
      const issues = validation.issues || validation.contentIssues || [];
      const structuralIssues = validation.structuralIssues || [];
      const flowGaps = validation.applicationFlowGaps || [];
      const allIssues = [...issues, ...structuralIssues];

      debug(`Score: ${validation.overallScore}/100`, {
        status: validation.validationStatus,
        issues: allIssues.length,
        flowGaps: flowGaps.length
      });

      await this.reportDetail(`Score: ${validation.overallScore ?? '?'}/100 — ${allIssues.length} issue(s) found`);

      // Check if ready — also accept immediately if no issues found at all
      const noIssues = allIssues.length === 0 && flowGaps.length === 0;
      if (noIssues || (validation.readyForPublication && validation.overallScore >= threshold)) {
        const reason = noIssues ? 'no issues found' : `score ≥ ${threshold}`;
        await this.reportDetail(`✓ Accepted (${reason})`);
        debug(`${type} passed validation`);
        break;
      }

      // Check if max iterations reached
      if (iteration + 1 >= maxIterations) {
        await this.reportDetail(`Max iterations reached — accepting current version`);
        debug('Max iterations reached. Accepting current version.');
        break;
      }

      // Improve
      debug(`Improving ${type} based on feedback`);
      if (stageNum !== null && stageTotal !== null) {
        const current = parseFloat((stageNum + iteration * 0.2 + 0.1).toFixed(1));
        await this.reportProgressWithDelay(
          `Stage ${current}/${stageTotal}: Improving documentation (pass ${iteration + 1})...`,
          null, 50
        );
      }
      this.reportSubstep(`Improving Project Brief based on validation...`);
      await this.reportDetail(`Calling ${this._refinementModel || this.validationLLMProvider?.model || 'LLM'} to improve…`);
      currentContent = await this.withHeartbeat(
        () => this.improveDocument(currentContent, validation, questionnaire),
        (elapsed) => {
          if (elapsed < 15) return `Applying structural improvements…`;
          if (elapsed < 30) return `Enhancing content quality…`;
          if (elapsed < 45) return `Resolving identified issues…`;
          return `Improving Project Brief… (${elapsed}s)`;
        },
        15000
      );

      // Report token usage after improvement
      if (this.validationLLMProvider && typeof this.validationLLMProvider.getTokenUsage === 'function') {
        const usage = this.validationLLMProvider.getTokenUsage();
        this.reportSubstep('Applying improvements...', {
          tokensUsed: {
            input: usage.inputTokens,
            output: usage.outputTokens
          }
        });
        await this.reportDetail(`${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out tokens`);
      } else {
        this.reportSubstep('Applying improvements...');
      }

      iteration++;
    }

    return currentContent;
  }

  /**
   * Get architecture recommendations based on mission statement and initial scope
   * @param {string} missionStatement - The project's mission statement
   * @param {string} initialScope - The initial scope/features
   * @param {Object|null} databaseRecommendation - Optional database recommendation context
   * @returns {Promise<Array>} Array of architecture recommendations
   */
  async getArchitectureRecommendations(missionStatement, initialScope, databaseContext = null, deploymentStrategy = null) {
    debug('getArchitectureRecommendations called', {
      missionStatement,
      initialScope,
      hasDatabaseContext: !!databaseContext,
      userChoice: databaseContext?.userChoice,
      deploymentStrategy
    });

    try {
      // Get stage-specific provider for architecture recommendation
      const provider = await this.getProviderForStageInstance('architecture-recommendation');

      if (!provider || typeof provider.generateJSON !== 'function') {
        throw new Error('Architecture recommendation provider not available');
      }

      // Read agent instructions
      debug('Loading architecture-recommender.md agent');
      const architectureRecommenderAgent = loadAgent('architecture-recommender.md', path.dirname(this.avcPath));

      // Build prompt
      let prompt = `Given the following project definition:

**Mission Statement:**
${missionStatement}

**Initial Scope (Features to Implement):**
${initialScope}`;

      // Add database context if available (new comparison format)
      if (databaseContext?.comparison) {
        prompt += `

**Database Context:**`;

        if (databaseContext.userChoice) {
          const chosenOption = databaseContext.userChoice === 'sql' ? databaseContext.comparison.sqlOption : databaseContext.comparison.nosqlOption;
          prompt += `
- User's Choice: ${databaseContext.userChoice.toUpperCase()} (${chosenOption.database})
- Specific Version: ${chosenOption.specificVersion || chosenOption.database}`;

          if (chosenOption.estimatedCosts) {
            prompt += `
- Estimated Monthly Cost: ${chosenOption.estimatedCosts.monthly}`;
          }
        } else {
          // No user choice yet, provide both options
          prompt += `
- SQL Option: ${databaseContext.comparison.sqlOption.database} (~${databaseContext.comparison.sqlOption.estimatedCosts?.monthly || 'TBD'}/mo)
- NoSQL Option: ${databaseContext.comparison.nosqlOption.database} (~${databaseContext.comparison.nosqlOption.estimatedCosts?.monthly || 'TBD'}/mo)
- Note: User has not chosen yet, provide architectures compatible with both`;
        }

        if (databaseContext.keyMetrics) {
          prompt += `
- Read/Write Ratio: ${databaseContext.keyMetrics.estimatedReadWriteRatio || 'Not specified'}
- Expected Throughput: ${databaseContext.keyMetrics.expectedThroughput || 'Not specified'}
- Data Complexity: ${databaseContext.keyMetrics.dataComplexity || 'Not specified'}`;
        }
      }

      // Add deployment strategy context if provided
      if (deploymentStrategy === 'local-mvp') {
        prompt += `

**Deployment Strategy:** Local MVP First

CRITICAL FILTERING REQUIREMENT:
- Return ONLY local development architectures (no cloud-specific services)
- Every architecture MUST include a migrationPath object with cloud migration details
- NO Lambda, ECS, AKS, GKE, or other cloud-managed services
- Focus on: Docker Compose, localhost setups, local databases

Required architectures to consider:
1. Docker Compose full-stack (PostgreSQL/MongoDB, backend, frontend)
2. Lightweight localhost setup (SQLite/JSON, Express/Flask, React dev server)
3. Framework-specific local development (Django, Rails, Next.js dev)

Each architecture must include:
- Clear "zero cloud costs" messaging
- Production parity explanation (Docker vs simple localhost)
- Specific migration path to 2-3 cloud architectures
- Estimated migration effort (days) and complexity level

Example architecture structure:
{
  "name": "Local Docker Compose Full-Stack",
  "description": "...runs entirely on your machine with zero cloud costs...Ready to migrate to AWS ECS, Azure Container Apps, or GCP Cloud Run when ready for production...",
  "requiresCloudProvider": false,
  "bestFor": "MVP development with production-like local environment",
  "migrationPath": {
    "readyForCloud": true,
    "suggestedCloudArchitectures": ["AWS ECS", "Azure Container Apps", "GCP Cloud Run"],
    "estimatedMigrationEffort": "2-3 days",
    "migrationComplexity": "Medium",
    "keyMigrationSteps": ["Set up managed database", "Create container registry", "Deploy to cloud service"]
  }
}`;
      } else if (deploymentStrategy === 'cloud') {
        prompt += `

**Deployment Strategy:** Cloud Deployment

CRITICAL FILTERING REQUIREMENT:
- Return ONLY cloud-native architectures (AWS/Azure/GCP managed services or PaaS)
- NO local development options (Docker Compose, localhost setups)
- Focus on: Serverless, containers, managed services, PaaS platforms

Required considerations:
- Serverless options (Lambda, Cloud Functions, Cloud Run)
- Container orchestration (ECS, AKS, GKE)
- PaaS platforms (Vercel, Railway, Render for simpler projects)
- Managed databases (RDS, DynamoDB, Atlas, Cosmos DB)

Each architecture must include:
- Specific cloud services and managed offerings
- Estimated monthly costs (low/medium/high traffic scenarios)
- Auto-scaling and managed infrastructure benefits
- Production-ready from day one messaging

Example architecture structure:
{
  "name": "Serverless Backend + SPA on AWS",
  "description": "AWS Lambda for backend API, API Gateway for routing, DynamoDB for database, S3 + CloudFront for frontend. Scales automatically, pay only for usage...",
  "requiresCloudProvider": true,
  "bestFor": "Scalable APIs with variable traffic, cost optimization",
  "estimatedMonthlyCost": {
    "low": "$10-30 (< 10K requests/day)",
    "medium": "$50-150 (10K-100K requests/day)",
    "high": "$200-500 (100K+ requests/day)"
  }
}`;
      }

      prompt += `

Analyze this project and recommend 3-5 deployment architectures that best fit these requirements.${databaseContext ? ' Consider the database context when recommending deployment patterns and cloud services.' : ''}${deploymentStrategy ? ` IMPORTANT: Follow the deployment strategy filtering requirements above - return ONLY ${deploymentStrategy === 'local-mvp' ? 'local' : 'cloud'} architectures.` : ''}

Return your response as JSON following the exact structure specified in your instructions.`;

      debug('Calling LLM for architecture recommendations');
      const result = await this.retryWithBackoff(
        () => provider.generateJSON(prompt, architectureRecommenderAgent),
        'architecture recommendations'
      );

      debug('Architecture recommendations received', { count: result.architectures?.length });

      // Validate response structure
      if (!result.architectures || !Array.isArray(result.architectures)) {
        throw new Error('Invalid architecture recommendation response: missing architectures array');
      }

      if (result.architectures.length < 1) {
        throw new Error('No architecture recommendations received');
      }

      // Validate each architecture has required fields
      result.architectures.forEach((arch, index) => {
        if (!arch.name || !arch.description || typeof arch.requiresCloudProvider !== 'boolean' || !arch.bestFor) {
          throw new Error(`Architecture at index ${index} is missing required fields`);
        }
      });

      return result.architectures;
    } catch (error) {
      console.error('[ERROR] getArchitectureRecommendations failed:', error.message);
      debug('getArchitectureRecommendations error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Get database recommendation based on mission statement and initial scope (quick analysis)
   * @param {string} missionStatement - The project's mission statement
   * @param {string} initialScope - The initial scope/features
   * @returns {Promise<Object>} Database recommendation object
   */
  async getDatabaseRecommendation(missionStatement, initialScope, deploymentStrategy = null) {
    debug('getDatabaseRecommendation called', { missionStatement, initialScope, deploymentStrategy });

    try {
      // Get stage-specific provider for database recommendation
      const provider = await this.getProviderForStageInstance('database-recommendation');

      if (!provider || typeof provider.generateJSON !== 'function') {
        throw new Error('Database recommendation provider not available');
      }

      // Read agent instructions
      debug('Loading database-recommender.md agent');
      const databaseRecommenderAgent = loadAgent('database-recommender.md', path.dirname(this.avcPath));

      // Build prompt with deployment strategy context
      let prompt = `Given the following project definition:

**Mission Statement:**
${missionStatement}

**Initial Scope (Features to Implement):**
${initialScope}
`;

      // Add deployment strategy context if provided
      if (deploymentStrategy === 'local-mvp') {
        prompt += `
**Deployment Strategy:** Local MVP First
The user has chosen to start with a local development environment and migrate to cloud later.

IMPORTANT: Prioritize local-friendly databases:
- For SQL: Recommend SQLite (zero setup, file-based) or PostgreSQL in Docker (production parity)
- For NoSQL: Recommend local MongoDB in Docker or JSON file storage
- Include clear migration paths to cloud databases (SQLite → RDS/Cloud SQL, local MongoDB → Atlas)
- Emphasize zero cost during MVP phase
- Show cost comparison: "$0/month local" vs cloud costs

`;
      } else if (deploymentStrategy === 'cloud') {
        prompt += `
**Deployment Strategy:** Cloud Deployment
The user has chosen to deploy to production cloud infrastructure from day one.

IMPORTANT: Prioritize managed cloud databases:
- For SQL: Recommend AWS RDS, Azure Database, Google Cloud SQL
- For NoSQL: Recommend DynamoDB, MongoDB Atlas, Azure Cosmos DB
- Emphasize managed features (backups, scaling, monitoring, high availability)
- Include realistic monthly cost estimates
- Focus on production-ready, scalable options

`;
      }

      prompt += `
Analyze this project and determine if it needs a database, and if so, recommend the most appropriate database solution.

Return your response as JSON following the exact structure specified in your instructions.`;

      debug('Calling LLM for database recommendation');
      const result = await this.retryWithBackoff(
        () => provider.generateJSON(prompt, databaseRecommenderAgent),
        'database recommendation'
      );

      debug('Database recommendation received', {
        hasDatabaseNeeds: result.hasDatabaseNeeds,
        confidence: result.confidence,
        hasComparison: !!result.comparison
      });

      // Validate response structure
      if (typeof result.hasDatabaseNeeds !== 'boolean' || !result.confidence) {
        throw new Error('Invalid database recommendation response: missing required fields');
      }

      // If database is needed, validate comparison structure
      if (result.hasDatabaseNeeds && result.comparison) {
        if (!result.comparison.sqlOption || !result.comparison.nosqlOption) {
          throw new Error('Invalid database recommendation: missing sqlOption or nosqlOption in comparison');
        }
      }

      return result;
    } catch (error) {
      console.error('[ERROR] getDatabaseRecommendation failed:', error.message);
      debug('getDatabaseRecommendation error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Get detailed database recommendation with user inputs
   * @param {string} missionStatement - The project's mission statement
   * @param {string} initialScope - The initial scope/features
   * @param {Object} userAnswers - User's detailed answers
   * @param {string} userAnswers.readWriteRatio - e.g., "70/30"
   * @param {string} userAnswers.dailyRequests - e.g., "10000"
   * @param {string} userAnswers.costSensitivity - "Low" | "Medium" | "High"
   * @param {string} userAnswers.dataRelationships - "Simple" | "Moderate" | "Complex"
   * @returns {Promise<Object>} Detailed database recommendation
   */
  async getDatabaseDetailedRecommendation(missionStatement, initialScope, userAnswers) {
    debug('getDatabaseDetailedRecommendation called', {
      missionStatement,
      initialScope,
      userAnswers
    });

    try {
      // Get stage-specific provider for detailed database recommendation
      const provider = await this.getProviderForStageInstance('database-deep-dive');

      if (!provider || typeof provider.generateJSON !== 'function') {
        throw new Error('Database deep-dive provider not available');
      }

      // Read agent instructions
      debug('Loading database-deep-dive.md agent');
      const databaseDeepDiveAgent = loadAgent('database-deep-dive.md', path.dirname(this.avcPath));

      // Build prompt
      const prompt = `Given the following project definition and user requirements:

**Mission Statement:**
${missionStatement}

**Initial Scope (Features to Implement):**
${initialScope}

**User Requirements:**
- Read/Write Ratio: ${userAnswers.readWriteRatio}
- Expected Daily Requests: ${userAnswers.dailyRequests}
- Cost Sensitivity: ${userAnswers.costSensitivity}
- Data Relationships: ${userAnswers.dataRelationships}

Provide a detailed database architecture recommendation including specific configurations, sizing, and cost estimates.

Return your response as JSON following the exact structure specified in your instructions.`;

      debug('Calling LLM for detailed database recommendation');
      const result = await this.retryWithBackoff(
        () => provider.generateJSON(prompt, databaseDeepDiveAgent),
        'detailed database recommendation'
      );

      debug('Detailed database recommendation received', {
        hasComparison: !!result.comparison,
        recommendation: result.recommendation
      });

      // Validate response structure (new comparison format)
      if (!result.comparison || !result.comparison.sqlOption || !result.comparison.nosqlOption) {
        throw new Error('Invalid detailed database recommendation response: missing comparison with sqlOption and nosqlOption');
      }

      // Validate sqlOption has required fields
      if (!result.comparison.sqlOption.database || !result.comparison.sqlOption.architecture || !result.comparison.sqlOption.estimatedCosts) {
        throw new Error('Invalid sqlOption in detailed database recommendation: missing required fields');
      }

      // Validate nosqlOption has required fields
      if (!result.comparison.nosqlOption.database || !result.comparison.nosqlOption.architecture || !result.comparison.nosqlOption.estimatedCosts) {
        throw new Error('Invalid nosqlOption in detailed database recommendation: missing required fields');
      }

      return result;
    } catch (error) {
      console.error('[ERROR] getDatabaseDetailedRecommendation failed:', error.message);
      debug('getDatabaseDetailedRecommendation error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Pre-fill questionnaire answers based on architecture selection
   * @param {string} missionStatement - The project's mission statement
   * @param {string} initialScope - The initial scope/features
   * @param {Object} architecture - Selected architecture object
   * @param {string|null} cloudProvider - Selected cloud provider (AWS/Azure/GCP) or null
   * @param {Object|null} databaseRecommendation - Optional database recommendation context
   * @returns {Promise<Object>} Object with pre-filled answers
   */
  async prefillQuestions(missionStatement, initialScope, architecture, cloudProvider = null, databaseRecommendation = null, deploymentStrategy = null) {
    debug('prefillQuestions called', {
      missionStatement,
      initialScope,
      architectureName: architecture.name,
      cloudProvider,
      deploymentStrategy
    });

    try {
      // Get stage-specific provider for question prefilling
      const provider = await this.getProviderForStageInstance('question-prefilling');

      if (!provider || typeof provider.generateJSON !== 'function') {
        throw new Error('Question prefilling provider not available');
      }

      // Read agent instructions
      debug('Loading question-prefiller.md agent');
      const questionPrefillerAgent = loadAgent('question-prefiller.md', path.dirname(this.avcPath));

      // Build prompt
      let prompt = `Given the following project context:

**Mission Statement:**
${missionStatement}

**Initial Scope (Features to Implement):**
${initialScope}

**Selected Architecture:**
- Name: ${architecture.name}
- Description: ${architecture.description}
- Best For: ${architecture.bestFor}`;

      if (cloudProvider) {
        prompt += `\n- Cloud Provider: ${cloudProvider}`;
      }

      // Add deployment strategy context if provided
      if (deploymentStrategy) {
        const strategyName = deploymentStrategy === 'local-mvp' ? 'Local MVP First' : 'Cloud Deployment';
        prompt += `

**Deployment Strategy:** ${strategyName}`;

        if (deploymentStrategy === 'local-mvp') {
          prompt += `

CRITICAL: Deployment strategy affects ONLY deployment and technical choices, NOT target users.

**TARGET_USERS:**
- Infer from mission statement and scope ONLY
- Ignore deployment strategy completely
- Example: If mission is "task management for remote teams", target users are remote team members, NOT developers
- The deployment choice (local vs cloud) does NOT change who the end users are

**DEPLOYMENT_TARGET requirements:**
- Emphasize local development environment (Docker Compose, localhost)
- Mention zero cloud costs during MVP development phase
- Include migration readiness: "Ready to migrate to [cloud options] when scaling to production"

**TECHNICAL_CONSIDERATIONS requirements:**
- Include local stack details (SQLite or local PostgreSQL/MongoDB in Docker, containerization)
- Focus on: Zero cost, rapid iteration, easy debugging, production parity with Docker
- DO NOT mention cloud services (RDS, Lambda, ECS, etc.) in technical details`;
        } else if (deploymentStrategy === 'cloud') {
          prompt += `

CRITICAL: Deployment strategy affects ONLY deployment and technical choices, NOT target users.

**TARGET_USERS:**
- Infer from mission statement and scope ONLY
- Ignore deployment strategy completely
- The deployment choice (local vs cloud) does NOT change who the end users are

**DEPLOYMENT_TARGET requirements:**
- Detail cloud infrastructure (managed services, auto-scaling, regions)
- Emphasize production-ready from day one
- Include cost considerations and scaling strategy

**TECHNICAL_CONSIDERATIONS requirements:**
- Include cloud-specific details (managed database, CDN, load balancers)
- Emphasize: monitoring, backups, high availability, auto-scaling
- Focus on: Managed services, production features`;
        }
      }

      // Add database context if available (supports both old and new format)
      if (databaseRecommendation) {
        prompt += `

**Database Recommendation:**`;

        // New format with comparison
        if (databaseRecommendation.comparison) {
          const { sqlOption, nosqlOption } = databaseRecommendation.comparison;
          const userChoice = databaseRecommendation.userChoice;

          if (userChoice === 'sql') {
            prompt += `
- Chosen Database: ${sqlOption.database} (SQL)`;
            if (sqlOption.specificVersion) {
              prompt += `
- Specific Version: ${sqlOption.specificVersion}`;
            }
            if (sqlOption.architecture) {
              prompt += `
- Architecture: ${sqlOption.architecture.primaryInstance || ''}`;
              if (sqlOption.architecture.readReplicas) {
                prompt += ` with ${sqlOption.architecture.readReplicas} read replica(s)`;
              }
            }
            if (sqlOption.estimatedCosts) {
              prompt += `
- Estimated Cost: ${sqlOption.estimatedCosts.monthly}`;
            }
          } else if (userChoice === 'nosql') {
            prompt += `
- Chosen Database: ${nosqlOption.database} (NoSQL)`;
            if (nosqlOption.specificVersion) {
              prompt += `
- Specific Version: ${nosqlOption.specificVersion}`;
            }
            if (nosqlOption.architecture) {
              prompt += `
- Architecture: ${nosqlOption.architecture.capacity || nosqlOption.architecture.primaryInstance || ''}`;
              if (nosqlOption.architecture.indexes) {
                prompt += `, ${nosqlOption.architecture.indexes} indexes`;
              }
            }
            if (nosqlOption.estimatedCosts) {
              prompt += `
- Estimated Cost: ${nosqlOption.estimatedCosts.monthly}`;
            }
          } else {
            // No user choice yet, show both options
            prompt += `
- SQL Option: ${sqlOption.database} (~${sqlOption.estimatedCosts?.monthly || 'TBD'})
- NoSQL Option: ${nosqlOption.database} (~${nosqlOption.estimatedCosts?.monthly || 'TBD'})`;
          }

          if (databaseRecommendation.keyMetrics) {
            prompt += `
- Read/Write Ratio: ${databaseRecommendation.keyMetrics.readWriteRatio || databaseRecommendation.keyMetrics.estimatedReadWriteRatio || 'Not specified'}`;
          }
        }
        // Legacy format (backward compatibility)
        else {
          prompt += `
- Primary Database: ${databaseRecommendation.primaryDatabase || databaseRecommendation.recommendation?.primaryDatabase || 'Not specified'}
- Type: ${databaseRecommendation.type || databaseRecommendation.recommendation?.type || 'Not specified'}`;

          if (databaseRecommendation.specificVersion) {
            prompt += `
- Specific Version: ${databaseRecommendation.specificVersion}`;
          }

          if (databaseRecommendation.architecture) {
            prompt += `
- Architecture: ${databaseRecommendation.architecture.primaryInstance || ''}`;
            if (databaseRecommendation.architecture.readReplicas) {
              prompt += ` with ${databaseRecommendation.architecture.readReplicas} read replica(s)`;
            }
          }

          if (databaseRecommendation.estimatedCosts) {
            prompt += `
- Estimated Cost: ${databaseRecommendation.estimatedCosts.monthly || ''}`;
          }
        }
      }

      prompt += `

Generate intelligent, context-aware answers for these questions:
1. TARGET_USERS: Who will use this application and what are their roles/characteristics?
2. DEPLOYMENT_TARGET: Where and how will this application be deployed?
3. TECHNICAL_CONSIDERATIONS: Technology stack, architectural patterns, scalability, and performance
4. SECURITY_AND_COMPLIANCE_REQUIREMENTS: Security measures, privacy, authentication, and compliance

Return your response as JSON following the exact structure specified in your instructions.`;

      debug('Calling LLM for question prefilling');
      const result = await this.retryWithBackoff(
        () => provider.generateJSON(prompt, questionPrefillerAgent),
        'question prefilling'
      );

      debug('Question prefilling received', {
        hasTargetUsers: !!result.TARGET_USERS,
        hasDeploymentTarget: !!result.DEPLOYMENT_TARGET,
        hasTechnicalConsiderations: !!result.TECHNICAL_CONSIDERATIONS,
        hasSecurityRequirements: !!result.SECURITY_AND_COMPLIANCE_REQUIREMENTS
      });

      // Validate response structure
      const requiredFields = [
        'TARGET_USERS',
        'DEPLOYMENT_TARGET',
        'TECHNICAL_CONSIDERATIONS',
        'SECURITY_AND_COMPLIANCE_REQUIREMENTS'
      ];

      const missingFields = requiredFields.filter(field => !result[field]);
      if (missingFields.length > 0) {
        sendWarning(`Warning: Pre-filling missing fields: ${missingFields.join(', ')}`);
        // Fill missing fields with empty strings
        missingFields.forEach(field => {
          result[field] = '';
        });
      }

      return result;
    } catch (error) {
      console.error('[ERROR] prefillQuestions failed:', error.message);
      debug('prefillQuestions error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Generate migration guide for local-to-cloud deployment
   * @param {Object} architecture - Selected local architecture
   * @param {string} databaseType - Database type ('sql' or 'nosql')
   * @param {Object} questionnaire - Full questionnaire answers
   * @returns {Promise<string>} Migration guide markdown
   */
  async generateMigrationGuide(architecture, databaseType, questionnaire) {
    debug('generateMigrationGuide called', {
      architectureName: architecture.name,
      databaseType
    });

    try {
      // Get stage-specific provider for migration guide generation
      this.reportSubstep('Preparing migration guide generator...');
      const provider = await this.getProviderForStageInstance('migration-guide-generation');

      if (!provider || typeof provider.generateText !== 'function') {
        throw new Error('Migration guide generation provider not available');
      }

      // Read agent instructions
      debug('Loading migration-guide-generator.md agent');
      const migrationGuideAgent = loadAgent('migration-guide-generator.md', path.dirname(this.avcPath));

      // Build comprehensive prompt
      this.reportSubstep('Generating cloud migration guide (this may take 30-60 seconds)...');
      const prompt = `Generate a comprehensive cloud migration guide for the following local development setup:

**Local Architecture:**
- Name: ${architecture.name}
- Description: ${architecture.description}
- Best For: ${architecture.bestFor}

**Database:**
- Type: ${databaseType ? (databaseType.toUpperCase()) : 'Not specified'}

**Project Context:**
- Mission: ${questionnaire.MISSION_STATEMENT}
- Scope: ${questionnaire.INITIAL_SCOPE}
- Technical Stack: ${questionnaire.TECHNICAL_CONSIDERATIONS || 'To be determined'}

**Target Users:** ${questionnaire.TARGET_USERS || 'General users'}

Generate a complete DEPLOYMENT_MIGRATION.md document following the structure specified in your instructions.

Include:
1. Current local stack summary
2. When to migrate decision criteria
3. 3-4 cloud migration options with costs and complexity
4. Database-specific migration guide
5. Environment variable changes
6. CI/CD pipeline recommendation
7. Monitoring and observability setup
8. Cost comparison table
9. Comprehensive migration checklist
10. Common issues and solutions
11. Support resources

Make it actionable with specific CLI commands, code examples, and cost estimates.`;

      debug('Calling LLM for migration guide generation');
      const result = await this.retryWithBackoff(
        () => provider.generateText(prompt, migrationGuideAgent),
        'migration guide generation'
      );

      debug('Migration guide generated', { length: result.length });
      this.reportSubstep('Writing DEPLOYMENT_MIGRATION.md...');

      return result;
    } catch (error) {
      console.error('[ERROR] generateMigrationGuide failed:', error.message);
      debug('generateMigrationGuide error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Configure the log file for debug() writes.
   * Called from repl-ink.js when the CommandLogger starts/stops.
   * When filePath is null, debug() is silent (no terminal or file output).
   * @param {string|null} filePath - Absolute path to the active log file
   */
  static setDebugLogFile(filePath) {
    _debugLogFile = filePath;
  }
}

export { TemplateProcessor };
