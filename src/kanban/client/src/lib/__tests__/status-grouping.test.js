import { describe, it, expect } from 'vitest';
import {
  STATUS_COLUMN_MAPPING,
  STATUS_METADATA,
  COLUMN_ORDER,
  getColumnForStatus,
  getStatusMetadata,
  groupItemsByColumn,
  getColumnStats,
} from '../status-grouping';

describe('status-grouping', () => {
  describe('getColumnForStatus', () => {
    it('should return correct column for each status', () => {
      expect(getColumnForStatus('planned')).toBe('Backlog');
      expect(getColumnForStatus('pending')).toBe('Backlog');
      expect(getColumnForStatus('ready')).toBe('Ready');
      expect(getColumnForStatus('implementing')).toBe('In Progress');
      expect(getColumnForStatus('feedback')).toBe('In Progress');
      expect(getColumnForStatus('implemented')).toBe('Review');
      expect(getColumnForStatus('testing')).toBe('Review');
      expect(getColumnForStatus('completed')).toBe('Done');
    });

    it('should return null for unknown status', () => {
      expect(getColumnForStatus('unknown')).toBeNull();
    });
  });

  describe('getStatusMetadata', () => {
    it('should return metadata for valid status', () => {
      const metadata = getStatusMetadata('ready');
      expect(metadata).toHaveProperty('color');
      expect(metadata).toHaveProperty('icon');
      expect(metadata).toHaveProperty('label');
      expect(metadata.color).toBe('blue');
      expect(metadata.label).toBe('Ready');
    });

    it('should return null for unknown status', () => {
      expect(getStatusMetadata('unknown')).toBeNull();
    });
  });

  describe('groupItemsByColumn', () => {
    it('should group items by column correctly', () => {
      const workItems = [
        { id: '1', status: 'planned' },
        { id: '2', status: 'ready' },
        { id: '3', status: 'implementing' },
        { id: '4', status: 'completed' },
        { id: '5', status: 'pending' },
      ];

      const grouped = groupItemsByColumn(workItems);

      expect(grouped.Backlog).toHaveLength(2);
      expect(grouped.Ready).toHaveLength(1);
      expect(grouped['In Progress']).toHaveLength(1);
      expect(grouped.Review).toHaveLength(0);
      expect(grouped.Done).toHaveLength(1);
    });

    it('should initialize all columns as empty arrays', () => {
      const grouped = groupItemsByColumn([]);

      COLUMN_ORDER.forEach((column) => {
        expect(grouped[column]).toEqual([]);
      });
    });
  });

  describe('getColumnStats', () => {
    it('should calculate correct statistics', () => {
      const workItems = [
        { status: 'planned' },
        { status: 'planned' },
        { status: 'pending' },
      ];

      const stats = getColumnStats(workItems);

      expect(stats.total).toBe(3);
      expect(stats.byStatus.planned).toBe(2);
      expect(stats.byStatus.pending).toBe(1);
    });

    it('should handle empty array', () => {
      const stats = getColumnStats([]);
      expect(stats.total).toBe(0);
      expect(stats.byStatus).toEqual({});
    });
  });
});
