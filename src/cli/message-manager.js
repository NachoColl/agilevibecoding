/**
 * MessageManager - Centralized message handling system
 *
 * Singleton that manages all console output through execution contexts.
 * Prevents ghost messages by tracking command lifecycle and cancelling
 * messages from previous runs.
 */

import { MessageType } from './message-types.js';
import { ExecutionContext } from './execution-context.js';
import { outputBuffer } from './output-buffer.js';

/**
 * MessageManager singleton class
 */
class MessageManager {
  constructor() {
    if (MessageManager.instance) {
      return MessageManager.instance;
    }

    this.currentContext = null;
    this.contextHistory = [];
    this.maxHistorySize = 10;
    this.executingMessageCallback = null;
    this.executingSubstepCallback = null;

    MessageManager.instance = this;
  }

  /**
   * Set executing message callback (from React state setter)
   * @param {Function} callback - setExecutingMessage function
   */
  setExecutingMessageCallback(callback) {
    this.executingMessageCallback = callback;
  }

  /**
   * Set executing substep callback (from React state setter)
   * @param {Function} callback - setExecutingSubstep function
   */
  setExecutingSubstepCallback(callback) {
    this.executingSubstepCallback = callback;
  }

  /**
   * Start a new execution context for a command
   * @param {string} commandName - Name of the command
   * @returns {ExecutionContext} New execution context
   */
  startExecution(commandName) {
    // Cancel previous context if active
    if (this.currentContext && this.currentContext.isActive()) {
      this.currentContext.cancel();
    }

    // Create new context
    this.currentContext = new ExecutionContext(commandName);

    // Add to history
    this.contextHistory.push(this.currentContext);
    if (this.contextHistory.length > this.maxHistorySize) {
      this.contextHistory.shift();
    }

    // Insert visual separator between commands in the Static output
    outputBuffer.clear();

    return this.currentContext;
  }

  /**
   * End the current execution context
   */
  endExecution() {
    if (this.currentContext) {
      this.currentContext.complete();
      this.currentContext = null;
    }

    // Clear progress indicators
    if (this.executingMessageCallback) {
      this.executingMessageCallback('');
    }
    if (this.executingSubstepCallback) {
      this.executingSubstepCallback('');
    }
  }

  /**
   * Cancel the current execution context
   */
  cancelExecution() {
    if (this.currentContext) {
      this.currentContext.cancel();
      this.currentContext = null;
    }

    // Clear progress indicators
    if (this.executingMessageCallback) {
      this.executingMessageCallback('');
    }
    if (this.executingSubstepCallback) {
      this.executingSubstepCallback('');
    }
  }

  /**
   * Get current execution context
   * @returns {ExecutionContext|null} Current context or null
   */
  getCurrentContext() {
    return this.currentContext;
  }

  /**
   * Send a message through the current context
   * @param {string} type - MessageType
   * @param {string} content - Message content
   * @param {Object} options - Additional options
   */
  send(type, content, options = {}) {
    // Validate message type
    if (!Object.values(MessageType).includes(type)) {
      console.error(`Invalid message type: ${type}`);
      return;
    }

    // Ignore if no active context
    if (!this.currentContext || !this.currentContext.isActive()) {
      return;
    }

    // Handle different message types
    switch (type) {
      case MessageType.COMMAND_START:
        this._handleCommandStart(content);
        break;

      case MessageType.CEREMONY_HEADER:
        this._handleCeremonyHeader(content);
        break;

      case MessageType.PROGRESS:
        this._handleProgress(content);
        break;

      case MessageType.SUBSTEP:
        this._handleSubstep(content);
        break;

      case MessageType.USER_OUTPUT:
        this._handleUserOutput(content);
        break;

      case MessageType.ERROR:
        this._handleError(content);
        break;

      case MessageType.WARNING:
        this._handleWarning(content);
        break;

      case MessageType.SUCCESS:
        this._handleSuccess(content);
        break;

      case MessageType.INFO:
        this._handleInfo(content);
        break;

      case MessageType.DEBUG:
        this._handleDebug(content, options);
        break;

      default:
        this._handleUserOutput(content);
    }
  }

  /**
   * Handle COMMAND_START message
   * @private
   */
  _handleCommandStart(content) {
    // Clear output buffer (already done in startExecution)
    // This is a marker message type, no output needed
  }

  /**
   * Handle CEREMONY_HEADER message
   * @private
   */
  _handleCeremonyHeader(content) {
    outputBuffer.append(content + '\n\n');
  }

  /**
   * Handle PROGRESS message
   * @private
   */
  _handleProgress(content) {
    if (this.currentContext) {
      this.currentContext.setExecutingMessage(content);
    }
    if (this.executingMessageCallback) {
      this.executingMessageCallback(content);
    }
  }

  /**
   * Handle SUBSTEP message
   * @private
   */
  _handleSubstep(content) {
    if (this.currentContext) {
      this.currentContext.setExecutingSubstep(content);
    }
    if (this.executingSubstepCallback) {
      this.executingSubstepCallback(content);
    }
  }

  /**
   * Handle USER_OUTPUT message
   * @private
   */
  _handleUserOutput(content) {
    outputBuffer.append(content);
  }

  /**
   * Handle ERROR message
   * @private
   */
  _handleError(content) {
    const formattedContent = `ERROR: ${content}`;
    outputBuffer.append(formattedContent + '\n');
  }

  /**
   * Handle WARNING message
   * @private
   */
  _handleWarning(content) {
    const formattedContent = `WARNING: ${content}`;
    outputBuffer.append(formattedContent + '\n');
  }

  /**
   * Handle SUCCESS message
   * @private
   */
  _handleSuccess(content) {
    const formattedContent = `SUCCESS: ${content}`;
    outputBuffer.append(formattedContent + '\n');
  }

  /**
   * Handle INFO message
   * @private
   */
  _handleInfo(content) {
    const formattedContent = `INFO: ${content}`;
    outputBuffer.append(formattedContent + '\n');
  }

  /**
   * Handle DEBUG message
   * @private
   */
  _handleDebug(content, options = {}) {
    // Debug messages only go to console.log, not main output
    const timestamp = new Date().toISOString();
    if (options.data) {
      console.log(`[DEBUG][${timestamp}] ${content}`, JSON.stringify(options.data, null, 2));
    } else {
      console.log(`[DEBUG][${timestamp}] ${content}`);
    }
  }

  /**
   * Clear progress indicators
   */
  clearProgress() {
    if (this.currentContext) {
      this.currentContext.clearExecutingMessage();
      this.currentContext.clearExecutingSubstep();
    }
    if (this.executingMessageCallback) {
      this.executingMessageCallback('');
    }
    if (this.executingSubstepCallback) {
      this.executingSubstepCallback('');
    }
  }

  /**
   * Get execution context history
   * @returns {Array} Array of execution contexts
   */
  getHistory() {
    return [...this.contextHistory];
  }

  /**
   * Get manager state for debugging
   * @returns {Object} Manager state
   */
  toJSON() {
    return {
      hasCurrentContext: !!this.currentContext,
      currentContext: this.currentContext ? this.currentContext.toJSON() : null,
      historySize: this.contextHistory.length,
      hasCallbacks: {
        executingMessage: !!this.executingMessageCallback,
        executingSubstep: !!this.executingSubstepCallback
      }
    };
  }

  /**
   * Reset manager (for testing)
   */
  reset() {
    if (this.currentContext) {
      this.currentContext.cancel();
    }
    this.currentContext = null;
    this.contextHistory = [];
  }
}

// Export singleton instance
export const messageManager = new MessageManager();
