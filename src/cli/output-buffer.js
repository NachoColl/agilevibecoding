/**
 * OutputBuffer - Manages accumulated output as item array for Static rendering
 *
 * Each append() call creates one item with a unique ID, compatible with
 * Ink's <Static> component which requires stable keys and never erases items.
 *
 * Items accumulate across commands (like a natural terminal log).
 * The clear() method inserts a blank separator line between commands
 * instead of erasing — Static committed content cannot be removed.
 */
export class OutputBuffer {
  constructor() {
    this.items = [];
    this.itemCounter = 0;
    this.listeners = [];
  }

  /**
   * Append content as a new item
   * @param {string} content - Content to append (may contain newlines)
   */
  append(content) {
    if (!content) return;

    this.items.push({ id: ++this.itemCounter, content });
    this.notifyListeners();
  }

  /**
   * Insert a blank separator between commands.
   * Items cannot be removed from Static rendering, so this adds a
   * visual separator instead of erasing previous content.
   */
  clear() {
    if (this.items.length > 0) {
      this.items.push({ id: ++this.itemCounter, content: '' });
      this.notifyListeners();
    }
  }

  /**
   * Get all items (for Static rendering)
   * @returns {{id: number, content: string}[]} Copy of items array
   */
  getItems() {
    return [...this.items];
  }

  /**
   * Get item count
   * @returns {number} Number of items
   */
  getItemCount() {
    return this.items.length;
  }

  /**
   * Get all lines as flat string array (for test compatibility)
   * @returns {string[]} All content split by newlines
   */
  getLines() {
    return this.items.flatMap(item => item.content.split('\n'));
  }

  /**
   * Get line count (for backward compatibility)
   * @returns {number} Total number of lines across all items
   */
  getLineCount() {
    return this.getLines().length;
  }

  /**
   * Reset buffer completely - removes all items.
   * Used in tests for isolation between test cases.
   */
  reset() {
    this.items = [];
    this.itemCounter = 0;
    this.notifyListeners();
  }

  /**
   * Subscribe to buffer changes
   * @param {Function} listener - Callback function (items) => void
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
    const items = this.getItems();
    this.listeners.forEach(listener => listener(items));
  }
}

// Singleton instance
export const outputBuffer = new OutputBuffer();
