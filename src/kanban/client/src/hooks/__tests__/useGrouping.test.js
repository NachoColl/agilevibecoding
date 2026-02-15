import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGrouping } from '../useGrouping';

describe('useGrouping', () => {
  const mockWorkItems = [
    {
      id: 'EPIC-001',
      type: 'epic',
      name: 'Epic 1',
      status: 'implementing',
      epicId: 'EPIC-001',
      epicName: 'Epic 1',
    },
    {
      id: 'STORY-001',
      type: 'story',
      name: 'Story 1',
      status: 'ready',
      epicId: 'EPIC-001',
      epicName: 'Epic 1',
    },
    {
      id: 'EPIC-002',
      type: 'epic',
      name: 'Epic 2',
      status: 'planned',
      epicId: 'EPIC-002',
      epicName: 'Epic 2',
    },
    {
      id: 'STORY-002',
      type: 'story',
      name: 'Story 2',
      status: 'planned',
      epicId: 'EPIC-002',
      epicName: 'Epic 2',
    },
    {
      id: 'TASK-001',
      type: 'task',
      name: 'Task 1',
      status: 'completed',
      epicId: null,
      epicName: null,
    },
  ];

  describe('groupBy: status', () => {
    it('should group by status columns', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'status'));

      expect(result.current.mode).toBe('columns');
      expect(result.current.groups).toHaveLength(5); // 5 columns

      const columnNames = result.current.groups.map((g) => g.name);
      expect(columnNames).toEqual(['Backlog', 'Ready', 'In Progress', 'Review', 'Done']);
    });

    it('should distribute items to correct columns', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'status'));

      const backlog = result.current.groups.find((g) => g.name === 'Backlog');
      const ready = result.current.groups.find((g) => g.name === 'Ready');
      const inProgress = result.current.groups.find((g) => g.name === 'In Progress');
      const done = result.current.groups.find((g) => g.name === 'Done');

      expect(backlog.items).toHaveLength(2); // EPIC-002, STORY-002 (planned)
      expect(ready.items).toHaveLength(1); // STORY-001 (ready)
      expect(inProgress.items).toHaveLength(1); // EPIC-001 (implementing)
      expect(done.items).toHaveLength(1); // TASK-001 (completed)
    });

    it('should have column structure with id and name', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'status'));

      result.current.groups.forEach((group) => {
        expect(group).toHaveProperty('id');
        expect(group).toHaveProperty('name');
        expect(group).toHaveProperty('items');
        expect(Array.isArray(group.items)).toBe(true);
      });
    });
  });

  describe('groupBy: epic', () => {
    it('should group by epic with sections mode', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'epic'));

      expect(result.current.mode).toBe('sections');
      expect(result.current.groups.length).toBeGreaterThan(0);
    });

    it('should create section for each epic', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'epic'));

      const epicNames = result.current.groups.map((g) => g.name);
      expect(epicNames).toContain('Epic 1');
      expect(epicNames).toContain('Epic 2');
    });

    it('should group items without epic into "No Epic" section', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'epic'));

      const noEpicGroup = result.current.groups.find((g) => g.type === 'ungrouped');
      expect(noEpicGroup).toBeDefined();
      expect(noEpicGroup.items).toHaveLength(1); // TASK-001
    });

    it('should include epic object in group', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'epic'));

      const epic1Group = result.current.groups.find((g) => g.name === 'Epic 1');
      expect(epic1Group.epic).toBeDefined();
      expect(epic1Group.epic.id).toBe('EPIC-001');
    });

    it('should distribute items into columns within each epic', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'epic'));

      const epic1Group = result.current.groups.find((g) => g.name === 'Epic 1');
      expect(epic1Group.columns).toBeDefined();
      expect(epic1Group.columns.Ready).toHaveLength(1); // STORY-001
      expect(epic1Group.columns['In Progress']).toHaveLength(1); // EPIC-001
    });
  });

  describe('groupBy: type', () => {
    it('should group by type with sections mode', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'type'));

      expect(result.current.mode).toBe('sections');
    });

    it('should create section for each type', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'type'));

      const typeNames = result.current.groups.map((g) => g.name);
      expect(typeNames).toContain('Epics');
      expect(typeNames).toContain('Stories');
      expect(typeNames).toContain('Tasks');
    });

    it('should distribute items into correct type sections', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'type'));

      const epicsGroup = result.current.groups.find((g) => g.name === 'Epics');
      const storiesGroup = result.current.groups.find((g) => g.name === 'Stories');
      const tasksGroup = result.current.groups.find((g) => g.name === 'Tasks');

      expect(epicsGroup.items).toHaveLength(2); // EPIC-001, EPIC-002
      expect(storiesGroup.items).toHaveLength(2); // STORY-001, STORY-002
      expect(tasksGroup.items).toHaveLength(1); // TASK-001
    });

    it('should distribute items into columns within each type', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'type'));

      const epicsGroup = result.current.groups.find((g) => g.name === 'Epics');
      expect(epicsGroup.columns).toBeDefined();
      expect(epicsGroup.columns.Backlog).toHaveLength(1); // EPIC-002 (planned)
      expect(epicsGroup.columns['In Progress']).toHaveLength(1); // EPIC-001 (implementing)

      const storiesGroup = result.current.groups.find((g) => g.name === 'Stories');
      expect(storiesGroup.columns).toBeDefined();
      expect(storiesGroup.columns.Backlog).toHaveLength(1); // STORY-002 (planned)
      expect(storiesGroup.columns.Ready).toHaveLength(1); // STORY-001 (ready)
    });
  });

  describe('memoization', () => {
    it('should return same reference when inputs unchanged', () => {
      const { result, rerender } = renderHook(
        ({ items, groupBy }) => useGrouping(items, groupBy),
        { initialProps: { items: mockWorkItems, groupBy: 'status' } }
      );

      const firstResult = result.current;
      rerender({ items: mockWorkItems, groupBy: 'status' });
      const secondResult = result.current;

      expect(firstResult).toBe(secondResult);
    });

    it('should recalculate when groupBy changes', () => {
      const { result, rerender } = renderHook(
        ({ items, groupBy }) => useGrouping(items, groupBy),
        { initialProps: { items: mockWorkItems, groupBy: 'status' } }
      );

      const statusResult = result.current;
      rerender({ items: mockWorkItems, groupBy: 'epic' });
      const epicResult = result.current;

      expect(statusResult).not.toBe(epicResult);
      expect(statusResult.mode).toBe('columns');
      expect(epicResult.mode).toBe('sections');
    });

    it('should recalculate when items change', () => {
      const { result, rerender } = renderHook(
        ({ items, groupBy }) => useGrouping(items, groupBy),
        { initialProps: { items: mockWorkItems, groupBy: 'status' } }
      );

      const firstResult = result.current;
      const newItems = [...mockWorkItems, { id: 'NEW-001', status: 'ready' }];
      rerender({ items: newItems, groupBy: 'status' });
      const secondResult = result.current;

      expect(firstResult).not.toBe(secondResult);
    });
  });

  describe('edge cases', () => {
    it('should handle empty work items array', () => {
      const { result } = renderHook(() => useGrouping([], 'status'));

      expect(result.current.groups).toHaveLength(5);
      result.current.groups.forEach((group) => {
        expect(group.items).toEqual([]);
      });
    });

    it('should handle unknown groupBy value by defaulting to status', () => {
      const { result } = renderHook(() => useGrouping(mockWorkItems, 'unknown'));

      expect(result.current.mode).toBe('columns');
      expect(result.current.groups).toHaveLength(5);
    });
  });
});
