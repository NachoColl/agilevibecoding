/**
 * OutputBuffer - Manages accumulated output as line array for Static rendering
 *
 * Separates output buffer management from React state, preventing
 * text mixing during selector/UI transitions.
 *
 * This utility provides:
 * - Line-based output storage (vs single string)
 * - Subscription system for React state updates
 * - Physical separation from interactive UI via Ink's Static component
 */
export class OutputBuffer {
  constructor() {
    this.lines = [];
    this.listeners = [];
  }

  /**
   * Append content to buffer (splits by newlines)
   * @param {string} content - Content to append
   */
  append(content) {
    if (!content) return;

    const newLines = content.split('\n');

    // If last line exists and new content doesn't start with \n, merge
    if (this.lines.length > 0 && !content.startsWith('\n')) {
      this.lines[this.lines.length - 1] += newLines[0];
      this.lines.push(...newLines.slice(1));
    } else {
      this.lines.push(...newLines);
    }

    this.notifyListeners();
  }

  /**
   * Clear all output (for new command execution)
   */
  clear() {
    this.lines = [];
    this.notifyListeners();
  }

  /**
   * Get all lines (for Static rendering)
   * @returns {string[]} Array of output lines
   */
  getLines() {
    return [...this.lines]; // Return copy to prevent mutations
  }

  /**
   * Get line count
   * @returns {number} Number of lines
   */
  getLineCount() {
    return this.lines.length;
  }

  /**
   * Subscribe to buffer changes
   * @param {Function} listener - Callback function (lines) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all listeners of buffer change
   * @private
   */
  notifyListeners() {
    const lines = this.getLines();
    this.listeners.forEach(listener => listener(lines));
  }
}

// Singleton instance
export const outputBuffer = new OutputBuffer();
