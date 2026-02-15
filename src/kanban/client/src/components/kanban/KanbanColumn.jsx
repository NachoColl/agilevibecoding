import { motion } from 'framer-motion';
import { KanbanCard } from './KanbanCard';
import { getStatusMetadata, getColumnMetadata } from '../../lib/status-grouping';
import { cn } from '../../lib/utils';

/**
 * Kanban Column Component
 * Displays a column with grouped statuses and work items
 */
export function KanbanColumn({ columnName, statuses, workItems, onCardClick }) {
  const columnMeta = getColumnMetadata(columnName);

  // Count items by specific status within the column
  const statusCounts = statuses.reduce((acc, status) => {
    acc[status] = workItems.filter((item) => item.status === status).length;
    return acc;
  }, {});

  const totalCount = workItems.length;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg p-4 min-w-[320px] max-w-[380px]',
        columnMeta?.bgColor || 'bg-slate-100'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-900">{columnName}</h3>
        <span
          className={cn(
            'text-sm px-3 py-1 rounded-full font-medium',
            columnMeta?.color === 'slate' && 'bg-slate-200 text-slate-700',
            columnMeta?.color === 'blue' && 'bg-blue-200 text-blue-700',
            columnMeta?.color === 'yellow' && 'bg-yellow-200 text-yellow-700',
            columnMeta?.color === 'purple' && 'bg-purple-200 text-purple-700',
            columnMeta?.color === 'green' && 'bg-green-200 text-green-700'
          )}
        >
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Status Breakdown (if multiple statuses in column) */}
      {statuses.length > 1 && totalCount > 0 && (
        <div className="text-xs text-slate-600 mb-3 flex flex-wrap gap-2">
          {statuses.map((status) => {
            const count = statusCounts[status];
            const statusMeta = getStatusMetadata(status);
            if (count === 0) return null;

            return (
              <span key={status} className="flex items-center gap-1">
                <span>{statusMeta?.icon}</span>
                <span>
                  {statusMeta?.label}: {count}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Cards Container */}
      <div className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
        {workItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center py-8 text-slate-400 text-sm"
          >
            No items
          </motion.div>
        ) : (
          workItems.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
            >
              <KanbanCard workItem={item} onClick={() => onCardClick?.(item)} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
