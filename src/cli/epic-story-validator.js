import { ValidationRouter } from './validation-router.js';
import { LLMProvider } from './llm-provider.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadAgent } from './agent-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  }

  /**
   * Register a callback to be fired after every LLM API call made by this validator.
   * Propagates to all provider instances created by this validator.
   * @param {Function} fn - Receives { input, output, provider, model }
   */
  setTokenCallback(fn) {
    this._tokenCallback = fn;
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
    const providerInstance = await LLMProvider.create(provider, model);
    if (this._tokenCallback) providerInstance.onCall(this._tokenCallback);
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
    if (this._tokenCallback) instance.onCall(this._tokenCallback);
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
      if (this._tokenCallback) instance.onCall(this._tokenCallback);
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
    // 1. Check cache for previously selected validators
    let validators;
    if (epic.metadata?.selectedValidators) {
      validators = epic.metadata.selectedValidators;
      console.log(`   Using cached validator selection (${validators.length} validators)`);
    } else {
      // Get applicable validators for this epic
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

      // Cache selection in metadata
      if (!epic.metadata) {
        epic.metadata = {};
      }
      epic.metadata.selectedValidators = validators;
    }

    console.log(`\n🔍 Validating Epic: ${epic.name}`);
    console.log(`   Domain: ${epic.domain}`);
    console.log(`   Validators (${validators.length}): ${validators.map(v => this.extractDomain(v)).join(', ')}\n`);

    // Read solver iteration settings
    const solverConfig = this.validationStageConfig?.solver || {};
    const maxIterations = solverConfig.maxIterations ?? 3;
    const acceptanceThreshold = solverConfig.acceptanceThreshold ?? 95;

    await this._detail(`${validators.length} validator${validators.length !== 1 ? 's' : ''}: ${validators.map(v => this.extractDomain(v)).join(', ')}`);

    // Working copy — accumulates improvements from solver runs
    // Keep stories array untouched; solver only modifies epic-level fields
    let workingEpic = { ...epic };

    // ── Phase 1: run all validators in parallel on the initial snapshot ──────────
    await this._detail(`Running ${validators.length} validators in parallel…`);
    console.log(`   Running ${validators.length} validators in parallel…`);

    const _t0Parallel = Date.now();
    const parallelResults = await Promise.all(
      validators.map((validatorName, vi) => {
        const role = this.extractDomain(validatorName);
        return this._withHeartbeat(
          () => this.runEpicValidator(workingEpic, epicContext, validatorName),
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
      })
    );
    console.log(`[TIMING] epic parallel batch (${validators.length} validators): ${Date.now() - _t0Parallel}ms`);

    // Log all parallel results
    for (let vi = 0; vi < validators.length; vi++) {
      const validatorName = validators[vi];
      const role = this.extractDomain(validatorName);
      const result = parallelResults[vi];
      const score = result.overallScore ?? 0;
      const allIssues = result.issues || [];
      const critCount = allIssues.filter(i => i.severity === 'critical').length;
      const majCount  = allIssues.filter(i => i.severity === 'major').length;
      const acceptable = score >= acceptanceThreshold;
      const issueStr = allIssues.length > 0 ? ` · ${allIssues.length} issue${allIssues.length !== 1 ? 's' : ''}` : '';
      await this._detail(`[${vi + 1}/${validators.length}] ${role}: ${score}/100${issueStr} — ${acceptable ? '✓' : '⚠ below threshold'}`);
      console.log(`   [${vi + 1}/${validators.length}] ${validatorName} score=${score}/100 status=${result.validationStatus} (critical=${critCount} major=${majCount} minor=${allIssues.length - critCount - majCount})`);
      allIssues.forEach(issue => {
        const cat = issue.category ? `[${issue.category}] ` : '';
        const sug = issue.suggestion ? ` → ${issue.suggestion}` : '';
        console.log(`     [${(issue.severity || 'unknown').toUpperCase()}] ${cat}${issue.description || '(no description)'}${sug}`);
      });
    }

    // ── Phase 2: parallel solver rounds ──────────────────────────────────────────
    const finalResults = [...parallelResults];

    // Indices of validators still below threshold
    let needsWork = validators.map((_, vi) => vi).filter(vi =>
      (parallelResults[vi].overallScore ?? 0) < acceptanceThreshold
    );
    if (needsWork.length > 0) {
      console.log(`   ${needsWork.length}/${validators.length} validators below threshold — running parallel solver rounds (max ${maxIterations - 1})`);
      await this._detail(`${needsWork.length} below threshold — parallel solver rounds`);
    }

    for (let iter = 1; iter < maxIterations && needsWork.length > 0; iter++) {
      const roundCount = needsWork.length;
      await this._detail(`   ↻ Round ${iter}/${maxIterations - 1}: ${roundCount} solver${roundCount !== 1 ? 's' : ''} in parallel…`);
      console.log(`   ↻ Round ${iter}/${maxIterations - 1}: ${roundCount} solver${roundCount !== 1 ? 's' : ''} running in parallel…`);
      const _t0Round = Date.now();

      // 1. Run all below-threshold solvers in parallel (all see the same workingEpic snapshot)
      const solverResults = await Promise.all(
        needsWork.map(vi => {
          const validatorName = validators[vi];
          const role = this.extractDomain(validatorName);
          return this._withHeartbeat(
            () => this.runEpicSolver(workingEpic, epicContext, finalResults[vi], validatorName),
            (elapsed) => {
              if (elapsed < 25) return `   ↻ ${role} solver — applying improvements…`;
              if (elapsed < 50) return `   ↻ ${role} solver — refining epic quality…`;
              return `   ↻ ${role} solver — still running…`;
            },
            20000
          ).then(improved => ({ vi, improved, error: null }))
            .catch(err => ({ vi, improved: null, error: err }));
        })
      );
      console.log(`[TIMING] Phase 2 round ${iter} solvers: ${Date.now() - _t0Round}ms`);

      // 2. Merge all solver results — preserve base items, add up to 3 new items per solver
      // Base items are anchored (never dropped); each solver contributes at most 3 genuinely new features.
      // Description taken from the solver whose validator scored lowest (most informed fix).
      const baseFeatures = workingEpic.features || [];
      const baseFeaturesSet = new Set(baseFeatures);
      const newFeatureAdditions = []; // items new beyond base, insertion-ordered, deduplicated
      const allDeps = new Set(workingEpic.dependencies || []);
      let bestDescription = workingEpic.description;
      let worstValidatorScore = Infinity;
      let anyImproved = false;

      for (const { vi, improved, error } of solverResults) {
        const validatorName = validators[vi];
        const role = this.extractDomain(validatorName);
        if (error) {
          console.warn(`   ⚠ Solver failed for ${validatorName}: ${error.message} — keeping current epic`);
          await this._detail(`   ⚠ Solver failed (${role}): ${error.message.split('\n')[0].slice(0, 120)}`);
          continue;
        }
        if (improved && improved.id === workingEpic.id) {
          anyImproved = true;
          // Collect only new items not already in base or pending additions (max 3 per solver)
          const existingAll = new Set([...baseFeaturesSet, ...newFeatureAdditions]);
          const solverNew = (improved.features || []).filter(f => !existingAll.has(f)).slice(0, 3);
          newFeatureAdditions.push(...solverNew);
          (improved.dependencies || []).forEach(d => allDeps.add(d));
          // Description: take from the validator with the lowest score (most dissatisfied perspective)
          const vScore = finalResults[vi]?.overallScore ?? 100;
          if (improved.description && improved.description !== workingEpic.description && vScore < worstValidatorScore) {
            worstValidatorScore = vScore;
            bestDescription = improved.description;
          }
          console.log(`   ↻ [${role}] solver merged — ${solverNew.length} new features added`);
          await this._detail(`   → [${role}] improvements applied`);
        } else {
          console.log(`   ↻ [${role}] solver returned no valid improvement (id mismatch or empty)`);
        }
      }

      if (anyImproved) {
        // Base items always preserved first; cap only the additions portion
        const merged = [...baseFeatures, ...newFeatureAdditions];
        const hardCap = baseFeatures.length + 12; // allow up to 12 new features beyond original
        const finalFeatures = merged.length > hardCap ? merged.slice(0, hardCap) : merged;
        if (merged.length > hardCap) {
          console.log(`   ↻ Epic features capped after merge: ${merged.length} → ${hardCap} (base=${baseFeatures.length} + new=${finalFeatures.length - baseFeatures.length})`);
        }
        const descBefore = (workingEpic.description || '').slice(0, 100);
        workingEpic = {
          ...workingEpic,
          description:  bestDescription,
          features:     finalFeatures,
          dependencies: [...allDeps],
        };
        const descAfter = (workingEpic.description || '').slice(0, 100);
        console.log(`   ↻ Parallel merge applied — desc changed: ${descBefore !== descAfter}, features: ${finalFeatures.length} (base=${baseFeatures.length} + new=${newFeatureAdditions.length})`);
      }

      // 3. Re-validate all in parallel
      await this._detail(`   Re-validating ${roundCount} validator${roundCount !== 1 ? 's' : ''} in parallel (iter ${iter + 1})…`);
      const _t0Revalidate = Date.now();
      const revalidateResults = await Promise.all(
        needsWork.map(vi => {
          const validatorName = validators[vi];
          const role = this.extractDomain(validatorName);
          return this._withHeartbeat(
            () => this.runEpicValidator(workingEpic, epicContext, validatorName),
            (elapsed) => {
              if (elapsed < 20) return `   [${role}] re-reviewing…`;
              if (elapsed < 40) return `   [${role}] re-analyzing…`;
              return `   [${role}] re-validating…`;
            },
            10000
          ).then(result => ({ vi, result, error: null }))
            .catch(err => ({ vi, result: null, error: err }));
        })
      );
      console.log(`[TIMING] Phase 2 round ${iter} re-validates: ${Date.now() - _t0Revalidate}ms`);

      // 4. Update finalResults; determine which validators need another round
      const nextNeedsWork = [];
      for (const { vi, result, error } of revalidateResults) {
        const validatorName = validators[vi];
        const role = this.extractDomain(validatorName);
        if (error) {
          console.warn(`   ⚠ Re-validator ${validatorName} failed: ${error.message.split('\n')[0]}`);
          await this._detail(`   ⚠ Re-validate failed (${role}): ${error.message.split('\n')[0].slice(0, 120)}`);
          continue; // keep finalResults[vi] as-is; give up on this validator
        }
        finalResults[vi] = result;
        const newScore = result.overallScore ?? 0;
        const acceptable = newScore >= acceptanceThreshold;
        const issueStr2 = (result.issues || []).length > 0 ? ` · ${result.issues.length} issues` : '';
        await this._detail(`   [${role}] iter ${iter + 1}: ${newScore}/100${issueStr2} — ${acceptable ? '✓ accepted' : `⚠ below threshold (${acceptanceThreshold})`}`);
        console.log(`   [${vi + 1}/${validators.length}] ${validatorName} iter=${iter + 1} score=${newScore}/100 status=${result.validationStatus}`);
        if (!acceptable) {
          nextNeedsWork.push(vi);
        }
      }
      console.log(`[TIMING] Phase 2 round ${iter} total: ${Date.now() - _t0Round}ms — ${nextNeedsWork.length} still need work`);
      needsWork = nextNeedsWork;
    }

    const validationResults = finalResults;

    // Write accumulated improvements back to the original epic object
    // (sprint-planning-processor owns the reference; this mutates it in place)
    epic.description  = workingEpic.description;
    epic.features     = workingEpic.features;
    epic.dependencies = workingEpic.dependencies;

    // 3. Aggregate results
    const aggregated = this.aggregateValidationResults(validationResults, 'epic');

    // 4. Determine overall status
    aggregated.overallStatus = this.determineOverallStatus(validationResults);
    aggregated.readyToPublish = aggregated.overallStatus !== 'needs-improvement';

    await this._detail(`Overall: ${aggregated.readyToPublish ? '✓ passed' : '⚠ needs improvement'} · avg ${aggregated.averageScore}/100`);
    console.log(`   Epic "${epic.name}" summary: avg=${aggregated.averageScore}/100 readyToPublish=${aggregated.readyToPublish} critical=${aggregated.criticalIssues.length} major=${aggregated.majorIssues.length}`);
    aggregated.validatorResults.forEach(vr => {
      console.log(`     ${this.extractDomain(vr.validator)}: ${vr.score}/100 (${vr.status})`);
    });

    // 5. Store for feedback loop
    this.storeValidationFeedback(epic.id, aggregated);

    // 6. Persist result into epic metadata so sprint-planning-processor writes it to work.json
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
    // 1. Check cache for previously selected validators
    let validators;
    if (story.metadata?.selectedValidators) {
      validators = story.metadata.selectedValidators;
      console.log(`   Using cached validator selection (${validators.length} validators)`);
    } else {
      // Get applicable validators for this story
      const useContextualSelection = this.validationStageConfig?.useContextualSelection || false;
      if (useContextualSelection) {
        const selectionProvider = await this.getProviderForSelection();
        validators = await this.router.selectValidatorsWithContext(story, 'story', selectionProvider, epic);
      } else if (this.useSmartSelection) {
        validators = await this.router.getValidatorsForStoryWithLLM(story, epic);
      } else {
        validators = this.router.getValidatorsForStory(story, epic);
      }

      // Cache selection in metadata
      if (!story.metadata) {
        story.metadata = {};
      }
      story.metadata.selectedValidators = validators;
    }

    console.log(`\n🔍 Validating Story: ${story.name}`);
    console.log(`   Epic: ${epic.name} (${epic.domain})`);
    console.log(`   Validators (${validators.length}): ${validators.map(v => this.extractDomain(v)).join(', ')}\n`);

    // Read solver iteration settings
    const solverConfig = this.validationStageConfig?.solver || {};
    const maxIterations = solverConfig.maxIterations ?? 3;
    const acceptanceThreshold = solverConfig.acceptanceThreshold ?? 95;

    await this._detail(`${validators.length} validator${validators.length !== 1 ? 's' : ''}: ${validators.map(v => this.extractDomain(v)).join(', ')}`);

    // Working copy — accumulates improvements from solver runs
    let workingStory = { ...story };

    // ── Phase 1: run all validators in parallel on the initial snapshot ──────────
    await this._detail(`Running ${validators.length} validators in parallel…`);
    console.log(`   Running ${validators.length} validators in parallel…`);

    const _t0Parallel = Date.now();
    const parallelResults = await Promise.all(
      validators.map((validatorName, vi) => {
        const role = this.extractDomain(validatorName);
        return this._withHeartbeat(
          () => this.runStoryValidator(workingStory, storyContext, epic, validatorName),
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
      })
    );
    console.log(`[TIMING] story parallel batch (${validators.length} validators): ${Date.now() - _t0Parallel}ms`);

    // Log all parallel results
    for (let vi = 0; vi < validators.length; vi++) {
      const validatorName = validators[vi];
      const role = this.extractDomain(validatorName);
      const result = parallelResults[vi];
      const score = result.overallScore ?? 0;
      const allIssues = result.issues || [];
      const critCount = allIssues.filter(i => i.severity === 'critical').length;
      const majCount  = allIssues.filter(i => i.severity === 'major').length;
      const acceptable = score >= acceptanceThreshold;
      const issueStr = allIssues.length > 0 ? ` · ${allIssues.length} issue${allIssues.length !== 1 ? 's' : ''}` : '';
      await this._detail(`[${vi + 1}/${validators.length}] ${role}: ${score}/100${issueStr} — ${acceptable ? '✓' : '⚠ below threshold'}`);
      console.log(`   [${vi + 1}/${validators.length}] ${validatorName} score=${score}/100 status=${result.validationStatus} (critical=${critCount} major=${majCount} minor=${allIssues.length - critCount - majCount})`);
      allIssues.forEach(issue => {
        const cat = issue.category ? `[${issue.category}] ` : '';
        const sug = issue.suggestion ? ` → ${issue.suggestion}` : '';
        console.log(`     [${(issue.severity || 'unknown').toUpperCase()}] ${cat}${issue.description || '(no description)'}${sug}`);
      });
    }

    // ── Phase 2: parallel solver rounds ──────────────────────────────────────────
    const finalResults = [...parallelResults];

    // Indices of validators still below threshold
    let needsWork = validators.map((_, vi) => vi).filter(vi =>
      (parallelResults[vi].overallScore ?? 0) < acceptanceThreshold
    );
    if (needsWork.length > 0) {
      console.log(`   ${needsWork.length}/${validators.length} validators below threshold — running parallel solver rounds (max ${maxIterations - 1})`);
      await this._detail(`${needsWork.length} below threshold — parallel solver rounds`);
    }

    for (let iter = 1; iter < maxIterations && needsWork.length > 0; iter++) {
      const roundCount = needsWork.length;
      await this._detail(`   ↻ Round ${iter}/${maxIterations - 1}: ${roundCount} solver${roundCount !== 1 ? 's' : ''} in parallel…`);
      console.log(`   ↻ Round ${iter}/${maxIterations - 1}: ${roundCount} solver${roundCount !== 1 ? 's' : ''} running in parallel…`);
      const _t0Round = Date.now();

      // 1. Run all below-threshold solvers in parallel (all see the same workingStory snapshot)
      const solverResults = await Promise.all(
        needsWork.map(vi => {
          const validatorName = validators[vi];
          const role = this.extractDomain(validatorName);
          return this._withHeartbeat(
            () => this.runStorySolver(workingStory, storyContext, epic, finalResults[vi], validatorName),
            (elapsed) => {
              if (elapsed < 25) return `   ↻ ${role} solver — improving story…`;
              if (elapsed < 50) return `   ↻ ${role} solver — refining acceptance criteria…`;
              return `   ↻ ${role} solver — still running…`;
            },
            20000
          ).then(improved => ({ vi, improved, error: null }))
            .catch(err => ({ vi, improved: null, error: err }));
        })
      );
      console.log(`[TIMING] Phase 2 round ${iter} solvers: ${Date.now() - _t0Round}ms`);

      // 2. Merge all solver results — preserve base items, add up to 3 new items per solver
      // Base items are anchored (never dropped); each solver contributes at most 3 genuinely new AC.
      // Description taken from the solver whose validator scored lowest (most informed fix).
      const baseAC = workingStory.acceptance || [];
      const baseACSet = new Set(baseAC);
      const newACAdditions = []; // items new beyond base, insertion-ordered, deduplicated
      const allDeps = new Set(workingStory.dependencies || []);
      let bestDescription = workingStory.description;
      let worstValidatorScore = Infinity;
      let anyImproved = false;

      for (const { vi, improved, error } of solverResults) {
        const validatorName = validators[vi];
        const role = this.extractDomain(validatorName);
        if (error) {
          console.warn(`   ⚠ Solver failed for ${validatorName}: ${error.message} — keeping current story`);
          await this._detail(`   ⚠ Solver failed (${role}): ${error.message.split('\n')[0].slice(0, 120)}`);
          continue;
        }
        if (improved && improved.id === workingStory.id) {
          anyImproved = true;
          // Collect only new items not already in base or pending additions (max 3 per solver)
          const existingAll = new Set([...baseACSet, ...newACAdditions]);
          const solverNew = (improved.acceptance || []).filter(a => !existingAll.has(a)).slice(0, 3);
          newACAdditions.push(...solverNew);
          (improved.dependencies || []).forEach(d => allDeps.add(d));
          // Description: take from the validator with the lowest score (most dissatisfied perspective)
          const vScore = finalResults[vi]?.overallScore ?? 100;
          if (improved.description && improved.description !== workingStory.description && vScore < worstValidatorScore) {
            worstValidatorScore = vScore;
            bestDescription = improved.description;
          }
          console.log(`   ↻ [${role}] solver merged — ${solverNew.length} new AC added`);
          await this._detail(`   → [${role}] improvements applied`);
        } else {
          console.log(`   ↻ [${role}] solver returned no valid improvement (id mismatch or empty)`);
        }
      }

      if (anyImproved) {
        // Base items always preserved first; cap only the additions portion
        const merged = [...baseAC, ...newACAdditions];
        const hardCap = baseAC.length + 10; // allow up to 10 new AC beyond original
        const finalAC = merged.length > hardCap ? merged.slice(0, hardCap) : merged;
        if (merged.length > hardCap) {
          console.log(`   ↻ Story AC capped after merge: ${merged.length} → ${hardCap} (base=${baseAC.length} + new=${finalAC.length - baseAC.length})`);
        }
        const descBefore = (workingStory.description || '').slice(0, 100);
        workingStory = {
          ...workingStory,
          description:  bestDescription,
          acceptance:   finalAC,
          dependencies: [...allDeps],
        };
        const descAfter = (workingStory.description || '').slice(0, 100);
        console.log(`   ↻ Parallel merge applied — desc changed: ${descBefore !== descAfter}, AC: ${finalAC.length} (base=${baseAC.length} + new=${newACAdditions.length})`);
      }

      // 3. Re-validate all in parallel
      await this._detail(`   Re-validating ${roundCount} validator${roundCount !== 1 ? 's' : ''} in parallel (iter ${iter + 1})…`);
      const _t0Revalidate = Date.now();
      const revalidateResults = await Promise.all(
        needsWork.map(vi => {
          const validatorName = validators[vi];
          const role = this.extractDomain(validatorName);
          return this._withHeartbeat(
            () => this.runStoryValidator(workingStory, storyContext, epic, validatorName),
            (elapsed) => {
              if (elapsed < 20) return `   [${role}] re-reviewing story…`;
              if (elapsed < 40) return `   [${role}] re-checking acceptance criteria…`;
              return `   [${role}] re-validating…`;
            },
            10000
          ).then(result => ({ vi, result, error: null }))
            .catch(err => ({ vi, result: null, error: err }));
        })
      );
      console.log(`[TIMING] Phase 2 round ${iter} re-validates: ${Date.now() - _t0Revalidate}ms`);

      // 4. Update finalResults; determine which validators need another round
      const nextNeedsWork = [];
      for (const { vi, result, error } of revalidateResults) {
        const validatorName = validators[vi];
        const role = this.extractDomain(validatorName);
        if (error) {
          console.warn(`   ⚠ Re-validator ${validatorName} failed: ${error.message.split('\n')[0]}`);
          await this._detail(`   ⚠ Re-validate failed (${role}): ${error.message.split('\n')[0].slice(0, 120)}`);
          continue; // keep finalResults[vi] as-is; give up on this validator
        }
        finalResults[vi] = result;
        const newScore = result.overallScore ?? 0;
        const acceptable = newScore >= acceptanceThreshold;
        const issueStr2 = (result.issues || []).length > 0 ? ` · ${result.issues.length} issues` : '';
        await this._detail(`   [${role}] iter ${iter + 1}: ${newScore}/100${issueStr2} — ${acceptable ? '✓ accepted' : `⚠ below threshold (${acceptanceThreshold})`}`);
        console.log(`   [${vi + 1}/${validators.length}] ${validatorName} iter=${iter + 1} score=${newScore}/100 status=${result.validationStatus}`);
        if (!acceptable) {
          nextNeedsWork.push(vi);
        }
      }
      console.log(`[TIMING] Phase 2 round ${iter} total: ${Date.now() - _t0Round}ms — ${nextNeedsWork.length} still need work`);
      needsWork = nextNeedsWork;
    }

    const validationResults = finalResults;

    // Write accumulated improvements back to the original story object
    story.description  = workingStory.description;
    story.acceptance   = workingStory.acceptance;
    story.dependencies = workingStory.dependencies;

    // 3. Aggregate results
    const aggregated = this.aggregateValidationResults(validationResults, 'story');

    // 4. Determine overall status
    aggregated.overallStatus = this.determineOverallStatus(validationResults);
    aggregated.readyToPublish = aggregated.overallStatus !== 'needs-improvement';

    await this._detail(`Overall: ${aggregated.readyToPublish ? '✓ passed' : '⚠ needs improvement'} · avg ${aggregated.averageScore}/100`);
    console.log(`   Story "${story.name}" summary: avg=${aggregated.averageScore}/100 readyToPublish=${aggregated.readyToPublish} critical=${aggregated.criticalIssues.length} major=${aggregated.majorIssues.length}`);
    aggregated.validatorResults.forEach(vr => {
      console.log(`     ${this.extractDomain(vr.validator)}: ${vr.score}/100 (${vr.status})`);
    });

    // 5. Store for feedback loop
    this.storeValidationFeedback(story.id, aggregated);

    // 6. Persist result into story metadata so sprint-planning-processor writes it to work.json
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
   * Build solver prompt for an Epic
   * @private
   */
  buildEpicSolverPrompt(epic, epicContext, validationResult, validatorName) {
    const allIssues = validationResult.issues || [];
    const critMajor = allIssues.filter(i => i.severity === 'critical' || i.severity === 'major');
    // When no critical/major issues exist, include minor issues so the solver has specific guidance
    const issues = critMajor.length > 0 ? critMajor : allIssues;

    const role = this.extractDomain(validatorName);

    const issueText = issues.map((issue, i) =>
      `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description}\n   Fix: ${issue.suggestion}`
    ).join('\n');

    return `# Epic to Improve

**Epic ID:** ${epic.id}
**Epic Name:** ${epic.name}
**Domain:** ${epic.domain}
**Current Description:** ${epic.description}

**Current Features:**
${(epic.features || []).map(f => `- ${f}`).join('\n')}

**Current Dependencies:**
${(epic.dependencies || []).length > 0 ? epic.dependencies.join(', ') : 'None'}

**Epic Context:**
\`\`\`
${epicContext}
\`\`\`

## Issues to Fix (from ${role} review):

${issueText || 'No critical/major issues — improve overall quality.'}

Improve this Epic to address the issues above. Return the complete improved Epic JSON.

**IMPORTANT CONSTRAINTS:**
- Do NOT remove or consolidate existing features — only add new ones to address the issues above.
- Each feature must be a single concise sentence (max 30 words). Do not expand them into paragraphs.
`;
  }

  /**
   * Build solver prompt for a Story
   * @private
   */
  buildStorySolverPrompt(story, storyContext, epic, validationResult, validatorName) {
    const allIssues = validationResult.issues || [];
    const critMajor = allIssues.filter(i => i.severity === 'critical' || i.severity === 'major');
    // When no critical/major issues exist, include minor issues so the solver has specific guidance
    const issues = critMajor.length > 0 ? critMajor : allIssues;

    const role = this.extractDomain(validatorName);

    const issueText = issues.map((issue, i) =>
      `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description}\n   Fix: ${issue.suggestion}`
    ).join('\n');

    return `# Story to Improve

**Story ID:** ${story.id}
**Story Name:** ${story.name}
**User Type:** ${story.userType}
**Current Description:** ${story.description}

**Current Acceptance Criteria:**
${(story.acceptance || []).map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

**Current Dependencies:**
${(story.dependencies || []).length > 0 ? story.dependencies.join(', ') : 'None'}

**Parent Epic:**
- Name: ${epic.name}
- Domain: ${epic.domain}
- Features: ${(epic.features || []).join(', ')}

**Story Context:**
\`\`\`
${storyContext}
\`\`\`

## Issues to Fix (from ${role} review):

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
   * Build validation prompt for Epic
   * @private
   */
  buildEpicValidationPrompt(epic, epicContext) {
    return `# Epic to Validate

**Epic ID:** ${epic.id}
**Epic Name:** ${epic.name}
**Domain:** ${epic.domain}
**Description:** ${epic.description}

**Features:**
${(epic.features || []).map(f => `- ${f}`).join('\n')}

**Dependencies:**
${(epic.dependencies || []).length > 0 ? epic.dependencies.join(', ') : 'None'}

**Stories:**
${(epic.children || []).length} stories defined

**Epic Context:**
\`\`\`
${epicContext}
\`\`\`

Validate this Epic from your domain expertise perspective and return JSON validation results following the specified format.
`;
  }

  /**
   * Build validation prompt for Story
   * @private
   */
  buildStoryValidationPrompt(story, storyContext, epic) {
    return `# Story to Validate

**Story ID:** ${story.id}
**Story Name:** ${story.name}
**User Type:** ${story.userType}
**Description:** ${story.description}

**Acceptance Criteria:**
${(story.acceptance || []).map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

**Dependencies:**
${(story.dependencies || []).length > 0 ? story.dependencies.join(', ') : 'None'}

**Parent Epic:**
- Name: ${epic.name}
- Domain: ${epic.domain}
- Features: ${(epic.features || []).join(', ')}

**Story Context:**
\`\`\`
${storyContext}
\`\`\`

Validate this Story from your domain expertise perspective and return JSON validation results following the specified format.
`;
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
