import { useMemo } from 'react';
import { groupItemsByColumn, COLUMN_ORDER } from '../lib/status-grouping';

/**
 * Grouping Hook
 * Handles different grouping strategies for work items
 */
export function useGrouping(workItems, groupBy) {
  return useMemo(() => {
    switch (groupBy) {
      case 'status':
        return groupByStatus(workItems);
      case 'epic':
        return groupByEpic(workItems);
      case 'type':
        return groupByType(workItems);
      default:
        return groupByStatus(workItems);
    }
  }, [workItems, groupBy]);
}

/**
 * Group by status (default kanban columns)
 */
function groupByStatus(workItems) {
  const grouped = groupItemsByColumn(workItems);

  return {
    mode: 'columns',
    groups: COLUMN_ORDER.map((columnName) => ({
      id: columnName,
      name: columnName,
      items: grouped[columnName] || [],
      type: 'column',
    })),
  };
}

/**
 * Group by epic (hierarchical sections)
 */
function groupByEpic(workItems) {
  // Get all epics
  const epics = workItems.filter((item) => item.type === 'epic');

  // Group items by epic
  const groups = epics.map((epic) => {
    // Get all descendants of this epic
    const epicItems = workItems.filter(
      (item) => item.epicId === epic.id || item.id === epic.id
    );

    // Group epic's items by column
    const columns = groupItemsByColumn(epicItems);

    return {
      id: epic.id,
      name: epic.name,
      epic: epic,
      items: epicItems,
      columns: columns,
      type: 'epic',
    };
  });

  // Add ungrouped items (items without an epic)
  const ungroupedItems = workItems.filter(
    (item) => !item.epicId && item.type !== 'epic'
  );

  if (ungroupedItems.length > 0) {
    const columns = groupItemsByColumn(ungroupedItems);
    groups.push({
      id: 'ungrouped',
      name: 'No Epic',
      items: ungroupedItems,
      columns: columns,
      type: 'ungrouped',
    });
  }

  return {
    mode: 'sections',
    groups,
  };
}

/**
 * Group by type (separate boards for each type)
 */
function groupByType(workItems) {
  const types = [
    { id: 'epic', name: 'Epics' },
    { id: 'story', name: 'Stories' },
    { id: 'task', name: 'Tasks' },
    { id: 'subtask', name: 'Subtasks' },
  ];

  const groups = types.map((type) => {
    const typeItems = workItems.filter((item) => item.type === type.id);
    const columns = groupItemsByColumn(typeItems);

    return {
      id: type.id,
      name: type.name,
      items: typeItems,
      columns: columns,
      type: 'type',
    };
  });

  // Filter out empty groups
  return {
    mode: 'sections',
    groups: groups.filter((group) => group.items.length > 0),
  };
}
