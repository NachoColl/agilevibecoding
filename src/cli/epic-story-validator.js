import { ValidationRouter } from './validation-router.js';
import { LLMProvider } from './llm-provider.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadAgent } from './agent-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Roles that operate at design/visual granularity.
// Epics rarely carry the design detail these validators need to reach the full threshold.
// Story-level validation always uses the full threshold.
const EPIC_THRESHOLD_OVERRIDES = {
  'ui': 80,
  'ux': 80,
};

/**
 * Multi-Agent Epic and Story Validator
 *
 * Orchestrates validation across multiple domain-specific validator agents.
 * Each epic/story is reviewed by 2-8 specialized validators based on domain and features.
 * After each validator, a paired solver agent improves the epic/story if issues are found,
 * then the same validator re-validates — up to maxIterations times.
 */
class EpicStoryValidator {
  constructor(llmProvider, verificationTracker, stagesConfig = null, useSmartSelection = false, progressCallback = null, projectContext = null) {
    this.llmProvider = llmProvider;
    this.verificationTracker = verificationTracker;
    this.projectContext = projectContext;

    // Create router with smart selection support and project context
    this.router = new ValidationRouter(llmProvider, useSmartSelection, projectContext);

    this.agentsPath = path.join(__dirname, 'agents');
    this.validationFeedback = new Map();

    // Store validation stage configuration
    this.validationStageConfig = stagesConfig?.validation || null;

    // Cache for validator-specific providers
    this._validatorProviders = {};

    // Smart selection flag
    this.useSmartSelection = useSmartSelection;

    // Progress callback for UI detail emissions
    this.progressCallback = progressCallback;

    // Per-call token callback (propagated to all created providers)
    this._tokenCallback = null;

    // Root project context.md string — prepended to all validation prompts when set
    this.rootContextMd = null;
  }

  /**
   * Register a callback to be fired after every LLM API call made by this validator.
   * Propagates to all provider instances created by this validator.
   * @param {Function} fn - Receives { input, output, provider, model }
   */
  setTokenCallback(fn) {
    this._tokenCallback = fn;
  }

  /**
   * Attach a PromptLogger so all providers created by this validator write payloads.
   * @param {import('./prompt-logger.js').PromptLogger} logger
   */
  setPromptLogger(logger) {
    this._promptLogger = logger;
  }

  /**
   * Set the root project context.md string — prepended to all validation prompts.
   * @param {string} md - Canonical root context markdown
   */
  setRootContextMd(md) {
    this.rootContextMd = md;
  }

  /**
   * Get the acceptance threshold for a specific validator role at epic level.
   * Design-oriented roles (ui, ux) use a lower bar because epics don't carry
   * the design detail they need. Configurable via stagesConfig.solver.epicThresholdOverrides.
   * @param {string} role - Short role name (e.g., 'ui', 'backend')
   * @param {number} defaultThreshold - Base threshold from config
   * @returns {number}
   */
  getEpicThreshold(role, defaultThreshold) {
    const configOverrides = this.validationStageConfig?.solver?.epicThresholdOverrides || {};
    return configOverrides[role] ?? EPIC_THRESHOLD_OVERRIDES[role] ?? defaultThreshold;
  }

  /**
   * Generate canonical context.md string for an epic from its JSON fields.
   * This is the bounded, structured format passed to validators and solvers.
   * @param {Object} epic
   * @returns {string}
   */
  generateEpicContextMd(epic) {
    const features = (epic.features || []).map(f => `- ${f}`).join('\n') || '- (none)';
    const deps = epic.dependencies || [];
    const optional = deps.filter(d => /optional/i.test(d));
    const required = deps.filter(d => !/optional/i.test(d));
    const reqLines = required.length ? required.map(d => `- ${d}`).join('\n') : '- (none)';
    const storyCount = (epic.stories || []).length;
    const lines = [
      `# Epic: ${epic.name}`,
      ``,
      `## Identity`,
      `- id: ${epic.id || '(pending)'}`,
      `- domain: ${epic.domain}`,
      `- stories: ${storyCount}`,
      ``,
      `## Summary`,
      epic.description || '(no description)',
      ``,
      `## Features`,
      features,
      ``,
      `## Dependencies`,
      ``,
      `### Required`,
      reqLines,
    ];
    if (optional.length) {
      lines.push('', '### Optional');
      optional.forEach(d => lines.push(`- ${d}`));
    }
    return lines.join('\n');
  }

  /**
   * Generate canonical context.md string for a story from its JSON fields.
   * @param {Object} story
   * @param {Object} epic - Parent epic for identity context
   * @returns {string}
   */
  generateStoryContextMd(story, epic) {
    const ac = (story.acceptance || []).map((a, i) => `${i + 1}. ${a}`).join('\n') || '1. (none)';
    const deps = (story.dependencies || []).map(d => `- ${d}`).join('\n') || '- (none)';
    return [
      `# Story: ${story.name}`,
      ``,
      `## Identity`,
      `- id: ${story.id || '(pending)'}`,
      `- epic: ${epic.id || '(pending)'} (${epic.name})`,
      `- userType: ${story.userType || 'team member'}`,
      ``,
      `## Summary`,
      story.description || '(no description)',
      ``,
      `## Acceptance Criteria`,
      ac,
      ``,
      `## Dependencies`,
      deps,
    ].join('\n');
  }

  /**
   * Apply a single epic solver's output to the working epic (bounded, no narrative merge).
   * Preserves all existing features; adds up to maxNewFeatures genuinely new ones.
   * Takes description from solver only if different; unions dependencies.
   * @param {Object} workingEpic
   * @param {Object} improved - Solver output JSON
   * @param {number} maxNewFeatures
   * @returns {Object} Updated workingEpic
   */
  _applyEpicSolverResult(workingEpic, improved, maxNewFeatures = 3) {
    if (!improved || improved.id !== workingEpic.id) return workingEpic;
    const baseSet = new Set(workingEpic.features || []);
    const newFeatures = (improved.features || [])
      .filter(f => !baseSet.has(f))
      .slice(0, maxNewFeatures);
    const allDeps = new Set([...(workingEpic.dependencies || []), ...(improved.dependencies || [])]);
    return {
      ...workingEpic,
      description: (improved.description && improved.description !== workingEpic.description)
        ? improved.description
        : workingEpic.description,
      features: [...(workingEpic.features || []), ...newFeatures],
      dependencies: [...allDeps],
    };
  }

  /**
   * Apply a single story solver's output to the working story (bounded).
   * Preserves all existing AC; adds up to maxNewAC genuinely new ones.
   * @param {Object} workingStory
   * @param {Object} improved - Solver output JSON
   * @param {number} maxNewAC
   * @returns {Object} Updated workingStory
   */
  _applyStorySolverResult(workingStory, improved, maxNewAC = 3) {
    if (!improved || improved.id !== workingStory.id) return workingStory;
    const baseSet = new Set(workingStory.acceptance || []);
    const newAC = (improved.acceptance || [])
      .filter(a => !baseSet.has(a))
      .slice(0, maxNewAC);
    const allDeps = new Set([...(workingStory.dependencies || []), ...(improved.dependencies || [])]);
    return {
      ...workingStory,
      description: (improved.description && improved.description !== workingStory.description)
        ? improved.description
        : workingStory.description,
      acceptance: [...(workingStory.acceptance || []), ...newAC],
      dependencies: [...allDeps],
    };
  }

  /** Emit a Level-3 detail line to the UI (fire-and-forget safe) */
  async _detail(msg) {
    await this.progressCallback?.(null, null, { detail: msg });
  }

  /**
   * Wrap an async LLM call with a periodic elapsed-time heartbeat.
   * Emits a detail message every `intervalMs` ms while the call runs,
   * so the UI always shows activity during long LLM operations.
   */
  _withHeartbeat(fn, getMsg, intervalMs = 5000) {
    const startTime = Date.now();
    let lastMsg = null;
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const msg = getMsg(elapsed);
      if (msg != null && msg !== lastMsg) {
        lastMsg = msg;
        this._detail(msg).catch(() => {});
        // Also log to debug output so stuck calls are visible in log files
        console.log(`[HEARTBEAT] ${msg} (${elapsed}s elapsed)`);
      }
    }, intervalMs);
    return fn().finally(() => clearInterval(timer));
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
    const role = this.extractDomain(validatorName);
    const providerInstance = await LLMProvider.create(provider, model);
    if (this._tokenCallback) providerInstance.onCall((delta) => this._tokenCallback(delta, 'validation'));
    if (this._promptLogger) providerInstance.setPromptLogger(this._promptLogger, `validation-${role}`);
    this._validatorProviders[cacheKey] = providerInstance;

    return providerInstance;
  }

  /**
   * Get provider for a specific solver based on solver stage config
   * @param {string} role - Role name (e.g., 'security')
   * @returns {Promise<LLMProvider>} LLM provider instance
   */
  async getProviderForSolver(role) {
    const solverConfig = this.validationStageConfig?.solver;
    if (!solverConfig?.provider) return this.llmProvider;

    const cacheKey = `solver:${solverConfig.provider}:${solverConfig.model}`;
    if (this._validatorProviders[cacheKey]) return this._validatorProviders[cacheKey];

    const instance = await LLMProvider.create(solverConfig.provider, solverConfig.model);
    if (this._tokenCallback) instance.onCall((delta) => this._tokenCallback(delta, 'solver'));
    if (this._promptLogger) instance.setPromptLogger(this._promptLogger, `solver-${role}`);
    this._validatorProviders[cacheKey] = instance;
    return instance;
  }

  /**
   * Get provider for contextual agent selection (agent-selector LLM call).
   * Uses validation stage config; falls back to this.llmProvider.
   * @returns {Promise<LLMProvider>}
   */
  async getProviderForSelection() {
    if (this.validationStageConfig?.provider && this.validationStageConfig?.model) {
      const cacheKey = `selection:${this.validationStageConfig.provider}:${this.validationStageConfig.model}`;
      if (this._validatorProviders[cacheKey]) return this._validatorProviders[cacheKey];
      const instance = await LLMProvider.create(this.validationStageConfig.provider, this.validationStageConfig.model);
      if (this._tokenCallback) instance.onCall((delta) => this._tokenCallback(delta, 'validation'));
      if (this._promptLogger) instance.setPromptLogger(this._promptLogger, 'selection');
      this._validatorProviders[cacheKey] = instance;
      return instance;
    }
    return this.llmProvider;
  }

  /**
   * Validate an Epic with multiple domain validators
   * Runs validators sequentially; after each validator, if issues exist,
   * a paired solver improves the epic before the next validator runs.
   * @param {Object} epic - Epic work.json object
   * @param {string} epicContext - Epic context.md content
   * @returns {Object} Aggregated validation result
   */
  async validateEpic(epic, epicContext) {
    // 1. Get validators (cached or select)
    let validators;
    if (epic.metadata?.selectedValidators) {
      validators = epic.metadata.selectedValidators;
      console.log(`   Using cached validator selection (${validators.length} validators)`);
    } else {
      const useContextualSelection = this.validationStageConfig?.useContextualSelection || false;
      console.log(`[DEBUG] Epic validator selection: useContextualSelection=${useContextualSelection}, validationStageConfig=${JSON.stringify(this.validationStageConfig)}`);
      if (useContextualSelection) {
        const selectionProvider = await this.getProviderForSelection();
        validators = await this.router.selectValidatorsWithContext(epic, 'epic', selectionProvider);
      } else if (this.useSmartSelection) {
        validators = await this.router.getValidatorsForEpicWithLLM(epic);
      } else {
        validators = this.router.getValidatorsForEpic(epic);
      }
      if (!epic.metadata) epic.metadata = {};
      epic.metadata.selectedValidators = validators;
    }

    console.log(`\n🔍 Validating Epic: ${epic.name}`);
    console.log(`   Domain: ${epic.domain}`);
    console.log(`   Validators (${validators.length}): ${validators.map(v => this.extractDomain(v)).join(', ')}\n`);

    const solverConfig = this.validationStageConfig?.solver || {};
    const maxIterations = solverConfig.maxIterations ?? 5;
    const acceptanceThreshold = solverConfig.acceptanceThreshold ?? 95;

    await this._detail(`${validators.length} validator${validators.length !== 1 ? 's' : ''}: ${validators.map(v => this.extractDomain(v)).join(', ')}`);

    // Working copy — accumulates improvements sequentially as validators run
    let workingEpic = { ...epic };
    // Canonical context string — regenerated from workingEpic after each solver run
    let workingContext = epicContext || this.generateEpicContextMd(epic);
    const finalResults = [];

    // ── Sequential per-validator loop ─────────────────────────────────────────────
    // Each validator sees the epic already improved by prior validators' solvers.
    // Only the failing validator's solver runs — no batch triggering.
    for (let vi = 0; vi < validators.length; vi++) {
      const validatorName = validators[vi];
      const role = this.extractDomain(validatorName);
      const roleThreshold = this.getEpicThreshold(role, acceptanceThreshold);

      await this._detail(`[${vi + 1}/${validators.length}] ${role}: validating…`);
      console.log(`   [${vi + 1}/${validators.length}] Running ${validatorName} (threshold=${roleThreshold})…`);

      // Initial validation
      const _t0vi = Date.now();
      let result = await this._withHeartbeat(
        () => this.runEpicValidator(workingEpic, workingContext, validatorName),
        (elapsed) => {
          if (elapsed < 20) return `   [${role}] reviewing requirements…`;
          if (elapsed < 40) return `   [${role}] analyzing concerns…`;
          if (elapsed < 60) return `   [${role}] checking best practices…`;
          return `   [${role}] still validating…`;
        },
        10000
      ).catch(err => {
        console.warn(`   ⚠ Validator ${validatorName} failed: ${err.message.split('\n')[0]}`);
        return { overallScore: 0, validationStatus: 'error', issues: [], _validatorError: err.message.split('\n')[0] };
      });

      console.log(`   [${vi + 1}/${validators.length}] ${validatorName} initial score=${result.overallScore ?? 0}/100`);

      // ── Inline retry: only runs if this validator is below its role threshold ──
      for (let iter = 1; iter < maxIterations && (result.overallScore ?? 0) < roleThreshold; iter++) {
        await this._detail(`   ↻ [${role}] score=${result.overallScore ?? 0} below ${roleThreshold} — running solver (iter ${iter})…`);
        console.log(`   ↻ [${role}] iter ${iter}: score=${result.overallScore ?? 0} — running solver…`);

        // Save state before solver in case score regresses
        const preIterEpic = { ...workingEpic, features: [...(workingEpic.features || [])], dependencies: [...(workingEpic.dependencies || [])] };
        const preIterContext = workingContext;
        const preIterResult = result;
        const prevScore = preIterResult.overallScore ?? 0;

        try {
          const improved = await this._withHeartbeat(
            () => this.runEpicSolver(workingEpic, workingContext, result, validatorName),
            (elapsed) => {
              if (elapsed < 25) return `   ↻ [${role}] solver — applying improvements…`;
              if (elapsed < 50) return `   ↻ [${role}] solver — refining epic…`;
              return `   ↻ [${role}] solver — still running…`;
            },
            20000
          );
          const prevFeatureCount = (workingEpic.features || []).length;
          workingEpic = this._applyEpicSolverResult(workingEpic, improved);
          workingContext = this.generateEpicContextMd(workingEpic);
          const added = (workingEpic.features || []).length - prevFeatureCount;
          console.log(`   ↻ [${role}] solver applied — +${added} features`);
          await this._detail(`   → [${role}] improvements applied (+${added} features)`);
        } catch (err) {
          console.warn(`   ⚠ Solver failed for ${validatorName}: ${err.message.split('\n')[0]} — skipping retry`);
          await this._detail(`   ⚠ Solver failed (${role}): ${err.message.split('\n')[0].slice(0, 120)}`);
          break;
        }

        result = await this._withHeartbeat(
          () => this.runEpicValidator(workingEpic, workingContext, validatorName),
          (elapsed) => {
            if (elapsed < 20) return `   [${role}] re-reviewing…`;
            if (elapsed < 40) return `   [${role}] re-analyzing…`;
            return `   [${role}] re-validating…`;
          },
          10000
        ).catch(err => {
          console.warn(`   ⚠ Re-validator ${validatorName} failed: ${err.message.split('\n')[0]}`);
          return preIterResult; // keep previous result on error
        });

        const newScore = result.overallScore ?? 0;

        // Regression guard: if score went down, revert to pre-solver state
        if (newScore < prevScore) {
          workingEpic = preIterEpic;
          workingContext = preIterContext;
          result = preIterResult;
          await this._detail(`   ↩ [${role}] regression (${prevScore} → ${newScore}) — reverting`);
          console.log(`   ↩ [${role}] regression: ${prevScore} → ${newScore} — reverting and stopping iterations`);
          break;
        }

        const acceptable = newScore >= roleThreshold;
        await this._detail(`   ↻ [${role}] iter ${iter + 1}: ${prevScore} → ${newScore}/100 — ${acceptable ? '✓ accepted' : `still below ${roleThreshold}`}`);
        console.log(`   [${vi + 1}/${validators.length}] ${validatorName} iter=${iter + 1} score=${newScore}/100 (was ${prevScore})`);
      }

      // Record final result for this validator
      const finalScore = result.overallScore ?? 0;
      const finalAcceptable = finalScore >= roleThreshold;
      const allIssues = result.issues || [];
      const critCount = allIssues.filter(i => i.severity === 'critical').length;
      const majCount  = allIssues.filter(i => i.severity === 'major').length;
      const issueStr = allIssues.length > 0 ? ` · ${allIssues.length} issue${allIssues.length !== 1 ? 's' : ''}` : '';
      await this._detail(`[${vi + 1}/${validators.length}] ${role}: ${finalScore}/100${issueStr} — ${finalAcceptable ? '✓' : '⚠ below threshold'}`);
      console.log(`[TIMING] ${validatorName} total: ${Date.now() - _t0vi}ms | FINAL score=${finalScore}/100 (threshold=${roleThreshold})`);
      allIssues.forEach(issue => {
        const cat = issue.category ? `[${issue.category}] ` : '';
        const sug = issue.suggestion ? ` → ${issue.suggestion}` : '';
        console.log(`     [${(issue.severity || 'unknown').toUpperCase()}] ${cat}${issue.description || '(no description)'}${sug}`);
      });
      console.log(`     (critical=${critCount} major=${majCount} minor=${allIssues.length - critCount - majCount})`);

      finalResults.push(result);
    }
    // ── End sequential loop ───────────────────────────────────────────────────────

    // Write accumulated improvements back to the original epic object
    epic.description  = workingEpic.description;
    epic.features     = workingEpic.features;
    epic.dependencies = workingEpic.dependencies;

    // Aggregate results
    const aggregated = this.aggregateValidationResults(finalResults, 'epic');
    aggregated.overallStatus = this.determineOverallStatus(finalResults);
    aggregated.readyToPublish = aggregated.overallStatus !== 'needs-improvement';

    await this._detail(`Overall: ${aggregated.readyToPublish ? '✓ passed' : '⚠ needs improvement'} · avg ${aggregated.averageScore}/100`);
    console.log(`   Epic "${epic.name}" summary: avg=${aggregated.averageScore}/100 readyToPublish=${aggregated.readyToPublish} critical=${aggregated.criticalIssues.length} major=${aggregated.majorIssues.length}`);
    aggregated.validatorResults.forEach(vr => {
      console.log(`     ${this.extractDomain(vr.validator)}: ${vr.score}/100 (${vr.status})`);
    });

    this.storeValidationFeedback(epic.id, aggregated);

    epic.metadata = epic.metadata || {};
    epic.metadata.validationResult = {
      averageScore: aggregated.averageScore,
      overallStatus: aggregated.overallStatus,
      readyToPublish: aggregated.readyToPublish,
      criticalIssues: aggregated.criticalIssues,
      majorIssues: aggregated.majorIssues,
      minorIssues: aggregated.minorIssues,
      validatorResults: aggregated.validatorResults,
      validatedAt: new Date().toISOString(),
    };

    return aggregated;
  }

  /**
   * Validate a Story with multiple domain validators
   * Runs validators sequentially; after each validator, if issues exist,
   * a paired solver improves the story before the next validator runs.
   * @param {Object} story - Story work.json object
   * @param {string} storyContext - Story context.md content
   * @param {Object} epic - Parent epic for routing
   * @returns {Object} Aggregated validation result
   */
  async validateStory(story, storyContext, epic) {
    // 1. Get validators (cached or select)
    let validators;
    if (story.metadata?.selectedValidators) {
      validators = story.metadata.selectedValidators;
      console.log(`   Using cached validator selection (${validators.length} validators)`);
    } else {
      const useContextualSelection = this.validationStageConfig?.useContextualSelection || false;
      if (useContextualSelection) {
        const selectionProvider = await this.getProviderForSelection();
        validators = await this.router.selectValidatorsWithContext(story, 'story', selectionProvider, epic);
      } else if (this.useSmartSelection) {
        validators = await this.router.getValidatorsForStoryWithLLM(story, epic);
      } else {
        validators = this.router.getValidatorsForStory(story, epic);
      }
      if (!story.metadata) story.metadata = {};
      story.metadata.selectedValidators = validators;
    }

    console.log(`\n🔍 Validating Story: ${story.name}`);
    console.log(`   Epic: ${epic.name} (${epic.domain})`);
    console.log(`   Validators (${validators.length}): ${validators.map(v => this.extractDomain(v)).join(', ')}\n`);

    const solverConfig = this.validationStageConfig?.solver || {};
    const maxIterations = solverConfig.maxIterations ?? 5;
    const acceptanceThreshold = solverConfig.acceptanceThreshold ?? 95;

    await this._detail(`${validators.length} validator${validators.length !== 1 ? 's' : ''}: ${validators.map(v => this.extractDomain(v)).join(', ')}`);

    // Working copy — accumulates improvements sequentially as validators run
    let workingStory = { ...story };
    // Canonical context string — regenerated from workingStory after each solver run
    let workingContext = storyContext || this.generateStoryContextMd(story, epic);
    const finalResults = [];

    // ── Sequential per-validator loop ─────────────────────────────────────────────
    for (let vi = 0; vi < validators.length; vi++) {
      const validatorName = validators[vi];
      const role = this.extractDomain(validatorName);
      // Stories always use the full threshold (no design-level override at story level)

      await this._detail(`[${vi + 1}/${validators.length}] ${role}: validating…`);
      console.log(`   [${vi + 1}/${validators.length}] Running ${validatorName} (threshold=${acceptanceThreshold})…`);

      const _t0vi = Date.now();
      let result = await this._withHeartbeat(
        () => this.runStoryValidator(workingStory, workingContext, epic, validatorName),
        (elapsed) => {
          if (elapsed < 20) return `   [${role}] reviewing story…`;
          if (elapsed < 40) return `   [${role}] checking acceptance criteria…`;
          if (elapsed < 60) return `   [${role}] validating scope…`;
          return `   [${role}] still validating…`;
        },
        10000
      ).catch(err => {
        console.warn(`   ⚠ Validator ${validatorName} failed: ${err.message.split('\n')[0]}`);
        return { overallScore: 0, validationStatus: 'error', issues: [], _validatorError: err.message.split('\n')[0] };
      });

      console.log(`   [${vi + 1}/${validators.length}] ${validatorName} initial score=${result.overallScore ?? 0}/100`);

      // ── Inline retry: only runs if this validator is below threshold ──
      for (let iter = 1; iter < maxIterations && (result.overallScore ?? 0) < acceptanceThreshold; iter++) {
        await this._detail(`   ↻ [${role}] score=${result.overallScore ?? 0} below ${acceptanceThreshold} — running solver (iter ${iter})…`);
        console.log(`   ↻ [${role}] iter ${iter}: score=${result.overallScore ?? 0} — running solver…`);

        // Save state before solver in case score regresses
        const preIterStory = { ...workingStory, acceptance: [...(workingStory.acceptance || [])], dependencies: [...(workingStory.dependencies || [])] };
        const preIterContext = workingContext;
        const preIterResult = result;
        const prevScore = preIterResult.overallScore ?? 0;

        try {
          const improved = await this._withHeartbeat(
            () => this.runStorySolver(workingStory, workingContext, epic, result, validatorName),
            (elapsed) => {
              if (elapsed < 25) return `   ↻ [${role}] solver — improving story…`;
              if (elapsed < 50) return `   ↻ [${role}] solver — refining acceptance criteria…`;
              return `   ↻ [${role}] solver — still running…`;
            },
            20000
          );
          const prevACCount = (workingStory.acceptance || []).length;
          workingStory = this._applyStorySolverResult(workingStory, improved);
          workingContext = this.generateStoryContextMd(workingStory, epic);
          const added = (workingStory.acceptance || []).length - prevACCount;
          console.log(`   ↻ [${role}] solver applied — +${added} AC`);
          await this._detail(`   → [${role}] improvements applied (+${added} AC)`);
        } catch (err) {
          console.warn(`   ⚠ Solver failed for ${validatorName}: ${err.message.split('\n')[0]} — skipping retry`);
          await this._detail(`   ⚠ Solver failed (${role}): ${err.message.split('\n')[0].slice(0, 120)}`);
          break;
        }

        result = await this._withHeartbeat(
          () => this.runStoryValidator(workingStory, workingContext, epic, validatorName),
          (elapsed) => {
            if (elapsed < 20) return `   [${role}] re-reviewing story…`;
            if (elapsed < 40) return `   [${role}] re-checking acceptance criteria…`;
            return `   [${role}] re-validating…`;
          },
          10000
        ).catch(err => {
          console.warn(`   ⚠ Re-validator ${validatorName} failed: ${err.message.split('\n')[0]}`);
          return preIterResult; // keep previous result on error
        });

        const newScore = result.overallScore ?? 0;

        // Regression guard: if score went down, revert to pre-solver state
        if (newScore < prevScore) {
          workingStory = preIterStory;
          workingContext = preIterContext;
          result = preIterResult;
          await this._detail(`   ↩ [${role}] regression (${prevScore} → ${newScore}) — reverting`);
          console.log(`   ↩ [${role}] regression: ${prevScore} → ${newScore} — reverting and stopping iterations`);
          break;
        }

        const acceptable = newScore >= acceptanceThreshold;
        await this._detail(`   ↻ [${role}] iter ${iter + 1}: ${prevScore} → ${newScore}/100 — ${acceptable ? '✓ accepted' : `still below ${acceptanceThreshold}`}`);
        console.log(`   [${vi + 1}/${validators.length}] ${validatorName} iter=${iter + 1} score=${newScore}/100 (was ${prevScore})`);
      }

      // Record final result for this validator
      const finalScore = result.overallScore ?? 0;
      const finalAcceptable = finalScore >= acceptanceThreshold;
      const allIssues = result.issues || [];
      const critCount = allIssues.filter(i => i.severity === 'critical').length;
      const majCount  = allIssues.filter(i => i.severity === 'major').length;
      const issueStr = allIssues.length > 0 ? ` · ${allIssues.length} issue${allIssues.length !== 1 ? 's' : ''}` : '';
      await this._detail(`[${vi + 1}/${validators.length}] ${role}: ${finalScore}/100${issueStr} — ${finalAcceptable ? '✓' : '⚠ below threshold'}`);
      console.log(`[TIMING] ${validatorName} total: ${Date.now() - _t0vi}ms | FINAL score=${finalScore}/100`);
      allIssues.forEach(issue => {
        const cat = issue.category ? `[${issue.category}] ` : '';
        const sug = issue.suggestion ? ` → ${issue.suggestion}` : '';
        console.log(`     [${(issue.severity || 'unknown').toUpperCase()}] ${cat}${issue.description || '(no description)'}${sug}`);
      });
      console.log(`     (critical=${critCount} major=${majCount} minor=${allIssues.length - critCount - majCount})`);

      finalResults.push(result);
    }
    // ── End sequential loop ───────────────────────────────────────────────────────

    // Write accumulated improvements back to the original story object
    story.description  = workingStory.description;
    story.acceptance   = workingStory.acceptance;
    story.dependencies = workingStory.dependencies;

    // Aggregate results
    const aggregated = this.aggregateValidationResults(finalResults, 'story');
    aggregated.overallStatus = this.determineOverallStatus(finalResults);
    aggregated.readyToPublish = aggregated.overallStatus !== 'needs-improvement';

    await this._detail(`Overall: ${aggregated.readyToPublish ? '✓ passed' : '⚠ needs improvement'} · avg ${aggregated.averageScore}/100`);
    console.log(`   Story "${story.name}" summary: avg=${aggregated.averageScore}/100 readyToPublish=${aggregated.readyToPublish} critical=${aggregated.criticalIssues.length} major=${aggregated.majorIssues.length}`);
    aggregated.validatorResults.forEach(vr => {
      console.log(`     ${this.extractDomain(vr.validator)}: ${vr.score}/100 (${vr.status})`);
    });

    this.storeValidationFeedback(story.id, aggregated);

    story.metadata = story.metadata || {};
    story.metadata.validationResult = {
      averageScore: aggregated.averageScore,
      overallStatus: aggregated.overallStatus,
      readyToPublish: aggregated.readyToPublish,
      criticalIssues: aggregated.criticalIssues,
      majorIssues: aggregated.majorIssues,
      minorIssues: aggregated.minorIssues,
      validatorResults: aggregated.validatorResults,
      validatedAt: new Date().toISOString(),
    };

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
    const _usageBefore = provider.getTokenUsage();
    const _t0 = Date.now();
    console.log(`[API-START] ${validatorName} (epic="${epic.name}", promptLen=${prompt.length})`);
    const rawResult = await provider.generateJSON(prompt, agentInstructions);
    const _elapsed = Date.now() - _t0;
    const _usageAfter = provider.getTokenUsage();
    const _deltaIn = _usageAfter.inputTokens - _usageBefore.inputTokens;
    const _deltaOut = _usageAfter.outputTokens - _usageBefore.outputTokens;
    console.log(`[API-DONE] ${validatorName} — ${_elapsed}ms | in=${_deltaIn} out=${_deltaOut} tokens`);

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
    const _usageBefore = provider.getTokenUsage();
    const _t0 = Date.now();
    console.log(`[API-START] ${validatorName} (story="${story.name}", promptLen=${prompt.length})`);
    const rawResult = await provider.generateJSON(prompt, agentInstructions);
    const _elapsed = Date.now() - _t0;
    const _usageAfter = provider.getTokenUsage();
    const _deltaIn = _usageAfter.inputTokens - _usageBefore.inputTokens;
    const _deltaOut = _usageAfter.outputTokens - _usageBefore.outputTokens;
    console.log(`[API-DONE] ${validatorName} — ${_elapsed}ms | in=${_deltaIn} out=${_deltaOut} tokens`);

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
   * Run a solver agent to improve an epic based on validation issues
   * @private
   */
  async runEpicSolver(epic, epicContext, validationResult, validatorName) {
    const role = this.extractDomain(validatorName);
    const agentInstructions = this.loadAgentInstructions(`solver-epic-${role}.md`);
    const prompt = this.buildEpicSolverPrompt(epic, epicContext, validationResult, validatorName);
    const provider = await this.getProviderForSolver(role);

    const _usageBefore = provider.getTokenUsage();
    const _t0 = Date.now();
    console.log(`[API-START] solver-epic-${role} (epic="${epic.name}", promptLen=${prompt.length})`);
    const improved = await provider.generateJSON(prompt, agentInstructions);
    const _elapsed = Date.now() - _t0;
    const _usageAfter = provider.getTokenUsage();
    const _deltaIn = _usageAfter.inputTokens - _usageBefore.inputTokens;
    const _deltaOut = _usageAfter.outputTokens - _usageBefore.outputTokens;
    console.log(`[API-DONE] solver-epic-${role} — ${_elapsed}ms | in=${_deltaIn} out=${_deltaOut} tokens`);

    if (this.verificationTracker) {
      this.verificationTracker.recordCheck(`solver-epic-${role}`, 'epic-solving', true);
    }

    return improved;
  }

  /**
   * Run a solver agent to improve a story based on validation issues
   * @private
   */
  async runStorySolver(story, storyContext, epic, validationResult, validatorName) {
    const role = this.extractDomain(validatorName);
    const agentInstructions = this.loadAgentInstructions(`solver-story-${role}.md`);
    const prompt = this.buildStorySolverPrompt(story, storyContext, epic, validationResult, validatorName);
    const provider = await this.getProviderForSolver(role);

    const _usageBefore = provider.getTokenUsage();
    const _t0 = Date.now();
    console.log(`[API-START] solver-story-${role} (story="${story.name}", promptLen=${prompt.length})`);
    const improved = await provider.generateJSON(prompt, agentInstructions);
    const _elapsed = Date.now() - _t0;
    const _usageAfter = provider.getTokenUsage();
    const _deltaIn = _usageAfter.inputTokens - _usageBefore.inputTokens;
    const _deltaOut = _usageAfter.outputTokens - _usageBefore.outputTokens;
    console.log(`[API-DONE] solver-story-${role} — ${_elapsed}ms | in=${_deltaIn} out=${_deltaOut} tokens`);

    if (this.verificationTracker) {
      this.verificationTracker.recordCheck(`solver-story-${role}`, 'story-solving', true);
    }

    return improved;
  }

  /**
   * Build solver prompt for an Epic using canonical context format.
   * @private
   */
  buildEpicSolverPrompt(epic, epicContext, validationResult, validatorName) {
    const allIssues = validationResult.issues || [];
    const critMajor = allIssues.filter(i => i.severity === 'critical' || i.severity === 'major');
    const issues = critMajor.length > 0 ? critMajor : allIssues;
    const role = this.extractDomain(validatorName);
    const issueText = issues.map((issue, i) =>
      `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description}\n   Fix: ${issue.suggestion}`
    ).join('\n');

    return `# Epic to Improve

**Epic ID:** ${epic.id}

## Current State (canonical)

${epicContext}

## Issues to Fix (from ${role} review)

${issueText || 'No critical/major issues — improve overall quality.'}

Improve this Epic to address the issues above. Return the complete improved Epic JSON.

**IMPORTANT CONSTRAINTS:**
- Do NOT remove or consolidate existing features — only add new ones to address the issues above.
- Each feature must be a single concise sentence (max 30 words). Do not expand them into paragraphs.
`;
  }

  /**
   * Build solver prompt for a Story using canonical context format.
   * @private
   */
  buildStorySolverPrompt(story, storyContext, epic, validationResult, validatorName) {
    const allIssues = validationResult.issues || [];
    const critMajor = allIssues.filter(i => i.severity === 'critical' || i.severity === 'major');
    const issues = critMajor.length > 0 ? critMajor : allIssues;
    const role = this.extractDomain(validatorName);
    const issueText = issues.map((issue, i) =>
      `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description}\n   Fix: ${issue.suggestion}`
    ).join('\n');

    // Include parent epic context for solver awareness.
    // Cap at 3000 chars to prevent prompt bloat after many epic solver rounds
    // (after 5 rounds the epic can grow to 26k+ chars, making story solver prompts ~35k).
    const fullEpicContext = this.generateEpicContextMd(epic);
    const epicContextMd = fullEpicContext.length > 3000
      ? fullEpicContext.substring(0, 3000) + '\n… (truncated)'
      : fullEpicContext;

    return `# Story to Improve

**Story ID:** ${story.id}

## Parent Epic (canonical)

${epicContextMd}

## Current Story State (canonical)

${storyContext}

## Issues to Fix (from ${role} review)

${issueText || 'No critical/major issues — improve overall quality.'}

Improve this Story to address the issues above. Return the complete improved Story JSON.

**IMPORTANT CONSTRAINTS:**
- Do NOT remove or consolidate existing acceptance criteria — only add new ones to address the issues above.
- Each AC must be a single concrete, testable sentence (max 40 words). Do not expand them into paragraphs.
`;
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
   * Build validation prompt for Epic using canonical context.md format.
   * Prepends root context when available for richer agent selection context.
   * @private
   */
  buildEpicValidationPrompt(epic, epicContext) {
    const rootSection = this.rootContextMd
      ? `## Project Context\n\n${this.rootContextMd}\n\n---\n\n`
      : '';
    const calibration = this._calibrationNote();
    return `# Epic Validation\n\n${rootSection}${calibration}## Epic to Validate\n\n${epicContext}\n\nValidate this Epic from your domain expertise perspective and return JSON validation results following the specified format.\n`;
  }

  /**
   * Build validation prompt for Story using canonical context.md format.
   * Prepends root context when available.
   * @private
   */
  buildStoryValidationPrompt(story, storyContext, epic) {
    const rootSection = this.rootContextMd
      ? `## Project Context\n\n${this.rootContextMd}\n\n---\n\n`
      : '';
    const calibration = this._calibrationNote();
    return `# Story Validation\n\n${rootSection}${calibration}## Story to Validate\n\n${storyContext}\n\nValidate this Story from your domain expertise perspective and return JSON validation results following the specified format.\n`;
  }

  /**
   * Returns a context-aware calibration note injected before each validator prompt.
   * For small/local MVP projects, prevents validators from flagging enterprise-scale
   * concerns (horizontal scaling, cloud migration paths, 99.9% SLA) as MAJOR issues
   * when they don't block the current implementation scope.
   * @private
   */
  _calibrationNote() {
    const ctx = this.projectContext || {};
    const isSmall = ctx.teamContext === 'small' || ctx.teamContext === 'solo';
    const isLocal = ctx.deploymentType === 'local' || ctx.deploymentType === 'docker';
    if (!isSmall && !isLocal) return '';
    const team = ctx.teamContext || 'small';
    const deploy = ctx.deploymentType || 'local';
    return `> **Calibration**: ${deploy} deployment, ${team} team, MVP phase. Treat the following as MINOR (not MAJOR): missing horizontal-scaling specs, cloud/multi-instance migration paths, enterprise SLA targets (e.g. 99.9% uptime, 100K concurrent users), and exhaustive NFR lists for non-implemented scenarios. Only escalate to MAJOR when the gap directly blocks implementing the core functionality described.\n\n`;
  }

  /**
   * Load agent instructions from .md file
   * @private
   */
  loadAgentInstructions(filename) {
    try {
      return loadAgent(filename);
    } catch (err) {
      throw new Error(`Agent file not found: ${filename}`);
    }
  }


  /**
   * Extract domain name from validator or solver name
   * @private
   */
  extractDomain(validatorName) {
    // Extract domain from validator/solver name
    // e.g., "validator-epic-security" → "security"
    // e.g., "solver-epic-security" → "security"
    const match = validatorName.match(/(?:validator|solver)-(?:epic|story)-(.+)/);
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
