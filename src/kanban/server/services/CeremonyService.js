import path from 'path';
import fs from 'fs';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { KanbanLogger } from '../utils/kanban-logger.js';
import { TokenTracker } from '../../../cli/token-tracker.js';
import { loadAgent } from '../../../cli/agent-loader.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROVIDER_KEY_MAP = {
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/**
 * CeremonyService
 * Orchestrates the sponsor-call ceremony from the web UI.
 * Wraps TemplateProcessor and ProjectInitiator methods,
 * manages in-memory ceremony state, and broadcasts WebSocket events.
 */
export class CeremonyService {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.state = { status: 'idle', progress: [], result: null, error: null, costLimitInfo: null, decomposedHierarchy: null };
    this.websocket = null;
    this._paused = false;
    this._cancelled = false;
    this._runningType = null;      // 'sprint-planning' | 'sponsor-call'
    this._activeProcessId = null;  // processId of the currently running ceremony worker
    this._preRunSnapshot = [];     // dirs that existed before sprint-planning run
    this._activeChild = null;      // forked ChildProcess (if fork-based run)
  }

  pause() {
    this._paused = true;
    if (this._activeChild) {
      // Fork-based: send IPC; worker will reply with { type: 'paused' } which triggers broadcast
      try { this._activeChild.send({ type: 'pause' }); } catch (_) {}
    } else {
      // In-process: broadcast immediately
      if (this._runningType === 'sprint-planning') this.websocket?.broadcastSprintPlanningPaused();
      else this.websocket?.broadcastCeremonyPaused();
    }
  }

  resume() {
    this._paused = false;
    if (this._activeChild) {
      try { this._activeChild.send({ type: 'resume' }); } catch (_) {}
    } else {
      if (this._runningType === 'sprint-planning') this.websocket?.broadcastSprintPlanningResumed();
      else this.websocket?.broadcastCeremonyResumed();
    }
  }

  cancel() {
    this._cancelled = true;
    if (this._activeChild) {
      try { this._activeChild.send({ type: 'cancel' }); } catch (_) {}
    }
    const isSprintPlanning = this._runningType === 'sprint-planning';
    const msg = 'Waiting for current LLM call to finish…';
    this.state.progress.push({ type: 'detail', detail: msg });
    if (isSprintPlanning) this.websocket?.broadcastSprintPlanningDetail(msg);
    else this.websocket?.broadcastCeremonyDetail(msg);
  }

  forceReset() {
    this._cancelled = true;
    this._paused = false;
    if (this._activeChild) {
      try { this._activeChild.send({ type: 'cancel' }); } catch (_) {}
      const child = this._activeChild;
      setTimeout(() => { try { child.kill('SIGTERM'); } catch (_) {} }, 3000);
      this._activeChild = null;
    }
    const wasRunningType = this._runningType;
    this._runningType = null;
    this._activeProcessId = null;
    this.state = { status: 'idle', progress: [], result: null, error: null, costLimitInfo: null, decomposedHierarchy: null };
    // Broadcast to whichever ceremony was running (or both if unknown)
    if (wasRunningType === 'sprint-planning' || !wasRunningType) {
      this.websocket?.broadcastSprintPlanningCancelled();
    }
    if (wasRunningType === 'sponsor-call' || !wasRunningType) {
      this.websocket?.broadcastCeremonyCancelled();
    }
  }

  _cleanupCancelledSprintPlanning() {
    const projectDir = path.join(this.projectRoot, '.avc', 'project');
    if (!fs.existsSync(projectDir)) return;
    const current = fs.readdirSync(projectDir);
    const toDelete = current.filter(d => !this._preRunSnapshot.includes(d));
    for (const d of toDelete) {
      try {
        fs.rmSync(path.join(projectDir, d), { recursive: true, force: true });
      } catch (_) {}
    }
  }

  setWebSocket(ws) {
    this.websocket = ws;
  }

  setReloadCallback(fn) {
    this._reloadCallback = fn;
  }

  getStatus() {
    return {
      status: this.state.status,
      runningType: this._runningType,
      processId: this._activeProcessId,
      progress: this.state.progress,
      result: this.state.result,
      error: this.state.error,
      costLimitInfo: this.state.costLimitInfo || null,
      decomposedHierarchy: this.state.decomposedHierarchy || null,
    };
  }

  async getAvailableModels() {
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: path.join(this.projectRoot, '.env') });

    const avcJsonPath = path.join(this.projectRoot, '.avc', 'avc.json');
    const avcConfig = JSON.parse(fs.readFileSync(avcJsonPath, 'utf8'));
    const models = avcConfig?.settings?.models || {};

    return Object.entries(models).map(([modelId, info]) => ({
      modelId,
      displayName: info.displayName,
      provider: info.provider,
      hasApiKey: !!process.env[PROVIDER_KEY_MAP[info.provider]],
    }));
  }

  async generateMissionScope(description, modelId, provider, validatorModelId, validatorProvider) {
    const log = new KanbanLogger('mission', this.projectRoot);
    log.info('generateMissionScope() called', {
      description: description.slice(0, 200),
      generatorModel: { provider, modelId },
      validatorModel: { provider: validatorProvider, modelId: validatorModelId },
    });

    try {
      const { default: dotenv } = await import('dotenv');
      dotenv.config({ path: path.join(this.projectRoot, '.env') });
      log.debug('dotenv loaded', { envFile: path.join(this.projectRoot, '.env') });

      // Read validation settings exclusively from avc.json
      const avcJsonPath = path.join(this.projectRoot, '.avc', 'avc.json');
      log.debug('Reading avc.json', { path: avcJsonPath });
      const avcConfig = JSON.parse(fs.readFileSync(avcJsonPath, 'utf8'));
      const vs = avcConfig?.settings?.missionGenerator?.validation;
      if (!vs) {
        const err = new Error(
          'Missing settings.missionGenerator.validation in avc.json. ' +
          'Add: { "settings": { "missionGenerator": { "validation": { "maxIterations": 3, "acceptanceThreshold": 75 } } } }'
        );
        log.error('Config missing missionGenerator.validation', { avcJsonPath });
        throw err;
      }
      const maxIterations = vs.maxIterations;
      const acceptanceThreshold = vs.acceptanceThreshold;
      log.info('Validation config loaded', { maxIterations, acceptanceThreshold });

      // Create LLM providers
      log.debug('Creating LLM providers');
      const { LLMProvider } = await import('../../../cli/llm-provider.js');
      const generatorLLM = await LLMProvider.create(provider, modelId);
      const validatorLLM = await LLMProvider.create(validatorProvider, validatorModelId);
      log.info('LLM providers created', {
        generator: `${provider}/${modelId}`,
        validator: `${validatorProvider}/${validatorModelId}`,
      });

      // Load agent files
      log.debug('Loading agent files');
      const generatorAgent = loadAgent('mission-scope-generator.md', this.projectRoot);
      const validatorAgent = loadAgent('mission-scope-validator.md', this.projectRoot);
      log.debug('Agent files loaded', {
        generatorBytes: generatorAgent.length,
        validatorBytes: validatorAgent.length,
      });

      const emit = (step, message) => {
        log.debug(`[WS emit] ${step}: ${message}`);
        this.websocket?.broadcastMissionProgress(step, message);
      };

      // ── Step 1: Initial generation ─────────────────────────────────────────
      emit('generating', 'Generating initial mission & scope…');
      const generatorPrompt =
        `The user wants to build:\n\n${description}\n\nGenerate a focused mission statement and initial scope.`;
      log.info('STEP 1: Initial generation — calling generator LLM', {
        model: `${provider}/${modelId}`,
        promptLength: generatorPrompt.length,
      });

      let result = await generatorLLM.generateJSON(generatorPrompt, generatorAgent);
      log.info('STEP 1: Generator LLM responded', {
        missionStatement: result.missionStatement,
        initialScope: result.initialScope,
        hasTokenUsage: typeof generatorLLM.getTokenUsage === 'function',
        tokenUsage: typeof generatorLLM.getTokenUsage === 'function' ? generatorLLM.getTokenUsage() : null,
      });

      if (!result.missionStatement || !result.initialScope) {
        log.error('STEP 1: Incomplete output from generator', { result });
        throw new Error('Model returned incomplete output — missing missionStatement or initialScope');
      }

      // ── Iterative validate → refine loop ───────────────────────────────────
      let validationResult = null;
      let validationsRun = 0;

      log.info('Starting validate→refine loop', { maxIterations, acceptanceThreshold });

      while (validationsRun < maxIterations) {
        // Step 2: Validate
        emit('validating', `Validating result (pass ${validationsRun + 1} of ${maxIterations})…`);
        const validatorPrompt =
          `User description: ${description}\n\n` +
          `Mission Statement: ${result.missionStatement}\n\n` +
          `Initial Scope:\n${result.initialScope}\n\n` +
          `Validate this mission and scope.`;

        log.info(`STEP 2 [iter ${validationsRun + 1}]: Calling validator LLM`, {
          model: `${validatorProvider}/${validatorModelId}`,
          promptLength: validatorPrompt.length,
          currentMission: result.missionStatement,
          currentScopeLines: result.initialScope.split('\n').length,
        });

        validationResult = await validatorLLM.generateJSON(validatorPrompt, validatorAgent);
        validationsRun++;

        log.info(`STEP 2 [iter ${validationsRun}]: Validator LLM responded`, {
          overallScore: validationResult.overallScore,
          validationStatus: validationResult.validationStatus,
          readyToUse: validationResult.readyToUse,
          issueCount: validationResult.issues?.length ?? 0,
          issues: validationResult.issues,
          strengths: validationResult.strengths,
          improvementPriorities: validationResult.improvementPriorities,
          tokenUsage: typeof validatorLLM.getTokenUsage === 'function' ? validatorLLM.getTokenUsage() : null,
        });

        const score = Number(validationResult.overallScore) || 0;
        log.debug(`Score check: ${score} >= ${acceptanceThreshold}?`, {
          score,
          acceptanceThreshold,
          passes: score >= acceptanceThreshold,
        });

        if (score >= acceptanceThreshold) {
          emit('done', `Quality check passed — score ${score}/100`);
          log.info(`Loop EXIT: score ${score} >= threshold ${acceptanceThreshold} — accepting result`, {
            validationsRun,
          });
          break;
        }

        if (validationsRun >= maxIterations) {
          emit('done', `Max iterations reached — score ${score}/100`);
          log.warn(`Loop EXIT: max iterations (${maxIterations}) reached — accepting current result`, {
            finalScore: score,
            validationsRun,
          });
          break;
        }

        // Step 3: Refine
        emit('refining', `Refining based on ${validationResult.issues?.length ?? 0} issue(s)…`);
        const issues = validationResult.issues || [];
        const issueSummary = issues
          .map(i => `- [${i.severity.toUpperCase()}] ${i.field}: ${i.description} → ${i.suggestion}`)
          .join('\n');

        const refinePrompt =
          `Original description: ${description}\n\n` +
          `Previous mission statement: ${result.missionStatement}\n` +
          `Previous scope:\n${result.initialScope}\n\n` +
          `Validation score: ${score}/100\n` +
          `Issues to fix:\n${issueSummary}\n\n` +
          `Refine the mission and scope to address these issues.`;

        log.info(`STEP 3 [iter ${validationsRun}]: Calling generator LLM for refinement`, {
          model: `${provider}/${modelId}`,
          score,
          issueCount: issues.length,
          issueSummary,
          promptLength: refinePrompt.length,
        });

        result = await generatorLLM.generateJSON(refinePrompt, generatorAgent);

        log.info(`STEP 3 [iter ${validationsRun}]: Generator LLM refinement responded`, {
          missionStatement: result.missionStatement,
          initialScope: result.initialScope,
          tokenUsage: typeof generatorLLM.getTokenUsage === 'function' ? generatorLLM.getTokenUsage() : null,
        });

        if (!result.missionStatement || !result.initialScope) {
          log.error(`STEP 3 [iter ${validationsRun}]: Refinement returned incomplete output`, { result });
          throw new Error('Refinement returned incomplete output');
        }
      }

      const finalScore = validationResult ? Number(validationResult.overallScore) || 0 : null;
      // Only surface issues when the final score did NOT pass the threshold.
      // A passing validation may still return "resolution notes" in issues[] — those are
      // misleading when shown to the user as if they were real problems.
      const finalIssues = (finalScore !== null && finalScore >= acceptanceThreshold)
        ? []
        : (validationResult?.issues || []);
      const returnValue = {
        missionStatement: result.missionStatement,
        initialScope: result.initialScope,
        validationScore: finalScore,
        iterations: validationsRun,
        issues: finalIssues,
      };

      log.info('generateMissionScope() completed successfully', {
        validationScore: finalScore,
        iterations: validationsRun,
        issueCount: returnValue.issues.length,
        missionStatement: result.missionStatement,
      });
      log.finish(true, `score=${finalScore} iterations=${validationsRun}`);

      // Track token usage
      try {
        const tracker = new TokenTracker(path.join(this.projectRoot, '.avc'));
        const genUsage = generatorLLM.getTokenUsage();
        if (genUsage.totalCalls > 0) {
          tracker.addExecution('mission-scope', {
            input: genUsage.inputTokens,
            output: genUsage.outputTokens,
            provider,
            model: modelId,
          });
        }
        const valUsage = validatorLLM.getTokenUsage();
        if (valUsage.totalCalls > 0) {
          tracker.addExecution('mission-scope', {
            input: valUsage.inputTokens,
            output: valUsage.outputTokens,
            provider: validatorProvider,
            model: validatorModelId,
          });
        }
      } catch (trackErr) {
        log.warn('Failed to track token usage', { error: trackErr.message });
      }

      return returnValue;

    } catch (err) {
      log.error('generateMissionScope() threw an error', {
        message: err.message,
        stack: err.stack,
      });
      log.finish(false, err.message);
      throw err;
    }
  }

  async refineMissionScope(missionStatement, initialScope, refinementRequest, modelId, provider, validatorModelId, validatorProvider) {
    const log = new KanbanLogger('mission-refine', this.projectRoot);
    log.info('refineMissionScope() called', {
      missionStatement: missionStatement.slice(0, 200),
      refinementRequest: refinementRequest.slice(0, 200),
      generatorModel: { provider, modelId },
      validatorModel: { provider: validatorProvider, modelId: validatorModelId },
    });

    try {
      const { default: dotenv } = await import('dotenv');
      dotenv.config({ path: path.join(this.projectRoot, '.env') });

      const avcJsonPath = path.join(this.projectRoot, '.avc', 'avc.json');
      const avcConfig = JSON.parse(fs.readFileSync(avcJsonPath, 'utf8'));
      const vs = avcConfig?.settings?.missionGenerator?.validation;
      if (!vs) {
        throw new Error(
          'Missing settings.missionGenerator.validation in avc.json. ' +
          'Add: { "settings": { "missionGenerator": { "validation": { "maxIterations": 3, "acceptanceThreshold": 75 } } } }'
        );
      }
      const maxIterations = vs.maxIterations;
      const acceptanceThreshold = vs.acceptanceThreshold;
      log.info('Validation config loaded', { maxIterations, acceptanceThreshold });

      const { LLMProvider } = await import('../../../cli/llm-provider.js');
      const generatorLLM = await LLMProvider.create(provider, modelId);
      const validatorLLM = await LLMProvider.create(validatorProvider, validatorModelId);

      const generatorAgent = loadAgent('mission-scope-generator.md', this.projectRoot);
      const validatorAgent = loadAgent('mission-scope-validator.md', this.projectRoot);

      const emit = (step, message) => {
        log.debug(`[WS emit] ${step}: ${message}`);
        this.websocket?.broadcastMissionProgress(step, message);
      };

      // ── Step 1: Initial refinement ─────────────────────────────────────────
      emit('generating', 'Refining mission & scope…');
      const generatorPrompt =
        `Current mission statement:\n${missionStatement}\n\n` +
        `Current initial scope:\n${initialScope}\n\n` +
        `The user has requested the following refinement:\n${refinementRequest}\n\n` +
        `Refine the mission statement and initial scope accordingly.`;
      log.info('STEP 1: Initial refinement — calling generator LLM', {
        model: `${provider}/${modelId}`,
        promptLength: generatorPrompt.length,
      });

      let result = await generatorLLM.generateJSON(generatorPrompt, generatorAgent);
      log.info('STEP 1: Generator LLM responded', {
        missionStatement: result.missionStatement,
        initialScope: result.initialScope,
      });

      if (!result.missionStatement || !result.initialScope) {
        log.error('STEP 1: Incomplete output from generator', { result });
        throw new Error('Model returned incomplete output — missing missionStatement or initialScope');
      }

      // ── Iterative validate → refine loop ───────────────────────────────────
      let validationResult = null;
      let validationsRun = 0;

      log.info('Starting validate→refine loop', { maxIterations, acceptanceThreshold });

      while (validationsRun < maxIterations) {
        emit('validating', `Validating result (pass ${validationsRun + 1} of ${maxIterations})…`);
        const validatorPrompt =
          `Refinement request: ${refinementRequest}\n\n` +
          `Mission Statement: ${result.missionStatement}\n\n` +
          `Initial Scope:\n${result.initialScope}\n\n` +
          `Validate this mission and scope.`;

        log.info(`STEP 2 [iter ${validationsRun + 1}]: Calling validator LLM`, {
          model: `${validatorProvider}/${validatorModelId}`,
          promptLength: validatorPrompt.length,
        });

        validationResult = await validatorLLM.generateJSON(validatorPrompt, validatorAgent);
        validationsRun++;

        log.info(`STEP 2 [iter ${validationsRun}]: Validator LLM responded`, {
          overallScore: validationResult.overallScore,
          issueCount: validationResult.issues?.length ?? 0,
        });

        const score = Number(validationResult.overallScore) || 0;

        if (score >= acceptanceThreshold) {
          emit('done', `Quality check passed — score ${score}/100`);
          log.info(`Loop EXIT: score ${score} >= threshold ${acceptanceThreshold}`, { validationsRun });
          break;
        }

        if (validationsRun >= maxIterations) {
          emit('done', `Max iterations reached — score ${score}/100`);
          log.warn(`Loop EXIT: max iterations (${maxIterations}) reached`, { finalScore: score, validationsRun });
          break;
        }

        emit('refining', `Refining based on ${validationResult.issues?.length ?? 0} issue(s)…`);
        const issues = validationResult.issues || [];
        const issueSummary = issues
          .map(i => `- [${i.severity.toUpperCase()}] ${i.field}: ${i.description} → ${i.suggestion}`)
          .join('\n');

        const refinePrompt =
          `Refinement request: ${refinementRequest}\n\n` +
          `Previous mission statement: ${result.missionStatement}\n` +
          `Previous scope:\n${result.initialScope}\n\n` +
          `Validation score: ${score}/100\n` +
          `Issues to fix:\n${issueSummary}\n\n` +
          `Refine the mission and scope to address these issues while honouring the refinement request.`;

        log.info(`STEP 3 [iter ${validationsRun}]: Calling generator LLM for refinement`, {
          model: `${provider}/${modelId}`,
          score,
          issueCount: issues.length,
          promptLength: refinePrompt.length,
        });

        result = await generatorLLM.generateJSON(refinePrompt, generatorAgent);

        log.info(`STEP 3 [iter ${validationsRun}]: Generator LLM refinement responded`, {
          missionStatement: result.missionStatement,
        });

        if (!result.missionStatement || !result.initialScope) {
          log.error(`STEP 3 [iter ${validationsRun}]: Refinement returned incomplete output`, { result });
          throw new Error('Refinement returned incomplete output');
        }
      }

      const finalScore = validationResult ? Number(validationResult.overallScore) || 0 : null;
      // Only surface issues when the final score did NOT pass the threshold.
      const finalIssues = (finalScore !== null && finalScore >= acceptanceThreshold)
        ? []
        : (validationResult?.issues || []);
      const returnValue = {
        missionStatement: result.missionStatement,
        initialScope: result.initialScope,
        validationScore: finalScore,
        iterations: validationsRun,
        issues: finalIssues,
      };

      log.info('refineMissionScope() completed successfully', {
        validationScore: finalScore,
        iterations: validationsRun,
        issueCount: returnValue.issues.length,
      });
      log.finish(true, `score=${finalScore} iterations=${validationsRun}`);

      // Track token usage
      try {
        const tracker = new TokenTracker(path.join(this.projectRoot, '.avc'));
        const genUsage = generatorLLM.getTokenUsage();
        if (genUsage.totalCalls > 0) {
          tracker.addExecution('mission-refine', {
            input: genUsage.inputTokens,
            output: genUsage.outputTokens,
            provider,
            model: modelId,
          });
        }
        const valUsage = validatorLLM.getTokenUsage();
        if (valUsage.totalCalls > 0) {
          tracker.addExecution('mission-refine', {
            input: valUsage.inputTokens,
            output: valUsage.outputTokens,
            provider: validatorProvider,
            model: validatorModelId,
          });
        }
      } catch (trackErr) {
        log.warn('Failed to track token usage', { error: trackErr.message });
      }

      return returnValue;

    } catch (err) {
      log.error('refineMissionScope() threw an error', { message: err.message, stack: err.stack });
      log.finish(false, err.message);
      throw err;
    }
  }

  async generateCustomArchitecture(description, modelId, provider) {
    const log = new KanbanLogger('arch-custom', this.projectRoot);
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: path.join(this.projectRoot, '.env') });

    const { LLMProvider } = await import('../../../cli/llm-provider.js');
    const llm = await LLMProvider.create(provider, modelId);
    const agentInstruction = loadAgent('architecture-recommender.md', this.projectRoot);

    const prompt =
      `The user wants a SINGLE custom architecture for their project.\n\n` +
      `User description: ${description}\n\n` +
      `Return a JSON object with EXACTLY ONE architecture in the "architectures" array ` +
      `matching the user's description. Include all required fields: ` +
      `name, description, requiresCloudProvider, bestFor, costTier. ` +
      `Optionally include migrationPath if applicable.`;

    const result = await llm.generateJSON(prompt, agentInstruction);
    const arch = (result.architectures || [])[0];
    if (!arch?.name || !arch?.description) {
      throw new Error('Model returned incomplete architecture — missing name or description');
    }
    log.info('generateCustomArchitecture result', { archName: arch.name });
    return arch;
  }

  async refineCustomArchitecture(currentArch, refinementRequest, modelId, provider) {
    const log = new KanbanLogger('arch-custom', this.projectRoot);
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: path.join(this.projectRoot, '.env') });

    const { LLMProvider } = await import('../../../cli/llm-provider.js');
    const llm = await LLMProvider.create(provider, modelId);
    const agentInstruction = loadAgent('architecture-recommender.md', this.projectRoot);

    const prompt =
      `Refine the following architecture based on the user's request.\n\n` +
      `Current architecture: ${JSON.stringify(currentArch, null, 2)}\n\n` +
      `Refinement request: ${refinementRequest}\n\n` +
      `Return a JSON object with EXACTLY ONE updated architecture in the "architectures" array.`;

    const result = await llm.generateJSON(prompt, agentInstruction);
    const arch = (result.architectures || [])[0];
    if (!arch?.name || !arch?.description) {
      throw new Error('Model returned incomplete architecture');
    }
    log.info('refineCustomArchitecture result', { archName: arch.name });
    return arch;
  }

  async analyzeDatabase(mission, scope, strategy) {
    const log = new KanbanLogger('analyze-db', this.projectRoot);
    log.info('analyzeDatabase() called', {
      missionLength: mission?.length,
      scopeLines: scope?.split('\n').length,
      strategy,
    });
    try {
      const { TemplateProcessor } = await import('../../../cli/template-processor.js');
      const p = new TemplateProcessor('sponsor-call', null, true);
      log.debug('Calling getDatabaseRecommendation');
      const result = await p.getDatabaseRecommendation(mission, scope, strategy);
      log.info('analyzeDatabase() completed', { resultKeys: Object.keys(result || {}) });

      // Track token usage from TemplateProcessor's internal providers
      try {
        const tracker = new TokenTracker(path.join(this.projectRoot, '.avc'));
        if (p._stageProviders) {
          for (const providerInstance of Object.values(p._stageProviders)) {
            if (typeof providerInstance.getTokenUsage === 'function') {
              const usage = providerInstance.getTokenUsage();
              if (usage.totalCalls > 0) {
                tracker.addExecution('analyze-database', {
                  input: usage.inputTokens,
                  output: usage.outputTokens,
                  provider: usage.provider,
                  model: usage.model,
                });
              }
            }
          }
        }
      } catch (trackErr) {
        log.warn('Failed to track token usage', { error: trackErr.message });
      }

      log.finish(true);
      return result;
    } catch (err) {
      log.error('analyzeDatabase() failed', { message: err.message, stack: err.stack });
      log.finish(false, err.message);
      throw err;
    }
  }

  async analyzeArchitecture(mission, scope, dbContext, strategy) {
    const log = new KanbanLogger('analyze-arch', this.projectRoot);
    log.info('analyzeArchitecture() called', {
      missionLength: mission?.length,
      scopeLines: scope?.split('\n').length,
      dbContext: dbContext ? 'provided' : 'null',
      strategy,
    });
    try {
      const { TemplateProcessor } = await import('../../../cli/template-processor.js');
      const p = new TemplateProcessor('sponsor-call', null, true);
      log.debug('Calling getArchitectureRecommendations');
      const result = await p.getArchitectureRecommendations(mission, scope, dbContext, strategy);
      log.info('analyzeArchitecture() completed', { resultKeys: Object.keys(result || {}) });

      // Track token usage from TemplateProcessor's internal providers
      try {
        const tracker = new TokenTracker(path.join(this.projectRoot, '.avc'));
        if (p._stageProviders) {
          for (const providerInstance of Object.values(p._stageProviders)) {
            if (typeof providerInstance.getTokenUsage === 'function') {
              const usage = providerInstance.getTokenUsage();
              if (usage.totalCalls > 0) {
                tracker.addExecution('analyze-architecture', {
                  input: usage.inputTokens,
                  output: usage.outputTokens,
                  provider: usage.provider,
                  model: usage.model,
                });
              }
            }
          }
        }
      } catch (trackErr) {
        log.warn('Failed to track token usage', { error: trackErr.message });
      }

      log.finish(true);
      return result;
    } catch (err) {
      log.error('analyzeArchitecture() failed', { message: err.message, stack: err.stack });
      log.finish(false, err.message);
      throw err;
    }
  }

  async prefillAnswers(mission, scope, arch, dbContext, strategy) {
    const log = new KanbanLogger('prefill', this.projectRoot);
    log.info('prefillAnswers() called', {
      missionLength: mission?.length,
      scopeLines: scope?.split('\n').length,
      arch: arch ? 'provided' : 'null',
      dbContext: dbContext ? 'provided' : 'null',
      strategy,
    });
    try {
      const { TemplateProcessor } = await import('../../../cli/template-processor.js');
      const p = new TemplateProcessor('sponsor-call', null, true);
      log.debug('Calling prefillQuestions');
      // cloudProvider is null — we let the architecture name carry that context
      const result = await p.prefillQuestions(mission, scope, arch, null, dbContext, strategy);
      log.info('prefillAnswers() completed', { resultKeys: Object.keys(result || {}) });

      // Track token usage from TemplateProcessor's internal providers
      try {
        const tracker = new TokenTracker(path.join(this.projectRoot, '.avc'));
        if (p._stageProviders) {
          for (const providerInstance of Object.values(p._stageProviders)) {
            if (typeof providerInstance.getTokenUsage === 'function') {
              const usage = providerInstance.getTokenUsage();
              if (usage.totalCalls > 0) {
                tracker.addExecution('prefill-answers', {
                  input: usage.inputTokens,
                  output: usage.outputTokens,
                  provider: usage.provider,
                  model: usage.model,
                });
              }
            }
          }
        }
      } catch (trackErr) {
        log.warn('Failed to track token usage', { error: trackErr.message });
      }

      log.finish(true);
      return result;
    } catch (err) {
      log.error('prefillAnswers() failed', { message: err.message, stack: err.stack });
      log.finish(false, err.message);
      throw err;
    }
  }

  // ── Fork-based ceremony execution ───────────────────────────────────────────

  /**
   * Shared dispatcher for worker IPC messages.
   * Used both by the direct-fork path (child.on('message')) and the
   * IPC relay path (handleWorkerMessage called from start.js).
   * @param {object} msg - Worker IPC message
   * @param {object} record - ProcessRegistry record
   * @param {ProcessRegistry} registry
   */
  async _dispatchWorkerMessage(msg, record, registry) {
    const entry = { ts: Date.now(), level: 'info', text: msg.message || msg.substep || msg.detail || '' };
    const isSP = record.type === 'sprint-planning';
    switch (msg.type) {
      case 'progress':
        registry.appendLog(record.id, entry);
        this.state.progress.push({ type: 'progress', message: msg.message });
        if (isSP) this.websocket?.broadcastSprintPlanningProgress(msg.message);
        else this.websocket?.broadcastCeremonyProgress(msg.message);
        break;
      case 'substep':
        entry.level = 'detail'; entry.text = msg.substep;
        registry.appendLog(record.id, entry);
        this.state.progress.push({ type: 'substep', substep: msg.substep, meta: msg.meta });
        if (isSP) this.websocket?.broadcastSprintPlanningSubstep(msg.substep, msg.meta);
        else this.websocket?.broadcastCeremonySubstep(msg.substep, msg.meta);
        break;
      case 'detail':
        entry.level = 'detail'; entry.text = msg.detail;
        registry.appendLog(record.id, entry);
        this.state.progress.push({ type: 'detail', detail: msg.detail });
        if (isSP) this.websocket?.broadcastSprintPlanningDetail(msg.detail);
        else this.websocket?.broadcastCeremonyDetail(msg.detail);
        break;
      case 'paused':
        registry.setStatus(record.id, 'paused');
        if (isSP) this.websocket?.broadcastSprintPlanningPaused();
        else this.websocket?.broadcastCeremonyPaused();
        break;
      case 'resumed':
        registry.setStatus(record.id, 'running');
        if (isSP) this.websocket?.broadcastSprintPlanningResumed();
        else this.websocket?.broadcastCeremonyResumed();
        break;
      case 'complete':
        this.state.status = 'complete';
        this.state.result = msg.result;
        this._activeChild = null;
        this._activeProcessId = null;
        registry.setStatus(record.id, 'complete', { result: msg.result });
        await this._reloadCallback?.();
        if (isSP) this.websocket?.broadcastSprintPlanningComplete(msg.result);
        else this.websocket?.broadcastCeremonyComplete(msg.result);
        this.websocket?.broadcastRefresh();
        break;
      case 'cancelled':
        if (isSP) this._cleanupCancelledSprintPlanning();
        this.state.status = 'idle';
        this._activeChild = null;
        this._activeProcessId = null;
        registry.setStatus(record.id, 'cancelled');
        if (isSP) this.websocket?.broadcastSprintPlanningCancelled();
        else this.websocket?.broadcastCeremonyCancelled();
        break;
      case 'error':
        this.state.status = 'error';
        this.state.error = msg.error;
        this._activeChild = null;
        this._activeProcessId = null;
        registry.setStatus(record.id, 'error', { error: msg.error });
        if (isSP) this.websocket?.broadcastSprintPlanningError(msg.error);
        else this.websocket?.broadcastCeremonyError(msg.error);
        break;
      case 'cost-limit': {
        const pauseMsg = `Cost limit reached: $${msg.cost.toFixed(4)} spent (limit: $${(msg.threshold ?? 0).toFixed(2)}). Ceremony paused — waiting for user decision.`;
        this.state.progress.push({ type: 'progress', message: pauseMsg });
        this.state.status = 'cost-limit-pending';
        this.state.costLimitInfo = { cost: msg.cost, threshold: msg.threshold };
        // _activeChild stays alive — worker is waiting for cost-limit-continue or cancel
        registry.setStatus(record.id, 'paused');
        this.websocket?.broadcastCostLimit(msg.cost, msg.threshold, this._runningType);
        break;
      }
      case 'decomposition-complete':
        this.state.status = 'awaiting-selection';
        this.state.decomposedHierarchy = msg.hierarchy;
        // _activeChild stays alive — worker is polling for selection-confirmed or cancel
        registry.setStatus(record.id, 'paused');
        this.websocket?.broadcastSprintPlanningDecompositionComplete(msg.hierarchy);
        break;
    }
  }

  /**
   * Resume sprint planning with the user's epic/story selection.
   * Sends selection-confirmed to the waiting worker and restores running state.
   */
  confirmSprintPlanningSelection(selectedEpicIds, selectedStoryIds) {
    if (this._activeChild) {
      try {
        this._activeChild.send({ type: 'selection-confirmed', selectedEpicIds, selectedStoryIds });
      } catch (_) {}
    }
    this.state.status = 'running';
    this.state.decomposedHierarchy = null;
  }

  /**
   * Resume ceremony past the cost limit (user chose "Continue Anyway").
   * Sends cost-limit-continue to the waiting worker and restores running state.
   */
  continuePastCostLimit() {
    if (this._activeChild) {
      try { this._activeChild.send({ type: 'cost-limit-continue' }); } catch (_) {}
    }
    this.state.status = 'running';
    this.state.costLimitInfo = null;
  }

  /**
   * Read the cost threshold for a ceremony type from avc.json.
   * Returns null if not configured (unlimited).
   */
  _getCostThreshold(ceremonyType) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(this.projectRoot, '.avc', 'avc.json'), 'utf8'));
      return config.settings?.costThresholds?.[ceremonyType] ?? null;
    } catch { return null; }
  }

  // ── Public relay entry-points (called from start.js when running as CLI fork) ─

  /** Relay a worker IPC message received via CLI → Kanban IPC channel. */
  handleWorkerMessage(processId, msg) {
    const record = this._registry?.getByProcessId(processId);
    if (record) this._dispatchWorkerMessage(msg, record, this._registry);
  }

  /** Relay worker exit notification received via CLI → Kanban IPC channel. */
  handleWorkerExit(processId, code) {
    const record = this._registry?.getByProcessId(processId);
    if (!record) return;
    this._activeChild = null;
    this._activeProcessId = null;
    const isSP = record.type === 'sprint-planning';
    const wasActive = this._runningType === record.type &&
      (this.state.status === 'running' || this.state.status === 'cost-limit-pending');
    if (wasActive) {
      const error = `Worker exited unexpectedly (code ${code})`;
      this._registry.setStatus(record.id, 'error', { error });
      this.state.status = 'error';
      this.state.error = error;
      this.state.costLimitInfo = null;
      if (isSP) this.websocket?.broadcastSprintPlanningError(error);
      else this.websocket?.broadcastCeremonyError(error);
    }
    this._runningType = null;
  }

  /** Called when CLI confirms it has forked the worker (informational). */
  handleWorkerStarted(processId, pid) {
    // Worker forked by CLI — no additional action required in Kanban
  }

  /**
   * Run sprint planning in a forked child process.
   * When running as a fork of the CLI (process.connected), uses IPC relay mode:
   * the CLI forks the worker and relays messages via its IPC channel.
   * @param {ProcessRegistry} registry
   * @returns {string} processId
   */
  async runSprintPlanningInProcess(registry) {
    if (this.state.status === 'running') {
      throw new Error('Ceremony already running');
    }

    const projectDir = path.join(this.projectRoot, '.avc', 'project');
    this._preRunSnapshot = fs.existsSync(projectDir) ? fs.readdirSync(projectDir) : [];
    this._paused = false;
    this._cancelled = false;
    this._runningType = 'sprint-planning';
    this.state = { status: 'running', progress: [], result: null, error: null };

    const record = registry.create('sprint-planning', 'Sprint Planning');
    this._registry = registry;
    this._activeProcessId = record.id;

    const costThreshold = this._getCostThreshold('sprint-planning');

    if (process.connected) {
      // IPC relay mode — proxy stands in for the worker child so that pause/resume/cancel
      // continue to work unchanged; actual forking is delegated to the CLI process.
      const proxy = {
        send: (m) => { try { process.send({ type: 'ceremony:control', action: m.type, processId: record.id, payload: m }); } catch (_) {} },
        kill: (s) => { try { process.send({ type: 'ceremony:kill', signal: s, processId: record.id }); } catch (_) {} },
      };
      this._activeChild = proxy;
      registry.attach(record.id, proxy);
      process.send({ type: 'ceremony:fork', ceremonyType: 'sprint-planning', processId: record.id, costThreshold });
      return record.id;
    }

    // Standalone fallback — direct fork (used for tests / manual server launch)
    const workerPath = path.join(__dirname, '../workers/sprint-planning-worker.js');
    const child = fork(workerPath, [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env },
    });
    child.stdout?.on('data', d => process.stdout.write(d));
    child.stderr?.on('data', d => process.stderr.write(d));

    registry.attach(record.id, child);
    this._activeChild = child;
    child.send({ type: 'init', costThreshold });

    child.on('message', (msg) => this._dispatchWorkerMessage(msg, record, registry));

    child.on('exit', (code) => {
      this._activeChild = null;
      this._activeProcessId = null;
      if (this._runningType === 'sprint-planning' && this.state.status === 'running') {
        registry.setStatus(record.id, 'error', { error: `Worker exited unexpectedly (code ${code})` });
        this.state.status = 'error';
        this.state.error = `Worker exited unexpectedly (code ${code})`;
        this.websocket?.broadcastSprintPlanningError(this.state.error);
      }
      this._runningType = null;
    });

    return record.id;
  }

  /**
   * Run sponsor call in a forked child process.
   * When running as a fork of the CLI (process.connected), uses IPC relay mode.
   * @param {ProcessRegistry} registry
   * @param {object} requirements - All 7 template variables
   * @returns {string} processId
   */
  async runSponsorCallInProcess(registry, requirements) {
    if (this.state.status === 'running') {
      throw new Error('Ceremony already running');
    }

    this._paused = false;
    this._cancelled = false;
    this._runningType = 'sponsor-call';
    this.state = { status: 'running', progress: [], result: null, error: null };

    const record = registry.create('sponsor-call', 'Sponsor Call');
    this._registry = registry;
    this._activeProcessId = record.id;

    const costThreshold = this._getCostThreshold('sponsor-call');

    if (process.connected) {
      // IPC relay mode
      const proxy = {
        send: (m) => { try { process.send({ type: 'ceremony:control', action: m.type, processId: record.id, payload: m }); } catch (_) {} },
        kill: (s) => { try { process.send({ type: 'ceremony:kill', signal: s, processId: record.id }); } catch (_) {} },
      };
      this._activeChild = proxy;
      registry.attach(record.id, proxy);
      process.send({ type: 'ceremony:fork', ceremonyType: 'sponsor-call', processId: record.id, requirements, costThreshold });
      return record.id;
    }

    // Standalone fallback — direct fork
    const workerPath = path.join(__dirname, '../workers/sponsor-call-worker.js');
    const child = fork(workerPath, [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env },
    });
    child.stdout?.on('data', d => process.stdout.write(d));
    child.stderr?.on('data', d => process.stderr.write(d));

    registry.attach(record.id, child);
    this._activeChild = child;
    child.send({ type: 'init', requirements, costThreshold });

    child.on('message', (msg) => this._dispatchWorkerMessage(msg, record, registry));

    child.on('exit', (code) => {
      this._activeChild = null;
      this._activeProcessId = null;
      if (this._runningType === 'sponsor-call' && this.state.status === 'running') {
        registry.setStatus(record.id, 'error', { error: `Worker exited unexpectedly (code ${code})` });
        this.state.status = 'error';
        this.state.error = `Worker exited unexpectedly (code ${code})`;
        this.websocket?.broadcastCeremonyError(this.state.error);
      }
      this._runningType = null;
    });

    return record.id;
  }

  // ── Legacy in-process ceremony execution (kept for backward compat) ──────────

  async run(requirements) {
    if (this.state.status === 'running') {
      throw new Error('Ceremony already running');
    }

    this._paused = false;
    this._cancelled = false;
    this._runningType = 'sponsor-call';
    this.state = { status: 'running', progress: [], result: null, error: null };

    // Fire-and-forget: caller gets {started:true} immediately
    this._runAsync(requirements);
  }

  async runSprintPlanning() {
    if (this.state.status === 'running') {
      throw new Error('Ceremony already running');
    }
    const projectDir = path.join(this.projectRoot, '.avc', 'project');
    this._preRunSnapshot = fs.existsSync(projectDir) ? fs.readdirSync(projectDir) : [];
    this._paused = false;
    this._cancelled = false;
    this._runningType = 'sprint-planning';
    this.state = { status: 'running', progress: [], result: null, error: null };
    this._runSprintPlanningAsync(); // fire-and-forget
  }

  async _runSprintPlanningAsync() {
    const log = new KanbanLogger('sprint-planning-run', this.projectRoot);
    log.info('_runSprintPlanningAsync() started');
    try {
      const { ProjectInitiator } = await import('../../../cli/init.js');
      const initiator = new ProjectInitiator();
      const progressCallback = async (msg, substep, meta) => {
        if (this._cancelled) throw new Error('CEREMONY_CANCELLED');
        while (this._paused) {
          await new Promise(r => setTimeout(r, 200));
          if (this._cancelled) throw new Error('CEREMONY_CANCELLED');
        }
        if (msg) {
          log.info(`[progress] ${msg}`);
          this.state.progress.push({ type: 'progress', message: msg });
          this.websocket?.broadcastSprintPlanningProgress(msg);
        }
        if (substep) {
          log.debug(`[substep] ${substep}`);
          this.state.progress.push({ type: 'substep', substep, meta: meta || {} });
          this.websocket?.broadcastSprintPlanningSubstep(substep, meta || {});
        }
        if (meta?.detail) {
          log.debug(`[detail] ${meta.detail}`);
          this.state.progress.push({ type: 'detail', detail: meta.detail });
          this.websocket?.broadcastSprintPlanningDetail(meta.detail);
        }
      };
      const result = await initiator.sprintPlanningWithCallback(progressCallback);
      this.state.status = 'complete';
      this.state.result = result;
      log.info('_runSprintPlanningAsync() completed', result);
      log.finish(true);
      this.websocket?.broadcastSprintPlanningComplete(result);
      this.websocket?.broadcastRefresh();
    } catch (err) {
      if (err.message === 'CEREMONY_CANCELLED') {
        this._cleanupCancelledSprintPlanning();
        this.state.status = 'idle';
        log.info('_runSprintPlanningAsync() cancelled by user');
        log.finish(true, 'cancelled');
        this.websocket?.broadcastSprintPlanningCancelled();
      } else {
        this.state.status = 'error';
        this.state.error = err.message;
        log.error('_runSprintPlanningAsync() failed', { message: err.message, stack: err.stack });
        log.finish(false, err.message);
        this.websocket?.broadcastSprintPlanningError(err.message);
      }
    }
  }

  async _runAsync(requirements) {
    const log = new KanbanLogger('ceremony-run', this.projectRoot);
    log.info('_runAsync() started', {
      requirementKeys: Object.keys(requirements || {}),
      missionLength: requirements?.MISSION_STATEMENT?.length,
    });

    try {
      const { ProjectInitiator } = await import('../../../cli/init.js');
      const initiator = new ProjectInitiator();
      log.debug('ProjectInitiator created');

      const progressCallback = async (msg, substep, meta) => {
        if (this._cancelled) throw new Error('CEREMONY_CANCELLED');
        while (this._paused) {
          await new Promise(r => setTimeout(r, 200));
          if (this._cancelled) throw new Error('CEREMONY_CANCELLED');
        }
        if (msg) {
          log.info(`[progress] ${msg}`);
          this.state.progress.push({ type: 'progress', message: msg });
          this.websocket?.broadcastCeremonyProgress(msg);
        }
        if (substep) {
          log.debug(`[substep] ${substep}`, meta);
          this.state.progress.push({ type: 'substep', substep, meta: meta || {} });
          this.websocket?.broadcastCeremonySubstep(substep, meta || {});
        }
        if (meta?.detail) {
          log.debug(`[detail] ${meta.detail}`);
          this.state.progress.push({ type: 'detail', detail: meta.detail });
          this.websocket?.broadcastCeremonyDetail(meta.detail);
        }
      };

      const result = await initiator.sponsorCallWithAnswers(requirements, progressCallback);

      this.state.status = 'complete';
      this.state.result = result;
      log.info('_runAsync() completed successfully', {
        resultKeys: Object.keys(result || {}),
      });
      log.finish(true);

      this.websocket?.broadcastCeremonyComplete(result);
      this.websocket?.broadcastRefresh();
    } catch (err) {
      if (err.message === 'CEREMONY_CANCELLED') {
        this.state.status = 'idle';
        log.info('_runAsync() cancelled by user');
        log.finish(true, 'cancelled');
        this.websocket?.broadcastCeremonyCancelled();
      } else {
        this.state.status = 'error';
        this.state.error = err.message;
        log.error('_runAsync() failed', { message: err.message, stack: err.stack });
        log.finish(false, err.message);
        this.websocket?.broadcastCeremonyError(err.message);
      }
    }
  }
}
