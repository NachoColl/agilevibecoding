#!/usr/bin/env node

/**
 * Model Selector - Multi-Provider Model Evaluation Tool
 * Queries Claude, OpenAI, and Gemini with evaluation prompts
 * to collect model recommendations for each AVC stage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EVALUATION_PROMPTS, getPromptStats } from './evaluation-prompts.js';
import { ModelQueryEngine } from './model-query-engine.js';
import { ModelRecommendationAnalyzer } from './model-recommendation-analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensure _temp directory exists
 */
function ensureTempDir() {
  const tempDir = path.join(process.cwd(), '_temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Display banner
 */
function displayBanner() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║      Multi-Provider Model Selection Evaluator               ║');
  console.log('║      Queries Claude, OpenAI, and Gemini for recommendations  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

/**
 * Display environment check
 */
function displayEnvironmentCheck() {
  console.log('🔍 Checking API keys...\n');

  const keys = {
    'ANTHROPIC_API_KEY': !!process.env.ANTHROPIC_API_KEY,
    'OPENAI_API_KEY': !!process.env.OPENAI_API_KEY,
    'GEMINI_API_KEY': !!process.env.GEMINI_API_KEY
  };

  for (const [key, available] of Object.entries(keys)) {
    console.log(`   ${available ? '✓' : '✗'} ${key}: ${available ? 'Found' : 'Not found'}`);
  }

  const availableCount = Object.values(keys).filter(v => v).length;

  console.log(`\n   ${availableCount}/3 providers available\n`);

  if (availableCount === 0) {
    console.error('❌ ERROR: No API keys found. Please add at least one to your .env file.\n');
    process.exit(1);
  }

  return availableCount;
}

/**
 * Display prompt statistics
 */
function displayPromptStats() {
  const stats = getPromptStats();

  console.log('📊 Evaluation Overview\n');
  console.log(`   Total prompts: ${stats.totalPrompts}`);
  console.log(`   Ceremonies: ${stats.ceremonies} (${stats.ceremonyList.join(', ')})`);
  console.log(`   Estimated total API calls: ${stats.estimatedTotalCalls} per provider\n`);
  console.log('   Impact distribution:');
  console.log(`     - CRITICAL: ${stats.impactDistribution.CRITICAL}`);
  console.log(`     - VERY HIGH: ${stats.impactDistribution['VERY HIGH']}`);
  console.log(`     - HIGH: ${stats.impactDistribution.HIGH}`);
  console.log(`     - MEDIUM: ${stats.impactDistribution.MEDIUM}\n`);
}

/**
 * Progress callback for query engine
 */
function createProgressCallback() {
  let currentPrompt = 0;

  return (progress) => {
    if (progress.type === 'prompt-start') {
      currentPrompt = progress.current;
      console.log(`\n[${progress.current}/${progress.total}] Processing: ${progress.ceremony}/${progress.stage}`);
    } else if (progress.type === 'prompt-complete') {
      const { successCount, failureCount, totalTime } = progress;
      console.log(`   ✓ Complete: ${successCount} success, ${failureCount} failed (${totalTime.toFixed(1)}s)`);
    }
  };
}

/**
 * Write JSON output file
 */
function writeJSONOutput(data, outputPath) {
  console.log(`\n💾 Writing JSON output to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('   ✓ JSON file written');
}

/**
 * Write Markdown output file
 */
function writeMarkdownOutput(content, outputPath) {
  console.log(`\n💾 Writing Markdown report to ${outputPath}...`);
  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log('   ✓ Markdown report written');
}

/**
 * Display summary
 */
function displaySummary(summary) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Execution Summary                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`Total prompts evaluated: ${summary.totalPrompts}`);
  console.log(`Successful queries: ${summary.successfulQueries}`);
  console.log(`Failed queries: ${summary.failedQueries}`);
  console.log(`\nExecution time: ${summary.executionTime}`);

  console.log('\nCost breakdown:');
  for (const [provider, cost] of Object.entries(summary.totalCost)) {
    if (provider !== 'total') {
      console.log(`   ${provider}: $${cost.toFixed(4)}`);
    }
  }
  console.log(`   TOTAL: $${summary.totalCost.total.toFixed(4)}`);
}

/**
 * Display analysis summary
 */
function displayAnalysisSummary(statistics) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   Analysis Summary                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('Consensus Statistics:');
  console.log(`   Full consensus: ${statistics.consensus.full} (${statistics.consensusRate.full})`);
  console.log(`   Partial consensus: ${statistics.consensus.partial} (${statistics.consensusRate.partial})`);
  console.log(`   No consensus: ${statistics.consensus.none} (${statistics.consensusRate.none})`);

  console.log('\nDefault Alignment:');
  console.log(`   Perfect: ${statistics.defaultAlignment.perfect} stages`);
  console.log(`   Partial: ${statistics.defaultAlignment.partial} stages`);
  console.log(`   None: ${statistics.defaultAlignment.none} stages`);

  console.log('\nRecommendations:');
  console.log(`   Upgrade suggestions: ${statistics.upgradeRecommendations} stages`);
  console.log(`   Downgrade suggestions: ${statistics.downgradeRecommendations} stages`);
}

/**
 * Main execution function
 */
async function main() {
  try {
    displayBanner();

    // Check environment
    const availableProviders = displayEnvironmentCheck();

    // Display stats
    displayPromptStats();

    // Confirm execution
    console.log('⚠️  This will execute multiple API calls to all available providers.');
    console.log('   Estimated cost: $0.15-0.30 depending on available providers.\n');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    // Wait 5 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🚀 Starting evaluation...\n');

    // Initialize query engine
    const engine = new ModelQueryEngine();

    console.log('📡 Initializing providers...');
    const initResult = await engine.initializeProviders();

    console.log(`   ✓ ${initResult.readyCount} provider(s) initialized`);

    if (initResult.errors) {
      console.log('\n⚠️  Some providers failed to initialize:');
      for (const error of initResult.errors) {
        console.log(`   - ${error.provider}: ${error.error}`);
      }
    }

    // Run evaluation
    console.log('\n🔄 Querying providers (this may take several minutes)...');

    const progressCallback = createProgressCallback();
    const results = await engine.evaluateAll(EVALUATION_PROMPTS, progressCallback);

    console.log('\n✓ All evaluations complete!');

    // Analyze results
    console.log('\n🔍 Analyzing results...');
    const analyzer = new ModelRecommendationAnalyzer(results.evaluations);
    const analysis = analyzer.analyze();
    console.log('   ✓ Analysis complete');

    // Ensure _temp directory exists
    const tempDir = ensureTempDir();

    // Write JSON output
    const jsonPath = path.join(tempDir, 'model-recommendations.json');
    const jsonOutput = {
      ...results,
      analysis: analysis.analyses,
      statistics: analysis.statistics
    };
    writeJSONOutput(jsonOutput, jsonPath);

    // Write Markdown report
    const markdownPath = path.join(tempDir, 'MODEL_RECOMMENDATIONS_REPORT.md');
    const markdownReport = analyzer.generateMarkdownReport();
    writeMarkdownOutput(markdownReport, markdownPath);

    // Display summaries
    displaySummary(results.summary);
    displayAnalysisSummary(analysis.statistics);

    // Final message
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    ✓ Evaluation Complete!                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('📄 Output files:');
    console.log(`   - JSON: ${jsonPath}`);
    console.log(`   - Report: ${markdownPath}\n`);

    console.log('💡 Next steps:');
    console.log('   1. Review the markdown report for provider recommendations');
    console.log('   2. Compare consensus vs current defaults');
    console.log('   3. Consider cost vs quality trade-offs');
    console.log('   4. Update model configurations in AVC if desired\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
