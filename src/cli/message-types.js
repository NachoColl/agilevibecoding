/**
 * Message Types for MessageManager
 *
 * Defines different types of messages that can be sent through the messaging system.
 * Each type can be handled differently (formatting, logging, display).
 */

export const MessageType = {
  /**
   * Command start - marks the beginning of a command execution
   * Typically clears the output buffer
   */
  COMMAND_START: 'COMMAND_START',

  /**
   * Ceremony header - displays ceremony title and documentation URL
   * Format: 🎯 Title\n📖 URL
   */
  CEREMONY_HEADER: 'CEREMONY_HEADER',

  /**
   * Progress indicator - shows ongoing operation status
   * These go to executingMessage state, not main output
   */
  PROGRESS: 'PROGRESS',

  /**
   * Substep progress - shows detailed progress within an operation
   * These go to executingSubstep state, not main output
   */
  SUBSTEP: 'SUBSTEP',

  /**
   * User output - main content shown to user
   * Standard output messages
   */
  USER_OUTPUT: 'USER_OUTPUT',

  /**
   * Error message - displays errors to user
   * Automatically formatted with ❌ emoji
   */
  ERROR: 'ERROR',

  /**
   * Warning message - displays warnings to user
   * Automatically formatted with ⚠️ emoji
   */
  WARNING: 'WARNING',

  /**
   * Success message - displays success confirmation
   * Automatically formatted with ✓ emoji
   */
  SUCCESS: 'SUCCESS',

  /**
   * Debug message - development/troubleshooting info
   * Not shown in main output, only console.log
   */
  DEBUG: 'DEBUG',

  /**
   * Info message - informational content
   * Automatically formatted with ℹ️ emoji
   */
  INFO: 'INFO'
};

/**
 * Check if a message type is valid
 * @param {string} type - Message type to validate
 * @returns {boolean} True if valid
 */
export function isValidMessageType(type) {
  return Object.values(MessageType).includes(type);
}

/**
 * Get default formatting for a message type
 * @param {string} type - Message type
 * @returns {object} Format configuration
 */
export function getMessageFormat(type) {
  const formats = {
    [MessageType.ERROR]: { prefix: '❌ ', color: 'red' },
    [MessageType.WARNING]: { prefix: '⚠️  ', color: 'yellow' },
    [MessageType.SUCCESS]: { prefix: '✓ ', color: 'green' },
    [MessageType.INFO]: { prefix: 'ℹ️  ', color: 'cyan' },
    [MessageType.CEREMONY_HEADER]: { prefix: '', color: 'cyan' },
    [MessageType.USER_OUTPUT]: { prefix: '', color: 'white' },
    [MessageType.DEBUG]: { prefix: '[DEBUG] ', color: 'gray' }
  };

  return formats[type] || { prefix: '', color: 'white' };
}
