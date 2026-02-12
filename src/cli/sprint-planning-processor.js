import fs from 'fs';
import path from 'path';
import { LLMProvider } from './llm-provider.js';
import { TokenTracker } from './token-tracker.js';
import { EpicStoryValidator } from './epic-story-validator.js';
import { VerificationTracker } from './verification-tracker.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SprintPlanningProcessor - Creates/expands Epics and Stories with duplicate detection
 */
class SprintPlanningProcessor {
  constructor() {
    this.ceremonyName = 'sprint-planning';
    this.avcPath = path.join(process.cwd(), '.avc');
    this.projectPath = path.join(this.avcPath, 'project');
    this.projectDocPath = path.join(this.projectPath, 'doc.md');
    this.projectContextPath = path.join(this.projectPath, 'context.md');
    this.avcConfigPath = path.join(this.avcPath, 'avc.json');
    this.agentsPath = path.join(__dirname, 'agents');

    // Read ceremony config
    const { provider, model, stagesConfig } = this.readCeremonyConfig();
    this._providerName = provider;
    this._modelName = model;
    this.llmProvider = null;
    this.stagesConfig = stagesConfig;

    // Stage provider cache
    this._stageProviders = {};

    // Initialize token tracker
    this.tokenTracker = new TokenTracker(this.avcPath);
    this.tokenTracker.init();

    // Initialize verification tracker
    this.verificationTracker = new VerificationTracker(this.avcPath);

    // Debug mode - always enabled for comprehensive logging
    this.debugMode = true;
  }

  /**
   * Structured debug logger - writes ONLY to file via CommandLogger
   */
  debug(message, data = null) {
    if (!this.debugMode) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [DEBUG]`;

    if (data === null) {
      console.log(`${prefix} ${message}`);
    } else {
      // Combine message and data in single log call with [DEBUG] prefix
      console.log(`${prefix} ${message}\n${JSON.stringify(data, null, 2)}`);
    }
  }

  /**
   * Stage boundary marker
   */
  debugStage(stageNumber, stageName) {
    const separator = '='.repeat(50);
    this.debug(`\n${separator}`);
    this.debug(`STAGE ${stageNumber}: ${stageName.toUpperCase()}`);
    this.debug(separator);
  }

  /**
   * API call logging with timing
   */
  async debugApiCall(operation, fn) {
    this.debug(`\n${'='.repeat(50)}`);
    this.debug(`LLM API CALL: ${operation}`);
    this.debug('='.repeat(50));
    this.debug(`Provider: ${this._providerName}`);
    this.debug(`Model: ${this._modelName}`);

    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.debug(`Response received (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.debug(`API call failed after ${duration}ms`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  readCeremonyConfig() {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      const ceremony = config.settings?.ceremonies?.find(c => c.name === this.ceremonyName);

      if (!ceremony) {
        console.warn(`⚠️  Ceremony '${this.ceremonyName}' not found in config, using defaults`);
        return {
          provider: 'claude',
          model: 'claude-sonnet-4-5-20250929',
          stagesConfig: null
        };
      }

      return {
        provider: ceremony.provider || 'claude',
        model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929',
        stagesConfig: ceremony.stages || null
      };
    } catch (error) {
      console.warn(`⚠️  Could not read ceremony config: ${error.message}`);
      return {
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        stagesConfig: null
      };
    }
  }

  /**
   * Get provider and model for a specific stage
   * Falls back to ceremony-level config if stage-specific config not found
   * @param {string} stageName - Stage name ('decomposition', 'validation', 'context-generation')
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
   * Get or create LLM provider for a specific stage
   * @param {string} stageName - Stage name ('decomposition', 'validation', 'context-generation')
   * @returns {Promise<LLMProvider>} LLM provider instance
   */
  async getProviderForStageInstance(stageName) {
    const { provider, model } = this.getProviderForStage(stageName);

    // Check if we already have a provider for this stage
    const cacheKey = `${stageName}:${provider}:${model}`;

    if (this._stageProviders[cacheKey]) {
      this.debug(`Using cached provider for ${stageName}: ${provider} (${model})`);
      return this._stageProviders[cacheKey];
    }

    // Create new provider
    this.debug(`Creating new provider for ${stageName}: ${provider} (${model})`);
    const providerInstance = await LLMProvider.create(provider, model);
    this._stageProviders[cacheKey] = providerInstance;

    return providerInstance;
  }

  async initializeLLMProvider() {
    try {
      this.llmProvider = await LLMProvider.create(this._providerName, this._modelName);
      return this.llmProvider;
    } catch (error) {
      this.debug(`Could not initialize ${this._providerName} provider`);
      this.debug(`Error: ${error.message}`);
      return null;
    }
  }

  async retryWithBackoff(fn, operation, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const isRetriable = error.message?.includes('rate limit') ||
                          error.message?.includes('timeout') ||
                          error.message?.includes('503');

        if (isLastAttempt || !isRetriable) {
          throw error;
        }

        const delay = Math.pow(2, attempt) * 1000;
        this.debug(`Retry ${attempt}/${maxRetries} in ${delay/1000}s: ${operation}`);
        this.debug(`Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // STAGE 1: Validate prerequisites
  validatePrerequisites() {
    this.debugStage(1, 'Validate Prerequisites');
    this.debug('Checking prerequisites...');

    if (!fs.existsSync(this.projectContextPath)) {
      this.debug(`✗ Project context missing: ${this.projectContextPath}`);
      throw new Error(
        'Project context not found. Please run /sponsor-call first to create the project foundation.'
      );
    }
    const contextSize = fs.statSync(this.projectContextPath).size;
    this.debug(`✓ Project context exists: ${this.projectContextPath} (${contextSize} bytes)`);

    if (!fs.existsSync(this.projectDocPath)) {
      this.debug(`✗ Project doc missing: ${this.projectDocPath}`);
      throw new Error(
        'Project documentation not found. Please run /sponsor-call first.'
      );
    }
    const docSize = fs.statSync(this.projectDocPath).size;
    this.debug(`✓ Project doc exists: ${this.projectDocPath} (${docSize} bytes)`);

    this.debug('Prerequisites validated successfully');
  }

  // STAGE 2: Read existing hierarchy
  readExistingHierarchy() {
    this.debugStage(2, 'Read Existing Hierarchy');

    const existingEpics = new Map();  // name -> id
    const existingStories = new Map(); // name -> id
    const maxEpicNum = { value: 0 };
    const maxStoryNums = new Map();  // epicId -> maxNum

    if (!fs.existsSync(this.projectPath)) {
      this.debug('Project path does not exist yet (first run)');
      return { existingEpics, existingStories, maxEpicNum, maxStoryNums };
    }

    this.debug(`Scanning directory: ${this.projectPath}`);
    const dirs = fs.readdirSync(this.projectPath);
    this.debug(`Found ${dirs.length} top-level directories to scan`);

    // Scan top-level directories (epics)
    for (const dir of dirs) {
      const epicWorkJsonPath = path.join(this.projectPath, dir, 'work.json');

      if (!fs.existsSync(epicWorkJsonPath)) continue;

      try {
        const work = JSON.parse(fs.readFileSync(epicWorkJsonPath, 'utf8'));

        if (work.type === 'epic') {
          this.debug(`Found existing Epic: ${work.id} "${work.name}"`);
          existingEpics.set(work.name.toLowerCase(), work.id);

          // Track max epic number (context-0001 → 1)
          const match = work.id.match(/^context-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxEpicNum.value) maxEpicNum.value = num;
          }

          // Scan for nested stories under this epic
          const epicDir = path.join(this.projectPath, dir);
          const epicSubdirs = fs.readdirSync(epicDir).filter(subdir => {
            const subdirPath = path.join(epicDir, subdir);
            return fs.statSync(subdirPath).isDirectory();
          });

          this.debug(`Scanning ${epicSubdirs.length} subdirectories under epic ${work.id}`);

          for (const storyDir of epicSubdirs) {
            const storyWorkJsonPath = path.join(epicDir, storyDir, 'work.json');

            if (!fs.existsSync(storyWorkJsonPath)) continue;

            try {
              const storyWork = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));

              if (storyWork.type === 'story') {
                this.debug(`Found existing Story: ${storyWork.id} "${storyWork.name}"`);
                existingStories.set(storyWork.name.toLowerCase(), storyWork.id);

                // Track max story number per epic (context-0001-0003 → epic 0001, story 3)
                const storyMatch = storyWork.id.match(/^context-(\d+)-(\d+)$/);
                if (storyMatch) {
                  const epicId = `context-${storyMatch[1]}`;
                  const storyNum = parseInt(storyMatch[2], 10);

                  if (!maxStoryNums.has(epicId)) {
                    maxStoryNums.set(epicId, 0);
                  }
                  if (storyNum > maxStoryNums.get(epicId)) {
                    maxStoryNums.set(epicId, storyNum);
                  }
                }
              }
            } catch (error) {
              this.debug(`Could not parse ${storyWorkJsonPath}: ${error.message}`);
            }
          }
        }
      } catch (error) {
        this.debug(`Could not parse ${epicWorkJsonPath}: ${error.message}`);
        console.warn(`⚠️  Could not parse ${epicWorkJsonPath}: ${error.message}`);
      }
    }

    this.debug('Existing hierarchy summary', {
      epics: existingEpics.size,
      stories: existingStories.size,
      maxEpicNum: maxEpicNum.value,
      maxStoryNums: Object.fromEntries(maxStoryNums),
      epicNames: Array.from(existingEpics.keys()),
      storyNames: Array.from(existingStories.keys()).slice(0, 10)  // First 10 for brevity
    });

    return { existingEpics, existingStories, maxEpicNum, maxStoryNums };
  }

  // STAGE 3: Collect new scope (optional expansion)
  async collectNewScope() {
    this.debugStage(3, 'Collect New Scope');

    this.debug(`Reading project doc: ${this.projectDocPath}`);
    const docContent = fs.readFileSync(this.projectDocPath, 'utf8');
    this.debug(`Doc content loaded (${docContent.length} chars)`);

    // Try to extract scope from known section headers
    const scopeFromSection = this.tryExtractScopeFromSections(docContent);

    if (scopeFromSection) {
      this.debug(`✓ Scope extracted from section (${scopeFromSection.length} chars)`);
      this.debug(`Scope preview: "${scopeFromSection.substring(0, 100)}..."`);
      return scopeFromSection;
    }

    // Fallback: Use entire doc.md
    this.debug('⚠️  No standard scope section found');
    this.debug('Using entire doc.md content as scope source');

    console.warn('\n⚠️  No standard scope section found in doc.md');
    console.warn('   Using entire documentation for feature extraction.');
    console.warn('   For better results and lower token usage, consider adding one of:');
    console.warn('   - "## Initial Scope"');
    console.warn('   - "## Scope"');
    console.warn('   - "## Features"\n');

    this.debug(`Using full doc content (${docContent.length} chars)`);
    return docContent;
  }

  /**
   * Try to extract scope from known section headers
   * Returns null if no section found
   */
  tryExtractScopeFromSections(docContent) {
    // Section headers to try (in priority order)
    const sectionHeaders = [
      'Initial Scope',           // Official AVC convention
      'Scope',                   // Common variation
      'Project Scope',           // Formal variation
      'Features',                // Common alternative
      'Core Features',           // Detailed variation
      'Requirements',            // Specification style
      'Functional Requirements', // Formal specification
      'User Stories',            // Agile style
      'Feature List',            // Simple list style
      'Objectives',              // Goal-oriented style
      'Goals',                   // Simple goal style
      'Deliverables',            // Project management style
      'Product Features',        // Product-focused
      'System Requirements'      // Technical specification
    ];

    this.debug(`Attempting to extract scope from known sections...`);
    this.debug(`Trying ${sectionHeaders.length} section name variations`);

    // Try each section header
    for (const header of sectionHeaders) {
      // Build regex (case-insensitive)
      const regex = new RegExp(
        `##\\s+${this.escapeRegex(header)}\\s+([\\s\\S]+?)(?=\\n##|$)`,
        'i'
      );

      const match = docContent.match(regex);

      if (match && match[1].trim().length > 0) {
        const scope = match[1].trim();
        this.debug(`✓ Found scope in section: "## ${header}"`);
        this.debug(`Extracted ${scope.length} chars`);
        return scope;
      }

      this.debug(`✗ Section "## ${header}" not found or empty`);
    }

    this.debug('✗ No known scope section found');
    return null;
  }

  /**
   * Escape special regex characters in section names
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // STAGE 4: Decompose into Epics + Stories
  async decomposeIntoEpicsStories(scope, existingEpics, existingStories, projectContext) {
    this.debugStage(4, 'Decompose into Epics + Stories');

    console.log('\n🔄 Stage 1/3: Decomposing scope into Epics and Stories...\n');

    // Get stage-specific provider for decomposition
    const provider = await this.getProviderForStageInstance('decomposition');
    const { provider: providerName, model: modelName } = this.getProviderForStage('decomposition');

    this.debug('Using provider for decomposition', { provider: providerName, model: modelName });

    // Read agent instructions
    const agentPath = path.join(this.agentsPath, 'epic-story-decomposer.md');
    this.debug(`Loading agent: ${agentPath}`);
    const epicStoryDecomposerAgent = fs.readFileSync(agentPath, 'utf8');
    this.debug(`Agent loaded (${epicStoryDecomposerAgent.length} bytes)`);

    // Build prompt with duplicate detection
    this.debug('Constructing decomposition prompt...');
    const existingEpicNames = Array.from(existingEpics.keys());
    const existingStoryNames = Array.from(existingStories.keys());

    let prompt = `Given the following project:

**Initial Scope (Features to Implement):**
${scope}

**Project Context:**
${projectContext}
`;

    if (existingEpicNames.length > 0) {
      prompt += `\n**Existing Epics (DO NOT DUPLICATE):**
${existingEpicNames.map(name => `- ${name}`).join('\n')}
`;
    }

    if (existingStoryNames.length > 0) {
      prompt += `\n**Existing Stories (DO NOT DUPLICATE):**
${existingStoryNames.map(name => `- ${name}`).join('\n')}
`;
    }

    prompt += `\nDecompose this project into NEW Epics (3-7 domain-based groupings) and Stories (2-8 user-facing capabilities per Epic).

IMPORTANT: Only generate NEW Epics and Stories. Skip any that match the existing ones.

Return your response as JSON following the exact structure specified in your instructions.`;

    this.debug('Prompt includes', {
      scopeLength: scope.length,
      contextLength: projectContext.length,
      existingEpics: existingEpicNames.length,
      existingStories: existingStoryNames.length,
      totalPromptSize: prompt.length
    });

    // Log full decomposition prompt for duplicate detection analysis
    this.debug('\n' + '='.repeat(80));
    this.debug('FULL DECOMPOSITION PROMPT:');
    this.debug('='.repeat(80));
    this.debug(prompt);
    this.debug('='.repeat(80) + '\n');

    // LLM call with full request/response logging
    const hierarchy = await this.debugApiCall(
      'Epic/Story Decomposition',
      async () => {
        this.debug('Request payload', {
          model: modelName,
          maxTokens: 8000,
          agentInstructions: `${epicStoryDecomposerAgent.substring(0, 100)}...`,
          promptPreview: `${prompt.substring(0, 200)}...`
        });

        this.debug('Sending request to LLM API...');

        const result = await this.retryWithBackoff(
          () => provider.generateJSON(prompt, epicStoryDecomposerAgent),
          'Epic/Story decomposition'
        );

        // Log token usage
        const usage = provider.getTokenUsage();
        this.debug('Response tokens', {
          input: usage.inputTokens,
          output: usage.outputTokens,
          total: usage.totalTokens
        });

        this.debug(`Response content (${usage.outputTokens} tokens)`, {
          epicCount: result.epics?.length || 0,
          totalStories: result.epics?.reduce((sum, e) => sum + (e.stories?.length || 0), 0) || 0,
          validation: result.validation
        });

        // Log full LLM response for duplicate detection analysis
        this.debug('\n' + '='.repeat(80));
        this.debug('FULL LLM RESPONSE:');
        this.debug('='.repeat(80));
        this.debug(JSON.stringify(result, null, 2));
        this.debug('='.repeat(80) + '\n');

        return result;
      }
    );

    if (!hierarchy.epics || !Array.isArray(hierarchy.epics)) {
      this.debug('✗ Invalid decomposition response: missing epics array');
      throw new Error('Invalid decomposition response: missing epics array');
    }

    this.debug('Parsed hierarchy', {
      epics: hierarchy.epics.map(e => ({
        id: e.id,
        name: e.name,
        storyCount: e.stories?.length || 0
      })),
      validation: hierarchy.validation
    });

    console.log(`✅ Generated ${hierarchy.epics.length} new Epics with ${hierarchy.validation?.storyCount || 0} new Stories\n`);

    return hierarchy;
  }

  // STAGE 5: Multi-Agent Validation
  async validateHierarchy(hierarchy, projectContext) {
    this.debugStage(5, 'Multi-Agent Validation');
    console.log('🔍 Validating Epics and Stories with domain experts...\n');

    // Initialize default LLM provider if not already done (for fallback)
    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    // Check if smart selection is enabled
    const useSmartSelection = this.stagesConfig?.validation?.useSmartSelection || false;

    if (useSmartSelection) {
      this.debug('Smart validator selection enabled');
      console.log('   🧠 Smart validator selection enabled\n');
    }

    const validator = new EpicStoryValidator(
      this.llmProvider,
      this.verificationTracker,
      this.stagesConfig,
      useSmartSelection
    );

    // Validate each epic
    for (const epic of hierarchy.epics) {
      this.debug(`\nValidating Epic: ${epic.id} "${epic.name}"`);

      // Generate epic context for validation
      const epicContext = await this.generateEpicContext(epic, projectContext);

      // Validate epic with multiple domain validators
      const epicValidation = await validator.validateEpic(epic, epicContext);

      // Display validation summary
      this.displayValidationSummary('Epic', epic.name, epicValidation);

      // Handle validation result
      if (epicValidation.overallStatus === 'needs-improvement') {
        this.debug(`Epic "${epic.name}" needs improvement - showing issues`);
        this.displayValidationIssues(epicValidation);

        // For now, continue with warnings (user can review files later)
        // TODO: Implement auto-fix or ask user for confirmation
        console.log(`   ⚠️  Epic will be created with validation warnings\n`);
      }

      // Validate each story under this epic
      for (const story of epic.stories || []) {
        this.debug(`\nValidating Story: ${story.id} "${story.name}"`);

        // Generate story context for validation
        const storyContext = await this.generateStoryContext(story, epic, projectContext);

        // Validate story with multiple domain validators
        const storyValidation = await validator.validateStory(story, storyContext, epic);

        // Display validation summary
        this.displayValidationSummary('Story', story.name, storyValidation);

        // Handle validation result
        if (storyValidation.overallStatus === 'needs-improvement') {
          this.debug(`Story "${story.name}" needs improvement - showing issues`);
          this.displayValidationIssues(storyValidation);

          // For now, continue with warnings (user can review files later)
          console.log(`   ⚠️  Story will be created with validation warnings\n`);
        }
      }
    }

    console.log('✅ Validation complete\n');
    return hierarchy;
  }

  /**
   * Display validation summary
   */
  displayValidationSummary(type, name, validation) {
    const statusEmoji = {
      'excellent': '✅',
      'acceptable': '⚠️ ',
      'needs-improvement': '❌'
    };

    const emoji = statusEmoji[validation.overallStatus] || '?';
    console.log(`${emoji} ${type}: ${name}`);
    console.log(`   Overall Score: ${validation.averageScore}/100`);
    console.log(`   Validators: ${validation.validatorCount} agents`);
    console.log(`   Issues: ${validation.criticalIssues.length} critical, ${validation.majorIssues.length} major, ${validation.minorIssues.length} minor`);

    // Show strengths if excellent or acceptable
    if (validation.overallStatus !== 'needs-improvement' && validation.strengths.length > 0) {
      console.log(`   Strengths: ${validation.strengths.slice(0, 2).join(', ')}`);
    }

    console.log('');
  }

  /**
   * Display validation issues
   */
  displayValidationIssues(validation) {
    // Show critical issues
    if (validation.criticalIssues.length > 0) {
      console.log(`   Critical Issues:`);
      validation.criticalIssues.slice(0, 3).forEach(issue => {
        console.log(`     • [${issue.domain}] ${issue.description}`);
        if (issue.suggestion) {
          console.log(`       Fix: ${issue.suggestion}`);
        }
      });
      if (validation.criticalIssues.length > 3) {
        console.log(`     ... and ${validation.criticalIssues.length - 3} more critical issues`);
      }
      console.log('');
    }

    // Show improvement priorities
    if (validation.improvementPriorities.length > 0) {
      console.log(`   Improvement Priorities:`);
      validation.improvementPriorities.slice(0, 3).forEach((priority, i) => {
        console.log(`     ${i + 1}. ${priority.priority} (${priority.mentionedBy} validators)`);
      });
      console.log('');
    }
  }

  /**
   * Generate epic context for validation (simplified version of context generation)
   */
  async generateEpicContext(epic, projectContext) {
    // For now, return a basic context
    // In production, this would call the same context generator used in writeHierarchyFiles
    return `# Epic Context: ${epic.name}

**Description:** ${epic.description}

**Domain:** ${epic.domain}

**Features:**
${(epic.features || []).map(f => `- ${f}`).join('\n')}

**Project Context:**
${projectContext}
`;
  }

  /**
   * Generate story context for validation (simplified version of context generation)
   */
  async generateStoryContext(story, epic, projectContext) {
    // For now, return a basic context
    // In production, this would call the same context generator used in writeHierarchyFiles
    return `# Story Context: ${story.name}

**User Type:** ${story.userType}

**Description:** ${story.description}

**Acceptance Criteria:**
${(story.acceptance || []).map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

**Parent Epic:** ${epic.name} (${epic.domain})

**Project Context:**
${projectContext}
`;
  }

  /**
   * Analyze duplicate detection decisions
   * Logs which epics/stories should have been skipped by LLM vs which are truly new
   */
  analyzeDuplicates(hierarchy, existingEpics, existingStories) {
    this.debug('\n' + '='.repeat(80));
    this.debug('DUPLICATE DETECTION ANALYSIS');
    this.debug('='.repeat(80));

    const skippedEpics = [];
    const createdEpics = [];

    // Analyze epics
    for (const epic of hierarchy.epics || []) {
      const normalized = epic.name.toLowerCase();
      const isDuplicate = existingEpics.has(normalized);

      this.debug(`\nEpic: "${epic.name}"`);
      this.debug(`  Normalized: "${normalized}"`);
      this.debug(`  Exists in previous runs: ${isDuplicate}`);

      if (isDuplicate) {
        const existingId = existingEpics.get(normalized);
        this.debug(`  ⚠️  Match found: ${existingId}`);
        this.debug(`  Action: SHOULD HAVE BEEN SKIPPED BY LLM`);
        this.debug(`  Reason: LLM generated duplicate that already exists`);
        skippedEpics.push({ name: epic.name, existingId });
      } else {
        // Check for potential semantic duplicates (similar names)
        const similarEpics = [];
        for (const [existingName, existingId] of existingEpics.entries()) {
          // Simple similarity: check if one name contains the other
          if (normalized.includes(existingName) || existingName.includes(normalized)) {
            similarEpics.push({ name: existingName, id: existingId });
          }
        }

        if (similarEpics.length > 0) {
          this.debug(`  ⚠️  Possible semantic duplicates found:`);
          for (const similar of similarEpics) {
            this.debug(`     - "${similar.name}" (${similar.id})`);
          }
          this.debug(`  Action: CREATE NEW (but user should review for duplicates)`);
        } else {
          this.debug(`  ✓  Match found: NONE`);
          this.debug(`  Action: CREATE NEW`);
          this.debug(`  Reason: Genuinely new epic not in existing list`);
        }
        createdEpics.push(epic.name);
      }
    }

    // Analyze stories
    const skippedStories = [];
    const createdStories = [];

    for (const epic of hierarchy.epics || []) {
      for (const story of epic.stories || []) {
        const normalized = story.name.toLowerCase();
        const isDuplicate = existingStories.has(normalized);

        this.debug(`\nStory: "${story.name}" (under epic "${epic.name}")`);
        this.debug(`  Normalized: "${normalized}"`);
        this.debug(`  Exists in previous runs: ${isDuplicate}`);

        if (isDuplicate) {
          const existingId = existingStories.get(normalized);
          this.debug(`  ⚠️  Match found: ${existingId}`);
          this.debug(`  Action: SHOULD HAVE BEEN SKIPPED BY LLM`);
          skippedStories.push({ name: story.name, existingId });
        } else {
          this.debug(`  ✓  Match found: NONE`);
          this.debug(`  Action: CREATE NEW`);
          createdStories.push(story.name);
        }
      }
    }

    // Summary
    this.debug('\n' + '='.repeat(80));
    this.debug('DUPLICATE ANALYSIS SUMMARY');
    this.debug('='.repeat(80));
    this.debug('Epics:', {
      shouldBeSkipped: skippedEpics.length,
      willCreate: createdEpics.length,
      skippedNames: skippedEpics.map(s => s.name),
      createdNames: createdEpics
    });
    this.debug('Stories:', {
      shouldBeSkipped: skippedStories.length,
      willCreate: createdStories.length,
      skippedNames: skippedStories.map(s => s.name),
      createdNames: createdStories
    });

    if (skippedEpics.length > 0 || skippedStories.length > 0) {
      this.debug('\n⚠️  WARNING: LLM generated duplicates that should have been skipped!');
      this.debug('This indicates LLM non-determinism or insufficient duplicate detection.');
    } else {
      this.debug('\n✓  Result: LLM correctly identified all items as duplicates or genuinely new');
    }

    this.debug('='.repeat(80) + '\n');

    return { skippedEpics, createdEpics, skippedStories, createdStories };
  }

  // STAGE 6: Renumber IDs to avoid collisions
  renumberHierarchy(hierarchy, maxEpicNum, maxStoryNums) {
    this.debugStage(6, 'Renumber IDs');
    this.debug('Renumbering hierarchy to avoid ID collisions...');

    let nextEpicNum = maxEpicNum.value + 1;
    this.debug(`Next epic number: ${nextEpicNum} (after existing ${maxEpicNum.value})`);

    for (const epic of hierarchy.epics) {
      const oldEpicId = epic.id;
      const newEpicId = `context-${String(nextEpicNum).padStart(4, '0')}`;
      epic.id = newEpicId;

      this.debug(`ID mapping - Epic "${epic.name}": ${oldEpicId} -> ${newEpicId}`);

      let nextStoryNum = (maxStoryNums.get(newEpicId) || 0) + 1;

      for (const story of epic.stories || []) {
        const oldStoryId = story.id;
        const newStoryId = `${newEpicId}-${String(nextStoryNum).padStart(4, '0')}`;
        story.id = newStoryId;

        this.debug(`ID mapping - Story "${story.name}": ${oldStoryId} -> ${newStoryId}`);
        nextStoryNum++;
      }

      nextEpicNum++;
    }

    this.debug('Renumbered hierarchy', {
      epics: hierarchy.epics.map(e => ({ id: e.id, name: e.name, storyCount: e.stories?.length || 0 }))
    });

    return hierarchy;
  }

  // STAGE 7-8: Generate contexts
  async generateContext(level, id, data, agentInstructions) {
    this.debug(`Generating context for ${level}: ${id} "${data[level]?.name || 'unknown'}"`);

    const prompt = this.buildContextPrompt(level, id, data);

    this.debug('Context generation prompt', {
      agentSize: agentInstructions.length,
      projectContextSize: data.projectContext?.length || 0,
      dataKeys: Object.keys(data),
      totalPromptSize: prompt.length
    });

    // Get stage-specific provider for context generation
    const provider = await this.getProviderForStageInstance('context-generation');

    const result = await this.debugApiCall(
      `${level.charAt(0).toUpperCase() + level.slice(1)} Context Generation (${id})`,
      async () => {
        const response = await provider.generateJSON(prompt, agentInstructions);

        const usage = provider.getTokenUsage();
        this.debug('Generated context', {
          tokens: response.tokenCount,
          withinBudget: response.withinBudget,
          contextLength: response.contextMarkdown.length
        });

        return response;
      }
    );

    if (!result.contextMarkdown || !result.tokenCount) {
      this.debug(`✗ Invalid context response for ${id}: missing required fields`);
      throw new Error(`Invalid context response for ${id}: missing required fields`);
    }

    if (!result.withinBudget) {
      this.debug(`⚠️  Warning: ${id} context exceeds token budget (${result.tokenCount} tokens)`);
      console.warn(`⚠️  Warning: ${id} context exceeds token budget (${result.tokenCount} tokens)`);
    }

    return result;
  }

  buildContextPrompt(level, id, data) {
    const { projectContext, epic, story } = data;

    let prompt = `Generate a context.md file for the following ${level}:\n\n`;
    prompt += `**Level:** ${level}\n`;
    prompt += `**ID:** ${id}\n\n`;

    if (level === 'epic') {
      prompt += `**Epic Name:** ${epic.name}\n`;
      prompt += `**Epic Domain:** ${epic.domain}\n`;
      prompt += `**Epic Description:** ${epic.description}\n`;
      prompt += `**Features in Epic:** ${epic.features.join(', ')}\n\n`;
      prompt += `**Project Context:**\n${projectContext}\n\n`;
    } else if (level === 'story') {
      prompt += `**Story Name:** ${story.name}\n`;
      prompt += `**Story Description:** ${story.description}\n`;
      prompt += `**User Type:** ${story.userType}\n`;
      prompt += `**Acceptance Criteria:**\n${story.acceptance.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}\n\n`;
      prompt += `**Epic Context:**\n`;
      prompt += `- Epic: ${epic.name}\n`;
      prompt += `- Domain: ${epic.domain}\n`;
      prompt += `- Features: ${epic.features.join(', ')}\n\n`;
      prompt += `**Project Context:**\n${projectContext}\n\n`;
    }

    prompt += `Return your response as JSON following the exact structure specified in your instructions.`;

    return prompt;
  }

  // STAGE 7-8: Write hierarchy files
  async writeHierarchyFiles(hierarchy, projectContext) {
    this.debugStage(7, 'Generate Contexts & Write Files');

    console.log('\n💾 Stage 2/3: Generating context files...\n');

    // Read agent
    const agentPath = path.join(this.agentsPath, 'feature-context-generator.md');
    this.debug(`Loading agent: ${agentPath}`);
    const featureContextGeneratorAgent = fs.readFileSync(agentPath, 'utf8');
    this.debug(`Agent loaded (${featureContextGeneratorAgent.length} bytes)`);

    console.log('\n💾 Stage 3/3: Writing hierarchy files...\n');

    let epicCount = 0;
    let storyCount = 0;

    for (const epic of hierarchy.epics) {
      const epicDir = path.join(this.projectPath, epic.id);

      this.debug(`Creating Epic directory: ${epicDir}`);
      if (!fs.existsSync(epicDir)) {
        fs.mkdirSync(epicDir, { recursive: true });
      }

      // Write Epic doc.md (stub)
      const docContent = `# ${epic.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*\n`;
      const docPath = path.join(epicDir, 'doc.md');
      fs.writeFileSync(docPath, docContent, 'utf8');
      this.debug(`Writing ${docPath} (${docContent.length} bytes)`);
      console.log(`   ✅ ${epic.id}/doc.md`);

      // Generate and write Epic context.md
      const epicContext = await this.retryWithBackoff(
        () => this.generateContext('epic', epic.id, { projectContext, epic }, featureContextGeneratorAgent),
        `Epic ${epic.id} context`
      );
      const contextPath = path.join(epicDir, 'context.md');
      fs.writeFileSync(contextPath, epicContext.contextMarkdown, 'utf8');
      this.debug(`Writing ${contextPath} (${epicContext.contextMarkdown.length} bytes)`);
      console.log(`   ✅ ${epic.id}/context.md`);

      // Write Epic work.json (preserve existing metadata like selectedValidators)
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
          ...(epic.metadata || {}),  // Preserve existing metadata (e.g., selectedValidators)
          created: new Date().toISOString(),
          ceremony: this.ceremonyName,
          tokenBudget: epicContext.tokenCount
        }
      };
      const workJsonPath = path.join(epicDir, 'work.json');
      const workJsonContent = JSON.stringify(epicWorkJson, null, 2);
      fs.writeFileSync(workJsonPath, workJsonContent, 'utf8');
      this.debug(`Writing ${workJsonPath} (${workJsonContent.length} bytes)`);
      console.log(`   ✅ ${epic.id}/work.json`);

      epicCount++;

      // Write Story files (nested under epic)
      for (const story of epic.stories || []) {
        const storyDir = path.join(epicDir, story.id);

        this.debug(`Creating Story directory: ${storyDir}`);
        if (!fs.existsSync(storyDir)) {
          fs.mkdirSync(storyDir, { recursive: true });
        }

        // Write Story doc.md (stub)
        const storyDocContent = `# ${story.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*\n`;
        const storyDocPath = path.join(storyDir, 'doc.md');
        fs.writeFileSync(storyDocPath, storyDocContent, 'utf8');
        this.debug(`Writing ${storyDocPath} (${storyDocContent.length} bytes)`);
        console.log(`      ✅ ${story.id}/doc.md`);

        // Generate and write Story context.md
        const storyContext = await this.retryWithBackoff(
          () => this.generateContext('story', story.id, { projectContext, epic, story }, featureContextGeneratorAgent),
          `Story ${story.id} context`
        );
        const storyContextPath = path.join(storyDir, 'context.md');
        fs.writeFileSync(storyContextPath, storyContext.contextMarkdown, 'utf8');
        this.debug(`Writing ${storyContextPath} (${storyContext.contextMarkdown.length} bytes)`);
        console.log(`      ✅ ${story.id}/context.md`);

        // Write Story work.json (preserve existing metadata like selectedValidators)
        const storyWorkJson = {
          id: story.id,
          name: story.name,
          type: 'story',
          userType: story.userType,
          description: story.description,
          acceptance: story.acceptance,
          status: 'planned',
          dependencies: story.dependencies || [],
          children: [],  // Empty until /seed creates tasks
          metadata: {
            ...(story.metadata || {}),  // Preserve existing metadata (e.g., selectedValidators)
            created: new Date().toISOString(),
            ceremony: this.ceremonyName,
            tokenBudget: storyContext.tokenCount
          }
        };
        const storyWorkJsonPath = path.join(storyDir, 'work.json');
        const storyWorkJsonContent = JSON.stringify(storyWorkJson, null, 2);
        fs.writeFileSync(storyWorkJsonPath, storyWorkJsonContent, 'utf8');
        this.debug(`Writing ${storyWorkJsonPath} (${storyWorkJsonContent.length} bytes)`);
        console.log(`      ✅ ${story.id}/work.json`);

        storyCount++;
      }

      console.log(''); // Empty line between epics
    }

    return { epicCount, storyCount };
  }

  // Count total hierarchy (nested structure)
  countTotalHierarchy() {
    let totalEpics = 0;
    let totalStories = 0;

    if (!fs.existsSync(this.projectPath)) {
      return { totalEpics, totalStories };
    }

    const dirs = fs.readdirSync(this.projectPath);

    // Scan top-level directories (epics)
    for (const dir of dirs) {
      const epicWorkJsonPath = path.join(this.projectPath, dir, 'work.json');

      if (!fs.existsSync(epicWorkJsonPath)) continue;

      try {
        const work = JSON.parse(fs.readFileSync(epicWorkJsonPath, 'utf8'));

        if (work.type === 'epic') {
          totalEpics++;

          // Count nested stories under this epic
          const epicDir = path.join(this.projectPath, dir);
          const epicSubdirs = fs.readdirSync(epicDir).filter(subdir => {
            const subdirPath = path.join(epicDir, subdir);
            return fs.statSync(subdirPath).isDirectory();
          });

          for (const storyDir of epicSubdirs) {
            const storyWorkJsonPath = path.join(epicDir, storyDir, 'work.json');

            if (!fs.existsSync(storyWorkJsonPath)) continue;

            try {
              const storyWork = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));
              if (storyWork.type === 'story') {
                totalStories++;
              }
            } catch (error) {
              // Ignore parse errors
            }
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    }

    return { totalEpics, totalStories };
  }

  // Main execution method
  async execute() {
    try {
      // Log ceremony execution metadata
      const runId = Date.now();
      this.debug('='.repeat(80));
      this.debug('CEREMONY EXECUTION START');
      this.debug('='.repeat(80));
      this.debug('Run ID:', runId);
      this.debug('Timestamp:', new Date().toISOString());

      console.log('\n📊 Sprint Planning Ceremony\n');

      // Stage 1: Validate
      this.validatePrerequisites();

      // Stage 2: Read existing hierarchy
      console.log('📋 Analyzing existing project structure...\n');
      const { existingEpics, existingStories, maxEpicNum, maxStoryNums } = this.readExistingHierarchy();

      // Log pre-existing hierarchy counts
      this.debug('Pre-existing hierarchy:', {
        epics: existingEpics.size,
        stories: existingStories.size,
        maxEpicNum: maxEpicNum.value
      });

      if (existingEpics.size > 0) {
        console.log(`Found ${existingEpics.size} existing Epics, ${existingStories.size} existing Stories\n`);
      } else {
        console.log('No existing Epics/Stories found (first expansion)\n');
      }

      // Stage 3: Collect scope
      const scope = await this.collectNewScope();

      // Read project context
      this.debug(`Reading project context: ${this.projectContextPath}`);
      const projectContext = fs.readFileSync(this.projectContextPath, 'utf8');
      this.debug(`Context loaded (${projectContext.length} chars)`);

      // Stage 4: Decompose
      let hierarchy = await this.decomposeIntoEpicsStories(scope, existingEpics, existingStories, projectContext);

      // Stage 5: Multi-Agent Validation
      hierarchy = await this.validateHierarchy(hierarchy, projectContext);

      // Analyze duplicate detection (before renumbering)
      this.analyzeDuplicates(hierarchy, existingEpics, existingStories);

      // Stage 6: Renumber IDs
      hierarchy = this.renumberHierarchy(hierarchy, maxEpicNum, maxStoryNums);

      // Stage 7-8: Generate contexts and write files
      const { epicCount, storyCount } = await this.writeHierarchyFiles(hierarchy, projectContext);

      // Stage 9: Summary & Cleanup
      this.debugStage(9, 'Summary & Cleanup');

      const { totalEpics, totalStories } = this.countTotalHierarchy();

      this.debug('Total hierarchy counts', { epics: totalEpics, stories: totalStories });
      this.debug('Created this run', { epics: epicCount, stories: storyCount });

      console.log(`\n✅ Project hierarchy expanded!\n`);
      console.log(`Created:`);
      console.log(`   • ${epicCount} new Epics`);
      console.log(`   • ${storyCount} new Stories\n`);
      console.log(`Total project structure:`);
      console.log(`   • ${totalEpics} Epics`);
      console.log(`   • ${totalStories} Stories`);
      console.log(`   • 0 Tasks (run /seed to create tasks for stories)\n`);

      // Display token usage
      if (this.llmProvider) {
        const usage = this.llmProvider.getTokenUsage();

        this.debug('Total API calls', usage.totalCalls);
        this.debug('Total tokens', {
          input: usage.inputTokens,
          output: usage.outputTokens,
          total: usage.totalTokens
        });

        console.log('📊 Token Usage:');
        console.log(`   Input: ${usage.inputTokens.toLocaleString()} tokens`);
        console.log(`   Output: ${usage.outputTokens.toLocaleString()} tokens`);
        console.log(`   Total: ${usage.totalTokens.toLocaleString()} tokens`);
        console.log(`   API Calls: ${usage.totalCalls}`);

        this.tokenTracker.addExecution(this.ceremonyName, {
          input: usage.inputTokens,
          output: usage.outputTokens
        });
        this.debug('Token tracking saved to .avc/token-history.json');
        console.log('✅ Token history updated\n');
      }

      console.log('Next steps:');
      console.log('   1. Review Epic/Story structure in .avc/project/');
      console.log('   2. Run /seed <story-id> to decompose a Story into Tasks/Subtasks\n');

      // Log ceremony execution end
      const runDuration = Date.now() - runId;
      this.debug('\n' + '='.repeat(80));
      this.debug('CEREMONY EXECUTION END');
      this.debug('='.repeat(80));
      this.debug('Run ID:', runId);
      this.debug('Duration:', `${Math.round(runDuration / 1000)} seconds`);
      this.debug('Post-execution hierarchy:', {
        epics: totalEpics,
        stories: totalStories
      });
      this.debug('Changes:', {
        newEpics: epicCount,
        newStories: storyCount
      });
      this.debug('='.repeat(80) + '\n');

    } catch (error) {
      this.debug('\n========== ERROR OCCURRED ==========');
      this.debug('Error details', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      // Dump application state at failure
      this.debug('Application state at failure', {
        ceremonyName: this.ceremonyName,
        provider: this._providerName,
        model: this._modelName,
        projectPath: this.projectPath,
        currentWorkingDir: process.cwd(),
        nodeVersion: process.version,
        platform: process.platform
      });

      console.error(`\n❌ Project expansion failed: ${error.message}\n`);
      throw error;
    }
  }
}

export { SprintPlanningProcessor };
