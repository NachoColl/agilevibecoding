import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Filter Store
 * Manages filters, grouping, and search state
 * Persisted to localStorage
 */
export const useFilterStore = create(
  persist(
    (set, get) => ({
      // State
      typeFilters: {
        epic: true,
        story: true,
        task: true,
        subtask: true,
      },
      columnVisibility: {
        Backlog: true,
        Ready: true,
        'In Progress': true,
        Review: true,
        Done: true,
      },
      searchQuery: '',
      groupBy: 'status', // 'status' | 'epic' | 'type' | 'category'

      // Actions

      /**
       * Toggle type filter
       * @param {string} type - Work item type
       */
      toggleTypeFilter: (type) => {
        set((state) => ({
          typeFilters: {
            ...state.typeFilters,
            [type]: !state.typeFilters[type],
          },
        }));
      },

      /**
       * Set all type filters
       * @param {boolean} value - Enable or disable all
       */
      setAllTypeFilters: (value) => {
        set({
          typeFilters: {
            epic: value,
            story: value,
            task: value,
            subtask: value,
          },
        });
      },

      /**
       * Toggle column visibility
       * @param {string} column - Column name
       */
      toggleColumnVisibility: (column) => {
        set((state) => ({
          columnVisibility: {
            ...state.columnVisibility,
            [column]: !state.columnVisibility[column],
          },
        }));
      },

      /**
       * Set all column visibility
       * @param {boolean} value - Show or hide all
       */
      setAllColumnsVisibility: (value) => {
        set((state) => {
          const updated = {};
          Object.keys(state.columnVisibility).forEach((col) => {
            updated[col] = value;
          });
          return { columnVisibility: updated };
        });
      },

      /**
       * Apply preset filter
       * @param {string} preset - Preset name
       */
      applyPreset: (preset) => {
        switch (preset) {
          case 'all':
            get().setAllColumnsVisibility(true);
            get().setAllTypeFilters(true);
            break;
          case 'active':
            set({
              columnVisibility: {
                Backlog: false,
                Ready: true,
                'In Progress': true,
                Review: true,
                Done: false,
              },
            });
            break;
          case 'hide-completed':
            set({
              columnVisibility: {
                Backlog: true,
                Ready: true,
                'In Progress': true,
                Review: true,
                Done: false,
              },
            });
            break;
          default:
            break;
        }
      },

      /**
       * Set search query
       * @param {string} query - Search query
       */
      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      /**
       * Clear search query
       */
      clearSearch: () => {
        set({ searchQuery: '' });
      },

      /**
       * Set grouping mode
       * @param {string} mode - Grouping mode
       */
      setGroupBy: (mode) => {
        set({ groupBy: mode });
      },

      /**
       * Get active type filters
       * @returns {string[]} Array of active types
       */
      getActiveTypes: () => {
        const { typeFilters } = get();
        return Object.entries(typeFilters)
          .filter(([_, enabled]) => enabled)
          .map(([type]) => type);
      },

      /**
       * Get visible columns
       * @returns {string[]} Array of visible column names
       */
      getVisibleColumns: () => {
        const { columnVisibility } = get();
        return Object.entries(columnVisibility)
          .filter(([_, visible]) => visible)
          .map(([column]) => column);
      },

      /**
       * Reset all filters to defaults
       */
      resetFilters: () => {
        set({
          typeFilters: {
            epic: true,
            story: true,
            task: true,
            subtask: true,
          },
          columnVisibility: {
            Backlog: true,
            Ready: true,
            'In Progress': true,
            Review: true,
            Done: true,
          },
          searchQuery: '',
          groupBy: 'status',
        });
      },
    }),
    {
      name: 'avc-kanban-filters', // localStorage key
      partialize: (state) => ({
        // Only persist these fields
        typeFilters: state.typeFilters,
        columnVisibility: state.columnVisibility,
        groupBy: state.groupBy,
      }),
    }
  )
);
