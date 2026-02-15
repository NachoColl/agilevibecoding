import { create } from 'zustand';
import { getWorkItems, getWorkItemsGrouped } from '../lib/api';

/**
 * Kanban Store
 * Manages work items, loading states, and data fetching
 */
export const useKanbanStore = create((set, get) => ({
  // State
  workItems: [],
  groupedItems: {},
  loading: false,
  error: null,
  lastUpdated: null,

  // Actions

  /**
   * Load all work items
   * @param {object} filters - Optional filters
   */
  loadWorkItems: async (filters = {}) => {
    set({ loading: true, error: null });

    try {
      const data = await getWorkItems(filters);
      set({
        workItems: data.items || [],
        loading: false,
        lastUpdated: Date.now(),
        error: null,
      });
    } catch (error) {
      set({
        loading: false,
        error: error.message,
      });
      console.error('Failed to load work items:', error);
    }
  },

  /**
   * Load work items grouped by column
   */
  loadGroupedItems: async () => {
    set({ loading: true, error: null });

    try {
      const data = await getWorkItemsGrouped();
      set({
        groupedItems: data,
        loading: false,
        lastUpdated: Date.now(),
        error: null,
      });
    } catch (error) {
      set({
        loading: false,
        error: error.message,
      });
      console.error('Failed to load grouped items:', error);
    }
  },

  /**
   * Refresh work items (re-fetch from server)
   */
  refresh: async () => {
    const { loadWorkItems } = get();
    await loadWorkItems();
  },

  /**
   * Update a single work item in the store
   * Used for WebSocket updates
   * @param {string} id - Work item ID
   * @param {object} updatedItem - Updated work item data
   */
  updateWorkItem: (id, updatedItem) => {
    set((state) => ({
      workItems: state.workItems.map((item) =>
        item.id === id ? { ...item, ...updatedItem } : item
      ),
    }));
  },

  /**
   * Add a new work item to the store
   * Used for WebSocket updates
   * @param {object} newItem - New work item
   */
  addWorkItem: (newItem) => {
    set((state) => ({
      workItems: [...state.workItems, newItem],
    }));
  },

  /**
   * Remove a work item from the store
   * Used for WebSocket updates
   * @param {string} id - Work item ID to remove
   */
  removeWorkItem: (id) => {
    set((state) => ({
      workItems: state.workItems.filter((item) => item.id !== id),
    }));
  },

  /**
   * Clear error state
   */
  clearError: () => {
    set({ error: null });
  },
}));
