#!/usr/bin/env node

/**
 * Generate Summary Table from Model Evaluation Results
 * Creates a comprehensive table showing stage vs provider recommendations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load evaluation results from JSON file
 */
function loadResults() {
  const jsonPath = path.join(process.cwd(), '_temp', 'model-recommendations.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('❌ ERROR: model-recommendations.json not found in _temp/');
    console.error('   Please run "npm run models:evaluate" first.\n');
    process.exit(1);
  }

  const data = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(data);
}

/**
 * Truncate text to specified length
 */
function truncate(text, maxLength = 80) {
  if (!text) return 'N/A';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Generate markdown summary table
 */
function generateMarkdownTable(results) {
  const { evaluations } = results;

  let markdown = '# Model Evaluation Summary Table\n\n';
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += '---\n\n';

  // Group by ceremony
  const byCeremony = {};
  for (const evaluation of evaluations) {
    if (!byCeremony[evaluation.ceremony]) {
      byCeremony[evaluation.ceremony] = [];
    }
    byCeremony[evaluation.ceremony].push(evaluation);
  }

  // Generate table for each ceremony
  for (const [ceremony, ceremonyEvals] of Object.entries(byCeremony)) {
    markdown += `## ${ceremony.toUpperCase()}\n\n`;

    // Table header
    markdown += '| Stage | Current Default | Claude | OpenAI | Gemini | Consensus |\n';
    markdown += '|-------|-----------------|--------|--------|--------|----------|\n';

    for (const evaluation of ceremonyEvals) {
      const { stageName, analysis, recommendations } = evaluation;

      // Get current default from analysis
      const currentDefault = analysis?.currentDefault || 'Unknown';

      // Get provider recommendations
      const claudeRec = recommendations.claude?.model || '❌ Error';
      const openaiRec = recommendations.openai?.model || '❌ Error';
      const geminiRec = recommendations.gemini?.model || '❌ Error';

      // Get consensus
      const consensus = analysis?.consensus?.level || 'unknown';
      const consensusEmoji = consensus === 'full' ? '✅' :
                            consensus === 'partial' ? '⚠️' :
                            consensus === 'none' ? '❌' : '❓';
      const consensusText = `${consensusEmoji} ${consensus}`;

      markdown += `| ${stageName} | ${currentDefault} | ${claudeRec} | ${openaiRec} | ${geminiRec} | ${consensusText} |\n`;
    }

    markdown += '\n';
  }

  return markdown;
}

/**
 * Generate detailed table with reasoning
 */
function generateDetailedTable(results) {
  const { evaluations } = results;

  let markdown = '# Detailed Model Recommendations\n\n';
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += '---\n\n';

  // Group by ceremony
  const byCeremony = {};
  for (const evaluation of evaluations) {
    if (!byCeremony[evaluation.ceremony]) {
      byCeremony[evaluation.ceremony] = [];
    }
    byCeremony[evaluation.ceremony].push(evaluation);
  }

  // Generate detailed section for each ceremony
  for (const [ceremony, ceremonyEvals] of Object.entries(byCeremony)) {
    markdown += `## ${ceremony.toUpperCase()}\n\n`;

    for (const evaluation of ceremonyEvals) {
      const { stageName, analysis, recommendations } = evaluation;

      markdown += `### ${stageName}\n\n`;
      markdown += `**Current Default:** ${analysis?.currentDefault || 'Unknown'}\n\n`;
      markdown += `**Consensus:** ${analysis?.consensus?.level || 'unknown'} (${analysis?.consensus?.agreement || 'N/A'})\n\n`;

      // Provider recommendations table
      markdown += '| Provider | Model | Confidence | Reasoning |\n';
      markdown += '|----------|-------|------------|----------|\n';

      for (const [provider, rec] of Object.entries(recommendations)) {
        if (rec.status === 'error') {
          markdown += `| ${provider} | ❌ Error | N/A | ${rec.error} |\n`;
        } else {
          const reasoning = truncate(rec.reasoning, 100);
          markdown += `| ${provider} | ${rec.model} | ${rec.confidence} | ${reasoning} |\n`;
        }
      }

      markdown += '\n';

      // Insights
      if (analysis?.insights && analysis.insights.length > 0) {
        markdown += '**Insights:**\n';
        for (const insight of analysis.insights) {
          markdown += `- ${insight}\n`;
        }
        markdown += '\n';
      }

      markdown += '---\n\n';
    }
  }

  return markdown;
}

/**
 * Generate CSV export
 */
function generateCSV(results) {
  const { evaluations } = results;

  let csv = 'Ceremony,Stage,Current Default,Claude Model,Claude Confidence,OpenAI Model,OpenAI Confidence,Gemini Model,Gemini Confidence,Consensus,Consensus Level\n';

  for (const evaluation of evaluations) {
    const { ceremony, stageName, analysis, recommendations } = evaluation;

    const currentDefault = analysis?.currentDefault || 'Unknown';
    const claudeModel = recommendations.claude?.model || 'Error';
    const claudeConf = recommendations.claude?.confidence || 'N/A';
    const openaiModel = recommendations.openai?.model || 'Error';
    const openaiConf = recommendations.openai?.confidence || 'N/A';
    const geminiModel = recommendations.gemini?.model || 'Error';
    const geminiConf = recommendations.gemini?.confidence || 'N/A';
    const consensus = analysis?.consensus?.agreement || 'N/A';
    const consensusLevel = analysis?.consensus?.level || 'unknown';

    // Escape CSV fields
    const escapeCSV = (str) => `"${str.replace(/"/g, '""')}"`;

    csv += `${escapeCSV(ceremony)},${escapeCSV(stageName)},${escapeCSV(currentDefault)},`;
    csv += `${escapeCSV(claudeModel)},${escapeCSV(claudeConf)},`;
    csv += `${escapeCSV(openaiModel)},${escapeCSV(openaiConf)},`;
    csv += `${escapeCSV(geminiModel)},${escapeCSV(geminiConf)},`;
    csv += `${escapeCSV(consensus)},${escapeCSV(consensusLevel)}\n`;
  }

  return csv;
}

/**
 * Generate comparison matrix (Stage vs Provider)
 */
function generateComparisonMatrix(results) {
  const { evaluations } = results;

  let markdown = '# Stage vs Provider Recommendation Matrix\n\n';
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += 'This matrix shows which model each provider recommends for each stage.\n\n';
  markdown += '---\n\n';

  // Create matrix
  markdown += '| Stage | Claude | OpenAI | Gemini | Agreement |\n';
  markdown += '|-------|--------|--------|--------|----------|\n';

  for (const evaluation of evaluations) {
    const { ceremony, stage, stageName, recommendations, analysis } = evaluation;

    const claudeModel = recommendations.claude?.model || '❌';
    const openaiModel = recommendations.openai?.model || '❌';
    const geminiModel = recommendations.gemini?.model || '❌';

    // Consensus indicator
    const consensus = analysis?.consensus?.level || 'unknown';
    const agreementText = consensus === 'full' ? '✅ All agree' :
                         consensus === 'partial' ? `⚠️ ${analysis?.consensus?.agreement}` :
                         consensus === 'none' ? '❌ No consensus' :
                         '❓ Unknown';

    const stageLabel = `${ceremony}/${stage}`;

    markdown += `| ${stageLabel} | ${claudeModel} | ${openaiModel} | ${geminiModel} | ${agreementText} |\n`;
  }

  markdown += '\n---\n\n';

  // Add legend
  markdown += '## Legend\n\n';
  markdown += '- ✅ **Full consensus** - All providers recommend same model tier\n';
  markdown += '- ⚠️ **Partial consensus** - Majority agreement (2/3 providers)\n';
  markdown += '- ❌ **No consensus** - All providers recommend different models\n';
  markdown += '- ❌ **Error** - Provider query failed\n\n';

  return markdown;
}

/**
 * Generate statistics summary
 */
function generateStatistics(results) {
  const { summary, analysis } = results;

  let markdown = '# Evaluation Statistics\n\n';
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += '---\n\n';

  // Execution stats
  markdown += '## Execution Summary\n\n';
  markdown += `- **Total prompts evaluated:** ${summary.totalPrompts}\n`;
  markdown += `- **Successful queries:** ${summary.successfulQueries}\n`;
  markdown += `- **Failed queries:** ${summary.failedQueries}\n`;
  markdown += `- **Execution time:** ${summary.executionTime}\n\n`;

  // Cost breakdown
  markdown += '## Cost Breakdown\n\n';
  markdown += '| Provider | Cost |\n';
  markdown += '|----------|------|\n';
  for (const [provider, cost] of Object.entries(summary.totalCost)) {
    if (provider !== 'total') {
      markdown += `| ${provider} | $${cost.toFixed(4)} |\n`;
    }
  }
  markdown += `| **TOTAL** | **$${summary.totalCost.total.toFixed(4)}** |\n\n`;

  // Consensus statistics
  if (analysis && analysis.statistics) {
    markdown += '## Consensus Statistics\n\n';
    markdown += `- **Full consensus:** ${analysis.statistics.consensus.full} stages (${analysis.statistics.consensusRate.full})\n`;
    markdown += `- **Partial consensus:** ${analysis.statistics.consensus.partial} stages (${analysis.statistics.consensusRate.partial})\n`;
    markdown += `- **No consensus:** ${analysis.statistics.consensus.none} stages (${analysis.statistics.consensusRate.none})\n\n`;

    markdown += '## Default Alignment\n\n';
    markdown += `- **Perfect alignment:** ${analysis.statistics.defaultAlignment.perfect} stages\n`;
    markdown += `- **Partial alignment:** ${analysis.statistics.defaultAlignment.partial} stages\n`;
    markdown += `- **No alignment:** ${analysis.statistics.defaultAlignment.none} stages\n\n`;

    markdown += '## Recommendations\n\n';
    markdown += `- **Upgrade suggestions:** ${analysis.statistics.upgradeRecommendations} stages\n`;
    markdown += `- **Downgrade suggestions:** ${analysis.statistics.downgradeRecommendations} stages\n\n`;
  }

  return markdown;
}

/**
 * Main function
 */
function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Generate Summary Tables from Evaluation           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Load results
  console.log('📂 Loading evaluation results...');
  const results = loadResults();
  console.log('   ✓ Results loaded\n');

  // Generate outputs
  const tempDir = path.join(process.cwd(), '_temp');

  console.log('📊 Generating summary tables...\n');

  // 1. Simple summary table
  const summaryTable = generateMarkdownTable(results);
  const summaryPath = path.join(tempDir, 'EVALUATION_SUMMARY_TABLE.md');
  fs.writeFileSync(summaryPath, summaryTable, 'utf-8');
  console.log(`   ✓ Summary table: ${summaryPath}`);

  // 2. Detailed table with reasoning
  const detailedTable = generateDetailedTable(results);
  const detailedPath = path.join(tempDir, 'EVALUATION_DETAILED_TABLE.md');
  fs.writeFileSync(detailedPath, detailedTable, 'utf-8');
  console.log(`   ✓ Detailed table: ${detailedPath}`);

  // 3. Comparison matrix
  const comparisonMatrix = generateComparisonMatrix(results);
  const matrixPath = path.join(tempDir, 'EVALUATION_COMPARISON_MATRIX.md');
  fs.writeFileSync(matrixPath, comparisonMatrix, 'utf-8');
  console.log(`   ✓ Comparison matrix: ${matrixPath}`);

  // 4. Statistics
  const statistics = generateStatistics(results);
  const statsPath = path.join(tempDir, 'EVALUATION_STATISTICS.md');
  fs.writeFileSync(statsPath, statistics, 'utf-8');
  console.log(`   ✓ Statistics: ${statsPath}`);

  // 5. CSV export
  const csv = generateCSV(results);
  const csvPath = path.join(tempDir, 'evaluation-results.csv');
  fs.writeFileSync(csvPath, csv, 'utf-8');
  console.log(`   ✓ CSV export: ${csvPath}`);

  console.log('\n✅ All tables generated successfully!\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateMarkdownTable, generateDetailedTable, generateComparisonMatrix, generateCSV, generateStatistics };
