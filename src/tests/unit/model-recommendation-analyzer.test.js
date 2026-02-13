/**
 * Tests for ModelRecommendationAnalyzer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRecommendationAnalyzer } from '../../cli/model-recommendation-analyzer.js';

describe('ModelRecommendationAnalyzer', () => {
  let mockEvaluationResults;

  beforeEach(() => {
    // Create mock evaluation results
    mockEvaluationResults = [
      {
        promptId: 'sponsor-call-suggestions',
        ceremony: 'sponsor-call',
        stage: 'suggestions',
        stageName: 'Questionnaire Suggestions',
        recommendations: {
          claude: {
            status: 'success',
            model: 'Claude Sonnet 4.5',
            reasoning: 'Excellent domain inference capabilities',
            confidence: 'High',
            cost: 0.005
          },
          openai: {
            status: 'success',
            model: 'GPT-4o',
            reasoning: 'Strong world knowledge and reasoning',
            confidence: 'High',
            cost: 0.006
          },
          gemini: {
            status: 'success',
            model: 'Gemini 2.5 Pro',
            reasoning: 'Fast inference with good quality',
            confidence: 'Medium',
            cost: 0.001
          }
        }
      },
      {
        promptId: 'sprint-planning-decomposition',
        ceremony: 'sprint-planning',
        stage: 'decomposition',
        stageName: 'Epic & Story Decomposition',
        recommendations: {
          claude: {
            status: 'success',
            model: 'Claude Opus 4.6',
            reasoning: 'Best hierarchical reasoning',
            confidence: 'High',
            cost: 0.015
          },
          openai: {
            status: 'success',
            model: 'GPT-5.2',
            reasoning: 'Advanced reasoning capabilities',
            confidence: 'High',
            cost: 0.018
          }
        }
      }
    ];
  });

  describe('constructor', () => {
    it('should initialize with evaluation results', () => {
      const analyzer = new ModelRecommendationAnalyzer(mockEvaluationResults);

      expect(analyzer.evaluationResults).toEqual(mockEvaluationResults);
      expect(analyzer.analysis).toBeNull();
    });
  });

  describe('_normalizeModelName', () => {
    it('should normalize model names correctly', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      expect(analyzer._normalizeModelName('Claude Opus 4.6')).toBe('opus');
      expect(analyzer._normalizeModelName('Claude Sonnet 4.5')).toBe('sonnet');
      expect(analyzer._normalizeModelName('Claude Haiku 3.5')).toBe('haiku');
      expect(analyzer._normalizeModelName('Gemini 2.0 Flash')).toBe('flash');
      expect(analyzer._normalizeModelName('Gemini 2.5 Pro')).toBe('pro');
      expect(analyzer._normalizeModelName('GPT-5.2')).toBe('premium');
      expect(analyzer._normalizeModelName('GPT-4o')).toBe('premium');
      expect(analyzer._normalizeModelName('GPT-3.5-turbo')).toBe('standard');
      expect(analyzer._normalizeModelName('Unknown Model')).toBe('unknown model');
    });
  });

  describe('_detectConsensus', () => {
    it('should detect full consensus', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      const models = {
        claude: { model: 'Claude Sonnet 4.5' },
        openai: { model: 'GPT-4 Sonnet' },
        gemini: { model: 'Gemini Sonnet' }
      };

      const consensus = analyzer._detectConsensus(models);

      expect(consensus.level).toBe('full');
      expect(consensus.agreement).toBe('3/3');
      expect(consensus.majority).toBe('sonnet');
      expect(consensus.details).toContain('All providers');
    });

    it('should detect partial consensus', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      // Two providers recommend opus tier, one recommends sonnet
      const models = {
        claude: { model: 'Claude Opus 4.6' },
        openai: { model: 'Some Opus Model' },
        gemini: { model: 'Gemini 2.5 Pro' }
      };

      const consensus = analyzer._detectConsensus(models);

      expect(consensus.level).toBe('partial');
      expect(consensus.agreement).toBe('2/3');
      expect(consensus.majority).toBe('opus');
    });

    it('should detect no consensus when all different', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      const models = {
        claude: { model: 'Claude Opus 4.6' },
        openai: { model: 'GPT-3.5-turbo' },
        gemini: { model: 'Gemini 2.0 Flash' }
      };

      const consensus = analyzer._detectConsensus(models);

      expect(['none', 'partial']).toContain(consensus.level);
    });

    it('should handle single provider', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      const models = {
        claude: { model: 'Claude Sonnet 4.5' }
      };

      const consensus = analyzer._detectConsensus(models);

      expect(consensus.level).toBe('single');
      expect(consensus.agreement).toBe('1/1');
      expect(consensus.details).toContain('Only claude available');
    });

    it('should handle empty providers', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      const consensus = analyzer._detectConsensus({});

      expect(consensus.level).toBe('none');
      expect(consensus.agreement).toBe('0/0');
      expect(consensus.details).toContain('No provider recommendations');
    });
  });

  describe('_getCurrentDefault', () => {
    it('should return correct defaults for known stages', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      expect(analyzer._getCurrentDefault('sponsor-call-suggestions')).toBe('Claude Sonnet 4.5');
      expect(analyzer._getCurrentDefault('sprint-planning-decomposition')).toBe('Claude Opus 4.6');
      expect(analyzer._getCurrentDefault('seed-validation')).toBe('Claude Sonnet 4.5');
      expect(analyzer._getCurrentDefault('sprint-planning-validation-domain')).toBe('Claude Sonnet 4.5');
      expect(analyzer._getCurrentDefault('sprint-planning-validation-feature')).toBe('Claude Sonnet 4.5');
    });

    it('should return Unknown for unknown stages', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      expect(analyzer._getCurrentDefault('unknown-stage')).toBe('Unknown');
    });
  });

  describe('_compareWithDefault', () => {
    it('should detect perfect alignment', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      const models = {
        claude: { model: 'Claude Sonnet 4.5' },
        openai: { model: 'GPT-4 Sonnet' },
        gemini: { model: 'Gemini Sonnet' }
      };

      const comparison = analyzer._compareWithDefault(models, 'Claude Sonnet 4.5');

      expect(comparison.matchCount).toBe(3);
      expect(comparison.upgradeCount).toBe(0);
      expect(comparison.downgradeCount).toBe(0);
      expect(comparison.alignment).toBe('perfect');
    });

    it('should detect upgrade recommendations', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      const models = {
        claude: { model: 'Claude Opus 4.6' },
        openai: { model: 'GPT-5.2 Pro' }
      };

      const comparison = analyzer._compareWithDefault(models, 'Claude Sonnet 4.5');

      expect(comparison.upgradeCount).toBeGreaterThan(0);
      expect(comparison.alignment).not.toBe('perfect');
    });
  });

  describe('_isUpgrade', () => {
    it('should correctly identify upgrades', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      expect(analyzer._isUpgrade('opus', 'sonnet')).toBe(true);
      expect(analyzer._isUpgrade('sonnet', 'flash')).toBe(true);
      expect(analyzer._isUpgrade('pro', 'haiku')).toBe(true);
      expect(analyzer._isUpgrade('premium', 'standard')).toBe(true);
    });

    it('should correctly identify non-upgrades', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      expect(analyzer._isUpgrade('sonnet', 'opus')).toBe(false);
      expect(analyzer._isUpgrade('flash', 'sonnet')).toBe(false);
      expect(analyzer._isUpgrade('standard', 'premium')).toBe(false);
    });

    it('should handle unknown models', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      expect(analyzer._isUpgrade('unknown', 'sonnet')).toBe(false);
      expect(analyzer._isUpgrade('sonnet', 'unknown')).toBe(false);
    });
  });

  describe('_generateInsights', () => {
    it('should generate insights for full consensus', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      const models = {
        claude: { model: 'Claude Sonnet 4.5', confidence: 'High', cost: 0.005 },
        openai: { model: 'GPT-4 Sonnet', confidence: 'High', cost: 0.006 },
        gemini: { model: 'Gemini Sonnet', confidence: 'High', cost: 0.001 }
      };

      const consensus = { level: 'full', majority: 'sonnet', agreement: '3/3' };
      const comparison = { alignment: 'perfect', matchCount: 3, upgradeCount: 0, downgradeCount: 0 };

      const insights = analyzer._generateInsights(models, consensus, comparison);

      expect(insights.length).toBeGreaterThan(0);
      expect(insights.some(i => i.includes('Full consensus'))).toBe(true);
      expect(insights.some(i => i.includes('match current default'))).toBe(true);
      expect(insights.some(i => i.includes('high confidence'))).toBe(true);
    });

    it('should generate upgrade recommendation insights', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      const models = {
        claude: { model: 'Claude Opus 4.6', confidence: 'High', cost: 0.015 }
      };

      const consensus = { level: 'single', majority: 'opus', agreement: '1/1' };
      const comparison = { alignment: 'none', matchCount: 0, upgradeCount: 1, downgradeCount: 0 };

      const insights = analyzer._generateInsights(models, consensus, comparison);

      expect(insights.some(i => i.includes('recommend upgrading'))).toBe(true);
      expect(insights.some(i => i.includes('Higher pricing'))).toBe(true);
    });
  });

  describe('analyze', () => {
    it('should analyze all evaluation results', () => {
      const analyzer = new ModelRecommendationAnalyzer(mockEvaluationResults);

      const analysis = analyzer.analyze();

      expect(analysis.analyses).toHaveLength(2);
      expect(analysis.analyses[0].promptId).toBe('sponsor-call-suggestions');
      expect(analysis.analyses[1].promptId).toBe('sprint-planning-decomposition');
      expect(analysis.statistics).toBeDefined();
      expect(analysis.statistics.totalEvaluations).toBe(2);
    });
  });

  describe('_generateStatistics', () => {
    it('should generate correct statistics', () => {
      const analyzer = new ModelRecommendationAnalyzer(mockEvaluationResults);

      const analyses = [
        {
          consensus: { level: 'full' },
          comparison: { alignment: 'perfect', upgradeCount: 0, downgradeCount: 0 }
        },
        {
          consensus: { level: 'partial' },
          comparison: { alignment: 'partial', upgradeCount: 1, downgradeCount: 0 }
        },
        {
          consensus: { level: 'none' },
          comparison: { alignment: 'none', upgradeCount: 0, downgradeCount: 1 }
        }
      ];

      const stats = analyzer._generateStatistics(analyses);

      expect(stats.totalEvaluations).toBe(3);
      expect(stats.consensus.full).toBe(1);
      expect(stats.consensus.partial).toBe(1);
      expect(stats.consensus.none).toBe(1);
      expect(stats.upgradeRecommendations).toBe(1);
      expect(stats.downgradeRecommendations).toBe(1);
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate a valid markdown report', () => {
      const analyzer = new ModelRecommendationAnalyzer(mockEvaluationResults);

      const report = analyzer.generateMarkdownReport();

      expect(report).toContain('# Model Recommendations Report');
      expect(report).toContain('## Executive Summary');
      expect(report).toContain('## Per-Stage Analysis');
      expect(report).toContain('## Key Findings');
      expect(report).toContain('sponsor-call');
      expect(report).toContain('sprint-planning');
    });
  });

  describe('formatAsMarkdownTable', () => {
    it('should format analysis as markdown table', () => {
      const analyzer = new ModelRecommendationAnalyzer([]);

      const analysis = {
        promptId: 'test',
        ceremony: 'test-ceremony',
        stage: 'test-stage',
        stageName: 'Test Stage',
        currentDefault: 'Claude Sonnet 4.5',
        recommendations: {
          claude: {
            model: 'Claude Opus 4.6',
            confidence: 'High',
            reasoning: 'Best reasoning capabilities'
          }
        },
        consensus: { level: 'single', agreement: '1/1' },
        insights: ['Test insight']
      };

      const table = analyzer.formatAsMarkdownTable(analysis);

      expect(table).toContain('### Test Stage');
      expect(table).toContain('Current Default:');
      expect(table).toContain('Claude Sonnet 4.5');
      expect(table).toContain('| Provider | Recommended Model | Confidence | Reasoning |');
      expect(table).toContain('claude');
      expect(table).toContain('Claude Opus 4.6');
      expect(table).toContain('**Insights:**');
    });
  });

  describe('getAnalysis', () => {
    it('should return cached analysis', () => {
      const analyzer = new ModelRecommendationAnalyzer(mockEvaluationResults);

      const analysis1 = analyzer.analyze();
      const analysis2 = analyzer.getAnalysis();

      expect(analysis1).toBe(analysis2); // Same object reference
    });

    it('should run analysis if not cached', () => {
      const analyzer = new ModelRecommendationAnalyzer(mockEvaluationResults);

      const analysis = analyzer.getAnalysis();

      expect(analysis).toBeDefined();
      expect(analysis.analyses).toHaveLength(2);
    });
  });
});
