import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KanbanColumn } from './KanbanColumn';
import { EpicSection } from './EpicSection';
import { useKanbanStore } from '../../store/kanbanStore';
import { useFilterStore } from '../../store/filterStore';
import { useGrouping } from '../../hooks/useGrouping';
import {
  groupItemsByColumn,
  COLUMN_ORDER,
  STATUS_COLUMN_MAPPING,
} from '../../lib/status-grouping';

/**
 * Kanban Board Component
 * Main board container with columns and filtering
 */
export function KanbanBoard({ onCardClick }) {
  const [selectedItem, setSelectedItem] = useState(null);

  // Zustand stores
  const { workItems, loading } = useKanbanStore();
  const { typeFilters, columnVisibility, searchQuery, groupBy } = useFilterStore();

  // Filter work items
  const filteredItems = useMemo(() => {
    // Apply type filters
    let filtered = workItems.filter((item) => typeFilters[item.type]);

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query)) ||
          (item.epicName && item.epicName.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [workItems, typeFilters, searchQuery]);

  // Group work items based on grouping mode
  const groupedData = useGrouping(filteredItems, groupBy);

  // Handle card click
  const handleCardClick = (item) => {
    setSelectedItem(item);
    onCardClick?.(item);
  };

  if (loading && workItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading work items...</p>
        </div>
      </div>
    );
  }

  if (filteredItems.length === 0 && workItems.length > 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            No items match your filters
          </h3>
          <p className="text-slate-600">
            Try adjusting your filters or search query
          </p>
        </div>
      </div>
    );
  }

  if (workItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            No Work Items
          </h3>
          <p className="text-slate-600 mb-4">
            Start by creating epics and stories with /sponsor-call or /sprint-planning
          </p>
        </div>
      </div>
    );
  }

  // Render based on grouping mode
  if (groupedData.mode === 'sections') {
    // Epic or Type grouping - render sections
    return (
      <motion.div
        key={groupBy}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.3 }}
      >
        {groupedData.groups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">No groups to display</p>
          </div>
        ) : (
          groupedData.groups.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <EpicSection
                group={group}
                columnVisibility={columnVisibility}
                onCardClick={handleCardClick}
              />
            </motion.div>
          ))
        )}
      </motion.div>
    );
  }

  // Default: Status grouping - render columns
  return (
    <motion.div
      key={groupBy}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
      className="flex gap-4 overflow-x-auto pb-4"
    >
      <AnimatePresence mode="sync">
        {groupedData.groups
          .filter((group) => columnVisibility[group.name])
          .map((group) => (
            <KanbanColumn
              key={group.id}
              columnName={group.name}
              statuses={STATUS_COLUMN_MAPPING[group.name]}
              workItems={group.items}
              onCardClick={handleCardClick}
            />
          ))}
      </AnimatePresence>
    </motion.div>
  );
}
