/**
 * Integration tests for model-selector
 * Tests end-to-end flow with mocked providers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ModelQueryEngine } from '../../cli/model-query-engine.js';
import { ModelRecommendationAnalyzer } from '../../cli/model-recommendation-analyzer.js';
import { EVALUATION_PROMPTS } from '../../cli/evaluation-prompts.js';

describe('Model Selector Integration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set mock API keys for testing
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('End-to-End Flow', () => {
    it('should load evaluation prompts', () => {
      expect(EVALUATION_PROMPTS).toBeDefined();
      expect(EVALUATION_PROMPTS.length).toBe(14);

      // Verify prompt structure
      const firstPrompt = EVALUATION_PROMPTS[0];
      expect(firstPrompt).toHaveProperty('id');
      expect(firstPrompt).toHaveProperty('ceremony');
      expect(firstPrompt).toHaveProperty('stage');
      expect(firstPrompt).toHaveProperty('stageName');
      expect(firstPrompt).toHaveProperty('prompt');
      expect(firstPrompt).toHaveProperty('metadata');
    });

    it('should process evaluation with mocked providers', async () => {
      const engine = new ModelQueryEngine();

      // Mock provider initialization
      const mockProvider = {
        validateApiKey: vi.fn().mockResolvedValue({ valid: true }),
        generateText: vi.fn().mockResolvedValue(`RECOMMENDED MODEL: Claude Sonnet 4.5

REASONING:
Excellent balance of quality and cost for this task.

CONFIDENCE: High`),
        getTokenUsage: vi.fn().mockReturnValue({
          inputTokens: 450,
          outputTokens: 280,
          totalTokens: 730,
          estimatedCost: 0.0056
        })
      };

      // Mock LLMProvider.create
      const LLMProvider = await import('../../cli/llm-provider.js');
      vi.spyOn(LLMProvider, 'LLMProvider').mockImplementation({
        create: vi.fn().mockResolvedValue(mockProvider)
      });

      // Override providers directly for this test
      engine.providers = {
        claude: mockProvider,
        openai: mockProvider,
        gemini: mockProvider
      };

      // Query single prompt
      const testPrompt = EVALUATION_PROMPTS[0];
      const result = await engine.queryAllProvidersForPrompt(testPrompt);

      // Verify result structure
      expect(result).toHaveProperty('promptId');
      expect(result).toHaveProperty('ceremony');
      expect(result).toHaveProperty('stage');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('executionTime');

      // Verify recommendations
      expect(Object.keys(result.recommendations).length).toBeGreaterThan(0);
    }, 30000); // 30 second timeout for integration test

    it('should analyze results correctly', async () => {
      // Create mock evaluation results
      const mockResults = [
        {
          promptId: 'sponsor-call-suggestions',
          ceremony: 'sponsor-call',
          stage: 'suggestions',
          stageName: 'Questionnaire Suggestions',
          recommendations: {
            claude: {
              status: 'success',
              model: 'Claude Sonnet 4.5',
              reasoning: 'Excellent domain inference',
              confidence: 'High',
              cost: 0.005
            },
            openai: {
              status: 'success',
              model: 'GPT-4o',
              reasoning: 'Strong reasoning',
              confidence: 'High',
              cost: 0.006
            }
          }
        }
      ];

      const analyzer = new ModelRecommendationAnalyzer(mockResults);
      const analysis = analyzer.analyze();

      expect(analysis).toHaveProperty('analyses');
      expect(analysis).toHaveProperty('statistics');
      expect(analysis.analyses.length).toBe(1);
      expect(analysis.statistics.totalEvaluations).toBe(1);
    });

    it('should generate markdown report', async () => {
      const mockResults = [
        {
          promptId: 'sponsor-call-suggestions',
          ceremony: 'sponsor-call',
          stage: 'suggestions',
          stageName: 'Questionnaire Suggestions',
          recommendations: {
            claude: {
              status: 'success',
              model: 'Claude Sonnet 4.5',
              reasoning: 'Excellent domain inference',
              confidence: 'High',
              cost: 0.005
            }
          }
        }
      ];

      const analyzer = new ModelRecommendationAnalyzer(mockResults);
      const report = analyzer.generateMarkdownReport();

      expect(typeof report).toBe('string');
      expect(report.length).toBeGreaterThan(100);
      expect(report).toContain('# Model Recommendations Report');
      expect(report).toContain('sponsor-call');
      expect(report).toContain('Claude Sonnet 4.5');
    });
  });

  describe('Error Handling', () => {
    it('should handle provider initialization failures', async () => {
      const engine = new ModelQueryEngine();

      // Clear API keys to simulate missing keys
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      // Should throw error when no providers available
      await expect(engine.initializeProviders()).rejects.toThrow('No LLM providers available');
    });

    it('should handle query failures gracefully', async () => {
      const engine = new ModelQueryEngine();

      // Mock provider that fails
      const failingProvider = {
        generateText: vi.fn().mockRejectedValue(new Error('API error')),
        getTokenUsage: vi.fn().mockReturnValue({
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0
        })
      };

      engine.providers = { claude: failingProvider };

      const testPrompt = EVALUATION_PROMPTS[0];
      const result = await engine.queryProvider('claude', testPrompt);

      expect(result.status).toBe('error');
      expect(result.error).toBe('API error');
    });

    it('should continue evaluation even if some providers fail', async () => {
      const engine = new ModelQueryEngine();

      // Mock mixed providers (one success, one failure)
      const successProvider = {
        generateText: vi.fn().mockResolvedValue('RECOMMENDED MODEL: Test Model\nCONFIDENCE: High'),
        getTokenUsage: vi.fn().mockReturnValue({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          estimatedCost: 0.001
        })
      };

      const failingProvider = {
        generateText: vi.fn().mockRejectedValue(new Error('Rate limit')),
        getTokenUsage: vi.fn().mockReturnValue({
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0
        })
      };

      engine.providers = {
        claude: successProvider,
        openai: failingProvider
      };

      const testPrompt = EVALUATION_PROMPTS[0];
      const result = await engine.queryAllProvidersForPrompt(testPrompt);

      // Should have one success and one error
      expect(Object.keys(result.recommendations).length).toBe(1);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(1);
    });
  });

  describe('Data Validation', () => {
    it('should validate evaluation prompt structure', () => {
      for (const prompt of EVALUATION_PROMPTS) {
        expect(prompt.id).toBeTruthy();
        expect(prompt.ceremony).toBeTruthy();
        expect(prompt.stage).toBeTruthy();
        expect(prompt.stageName).toBeTruthy();
        expect(prompt.prompt).toBeTruthy();
        expect(prompt.metadata).toBeDefined();
        expect(prompt.metadata.callFrequency).toBeGreaterThan(0);
        expect(prompt.metadata.impact).toBeTruthy();
        expect(prompt.metadata.taskComplexity).toBeGreaterThan(0);
        expect(prompt.metadata.currentDefault).toBeTruthy();
      }
    });

    it('should have all 14 expected evaluation prompts', () => {
      const expectedIds = [
        'sponsor-call-suggestions',
        'sponsor-call-documentation',
        'sponsor-call-context',
        'sponsor-call-validation',
        'sprint-planning-decomposition',
        'sprint-planning-validation-universal',
        'sprint-planning-validation-domain',
        'sprint-planning-validation-feature',
        'sprint-planning-context-generation',
        'seed-decomposition',
        'seed-validation',
        'seed-context-generation',
        'context-retrospective-documentation-update',
        'context-retrospective-context-refinement'
      ];

      const actualIds = EVALUATION_PROMPTS.map(p => p.id);

      for (const expectedId of expectedIds) {
        expect(actualIds).toContain(expectedId);
      }
    });

    it('should have correct ceremony distribution', () => {
      const ceremonyCounts = EVALUATION_PROMPTS.reduce((counts, prompt) => {
        counts[prompt.ceremony] = (counts[prompt.ceremony] || 0) + 1;
        return counts;
      }, {});

      expect(ceremonyCounts['sponsor-call']).toBe(4);
      expect(ceremonyCounts['sprint-planning']).toBe(5);
      expect(ceremonyCounts['seed']).toBe(3);
      expect(ceremonyCounts['context-retrospective']).toBe(2);
    });
  });
});
