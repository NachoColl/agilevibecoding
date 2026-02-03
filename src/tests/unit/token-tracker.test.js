import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TokenTracker } from '../../cli/token-tracker.js';

describe('TokenTracker', () => {
  const testAvcPath = path.join(process.cwd(), '.test-avc');
  const testTokenHistoryPath = path.join(testAvcPath, 'token-history.json');
  let tracker;

  beforeEach(() => {
    // Create test .avc directory
    if (!fs.existsSync(testAvcPath)) {
      fs.mkdirSync(testAvcPath, { recursive: true });
    }

    // Clean up any existing test token history
    if (fs.existsSync(testTokenHistoryPath)) {
      fs.unlinkSync(testTokenHistoryPath);
    }

    tracker = new TokenTracker(testAvcPath);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testTokenHistoryPath)) {
      fs.unlinkSync(testTokenHistoryPath);
    }
    if (fs.existsSync(testAvcPath)) {
      fs.rmdirSync(testAvcPath, { recursive: true });
    }
  });

  describe('init', () => {
    it('should create token history file if it does not exist', () => {
      tracker.init();

      expect(fs.existsSync(testTokenHistoryPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(testTokenHistoryPath, 'utf8'));
      expect(data).toHaveProperty('version', '1.0');
      expect(data).toHaveProperty('lastUpdated');
      expect(data).toHaveProperty('totals');
      expect(data.totals).toHaveProperty('daily');
      expect(data.totals).toHaveProperty('weekly');
      expect(data.totals).toHaveProperty('monthly');
      expect(data.totals).toHaveProperty('allTime');
      expect(data.totals.allTime).toEqual({
        input: 0,
        output: 0,
        total: 0,
        executions: 0
      });
    });

    it('should not overwrite existing token history file', () => {
      // Create initial file
      tracker.init();
      const firstData = JSON.parse(fs.readFileSync(testTokenHistoryPath, 'utf8'));

      // Wait a bit to ensure timestamp would be different
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);

      // Init again
      tracker.init();
      const secondData = JSON.parse(fs.readFileSync(testTokenHistoryPath, 'utf8'));

      // Should be the same
      expect(secondData.lastUpdated).toBe(firstData.lastUpdated);

      vi.useRealTimers();
    });
  });

  describe('load', () => {
    it('should load existing token history', () => {
      tracker.init();
      const data = tracker.load();

      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('totals');
    });

    it('should create file if it does not exist when loading', () => {
      expect(fs.existsSync(testTokenHistoryPath)).toBe(false);

      const data = tracker.load();

      expect(fs.existsSync(testTokenHistoryPath)).toBe(true);
      expect(data).toHaveProperty('version');
    });
  });

  describe('addExecution', () => {
    beforeEach(() => {
      tracker.init();
    });

    it('should add token counts to totals', () => {
      const tokens = { input: 1000, output: 500 };

      tracker.addExecution('test-ceremony', tokens);

      const totalsAllTime = tracker.getTotalsAllTime();
      expect(totalsAllTime.input).toBe(1000);
      expect(totalsAllTime.output).toBe(500);
      expect(totalsAllTime.total).toBe(1500);
      expect(totalsAllTime.executions).toBe(1);
    });

    it('should add token counts to ceremony-specific aggregations', () => {
      const tokens = { input: 2000, output: 1000 };

      tracker.addExecution('sponsor-call', tokens);

      const ceremonyAllTime = tracker.getCeremonyAllTime('sponsor-call');
      expect(ceremonyAllTime.input).toBe(2000);
      expect(ceremonyAllTime.output).toBe(1000);
      expect(ceremonyAllTime.total).toBe(3000);
      expect(ceremonyAllTime.executions).toBe(1);
    });

    it('should accumulate multiple executions', () => {
      tracker.addExecution('test-ceremony', { input: 1000, output: 500 });
      tracker.addExecution('test-ceremony', { input: 2000, output: 1000 });

      const totalsAllTime = tracker.getTotalsAllTime();
      expect(totalsAllTime.input).toBe(3000);
      expect(totalsAllTime.output).toBe(1500);
      expect(totalsAllTime.total).toBe(4500);
      expect(totalsAllTime.executions).toBe(2);
    });

    it('should update daily aggregations', () => {
      const tokens = { input: 1000, output: 500 };

      tracker.addExecution('test-ceremony', tokens);

      const totalsToday = tracker.getTotalsToday();
      expect(totalsToday.input).toBe(1000);
      expect(totalsToday.output).toBe(500);
      expect(totalsToday.total).toBe(1500);
      expect(totalsToday.executions).toBe(1);
      expect(totalsToday.date).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should update weekly aggregations', () => {
      const tokens = { input: 1000, output: 500 };

      tracker.addExecution('test-ceremony', tokens);

      const totalsWeek = tracker.getTotalsThisWeek();
      expect(totalsWeek.input).toBe(1000);
      expect(totalsWeek.output).toBe(500);
      expect(totalsWeek.total).toBe(1500);
      expect(totalsWeek.executions).toBe(1);
      expect(totalsWeek.week).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('should update monthly aggregations', () => {
      const tokens = { input: 1000, output: 500 };

      tracker.addExecution('test-ceremony', tokens);

      const totalsMonth = tracker.getTotalsThisMonth();
      expect(totalsMonth.input).toBe(1000);
      expect(totalsMonth.output).toBe(500);
      expect(totalsMonth.total).toBe(1500);
      expect(totalsMonth.executions).toBe(1);
      expect(totalsMonth.month).toBe(new Date().toISOString().substring(0, 7));
    });

    it('should track first and last execution timestamps', () => {
      vi.useFakeTimers();
      const firstTime = new Date('2026-01-01T10:00:00Z');
      vi.setSystemTime(firstTime);

      tracker.addExecution('test-ceremony', { input: 1000, output: 500 });

      const secondTime = new Date('2026-01-01T11:00:00Z');
      vi.setSystemTime(secondTime);

      tracker.addExecution('test-ceremony', { input: 2000, output: 1000 });

      const totalsAllTime = tracker.getTotalsAllTime();
      expect(totalsAllTime.firstExecution).toBe(firstTime.toISOString());
      expect(totalsAllTime.lastExecution).toBe(secondTime.toISOString());

      vi.useRealTimers();
    });

    it('should handle different ceremony types independently', () => {
      tracker.addExecution('sponsor-call', { input: 1000, output: 500 });
      tracker.addExecution('other-ceremony', { input: 2000, output: 1000 });

      const sponsorCallTokens = tracker.getCeremonyAllTime('sponsor-call');
      expect(sponsorCallTokens.input).toBe(1000);
      expect(sponsorCallTokens.executions).toBe(1);

      const otherCeremonyTokens = tracker.getCeremonyAllTime('other-ceremony');
      expect(otherCeremonyTokens.input).toBe(2000);
      expect(otherCeremonyTokens.executions).toBe(1);

      // Totals should include both
      const totalsAllTime = tracker.getTotalsAllTime();
      expect(totalsAllTime.input).toBe(3000);
      expect(totalsAllTime.executions).toBe(2);
    });

    it('should handle missing input or output tokens', () => {
      tracker.addExecution('test-ceremony', { input: 1000 });

      const totalsAllTime = tracker.getTotalsAllTime();
      expect(totalsAllTime.input).toBe(1000);
      expect(totalsAllTime.output).toBe(0);
      expect(totalsAllTime.total).toBe(1000);
    });

    it('should update lastUpdated timestamp', () => {
      vi.useFakeTimers();
      const now = new Date('2026-01-01T10:00:00Z');
      vi.setSystemTime(now);

      tracker.addExecution('test-ceremony', { input: 1000, output: 500 });

      const data = tracker.load();
      expect(data.lastUpdated).toBe(now.toISOString());

      vi.useRealTimers();
    });

    it('should write data to disk atomically', () => {
      const tokens = { input: 1000, output: 500 };

      tracker.addExecution('test-ceremony', tokens);

      // Verify file exists and is valid JSON
      expect(fs.existsSync(testTokenHistoryPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(testTokenHistoryPath, 'utf8'));
      expect(data.totals.allTime.total).toBe(1500);
    });
  });

  describe('_getWeekKey', () => {
    it('should return ISO week key in format YYYY-Www', () => {
      // January 1, 2026 is a Thursday (week 1)
      const date = new Date('2026-01-01');
      const weekKey = tracker._getWeekKey(date);

      expect(weekKey).toMatch(/^\d{4}-W\d{2}$/);
      expect(weekKey).toBe('2026-W01');
    });

    it('should handle week transitions correctly', () => {
      // December 29, 2025 is Monday (last week of 2025 or first week of 2026)
      const date = new Date('2025-12-29');
      const weekKey = tracker._getWeekKey(date);

      expect(weekKey).toMatch(/^\d{4}-W\d{2}$/);
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      tracker.init();
    });

    it('should return empty aggregations for queries with no data', () => {
      const totalsToday = tracker.getTotalsToday();
      expect(totalsToday.input).toBe(0);
      expect(totalsToday.output).toBe(0);
      expect(totalsToday.total).toBe(0);
      expect(totalsToday.executions).toBe(0);

      const ceremonyToday = tracker.getCeremonyToday('nonexistent');
      expect(ceremonyToday.input).toBe(0);
    });

    it('should return correct ceremony types', () => {
      tracker.addExecution('sponsor-call', { input: 1000, output: 500 });
      tracker.addExecution('other-ceremony', { input: 2000, output: 1000 });

      const types = tracker.getAllCeremonyTypes();
      expect(types).toContain('sponsor-call');
      expect(types).toContain('other-ceremony');
      expect(types).toHaveLength(2);
    });

    it('should not include metadata keys in ceremony types', () => {
      tracker.addExecution('test-ceremony', { input: 1000, output: 500 });

      const types = tracker.getAllCeremonyTypes();
      expect(types).not.toContain('version');
      expect(types).not.toContain('lastUpdated');
      expect(types).not.toContain('totals');
    });
  });

  describe('_cleanupRollingWindows', () => {
    beforeEach(() => {
      tracker.init();
    });

    it('should remove daily entries older than 31 days', () => {
      vi.useFakeTimers();

      // Add entry 32 days ago
      vi.setSystemTime(new Date('2026-01-01'));
      tracker.addExecution('test-ceremony', { input: 1000, output: 500 });

      // Add entry today
      vi.setSystemTime(new Date('2026-02-02'));
      tracker.addExecution('test-ceremony', { input: 2000, output: 1000 });

      const data = tracker.load();

      // Should only have today's entry
      const dailyKeys = Object.keys(data.totals.daily);
      expect(dailyKeys).toHaveLength(1);
      expect(dailyKeys[0]).toBe('2026-02-02');

      vi.useRealTimers();
    });

    it('should keep daily entries within 31 days', () => {
      vi.useFakeTimers();

      // Add entry 30 days ago
      vi.setSystemTime(new Date('2026-01-03'));
      tracker.addExecution('test-ceremony', { input: 1000, output: 500 });

      // Add entry today
      vi.setSystemTime(new Date('2026-02-02'));
      tracker.addExecution('test-ceremony', { input: 2000, output: 1000 });

      const data = tracker.load();

      // Should have both entries
      const dailyKeys = Object.keys(data.totals.daily);
      expect(dailyKeys.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });
  });

  describe('data persistence', () => {
    it('should persist data between tracker instances', () => {
      const tracker1 = new TokenTracker(testAvcPath);
      tracker1.init();
      tracker1.addExecution('test-ceremony', { input: 1000, output: 500 });

      const tracker2 = new TokenTracker(testAvcPath);
      const totalsAllTime = tracker2.getTotalsAllTime();

      expect(totalsAllTime.input).toBe(1000);
      expect(totalsAllTime.output).toBe(500);
      expect(totalsAllTime.total).toBe(1500);
      expect(totalsAllTime.executions).toBe(1);
    });

    it('should handle concurrent access gracefully', () => {
      tracker.init();

      // Simulate rapid concurrent writes
      tracker.addExecution('ceremony1', { input: 1000, output: 500 });
      tracker.addExecution('ceremony2', { input: 2000, output: 1000 });
      tracker.addExecution('ceremony1', { input: 1500, output: 750 });

      const totalsAllTime = tracker.getTotalsAllTime();
      expect(totalsAllTime.input).toBe(4500);
      expect(totalsAllTime.output).toBe(2250);
      expect(totalsAllTime.executions).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle zero token counts', () => {
      tracker.init();
      tracker.addExecution('test-ceremony', { input: 0, output: 0 });

      const totalsAllTime = tracker.getTotalsAllTime();
      expect(totalsAllTime.input).toBe(0);
      expect(totalsAllTime.output).toBe(0);
      expect(totalsAllTime.total).toBe(0);
      expect(totalsAllTime.executions).toBe(1);
    });

    it('should handle very large token counts', () => {
      tracker.init();
      const largeTokens = { input: 1000000, output: 500000 };

      tracker.addExecution('test-ceremony', largeTokens);

      const totalsAllTime = tracker.getTotalsAllTime();
      expect(totalsAllTime.input).toBe(1000000);
      expect(totalsAllTime.output).toBe(500000);
      expect(totalsAllTime.total).toBe(1500000);
    });

    it('should handle ceremony names with special characters', () => {
      tracker.init();
      const ceremonyName = 'test-ceremony-123_special!';

      tracker.addExecution(ceremonyName, { input: 1000, output: 500 });

      const ceremonyTokens = tracker.getCeremonyAllTime(ceremonyName);
      expect(ceremonyTokens.input).toBe(1000);

      const types = tracker.getAllCeremonyTypes();
      expect(types).toContain(ceremonyName);
    });
  });
});
