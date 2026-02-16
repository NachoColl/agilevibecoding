/**
 * Execution Context - Tracks command execution lifecycle
 *
 * Prevents ghost messages by associating messages with specific command runs.
 * Each command execution creates a unique context that can be cancelled/completed.
 */

import { randomBytes } from 'crypto';

/**
 * Execution state enum
 */
export const ExecutionState = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
};

/**
 * ExecutionContext class
 * Represents a single command execution lifecycle
 */
export class ExecutionContext {
  /**
   * @param {string} commandName - Name of the command being executed
   */
  constructor(commandName) {
    this.id = this._generateId();
    this.commandName = commandName;
    this.state = ExecutionState.ACTIVE;
    this.startTime = Date.now();
    this.endTime = null;
    this.messageBuffer = [];
    this.executingMessage = null; // Current progress message
    this.executingSubstep = null; // Current substep message
  }

  /**
   * Generate unique execution ID
   * @private
   * @returns {string} Unique ID
   */
  _generateId() {
    return `${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Check if context is active
   * @returns {boolean} True if active
   */
  isActive() {
    return this.state === ExecutionState.ACTIVE;
  }

  /**
   * Check if context is cancelled
   * @returns {boolean} True if cancelled
   */
  isCancelled() {
    return this.state === ExecutionState.CANCELLED;
  }

  /**
   * Check if context is completed
   * @returns {boolean} True if completed
   */
  isCompleted() {
    return this.state === ExecutionState.COMPLETED;
  }

  /**
   * Cancel this execution context
   * Prevents any further messages from being output
   */
  cancel() {
    if (this.state === ExecutionState.ACTIVE) {
      this.state = ExecutionState.CANCELLED;
      this.endTime = Date.now();
      this.messageBuffer = []; // Clear any pending messages
      this.executingMessage = null;
      this.executingSubstep = null;
    }
  }

  /**
   * Mark this execution context as completed
   */
  complete() {
    if (this.state === ExecutionState.ACTIVE) {
      this.state = ExecutionState.COMPLETED;
      this.endTime = Date.now();
    }
  }

  /**
   * Add message to buffer
   * @param {Object} message - Message object
   */
  addMessage(message) {
    if (this.isActive()) {
      this.messageBuffer.push({
        ...message,
        timestamp: Date.now(),
        contextId: this.id
      });
    }
  }

  /**
   * Set executing message (progress indicator)
   * @param {string} message - Progress message
   */
  setExecutingMessage(message) {
    if (this.isActive()) {
      this.executingMessage = message;
    }
  }

  /**
   * Set executing substep (detailed progress)
   * @param {string} substep - Substep message
   */
  setExecutingSubstep(substep) {
    if (this.isActive()) {
      this.executingSubstep = substep;
    }
  }

  /**
   * Clear executing message
   */
  clearExecutingMessage() {
    this.executingMessage = null;
  }

  /**
   * Clear executing substep
   */
  clearExecutingSubstep() {
    this.executingSubstep = null;
  }

  /**
   * Get all buffered messages
   * @returns {Array} Message array
   */
  getMessages() {
    return [...this.messageBuffer];
  }

  /**
   * Clear message buffer
   */
  clearMessages() {
    this.messageBuffer = [];
  }

  /**
   * Get execution duration in milliseconds
   * @returns {number|null} Duration or null if still active
   */
  getDuration() {
    if (this.endTime) {
      return this.endTime - this.startTime;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Get context summary for debugging
   * @returns {Object} Context summary
   */
  toJSON() {
    return {
      id: this.id,
      commandName: this.commandName,
      state: this.state,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.getDuration(),
      messageCount: this.messageBuffer.length,
      executingMessage: this.executingMessage,
      executingSubstep: this.executingSubstep
    };
  }
}

/**
 * Check if an execution state is valid
 * @param {string} state - State to validate
 * @returns {boolean} True if valid
 */
export function isValidExecutionState(state) {
  return Object.values(ExecutionState).includes(state);
}
