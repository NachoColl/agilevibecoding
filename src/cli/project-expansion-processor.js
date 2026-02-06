import fs from 'fs';
import path from 'path';
import { LLMProvider } from './llm-provider.js';
import { TokenTracker } from './token-tracker.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ProjectExpansionProcessor - Creates/expands Epics and Stories with duplicate detection
 */
class ProjectExpansionProcessor {
  constructor() {
    this.ceremonyName = 'project-expansion';
    this.avcPath = path.join(process.cwd(), '.avc');
    this.projectPath = path.join(this.avcPath, 'project');
    this.projectDocPath = path.join(this.projectPath, 'project/doc.md');
    this.projectContextPath = path.join(this.projectPath, 'project/context.md');
    this.avcConfigPath = path.join(this.avcPath, 'avc.json');
    this.agentsPath = path.join(__dirname, 'agents');

    // Read ceremony config
    const { provider, model } = this.readCeremonyConfig();
    this._providerName = provider;
    this._modelName = model;
    this.llmProvider = null;

    // Initialize token tracker
    this.tokenTracker = new TokenTracker(this.avcPath);
    this.tokenTracker.init();
  }

  readCeremonyConfig() {
    try {
      const config = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));
      const ceremony = config.settings?.ceremonies?.find(c => c.name === this.ceremonyName);

      if (!ceremony) {
        console.warn(`⚠️  Ceremony '${this.ceremonyName}' not found in config, using defaults`);
        return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
      }

      return {
        provider: ceremony.provider || 'claude',
        model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929'
      };
    } catch (error) {
      console.warn(`⚠️  Could not read ceremony config: ${error.message}`);
      return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
    }
  }

  async initializeLLMProvider() {
    try {
      this.llmProvider = await LLMProvider.create(this._providerName, this._modelName);
      return this.llmProvider;
    } catch (error) {
      console.log(`⚠️  Could not initialize ${this._providerName} provider`);
      console.log(`${error.message}`);
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
        console.log(`⚠️  Retry ${attempt}/${maxRetries} in ${delay/1000}s: ${operation}`);
        console.log(`Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // STAGE 1: Validate prerequisites
  validatePrerequisites() {
    if (!fs.existsSync(this.projectContextPath)) {
      throw new Error(
        'Project context not found. Please run /sponsor-call first to create the project foundation.'
      );
    }

    if (!fs.existsSync(this.projectDocPath)) {
      throw new Error(
        'Project documentation not found. Please run /sponsor-call first.'
      );
    }
  }

  // STAGE 2: Read existing hierarchy
  readExistingHierarchy() {
    const existingEpics = new Map();  // name -> id
    const existingStories = new Map(); // name -> id
    const maxEpicNum = { value: 0 };
    const maxStoryNums = new Map();  // epicId -> maxNum

    if (!fs.existsSync(this.projectPath)) {
      return { existingEpics, existingStories, maxEpicNum, maxStoryNums };
    }

    const dirs = fs.readdirSync(this.projectPath);

    for (const dir of dirs) {
      const workJsonPath = path.join(this.projectPath, dir, 'work.json');

      if (!fs.existsSync(workJsonPath)) continue;

      try {
        const work = JSON.parse(fs.readFileSync(workJsonPath, 'utf8'));

        if (work.type === 'epic') {
          existingEpics.set(work.name.toLowerCase(), work.id);

          // Track max epic number (context-0001 → 1)
          const match = work.id.match(/^context-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxEpicNum.value) maxEpicNum.value = num;
          }
        } else if (work.type === 'story') {
          existingStories.set(work.name.toLowerCase(), work.id);

          // Track max story number per epic (context-0001-0003 → epic 0001, story 3)
          const match = work.id.match(/^context-(\d+)-(\d+)$/);
          if (match) {
            const epicId = `context-${match[1]}`;
            const storyNum = parseInt(match[2], 10);

            if (!maxStoryNums.has(epicId)) {
              maxStoryNums.set(epicId, 0);
            }
            if (storyNum > maxStoryNums.get(epicId)) {
              maxStoryNums.set(epicId, storyNum);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not parse ${workJsonPath}: ${error.message}`);
      }
    }

    return { existingEpics, existingStories, maxEpicNum, maxStoryNums };
  }

  // STAGE 3: Collect new scope (optional expansion)
  async collectNewScope() {
    // For now, read INITIAL_SCOPE from doc.md
    // TODO: Add interactive prompt for additional features
    const docContent = fs.readFileSync(this.projectDocPath, 'utf8');

    // Extract INITIAL_SCOPE section (between ## Initial Scope and next ##)
    const match = docContent.match(/## Initial Scope\s+([\s\S]+?)(?=\n##|$)/);
    if (!match) {
      throw new Error('Could not find Initial Scope section in project documentation');
    }

    return match[1].trim();
  }

  // STAGE 4: Decompose into Epics + Stories
  async decomposeIntoEpicsStories(scope, existingEpics, existingStories, projectContext) {
    console.log('\n🔄 Stage 1/3: Decomposing scope into Epics and Stories...\n');

    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    if (!this.llmProvider) {
      throw new Error('LLM provider required for decomposition');
    }

    // Read agent instructions
    const epicStoryDecomposerAgent = fs.readFileSync(
      path.join(this.agentsPath, 'epic-story-decomposer.md'),
      'utf8'
    );

    // Build prompt with duplicate detection
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

    const hierarchy = await this.retryWithBackoff(
      () => this.llmProvider.generateJSON(prompt, epicStoryDecomposerAgent),
      'Epic/Story decomposition'
    );

    if (!hierarchy.epics || !Array.isArray(hierarchy.epics)) {
      throw new Error('Invalid decomposition response: missing epics array');
    }

    console.log(`✅ Generated ${hierarchy.epics.length} new Epics with ${hierarchy.validation?.storyCount || 0} new Stories\n`);

    return hierarchy;
  }

  // STAGE 5: Renumber IDs to avoid collisions
  renumberHierarchy(hierarchy, maxEpicNum, maxStoryNums) {
    let nextEpicNum = maxEpicNum.value + 1;

    for (const epic of hierarchy.epics) {
      const oldEpicId = epic.id;
      const newEpicId = `context-${String(nextEpicNum).padStart(4, '0')}`;
      epic.id = newEpicId;

      let nextStoryNum = (maxStoryNums.get(newEpicId) || 0) + 1;

      for (const story of epic.stories || []) {
        const newStoryId = `${newEpicId}-${String(nextStoryNum).padStart(4, '0')}`;
        story.id = newStoryId;
        nextStoryNum++;
      }

      nextEpicNum++;
    }

    return hierarchy;
  }

  // STAGE 6-7: Generate contexts
  async generateContext(level, id, data, agentInstructions) {
    const prompt = this.buildContextPrompt(level, id, data);
    const result = await this.llmProvider.generateJSON(prompt, agentInstructions);

    if (!result.contextMarkdown || !result.tokenCount) {
      throw new Error(`Invalid context response for ${id}: missing required fields`);
    }

    if (!result.withinBudget) {
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

  // STAGE 8: Write hierarchy files
  async writeHierarchyFiles(hierarchy, projectContext) {
    console.log('\n💾 Stage 3/3: Writing hierarchy files...\n');

    // Read agent
    const featureContextGeneratorAgent = fs.readFileSync(
      path.join(this.agentsPath, 'feature-context-generator.md'),
      'utf8'
    );

    let epicCount = 0;
    let storyCount = 0;

    for (const epic of hierarchy.epics) {
      const epicDir = path.join(this.projectPath, epic.id);

      if (!fs.existsSync(epicDir)) {
        fs.mkdirSync(epicDir, { recursive: true });
      }

      // Write Epic doc.md (stub)
      fs.writeFileSync(
        path.join(epicDir, 'doc.md'),
        `# ${epic.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*\n`,
        'utf8'
      );
      console.log(`   ✅ ${epic.id}/doc.md`);

      // Generate and write Epic context.md
      const epicContext = await this.retryWithBackoff(
        () => this.generateContext('epic', epic.id, { projectContext, epic }, featureContextGeneratorAgent),
        `Epic ${epic.id} context`
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
          ceremony: this.ceremonyName,
          tokenBudget: epicContext.tokenCount
        }
      };
      fs.writeFileSync(
        path.join(epicDir, 'work.json'),
        JSON.stringify(epicWorkJson, null, 2),
        'utf8'
      );
      console.log(`   ✅ ${epic.id}/work.json`);

      epicCount++;

      // Write Story files
      for (const story of epic.stories || []) {
        const storyDir = path.join(this.projectPath, story.id);

        if (!fs.existsSync(storyDir)) {
          fs.mkdirSync(storyDir, { recursive: true });
        }

        // Write Story doc.md (stub)
        fs.writeFileSync(
          path.join(storyDir, 'doc.md'),
          `# ${story.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*\n`,
          'utf8'
        );
        console.log(`      ✅ ${story.id}/doc.md`);

        // Generate and write Story context.md
        const storyContext = await this.retryWithBackoff(
          () => this.generateContext('story', story.id, { projectContext, epic, story }, featureContextGeneratorAgent),
          `Story ${story.id} context`
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
          children: [],  // Empty until /seed creates tasks
          metadata: {
            created: new Date().toISOString(),
            ceremony: this.ceremonyName,
            tokenBudget: storyContext.tokenCount
          }
        };
        fs.writeFileSync(
          path.join(storyDir, 'work.json'),
          JSON.stringify(storyWorkJson, null, 2),
          'utf8'
        );
        console.log(`      ✅ ${story.id}/work.json`);

        storyCount++;
      }

      console.log(''); // Empty line between epics
    }

    return { epicCount, storyCount };
  }

  // Count total hierarchy
  countTotalHierarchy() {
    let totalEpics = 0;
    let totalStories = 0;

    if (!fs.existsSync(this.projectPath)) {
      return { totalEpics, totalStories };
    }

    const dirs = fs.readdirSync(this.projectPath);

    for (const dir of dirs) {
      const workJsonPath = path.join(this.projectPath, dir, 'work.json');

      if (!fs.existsSync(workJsonPath)) continue;

      try {
        const work = JSON.parse(fs.readFileSync(workJsonPath, 'utf8'));

        if (work.type === 'epic') totalEpics++;
        if (work.type === 'story') totalStories++;
      } catch (error) {
        // Ignore parse errors
      }
    }

    return { totalEpics, totalStories };
  }

  // Main execution method
  async execute() {
    try {
      console.log('\n📊 Project Expansion Ceremony\n');

      // Stage 1: Validate
      this.validatePrerequisites();

      // Stage 2: Read existing hierarchy
      console.log('📋 Analyzing existing project structure...\n');
      const { existingEpics, existingStories, maxEpicNum, maxStoryNums } = this.readExistingHierarchy();

      if (existingEpics.size > 0) {
        console.log(`Found ${existingEpics.size} existing Epics, ${existingStories.size} existing Stories\n`);
      } else {
        console.log('No existing Epics/Stories found (first expansion)\n');
      }

      // Stage 3: Collect scope
      const scope = await this.collectNewScope();

      // Read project context
      const projectContext = fs.readFileSync(this.projectContextPath, 'utf8');

      // Stage 4: Decompose
      let hierarchy = await this.decomposeIntoEpicsStories(scope, existingEpics, existingStories, projectContext);

      // Stage 5: Renumber IDs
      hierarchy = this.renumberHierarchy(hierarchy, maxEpicNum, maxStoryNums);

      // Stage 6-8: Generate contexts and write files
      console.log('\n📝 Stage 2/3: Generating context files...\n');
      const { epicCount, storyCount } = await this.writeHierarchyFiles(hierarchy, projectContext);

      // Display summary
      const { totalEpics, totalStories } = this.countTotalHierarchy();

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
        console.log('📊 Token Usage:');
        console.log(`   Input: ${usage.inputTokens.toLocaleString()} tokens`);
        console.log(`   Output: ${usage.outputTokens.toLocaleString()} tokens`);
        console.log(`   Total: ${usage.totalTokens.toLocaleString()} tokens`);
        console.log(`   API Calls: ${usage.totalCalls}`);

        this.tokenTracker.addExecution(this.ceremonyName, {
          input: usage.inputTokens,
          output: usage.outputTokens
        });
        console.log('✅ Token history updated\n');
      }

      console.log('Next steps:');
      console.log('   1. Review Epic/Story structure in .avc/project/');
      console.log('   2. Run /seed <story-id> to decompose a Story into Tasks/Subtasks\n');

    } catch (error) {
      console.error(`\n❌ Project expansion failed: ${error.message}\n`);
      throw error;
    }
  }
}

export { ProjectExpansionProcessor };
