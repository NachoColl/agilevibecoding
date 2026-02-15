import express from 'express';
import { renderMarkdown } from '../utils/markdown.js';
import { groupItemsByColumn, getColumnStats } from '../utils/status-grouping.js';

/**
 * Create work items router
 * @param {object} dataStore - Data store with work items
 * @returns {express.Router}
 */
export function createWorkItemsRouter(dataStore) {
  const router = express.Router();

  /**
   * GET /api/work-items
   * Get all work items as hierarchical JSON
   */
  router.get('/', (req, res) => {
    try {
      const { items, roots } = dataStore.getHierarchy();

      // Convert Map to array
      const allItems = Array.from(items.values());

      // Apply filters if provided
      let filtered = allItems;

      // Filter by type
      if (req.query.type) {
        const types = req.query.type.split(',');
        filtered = filtered.filter((item) => types.includes(item._type));
      }

      // Filter by status
      if (req.query.status) {
        const statuses = req.query.status.split(',');
        filtered = filtered.filter((item) => statuses.includes(item.status));
      }

      // Search query
      if (req.query.search) {
        const search = req.query.search.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.name.toLowerCase().includes(search) ||
            item.id.toLowerCase().includes(search) ||
            (item.description && item.description.toLowerCase().includes(search))
        );
      }

      // Clean items (remove circular references for JSON serialization)
      const cleanItems = filtered.map((item) => cleanWorkItem(item));

      res.json({
        items: cleanItems,
        total: cleanItems.length,
        roots: roots.map((r) => r.id),
      });
    } catch (error) {
      console.error('Error getting work items:', error);
      res.status(500).json({ error: 'Failed to get work items' });
    }
  });

  /**
   * GET /api/work-items/grouped
   * Get work items grouped by column
   */
  router.get('/grouped', (req, res) => {
    try {
      const { items } = dataStore.getHierarchy();
      const allItems = Array.from(items.values());

      // Group by column
      const grouped = groupItemsByColumn(allItems);

      // Add statistics for each column
      const result = {};
      for (const [column, columnItems] of Object.entries(grouped)) {
        result[column] = {
          items: columnItems.map((item) => cleanWorkItem(item)),
          stats: getColumnStats(columnItems),
        };
      }

      res.json(result);
    } catch (error) {
      console.error('Error getting grouped work items:', error);
      res.status(500).json({ error: 'Failed to get grouped work items' });
    }
  });

  /**
   * GET /api/work-items/:id
   * Get single work item with full details
   */
  router.get('/:id', async (req, res) => {
    try {
      const { items } = dataStore.getHierarchy();
      const item = items.get(req.params.id);

      if (!item) {
        return res.status(404).json({ error: 'Work item not found' });
      }

      // Get full details (including doc.md and context.md)
      const fullItem = await dataStore.getFullDetails(item);

      res.json(cleanWorkItem(fullItem, true));
    } catch (error) {
      console.error(`Error getting work item ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to get work item' });
    }
  });

  /**
   * GET /api/work-items/:id/doc
   * Get rendered documentation (doc.md) as HTML
   */
  router.get('/:id/doc', async (req, res) => {
    try {
      const { items } = dataStore.getHierarchy();
      const item = items.get(req.params.id);

      if (!item) {
        return res.status(404).json({ error: 'Work item not found' });
      }

      const fullItem = await dataStore.getFullDetails(item);

      if (!fullItem.documentation) {
        return res.status(404).json({ error: 'Documentation not found' });
      }

      const html = renderMarkdown(fullItem.documentation);
      res.send(html);
    } catch (error) {
      console.error(`Error getting documentation for ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to get documentation' });
    }
  });

  /**
   * GET /api/work-items/:id/context
   * Get rendered context (context.md) as HTML
   */
  router.get('/:id/context', async (req, res) => {
    try {
      const { items } = dataStore.getHierarchy();
      const item = items.get(req.params.id);

      if (!item) {
        return res.status(404).json({ error: 'Work item not found' });
      }

      const fullItem = await dataStore.getFullDetails(item);

      if (!fullItem.context) {
        return res.status(404).json({ error: 'Context not found' });
      }

      const html = renderMarkdown(fullItem.context);
      res.send(html);
    } catch (error) {
      console.error(`Error getting context for ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to get context' });
    }
  });

  return router;
}

/**
 * Clean work item for JSON serialization
 * Removes circular references and internal fields
 * @param {object} item - Work item
 * @param {boolean} includeFullDetails - Include documentation and context
 * @returns {object} Cleaned work item
 */
function cleanWorkItem(item, includeFullDetails = false) {
  const cleaned = {
    id: item.id,
    name: item.name,
    type: item._type,
    status: item.status,
    description: item.description,
    dependencies: item.dependencies || [],
    metadata: item.metadata,
    created: item.created,
    updated: item.updated,
  };

  // Add parent reference (ID only, not full object)
  if (item._parentId) {
    cleaned.parentId = item._parentId;
    cleaned.parentName = item._parent?.name;
  }

  // Add children references (IDs only)
  if (item._children && item._children.length > 0) {
    cleaned.children = item._children.map((child) => ({
      id: child.id,
      name: child.name,
      type: child._type,
      status: child.status,
    }));
  }

  // Add epic reference for nested items
  if (item._type !== 'epic' && item._parent) {
    let epic = item._parent;
    while (epic._parent) {
      epic = epic._parent;
    }
    if (epic._type === 'epic') {
      cleaned.epicId = epic.id;
      cleaned.epicName = epic.name;
    }
  }

  // Include full details if requested
  if (includeFullDetails) {
    if (item.documentation) {
      cleaned.documentation = item.documentation;
    }
    if (item.context) {
      cleaned.context = item.context;
    }
  }

  return cleaned;
}
