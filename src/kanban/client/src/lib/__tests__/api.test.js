import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getHealth,
  getStats,
  getWorkItems,
  getWorkItemsGrouped,
  getWorkItem,
  getWorkItemDoc,
  getWorkItemContext,
} from '../api';

// Mock fetch globally
global.fetch = vi.fn();

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should fetch health status successfully', async () => {
      const mockResponse = { status: 'ok', uptime: 12345 };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getHealth();

      expect(fetch).toHaveBeenCalledWith('/api/health', {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error when fetch fails', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      });

      await expect(getHealth()).rejects.toThrow();
    });
  });

  describe('getStats', () => {
    it('should fetch statistics successfully', async () => {
      const mockStats = {
        totalItems: 42,
        byStatus: { planned: 10, implementing: 15 },
        byType: { epic: 5, story: 20 },
      };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      });

      const result = await getStats();

      expect(fetch).toHaveBeenCalledWith('/api/stats', {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockStats);
    });
  });

  describe('getWorkItems', () => {
    it('should fetch work items without filters', async () => {
      const mockItems = [
        { id: 'EPIC-001', type: 'epic', status: 'implementing' },
        { id: 'STORY-001', type: 'story', status: 'ready' },
      ];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockItems,
      });

      const result = await getWorkItems();

      expect(fetch).toHaveBeenCalledWith('/api/work-items', {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockItems);
    });

    it('should fetch work items with type filter', async () => {
      const mockItems = [{ id: 'EPIC-001', type: 'epic', status: 'implementing' }];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockItems,
      });

      const result = await getWorkItems({ type: 'epic' });

      expect(fetch).toHaveBeenCalledWith('/api/work-items?type=epic', {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockItems);
    });

    it('should fetch work items with multiple filters', async () => {
      const mockItems = [{ id: 'STORY-001', type: 'story', status: 'ready' }];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockItems,
      });

      const result = await getWorkItems({ type: 'story', status: 'ready' });

      expect(fetch).toHaveBeenCalledWith('/api/work-items?type=story&status=ready', {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockItems);
    });
  });

  describe('getWorkItemsGrouped', () => {
    it('should fetch grouped work items', async () => {
      const mockGrouped = {
        Backlog: [{ id: 'STORY-001', status: 'planned' }],
        Ready: [{ id: 'STORY-002', status: 'ready' }],
      };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGrouped,
      });

      const result = await getWorkItemsGrouped();

      expect(fetch).toHaveBeenCalledWith('/api/work-items/grouped', {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockGrouped);
    });
  });

  describe('getWorkItem', () => {
    it('should fetch single work item successfully', async () => {
      const mockItem = {
        id: 'EPIC-001',
        type: 'epic',
        name: 'Test Epic',
        status: 'implementing',
      };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockItem,
      });

      const result = await getWorkItem('EPIC-001');

      expect(fetch).toHaveBeenCalledWith('/api/work-items/EPIC-001', {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockItem);
    });

    it('should throw error for non-existent work item', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Not found' }),
      });

      await expect(getWorkItem('NONEXISTENT')).rejects.toThrow();
    });
  });

  describe('getWorkItemDoc', () => {
    it('should fetch work item documentation', async () => {
      const mockDoc = '# Epic Documentation\n\nDetails here...';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockDoc,
      });

      const result = await getWorkItemDoc('EPIC-001');

      expect(result).toBe(mockDoc);
    });

    it('should return empty string when doc not found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await getWorkItemDoc('EPIC-001');

      expect(result).toBe('');
    });
  });

  describe('getWorkItemContext', () => {
    it('should fetch work item context', async () => {
      const mockContext = '# Context\n\nContext information...';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContext,
      });

      const result = await getWorkItemContext('EPIC-001');

      expect(result).toBe(mockContext);
    });

    it('should return empty string when context not found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await getWorkItemContext('EPIC-001');

      expect(result).toBe('');
    });
  });
});
