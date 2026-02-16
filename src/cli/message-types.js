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
   * Automatically formatted with ERROR: prefix in red bold
   */
  ERROR: 'ERROR',

  /**
   * Warning message - displays warnings to user
   * Automatically formatted with WARNING: prefix in yellow bold
   */
  WARNING: 'WARNING',

  /**
   * Success message - displays success confirmation
   * Automatically formatted with SUCCESS: prefix in green bold
   */
  SUCCESS: 'SUCCESS',

  /**
   * Debug message - development/troubleshooting info
   * Not shown in main output, only console.log
   */
  DEBUG: 'DEBUG',

  /**
   * Info message - informational content
   * Automatically formatted with INFO: prefix in cyan
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
 * @returns {object} Format configuration with prefix, color, and bold flag
 */
export function getMessageFormat(type) {
  const formats = {
    [MessageType.ERROR]: { prefix: 'ERROR: ', color: 'red', bold: true },
    [MessageType.WARNING]: { prefix: 'WARNING: ', color: 'yellow', bold: true },
    [MessageType.SUCCESS]: { prefix: 'SUCCESS: ', color: 'green', bold: true },
    [MessageType.INFO]: { prefix: 'INFO: ', color: 'cyan', bold: false },
    [MessageType.CEREMONY_HEADER]: { prefix: '', color: 'cyan', bold: true },
    [MessageType.USER_OUTPUT]: { prefix: '', color: 'white', bold: false },
    [MessageType.DEBUG]: { prefix: '[DEBUG] ', color: 'gray', bold: false }
  };

  return formats[type] || { prefix: '', color: 'white', bold: false };
}
