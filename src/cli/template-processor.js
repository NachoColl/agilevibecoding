import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { LLMProvider } from './llm-provider.js';
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
  constructor(progressPath = null, nonInteractive = false) {
    // Load environment variables from project .env
    dotenv.config({ path: path.join(process.cwd(), '.env') });

    this.templatePath = path.join(__dirname, 'templates/project.md');
    this.outputDir = path.join(process.cwd(), '.avc/project');
    this.outputPath = path.join(this.outputDir, 'doc.md');
    this.avcConfigPath = path.join(process.cwd(), '.avc/avc.json');
    this.progressPath = progressPath;
    this.nonInteractive = nonInteractive;

    // Read model configuration from avc.json
    const { provider, model } = this.readModelConfig();
    this._providerName = provider;
    this._modelName = model;
    this.llmProvider = null;
  }

  /**
   * Read model configuration from avc.json
   */
  readModelConfig() {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      const ceremony = config.settings?.ceremonies?.[0];
      if (ceremony) {
        return { provider: ceremony.provider || 'claude', model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929' };
      }
      // Legacy fallback: settings.model without ceremonies array
      return { provider: 'claude', model: config.settings?.model || 'claude-sonnet-4-5-20250929' };
    } catch (error) {
      console.warn('⚠️  Could not read model config, using default');
      return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
    }
  }

  /**
   * Read guidelines from avc.json ceremony configuration
   */
  readGuidelines() {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      const ceremony = config.settings?.ceremonies?.[0];
      return ceremony?.guidelines || {};
    } catch (error) {
      return {};
    }
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

      'TECHNICAL_CONSIDERATIONS': 'Technical requirements, constraints, or preferences for your application.\n   Examples: "Mobile-first responsive design", "Must work offline", "Real-time data sync", "PostgreSQL database"',

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
      console.log(`   ${guidance}`);
    }
    console.log('   Enter response (press Enter twice when done, or Enter immediately to skip):\n');

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
      console.log(`   ${guidance}`);
    }
    console.log('   Enter items one per line (empty line to finish, or Enter immediately to skip):\n');

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
      this.llmProvider = await LLMProvider.create(this._providerName, this._modelName);
      return this.llmProvider;
    } catch (error) {
      console.log(`⚠️  Could not initialize ${this._providerName} provider - AI suggestions will be skipped`);
      console.log(`   ${error.message}`);
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

    if (isPlural) {
      return `${contextSection}Suggest 3-5 appropriate values for "${displayName}".\n\nReturn only the suggestions, one per line, no numbering or bullets.`;
    } else {
      return `${contextSection}Suggest an appropriate value for "${displayName}".\n\nReturn only the suggestion text, concise (1-3 sentences).`;
    }
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
   * Generate AI suggestions for a variable
   */
  async generateSuggestions(variableName, isPlural, context) {
    if (!this.llmProvider && !(await this.initializeLLMProvider())) {
      return null;
    }

    try {
      const prompt = this.buildPrompt(variableName, isPlural, context);
      const text = await this.llmProvider.generate(prompt, isPlural ? 512 : 256);
      return this.parseLLMResponse(text, isPlural);
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
      console.log('   Generating AI response...');
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
        console.log('   📋 Using default guideline...');
        value = variable.isPlural
          ? [guidelines[guidelineKey]]  // Wrap in array for plural variables
          : guidelines[guidelineKey];

        console.log('   ✅ Guideline applied:');
        if (Array.isArray(value)) {
          value.forEach((item, idx) => console.log(`      ${idx + 1}. ${item}`));
        } else {
          console.log(`      ${value}`);
        }
        return { variable: variable.name, value, source: 'guideline', skipped: true };
      }

      // No guideline available, try AI suggestions
      console.log('   ✨ Generating AI suggestion...');
      value = await this.generateSuggestions(variable.name, variable.isPlural, context);

      if (value) {
        console.log('   ✅ AI suggestion:');
        if (Array.isArray(value)) {
          value.forEach((item, idx) => console.log(`      ${idx + 1}. ${item}`));
        } else {
          console.log(`      ${value}`);
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
      console.log('\n⚠️  AI enhancement skipped (no LLM provider available)');
      return templateWithValues;
    }

    console.log('\n🤖 Enhancing document with AI...');

    try {
      // Try to load agent instructions for enhancement stage
      const agentInstructions = this.getAgentForStage('enhancement');

      if (agentInstructions) {
        console.log('   Using custom agent instructions for enhancement');
        // Use agent instructions as system context
        const userPrompt = `Here is the project information with all variables filled in:

${templateWithValues}

Please review and enhance this document according to your role.`;

        const enhanced = await this.llmProvider.generate(userPrompt, 4096, agentInstructions);
        console.log('   ✓ Document enhanced successfully');
        return enhanced;
      } else {
        console.log('   Using default enhancement instructions');
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

        const enhanced = await this.llmProvider.generate(legacyPrompt, 4096);
        console.log('   ✓ Document enhanced successfully');
        return enhanced;
      }
    } catch (error) {
      console.warn(`\n⚠️  Could not enhance document: ${error.message}`);
      console.log('   Using template without AI enhancement');
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
        console.log('   ℹ️  VitePress documentation folder not found, skipping sync');
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
    fs.writeFileSync(this.outputPath, content, 'utf8');

    console.log(`\n✅ Project document generated!`);
    console.log(`   Location: ${this.outputPath}`);

    // Sync to VitePress if configured
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

        // Use pre-filled answers, but still allow AI enhancement for skipped (null) answers
        for (const variable of variables) {
          if (collectedValues[variable.name] === null) {
            console.log(`\n📝 ${variable.displayName}`);
            console.log('   Generating AI suggestion...');
            const aiValue = await this.generateSuggestions(variable.name, variable.isPlural, collectedValues);
            collectedValues[variable.name] = aiValue || '';
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

    // 5. Replace variables in template
    console.log('\n🔄 Preparing project document...');
    const templateWithValues = this.replaceVariables(templateContent, collectedValues);

    // 6. Enhance document with LLM
    const finalDocument = await this.generateFinalDocument(templateWithValues);

    // 7. Write to file
    await this.writeDocument(finalDocument);
  }
}

export { TemplateProcessor };
