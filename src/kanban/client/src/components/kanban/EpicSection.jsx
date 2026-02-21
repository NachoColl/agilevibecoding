import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { KanbanColumn } from './KanbanColumn';
import { COLUMN_ORDER, STATUS_COLUMN_MAPPING } from '../../lib/status-grouping';
import { getStatusMetadata } from '../../lib/status-grouping';
import { cn } from '../../lib/utils';

/**
 * Epic Section Component
 * Displays an epic with its work items grouped by status columns
 */
export function EpicSection({ group, columnVisibility, onCardClick }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const { name, epic, items, columns } = group;
  const isUngrouped = group.type === 'ungrouped';

  // Calculate epic progress
  const totalItems = items.length;
  const completedItems = items.filter((item) => item.status === 'completed').length;
  const progressPercentage = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  // Get epic status if available
  const epicStatus = epic?.status;
  const epicStatusMeta = epicStatus ? getStatusMetadata(epicStatus) : null;

  return (
    <div className="mb-8">
      {/* Epic Header */}
      <div
        className={cn(
          'mb-4 pb-4 border-b-2',
          isUngrouped ? 'border-slate-300' : 'border-indigo-300'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Expand/Collapse Toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-slate-600 hover:text-slate-900 transition-colors mt-3 flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>

            {/* Epic Title */}
            {epic && !isUngrouped ? (
              <button
                onClick={() => onCardClick?.(epic)}
                className="flex-1 min-w-0 text-left p-3 border border-indigo-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                title="View epic details"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-lg font-bold text-indigo-900">🏛️ {name}</span>
                      {epicStatusMeta && (
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            epicStatusMeta.color === 'green' && 'bg-green-100 text-green-700',
                            epicStatusMeta.color === 'blue' && 'bg-blue-100 text-blue-700',
                            epicStatusMeta.color === 'yellow' && 'bg-yellow-100 text-yellow-700'
                          )}
                        >
                          {epicStatusMeta.icon} {epicStatusMeta.label}
                        </span>
                      )}
                    </div>
                    {epic?.description && (
                      <p className="text-sm text-slate-500 line-clamp-2">{epic.description}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-indigo-400 mt-1 flex-shrink-0" />
                </div>
              </button>
            ) : (
              <div className="flex-1 py-2">
                <h2
                  className={cn(
                    'text-xl font-bold',
                    isUngrouped ? 'text-slate-600' : 'text-indigo-900'
                  )}
                >
                  {isUngrouped ? '📂' : '🏛️'} {name}
                </h2>
              </div>
            )}
          </div>

          {/* Progress Stats */}
          <div className="text-right flex-shrink-0">
            <div className="text-sm text-slate-600 mb-1">
              {completedItems} / {totalItems} completed
            </div>
            {/* Progress Bar */}
            <div className="w-48 h-2 bg-slate-200 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercentage}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={cn(
                  'h-full',
                  isUngrouped ? 'bg-slate-500' : 'bg-indigo-600'
                )}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Columns */}
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="flex gap-4 overflow-x-auto pb-4"
        >
          {COLUMN_ORDER.filter((column) => columnVisibility[column]).map(
            (columnName) => {
              const statuses = STATUS_COLUMN_MAPPING[columnName];
              const columnItems = columns[columnName] || [];

              return (
                <KanbanColumn
                  key={`${group.id}-${columnName}`}
                  columnName={columnName}
                  statuses={statuses}
                  workItems={columnItems}
                  onCardClick={onCardClick}
                />
              );
            }
          )}
        </motion.div>
      )}
    </div>
  );
}
