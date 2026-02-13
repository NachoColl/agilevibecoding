/**
 * Tests for ModelQueryEngine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelQueryEngine } from '../../cli/model-query-engine.js';

describe('ModelQueryEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new ModelQueryEngine();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty state', () => {
      expect(engine.providers).toEqual({});
      expect(engine.results).toEqual([]);
      expect(engine.errors).toEqual([]);
      expect(engine.totalExecutionTime).toBe(0);
    });
  });

  describe('_normalizeResponse', () => {
    it('should extract model name from structured response', () => {
      const responseText = `RECOMMENDED MODEL: Claude Opus 4.6

REASONING:
This model provides exceptional hierarchical reasoning capabilities
required for complex decomposition tasks.

CONFIDENCE: High`;

      const tokenUsage = {
        inputTokens: 450,
        outputTokens: 280,
        totalTokens: 730,
        estimatedCost: 0.0056
      };

      const normalized = engine._normalizeResponse('claude', responseText, tokenUsage, 2.3);

      expect(normalized.provider).toBe('claude');
      expect(normalized.status).toBe('success');
      expect(normalized.model).toBe('Claude Opus 4.6');
      expect(normalized.confidence).toBe('High');
      expect(normalized.reasoning).toContain('exceptional hierarchical reasoning');
      expect(normalized.tokens.input).toBe(450);
      expect(normalized.tokens.output).toBe(280);
      expect(normalized.cost).toBe(0.0056);
      expect(normalized.responseTime).toBe(2.3);
    });

    it('should handle unstructured response gracefully', () => {
      const responseText = 'I recommend using GPT-4o for this task.';

      const tokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.001
      };

      const normalized = engine._normalizeResponse('openai', responseText, tokenUsage, 1.5);

      expect(normalized.provider).toBe('openai');
      expect(normalized.status).toBe('success');
      expect(normalized.model).toBe('I recommend using GPT-4o for this task.');
      expect(normalized.confidence).toBe('Unknown');
      expect(normalized.reasoning).toContain('recommend using GPT-4o');
    });

    it('should extract confidence levels correctly', () => {
      const responses = [
        { text: 'CONFIDENCE: High', expected: 'High' },
        { text: 'CONFIDENCE: Medium', expected: 'Medium' },
        { text: 'CONFIDENCE: Low', expected: 'Low' },
        { text: 'CONFIDENCE: high confidence', expected: 'High' },
        { text: 'No confidence line', expected: 'Unknown' }
      ];

      const tokenUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.001 };

      for (const { text, expected } of responses) {
        const normalized = engine._normalizeResponse('test', text, tokenUsage, 1.0);
        expect(normalized.confidence).toBe(expected);
      }
    });
  });

  describe('_generateSummary', () => {
    it('should generate correct summary statistics', () => {
      // Mock results
      engine.results = [
        {
          promptId: 'test-1',
          recommendations: {
            claude: { cost: 0.005 },
            openai: { cost: 0.006 }
          },
          errors: null
        },
        {
          promptId: 'test-2',
          recommendations: {
            gemini: { cost: 0.001 }
          },
          errors: [{ provider: 'openai', error: 'Rate limit' }]
        }
      ];

      engine.totalExecutionTime = 125; // 2m 5s

      const summary = engine._generateSummary();

      expect(summary.summary.totalPrompts).toBe(2);
      expect(summary.summary.successfulQueries).toBe(3);
      expect(summary.summary.failedQueries).toBe(0); // errors is separate from engine.errors
      expect(summary.summary.totalCost.claude).toBe(0.005);
      expect(summary.summary.totalCost.openai).toBe(0.006);
      expect(summary.summary.totalCost.gemini).toBe(0.001);
      expect(summary.summary.totalCost.total).toBe(0.012);
      expect(summary.summary.executionTime).toBe('2m 5s');
    });

    it('should handle empty results', () => {
      engine.results = [];
      engine.totalExecutionTime = 0;

      const summary = engine._generateSummary();

      expect(summary.summary.totalPrompts).toBe(0);
      expect(summary.summary.successfulQueries).toBe(0);
      expect(summary.summary.totalCost.total).toBe(0);
      expect(summary.summary.executionTime).toBe('0m 0s');
    });
  });

  describe('queryProvider', () => {
    it('should handle provider query errors gracefully', async () => {
      // Mock provider that throws error
      engine.providers = {
        claude: {
          generateText: vi.fn().mockRejectedValue(new Error('API key invalid')),
          getTokenUsage: vi.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0 })
        }
      };

      const evaluationPrompt = {
        id: 'test-prompt',
        ceremony: 'test',
        stage: 'test',
        prompt: 'Test prompt'
      };

      const result = await engine.queryProvider('claude', evaluationPrompt);

      expect(result.status).toBe('error');
      expect(result.error).toBe('API key invalid');
      expect(result.provider).toBe('claude');
      expect(result.responseTime).toBeGreaterThan(0);
    });
  });

  describe('getResults', () => {
    it('should return current results', () => {
      const mockResults = [{ promptId: 'test-1' }, { promptId: 'test-2' }];
      engine.results = mockResults;

      expect(engine.getResults()).toEqual(mockResults);
    });
  });

  describe('getErrors', () => {
    it('should return current errors', () => {
      const mockErrors = [{ error: 'Test error' }];
      engine.errors = mockErrors;

      expect(engine.getErrors()).toEqual(mockErrors);
    });
  });
});
