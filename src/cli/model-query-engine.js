/**
 * Model Query Engine
 * Orchestrates multi-provider LLM queries for model selection evaluation
 *
 * Queries all available providers (Claude, OpenAI, Gemini) in parallel
 * for each evaluation prompt to collect model recommendations.
 */

import { LLMProvider } from './llm-provider.js';

/**
 * Model configurations for querying
 * Using each provider's most capable model for best recommendations
 */
const QUERY_MODELS = {
  claude: 'claude-opus-4-6',           // Most capable Claude model
  openai: 'gpt-5.2-chat-latest',       // Most capable OpenAI model
  gemini: 'gemini-2.5-pro'             // Most capable Gemini model
};

/**
 * Debug logging helper
 */
function debug(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[DEBUG][${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[DEBUG][${timestamp}] ${message}`);
  }
}

export class ModelQueryEngine {
  constructor() {
    this.providers = {};
    this.results = [];
    this.errors = [];
    this.totalExecutionTime = 0;
  }

  /**
   * Initialize LLM providers
   * Only creates providers for which API keys are available
   * @returns {Promise<Object>} Object with provider names and initialization status
   */
  async initializeProviders() {
    debug('Initializing LLM providers...');

    const availableProviders = {};
    const errors = [];

    // Attempt to create each provider
    for (const [providerName, model] of Object.entries(QUERY_MODELS)) {
      try {
        debug(`Initializing ${providerName} with model ${model}`);
        const provider = await LLMProvider.create(providerName, model);

        // Validate API key
        const validation = await provider.validateApiKey();
        if (validation.valid) {
          this.providers[providerName] = provider;
          availableProviders[providerName] = { status: 'ready', model };
          debug(`${providerName} initialized successfully`);
        } else {
          errors.push({
            provider: providerName,
            error: validation.error || 'API key validation failed',
            code: validation.code
          });
          availableProviders[providerName] = {
            status: 'error',
            error: validation.error || 'API key validation failed'
          };
          debug(`${providerName} validation failed:`, validation.error);
        }
      } catch (error) {
        errors.push({
          provider: providerName,
          error: error.message,
          details: error.stack
        });
        availableProviders[providerName] = {
          status: 'error',
          error: error.message
        };
        debug(`${providerName} initialization failed:`, error.message);
      }
    }

    const readyCount = Object.values(availableProviders).filter(p => p.status === 'ready').length;
    debug(`Initialization complete: ${readyCount}/${Object.keys(QUERY_MODELS).length} providers ready`);

    if (readyCount === 0) {
      throw new Error('No LLM providers available. Check API keys in .env file.');
    }

    return {
      available: availableProviders,
      errors: errors.length > 0 ? errors : null,
      readyCount
    };
  }

  /**
   * Query a single provider with an evaluation prompt
   * @param {string} providerName - Provider name (claude, openai, gemini)
   * @param {Object} evaluationPrompt - Evaluation prompt object
   * @returns {Promise<Object>} Normalized response with model recommendation
   */
  async queryProvider(providerName, evaluationPrompt) {
    const startTime = Date.now();

    try {
      debug(`Querying ${providerName} for ${evaluationPrompt.id}...`);

      const provider = this.providers[providerName];
      if (!provider) {
        throw new Error(`Provider ${providerName} not initialized`);
      }

      // Query the provider with the evaluation prompt
      const response = await provider.generateText(
        evaluationPrompt.prompt,
        `You are an expert in LLM model selection. Analyze the task requirements and recommend the best model from your provider's lineup for this specific use case.

Consider:
1. Which of your models best matches the output quality requirements?
2. Which model provides the best balance of capability and cost for this task?
3. What are the specific strengths of your recommended model for this task?

Provide your response in the following format:

RECOMMENDED MODEL: [model name]

REASONING:
[2-3 sentences explaining why this model is optimal for this task]

CONFIDENCE: [High/Medium/Low]

ALTERNATIVES:
[Optional: Mention any alternative models if appropriate]`
      );

      const endTime = Date.now();
      const responseTime = (endTime - startTime) / 1000; // seconds

      // Get token usage
      const tokenUsage = provider.getTokenUsage();

      // Normalize the response
      const normalized = this._normalizeResponse(providerName, response, tokenUsage, responseTime);

      debug(`${providerName} query complete for ${evaluationPrompt.id}`, {
        model: normalized.model,
        tokens: normalized.tokens,
        cost: normalized.cost,
        responseTime: normalized.responseTime
      });

      return normalized;
    } catch (error) {
      const endTime = Date.now();
      const responseTime = (endTime - startTime) / 1000;

      debug(`${providerName} query failed for ${evaluationPrompt.id}:`, error.message);

      return {
        provider: providerName,
        status: 'error',
        error: error.message,
        errorCode: error.status || error.code,
        responseTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Normalize provider response to common format
   * Extracts model recommendation, reasoning, and confidence from response text
   * @param {string} providerName - Provider name
   * @param {string} responseText - Raw response text from provider
   * @param {Object} tokenUsage - Token usage from provider
   * @param {number} responseTime - Response time in seconds
   * @returns {Object} Normalized response object
   */
  _normalizeResponse(providerName, responseText, tokenUsage, responseTime) {
    // Extract model name (look for "RECOMMENDED MODEL:" line)
    let model = 'Unknown';
    const modelMatch = responseText.match(/RECOMMENDED MODEL:\s*(.+)/i);
    if (modelMatch) {
      model = modelMatch[1].trim();
    } else {
      // Fallback: try to extract model name from first line or prominent text
      const firstLine = responseText.split('\n')[0].trim();
      if (firstLine.length < 100) {
        model = firstLine;
      }
    }

    // Extract reasoning (look for "REASONING:" section)
    let reasoning = '';
    const reasoningMatch = responseText.match(/REASONING:\s*(.+?)(?=\n\nCONFIDENCE:|$)/is);
    if (reasoningMatch) {
      reasoning = reasoningMatch[1].trim();
    } else {
      // Fallback: use full response if structure not found
      reasoning = responseText.substring(0, 500).trim() + (responseText.length > 500 ? '...' : '');
    }

    // Extract confidence (look for "CONFIDENCE:" line)
    let confidence = 'Unknown';
    const confidenceMatch = responseText.match(/CONFIDENCE:\s*(.+)/i);
    if (confidenceMatch) {
      const conf = confidenceMatch[1].trim().toLowerCase();
      if (conf.includes('high')) confidence = 'High';
      else if (conf.includes('medium')) confidence = 'Medium';
      else if (conf.includes('low')) confidence = 'Low';
    }

    return {
      provider: providerName,
      status: 'success',
      model,
      reasoning,
      confidence,
      tokens: {
        input: tokenUsage.inputTokens || 0,
        output: tokenUsage.outputTokens || 0,
        total: tokenUsage.totalTokens || 0
      },
      cost: tokenUsage.estimatedCost || 0,
      responseTime,
      rawResponse: responseText,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Query all providers for a single evaluation prompt
   * Executes provider queries in parallel for efficiency
   * @param {Object} evaluationPrompt - Evaluation prompt object
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Object>} Results from all providers
   */
  async queryAllProvidersForPrompt(evaluationPrompt, progressCallback = null) {
    debug(`Querying all providers for prompt: ${evaluationPrompt.id}`);

    const startTime = Date.now();

    // Get list of available providers
    const providerNames = Object.keys(this.providers);

    if (providerNames.length === 0) {
      throw new Error('No providers available for querying');
    }

    // Query all providers in parallel
    const promises = providerNames.map(providerName =>
      this.queryProvider(providerName, evaluationPrompt)
    );

    // Wait for all queries to complete
    const results = await Promise.all(promises);

    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;

    // Aggregate results
    const recommendations = {};
    const errors = [];

    for (const result of results) {
      if (result.status === 'success') {
        recommendations[result.provider] = result;
      } else {
        errors.push({
          provider: result.provider,
          error: result.error,
          errorCode: result.errorCode,
          timestamp: result.timestamp
        });
      }
    }

    // Count successful queries
    const successCount = Object.keys(recommendations).length;
    const failureCount = errors.length;

    debug(`Query complete for ${evaluationPrompt.id}: ${successCount} success, ${failureCount} failed`);

    // Call progress callback if provided
    if (progressCallback) {
      progressCallback({
        promptId: evaluationPrompt.id,
        successCount,
        failureCount,
        totalTime
      });
    }

    return {
      promptId: evaluationPrompt.id,
      ceremony: evaluationPrompt.ceremony,
      stage: evaluationPrompt.stage,
      stageName: evaluationPrompt.stageName,
      recommendations,
      errors: errors.length > 0 ? errors : null,
      executionTime: totalTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Query all providers for all evaluation prompts
   * Processes prompts sequentially but providers in parallel
   * @param {Array} evaluationPrompts - Array of evaluation prompt objects
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Object>} Complete evaluation results
   */
  async evaluateAll(evaluationPrompts, progressCallback = null) {
    debug(`Starting evaluation of ${evaluationPrompts.length} prompts`);

    const overallStartTime = Date.now();
    this.results = [];
    this.errors = [];

    // Process each prompt sequentially (but providers in parallel per prompt)
    for (let i = 0; i < evaluationPrompts.length; i++) {
      const prompt = evaluationPrompts[i];

      if (progressCallback) {
        progressCallback({
          type: 'prompt-start',
          current: i + 1,
          total: evaluationPrompts.length,
          promptId: prompt.id,
          ceremony: prompt.ceremony,
          stage: prompt.stage
        });
      }

      try {
        const result = await this.queryAllProvidersForPrompt(
          prompt,
          (queryProgress) => {
            if (progressCallback) {
              progressCallback({
                type: 'prompt-complete',
                current: i + 1,
                total: evaluationPrompts.length,
                ...queryProgress
              });
            }
          }
        );

        this.results.push(result);

        // Track errors
        if (result.errors) {
          this.errors.push(...result.errors);
        }
      } catch (error) {
        debug(`Failed to evaluate prompt ${prompt.id}:`, error.message);

        this.errors.push({
          promptId: prompt.id,
          error: error.message,
          details: error.stack,
          timestamp: new Date().toISOString()
        });

        // Still add a partial result
        this.results.push({
          promptId: prompt.id,
          ceremony: prompt.ceremony,
          stage: prompt.stage,
          stageName: prompt.stageName,
          recommendations: {},
          errors: [{ error: error.message }],
          executionTime: 0,
          timestamp: new Date().toISOString()
        });
      }
    }

    const overallEndTime = Date.now();
    this.totalExecutionTime = (overallEndTime - overallStartTime) / 1000;

    debug(`Evaluation complete: ${this.results.length} prompts processed in ${this.totalExecutionTime}s`);

    // Generate summary
    return this._generateSummary();
  }

  /**
   * Generate summary of evaluation results
   * @returns {Object} Summary with statistics and aggregated results
   */
  _generateSummary() {
    const totalPrompts = this.results.length;
    const totalQueries = this.results.reduce((sum, r) =>
      sum + Object.keys(r.recommendations).length, 0
    );
    const failedQueries = this.errors.length;

    // Calculate total cost per provider
    const costByProvider = {};
    for (const result of this.results) {
      for (const [provider, rec] of Object.entries(result.recommendations)) {
        if (!costByProvider[provider]) {
          costByProvider[provider] = 0;
        }
        costByProvider[provider] += rec.cost || 0;
      }
    }

    const totalCost = Object.values(costByProvider).reduce((sum, cost) => sum + cost, 0);

    // Format execution time
    const minutes = Math.floor(this.totalExecutionTime / 60);
    const seconds = Math.floor(this.totalExecutionTime % 60);
    const executionTimeFormatted = `${minutes}m ${seconds}s`;

    return {
      executedAt: new Date().toISOString(),
      models: QUERY_MODELS,
      evaluations: this.results,
      summary: {
        totalPrompts,
        successfulQueries: totalQueries,
        failedQueries,
        totalCost: {
          ...costByProvider,
          total: totalCost
        },
        executionTime: executionTimeFormatted,
        executionTimeSeconds: this.totalExecutionTime
      },
      errors: this.errors.length > 0 ? this.errors : null
    };
  }

  /**
   * Get current results
   * @returns {Array} Array of evaluation results
   */
  getResults() {
    return this.results;
  }

  /**
   * Get current errors
   * @returns {Array} Array of error objects
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Get summary statistics
   * @returns {Object} Summary statistics
   */
  getSummary() {
    return this._generateSummary();
  }
}
