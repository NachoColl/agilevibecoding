import fs from 'fs';
import path from 'path';
import { LLMProvider } from './llm-provider.js';
import { TokenTracker } from './token-tracker.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SeedProcessor - Decomposes a Story into Tasks and Subtasks
 */
class SeedProcessor {
  constructor(storyId) {
    this.storyId = storyId;
    this.ceremonyName = 'seed';
    this.avcPath = path.join(process.cwd(), '.avc');
    this.projectPath = path.join(this.avcPath, 'project');

    // Extract epic ID from story ID (context-0001-0001 → context-0001)
    const epicId = this.extractEpicId(storyId);

    // Build nested path: .avc/project/context-0001/context-0001-0001
    this.storyPath = path.join(this.projectPath, epicId, storyId);

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

  /**
   * Extract Epic ID from Story ID
   * @param {string} storyId - Story ID (e.g., context-0001-0001)
   * @returns {string} Epic ID (e.g., context-0001)
   */
  extractEpicId(storyId) {
    // Story format: context-XXXX-YYYY
    // Epic format:  context-XXXX
    const match = storyId.match(/^(context-\d+)-\d+$/);

    if (!match) {
      throw new Error(`Invalid story ID format: ${storyId}. Expected: context-XXXX-YYYY`);
    }

    return match[1];
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
    // Check Story ID format
    if (!this.storyId || !this.storyId.match(/^context-\d{4}-\d{4}$/)) {
      throw new Error(
        `Invalid Story ID format: ${this.storyId}\nExpected format: context-XXXX-XXXX (e.g., context-0001-0001)`
      );
    }

    // Check Story directory exists
    if (!fs.existsSync(this.storyPath)) {
      throw new Error(
        `Story ${this.storyId} not found.\nPlease run /sprint-planning first to create Stories.`
      );
    }

    // Check Story work.json exists
    const storyWorkJsonPath = path.join(this.storyPath, 'work.json');
    if (!fs.existsSync(storyWorkJsonPath)) {
      throw new Error(
        `Story metadata not found: ${this.storyId}/work.json`
      );
    }

    // Check Story has no existing tasks
    const storyWork = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));
    if (storyWork.children && storyWork.children.length > 0) {
      throw new Error(
        `Story ${this.storyId} already has tasks\nChildren: ${storyWork.children.join(', ')}\nCannot re-seed a Story that already has Tasks.`
      );
    }

    // Check Story context.md exists
    const storyContextPath = path.join(this.storyPath, 'context.md');
    if (!fs.existsSync(storyContextPath)) {
      throw new Error(
        `Story context not found: ${this.storyId}/context.md`
      );
    }
  }

  // STAGE 2: Read Story context and hierarchy
  readStoryContext() {
    // Read Story work.json
    const storyWorkJsonPath = path.join(this.storyPath, 'work.json');
    const storyWork = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));

    // Read Story context.md
    const storyContextPath = path.join(this.storyPath, 'context.md');
    const storyContext = fs.readFileSync(storyContextPath, 'utf8');

    // Extract Epic ID from Story ID (context-0001-0001 → context-0001)
    const epicId = this.extractEpicId(this.storyId);
    const epicPath = path.join(this.projectPath, epicId);

    // Read Epic context.md
    const epicContextPath = path.join(epicPath, 'context.md');
    let epicContext = '';
    if (fs.existsSync(epicContextPath)) {
      epicContext = fs.readFileSync(epicContextPath, 'utf8');
    }

    // Read Epic work.json
    const epicWorkJsonPath = path.join(epicPath, 'work.json');
    let epicWork = {};
    if (fs.existsSync(epicWorkJsonPath)) {
      epicWork = JSON.parse(fs.readFileSync(epicWorkJsonPath, 'utf8'));
    }

    // Read Project context.md
    const projectContextPath = path.join(this.projectPath, 'project/context.md');
    let projectContext = '';
    if (fs.existsSync(projectContextPath)) {
      projectContext = fs.readFileSync(projectContextPath, 'utf8');
    }

    return {
      storyWork,
      storyContext,
      epicWork,
      epicContext,
      projectContext
    };
  }

  // STAGE 3: Decompose Story → Tasks + Subtasks
  async decomposeIntoTasksSubtasks(contextData) {
    console.log('\n🔄 Stage 1/3: Decomposing Story into Tasks and Subtasks...\n');

    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    if (!this.llmProvider) {
      throw new Error('LLM provider required for decomposition');
    }

    // Read agent instructions
    const taskSubtaskDecomposerAgent = fs.readFileSync(
      path.join(this.agentsPath, 'task-subtask-decomposer.md'),
      'utf8'
    );

    // Build prompt
    const { storyWork, storyContext, epicWork, epicContext, projectContext } = contextData;

    let prompt = `Given the following Story, decompose it into Tasks and Subtasks:

**Story ID:** ${this.storyId}
**Story Name:** ${storyWork.name}
**Story Description:** ${storyWork.description}
**User Type:** ${storyWork.userType}
**Acceptance Criteria:**
${storyWork.acceptance.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

**Story Context:**
${storyContext}

**Epic Context (${epicWork.name}):**
${epicContext}

**Project Context:**
${projectContext}

Decompose this Story into:
- 2-5 Tasks (technical components: backend, frontend, database, testing, infrastructure)
- 1-3 Subtasks per Task (atomic work units, implementable in 1-4 hours)

Return your response as JSON following the exact structure specified in your instructions.`;

    const hierarchy = await this.retryWithBackoff(
      () => this.llmProvider.generateJSON(prompt, taskSubtaskDecomposerAgent),
      'Task/Subtask decomposition'
    );

    if (!hierarchy.tasks || !Array.isArray(hierarchy.tasks)) {
      throw new Error('Invalid decomposition response: missing tasks array');
    }

    // Calculate total subtasks
    const totalSubtasks = hierarchy.tasks.reduce((sum, task) => sum + (task.subtasks?.length || 0), 0);

    console.log(`✅ Generated ${hierarchy.tasks.length} Tasks with ${totalSubtasks} Subtasks\n`);

    return hierarchy;
  }

  // STAGE 4: Validate Task/Subtask structure
  validateTaskSubtaskStructure(hierarchy) {
    const { tasks } = hierarchy;

    if (tasks.length < 2 || tasks.length > 5) {
      console.warn(`⚠️  Warning: Expected 2-5 Tasks, got ${tasks.length}`);
    }

    for (const task of tasks) {
      const subtaskCount = task.subtasks?.length || 0;
      if (subtaskCount < 1 || subtaskCount > 3) {
        console.warn(`⚠️  Warning: Task ${task.name} has ${subtaskCount} Subtasks (expected 1-3)`);
      }

      // Validate Task ID format (context-XXXX-XXXX-XXXX)
      if (!task.id || !task.id.match(/^context-\d{4}-\d{4}-\d{4}$/)) {
        throw new Error(`Invalid Task ID format: ${task.id}`);
      }

      // Validate Subtask ID format (context-XXXX-XXXX-XXXX-XXXX)
      for (const subtask of task.subtasks || []) {
        if (!subtask.id || !subtask.id.match(/^context-\d{4}-\d{4}-\d{4}-\d{4}$/)) {
          throw new Error(`Invalid Subtask ID format: ${subtask.id}`);
        }
      }
    }
  }

  // STAGE 5-6: Generate contexts
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
    const { projectContext, epicContext, storyContext, task, subtask } = data;

    let prompt = `Generate a context.md file for the following ${level}:\n\n`;
    prompt += `**Level:** ${level}\n`;
    prompt += `**ID:** ${id}\n\n`;

    if (level === 'task') {
      prompt += `**Task Name:** ${task.name}\n`;
      prompt += `**Task Category:** ${task.category}\n`;
      prompt += `**Task Description:** ${task.description}\n`;
      prompt += `**Technical Scope:** ${task.technicalScope}\n`;
      prompt += `**Acceptance Criteria:**\n${task.acceptance.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}\n\n`;
      prompt += `**Story Context:**\n${storyContext}\n\n`;
      prompt += `**Epic Context:**\n${epicContext}\n\n`;
      prompt += `**Project Context:**\n${projectContext}\n\n`;
    } else if (level === 'subtask') {
      prompt += `**Subtask Name:** ${subtask.name}\n`;
      prompt += `**Subtask Description:** ${subtask.description}\n`;
      prompt += `**Technical Details:** ${subtask.technicalDetails}\n`;
      prompt += `**Acceptance Criteria:**\n${subtask.acceptance.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}\n\n`;
      prompt += `**Task Context (${task.name}):**\n`;
      prompt += `- Category: ${task.category}\n`;
      prompt += `- Technical Scope: ${task.technicalScope}\n\n`;
      prompt += `**Story Context:**\n${storyContext}\n\n`;
      prompt += `**Epic Context:**\n${epicContext}\n\n`;
      prompt += `**Project Context:**\n${projectContext}\n\n`;
    }

    prompt += `Return your response as JSON following the exact structure specified in your instructions.`;

    return prompt;
  }

  // STAGE 7: Write Task/Subtask files
  async writeTaskSubtaskFiles(hierarchy, contextData) {
    console.log('\n💾 Stage 3/3: Writing Task and Subtask files...\n');

    // Read agent
    const featureContextGeneratorAgent = fs.readFileSync(
      path.join(this.agentsPath, 'feature-context-generator.md'),
      'utf8'
    );

    const { storyContext, epicContext, projectContext } = contextData;

    let taskCount = 0;
    let subtaskCount = 0;
    const taskIds = [];

    for (const task of hierarchy.tasks) {
      const taskDir = path.join(this.projectPath, task.id);

      if (!fs.existsSync(taskDir)) {
        fs.mkdirSync(taskDir, { recursive: true });
      }

      // Write Task doc.md (stub)
      fs.writeFileSync(
        path.join(taskDir, 'doc.md'),
        `# ${task.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*\n`,
        'utf8'
      );
      console.log(`   ✅ ${task.id}/doc.md`);

      // Generate and write Task context.md
      const taskContext = await this.retryWithBackoff(
        () => this.generateContext('task', task.id, { projectContext, epicContext, storyContext, task }, featureContextGeneratorAgent),
        `Task ${task.id} context`
      );
      fs.writeFileSync(
        path.join(taskDir, 'context.md'),
        taskContext.contextMarkdown,
        'utf8'
      );
      console.log(`   ✅ ${task.id}/context.md`);

      // Write Task work.json
      const taskWorkJson = {
        id: task.id,
        name: task.name,
        type: 'task',
        category: task.category,
        description: task.description,
        technicalScope: task.technicalScope,
        acceptance: task.acceptance,
        status: 'planned',
        dependencies: task.dependencies || [],
        children: (task.subtasks || []).map(s => s.id),
        metadata: {
          created: new Date().toISOString(),
          ceremony: this.ceremonyName,
          tokenBudget: taskContext.tokenCount
        }
      };
      fs.writeFileSync(
        path.join(taskDir, 'work.json'),
        JSON.stringify(taskWorkJson, null, 2),
        'utf8'
      );
      console.log(`   ✅ ${task.id}/work.json`);

      taskCount++;
      taskIds.push(task.id);

      // Write Subtask files
      for (const subtask of task.subtasks || []) {
        const subtaskDir = path.join(this.projectPath, subtask.id);

        if (!fs.existsSync(subtaskDir)) {
          fs.mkdirSync(subtaskDir, { recursive: true });
        }

        // Write Subtask doc.md (stub)
        fs.writeFileSync(
          path.join(subtaskDir, 'doc.md'),
          `# ${subtask.name}\n\n*Documentation will be added during implementation and retrospective ceremonies.*\n`,
          'utf8'
        );
        console.log(`      ✅ ${subtask.id}/doc.md`);

        // Generate and write Subtask context.md
        const subtaskContext = await this.retryWithBackoff(
          () => this.generateContext('subtask', subtask.id, { projectContext, epicContext, storyContext, task, subtask }, featureContextGeneratorAgent),
          `Subtask ${subtask.id} context`
        );
        fs.writeFileSync(
          path.join(subtaskDir, 'context.md'),
          subtaskContext.contextMarkdown,
          'utf8'
        );
        console.log(`      ✅ ${subtask.id}/context.md`);

        // Write Subtask work.json
        const subtaskWorkJson = {
          id: subtask.id,
          name: subtask.name,
          type: 'subtask',
          description: subtask.description,
          technicalDetails: subtask.technicalDetails,
          acceptance: subtask.acceptance,
          status: 'planned',
          dependencies: subtask.dependencies || [],
          children: [],  // Subtasks have no children
          metadata: {
            created: new Date().toISOString(),
            ceremony: this.ceremonyName,
            tokenBudget: subtaskContext.tokenCount
          }
        };
        fs.writeFileSync(
          path.join(subtaskDir, 'work.json'),
          JSON.stringify(subtaskWorkJson, null, 2),
          'utf8'
        );
        console.log(`      ✅ ${subtask.id}/work.json`);

        subtaskCount++;
      }

      console.log(''); // Empty line between tasks
    }

    return { taskCount, subtaskCount, taskIds };
  }

  // STAGE 8: Update Story work.json
  updateStoryWorkJson(taskIds) {
    const storyWorkJsonPath = path.join(this.storyPath, 'work.json');
    const storyWork = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));

    storyWork.children = taskIds;
    storyWork.metadata.lastUpdated = new Date().toISOString();
    storyWork.metadata.seeded = true;

    fs.writeFileSync(
      storyWorkJsonPath,
      JSON.stringify(storyWork, null, 2),
      'utf8'
    );

    console.log(`✅ Updated ${this.storyId}/work.json\n`);
  }

  // Display summary
  displaySummary(hierarchy, contextData, taskCount, subtaskCount) {
    console.log(`\n✅ Story decomposed into Tasks and Subtasks!\n`);
    console.log(`Story: ${contextData.storyWork.name} (${this.storyId})`);
    console.log(`  Created:`);
    console.log(`    • ${taskCount} Tasks`);
    console.log(`    • ${subtaskCount} Subtasks\n`);

    console.log(`Structure:`);
    for (const task of hierarchy.tasks) {
      console.log(`  Task: ${task.name} (${task.id})`);
      for (const subtask of task.subtasks || []) {
        console.log(`    • Subtask: ${subtask.name}`);
      }
    }
  }

  // Main execution method
  async execute() {
    try {
      console.log('\n🌱 Seed Ceremony\n');
      console.log(`Story: ${this.storyId}\n`);

      // Stage 1: Validate
      this.validatePrerequisites();

      // Stage 2: Read Story context
      console.log('📋 Reading Story context...\n');
      const contextData = this.readStoryContext();

      // Stage 3: Decompose
      let hierarchy = await this.decomposeIntoTasksSubtasks(contextData);

      // Stage 4: Validate
      this.validateTaskSubtaskStructure(hierarchy);

      // Stage 5-7: Generate contexts and write files
      console.log('\n📝 Stage 2/3: Generating context files...\n');
      const { taskCount, subtaskCount, taskIds } = await this.writeTaskSubtaskFiles(hierarchy, contextData);

      // Stage 8: Update Story work.json
      this.updateStoryWorkJson(taskIds);

      // Display summary
      this.displaySummary(hierarchy, contextData, taskCount, subtaskCount);

      // Display token usage
      if (this.llmProvider) {
        const usage = this.llmProvider.getTokenUsage();
        console.log('\n📊 Token Usage:');
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
      console.log('   1. Review Task/Subtask breakdown in .avc/project/');
      console.log('   2. Start implementing Subtasks (smallest work units)\n');

    } catch (error) {
      console.error(`\n❌ Seed ceremony failed: ${error.message}\n`);
      throw error;
    }
  }
}

export { SeedProcessor };
