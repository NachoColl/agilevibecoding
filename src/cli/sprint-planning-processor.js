import fs from 'fs';
import path from 'path';
import { LLMProvider } from './llm-provider.js';
import { TokenTracker } from './token-tracker.js';
import { EpicStoryValidator } from './epic-story-validator.js';
import { VerificationTracker } from './verification-tracker.js';
import { fileURLToPath } from 'url';
import { getCeremonyHeader } from './message-constants.js';
import { sendError, sendWarning, sendSuccess, sendInfo, sendOutput, sendIndented, sendSectionHeader, sendCeremonyHeader, sendProgress, sendSubstep } from './messaging-api.js';
import { outputBuffer } from './output-buffer.js';
import { loadAgent } from './agent-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Local-timezone ISO string (e.g. 2026-03-04T18:05:16.554+01:00) */
function localISO(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  const tz = -date.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const tzH = p(Math.floor(Math.abs(tz) / 60));
  const tzM = p(Math.abs(tz) % 60);
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}.${ms}${sign}${tzH}:${tzM}`;
}

/**
 * SprintPlanningProcessor - Creates/expands Epics and Stories with duplicate detection
 */
class SprintPlanningProcessor {
  constructor(options = {}) {
    this.ceremonyName = 'sprint-planning';
    this.avcPath = path.join(process.cwd(), '.avc');
    this.projectPath = path.join(this.avcPath, 'project');
    this.projectDocPath = path.join(this.projectPath, 'doc.md');
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

    // Cost threshold protection
    this._costThreshold = options?.costThreshold ?? null;
    this._costLimitReachedCallback = options?.costLimitReachedCallback ?? null;
    this._runningCost = 0;

    // Optional user-selection gate between Stage 4 and Stage 5
    // When provided, the processor calls this async function with the decomposed hierarchy
    // and waits for it to resolve with { selectedEpicIds, selectedStoryIds }.
    // When null (default), the processor runs straight through without pausing.
    this._selectionCallback = options?.selectionCallback ?? null;
  }

  /**
   * Structured debug logger - writes ONLY to file via CommandLogger
   */
  debug(message, data = null) {
    if (!this.debugMode) return;

    const timestamp = localISO();
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
   * Log elapsed time for a labelled operation
   */
  debugTiming(label, startMs) {
    const elapsed = Date.now() - startMs;
    this.debug(`[TIMING] ${label}: ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s)`);
  }

  /**
   * Sub-section separator for grouping related log entries within a stage
   */
  debugSection(title) {
    const line = '-'.repeat(60);
    this.debug(`\n${line}`);
    this.debug(`-- ${title}`);
    this.debug(line);
  }

  /**
   * Log a full hierarchy tree for snapshot comparison across runs
   * @param {string} label - Label for this snapshot (e.g. "PRE-RUN" or "POST-RUN")
   * @param {Array} epics - Array of {id, name, stories:[{id, name}]} objects
   */
  debugHierarchySnapshot(label, epics) {
    this.debugSection(`${label} HIERARCHY SNAPSHOT`);
    if (!epics || epics.length === 0) {
      this.debug(`${label}: (empty - no epics found)`);
      return;
    }
    this.debug(`${label}: ${epics.length} epics`);
    for (const epic of epics) {
      const storyCount = epic.stories ? epic.stories.length : 0;
      this.debug(`  [${epic.id}] ${epic.name} (${storyCount} stories)`);
      for (const story of epic.stories || []) {
        this.debug(`    [${story.id}] ${story.name}`);
      }
    }
    // Flat totals for quick comparison
    const totalStories = epics.reduce((sum, e) => sum + (e.stories?.length || 0), 0);
    this.debug(`${label} TOTALS: ${epics.length} epics, ${totalStories} stories`);
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
        sendWarning(`Ceremony '${this.ceremonyName}' not found in config, using defaults`);
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
      sendWarning(`Could not read ceremony config: ${error.message}`);
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
   * @param {string} stageName - Stage name ('decomposition', 'validation', 'doc-distribution')
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
   * @param {string} stageName - Stage name ('decomposition', 'validation', 'doc-distribution')
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
    this._registerTokenCallback(providerInstance, `${this.ceremonyName}-${stageName}`);
    this._stageProviders[cacheKey] = providerInstance;

    return providerInstance;
  }

  /**
   * Run an async LLM fn with a periodic elapsed-time heartbeat detail message.
   * Keeps the UI updated while waiting for long LLM calls to complete.
   */
  async _withProgressHeartbeat(fn, getMsg, progressCallback, intervalMs = 5000) {
    const startTime = Date.now();
    let lastMsg = null;
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const msg = getMsg(elapsed);
      if (msg != null && msg !== lastMsg) {
        lastMsg = msg;
        progressCallback?.(null, null, { detail: msg })?.catch?.(() => {});
      }
    }, intervalMs);
    try {
      return await fn();
    } finally {
      clearInterval(timer);
    }
  }

  /**
   * Aggregate token usage across all provider instances:
   * - this.llmProvider (Stage 5 validation fallback)
   * - this._stageProviders (Stage 4 decomposition, Stage 7 doc-distribution)
   * - this._validator._validatorProviders (Stage 5 per-validator providers)
   */
  _aggregateAllTokenUsage() {
    const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCalls: 0, estimatedCost: 0 };
    const add = (provider) => {
      if (!provider) return;
      const u = provider.getTokenUsage();
      totals.inputTokens += u.inputTokens || 0;
      totals.outputTokens += u.outputTokens || 0;
      totals.totalTokens += u.totalTokens || (u.inputTokens || 0) + (u.outputTokens || 0);
      totals.totalCalls += u.totalCalls || 0;
      totals.estimatedCost += u.estimatedCost || 0;
    };
    add(this.llmProvider);
    for (const p of Object.values(this._stageProviders)) add(p);
    if (this._validator) {
      for (const p of Object.values(this._validator._validatorProviders)) add(p);
    }
    return totals;
  }

  /**
   * Register a per-call token callback on a provider instance.
   * Each LLM API call fires addIncremental() so tokens are persisted crash-safely.
   * @param {object} provider - LLM provider instance
   * @param {string} [stageKey] - Stage-specific key (e.g. 'sprint-planning-decomposition').
   *   Defaults to this.ceremonyName so the parent roll-up bucket still accumulates totals.
   */
  _registerTokenCallback(provider, stageKey) {
    if (!provider) return;
    const key = stageKey ?? this.ceremonyName;
    provider.onCall((delta) => {
      this.tokenTracker.addIncremental(key, delta);
      if (delta.model) {
        const cost = this.tokenTracker.calculateCost(delta.input, delta.output, delta.model);
        this._runningCost += cost?.total ?? 0;
      }
    });
  }

  async initializeLLMProvider() {
    try {
      this.llmProvider = await LLMProvider.create(this._providerName, this._modelName);
      this._registerTokenCallback(this.llmProvider);
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
    const preRunSnapshot = [];       // Rich snapshot for cross-run comparison

    if (!fs.existsSync(this.projectPath)) {
      this.debug('Project path does not exist yet (first run)');
      return { existingEpics, existingStories, maxEpicNum, maxStoryNums, preRunSnapshot };
    }

    this.debug(`Scanning directory: ${this.projectPath}`);
    const dirs = fs.readdirSync(this.projectPath).sort();
    this.debug(`Found ${dirs.length} top-level entries to scan`);

    // Scan top-level directories (epics)
    for (const dir of dirs) {
      const epicWorkJsonPath = path.join(this.projectPath, dir, 'work.json');

      if (!fs.existsSync(epicWorkJsonPath)) continue;

      try {
        const work = JSON.parse(fs.readFileSync(epicWorkJsonPath, 'utf8'));

        if (work.type === 'epic') {
          this.debug(`Found existing Epic: ${work.id} "${work.name}" [status=${work.status}, created=${work.metadata?.created || 'unknown'}]`);
          existingEpics.set(work.name.toLowerCase(), work.id);

          const epicEntry = {
            id: work.id,
            name: work.name,
            domain: work.domain || '',
            status: work.status || 'unknown',
            created: work.metadata?.created || null,
            ceremony: work.metadata?.ceremony || null,
            description: (work.description || '').substring(0, 120),
            stories: []
          };

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
          }).sort();

          this.debug(`Scanning ${epicSubdirs.length} subdirectories under epic ${work.id}`);

          for (const storyDir of epicSubdirs) {
            const storyWorkJsonPath = path.join(epicDir, storyDir, 'work.json');

            if (!fs.existsSync(storyWorkJsonPath)) continue;

            try {
              const storyWork = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));

              if (storyWork.type === 'story') {
                this.debug(`  Found existing Story: ${storyWork.id} "${storyWork.name}" [status=${storyWork.status}, created=${storyWork.metadata?.created || 'unknown'}]`);
                existingStories.set(storyWork.name.toLowerCase(), storyWork.id);
                epicEntry.stories.push({
                  id: storyWork.id,
                  name: storyWork.name,
                  status: storyWork.status || 'unknown',
                  created: storyWork.metadata?.created || null,
                  userType: storyWork.userType || ''
                });

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

          preRunSnapshot.push(epicEntry);
        }
      } catch (error) {
        this.debug(`Could not parse ${epicWorkJsonPath}: ${error.message}`);
        sendWarning(`Could not parse ${epicWorkJsonPath}: ${error.message}`);
      }
    }

    // Log complete pre-run state for cross-run comparison
    this.debugSection('PRE-RUN STATE - Full Existing Hierarchy');
    this.debug('Pre-run counts', {
      epics: existingEpics.size,
      stories: existingStories.size,
      maxEpicNum: maxEpicNum.value,
      maxStoryNums: Object.fromEntries(maxStoryNums)
    });
    this.debugHierarchySnapshot('PRE-RUN', preRunSnapshot);
    this.debug('All existing epic names (for duplicate detection)', Array.from(existingEpics.keys()));
    this.debug('All existing story names (for duplicate detection)', Array.from(existingStories.keys()));

    return { existingEpics, existingStories, maxEpicNum, maxStoryNums, preRunSnapshot };
  }

  // STAGE 3: Collect new scope (optional expansion)
  async collectNewScope() {
    this.debugStage(3, 'Collect New Scope');

    this.debug(`Reading project doc: ${this.projectDocPath}`);
    const docContent = fs.readFileSync(this.projectDocPath, 'utf8');
    this.debug(`Doc content loaded (${docContent.length} chars)`);

    // Log full doc.md content for cross-run comparison
    this.debugSection('PROJECT DOC.MD CONTENT (full text used as scope source)');
    this.debug('doc.md full content:\n' + docContent);

    // Try to extract scope from known section headers
    const scopeFromSection = this.tryExtractScopeFromSections(docContent);

    if (scopeFromSection) {
      this.debug(`✓ Scope extracted from section (${scopeFromSection.length} chars)`);
      this.debugSection('SCOPE TEXT SENT TO LLM (extracted from doc section)');
      this.debug('Full scope text:\n' + scopeFromSection);
      return scopeFromSection;
    }

    // Fallback: Use entire doc.md
    this.debug('⚠️  No standard scope section found');
    this.debug('Using entire doc.md content as scope source');

    sendWarning('No standard scope section found in doc.md');
    sendIndented('Using entire documentation for feature extraction.', 1);
    sendIndented('For better results and lower token usage, consider adding one of:', 1);
    sendIndented('- "## Initial Scope"', 1);
    sendIndented('- "## Scope"', 1);
    sendIndented('- "## Features"', 1);

    this.debugSection('SCOPE TEXT SENT TO LLM (full doc.md - no scope section found)');
    this.debug(`Using full doc content (${docContent.length} chars) as scope`);
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
      // Build regex (case-insensitive). Allow optional numeric prefix so
      // "## 3. Initial Scope" matches when searching for "Initial Scope".
      const regex = new RegExp(
        `##\\s+(?:\\d+\\.\\s+)?${this.escapeRegex(header)}\\s+([\\s\\S]+?)(?=\\n#{1,2}[^#]|$)`,
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
  async decomposeIntoEpicsStories(scope, existingEpics, existingStories, progressCallback = null) {
    this.debugStage(4, 'Decompose into Epics + Stories');

    this.debug('Stage 1/3: Decomposing scope into Epics and Stories');

    // Get stage-specific provider for decomposition
    const provider = await this.getProviderForStageInstance('decomposition');
    const { provider: providerName, model: modelName } = this.getProviderForStage('decomposition');

    this.debug('Using provider for decomposition', { provider: providerName, model: modelName });
    await progressCallback?.(null, `Using model: ${modelName}`, {});

    // Read agent instructions
    const agentPath = path.join(this.agentsPath, 'epic-story-decomposer.md');
    this.debug(`Loading agent: ${agentPath}`);
    const epicStoryDecomposerAgent = fs.readFileSync(agentPath, 'utf8');
    this.debug(`Agent loaded (${epicStoryDecomposerAgent.length} bytes)`);

    // Build prompt with duplicate detection
    this.debug('Constructing decomposition prompt...');
    const existingEpicNames = Array.from(existingEpics.keys());
    const existingStoryNames = Array.from(existingStories.keys());

    let prompt = `Given the following project scope:

**Initial Scope (Features to Implement):**
${scope}
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
      existingEpics: existingEpicNames.length,
      existingStories: existingStoryNames.length,
      totalPromptSize: prompt.length
    });

    const existingNote = existingEpicNames.length > 0
      ? ` (skipping ${existingEpicNames.length} existing epics)`
      : '';
    await progressCallback?.(null, `Calling LLM to decompose scope${existingNote}…`, {});
    await progressCallback?.(null, null, { detail: `Sending to ${providerName} (${modelName})…` });

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

        const result = await this._withProgressHeartbeat(
          () => this.retryWithBackoff(
            () => provider.generateJSON(prompt, epicStoryDecomposerAgent),
            'Epic/Story decomposition'
          ),
          (elapsed) => {
            if (elapsed < 20) return 'Reading scope and project context…';
            if (elapsed < 40) return 'Identifying domain boundaries…';
            if (elapsed < 60) return 'Structuring epics and stories…';
            if (elapsed < 80) return 'Refining decomposition…';
            if (elapsed < 100) return 'Finalizing work item hierarchy…';
            return 'Still decomposing…';
          },
          progressCallback,
          20000  // 20s interval — phase messages change each tick
        );

        // Log token usage
        const usage = provider.getTokenUsage();
        this.debug('Response tokens', {
          input: usage.inputTokens,
          output: usage.outputTokens,
          total: usage.totalTokens
        });
        await progressCallback?.(null, null, { detail: `${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out tokens` });

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

    const totalStories = hierarchy.epics.reduce((sum, e) => sum + (e.stories?.length || 0), 0);
    await progressCallback?.(null, `Decomposed into ${hierarchy.epics.length} epics, ${totalStories} stories`, {});
    for (const epic of hierarchy.epics) {
      await progressCallback?.(null, `  ${epic.name} (${epic.stories?.length || 0} stories)`, {});
    }

    this.debug('Parsed hierarchy', {
      epics: hierarchy.epics.map(e => ({
        id: e.id,
        name: e.name,
        storyCount: e.stories?.length || 0
      })),
      validation: hierarchy.validation
    });


    return hierarchy;
  }

  /**
   * Filter the decomposed hierarchy to only the epics/stories chosen by the user.
   * @param {Object} hierarchy - Full decomposed hierarchy
   * @param {string[]} selectedEpicIds - Epic IDs to keep
   * @param {string[]} selectedStoryIds - Story IDs to keep
   * @returns {Object} Filtered hierarchy
   */
  _filterHierarchyBySelection(hierarchy, selectedEpicIds, selectedStoryIds) {
    const epicIdSet = new Set(selectedEpicIds);
    const storyIdSet = new Set(selectedStoryIds);
    const filteredEpics = hierarchy.epics
      .filter(e => epicIdSet.has(e.id))
      .map(e => ({
        ...e,
        stories: (e.stories || []).filter(s => storyIdSet.has(s.id))
      }));
    return { ...hierarchy, epics: filteredEpics };
  }

  /**
   * Phase 1 of contextual selection: extract structured project characteristics from scope text.
   * Called once per sprint-planning run when useContextualSelection is enabled.
   * @param {string} scope - Project scope text (first 3000 chars used)
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Object>} ProjectContext JSON (empty object on failure)
   */
  async extractProjectContext(scope, progressCallback) {
    this.debug('Extracting project context for contextual agent selection');
    try {
      const provider = await this.getProviderForStageInstance('validation');
      const agent = loadAgent('project-context-extractor.md');
      const prompt = `PROJECT SCOPE:\n\n${scope.substring(0, 3000)}\n\nExtract the structured project context as JSON.`;
      const result = await provider.generateJSON(prompt, agent);
      return result || {};
    } catch (err) {
      this.debug('Project context extraction failed, continuing without context', { error: err.message });
      return {};
    }
  }

  // STAGE 5: Multi-Agent Validation
  async validateHierarchy(hierarchy, progressCallback = null, scope = null) {
    this.debugStage(5, 'Multi-Agent Validation');

    // Initialize default LLM provider if not already done (for fallback)
    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    // Check if smart selection is enabled
    const useSmartSelection = this.stagesConfig?.validation?.useSmartSelection || false;

    if (useSmartSelection) {
      this.debug('Smart validator selection enabled');
    }

    // Phase 1: Extract project context if contextual selection is enabled
    const useContextualSelection = this.stagesConfig?.validation?.useContextualSelection || false;
    this.debug(`Contextual agent selection: useContextualSelection=${useContextualSelection}, stagesConfig.validation=${JSON.stringify(this.stagesConfig?.validation)}`);
    let projectContext = null;

    if (useContextualSelection && scope) {
      await progressCallback?.(null, 'Analyzing project context for agent selection…', {});
      projectContext = await this.extractProjectContext(scope, progressCallback);
      this._projectContext = projectContext;
      this.debug('Project context extracted', projectContext);
    } else if (useContextualSelection) {
      this.debug('useContextualSelection=true but no scope available — skipping context extraction');
    }

    const validator = new EpicStoryValidator(
      this.llmProvider,
      this.verificationTracker,
      this.stagesConfig,
      useSmartSelection,
      progressCallback,
      projectContext
    );
    this._validator = validator;
    this._validator.setTokenCallback((delta, stageHint) => {
      const key = stageHint
        ? `${this.ceremonyName}-${stageHint}`
        : this.ceremonyName;
      this.tokenTracker.addIncremental(key, delta);
      if (delta.model) {
        const cost = this.tokenTracker.calculateCost(delta.input, delta.output, delta.model);
        this._runningCost += cost?.total ?? 0;
      }
    });

    // Validate each epic
    for (const epic of hierarchy.epics) {
      this.debug(`\nValidating Epic: ${epic.id} "${epic.name}"`);
      await progressCallback?.(null, `Validating Epic: ${epic.name}`, {});

      // Build epic context string for validation
      const epicContext = `# Epic: ${epic.name}\n\n**Description:** ${epic.description}\n\n**Domain:** ${epic.domain}\n\n**Features:**\n${(epic.features || []).map(f => `- ${f}`).join('\n')}\n`;

      // Validate epic with multiple domain validators
      const _tsEpic = Date.now();
      const epicValidation = await validator.validateEpic(epic, epicContext);
      this.debugTiming(`  validateEpic: ${epic.id} "${epic.name}"`, _tsEpic);

      // Display validation summary
      this.displayValidationSummary('Epic', epic.name, epicValidation);

      // Handle validation result
      if (epicValidation.overallStatus === 'needs-improvement') {
        this.debug(`Epic "${epic.name}" needs improvement - showing issues`);
        this.displayValidationIssues(epicValidation);
      }

      // Validate each story under this epic
      for (const story of epic.stories || []) {
        this.debug(`\nValidating Story: ${story.id} "${story.name}"`);
        await progressCallback?.(null, `  Validating story: ${story.name}`, {});

        // Build story context string for validation
        const storyContext = `# Story: ${story.name}\n\n**User Type:** ${story.userType}\n\n**Description:** ${story.description}\n\n**Acceptance Criteria:**\n${(story.acceptance || []).map((ac, i) => `${i + 1}. ${ac}`).join('\n')}\n\n**Parent Epic:** ${epic.name} (${epic.domain})\n`;

        // Validate story with multiple domain validators
        const _tsStory = Date.now();
        const storyValidation = await validator.validateStory(story, storyContext, epic);
        this.debugTiming(`    validateStory: ${story.id} "${story.name}"`, _tsStory);

        // Display validation summary
        this.displayValidationSummary('Story', story.name, storyValidation);

        // Handle validation result
        if (storyValidation.overallStatus === 'needs-improvement') {
          this.debug(`Story "${story.name}" needs improvement - showing issues`);
          this.displayValidationIssues(storyValidation);
        }
      }
    }

    return hierarchy;
  }

  /**
   * Display validation summary
   */
  displayValidationSummary(type, name, validation) {
    const statusPrefix = {
      'excellent': 'SUCCESS:',
      'acceptable': 'WARNING:',
      'needs-improvement': 'ERROR:'
    };

    const prefix = statusPrefix[validation.overallStatus] || '';
    sendOutput(`${prefix} ${type}: ${name}\n`);
    sendIndented(`Overall Score: ${validation.averageScore}/100`, 1);
    sendIndented(`Validators: ${validation.validatorCount} agents`, 1);
    sendIndented(`Issues: ${validation.criticalIssues.length} critical, ${validation.majorIssues.length} major, ${validation.minorIssues.length} minor`, 1);

    // Show strengths if excellent or acceptable
    if (validation.overallStatus !== 'needs-improvement' && validation.strengths.length > 0) {
      sendIndented(`Strengths: ${validation.strengths.slice(0, 2).join(', ')}`, 1);
    }

    sendOutput('\n');
  }

  /**
   * Display validation issues
   */
  displayValidationIssues(validation) {
    // Show critical issues
    if (validation.criticalIssues.length > 0) {
      this.debug('Critical Issues', validation.criticalIssues.slice(0, 3).map(issue => ({
        domain: issue.domain,
        description: issue.description,
        suggestion: issue.suggestion
      })));
    }

    // Show improvement priorities
    if (validation.improvementPriorities.length > 0) {
      this.debug('Improvement Priorities', validation.improvementPriorities.slice(0, 3).map((priority, i) => ({
        rank: i + 1,
        priority: priority.priority,
        mentionedBy: priority.mentionedBy
      })));
    }
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

  // STAGE 7: Write hierarchy files with distributed documentation
  async writeHierarchyFiles(hierarchy, progressCallback = null) {
    this.debugStage(7, 'Write Hierarchy Files + Distribute Documentation');
    this.debug('Writing hierarchy files with documentation distribution');

    // Read the root project doc.md (used as source for all epic distributions)
    let projectDocContent = '';
    if (fs.existsSync(this.projectDocPath)) {
      projectDocContent = fs.readFileSync(this.projectDocPath, 'utf8');
      this.debug(`Read project doc.md (${projectDocContent.length} bytes) for distribution`);
    } else {
      this.debug('project/doc.md not found — skipping documentation distribution');
    }

    const doDistribute = projectDocContent.length > 0;

    // Phase 1 (sync): Create all directories and write all work.json files
    for (const epic of hierarchy.epics) {
      const epicDir = path.join(this.projectPath, epic.id);
      if (!fs.existsSync(epicDir)) fs.mkdirSync(epicDir, { recursive: true });

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
          ...(epic.metadata || {}),
          created: localISO(),
          ceremony: this.ceremonyName
        }
      };
      const workJsonPath = path.join(epicDir, 'work.json');
      const workJsonContent = JSON.stringify(epicWorkJson, null, 2);
      fs.writeFileSync(workJsonPath, workJsonContent, 'utf8');
      this.debug(`Writing ${workJsonPath} (${workJsonContent.length} bytes)`);

      for (const story of epic.stories || []) {
        const storyDir = path.join(epicDir, story.id);
        if (!fs.existsSync(storyDir)) fs.mkdirSync(storyDir, { recursive: true });

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
            ...(story.metadata || {}),
            created: localISO(),
            ceremony: this.ceremonyName
          }
        };
        const storyWorkJsonPath = path.join(storyDir, 'work.json');
        const storyWorkJsonContent = JSON.stringify(storyWorkJson, null, 2);
        fs.writeFileSync(storyWorkJsonPath, storyWorkJsonContent, 'utf8');
        this.debug(`Writing ${storyWorkJsonPath} (${storyWorkJsonContent.length} bytes)`);
      }
    }

    // Phase 2 (parallel): Distribute docs — all epics concurrently, stories within each epic concurrently
    await Promise.all(
      hierarchy.epics.map(async (epic) => {
        const epicDir = path.join(this.projectPath, epic.id);

        // Distribute epic doc from project doc
        let epicDocContent;
        if (doDistribute) {
          await progressCallback?.(null, `Distributing documentation → ${epic.name}`, {});
          this.debug(`Distributing docs: project/doc.md → ${epic.id}/doc.md`);
          const result = await this.distributeDocContent(projectDocContent, epic, 'epic', progressCallback);
          epicDocContent = result.childDoc;
          this.debug(`Epic doc ${epic.id}: ${epicDocContent.length} bytes`);
        } else {
          await progressCallback?.(null, `Writing Epic: ${epic.name}`, {});
          epicDocContent = `# ${epic.name}\n\n${epic.description || ''}\n`;
        }

        // Distribute all story docs from epic doc — in parallel within this epic
        const storyDocs = await Promise.all(
          (epic.stories || []).map(async (story) => {
            if (!doDistribute) {
              return `# ${story.name}\n\n${story.description || ''}\n`;
            }
            await progressCallback?.(null, `  Distributing documentation → ${story.name}`, {});
            this.debug(`Distributing docs: ${epic.id}/doc.md → ${story.id}/doc.md`);
            const result = await this.distributeDocContent(epicDocContent, story, 'story', progressCallback);
            this.debug(`Story doc ${story.id}: ${result.childDoc.length} bytes`);
            return result.childDoc;
          })
        );

        // Write all doc.md files for this epic
        const epicDocPath = path.join(epicDir, 'doc.md');
        fs.writeFileSync(epicDocPath, epicDocContent, 'utf8');
        this.debug(`Writing ${epicDocPath} (${epicDocContent.length} bytes)`);

        (epic.stories || []).forEach((story, si) => {
          const storyDocPath = path.join(epicDir, story.id, 'doc.md');
          fs.writeFileSync(storyDocPath, storyDocs[si], 'utf8');
          this.debug(`Writing ${storyDocPath} (${storyDocs[si].length} bytes)`);
        });
      })
    );

    const epicCount = hierarchy.epics.length;
    const storyCount = hierarchy.epics.reduce((sum, epic) => sum + (epic.stories || []).length, 0);

    // Log all files written this run for cross-run comparison
    this.debugSection('FILES WRITTEN THIS RUN');
    const filesWritten = [];
    for (const epic of hierarchy.epics) {
      filesWritten.push(`${epic.id}/work.json`);
      filesWritten.push(`${epic.id}/doc.md`);
      for (const story of epic.stories || []) {
        filesWritten.push(`${epic.id}/${story.id}/work.json`);
        filesWritten.push(`${epic.id}/${story.id}/doc.md`);
      }
    }
    this.debug('Files written this run', filesWritten);
    this.debug(`Total files written: ${filesWritten.length} (${epicCount} epics x 2 + ${storyCount} stories x 2)`);

    // Display clean summary of created epics and stories
    if (hierarchy.epics.length > 0) {
      for (const epic of hierarchy.epics) {
        sendOutput(`${epic.id}: ${epic.name}\n`);
        for (const story of epic.stories || []) {
          sendIndented(`${story.id}: ${story.name}`, 1);
        }
        sendOutput('\n');
      }
    }

    return { epicCount, storyCount };
  }

  /**
   * Stage 7: Enrich story doc.md files with implementation-specific detail.
   *
   * After doc distribution, story docs may still have vague acceptance criteria
   * that lack concrete API contracts, error tables, DB field names, and business rules.
   * This stage runs the story-doc-enricher agent on each story doc to fill those gaps.
   *
   * @param {Object} hierarchy - Hierarchy with epics and stories (post-renumbering, with real IDs)
   * @param {Function} progressCallback - Optional progress callback
   */
  async enrichStoryDocs(hierarchy, progressCallback = null) {
    this.debugStage(8, 'Enrich Story Docs with Implementation Detail');

    const agentInstructions = loadAgent('story-doc-enricher.md');
    const provider = await this.getProviderForStageInstance('enrichment');
    const { model: modelName } = this.getProviderForStage('enrichment');

    this.debug(`Using model for enrichment: ${modelName}`);

    // Collect all story tasks and run all enrichments in parallel
    const tasks = hierarchy.epics.flatMap(epic =>
      (epic.stories || []).map(story => ({ epic, story }))
    );

    const results = await Promise.all(tasks.map(async ({ epic, story }) => {
      const storyDir = path.join(this.projectPath, epic.id, story.id);
      const storyDocPath = path.join(storyDir, 'doc.md');

      if (!fs.existsSync(storyDocPath)) {
        this.debug(`Skipping enrichment for ${story.id} — doc.md not found`);
        return 'skipped';
      }

      const storyDocContent = fs.readFileSync(storyDocPath, 'utf8');
      const acceptance = (story.acceptance || []).map((a, i) => `${i + 1}. ${a}`).join('\n') || 'none specified';
      const prompt = `## Existing Story Doc

${storyDocContent}

---

## Story Work Item

**Name:** ${story.name}
**User Type:** ${story.userType || 'team member'}
**Description:** ${story.description || ''}
**Acceptance Criteria:**
${acceptance}

---

## Parent Epic Context

**Epic:** ${epic.name}
**Domain:** ${epic.domain || 'general'}
**Description:** ${epic.description || ''}

---

Enrich the existing story doc to be fully implementation-ready. Fill any gaps in API contracts, error tables, data model fields, business rules, and authorization. Return JSON with \`enriched_doc\` and \`gaps_filled\` fields.`;

      this.debug(`Enriching story doc: ${story.id} (${story.name})`);
      await progressCallback?.(null, `  Enriching documentation → ${story.name}`, {});

      const _tsEnrich = Date.now();
      try {
        const result = await this._withProgressHeartbeat(
          () => this.retryWithBackoff(
            () => provider.generateJSON(prompt, agentInstructions),
            `enrichment for story: ${story.name}`
          ),
          (elapsed) => {
            if (elapsed < 15) return `Enriching ${story.name}…`;
            if (elapsed < 40) return `Adding implementation detail to ${story.name}…`;
            return `Still enriching…`;
          },
          progressCallback,
          10000
        );

        const enrichedDoc = (typeof result.enriched_doc === 'string' && result.enriched_doc.trim())
          ? result.enriched_doc
          : storyDocContent;

        const gapsFilled = Array.isArray(result.gaps_filled) ? result.gaps_filled : [];

        fs.writeFileSync(storyDocPath, enrichedDoc, 'utf8');

        this.debugTiming(`    enrichStory: ${story.id} "${story.name}"`, _tsEnrich);
        if (gapsFilled.length > 0) {
          this.debug(`Story ${story.id} enriched: ${gapsFilled.length} gaps filled`, gapsFilled);
        } else {
          this.debug(`Story ${story.id}: already implementation-ready, no gaps filled`);
        }
        return 'enriched';
      } catch (err) {
        this.debugTiming(`    enrichStory FAILED: ${story.id} "${story.name}"`, _tsEnrich);
        this.debug(`Story enrichment failed for ${story.id} — keeping original doc`, { error: err.message });
        return 'skipped';
      }
    }));

    const enrichedCount = results.filter(r => r === 'enriched').length;
    const skippedCount = results.filter(r => r === 'skipped').length;
    this.debug(`Story enrichment complete: ${enrichedCount} enriched, ${skippedCount} skipped`);
  }

  /**
   * Distribute documentation content from a parent doc.md to a child item's doc.md.
   *
   * Calls the doc-distributor LLM agent which extracts content specifically about
   * the child from the parent document, builds the child's doc.md with the extracted
   * content plus elaboration, and returns the parent document with that content removed.
   *
   * @param {string} parentDocContent - Current content of the parent doc.md
   * @param {Object} childItem - Epic or story object from decomposition result
   * @param {'epic'|'story'} childType - Whether the child is an epic or story
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<{childDoc: string, parentDoc: string}>}
   */
  async distributeDocContent(parentDocContent, childItem, childType, progressCallback = null) {
    this.debugSection(`DOC DISTRIBUTION: ${childType.toUpperCase()} "${childItem.name}"`);

    const agentPath = path.join(this.agentsPath, 'doc-distributor.md');
    this.debug(`Loading doc-distributor agent: ${agentPath}`);
    const agentInstructions = fs.readFileSync(agentPath, 'utf8');

    // Build child item description for the prompt
    let itemDescription;
    if (childType === 'epic') {
      const features = (childItem.features || []).join(', ') || 'none specified';
      const stories = (childItem.stories || []).map(s => `- ${s.name}: ${s.description || ''}`).join('\n') || 'none yet';
      itemDescription = `Type: epic
Name: ${childItem.name}
Domain: ${childItem.domain || 'general'}
Description: ${childItem.description || ''}
Features: ${features}
Stories that will belong to this epic:
${stories}`;
    } else {
      const acceptance = (childItem.acceptance || []).map(a => `- ${a}`).join('\n') || 'none specified';
      itemDescription = `Type: story
Name: ${childItem.name}
User type: ${childItem.userType || 'team member'}
Description: ${childItem.description || ''}
Acceptance criteria:
${acceptance}`;
    }

    const prompt = `## Parent Document

${parentDocContent}

---

## Child Item to Create Documentation For

${itemDescription}

---

Extract and synthesize content from the parent document that is specifically relevant to this ${childType}, then compose the child's \`doc.md\`. Return JSON with a \`child_doc\` field.`;

    this.debug(`Prompt length: ${prompt.length} chars (parent: ${parentDocContent.length}, item: ${itemDescription.length})`);

    const provider = await this.getProviderForStageInstance('doc-distribution');

    const result = await this._withProgressHeartbeat(
      () => this.retryWithBackoff(
        () => provider.generateJSON(prompt, agentInstructions),
        `doc distribution for ${childType}: ${childItem.name}`
      ),
      (elapsed) => {
        if (elapsed < 15) return `Extracting ${childType}-specific content…`;
        if (elapsed < 40) return `Building ${childItem.name} documentation…`;
        if (elapsed < 65) return `Refining parent document…`;
        return `Still distributing…`;
      },
      progressCallback,
      10000
    );

    const usage = provider.getTokenUsage();
    this.debug(`Doc distribution tokens: ${usage.inputTokens} in · ${usage.outputTokens} out`);

    // Validate response shape and fall back gracefully on malformed output
    const childDoc = (typeof result.child_doc === 'string' && result.child_doc.trim())
      ? result.child_doc
      : `# ${childItem.name}\n\n${childItem.description || ''}\n`;

    this.debug(`Distribution result: child_doc ${childDoc.length} bytes`);

    return { childDoc };
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

  /**
   * Read the full on-disk hierarchy after writing files.
   * Returns the same shape as preRunSnapshot for direct comparison.
   */
  readPostRunSnapshot() {
    if (!fs.existsSync(this.projectPath)) return [];

    const snapshot = [];
    const dirs = fs.readdirSync(this.projectPath).sort();

    for (const dir of dirs) {
      const epicWorkJsonPath = path.join(this.projectPath, dir, 'work.json');
      if (!fs.existsSync(epicWorkJsonPath)) continue;

      try {
        const work = JSON.parse(fs.readFileSync(epicWorkJsonPath, 'utf8'));
        if (work.type !== 'epic') continue;

        const epicEntry = {
          id: work.id,
          name: work.name,
          domain: work.domain || '',
          status: work.status || 'unknown',
          created: work.metadata?.created || null,
          ceremony: work.metadata?.ceremony || null,
          stories: []
        };

        const epicDir = path.join(this.projectPath, dir);
        const epicSubdirs = fs.readdirSync(epicDir).filter(subdir =>
          fs.statSync(path.join(epicDir, subdir)).isDirectory()
        ).sort();

        for (const storyDir of epicSubdirs) {
          const storyWorkJsonPath = path.join(epicDir, storyDir, 'work.json');
          if (!fs.existsSync(storyWorkJsonPath)) continue;
          try {
            const storyWork = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));
            if (storyWork.type === 'story') {
              epicEntry.stories.push({
                id: storyWork.id,
                name: storyWork.name,
                status: storyWork.status || 'unknown',
                created: storyWork.metadata?.created || null
              });
            }
          } catch (e) { /* ignore */ }
        }

        snapshot.push(epicEntry);
      } catch (e) { /* ignore */ }
    }

    return snapshot;
  }

  // Main execution method
  async execute(progressCallback = null) {
    // Cost threshold protection — wrap callback to check running cost before each progress call
    if (this._costThreshold != null && progressCallback) {
      const _origCallback = progressCallback;
      progressCallback = async (...args) => {
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

    // Initialize ceremony history
    const { CeremonyHistory } = await import('./ceremony-history.js');
    const history = new CeremonyHistory(this.avcPath);
    history.init();

    // Start execution tracking
    const executionId = history.startExecution('sprint-planning', 'decomposition');

    try {
      // Log ceremony execution metadata
      const runId = Date.now();
      const runTimestamp = localISO();
      this.debug('='.repeat(80));
      this.debug('SPRINT PLANNING CEREMONY - EXECUTION START');
      this.debug('='.repeat(80));
      this.debug('Run ID (ms epoch):', runId);
      this.debug('Timestamp:', runTimestamp);
      this.debug('Execution ID:', executionId);
      this.debug('Config', {
        provider: this._providerName,
        model: this._modelName,
        stagesConfig: this.stagesConfig ? JSON.stringify(this.stagesConfig) : 'using defaults',
        projectPath: this.projectPath,
        cwd: process.cwd(),
        nodeVersion: process.version
      });

      const header = getCeremonyHeader('sprint-planning');
      sendCeremonyHeader(header.title, header.url);

      const _t0run = Date.now();

      // Stage 1: Validate
      sendProgress('Validating prerequisites...');
      await progressCallback?.('Stage 1/6: Validating prerequisites…');
      let _ts = Date.now();
      this.validatePrerequisites();
      this.debugTiming('Stage 1 — validatePrerequisites', _ts);

      // Stage 2: Read existing hierarchy
      sendProgress('Analyzing existing project structure...');
      await progressCallback?.('Stage 2/6: Analyzing existing project structure…');
      _ts = Date.now();
      const { existingEpics, existingStories, maxEpicNum, maxStoryNums, preRunSnapshot } = this.readExistingHierarchy();
      this.debugTiming('Stage 2 — readExistingHierarchy', _ts);

      if (existingEpics.size > 0) {
        this.debug(`Found ${existingEpics.size} existing Epics, ${existingStories.size} existing Stories`);
        sendInfo(`Found ${existingEpics.size} existing Epics, ${existingStories.size} existing Stories`);
      } else {
        this.debug('No existing Epics/Stories found (first expansion)');
      }

      // Stage 3: Collect scope
      sendProgress('Collecting project scope...');
      await progressCallback?.('Stage 3/6: Collecting project scope…');
      _ts = Date.now();
      const scope = await this.collectNewScope();
      this.debugTiming('Stage 3 — collectNewScope', _ts);

      // Clear screen before decomposition phase
      process.stdout.write('\x1bc');
      outputBuffer.clear();

      // Stage 4: Decompose
      sendProgress('Decomposing scope into Epics and Stories...');
      await progressCallback?.('Stage 4/6: Decomposing scope into Epics and Stories…');
      _ts = Date.now();
      let hierarchy = await this.decomposeIntoEpicsStories(scope, existingEpics, existingStories, progressCallback);
      this.debugTiming('Stage 4 — decomposeIntoEpicsStories', _ts);

      // Log raw LLM output before any validation/modification
      this.debugSection('POST-DECOMPOSE: Raw LLM Output (before validation)');
      this.debugHierarchySnapshot('POST-DECOMPOSE', hierarchy.epics.map(e => ({
        id: e.id || '(no-id)',
        name: e.name,
        stories: (e.stories || []).map(s => ({ id: s.id || '(no-id)', name: s.name }))
      })));
      this.debug('LLM validation field', hierarchy.validation || null);

      // Stage 4.5: User selection gate (Kanban UI only; null = run straight through)
      if (this._selectionCallback) {
        await progressCallback?.('Stage 4.5/6: Waiting for epic/story selection…');
        const selection = await this._selectionCallback(hierarchy);
        if (selection) {
          const { selectedEpicIds, selectedStoryIds } = selection;
          hierarchy = this._filterHierarchyBySelection(hierarchy, selectedEpicIds, selectedStoryIds);
          const epicCount = hierarchy.epics.length;
          const storyCount = hierarchy.epics.reduce((s, e) => s + (e.stories?.length || 0), 0);
          this.debug(`Selection applied: ${epicCount} epics, ${storyCount} stories selected`);
          await progressCallback?.(null, `Confirmed: ${epicCount} epics, ${storyCount} stories selected`, {});
        }
      }

      // Clear screen before validation phase
      process.stdout.write('\x1bc');
      outputBuffer.clear();

      // Stage 5: Multi-Agent Validation
      const epicCount5 = hierarchy.epics.length;
      const storyCount5 = hierarchy.epics.reduce((s, e) => s + (e.stories?.length || 0), 0);
      sendProgress('Validating Epics and Stories with domain experts...');
      await progressCallback?.(`Stage 5/6: Validating with domain experts (${epicCount5} epics, ${storyCount5} stories)…`);
      _ts = Date.now();
      hierarchy = await this.validateHierarchy(hierarchy, progressCallback, scope);
      this.debugTiming(`Stage 5 — validateHierarchy (${epicCount5} epics, ${storyCount5} stories)`, _ts);

      // Log hierarchy after validation (may have been modified)
      this.debugSection('POST-VALIDATION: Hierarchy after domain-expert validation');
      this.debugHierarchySnapshot('POST-VALIDATION', hierarchy.epics.map(e => ({
        id: e.id || '(no-id)',
        name: e.name,
        stories: (e.stories || []).map(s => ({ id: s.id || '(no-id)', name: s.name }))
      })));

      // Analyze duplicate detection (before renumbering)
      const duplicateAnalysis = this.analyzeDuplicates(hierarchy, existingEpics, existingStories);

      // Renumber IDs
      hierarchy = this.renumberHierarchy(hierarchy, maxEpicNum, maxStoryNums);

      // Clear screen before file writing phase
      process.stdout.write('\x1bc');
      outputBuffer.clear();

      // Stage 6: Write hierarchy files
      sendProgress('Writing files and distributing documentation...');
      await progressCallback?.(`Stage 6/7: Writing files and distributing documentation (${epicCount5} epics, ${storyCount5} stories)…`);
      _ts = Date.now();
      const { epicCount, storyCount } = await this.writeHierarchyFiles(hierarchy, progressCallback);
      this.debugTiming(`Stage 6 — writeHierarchyFiles (${epicCount5} epics, ${storyCount5} stories)`, _ts);

      // Stage 7: Enrich story docs with implementation detail
      sendProgress('Enriching story documentation with implementation detail...');
      await progressCallback?.(`Stage 7/7: Enriching story documentation (${storyCount5} stories)…`);
      _ts = Date.now();
      await this.enrichStoryDocs(hierarchy, progressCallback);
      this.debugTiming(`Stage 7 — enrichStoryDocs (${storyCount5} stories)`, _ts);

      // Stage 9: Summary & Cleanup
      this.debugStage(9, 'Summary & Cleanup');

      const { totalEpics, totalStories } = this.countTotalHierarchy();

      // Capture and log post-run hierarchy snapshot for comparison
      const postRunSnapshot = this.readPostRunSnapshot();
      this.debugHierarchySnapshot('POST-RUN', postRunSnapshot);

      this.debugTiming('TOTAL run() end-to-end', _t0run);
      sendOutput(`Created ${epicCount} Epics, ${storyCount} Stories. Total: ${totalEpics} Epics, ${totalStories} Stories.`);

      // Track token usage — aggregate across all provider instances
      const aggregated = this._aggregateAllTokenUsage();
      let tokenUsageSummary = null;
      if (aggregated.totalCalls > 0 || aggregated.inputTokens > 0) {
        tokenUsageSummary = aggregated;
        this.debug('Token usage (all providers)', tokenUsageSummary);

        this.tokenTracker.finalizeRun(this.ceremonyName);
        this.debug('Token tracking finalized in .avc/token-history.json');
      }

      sendOutput('Run /seed <story-id> to decompose a Story into Tasks.');

      // Log ceremony execution end with full comparison summary
      const runDuration = Date.now() - runId;
      this.debug('\n' + '='.repeat(80));
      this.debug('SPRINT PLANNING CEREMONY - EXECUTION END');
      this.debug('='.repeat(80));
      this.debug('Run ID:', runId);
      this.debug('Started:', runTimestamp);
      this.debug('Ended:', localISO());
      this.debug('Duration:', `${Math.round(runDuration / 1000)} seconds`);

      this.debugSection('RUN COMPARISON SUMMARY (compare this block across runs)');
      this.debug('PRE-RUN state', {
        epics: existingEpics.size,
        stories: existingStories.size,
        epicNames: Array.from(existingEpics.keys())
      });
      this.debug('THIS RUN added', {
        epics: epicCount,
        stories: storyCount,
        epicNames: hierarchy.epics.map(e => e.name),
        storyNames: hierarchy.epics.flatMap(e => (e.stories || []).map(s => s.name))
      });
      this.debug('POST-RUN state', {
        epics: totalEpics,
        stories: totalStories
      });
      this.debug('Duplicate detection results', {
        epicsSkippedAsDuplicates: duplicateAnalysis.skippedEpics.length,
        storiesSkippedAsDuplicates: duplicateAnalysis.skippedStories.length,
        skippedEpicNames: duplicateAnalysis.skippedEpics.map(s => s.name),
        skippedStoryNames: duplicateAnalysis.skippedStories.map(s => s.name)
      });
      if (tokenUsageSummary) {
        this.debug('Token usage this run', tokenUsageSummary);
      }
      this.debug('='.repeat(80) + '\n');

      // Build return result for kanban integration
      const returnResult = {
        epicsCreated: epicCount,
        storiesCreated: storyCount,
        totalEpics,
        totalStories,
        tokenUsage: {
          input: tokenUsageSummary?.inputTokens || 0,
          output: tokenUsageSummary?.outputTokens || 0,
          total: tokenUsageSummary?.totalTokens || 0,
        },
        model: this._modelName,
        provider: this._providerName,
        validationIssues: [],
      };

      // Complete ceremony history tracking
      const filesGenerated = [];
      for (const epic of hierarchy.epics) {
        filesGenerated.push(path.join(this.projectPath, epic.id, 'work.json'));
        filesGenerated.push(path.join(this.projectPath, epic.id, 'doc.md'));
        for (const story of epic.stories || []) {
          filesGenerated.push(path.join(this.projectPath, epic.id, story.id, 'work.json'));
          filesGenerated.push(path.join(this.projectPath, epic.id, story.id, 'doc.md'));
        }
      }

      history.completeExecution('sprint-planning', executionId, 'success', {
        filesGenerated,
        tokenUsage: tokenUsageSummary ? {
          input: tokenUsageSummary.inputTokens,
          output: tokenUsageSummary.outputTokens,
          total: tokenUsageSummary.totalTokens
        } : null,
        model: this._modelName,
        provider: this._providerName,
        stage: 'completed',
        metrics: {
          epicsCreated: epicCount,
          storiesCreated: storyCount,
          totalEpics: totalEpics,
          totalStories: totalStories
        }
      });

      return returnResult;
    } catch (error) {
      const isCancelled = error.message === 'CEREMONY_CANCELLED';

      // Track tokens even for cancelled/error runs — tokens were spent up to this point
      try {
        const aggregated = this._aggregateAllTokenUsage();
        if (aggregated.totalCalls > 0 || aggregated.inputTokens > 0) {
          this.tokenTracker.finalizeRun(this.ceremonyName);
          this.debug('Token tracking finalized (partial run)', aggregated);
        }
      } catch (trackErr) {
        this.debug('Could not save token tracking on error', { error: trackErr.message });
      }

      if (!isCancelled) {
        this.debug('\n========== ERROR OCCURRED ==========');
        this.debug('Error details', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        this.debug('Application state at failure', {
          ceremonyName: this.ceremonyName,
          provider: this._providerName,
          model: this._modelName,
          projectPath: this.projectPath,
          currentWorkingDir: process.cwd(),
          nodeVersion: process.version,
          platform: process.platform
        });
        sendError(`Project expansion failed: ${error.message}`);
      }

      // Mark execution as aborted on error
      history.completeExecution('sprint-planning', executionId, 'abrupt-termination', {
        stage: isCancelled ? 'cancelled' : 'error',
        error: error.message
      });

      throw error;
    }
  }
}

export { SprintPlanningProcessor };
