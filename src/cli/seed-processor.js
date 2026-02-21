import fs from 'fs';
import path from 'path';
import { LLMProvider } from './llm-provider.js';
import { TokenTracker } from './token-tracker.js';
import { fileURLToPath } from 'url';
import { getCeremonyHeader } from './message-constants.js';
import { sendError, sendWarning, sendSuccess, sendInfo, sendOutput, sendIndented, sendSectionHeader } from './messaging-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SeedProcessor - Decomposes a Story into Tasks and Subtasks
 */
class SeedProcessor {
  /**
   * Write structured entry to active command log file only.
   * Uses [DEBUG] prefix so ConsoleOutputManager routes to file, not terminal.
   */
  debug(message, data = null) {
    const ts = new Date().toISOString();
    if (data !== null) {
      console.log(`[DEBUG][${ts}] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[DEBUG][${ts}] ${message}`);
    }
  }

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
        sendWarning(`Ceremony '${this.ceremonyName}' not found in config, using defaults`);
        this.debug('[WARNING] Ceremony not found in config — using defaults', { ceremonyName: this.ceremonyName });
        return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
      }

      const result = {
        provider: ceremony.provider || 'claude',
        model: ceremony.defaultModel || 'claude-sonnet-4-5-20250929'
      };
      this.debug('[INFO] Ceremony config loaded', { ...result, ceremonyName: this.ceremonyName });
      return result;
    } catch (error) {
      sendWarning(`Could not read ceremony config: ${error.message}`);
      this.debug('[ERROR] Failed to read ceremony config', { error: error.message });
      return { provider: 'claude', model: 'claude-sonnet-4-5-20250929' };
    }
  }

  async initializeLLMProvider() {
    try {
      this.llmProvider = await LLMProvider.create(this._providerName, this._modelName);
      return this.llmProvider;
    } catch (error) {
      sendWarning(`Could not initialize ${this._providerName} provider`);
      sendOutput(`${error.message}`);
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
        sendWarning(`Retry ${attempt}/${maxRetries} in ${delay/1000}s: ${operation}`);
        sendOutput(`Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // STAGE 1: Validate prerequisites
  validatePrerequisites() {
    this.debug('[INFO] validatePrerequisites() called', { storyId: this.storyId, storyPath: this.storyPath });

    // Check Story ID format
    if (!this.storyId || !this.storyId.match(/^context-\d{4}-\d{4}$/)) {
      this.debug('[ERROR] Invalid story ID format', { storyId: this.storyId });
      throw new Error(
        `Invalid Story ID format: ${this.storyId}\nExpected format: context-XXXX-XXXX (e.g., context-0001-0001)`
      );
    }

    // Check Story directory exists
    const storyDirExists = fs.existsSync(this.storyPath);
    this.debug('[DEBUG] Story directory check', { storyPath: this.storyPath, exists: storyDirExists });
    if (!storyDirExists) {
      throw new Error(
        `Story ${this.storyId} not found.\nPlease run /sprint-planning first to create Stories.`
      );
    }

    // Check Story work.json exists
    const storyWorkJsonPath = path.join(this.storyPath, 'work.json');
    const workJsonExists = fs.existsSync(storyWorkJsonPath);
    this.debug('[DEBUG] Story work.json check', { path: storyWorkJsonPath, exists: workJsonExists });
    if (!workJsonExists) {
      throw new Error(
        `Story metadata not found: ${this.storyId}/work.json`
      );
    }

    // Check Story has no existing tasks
    const storyWork = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));
    this.debug('[DEBUG] Story work.json content', {
      name: storyWork.name,
      type: storyWork.type,
      existingChildren: storyWork.children?.length || 0,
      children: storyWork.children || [],
    });
    if (storyWork.children && storyWork.children.length > 0) {
      this.debug('[ERROR] Story already has tasks — cannot re-seed', { children: storyWork.children });
      throw new Error(
        `Story ${this.storyId} already has tasks\nChildren: ${storyWork.children.join(', ')}\nCannot re-seed a Story that already has Tasks.`
      );
    }

    // Check Story context.md exists
    const storyContextPath = path.join(this.storyPath, 'context.md');
    const contextExists = fs.existsSync(storyContextPath);
    this.debug('[DEBUG] Story context.md check', { path: storyContextPath, exists: contextExists });
    if (!contextExists) {
      throw new Error(
        `Story context not found: ${this.storyId}/context.md`
      );
    }

    this.debug('[INFO] validatePrerequisites() passed — all checks OK');
  }

  // STAGE 2: Read Story context and hierarchy
  readStoryContext() {
    this.debug('[INFO] readStoryContext() called', { storyPath: this.storyPath });

    // Read Story work.json
    const storyWorkJsonPath = path.join(this.storyPath, 'work.json');
    const storyWork = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));
    this.debug('[DEBUG] Story work.json loaded', {
      name: storyWork.name,
      type: storyWork.type,
      id: storyWork.id,
      description: storyWork.description?.substring(0, 100),
    });

    // Read Story context.md
    const storyContextPath = path.join(this.storyPath, 'context.md');
    const storyContext = fs.readFileSync(storyContextPath, 'utf8');
    this.debug('[DEBUG] Story context.md loaded', { sizeChars: storyContext.length });

    // Extract Epic ID from Story ID (context-0001-0001 → context-0001)
    const epicId = this.extractEpicId(this.storyId);
    const epicPath = path.join(this.projectPath, epicId);

    // Read Epic context.md
    const epicContextPath = path.join(epicPath, 'context.md');
    let epicContext = '';
    if (fs.existsSync(epicContextPath)) {
      epicContext = fs.readFileSync(epicContextPath, 'utf8');
      this.debug('[DEBUG] Epic context.md loaded', { epicId, sizeChars: epicContext.length });
    } else {
      this.debug('[WARNING] Epic context.md not found', { epicContextPath });
    }

    // Read Epic work.json
    const epicWorkJsonPath = path.join(epicPath, 'work.json');
    let epicWork = {};
    if (fs.existsSync(epicWorkJsonPath)) {
      epicWork = JSON.parse(fs.readFileSync(epicWorkJsonPath, 'utf8'));
      this.debug('[DEBUG] Epic work.json loaded', { epicName: epicWork.name, storyCount: epicWork.children?.length });
    } else {
      this.debug('[WARNING] Epic work.json not found', { epicWorkJsonPath });
    }

    // Read Project context.md
    const projectContextPath = path.join(this.projectPath, 'project/context.md');
    let projectContext = '';
    if (fs.existsSync(projectContextPath)) {
      projectContext = fs.readFileSync(projectContextPath, 'utf8');
      this.debug('[DEBUG] Project context.md loaded', { sizeChars: projectContext.length });
    } else {
      this.debug('[WARNING] Project context.md not found', { projectContextPath });
    }

    this.debug('[INFO] readStoryContext() complete', {
      storyName: storyWork.name,
      epicId,
      hasEpicContext: !!epicContext,
      hasProjectContext: !!projectContext,
    });

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
    const startTime = Date.now();
    this.debug('[INFO] decomposeIntoTasksSubtasks() called', { storyId: this.storyId });

    if (!this.llmProvider) {
      this.debug('[INFO] Initializing LLM provider', { provider: this._providerName, model: this._modelName });
      await this.initializeLLMProvider();
    }

    if (!this.llmProvider) {
      this.debug('[ERROR] LLM provider initialization failed');
      throw new Error('LLM provider required for decomposition');
    }
    this.debug('[INFO] LLM provider ready', { provider: this._providerName, model: this._modelName });

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

    this.debug('[INFO] Calling LLM for Task/Subtask decomposition', {
      provider: this._providerName,
      model: this._modelName,
      storyName: contextData.storyWork?.name,
      promptLengthChars: prompt.length,
    });

    const hierarchy = await this.retryWithBackoff(
      () => this.llmProvider.generateJSON(prompt, taskSubtaskDecomposerAgent),
      'Task/Subtask decomposition'
    );

    if (!hierarchy.tasks || !Array.isArray(hierarchy.tasks)) {
      this.debug('[ERROR] Invalid LLM response — missing tasks array', { responseKeys: Object.keys(hierarchy) });
      throw new Error('Invalid decomposition response: missing tasks array');
    }

    // Calculate total subtasks
    const totalSubtasks = hierarchy.tasks.reduce((sum, task) => sum + (task.subtasks?.length || 0), 0);

    this.debug('[INFO] Decomposition complete', {
      taskCount: hierarchy.tasks.length,
      totalSubtasks,
      taskNames: hierarchy.tasks.map(t => t.name),
      duration: `${Date.now() - startTime}ms`,
    });


    return hierarchy;
  }

  // STAGE 4: Validate Task/Subtask structure
  validateTaskSubtaskStructure(hierarchy) {
    this.debug('[INFO] validateTaskSubtaskStructure() called', { taskCount: hierarchy.tasks?.length });

    const { tasks } = hierarchy;

    if (tasks.length < 2 || tasks.length > 5) {
      this.debug('[WARNING] Unexpected task count', { count: tasks.length, expected: '2-5' });
      sendWarning(`Expected 2-5 Tasks, got ${tasks.length}`);
    }

    for (const task of tasks) {
      const subtaskCount = task.subtasks?.length || 0;
      if (subtaskCount < 1 || subtaskCount > 3) {
        this.debug('[WARNING] Unexpected subtask count', { task: task.name, count: subtaskCount, expected: '1-3' });
        sendWarning(`Task ${task.name} has ${subtaskCount} Subtasks (expected 1-3)`);
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

        subtaskCount++;
      }

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

  }

  // Display summary
  displaySummary(hierarchy, contextData, taskCount, subtaskCount) {
    sendOutput(`${contextData.storyWork.name}: ${taskCount} Tasks, ${subtaskCount} Subtasks created.`);
    sendOutput('Run /seed on each task to continue decomposition.');
    for (const task of hierarchy.tasks) {
      sendIndented(`Task: ${task.name} (${task.id})`, 1);
      for (const subtask of task.subtasks || []) {
        sendIndented(`- Subtask: ${subtask.name}`, 2);
      }
    }
  }

  // Main execution method
  async execute() {
    const execStartTime = Date.now();
    this.debug('[INFO] SeedProcessor.execute() started', {
      storyId: this.storyId,
      storyPath: this.storyPath,
      provider: this._providerName,
      model: this._modelName,
    });

    try {
      const header = getCeremonyHeader('seed');
      console.log(`\n${header.title}\n`);
      console.log(`Story: ${this.storyId}\n`);

      // Stage 1: Validate
      this.debug('[INFO] Stage 1/3: Validating prerequisites');
      this.validatePrerequisites();

      // Stage 2: Read Story context
      this.debug('[INFO] Stage 2a: Reading Story context files');
      sendInfo('Reading Story context...');
      const contextData = this.readStoryContext();

      // Stage 3: Decompose
      this.debug('[INFO] Stage 2b: Decomposing Story into Tasks/Subtasks via LLM');
      let hierarchy = await this.decomposeIntoTasksSubtasks(contextData);

      // Stage 4: Validate
      this.debug('[INFO] Stage 2c: Validating decomposition structure');
      this.validateTaskSubtaskStructure(hierarchy);

      // Stage 5-7: Generate contexts and write files
      this.debug('[INFO] Stage 2/3: Generating context files and writing to disk');
      sendSectionHeader('Stage 2/3: Generating context files');
      const { taskCount, subtaskCount, taskIds } = await this.writeTaskSubtaskFiles(hierarchy, contextData);
      this.debug('[INFO] Files written', { taskCount, subtaskCount, taskIds });

      // Stage 8: Update Story work.json
      this.debug('[INFO] Stage 3/3: Updating Story work.json with task IDs');
      this.updateStoryWorkJson(taskIds);

      // Display summary
      this.displaySummary(hierarchy, contextData, taskCount, subtaskCount);

      // Display token usage
      if (this.llmProvider) {
        const usage = this.llmProvider.getTokenUsage();
        this.debug('[INFO] Token usage summary', {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          apiCalls: usage.totalCalls,
        });

        sendSectionHeader('Token Usage');
        sendIndented(`Input: ${usage.inputTokens.toLocaleString()} tokens`, 1);
        sendIndented(`Output: ${usage.outputTokens.toLocaleString()} tokens`, 1);
        sendIndented(`Total: ${usage.totalTokens.toLocaleString()} tokens`, 1);
        sendIndented(`API Calls: ${usage.totalCalls}`, 1);

        this.tokenTracker.addExecution(this.ceremonyName, {
          input: usage.inputTokens,
          output: usage.outputTokens
        });
        this.debug('[INFO] Token history saved to .avc/token-history.json');
        sendSuccess('Token history updated');
      }

      sendSectionHeader('Next steps');
      sendIndented('1. Review Task/Subtask breakdown in .avc/project/', 1);
      sendIndented('2. Start implementing Subtasks (smallest work units)', 1);

      this.debug('[INFO] SeedProcessor.execute() complete', {
        storyId: this.storyId,
        duration: `${Date.now() - execStartTime}ms`,
        taskCount,
        subtaskCount,
      });

    } catch (error) {
      this.debug('[ERROR] SeedProcessor.execute() failed', {
        error: error.message,
        stack: error.stack,
        storyId: this.storyId,
        duration: `${Date.now() - execStartTime}ms`,
      });
      sendError(`Seed ceremony failed: ${error.message}`);
      throw error;
    }
  }
}

export { SeedProcessor };
