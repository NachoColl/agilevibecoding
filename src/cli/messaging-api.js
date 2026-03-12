/**
 * Messaging API - Simple interface for command message handling
 *
 * Provides convenient methods for commands to send messages through
 * the MessageManager without directly importing it.
 */

import { messageManager } from './message-manager.js';
import { MessageType } from './message-types.js';
import { boldCyan, gray, cyan } from './ansi-colors.js';

/**
 * Track sent ceremony headers to prevent duplication
 * Cleared on each startCommand() call
 */
let ceremonySent = new Set();

/**
 * Start a new command execution context
 * Should be called at the beginning of every command
 *
 * @param {string} commandName - Name of the command (e.g., 'sponsor-call')
 * @returns {ExecutionContext} New execution context
 *
 * @example
 * import { startCommand, endCommand } from './messaging-api.js';
 *
 * async function sponsorCallCommand() {
 *   startCommand('sponsor-call');
 *   try {
 *     // ... command logic
 *   } finally {
 *     endCommand();
 *   }
 * }
 */
export function startCommand(commandName) {
  // Clear ceremony header tracking for new command
  ceremonySent.clear();
  return messageManager.startExecution(commandName);
}

/**
 * End the current command execution context
 * Should be called in finally block to ensure cleanup
 *
 * @example
 * try {
 *   // ... command logic
 * } finally {
 *   endCommand();
 * }
 */
export function endCommand() {
  messageManager.endExecution();
}

/**
 * Cancel the current command execution context
 * Used when user interrupts or restarts command
 */
export function cancelCommand() {
  messageManager.cancelExecution();
}

/**
 * Send a ceremony header (title + documentation URL)
 * Automatically prevents duplicate headers within same command execution
 *
 * @param {string} title - Ceremony title
 */
export function sendCeremonyHeader(title) {
  // Prevent duplicate ceremony headers within the same command execution
  if (ceremonySent.has(title)) {
    return;
  }

  ceremonySent.add(title);
  const content = boldCyan(title);
  messageManager.send(MessageType.CEREMONY_HEADER, content);
}

/**
 * Send a progress message (shows in executing state)
 *
 * @param {string} message - Progress message
 *
 * @example
 * sendProgress('Analyzing database requirements...');
 */
export function sendProgress(message) {
  messageManager.send(MessageType.PROGRESS, message);
}

/**
 * Send a substep message (detailed progress)
 *
 * @param {string} message - Substep message
 *
 * @example
 * sendSubstep('Calling Claude API...');
 */
export function sendSubstep(message) {
  messageManager.send(MessageType.SUBSTEP, message);
}

/**
 * Send user output (main content)
 *
 * @param {string} content - Content to display
 *
 * @example
 * sendOutput('Mission statement: Build a task manager\n');
 */
export function sendOutput(content) {
  messageManager.send(MessageType.USER_OUTPUT, content);
}

/**
 * Send an error message
 *
 * @param {string} message - Error message
 *
 * @example
 * sendError('Failed to load configuration file');
 */
export function sendError(message) {
  messageManager.send(MessageType.ERROR, message);
}

/**
 * Send a warning message
 *
 * @param {string} message - Warning message
 *
 * @example
 * sendWarning('API rate limit approaching');
 */
export function sendWarning(message) {
  messageManager.send(MessageType.WARNING, message);
}

/**
 * Send a success message
 *
 * @param {string} message - Success message
 *
 * @example
 * sendSuccess('Documentation generated successfully');
 */
export function sendSuccess(message) {
  messageManager.send(MessageType.SUCCESS, message);
}

/**
 * Send an info message
 *
 * @param {string} message - Info message
 *
 * @example
 * sendInfo('Using Claude provider for LLM operations');
 */
export function sendInfo(message) {
  messageManager.send(MessageType.INFO, message);
}

/**
 * Send a debug message (only to console.log)
 *
 * @param {string} message - Debug message
 * @param {Object} data - Optional data to log
 *
 * @example
 * sendDebug('Processing questionnaire', { currentIndex: 2, total: 6 });
 */
export function sendDebug(message, data = null) {
  messageManager.send(MessageType.DEBUG, message, { data });
}

/**
 * Clear progress indicators
 *
 * @example
 * clearProgress();
 */
export function clearProgress() {
  messageManager.clearProgress();
}

/**
 * Get current execution context
 *
 * @returns {ExecutionContext|null} Current context or null
 */
export function getCurrentContext() {
  return messageManager.getCurrentContext();
}

/**
 * Check if current context is active
 *
 * @returns {boolean} True if active context exists
 */
export function isContextActive() {
  const context = messageManager.getCurrentContext();
  return context ? context.isActive() : false;
}

/**
 * Register callbacks from React state
 * Called once during REPL initialization
 *
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.setExecutingMessage - setExecutingMessage React state setter
 * @param {Function} callbacks.setExecutingSubstep - setExecutingSubstep React state setter
 *
 * @example
 * // In repl-ink.js
 * useEffect(() => {
 *   registerCallbacks({
 *     setExecutingMessage,
 *     setExecutingSubstep
 *   });
 * }, []);
 */
export function registerCallbacks(callbacks) {
  if (callbacks.setExecutingMessage) {
    messageManager.setExecutingMessageCallback(callbacks.setExecutingMessage);
  }
  if (callbacks.setExecutingSubstep) {
    messageManager.setExecutingSubstepCallback(callbacks.setExecutingSubstep);
  }
}

/**
 * Helper: Send formatted section header (cyan bold)
 *
 * @param {string} title - Section title
 *
 * @example
 * sendSectionHeader('Database Options Comparison');
 */
export function sendSectionHeader(title) {
  sendOutput(`\n${title}\n\n`);
}

/**
 * Helper: Send formatted list item
 *
 * @param {string} item - List item text
 * @param {number} indent - Indentation level (default: 0)
 *
 * @example
 * sendListItem('PostgreSQL - ACID compliant');
 * sendListItem('Supports complex queries', 1);
 */
export function sendListItem(item, indent = 0) {
  const spacing = '  '.repeat(indent);
  sendOutput(`${spacing}- ${item}\n`);
}

/**
 * Helper: Send indented content
 *
 * @param {string} content - Content to indent
 * @param {number} level - Indentation level (0-3, each level = 2 spaces)
 *
 * @example
 * sendIndented('Details about the option', 1);
 * sendIndented('Nested information', 2);
 */
export function sendIndented(content, level = 0) {
  const spacing = '  '.repeat(level);
  sendOutput(`${spacing}${content}`);
}

/**
 * Helper: Send newline
 */
export function sendNewline() {
  sendOutput('\n');
}

/**
 * Helper: Send multiple newlines
 *
 * @param {number} count - Number of newlines (default: 2)
 */
export function sendNewlines(count = 2) {
  sendOutput('\n'.repeat(count));
}
