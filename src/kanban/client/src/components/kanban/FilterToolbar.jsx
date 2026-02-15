import { useState } from 'react';
import { Search, RefreshCw, X, Filter, Eye, EyeOff } from 'lucide-react';
import { useFilterStore } from '../../store/filterStore';
import { useKanbanStore } from '../../store/kanbanStore';
import { GroupingSelector } from './GroupingSelector';
import { cn } from '../../lib/utils';

/**
 * Filter Toolbar Component
 * Provides filtering controls for work items
 */
export function FilterToolbar() {
  const [searchInput, setSearchInput] = useState('');

  // Zustand stores
  const {
    typeFilters,
    columnVisibility,
    searchQuery,
    toggleTypeFilter,
    setAllTypeFilters,
    toggleColumnVisibility,
    applyPreset,
    setSearchQuery,
    clearSearch,
    resetFilters,
  } = useFilterStore();

  const { refresh, loading } = useKanbanStore();

  // Type filter buttons
  const typeOptions = [
    { key: 'epic', label: 'Epics', icon: '🏛️' },
    { key: 'story', label: 'Stories', icon: '📖' },
    { key: 'task', label: 'Tasks', icon: '⚙️' },
    { key: 'subtask', label: 'Subtasks', icon: '📝' },
  ];

  // Column visibility options
  const columnOptions = [
    { key: 'Backlog', label: 'Backlog' },
    { key: 'Ready', label: 'Ready' },
    { key: 'In Progress', label: 'In Progress' },
    { key: 'Review', label: 'Review' },
    { key: 'Done', label: 'Done' },
  ];

  // Handle search input change (debounced)
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);

    // Simple debounce
    clearTimeout(window.searchDebounce);
    window.searchDebounce = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  };

  // Handle search clear
  const handleClearSearch = () => {
    setSearchInput('');
    clearSearch();
  };

  // Check if all type filters are active
  const allTypesActive = Object.values(typeFilters).every((v) => v);
  const anyTypesActive = Object.values(typeFilters).some((v) => v);

  return (
    <div className="bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-full px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          {/* Left: Type Filters */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Show:
            </span>

            {/* All/None toggle */}
            <button
              onClick={() => setAllTypeFilters(!allTypesActive)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                allTypesActive
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : anyTypesActive
                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
              )}
            >
              {allTypesActive ? 'Deselect All' : 'Select All'}
            </button>

            {/* Type filter buttons */}
            <div className="flex items-center gap-2">
              {typeOptions.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => toggleTypeFilter(key)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    'flex items-center gap-1.5',
                    typeFilters[key]
                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  )}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Search + Actions */}
          <div className="flex items-center gap-3">
            {/* Column visibility dropdown */}
            <div className="relative group">
              <button className="px-3 py-1.5 rounded-md text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Columns
              </button>

              {/* Dropdown menu */}
              <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-lg shadow-lg py-2 min-w-[180px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
                  COLUMN VISIBILITY
                </div>
                {columnOptions.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => toggleColumnVisibility(key)}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-slate-50 flex items-center justify-between"
                  >
                    <span>{label}</span>
                    {columnVisibility[key] ? (
                      <Eye className="w-4 h-4 text-blue-600" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-2 pt-2 px-3">
                  <button
                    onClick={() => applyPreset('all')}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Show All
                  </button>
                  <span className="text-slate-300 mx-2">•</span>
                  <button
                    onClick={() => applyPreset('active')}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Active Work
                  </button>
                  <span className="text-slate-300 mx-2">•</span>
                  <button
                    onClick={() => applyPreset('hide-completed')}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Hide Done
                  </button>
                </div>
              </div>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search work items..."
                value={searchInput}
                onChange={handleSearchChange}
                className="pl-10 pr-10 py-1.5 w-64 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchInput && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Refresh button */}
            <button
              onClick={refresh}
              disabled={loading}
              className={cn(
                'p-2 rounded-md transition-colors',
                loading
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              )}
              title="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>

            {/* Reset filters button */}
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Second Row: Grouping Selector */}
        <div className="flex items-center">
          <GroupingSelector />
        </div>
      </div>
    </div>
  );
}
