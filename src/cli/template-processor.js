import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import Anthropic from '@anthropic-ai/sdk';
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
  constructor(progressPath = null) {
    // Load environment variables from project .env
    dotenv.config({ path: path.join(process.cwd(), '.env') });

    this.templatePath = path.join(__dirname, 'templates/project.md');
    this.outputDir = path.join(process.cwd(), '.avc/project');
    this.outputPath = path.join(this.outputDir, 'doc.md');
    this.avcConfigPath = path.join(process.cwd(), '.avc/avc.json');
    this.progressPath = progressPath;

    // Read model configuration from avc.json
    this.model = this.readModelConfig();
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.claudeClient = null;
  }

  /**
   * Read model configuration from avc.json
   */
  readModelConfig() {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      return config.settings?.model || 'claude-sonnet-4-5-20250929';
    } catch (error) {
      console.warn('⚠️  Could not read model config, using default');
      return 'claude-sonnet-4-5-20250929';
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
   * Initialize Claude client
   */
  initializeClaudeClient() {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('⚠️  ANTHROPIC_API_KEY not found - AI suggestions will be skipped');
      return null;
    }

    this.claudeClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    return this.claudeClient;
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
  parseClaudeResponse(response, isPlural) {
    if (isPlural) {
      return response.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.match(/^[0-9\-*.]+\s/));
    }
    return response.trim();
  }

  /**
   * Generate AI suggestions for a variable
   */
  async generateSuggestions(variableName, isPlural, context) {
    if (!this.claudeClient && !this.initializeClaudeClient()) {
      return null;
    }

    try {
      const prompt = this.buildPrompt(variableName, isPlural, context);

      const response = await this.claudeClient.messages.create({
        model: this.model,
        max_tokens: isPlural ? 512 : 256,
        messages: [{ role: "user", content: prompt }]
      });

      return this.parseClaudeResponse(response.content[0].text, isPlural);
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

    if (variable.isPlural) {
      value = await this.promptPlural(variable.displayName, variable.guidance);
    } else {
      value = await this.promptSingular(variable.displayName, variable.guidance);
    }

    // If user skipped, try to generate AI suggestions
    if (value === null) {
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
    if (!this.claudeClient && !this.initializeClaudeClient()) {
      // No API key - save template as-is
      return templateWithValues;
    }

    console.log('\n🤖 Enhancing document with AI...');

    try {
      const response = await this.claudeClient.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `You are creating a project definition document for an Agile Vibe Coding (AVC) project.

Here is the project information with all variables filled in:

${templateWithValues}

Please review and enhance this document to ensure:
1. All sections are well-formatted and clear
2. Content is professional and actionable
3. Sections flow logically
4. Any incomplete sections are identified

Return the enhanced markdown document.`
        }]
      });

      return response.content[0].text;
    } catch (error) {
      console.warn(`⚠️  Could not enhance document: ${error.message}`);
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
      console.log(`Resuming with ${answeredCount}/${variables.length} questions already answered.\n`);
    } else {
      console.log(`Found ${variables.length} sections to complete.\n`);
    }

    // 4. Collect values with context accumulation
    for (const variable of variables) {
      // Skip already answered questions when resuming
      if (collectedValues[variable.name] !== undefined) {
        console.log(`\n✓ ${variable.displayName}`);
        console.log(`   Using previous answer: ${
          Array.isArray(collectedValues[variable.name])
            ? `${collectedValues[variable.name].length} items`
            : `"${collectedValues[variable.name].substring(0, 60)}${collectedValues[variable.name].length > 60 ? '...' : ''}"`
        }`);
        continue;
      }

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
