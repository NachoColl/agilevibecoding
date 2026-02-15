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
      label: 'By Status',
      icon: LayoutGrid,
      description: 'Traditional kanban columns',
    },
    {
      value: 'epic',
      label: 'By Epic',
      icon: Package,
      description: 'Hierarchical epic sections',
    },
    {
      value: 'type',
      label: 'By Type',
      icon: Box,
      description: 'Separate boards by type',
    },
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-slate-700">Group by:</span>
      <div className="flex items-center gap-1 bg-slate-100 rounded-md p-1">
        {groupingOptions.map(({ value, label, icon: Icon }) => {
          const isActive = groupBy === value;

          return (
            <button
              key={value}
              onClick={() => setGroupBy(value)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                isActive
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
