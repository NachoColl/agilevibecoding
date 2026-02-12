import { ValidationRouter } from './validation-router.js';
import { LLMProvider } from './llm-provider.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Multi-Agent Epic and Story Validator
 *
 * Orchestrates validation across multiple domain-specific validator agents.
 * Each epic/story is reviewed by 2-8 specialized validators based on domain and features.
 */
class EpicStoryValidator {
  constructor(llmProvider, verificationTracker, stagesConfig = null, useSmartSelection = false) {
    this.llmProvider = llmProvider;
    this.verificationTracker = verificationTracker;

    // Create router with smart selection support
    this.router = new ValidationRouter(llmProvider, useSmartSelection);

    this.agentsPath = path.join(__dirname, 'agents');
    this.validationFeedback = new Map();

    // Store validation stage configuration
    this.validationStageConfig = stagesConfig?.validation || null;

    // Cache for validator-specific providers
    this._validatorProviders = {};

    // Smart selection flag
    this.useSmartSelection = useSmartSelection;
  }

  /**
   * Determine validation type from validator name
   * Returns: 'universal', 'domain', or 'feature'
   */
  getValidationType(validatorName) {
    const role = validatorName.replace(/^validator-(epic|story)-/, '');

    // Universal validators (always applied)
    const epicUniversal = ['solution-architect', 'developer', 'security'];
    const storyUniversal = ['developer', 'qa', 'test-architect'];

    if (epicUniversal.includes(role) || storyUniversal.includes(role)) {
      return 'universal';
    }

    // Domain validators
    const domainValidators = ['devops', 'cloud', 'backend', 'database', 'api',
                              'frontend', 'ui', 'ux', 'mobile', 'data'];

    if (domainValidators.includes(role)) {
      return 'domain';
    }

    // Everything else is feature-based
    return 'feature';
  }

  /**
   * Get provider for a specific validator based on validation type
   * @param {string} validatorName - Validator name (e.g., 'validator-epic-security')
   * @returns {Promise<LLMProvider>} LLM provider instance
   */
  async getProviderForValidator(validatorName) {
    const validationType = this.getValidationType(validatorName);

    // Check validation-type specific configuration
    const validationTypeConfig = this.validationStageConfig?.validationTypes?.[validationType];

    let provider, model;

    if (validationTypeConfig?.provider) {
      // Use validation-type-specific config
      provider = validationTypeConfig.provider;
      model = validationTypeConfig.model;
    } else if (this.validationStageConfig?.provider) {
      // Fallback to validation stage default
      provider = this.validationStageConfig.provider;
      model = this.validationStageConfig.model;
    } else {
      // Fallback to global default (use default llmProvider)
      return this.llmProvider;
    }

    // Check cache
    const cacheKey = `${validatorName}:${provider}:${model}`;
    if (this._validatorProviders[cacheKey]) {
      return this._validatorProviders[cacheKey];
    }

    // Create new provider
    const providerInstance = await LLMProvider.create(provider, model);
    this._validatorProviders[cacheKey] = providerInstance;

    return providerInstance;
  }

  /**
   * Validate an Epic with multiple domain validators
   * @param {Object} epic - Epic work.json object
   * @param {string} epicContext - Epic context.md content
   * @returns {Object} Aggregated validation result
   */
  async validateEpic(epic, epicContext) {
    // 1. Check cache for previously selected validators
    let validators;
    if (epic.metadata?.selectedValidators) {
      validators = epic.metadata.selectedValidators;
      console.log(`   ✓ Using cached validator selection (${validators.length} validators)`);
    } else {
      // Get applicable validators for this epic (with LLM fallback if enabled)
      if (this.useSmartSelection) {
        validators = await this.router.getValidatorsForEpicWithLLM(epic);
      } else {
        validators = this.router.getValidatorsForEpic(epic);
      }

      // Cache selection in metadata
      if (!epic.metadata) {
        epic.metadata = {};
      }
      epic.metadata.selectedValidators = validators;
    }

    console.log(`\n🔍 Validating Epic: ${epic.name}`);
    console.log(`   Domain: ${epic.domain}`);
    console.log(`   Validators: ${validators.length} specialized agents\n`);

    // 2. Run all validators in parallel
    const validationResults = await Promise.all(
      validators.map(validatorName =>
        this.runEpicValidator(epic, epicContext, validatorName)
      )
    );

    // 3. Aggregate results
    const aggregated = this.aggregateValidationResults(validationResults, 'epic');

    // 4. Determine overall status
    aggregated.overallStatus = this.determineOverallStatus(validationResults);
    aggregated.readyToPublish = aggregated.overallStatus !== 'needs-improvement';

    // 5. Store for feedback loop
    this.storeValidationFeedback(epic.id, aggregated);

    return aggregated;
  }

  /**
   * Validate a Story with multiple domain validators
   * @param {Object} story - Story work.json object
   * @param {string} storyContext - Story context.md content
   * @param {Object} epic - Parent epic for routing
   * @returns {Object} Aggregated validation result
   */
  async validateStory(story, storyContext, epic) {
    // 1. Check cache for previously selected validators
    let validators;
    if (story.metadata?.selectedValidators) {
      validators = story.metadata.selectedValidators;
      console.log(`   ✓ Using cached validator selection (${validators.length} validators)`);
    } else {
      // Get applicable validators for this story (with LLM fallback if enabled)
      if (this.useSmartSelection) {
        validators = await this.router.getValidatorsForStoryWithLLM(story, epic);
      } else {
        validators = this.router.getValidatorsForStory(story, epic);
      }

      // Cache selection in metadata
      if (!story.metadata) {
        story.metadata = {};
      }
      story.metadata.selectedValidators = validators;
    }

    console.log(`\n🔍 Validating Story: ${story.name}`);
    console.log(`   Epic: ${epic.name} (${epic.domain})`);
    console.log(`   Validators: ${validators.length} specialized agents\n`);

    // 2. Run all validators in parallel
    const validationResults = await Promise.all(
      validators.map(validatorName =>
        this.runStoryValidator(story, storyContext, epic, validatorName)
      )
    );

    // 3. Aggregate results
    const aggregated = this.aggregateValidationResults(validationResults, 'story');

    // 4. Determine overall status
    aggregated.overallStatus = this.determineOverallStatus(validationResults);
    aggregated.readyToPublish = aggregated.overallStatus !== 'needs-improvement';

    // 5. Store for feedback loop
    this.storeValidationFeedback(story.id, aggregated);

    return aggregated;
  }

  /**
   * Run a single epic validator agent
   * @private
   */
  async runEpicValidator(epic, epicContext, validatorName) {
    const agentInstructions = this.loadAgentInstructions(`${validatorName}.md`);

    // Build validation prompt
    const prompt = this.buildEpicValidationPrompt(epic, epicContext);

    // Get validator-specific provider based on validation type
    const provider = await this.getProviderForValidator(validatorName);

    // Call LLM with validator agent instructions
    const rawResult = await provider.generateJSON(prompt, agentInstructions);

    // Basic validation of result structure
    if (!rawResult || typeof rawResult !== 'object') {
      throw new Error(`Invalid validation result from ${validatorName}: expected object`);
    }

    // Track validation session
    if (this.verificationTracker) {
      this.verificationTracker.recordCheck(validatorName, 'epic-validation', true);
    }

    // Add metadata
    rawResult._validatorName = validatorName;

    return rawResult;
  }

  /**
   * Run a single story validator agent
   * @private
   */
  async runStoryValidator(story, storyContext, epic, validatorName) {
    const agentInstructions = this.loadAgentInstructions(`${validatorName}.md`);

    // Build validation prompt
    const prompt = this.buildStoryValidationPrompt(story, storyContext, epic);

    // Get validator-specific provider based on validation type
    const provider = await this.getProviderForValidator(validatorName);

    // Call LLM with validator agent instructions
    const rawResult = await provider.generateJSON(prompt, agentInstructions);

    // Basic validation of result structure
    if (!rawResult || typeof rawResult !== 'object') {
      throw new Error(`Invalid validation result from ${validatorName}: expected object`);
    }

    // Track validation session
    if (this.verificationTracker) {
      this.verificationTracker.recordCheck(validatorName, 'story-validation', true);
    }

    // Add metadata
    rawResult._validatorName = validatorName;

    return rawResult;
  }

  /**
   * Aggregate multiple validation results into a single report
   * @private
   */
  aggregateValidationResults(results, type) {
    const aggregated = {
      type: type, // 'epic' or 'story'
      validatorCount: results.length,
      validators: results.map(r => r._validatorName),
      averageScore: Math.round(
        results.reduce((sum, r) => sum + (r.overallScore || 0), 0) / results.length
      ),

      // Aggregate issues by severity
      criticalIssues: [],
      majorIssues: [],
      minorIssues: [],

      // Aggregate strengths (deduplicated)
      strengths: [],

      // Aggregate improvement priorities (ranked by frequency)
      improvementPriorities: [],

      // Per-validator results summary
      validatorResults: results.map(r => ({
        validator: r._validatorName,
        status: r.validationStatus,
        score: r.overallScore || 0,
        issueCount: (r.issues || []).length
      }))
    };

    // Collect and categorize issues
    results.forEach(result => {
      (result.issues || []).forEach(issue => {
        const enhancedIssue = {
          ...issue,
          validator: result._validatorName,
          domain: this.extractDomain(result._validatorName)
        };

        if (issue.severity === 'critical') {
          aggregated.criticalIssues.push(enhancedIssue);
        } else if (issue.severity === 'major') {
          aggregated.majorIssues.push(enhancedIssue);
        } else {
          aggregated.minorIssues.push(enhancedIssue);
        }
      });

      // Collect strengths (deduplicate similar ones)
      (result.strengths || []).forEach(strength => {
        if (!aggregated.strengths.some(s => this.isSimilar(s, strength))) {
          aggregated.strengths.push(strength);
        }
      });
    });

    // Rank improvement priorities by frequency across validators
    const priorityMap = new Map();
    results.forEach(result => {
      (result.improvementPriorities || []).forEach(priority => {
        priorityMap.set(priority, (priorityMap.get(priority) || 0) + 1);
      });
    });

    aggregated.improvementPriorities = Array.from(priorityMap.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .slice(0, 5) // Top 5
      .map(([priority, count]) => ({ priority, mentionedBy: count }));

    return aggregated;
  }

  /**
   * Determine overall status from multiple validators
   * Uses "highest severity wins" approach
   * @private
   */
  determineOverallStatus(results) {
    const statuses = results.map(r => r.validationStatus);

    // If any validator says "needs-improvement", overall is "needs-improvement"
    if (statuses.includes('needs-improvement')) {
      return 'needs-improvement';
    }

    // If all are "excellent", overall is "excellent"
    if (statuses.every(s => s === 'excellent')) {
      return 'excellent';
    }

    // Otherwise "acceptable"
    return 'acceptable';
  }

  /**
   * Build validation prompt for Epic
   * @private
   */
  buildEpicValidationPrompt(epic, epicContext) {
    return `# Epic to Validate

**Epic ID:** ${epic.id}
**Epic Name:** ${epic.name}
**Domain:** ${epic.domain}
**Description:** ${epic.description}

**Features:**
${(epic.features || []).map(f => `- ${f}`).join('\n')}

**Dependencies:**
${(epic.dependencies || []).length > 0 ? epic.dependencies.join(', ') : 'None'}

**Stories:**
${(epic.children || []).length} stories defined

**Epic Context:**
\`\`\`
${epicContext}
\`\`\`

Validate this Epic from your domain expertise perspective and return JSON validation results following the specified format.
`;
  }

  /**
   * Build validation prompt for Story
   * @private
   */
  buildStoryValidationPrompt(story, storyContext, epic) {
    return `# Story to Validate

**Story ID:** ${story.id}
**Story Name:** ${story.name}
**User Type:** ${story.userType}
**Description:** ${story.description}

**Acceptance Criteria:**
${(story.acceptance || []).map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

**Dependencies:**
${(story.dependencies || []).length > 0 ? story.dependencies.join(', ') : 'None'}

**Parent Epic:**
- Name: ${epic.name}
- Domain: ${epic.domain}
- Features: ${(epic.features || []).join(', ')}

**Story Context:**
\`\`\`
${storyContext}
\`\`\`

Validate this Story from your domain expertise perspective and return JSON validation results following the specified format.
`;
  }

  /**
   * Load agent instructions from .md file
   * @private
   */
  loadAgentInstructions(filename) {
    const agentPath = path.join(this.agentsPath, filename);
    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent file not found: ${filename}`);
    }
    return fs.readFileSync(agentPath, 'utf8');
  }


  /**
   * Extract domain name from validator name
   * @private
   */
  extractDomain(validatorName) {
    // Extract domain from validator name (e.g., "validator-epic-security" → "security")
    const match = validatorName.match(/validator-(?:epic|story)-(.+)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Check if two strings are similar (for deduplication)
   * @private
   */
  isSimilar(str1, str2) {
    // Simple similarity check (can be enhanced with fuzzy matching)
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    return s1.includes(s2) || s2.includes(s1);
  }

  /**
   * Store validation feedback for learning/feedback loops
   * @private
   */
  storeValidationFeedback(workItemId, aggregatedResult) {
    this.validationFeedback.set(workItemId, aggregatedResult);
  }

  /**
   * Get validation feedback for a work item
   * @param {string} workItemId - Work item ID
   * @returns {Object|null} Aggregated validation result or null
   */
  getValidationFeedback(workItemId) {
    return this.validationFeedback.get(workItemId) || null;
  }
}

export { EpicStoryValidator };
