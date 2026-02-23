import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { KanbanLogger } from '../utils/kanban-logger.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentsPath = path.join(__dirname, '../../../cli/agents');

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
    this.state = { status: 'idle', progress: [], result: null, error: null };
    this.websocket = null;
  }

  setWebSocket(ws) {
    this.websocket = ws;
  }

  getStatus() {
    return {
      status: this.state.status,
      result: this.state.result,
      error: this.state.error,
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
      const generatorAgentPath = path.join(agentsPath, 'mission-scope-generator.md');
      const validatorAgentPath = path.join(agentsPath, 'mission-scope-validator.md');
      log.debug('Loading agent files', { generatorAgentPath, validatorAgentPath });
      const generatorAgent = fs.readFileSync(generatorAgentPath, 'utf8');
      const validatorAgent = fs.readFileSync(validatorAgentPath, 'utf8');
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
      const returnValue = {
        missionStatement: result.missionStatement,
        initialScope: result.initialScope,
        validationScore: finalScore,
        iterations: validationsRun,
        issues: validationResult?.issues || [],
      };

      log.info('generateMissionScope() completed successfully', {
        validationScore: finalScore,
        iterations: validationsRun,
        issueCount: returnValue.issues.length,
        missionStatement: result.missionStatement,
      });
      log.finish(true, `score=${finalScore} iterations=${validationsRun}`);

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

      const generatorAgentPath = path.join(agentsPath, 'mission-scope-generator.md');
      const validatorAgentPath = path.join(agentsPath, 'mission-scope-validator.md');
      const generatorAgent = fs.readFileSync(generatorAgentPath, 'utf8');
      const validatorAgent = fs.readFileSync(validatorAgentPath, 'utf8');

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
      const returnValue = {
        missionStatement: result.missionStatement,
        initialScope: result.initialScope,
        validationScore: finalScore,
        iterations: validationsRun,
        issues: validationResult?.issues || [],
      };

      log.info('refineMissionScope() completed successfully', {
        validationScore: finalScore,
        iterations: validationsRun,
        issueCount: returnValue.issues.length,
      });
      log.finish(true, `score=${finalScore} iterations=${validationsRun}`);

      return returnValue;

    } catch (err) {
      log.error('refineMissionScope() threw an error', { message: err.message, stack: err.stack });
      log.finish(false, err.message);
      throw err;
    }
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
      log.finish(true);
      return result;
    } catch (err) {
      log.error('prefillAnswers() failed', { message: err.message, stack: err.stack });
      log.finish(false, err.message);
      throw err;
    }
  }

  async run(requirements) {
    if (this.state.status === 'running') {
      throw new Error('Ceremony already running');
    }

    this.state = { status: 'running', progress: [], result: null, error: null };

    // Fire-and-forget: caller gets {started:true} immediately
    this._runAsync(requirements);
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

      const result = await initiator.sponsorCallWithAnswers(requirements, (msg, substep, meta) => {
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
      });

      this.state.status = 'complete';
      this.state.result = result;
      log.info('_runAsync() completed successfully', {
        resultKeys: Object.keys(result || {}),
      });
      log.finish(true);

      this.websocket?.broadcastCeremonyComplete(result);
      this.websocket?.broadcastRefresh();
    } catch (err) {
      this.state.status = 'error';
      this.state.error = err.message;
      log.error('_runAsync() failed', { message: err.message, stack: err.stack });
      log.finish(false, err.message);
      this.websocket?.broadcastCeremonyError(err.message);
    }
  }
}
