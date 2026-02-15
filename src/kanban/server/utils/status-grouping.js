/**
 * Status Column Grouping Logic
 * Maps AVC work item statuses to logical kanban columns
 */

/**
 * Maps status values to their display column
 * Key: Column name
 * Value: Array of status values that belong in that column
 */
export const STATUS_COLUMN_MAPPING = {
  Backlog: ['planned', 'pending'],
  Ready: ['ready'],
  'In Progress': ['implementing', 'feedback'],
  Review: ['implemented', 'testing'],
  Done: ['completed'],
};

/**
 * Metadata for each status value
 * Used for badges, colors, icons within grouped columns
 */
export const STATUS_METADATA = {
  planned: { color: 'gray', icon: '📋', label: 'Planned' },
  pending: { color: 'slate', icon: '⏸️', label: 'Pending' },
  ready: { color: 'blue', icon: '🚀', label: 'Ready' },
  implementing: { color: 'yellow', icon: '⚙️', label: 'Implementing' },
  feedback: { color: 'amber', icon: '💬', label: 'Feedback' },
  implemented: { color: 'purple', icon: '✅', label: 'Implemented' },
  testing: { color: 'violet', icon: '🧪', label: 'Testing' },
  completed: { color: 'green', icon: '🎉', label: 'Completed' },
  blocked: { color: 'red', icon: '🚫', label: 'Blocked' },
};

/**
 * Canonical order for columns on the board
 */
export const COLUMN_ORDER = ['Backlog', 'Ready', 'In Progress', 'Review', 'Done'];

/**
 * Get the column name for a given status
 * @param {string} status - Work item status
 * @returns {string|null} Column name or null if not found
 */
export function getColumnForStatus(status) {
  for (const [column, statuses] of Object.entries(STATUS_COLUMN_MAPPING)) {
    if (statuses.includes(status)) {
      return column;
    }
  }
  return null;
}

/**
 * Get metadata for a status
 * @param {string} status - Work item status
 * @returns {object|null} Status metadata or null if not found
 */
export function getStatusMetadata(status) {
  return STATUS_METADATA[status] || null;
}

/**
 * Group work items by column
 * @param {Array} workItems - Array of work items
 * @returns {object} Object with column names as keys, arrays of work items as values
 */
export function groupItemsByColumn(workItems) {
  const grouped = {};

  // Initialize all columns as empty arrays
  COLUMN_ORDER.forEach((column) => {
    grouped[column] = [];
  });

  // Group items by their column
  workItems.forEach((item) => {
    const column = getColumnForStatus(item.status);
    if (column && grouped[column]) {
      grouped[column].push(item);
    }
  });

  return grouped;
}

/**
 * Get statistics for a column
 * @param {Array} workItems - Work items in the column
 * @returns {object} Statistics object with total count and breakdown by status
 */
export function getColumnStats(workItems) {
  const stats = {
    total: workItems.length,
    byStatus: {},
  };

  workItems.forEach((item) => {
    const status = item.status;
    if (!stats.byStatus[status]) {
      stats.byStatus[status] = 0;
    }
    stats.byStatus[status]++;
  });

  return stats;
}
