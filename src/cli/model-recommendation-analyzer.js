/**
 * Model Recommendation Analyzer
 * Analyzes multi-provider recommendations and generates insights
 *
 * Compares provider recommendations, detects consensus patterns,
 * and generates human-readable analysis reports.
 */

/**
 * Debug logging helper
 */
function debug(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[DEBUG][${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[DEBUG][${timestamp}] ${message}`);
  }
}

export class ModelRecommendationAnalyzer {
  constructor(evaluationResults) {
    this.evaluationResults = evaluationResults;
    this.analysis = null;
  }

  /**
   * Analyze all evaluation results
   * Compares recommendations across providers and generates insights
   * @returns {Object} Complete analysis with consensus and insights
   */
  analyze() {
    debug('Starting analysis of evaluation results...');

    const analyses = [];

    for (const evaluation of this.evaluationResults) {
      const analysisResult = this._analyzeEvaluation(evaluation);
      analyses.push(analysisResult);
    }

    // Generate overall statistics
    const stats = this._generateStatistics(analyses);

    this.analysis = {
      analyses,
      statistics: stats,
      timestamp: new Date().toISOString()
    };

    debug(`Analysis complete: ${analyses.length} evaluations analyzed`);

    return this.analysis;
  }

  /**
   * Analyze a single evaluation (one prompt, multiple provider responses)
   * @param {Object} evaluation - Evaluation result with recommendations from providers
   * @returns {Object} Analysis result with consensus and insights
   */
  _analyzeEvaluation(evaluation) {
    const { promptId, ceremony, stage, stageName, recommendations } = evaluation;

    debug(`Analyzing evaluation: ${promptId}`);

    // Extract model recommendations
    const modelsByProvider = {};
    for (const [provider, rec] of Object.entries(recommendations)) {
      if (rec.status === 'success') {
        modelsByProvider[provider] = {
          model: rec.model,
          reasoning: rec.reasoning,
          confidence: rec.confidence,
          cost: rec.cost
        };
      }
    }

    // Detect consensus
    const consensus = this._detectConsensus(modelsByProvider);

    // Compare with current default
    const currentDefault = this._getCurrentDefault(promptId);
    const comparison = this._compareWithDefault(modelsByProvider, currentDefault);

    // Generate insights
    const insights = this._generateInsights(modelsByProvider, consensus, comparison);

    return {
      promptId,
      ceremony,
      stage,
      stageName,
      currentDefault,
      recommendations: modelsByProvider,
      consensus,
      comparison,
      insights
    };
  }

  /**
   * Detect consensus level across provider recommendations
   * @param {Object} modelsByProvider - Models recommended by each provider
   * @returns {Object} Consensus information
   */
  _detectConsensus(modelsByProvider) {
    const providers = Object.keys(modelsByProvider);
    const models = Object.values(modelsByProvider).map(r => r.model);

    if (providers.length === 0) {
      return { level: 'none', agreement: '0/0', details: 'No provider recommendations available' };
    }

    if (providers.length === 1) {
      return {
        level: 'single',
        agreement: '1/1',
        model: models[0],
        details: `Only ${providers[0]} available`
      };
    }

    // Count model occurrences
    const modelCounts = {};
    for (const model of models) {
      // Normalize model names for comparison (lowercase, remove versions)
      const normalized = this._normalizeModelName(model);
      modelCounts[normalized] = (modelCounts[normalized] || 0) + 1;
    }

    // Find most common recommendation
    const sortedModels = Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1]);

    const [topModel, topCount] = sortedModels[0];
    const totalProviders = providers.length;

    // Determine consensus level
    let level, agreement, details;
    if (topCount === totalProviders) {
      level = 'full';
      agreement = `${topCount}/${totalProviders}`;
      details = `All providers recommend same model tier`;
    } else if (topCount >= Math.ceil(totalProviders / 2)) {
      level = 'partial';
      agreement = `${topCount}/${totalProviders}`;
      details = `Majority agreement (${topCount}/${totalProviders})`;
    } else {
      level = 'none';
      agreement = `0/${totalProviders}`;
      details = 'No consensus - all providers recommend different models';
    }

    return {
      level,
      agreement,
      majority: topModel,
      minorityCount: totalProviders - topCount,
      details,
      distribution: modelCounts
    };
  }

  /**
   * Normalize model name for comparison
   * Removes version numbers and normalizes tier names
   * @param {string} modelName - Original model name
   * @returns {string} Normalized model name
   */
  _normalizeModelName(modelName) {
    const lower = modelName.toLowerCase();

    // Identify tier
    if (lower.includes('opus')) return 'opus';
    if (lower.includes('sonnet')) return 'sonnet';
    if (lower.includes('haiku')) return 'haiku';
    if (lower.includes('flash')) return 'flash';
    if (lower.includes('pro')) return 'pro';
    if (lower.includes('gpt-5') || lower.includes('gpt-4')) return 'premium';
    if (lower.includes('gpt-3')) return 'standard';

    // Return original if no pattern matched
    return lower;
  }

  /**
   * Get current default model for a stage
   * @param {string} promptId - Prompt ID
   * @returns {string} Current default model name
   */
  _getCurrentDefault(promptId) {
    // Map prompt IDs to current defaults (from AVC_DEFAULT_LLMS.md metadata)
    const defaults = {
      'sponsor-call-suggestions': 'Claude Sonnet 4.5',
      'sponsor-call-documentation': 'Claude Sonnet 4.5',
      'sponsor-call-context': 'Claude Sonnet 4.5',
      'sponsor-call-validation': 'Claude Sonnet 4.5',
      'sprint-planning-decomposition': 'Claude Opus 4.6',
      'sprint-planning-validation-universal': 'Claude Sonnet 4.5',
      'sprint-planning-validation-domain': 'Claude Sonnet 4.5',
      'sprint-planning-validation-feature': 'Claude Sonnet 4.5',
      'sprint-planning-context-generation': 'Claude Sonnet 4.5',
      'seed-decomposition': 'Claude Opus 4.6',
      'seed-validation': 'Claude Sonnet 4.5',
      'seed-context-generation': 'Claude Sonnet 4.5',
      'context-retrospective-documentation-update': 'Claude Sonnet 4.5',
      'context-retrospective-context-refinement': 'Claude Opus 4.6'
    };

    return defaults[promptId] || 'Unknown';
  }

  /**
   * Compare provider recommendations with current default
   * @param {Object} modelsByProvider - Models recommended by each provider
   * @param {string} currentDefault - Current default model
   * @returns {Object} Comparison result
   */
  _compareWithDefault(modelsByProvider, currentDefault) {
    const normalizedDefault = this._normalizeModelName(currentDefault);

    let matchCount = 0;
    let upgradeCount = 0;
    let downgradeCount = 0;

    for (const rec of Object.values(modelsByProvider)) {
      const normalized = this._normalizeModelName(rec.model);

      if (normalized === normalizedDefault) {
        matchCount++;
      } else if (this._isUpgrade(normalized, normalizedDefault)) {
        upgradeCount++;
      } else {
        downgradeCount++;
      }
    }

    const totalRecommendations = Object.keys(modelsByProvider).length;

    return {
      matchCount,
      upgradeCount,
      downgradeCount,
      totalRecommendations,
      alignment: matchCount === totalRecommendations ? 'perfect' :
                 matchCount > 0 ? 'partial' : 'none'
    };
  }

  /**
   * Determine if model is an upgrade from current
   * @param {string} recommended - Normalized recommended model
   * @param {string} current - Normalized current model
   * @returns {boolean} True if recommended is higher tier
   */
  _isUpgrade(recommended, current) {
    const tiers = ['flash', 'haiku', 'standard', 'sonnet', 'pro', 'opus', 'premium'];
    const recIndex = tiers.indexOf(recommended);
    const curIndex = tiers.indexOf(current);

    if (recIndex === -1 || curIndex === -1) return false;
    return recIndex > curIndex;
  }

  /**
   * Generate insights from analysis
   * @param {Object} modelsByProvider - Models recommended by each provider
   * @param {Object} consensus - Consensus information
   * @param {Object} comparison - Comparison with current default
   * @returns {Array} Array of insight strings
   */
  _generateInsights(modelsByProvider, consensus, comparison) {
    const insights = [];

    // Consensus insights
    if (consensus.level === 'full') {
      insights.push(`✓ Full consensus: All providers agree on ${consensus.majority} tier`);
    } else if (consensus.level === 'partial') {
      insights.push(`⚠ Partial consensus: ${consensus.agreement} providers agree on ${consensus.majority} tier`);
    } else if (consensus.level === 'none') {
      insights.push(`✗ No consensus: Providers recommend different model tiers`);
    }

    // Default comparison insights
    if (comparison.alignment === 'perfect') {
      insights.push(`✓ All provider recommendations match current default`);
    } else if (comparison.upgradeCount > 0) {
      insights.push(`⬆ ${comparison.upgradeCount} provider(s) recommend upgrading from current default`);
    } else if (comparison.downgradeCount > 0) {
      insights.push(`⬇ ${comparison.downgradeCount} provider(s) recommend downgrading from current default`);
    }

    // Cost insights
    const costs = Object.values(modelsByProvider).map(r => r.cost);
    const avgCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;
    if (avgCost > 0.01) {
      insights.push(`💰 Higher pricing tier recommended (avg cost: $${avgCost.toFixed(4)} per query)`);
    } else if (avgCost < 0.001) {
      insights.push(`💰 Budget-friendly tier recommended (avg cost: $${avgCost.toFixed(4)} per query)`);
    }

    // Confidence insights
    const confidenceLevels = Object.values(modelsByProvider).map(r => r.confidence);
    const highConfidence = confidenceLevels.filter(c => c === 'High').length;
    if (highConfidence === confidenceLevels.length) {
      insights.push(`✓ All providers express high confidence in recommendations`);
    } else if (highConfidence === 0) {
      insights.push(`⚠ Low provider confidence - recommendations may need review`);
    }

    return insights;
  }

  /**
   * Generate overall statistics from all analyses
   * @param {Array} analyses - Array of analysis results
   * @returns {Object} Overall statistics
   */
  _generateStatistics(analyses) {
    const total = analyses.length;

    const consensus = {
      full: analyses.filter(a => a.consensus.level === 'full').length,
      partial: analyses.filter(a => a.consensus.level === 'partial').length,
      none: analyses.filter(a => a.consensus.level === 'none').length
    };

    const defaultAlignment = {
      perfect: analyses.filter(a => a.comparison.alignment === 'perfect').length,
      partial: analyses.filter(a => a.comparison.alignment === 'partial').length,
      none: analyses.filter(a => a.comparison.alignment === 'none').length
    };

    const upgradeRecommendations = analyses.filter(a => a.comparison.upgradeCount > 0).length;
    const downgradeRecommendations = analyses.filter(a => a.comparison.downgradeCount > 0).length;

    return {
      totalEvaluations: total,
      consensus,
      consensusRate: {
        full: ((consensus.full / total) * 100).toFixed(1) + '%',
        partial: ((consensus.partial / total) * 100).toFixed(1) + '%',
        none: ((consensus.none / total) * 100).toFixed(1) + '%'
      },
      defaultAlignment,
      upgradeRecommendations,
      downgradeRecommendations
    };
  }

  /**
   * Format analysis as markdown table
   * @param {Object} analysis - Analysis result for one evaluation
   * @returns {string} Markdown table
   */
  formatAsMarkdownTable(analysis) {
    const { promptId, ceremony, stage, stageName, currentDefault, recommendations, consensus, insights } = analysis;

    let md = `### ${stageName} (${ceremony}/${stage})\n\n`;
    md += `**Current Default:** ${currentDefault}\n\n`;
    md += `**Consensus:** ${consensus.level} (${consensus.agreement})\n\n`;

    // Provider recommendations table
    md += '| Provider | Recommended Model | Confidence | Reasoning |\n';
    md += '|----------|-------------------|------------|----------|\n';

    for (const [provider, rec] of Object.entries(recommendations)) {
      const reasoning = rec.reasoning.length > 100
        ? rec.reasoning.substring(0, 97) + '...'
        : rec.reasoning;
      md += `| ${provider} | ${rec.model} | ${rec.confidence} | ${reasoning} |\n`;
    }

    // Insights
    if (insights.length > 0) {
      md += '\n**Insights:**\n';
      for (const insight of insights) {
        md += `- ${insight}\n`;
      }
    }

    md += '\n---\n\n';
    return md;
  }

  /**
   * Generate complete markdown report
   * @returns {string} Complete markdown report
   */
  generateMarkdownReport() {
    if (!this.analysis) {
      this.analyze();
    }

    const { analyses, statistics } = this.analysis;

    let report = '# Model Recommendations Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    // Executive Summary
    report += '## Executive Summary\n\n';
    report += `Total Evaluations: ${statistics.totalEvaluations}\n\n`;
    report += '### Consensus Statistics\n\n';
    report += `- **Full Consensus:** ${statistics.consensus.full} (${statistics.consensusRate.full})\n`;
    report += `- **Partial Consensus:** ${statistics.consensus.partial} (${statistics.consensusRate.partial})\n`;
    report += `- **No Consensus:** ${statistics.consensus.none} (${statistics.consensusRate.none})\n\n`;
    report += '### Default Alignment\n\n';
    report += `- **Perfect Alignment:** ${statistics.defaultAlignment.perfect} stages\n`;
    report += `- **Partial Alignment:** ${statistics.defaultAlignment.partial} stages\n`;
    report += `- **No Alignment:** ${statistics.defaultAlignment.none} stages\n\n`;
    report += `- **Upgrade Recommendations:** ${statistics.upgradeRecommendations} stages\n`;
    report += `- **Downgrade Recommendations:** ${statistics.downgradeRecommendations} stages\n\n`;

    report += '---\n\n';

    // Per-stage analysis
    report += '## Per-Stage Analysis\n\n';

    // Group by ceremony
    const byCeremony = {};
    for (const analysis of analyses) {
      if (!byCeremony[analysis.ceremony]) {
        byCeremony[analysis.ceremony] = [];
      }
      byCeremony[analysis.ceremony].push(analysis);
    }

    for (const [ceremony, ceremonyAnalyses] of Object.entries(byCeremony)) {
      report += `## ${ceremony}\n\n`;
      for (const analysis of ceremonyAnalyses) {
        report += this.formatAsMarkdownTable(analysis);
      }
    }

    // Key Findings
    report += '## Key Findings\n\n';
    report += this._generateKeyFindings(analyses, statistics);

    return report;
  }

  /**
   * Generate key findings section
   * @param {Array} analyses - All analysis results
   * @param {Object} statistics - Overall statistics
   * @returns {string} Key findings markdown
   */
  _generateKeyFindings(analyses, statistics) {
    let findings = '';

    // Find stages with full consensus
    const fullConsensus = analyses.filter(a => a.consensus.level === 'full');
    if (fullConsensus.length > 0) {
      findings += '### Strong Agreement\n\n';
      findings += 'Stages where all providers agree:\n\n';
      for (const analysis of fullConsensus) {
        findings += `- **${analysis.stageName}**: ${analysis.consensus.majority}\n`;
      }
      findings += '\n';
    }

    // Find stages with no consensus
    const noConsensus = analyses.filter(a => a.consensus.level === 'none');
    if (noConsensus.length > 0) {
      findings += '### Disagreement Areas\n\n';
      findings += 'Stages where providers recommend different models:\n\n';
      for (const analysis of noConsensus) {
        findings += `- **${analysis.stageName}**: ${Object.keys(analysis.recommendations).length} different recommendations\n`;
      }
      findings += '\n';
    }

    // Find upgrade recommendations
    const upgrades = analyses.filter(a => a.comparison.upgradeCount > 0);
    if (upgrades.length > 0) {
      findings += '### Suggested Upgrades\n\n';
      findings += 'Stages where providers recommend higher-tier models:\n\n';
      for (const analysis of upgrades) {
        findings += `- **${analysis.stageName}**: ${analysis.comparison.upgradeCount} provider(s) recommend upgrade from ${analysis.currentDefault}\n`;
      }
      findings += '\n';
    }

    return findings;
  }

  /**
   * Get analysis results
   * @returns {Object} Analysis results
   */
  getAnalysis() {
    if (!this.analysis) {
      this.analyze();
    }
    return this.analysis;
  }
}
