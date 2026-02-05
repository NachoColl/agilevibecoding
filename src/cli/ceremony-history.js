/**
 * Ceremony History Tracker - Records all ceremony executions with status and metadata
 *
 * Tracks when ceremonies are run, their outcomes, and preserves historical data.
 * Helps detect abrupt terminations and provides audit trail.
 */

import fs from 'fs';
import path from 'path';

export class CeremonyHistory {
  constructor(avcPath = path.join(process.cwd(), '.avc')) {
    this.avcPath = avcPath;
    this.historyPath = path.join(avcPath, 'ceremonies-history.json');
    this.data = null;
  }

  /**
   * Initialize ceremony history file if it doesn't exist
   */
  init() {
    // Ensure .avc directory exists
    if (!fs.existsSync(this.avcPath)) {
      fs.mkdirSync(this.avcPath, { recursive: true });
    }

    if (!fs.existsSync(this.historyPath)) {
      const initialData = {
        version: "1.0",
        lastUpdated: new Date().toISOString(),
        ceremonies: {}
      };
      this._writeData(initialData);
    }
  }

  /**
   * Load ceremony history from disk
   */
  load() {
    if (fs.existsSync(this.historyPath)) {
      this.data = JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
    } else {
      this.init();
      this.data = JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
    }
    return this.data;
  }

  /**
   * Write data to disk atomically
   */
  _writeData(data) {
    try {
      const tempPath = this.historyPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempPath, this.historyPath);
    } catch (error) {
      // Fallback to direct write if atomic write fails
      try {
        fs.writeFileSync(this.historyPath, JSON.stringify(data, null, 2), 'utf8');
      } catch (fallbackError) {
        console.error(`Failed to write ceremony history: ${fallbackError.message}`);
        console.error(`Path: ${this.historyPath}`);
        throw fallbackError;
      }
    }
  }

  /**
   * Start a new ceremony execution
   * @param {string} ceremonyName - e.g., 'sponsor-call'
   * @param {string} stage - Initial stage (default: 'questionnaire')
   * @returns {string} Execution ID
   */
  startExecution(ceremonyName, stage = 'questionnaire') {
    this.load();

    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '-')
      .replace(/:/g, '-')
      .replace(/\..+/, '');

    const executionId = `${ceremonyName}-${timestamp}`;

    // Initialize ceremony entry if doesn't exist
    if (!this.data.ceremonies[ceremonyName]) {
      this.data.ceremonies[ceremonyName] = {
        executions: [],
        totalExecutions: 0,
        lastRun: null,
        lastSuccess: null
      };
    }

    // Create execution record
    const execution = {
      id: executionId,
      startTime: now.toISOString(),
      endTime: null,
      status: 'in-progress',
      stage: stage,
      answers: null,
      filesGenerated: [],
      tokenUsage: null,
      duration: null,
      outcome: null
    };

    // Add to executions array
    this.data.ceremonies[ceremonyName].executions.push(execution);
    this.data.ceremonies[ceremonyName].lastRun = now.toISOString();
    this.data.lastUpdated = now.toISOString();

    this._writeData(this.data);

    return executionId;
  }

  /**
   * Update an existing execution
   * @param {string} ceremonyName - Ceremony name
   * @param {string} executionId - Execution ID
   * @param {Object} updates - Fields to update
   */
  updateExecution(ceremonyName, executionId, updates) {
    this.load();

    if (!this.data.ceremonies[ceremonyName]) {
      throw new Error(`Ceremony '${ceremonyName}' not found in history`);
    }

    const execution = this.data.ceremonies[ceremonyName].executions.find(
      e => e.id === executionId
    );

    if (!execution) {
      throw new Error(`Execution '${executionId}' not found for ceremony '${ceremonyName}'`);
    }

    // Update fields
    Object.assign(execution, updates);
    this.data.lastUpdated = new Date().toISOString();

    this._writeData(this.data);
  }

  /**
   * Complete an execution
   * @param {string} ceremonyName - Ceremony name
   * @param {string} executionId - Execution ID
   * @param {string} outcome - 'success', 'user-cancelled', or 'abrupt-termination'
   * @param {Object} metadata - Additional data (answers, filesGenerated, tokenUsage, etc.)
   */
  completeExecution(ceremonyName, executionId, outcome, metadata = {}) {
    this.load();

    if (!this.data.ceremonies[ceremonyName]) {
      throw new Error(`Ceremony '${ceremonyName}' not found in history`);
    }

    const execution = this.data.ceremonies[ceremonyName].executions.find(
      e => e.id === executionId
    );

    if (!execution) {
      throw new Error(`Execution '${executionId}' not found for ceremony '${ceremonyName}'`);
    }

    const now = new Date();
    const startTime = new Date(execution.startTime);
    const duration = now - startTime;

    // Determine status based on outcome
    let status;
    switch (outcome) {
      case 'success':
        status = 'completed';
        break;
      case 'user-cancelled':
        status = 'cancelled';
        break;
      case 'abrupt-termination':
        status = 'aborted';
        break;
      default:
        status = 'completed';
    }

    // Update execution
    execution.status = status;
    execution.endTime = now.toISOString();
    execution.outcome = outcome;
    execution.duration = duration;

    // Merge metadata
    if (metadata.answers) execution.answers = metadata.answers;
    if (metadata.filesGenerated) execution.filesGenerated = metadata.filesGenerated;
    if (metadata.tokenUsage) execution.tokenUsage = metadata.tokenUsage;
    if (metadata.cost) execution.cost = metadata.cost;
    if (metadata.model) execution.model = metadata.model;
    if (metadata.stage) execution.stage = metadata.stage;
    if (metadata.error) execution.error = metadata.error;
    if (metadata.note) execution.note = metadata.note;

    // Update ceremony totals
    this.data.ceremonies[ceremonyName].totalExecutions =
      this.data.ceremonies[ceremonyName].executions.length;

    if (outcome === 'success') {
      this.data.ceremonies[ceremonyName].lastSuccess = now.toISOString();
    }

    this.data.lastUpdated = now.toISOString();

    this._writeData(this.data);
  }

  /**
   * Archive answers to an execution (before LLM generation starts)
   * @param {string} ceremonyName - Ceremony name
   * @param {string} executionId - Execution ID
   * @param {Object} answers - Questionnaire answers
   */
  archiveAnswers(ceremonyName, executionId, answers) {
    this.updateExecution(ceremonyName, executionId, {
      answers: { ...answers }
    });
  }

  /**
   * Get the most recent execution for a ceremony
   * @param {string} ceremonyName - Ceremony name
   * @returns {Object|null} Execution record or null
   */
  getLastExecution(ceremonyName) {
    this.load();

    if (!this.data.ceremonies[ceremonyName]) {
      return null;
    }

    const executions = this.data.ceremonies[ceremonyName].executions;
    if (executions.length === 0) {
      return null;
    }

    // Return most recent (last in array)
    return executions[executions.length - 1];
  }

  /**
   * Get a specific execution by ID
   * @param {string} ceremonyName - Ceremony name
   * @param {string} executionId - Execution ID
   * @returns {Object|null} Execution record or null
   */
  getExecutionById(ceremonyName, executionId) {
    this.load();

    if (!this.data.ceremonies[ceremonyName]) {
      return null;
    }

    return this.data.ceremonies[ceremonyName].executions.find(
      e => e.id === executionId
    ) || null;
  }

  /**
   * Get all executions for a ceremony
   * @param {string} ceremonyName - Ceremony name
   * @returns {Array} Array of execution records (newest first)
   */
  getAllExecutions(ceremonyName) {
    this.load();

    if (!this.data.ceremonies[ceremonyName]) {
      return [];
    }

    // Return copy, sorted by startTime descending
    return [...this.data.ceremonies[ceremonyName].executions]
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  }

  /**
   * Detect if the last execution was abruptly terminated
   * @param {string} ceremonyName - Ceremony name
   * @returns {boolean} True if abrupt termination detected
   */
  detectAbruptTermination(ceremonyName) {
    const lastExecution = this.getLastExecution(ceremonyName);

    if (!lastExecution) {
      return false;
    }

    // Check if last execution is still in-progress and in LLM generation stage
    return lastExecution.status === 'in-progress' &&
           lastExecution.stage === 'llm-generation';
  }

  /**
   * Clean up abrupt termination (mark as aborted)
   * @param {string} ceremonyName - Ceremony name
   */
  cleanupAbruptTermination(ceremonyName) {
    const lastExecution = this.getLastExecution(ceremonyName);

    if (!lastExecution || lastExecution.status !== 'in-progress') {
      return;
    }

    this.completeExecution(ceremonyName, lastExecution.id, 'abrupt-termination', {
      note: 'Process was interrupted during LLM generation',
      stage: lastExecution.stage
    });
  }

  /**
   * Get ceremony statistics
   * @param {string} ceremonyName - Ceremony name
   * @returns {Object} Statistics object
   */
  getStats(ceremonyName) {
    this.load();

    if (!this.data.ceremonies[ceremonyName]) {
      return {
        totalExecutions: 0,
        successful: 0,
        cancelled: 0,
        aborted: 0,
        lastRun: null,
        lastSuccess: null
      };
    }

    const ceremony = this.data.ceremonies[ceremonyName];
    const executions = ceremony.executions;

    return {
      totalExecutions: ceremony.totalExecutions,
      successful: executions.filter(e => e.outcome === 'success').length,
      cancelled: executions.filter(e => e.outcome === 'user-cancelled').length,
      aborted: executions.filter(e => e.outcome === 'abrupt-termination').length,
      lastRun: ceremony.lastRun,
      lastSuccess: ceremony.lastSuccess
    };
  }
}
