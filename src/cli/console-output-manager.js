/**
 * ConsoleOutputManager - Unified console output handling for Ink REPL
 *
 * Provides consistent console interception across all commands:
 * - Filters [DEBUG] messages (file only, not displayed in UI)
 * - Streams output to Ink UI via setOutput
 * - Works with CommandLogger for file logging (without console duplication)
 *
 * Usage:
 *   const manager = new ConsoleOutputManager(setOutput);
 *   manager.start();
 *   try {
 *     await someOperation(); // console.log calls will be captured
 *   } finally {
 *     manager.stop();
 *   }
 */

class ConsoleOutputManager {
  constructor(setOutput) {
    this.setOutput = setOutput;
    this.originalLog = console.log;
    this.originalError = console.error;
    this.originalWarn = console.warn;
    this.isActive = false;
  }

  /**
   * Start intercepting console output
   */
  start() {
    if (this.isActive) return;
    this.isActive = true;

    // Intercept console.log
    console.log = (...args) => {
      const message = args.join(' ');

      // Filter [DEBUG] messages - they go to file only via CommandLogger
      // Don't display them in the UI
      if (message.includes('[DEBUG]')) {
        // Forward to CommandLogger for file logging
        // CommandLogger is already intercepting, so just call its version
        this.originalLog(...args);
        return;
      }

      // User-facing messages: stream to Ink UI
      this.setOutput(prev => prev + message + '\n');

      // Also forward to CommandLogger for file logging
      // CommandLogger is in inkMode, so it won't forward to real console
      this.originalLog(...args);
    };

    // Intercept console.error
    console.error = (...args) => {
      const message = args.join(' ');

      // Display errors in UI with error prefix
      this.setOutput(prev => prev + `❌ ${message}\n`);

      // Also forward to CommandLogger for file logging
      this.originalError(...args);
    };

    // Intercept console.warn
    console.warn = (...args) => {
      const message = args.join(' ');

      // Display warnings in UI with warning prefix
      this.setOutput(prev => prev + `⚠️  ${message}\n`);

      // Also forward to CommandLogger for file logging
      this.originalWarn(...args);
    };
  }

  /**
   * Stop intercepting and restore original console
   */
  stop() {
    if (!this.isActive) return;
    this.isActive = false;

    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;
  }
}

export default ConsoleOutputManager;
