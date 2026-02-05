import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TemplateProcessor } from '../../cli/template-processor.js';
import { TokenTracker } from '../../cli/token-tracker.js';

describe('Token Tracking Integration', () => {
  const testAvcPath = path.join(process.cwd(), '.avc');
  const testTokenHistoryPath = path.join(testAvcPath, 'token-history.json');
  const testAvcConfigPath = path.join(testAvcPath, 'avc.json');

  beforeEach(() => {
    // Create test .avc directory
    if (!fs.existsSync(testAvcPath)) {
      fs.mkdirSync(testAvcPath, { recursive: true });
    }

    // Create minimal avc.json config
    const avcConfig = {
      settings: {
        ceremonies: [{
          name: 'sponsor-call',
          provider: 'claude',
          defaultModel: 'claude-sonnet-4-5-20250929'
        }]
      }
    };
    fs.writeFileSync(testAvcConfigPath, JSON.stringify(avcConfig, null, 2));

    // Clean up any existing test token history
    if (fs.existsSync(testTokenHistoryPath)) {
      fs.unlinkSync(testTokenHistoryPath);
    }
  });

  afterEach(() => {
    // Clean up test files (but not the directory, as other tests may use it)
    if (fs.existsSync(testTokenHistoryPath)) {
      fs.unlinkSync(testTokenHistoryPath);
    }
    if (fs.existsSync(testAvcConfigPath)) {
      fs.unlinkSync(testAvcConfigPath);
    }
  });

  describe('TemplateProcessor token tracking', () => {
    it('should initialize TokenTracker when TemplateProcessor is created', () => {
      const processor = new TemplateProcessor('sponsor-call');

      // TokenTracker should be initialized
      expect(processor.tokenTracker).toBeDefined();
      expect(fs.existsSync(testTokenHistoryPath)).toBe(true);
    });

    it('should save tokens after manual tracking call', () => {
      const processor = new TemplateProcessor('sponsor-call');

      // Simulate token usage
      processor.tokenTracker.addExecution('sponsor-call', {
        input: 5000,
        output: 2500
      });

      // Verify token tracking
      const tracker = new TokenTracker();
      const totalsAllTime = tracker.getTotalsAllTime();

      expect(totalsAllTime.input).toBe(5000);
      expect(totalsAllTime.output).toBe(2500);
      expect(totalsAllTime.total).toBe(7500);
      expect(totalsAllTime.executions).toBe(1);

      // Should have ceremony-specific tracking
      const ceremonyTokens = tracker.getCeremonyAllTime('sponsor-call');
      expect(ceremonyTokens.input).toBe(5000);
      expect(ceremonyTokens.output).toBe(2500);
      expect(ceremonyTokens.total).toBe(7500);
      expect(ceremonyTokens.executions).toBe(1);
    });

    it('should accumulate tokens across multiple executions', () => {
      const processor1 = new TemplateProcessor('sponsor-call');
      processor1.tokenTracker.addExecution('sponsor-call', {
        input: 1000,
        output: 500
      });

      const processor2 = new TemplateProcessor('sponsor-call');
      processor2.tokenTracker.addExecution('sponsor-call', {
        input: 2000,
        output: 1000
      });

      // Verify cumulative tracking
      const tracker = new TokenTracker();
      const totalsAllTime = tracker.getTotalsAllTime();

      expect(totalsAllTime.input).toBe(3000);
      expect(totalsAllTime.output).toBe(1500);
      expect(totalsAllTime.total).toBe(4500);
      expect(totalsAllTime.executions).toBe(2);
    });

    it('should handle zero token usage', () => {
      const processor = new TemplateProcessor('sponsor-call');
      processor.tokenTracker.addExecution('sponsor-call', {
        input: 0,
        output: 0
      });

      const tracker = new TokenTracker();
      const totalsAllTime = tracker.getTotalsAllTime();

      expect(totalsAllTime.input).toBe(0);
      expect(totalsAllTime.output).toBe(0);
      expect(totalsAllTime.total).toBe(0);
      expect(totalsAllTime.executions).toBe(1);
    });
  });

  describe('Token history file format', () => {
    it('should create properly formatted token history file', () => {
      const processor = new TemplateProcessor('sponsor-call');
      processor.tokenTracker.addExecution('sponsor-call', {
        input: 1000,
        output: 500
      });

      // Read and verify file structure
      const data = JSON.parse(fs.readFileSync(testTokenHistoryPath, 'utf8'));

      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('lastUpdated');
      expect(data).toHaveProperty('totals');
      expect(data).toHaveProperty('sponsor-call');

      // Verify totals structure
      expect(data.totals).toHaveProperty('daily');
      expect(data.totals).toHaveProperty('weekly');
      expect(data.totals).toHaveProperty('monthly');
      expect(data.totals).toHaveProperty('allTime');

      // Verify ceremony structure
      expect(data['sponsor-call']).toHaveProperty('daily');
      expect(data['sponsor-call']).toHaveProperty('weekly');
      expect(data['sponsor-call']).toHaveProperty('monthly');
      expect(data['sponsor-call']).toHaveProperty('allTime');

      // Verify allTime has correct fields
      expect(data.totals.allTime).toHaveProperty('input');
      expect(data.totals.allTime).toHaveProperty('output');
      expect(data.totals.allTime).toHaveProperty('total');
      expect(data.totals.allTime).toHaveProperty('executions');
      expect(data.totals.allTime).toHaveProperty('firstExecution');
      expect(data.totals.allTime).toHaveProperty('lastExecution');
    });

    it('should update timestamps correctly', () => {
      vi.useFakeTimers();
      const now = new Date('2026-02-02T10:00:00Z');
      vi.setSystemTime(now);

      const processor = new TemplateProcessor('sponsor-call');
      processor.tokenTracker.addExecution('sponsor-call', {
        input: 1000,
        output: 500
      });

      const data = JSON.parse(fs.readFileSync(testTokenHistoryPath, 'utf8'));

      expect(data.lastUpdated).toBe(now.toISOString());
      expect(data.totals.allTime.firstExecution).toBe(now.toISOString());
      expect(data.totals.allTime.lastExecution).toBe(now.toISOString());

      vi.useRealTimers();
    });
  });
});
