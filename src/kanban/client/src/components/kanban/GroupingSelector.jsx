import { LayoutGrid, Package, Box } from 'lucide-react';
import { useFilterStore } from '../../store/filterStore';
import { cn } from '../../lib/utils';

/**
 * Grouping Selector Component
 * Allows users to change how work items are grouped
 */
export function GroupingSelector() {
  const { groupBy, setGroupBy } = useFilterStore();

  const groupingOptions = [
    {
      value: 'status',
      label: 'Status',
      icon: LayoutGrid,
      description: 'Traditional kanban columns',
    },
    {
      value: 'epic',
      label: 'Epic',
      icon: Package,
      description: 'Hierarchical epic sections',
    },
    {
      value: 'type',
      label: 'Type',
      icon: Box,
      description: 'Separate boards by type',
    },
  ];

  return (
    <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5">
      {groupingOptions.map(({ value, label, icon: Icon, description }) => {
        const isActive = groupBy === value;

        return (
          <button
            key={value}
            onClick={() => setGroupBy(value)}
            title={description}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
              isActive
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
