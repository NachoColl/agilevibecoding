import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useKanbanStore } from '../kanbanStore';
import * as api from '../../lib/api';

// Mock the API module
vi.mock('../../lib/api', () => ({
  getWorkItems: vi.fn(),
}));

describe('kanbanStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useKanbanStore.setState({
      workItems: [],
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty work items array', () => {
      const state = useKanbanStore.getState();
      expect(state.workItems).toEqual([]);
    });

    it('should not be loading initially', () => {
      const state = useKanbanStore.getState();
      expect(state.loading).toBe(false);
    });

    it('should have no error initially', () => {
      const state = useKanbanStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('loadWorkItems', () => {
    it('should load work items successfully', async () => {
      const mockItems = [
        { id: 'EPIC-001', type: 'epic', status: 'implementing' },
        { id: 'STORY-001', type: 'story', status: 'ready' },
      ];

      api.getWorkItems.mockResolvedValueOnce({ items: mockItems });

      const { loadWorkItems } = useKanbanStore.getState();
      await loadWorkItems();

      const state = useKanbanStore.getState();
      expect(state.workItems).toEqual(mockItems);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set loading state during fetch', async () => {
      api.getWorkItems.mockImplementation(() => {
        // Check loading state while promise is pending
        const state = useKanbanStore.getState();
        expect(state.loading).toBe(true);
        return Promise.resolve({ items: [] });
      });

      const { loadWorkItems } = useKanbanStore.getState();
      await loadWorkItems();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Failed to fetch');
      api.getWorkItems.mockRejectedValueOnce(error);

      const { loadWorkItems } = useKanbanStore.getState();
      await loadWorkItems();

      const state = useKanbanStore.getState();
      expect(state.workItems).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Failed to fetch');
    });

    it('should pass filters to API', async () => {
      api.getWorkItems.mockResolvedValueOnce({ items: [] });

      const { loadWorkItems } = useKanbanStore.getState();
      await loadWorkItems({ type: 'epic', status: 'ready' });

      expect(api.getWorkItems).toHaveBeenCalledWith({ type: 'epic', status: 'ready' });
    });
  });

  describe('updateWorkItem', () => {
    it('should update existing work item', () => {
      const initialItems = [
        { id: 'EPIC-001', name: 'Old Name', status: 'planned' },
        { id: 'STORY-001', name: 'Story', status: 'ready' },
      ];

      useKanbanStore.setState({ workItems: initialItems });

      const { updateWorkItem } = useKanbanStore.getState();
      updateWorkItem('EPIC-001', { name: 'New Name', status: 'implementing' });

      const state = useKanbanStore.getState();
      expect(state.workItems[0]).toEqual({
        id: 'EPIC-001',
        name: 'New Name',
        status: 'implementing',
      });
      expect(state.workItems[1]).toEqual(initialItems[1]); // Unchanged
    });

    it('should not modify state if item not found', () => {
      const initialItems = [{ id: 'EPIC-001', name: 'Epic', status: 'planned' }];

      useKanbanStore.setState({ workItems: initialItems });

      const { updateWorkItem } = useKanbanStore.getState();
      updateWorkItem('NONEXISTENT', { name: 'New Name' });

      const state = useKanbanStore.getState();
      expect(state.workItems).toEqual(initialItems);
    });

    it('should merge updates with existing properties', () => {
      const initialItems = [
        {
          id: 'EPIC-001',
          name: 'Epic',
          status: 'planned',
          description: 'Description',
          type: 'epic',
        },
      ];

      useKanbanStore.setState({ workItems: initialItems });

      const { updateWorkItem } = useKanbanStore.getState();
      updateWorkItem('EPIC-001', { status: 'implementing' });

      const state = useKanbanStore.getState();
      expect(state.workItems[0]).toEqual({
        id: 'EPIC-001',
        name: 'Epic',
        status: 'implementing', // Updated
        description: 'Description', // Preserved
        type: 'epic', // Preserved
      });
    });
  });

  describe('refresh', () => {
    it('should reload work items', async () => {
      const mockItems = [{ id: 'EPIC-001', type: 'epic' }];
      api.getWorkItems.mockResolvedValueOnce({ items: mockItems });

      const { refresh } = useKanbanStore.getState();
      await refresh();

      const state = useKanbanStore.getState();
      expect(state.workItems).toEqual(mockItems);
      expect(api.getWorkItems).toHaveBeenCalled();
    });
  });
});
