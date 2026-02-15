/**
 * HierarchyBuilder
 * Builds parent-child relationships for work items
 */
export class HierarchyBuilder {
  /**
   * Build hierarchical relationships for work items
   * Adds _parent, _children, _type fields to each work item
   * @param {Array<object>} workItems - Array of work items
   * @returns {object} Object with { items: Map, roots: Array }
   */
  buildHierarchy(workItems) {
    // Create a map of id → work item for fast lookup
    const itemsMap = new Map();

    // First pass: Create map and initialize fields
    workItems.forEach((item) => {
      // Determine type from ID structure
      item._type = this.getWorkItemType(item.id);

      // Determine parent ID
      item._parentId = this.getParentId(item.id);

      // Initialize children array
      item._children = [];

      // Add to map
      itemsMap.set(item.id, item);
    });

    // Second pass: Build parent-child relationships
    const roots = [];

    workItems.forEach((item) => {
      if (item._parentId) {
        // Has a parent - add to parent's children array
        const parent = itemsMap.get(item._parentId);
        if (parent) {
          parent._children.push(item);
          item._parent = parent;
        } else {
          // Parent not found (orphaned item)
          console.warn(`Orphaned work item: ${item.id} (parent ${item._parentId} not found)`);
          roots.push(item);
        }
      } else {
        // No parent - this is a root (epic)
        roots.push(item);
      }
    });

    // Sort children by ID for consistent ordering
    itemsMap.forEach((item) => {
      if (item._children.length > 0) {
        item._children.sort((a, b) => a.id.localeCompare(b.id));
      }
    });

    // Sort roots by ID
    roots.sort((a, b) => a.id.localeCompare(b.id));

    return {
      items: itemsMap,
      roots,
    };
  }

  /**
   * Determine work item type based on ID depth
   * @param {string} id - Work item ID
   * @returns {string} Type: 'epic' | 'story' | 'task' | 'subtask'
   */
  getWorkItemType(id) {
    const parts = id.split('-');
    const depth = parts.length - 1; // Subtract 1 for 'context' prefix

    switch (depth) {
      case 1:
        return 'epic';
      case 2:
        return 'story';
      case 3:
        return 'task';
      case 4:
        return 'subtask';
      default:
        return 'unknown';
    }
  }

  /**
   * Get parent ID from a work item ID
   * @param {string} id - Work item ID
   * @returns {string|null} Parent ID or null if root level
   */
  getParentId(id) {
    const parts = id.split('-');

    if (parts.length <= 2) {
      // Root level (epic), no parent
      return null;
    }

    // Remove the last segment
    return parts.slice(0, -1).join('-');
  }

  /**
   * Get all ancestors for a work item (path to root)
   * @param {object} item - Work item
   * @returns {Array<object>} Array of ancestors from immediate parent to root
   */
  getAncestors(item) {
    const ancestors = [];
    let current = item._parent;

    while (current) {
      ancestors.push(current);
      current = current._parent;
    }

    return ancestors;
  }

  /**
   * Get all descendants for a work item (recursive children)
   * @param {object} item - Work item
   * @returns {Array<object>} Array of all descendants
   */
  getDescendants(item) {
    const descendants = [];

    const traverse = (node) => {
      if (node._children && node._children.length > 0) {
        node._children.forEach((child) => {
          descendants.push(child);
          traverse(child);
        });
      }
    };

    traverse(item);
    return descendants;
  }

  /**
   * Get the root epic for a work item
   * @param {object} item - Work item
   * @returns {object|null} Root epic or null if already a root
   */
  getRootEpic(item) {
    if (!item._parent) {
      // Already a root
      return item._type === 'epic' ? item : null;
    }

    let current = item._parent;
    while (current._parent) {
      current = current._parent;
    }

    return current._type === 'epic' ? current : null;
  }

  /**
   * Calculate progress statistics for a work item based on children
   * @param {object} item - Work item
   * @returns {object} Progress statistics
   */
  calculateProgress(item) {
    if (!item._children || item._children.length === 0) {
      // Leaf node - progress based on own status
      return {
        total: 1,
        completed: item.status === 'completed' ? 1 : 0,
        percentage: item.status === 'completed' ? 100 : 0,
      };
    }

    // Aggregate children's progress
    let total = 0;
    let completed = 0;

    item._children.forEach((child) => {
      const childProgress = this.calculateProgress(child);
      total += childProgress.total;
      completed += childProgress.completed;
    });

    return {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }
}
