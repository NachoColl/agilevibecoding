import { motion } from 'framer-motion';
import { Package, Target, Link2, AlertCircle } from 'lucide-react';
import { getStatusMetadata } from '../../lib/status-grouping';
import { cn } from '../../lib/utils';

/**
 * Work item type metadata
 */
const TYPE_METADATA = {
  epic: { color: 'indigo', icon: '🏛️', label: 'Epic' },
  story: { color: 'blue', icon: '📖', label: 'Story' },
  task: { color: 'emerald', icon: '⚙️', label: 'Task' },
  subtask: { color: 'gray', icon: '📝', label: 'Subtask' },
};

/**
 * Kanban Card Component
 * Displays a work item as a card with status badge, type badge, and metadata
 */
export function KanbanCard({ workItem, onClick }) {
  const statusMeta = getStatusMetadata(workItem.status);
  const typeMeta = TYPE_METADATA[workItem.type] || TYPE_METADATA.task;

  const isBlocked = workItem.status === 'blocked';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'group cursor-pointer bg-white rounded-lg border shadow-sm',
        'hover:shadow-lg transition-all duration-200',
        isBlocked ? 'border-red-300' : 'border-slate-200'
      )}
    >
      {/* Card Header */}
      <div className="p-3 pb-2 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          {/* Status Badge */}
          <div
            className={cn(
              'px-2 py-1 rounded-full text-xs font-medium',
              statusMeta?.color === 'gray' && 'bg-gray-100 text-gray-700',
              statusMeta?.color === 'slate' && 'bg-slate-100 text-slate-700',
              statusMeta?.color === 'blue' && 'bg-blue-100 text-blue-700',
              statusMeta?.color === 'yellow' && 'bg-yellow-100 text-yellow-700',
              statusMeta?.color === 'amber' && 'bg-amber-100 text-amber-700',
              statusMeta?.color === 'purple' && 'bg-purple-100 text-purple-700',
              statusMeta?.color === 'violet' && 'bg-violet-100 text-violet-700',
              statusMeta?.color === 'green' && 'bg-green-100 text-green-700',
              statusMeta?.color === 'red' && 'bg-red-100 text-red-700'
            )}
          >
            {statusMeta?.icon} {statusMeta?.label}
          </div>

          {/* Type Badge */}
          <div
            className={cn(
              'px-2 py-1 rounded border text-xs font-medium',
              typeMeta.color === 'indigo' &&
                'border-indigo-300 bg-indigo-50 text-indigo-700',
              typeMeta.color === 'blue' &&
                'border-blue-300 bg-blue-50 text-blue-700',
              typeMeta.color === 'emerald' &&
                'border-emerald-300 bg-emerald-50 text-emerald-700',
              typeMeta.color === 'gray' &&
                'border-gray-300 bg-gray-50 text-gray-700'
            )}
          >
            {typeMeta.label}
          </div>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-3 pb-2">
        {/* Blocked indicator */}
        {isBlocked && (
          <div className="flex items-center gap-2 mb-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">Blocked</span>
          </div>
        )}

        {/* Title */}
        <h4 className="font-semibold text-base text-slate-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
          {workItem.name}
        </h4>

        {/* Metadata */}
        <div className="space-y-1 text-sm text-slate-600">
          {/* Parent Epic */}
          {workItem.epicName && workItem.type !== 'epic' && (
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Epic: {workItem.epicName}</span>
            </div>
          )}

          {/* Children count */}
          {workItem.children && workItem.children.length > 0 && (
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 flex-shrink-0" />
              <span>
                {workItem.children.length}{' '}
                {workItem.children.length === 1 ? 'child' : 'children'} •{' '}
                {workItem.children.filter((c) => c.status === 'completed').length}{' '}
                completed
              </span>
            </div>
          )}

          {/* Dependencies */}
          {workItem.dependencies && workItem.dependencies.length > 0 && (
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 flex-shrink-0" />
              <span>
                {workItem.dependencies.length}{' '}
                {workItem.dependencies.length === 1 ? 'dependency' : 'dependencies'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Card Footer */}
      <div className="px-3 py-2 border-t border-slate-100">
        <span className="text-xs text-slate-400">{workItem.id}</span>
      </div>
    </motion.div>
  );
}
