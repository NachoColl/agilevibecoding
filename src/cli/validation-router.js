import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Routes epics and stories to appropriate domain validators
 *
 * This router determines which specialized validator agents should review
 * each epic and story based on domain, features, and inferred characteristics.
 *
 * Hybrid Approach:
 * - Uses static rule-based routing for known domains (fast path)
 * - Falls back to LLM-based selection for unknown/novel domains (slow path)
 */
class ValidationRouter {
  constructor(llmProvider = null, useSmartSelection = false) {
    this.epicMatrix = this.buildEpicValidationMatrix();
    this.storyMatrix = this.buildStoryValidationMatrix();
    this.llmProvider = llmProvider;
    this.useSmartSelection = useSmartSelection;
    this.agentsPath = path.join(__dirname, 'agents');
  }

  /**
   * Build routing matrix for epic validation
   * Maps domains and features to validator agent names
   */
  buildEpicValidationMatrix() {
    return {
      // Universal validators - always check all epics
      universal: [
        'validator-epic-solution-architect',
        'validator-epic-developer',
        'validator-epic-security'
      ],

      // Domain-specific validators
      domains: {
        'infrastructure': [
          'validator-epic-devops',
          'validator-epic-cloud',
          'validator-epic-backend'
        ],
        'user-management': [
          'validator-epic-backend',
          'validator-epic-database',
          'validator-epic-security',
          'validator-epic-api'
        ],
        'frontend': [
          'validator-epic-frontend',
          'validator-epic-ui',
          'validator-epic-ux'
        ],
        'mobile': [
          'validator-epic-mobile',
          'validator-epic-ui',
          'validator-epic-ux',
          'validator-epic-api'
        ],
        'data-processing': [
          'validator-epic-data',
          'validator-epic-database',
          'validator-epic-backend'
        ],
        'api': [
          'validator-epic-api',
          'validator-epic-backend',
          'validator-epic-security'
        ],
        'analytics': [
          'validator-epic-data',
          'validator-epic-backend',
          'validator-epic-database'
        ],
        'communication': [
          'validator-epic-backend',
          'validator-epic-api',
          'validator-epic-security'
        ]
      },

      // Feature-specific validators
      features: {
        'authentication': ['validator-epic-security'],
        'authorization': ['validator-epic-security'],
        'database': ['validator-epic-database'],
        'testing': ['validator-epic-qa', 'validator-epic-test-architect'],
        'deployment': ['validator-epic-devops', 'validator-epic-cloud'],
        'api': ['validator-epic-api'],
        'ui': ['validator-epic-ui', 'validator-epic-ux'],
        'mobile': ['validator-epic-mobile'],
        'real-time': ['validator-epic-backend', 'validator-epic-api'],
        'data-storage': ['validator-epic-database', 'validator-epic-data'],
        'logging': ['validator-epic-devops'],
        'monitoring': ['validator-epic-devops'],
        'security': ['validator-epic-security']
      }
    };
  }

  /**
   * Build routing matrix for story validation
   * Similar to epic matrix but includes QA and testing focus
   */
  buildStoryValidationMatrix() {
    return {
      // Universal validators - always check all stories
      universal: [
        'validator-story-developer',
        'validator-story-qa',
        'validator-story-test-architect'
      ],

      // Domain-specific validators
      domains: {
        'infrastructure': [
          'validator-story-devops',
          'validator-story-cloud',
          'validator-story-backend'
        ],
        'user-management': [
          'validator-story-backend',
          'validator-story-database',
          'validator-story-security',
          'validator-story-api',
          'validator-story-ux'
        ],
        'frontend': [
          'validator-story-frontend',
          'validator-story-ui',
          'validator-story-ux'
        ],
        'mobile': [
          'validator-story-mobile',
          'validator-story-ui',
          'validator-story-ux'
        ],
        'data-processing': [
          'validator-story-data',
          'validator-story-database',
          'validator-story-backend'
        ],
        'api': [
          'validator-story-api',
          'validator-story-backend',
          'validator-story-security'
        ],
        'analytics': [
          'validator-story-data',
          'validator-story-backend',
          'validator-story-database'
        ],
        'communication': [
          'validator-story-backend',
          'validator-story-api',
          'validator-story-security'
        ]
      },

      // Feature-specific validators
      features: {
        'authentication': ['validator-story-security'],
        'crud-operations': ['validator-story-database', 'validator-story-api'],
        'search': ['validator-story-database', 'validator-story-backend'],
        'real-time': ['validator-story-api', 'validator-story-backend'],
        'responsive-design': ['validator-story-ui', 'validator-story-frontend'],
        'file-upload': ['validator-story-backend', 'validator-story-api'],
        'notifications': ['validator-story-backend', 'validator-story-api'],
        'reporting': ['validator-story-data', 'validator-story-backend']
      }
    };
  }

  /**
   * Get list of validator agents for an epic
   * @param {Object} epic - Epic work item with domain and features
   * @returns {string[]} Array of validator agent names
   */
  getValidatorsForEpic(epic) {
    const validators = new Set();

    // 1. Add universal validators (always check)
    this.epicMatrix.universal.forEach(v => validators.add(v));

    // 2. Add domain-specific validators
    const domainValidators = this.epicMatrix.domains[epic.domain] || [];
    domainValidators.forEach(v => validators.add(v));

    // 3. Add feature-specific validators
    (epic.features || []).forEach(feature => {
      const featureNormalized = feature.toLowerCase().replace(/\s+/g, '-');
      const featureValidators = this.epicMatrix.features[featureNormalized] || [];
      featureValidators.forEach(v => validators.add(v));
    });

    // Return unique validators (2-6 agents typically)
    return Array.from(validators);
  }

  /**
   * Get list of validator agents for a story
   * @param {Object} story - Story work item
   * @param {Object} epic - Parent epic for domain/feature context
   * @returns {string[]} Array of validator agent names
   */
  getValidatorsForStory(story, epic) {
    const validators = new Set();

    // 1. Add universal validators
    this.storyMatrix.universal.forEach(v => validators.add(v));

    // 2. Inherit domain validators from epic
    const domainValidators = this.storyMatrix.domains[epic.domain] || [];
    domainValidators.forEach(v => validators.add(v));

    // 3. Add feature-specific validators (from epic features)
    (epic.features || []).forEach(feature => {
      const featureNormalized = feature.toLowerCase().replace(/\s+/g, '-');
      const featureValidators = this.storyMatrix.features[featureNormalized] || [];
      featureValidators.forEach(v => validators.add(v));
    });

    // 4. Infer features from story acceptance criteria
    const inferredFeatures = this.inferFeaturesFromAcceptance(story.acceptance);
    inferredFeatures.forEach(feature => {
      const featureValidators = this.storyMatrix.features[feature] || [];
      featureValidators.forEach(v => validators.add(v));
    });

    // Return unique validators (3-8 agents typically)
    return Array.from(validators);
  }

  /**
   * Infer features from story acceptance criteria text
   * Uses keyword matching to detect common patterns
   * @param {string[]} acceptanceCriteria - Array of acceptance criteria
   * @returns {string[]} Array of inferred feature names
   */
  inferFeaturesFromAcceptance(acceptanceCriteria) {
    const features = [];
    const text = (acceptanceCriteria || []).join(' ').toLowerCase();

    // Authentication patterns
    if (text.includes('login') || text.includes('authenticate') || text.includes('sign in')) {
      features.push('authentication');
    }

    // CRUD patterns
    if (text.includes('create') || text.includes('update') || text.includes('delete') || text.includes('edit')) {
      features.push('crud-operations');
    }

    // Search patterns
    if (text.includes('search') || text.includes('filter') || text.includes('find')) {
      features.push('search');
    }

    // Real-time patterns
    if (text.includes('real-time') || text.includes('websocket') || text.includes('live')) {
      features.push('real-time');
    }

    // Responsive design patterns
    if (text.includes('mobile') || text.includes('responsive') || text.includes('tablet')) {
      features.push('responsive-design');
    }

    // File upload patterns
    if (text.includes('upload') || text.includes('file') || text.includes('attachment')) {
      features.push('file-upload');
    }

    // Notification patterns
    if (text.includes('notify') || text.includes('notification') || text.includes('alert')) {
      features.push('notifications');
    }

    // Reporting patterns
    if (text.includes('report') || text.includes('analytics') || text.includes('dashboard')) {
      features.push('reporting');
    }

    return features;
  }

  /**
   * Use LLM to select validators for an epic (fallback for unknown domains)
   * @param {Object} epic - Epic work item
   * @param {string} type - 'epic' or 'story'
   * @returns {Promise<string[]>} Array of validator names
   */
  async llmSelectValidators(workItem, type = 'epic') {
    if (!this.llmProvider || !this.useSmartSelection) {
      return [];
    }

    // Load validator selector agent
    const agentPath = path.join(this.agentsPath, 'validator-selector.md');
    let agentInstructions;
    try {
      agentInstructions = fs.readFileSync(agentPath, 'utf8');
    } catch (error) {
      console.warn(`⚠️  Could not load validator-selector agent: ${error.message}`);
      return [];
    }

    // Build prompt
    const prompt = this.buildValidatorSelectionPrompt(workItem, type);

    try {
      // Call LLM
      const response = await this.llmProvider.generateJSON(prompt, agentInstructions);

      // Validate response structure
      if (!response.validators || !Array.isArray(response.validators)) {
        console.warn(`⚠️  Invalid LLM response: missing validators array`);
        return [];
      }

      // Validate validator names exist
      const validValidators = response.validators.filter(v => this.isValidValidatorName(v, type));

      if (validValidators.length < response.validators.length) {
        const invalid = response.validators.filter(v => !this.isValidValidatorName(v, type));
        console.warn(`⚠️  LLM returned invalid validator names: ${invalid.join(', ')}`);
      }

      // Log selection reasoning
      if (response.reasoning) {
        console.log(`   LLM selection reasoning: ${response.reasoning}`);
      }

      return validValidators;
    } catch (error) {
      console.warn(`⚠️  LLM validator selection failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Build prompt for LLM validator selection
   * @private
   */
  buildValidatorSelectionPrompt(workItem, type) {
    const workItemType = type.charAt(0).toUpperCase() + type.slice(1);

    let prompt = `Select the most relevant validators for the following ${workItemType}:\n\n`;
    prompt += `**${workItemType} Name:** ${workItem.name}\n`;
    prompt += `**Domain:** ${workItem.domain}\n`;

    if (type === 'epic') {
      prompt += `**Description:** ${workItem.description}\n`;
      prompt += `**Features:** ${(workItem.features || []).join(', ')}\n`;
    } else {
      prompt += `**Description:** ${workItem.description}\n`;
      prompt += `**User Type:** ${workItem.userType}\n`;
      prompt += `**Acceptance Criteria:**\n`;
      (workItem.acceptance || []).forEach((ac, i) => {
        prompt += `${i + 1}. ${ac}\n`;
      });
    }

    prompt += `\nSelect 5-8 relevant validators from the available list and return as JSON.`;

    return prompt;
  }

  /**
   * Check if a validator name is valid
   * @private
   */
  isValidValidatorName(validatorName, type) {
    const prefix = `validator-${type}-`;
    if (!validatorName.startsWith(prefix)) {
      return false;
    }

    const role = validatorName.replace(prefix, '');
    const validRoles = [
      'solution-architect', 'developer', 'security', 'devops', 'cloud',
      'backend', 'database', 'api', 'frontend', 'ui', 'ux', 'mobile',
      'data', 'qa', 'test-architect'
    ];

    return validRoles.includes(role);
  }

  /**
   * Check if a domain is known (has predefined routing rules)
   * @private
   */
  isDomainKnown(domain, type = 'epic') {
    const matrix = type === 'epic' ? this.epicMatrix : this.storyMatrix;
    return !!matrix.domains[domain];
  }

  /**
   * Get validators for epic with hybrid approach (static + LLM fallback)
   * @param {Object} epic - Epic work item
   * @returns {Promise<string[]>} Array of validator names
   */
  async getValidatorsForEpicWithLLM(epic) {
    const validators = new Set();

    // 1. Always add universal validators (static)
    this.epicMatrix.universal.forEach(v => validators.add(v));

    // 2. Check if domain is known
    const domainKnown = this.isDomainKnown(epic.domain, 'epic');

    if (domainKnown) {
      // Fast path: Use static routing for known domains
      const domainValidators = this.epicMatrix.domains[epic.domain];
      domainValidators.forEach(v => validators.add(v));
    } else if (this.useSmartSelection && this.llmProvider) {
      // Slow path: Use LLM for unknown domains
      console.log(`   📡 Unknown domain "${epic.domain}" - using LLM selection...`);
      const llmValidators = await this.llmSelectValidators(epic, 'epic');
      llmValidators.forEach(v => validators.add(v));
    }

    // 3. Add feature-specific validators (static)
    (epic.features || []).forEach(feature => {
      const featureNormalized = feature.toLowerCase().replace(/\s+/g, '-');
      const featureValidators = this.epicMatrix.features[featureNormalized] || [];
      featureValidators.forEach(v => validators.add(v));
    });

    return Array.from(validators);
  }

  /**
   * Get validators for story with hybrid approach (static + LLM fallback)
   * @param {Object} story - Story work item
   * @param {Object} epic - Parent epic for context
   * @returns {Promise<string[]>} Array of validator names
   */
  async getValidatorsForStoryWithLLM(story, epic) {
    const validators = new Set();

    // 1. Add universal validators (static)
    this.storyMatrix.universal.forEach(v => validators.add(v));

    // 2. Check if domain is known
    const domainKnown = this.isDomainKnown(epic.domain, 'story');

    if (domainKnown) {
      // Fast path: Use static routing for known domains
      const domainValidators = this.storyMatrix.domains[epic.domain];
      domainValidators.forEach(v => validators.add(v));
    } else if (this.useSmartSelection && this.llmProvider) {
      // Slow path: Use LLM for unknown domains
      console.log(`   📡 Unknown domain "${epic.domain}" - using LLM selection...`);
      const llmValidators = await this.llmSelectValidators(story, 'story');
      llmValidators.forEach(v => validators.add(v));
    }

    // 3. Add feature-specific validators from epic (static)
    (epic.features || []).forEach(feature => {
      const featureNormalized = feature.toLowerCase().replace(/\s+/g, '-');
      const featureValidators = this.storyMatrix.features[featureNormalized] || [];
      featureValidators.forEach(v => validators.add(v));
    });

    // 4. Infer features from acceptance criteria (static)
    const inferredFeatures = this.inferFeaturesFromAcceptance(story.acceptance);
    inferredFeatures.forEach(feature => {
      const featureValidators = this.storyMatrix.features[feature] || [];
      featureValidators.forEach(v => validators.add(v));
    });

    return Array.from(validators);
  }
}

export { ValidationRouter };
