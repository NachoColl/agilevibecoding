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
        );
      })
    );

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

    // ── Phase 2: solver + re-validate for each below-threshold validator ──────────
    const finalResults = [...parallelResults];

    for (let vi = 0; vi < validators.length; vi++) {
      const validatorName = validators[vi];
      const role = this.extractDomain(validatorName);
      let lastResult = parallelResults[vi];

      if ((lastResult.overallScore ?? 0) >= acceptanceThreshold) continue;

      for (let iter = 1; iter < maxIterations; iter++) {
        await this._detail(`   ↻ Running ${role} solver…`);
        console.log(`   ↻ [${validatorName}] below threshold — running solver (iter ${iter}/${maxIterations})...`);
        const descBefore    = (workingEpic.description || '').slice(0, 100);
        const featuresBefore = (workingEpic.features || []).join(' | ').slice(0, 100);
        try {
          const improved = await this._withHeartbeat(
            () => this.runEpicSolver(workingEpic, epicContext, lastResult, validatorName),
            (elapsed) => {
              if (elapsed < 25) return `   ↻ ${role} solver — applying improvements…`;
              if (elapsed < 50) return `   ↻ ${role} solver — refining epic quality…`;
              return `   ↻ ${role} solver — still running…`;
            },
            20000
          );
          if (improved && improved.id === workingEpic.id) {
            workingEpic = {
              ...workingEpic,
              description:  improved.description  ?? workingEpic.description,
              features:     improved.features     ?? workingEpic.features,
              dependencies: improved.dependencies ?? workingEpic.dependencies,
            };
            const descAfter     = (workingEpic.description || '').slice(0, 100);
            const featuresAfter = (workingEpic.features || []).join(' | ').slice(0, 100);
            console.log(`   ↻ Solver applied — desc changed: ${descBefore !== descAfter}, features changed: ${featuresBefore !== featuresAfter}`);
            if (descBefore !== descAfter) {
              console.log(`     before: ${descBefore}`);
              console.log(`     after:  ${descAfter}`);
            }
            await this._detail(`   → Improvements applied`);
          } else {
            console.log(`   ↻ Solver returned no valid improvement (id mismatch or empty)`);
          }
        } catch (err) {
          console.warn(`   ⚠ Solver failed for ${validatorName}: ${err.message} — keeping current epic`);
          await this._detail(`   ⚠ Solver failed: ${err.message}`);
          break;
        }

        // Re-validate after solver
        await this._detail(`   [${vi + 1}/${validators.length}] ${role} — re-validating (iter ${iter + 1})…`);
        lastResult = await this._withHeartbeat(
          () => this.runEpicValidator(workingEpic, epicContext, validatorName),
          (elapsed) => {
            if (elapsed < 20) return `   [${role}] re-reviewing…`;
            if (elapsed < 40) return `   [${role}] re-analyzing…`;
            return `   [${role}] re-validating…`;
          },
          10000
        );
        const newScore   = lastResult.overallScore ?? 0;
        const acceptable = newScore >= acceptanceThreshold;
        const issueStr2  = (lastResult.issues || []).length > 0 ? ` · ${lastResult.issues.length} issues` : '';
        await this._detail(`   Score: ${newScore}/100${issueStr2} — ${acceptable ? '✓ accepted' : `⚠ below threshold (${acceptanceThreshold})`}`);
        console.log(`   [${vi + 1}/${validators.length}] ${validatorName} iter=${iter + 1} score=${newScore}/100 status=${lastResult.validationStatus}`);
        if (acceptable) break;
      }

      finalResults[vi] = lastResult;
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
        );
      })
    );

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

    // ── Phase 2: solver + re-validate for each below-threshold validator ──────────
    const finalResults = [...parallelResults];

    for (let vi = 0; vi < validators.length; vi++) {
      const validatorName = validators[vi];
      const role = this.extractDomain(validatorName);
      let lastResult = parallelResults[vi];

      if ((lastResult.overallScore ?? 0) >= acceptanceThreshold) continue;

      for (let iter = 1; iter < maxIterations; iter++) {
        await this._detail(`   ↻ Running ${role} solver…`);
        console.log(`   ↻ [${validatorName}] below threshold — running solver (iter ${iter}/${maxIterations})...`);
        const descBefore = (workingStory.description || '').slice(0, 100);
        const acBefore   = (workingStory.acceptance || []).join(' | ').slice(0, 100);
        try {
          const improved = await this._withHeartbeat(
            () => this.runStorySolver(workingStory, storyContext, epic, lastResult, validatorName),
            (elapsed) => {
              if (elapsed < 25) return `   ↻ ${role} solver — improving story…`;
              if (elapsed < 50) return `   ↻ ${role} solver — refining acceptance criteria…`;
              return `   ↻ ${role} solver — still running…`;
            },
            20000
          );
          if (improved && improved.id === workingStory.id) {
            workingStory = {
              ...workingStory,
              description:  improved.description  ?? workingStory.description,
              acceptance:   improved.acceptance   ?? workingStory.acceptance,
              dependencies: improved.dependencies ?? workingStory.dependencies,
            };
            const descAfter = (workingStory.description || '').slice(0, 100);
            const acAfter   = (workingStory.acceptance || []).join(' | ').slice(0, 100);
            console.log(`   ↻ Solver applied — desc changed: ${descBefore !== descAfter}, ac changed: ${acBefore !== acAfter}`);
            if (descBefore !== descAfter) {
              console.log(`     before: ${descBefore}`);
              console.log(`     after:  ${descAfter}`);
            }
            await this._detail(`   → Improvements applied`);
          } else {
            console.log(`   ↻ Solver returned no valid improvement (id mismatch or empty)`);
          }
        } catch (err) {
          console.warn(`   ⚠ Solver failed for ${validatorName}: ${err.message} — keeping current story`);
          await this._detail(`   ⚠ Solver failed: ${err.message}`);
          break;
        }

        // Re-validate after solver
        await this._detail(`   [${vi + 1}/${validators.length}] ${role} — re-validating (iter ${iter + 1})…`);
        lastResult = await this._withHeartbeat(
          () => this.runStoryValidator(workingStory, storyContext, epic, validatorName),
          (elapsed) => {
            if (elapsed < 20) return `   [${role}] re-reviewing story…`;
            if (elapsed < 40) return `   [${role}] re-checking acceptance criteria…`;
            return `   [${role}] re-validating…`;
          },
          10000
        );
        const newScore   = lastResult.overallScore ?? 0;
        const acceptable = newScore >= acceptanceThreshold;
        const issueStr2  = (lastResult.issues || []).length > 0 ? ` · ${lastResult.issues.length} issues` : '';
        await this._detail(`   Score: ${newScore}/100${issueStr2} — ${acceptable ? '✓ accepted' : `⚠ below threshold (${acceptanceThreshold})`}`);
        console.log(`   [${vi + 1}/${validators.length}] ${validatorName} iter=${iter + 1} score=${newScore}/100 status=${lastResult.validationStatus}`);
        if (acceptable) break;
      }

      finalResults[vi] = lastResult;
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
    const rawResult = await provider.generateJSON(prompt, agentInstructions);

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
    const rawResult = await provider.generateJSON(prompt, agentInstructions);

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

    const improved = await provider.generateJSON(prompt, agentInstructions);

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

    const improved = await provider.generateJSON(prompt, agentInstructions);

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
