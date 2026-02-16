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
import { sendError, sendWarning, sendSuccess, sendInfo, sendOutput, sendIndented, sendSectionHeader } from './messaging-api.js';

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
  sendSectionHeader('Checking API keys');

  const keys = {
    'ANTHROPIC_API_KEY': !!process.env.ANTHROPIC_API_KEY,
    'OPENAI_API_KEY': !!process.env.OPENAI_API_KEY,
    'GEMINI_API_KEY': !!process.env.GEMINI_API_KEY
  };

  for (const [key, available] of Object.entries(keys)) {
    if (available) {
      sendIndented(`${key}: Found`, 1);
    } else {
      sendIndented(`${key}: Not found`, 1);
    }
  }

  const availableCount = Object.values(keys).filter(v => v).length;

  sendOutput(`\n   ${availableCount}/3 providers available`);

  if (availableCount === 0) {
    sendError('No API keys found. Please add at least one to your .env file.');
    process.exit(1);
  }

  return availableCount;
}

/**
 * Display prompt statistics
 */
function displayPromptStats() {
  const stats = getPromptStats();

  sendSectionHeader('Evaluation Overview');
  sendIndented(`Total prompts: ${stats.totalPrompts}`, 1);
  sendIndented(`Ceremonies: ${stats.ceremonies} (${stats.ceremonyList.join(', ')})`, 1);
  sendIndented(`Estimated total API calls: ${stats.estimatedTotalCalls} per provider`, 1);
  sendIndented('Impact distribution:', 1);
  sendIndented(`- CRITICAL: ${stats.impactDistribution.CRITICAL}`, 2);
  sendIndented(`- VERY HIGH: ${stats.impactDistribution['VERY HIGH']}`, 2);
  sendIndented(`- HIGH: ${stats.impactDistribution.HIGH}`, 2);
  sendIndented(`- MEDIUM: ${stats.impactDistribution.MEDIUM}`, 2);
}

/**
 * Progress callback for query engine
 */
function createProgressCallback() {
  let currentPrompt = 0;

  return (progress) => {
    if (progress.type === 'prompt-start') {
      currentPrompt = progress.current;
      sendOutput(`\n[${progress.current}/${progress.total}] Processing: ${progress.ceremony}/${progress.stage}`);
    } else if (progress.type === 'prompt-complete') {
      const { successCount, failureCount, totalTime } = progress;
      sendIndented(`Complete: ${successCount} success, ${failureCount} failed (${totalTime.toFixed(1)}s)`, 1);
    }
  };
}

/**
 * Write JSON output file
 */
function writeJSONOutput(data, outputPath) {
  sendInfo(`Writing JSON output to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  sendIndented('JSON file written', 1);
}

/**
 * Write Markdown output file
 */
function writeMarkdownOutput(content, outputPath) {
  sendInfo(`Writing Markdown report to ${outputPath}...`);
  fs.writeFileSync(outputPath, content, 'utf-8');
  sendIndented('Markdown report written', 1);
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
    sendWarning('This will execute multiple API calls to all available providers.');
    sendIndented('Estimated cost: $0.15-0.30 depending on available providers.', 1);
    sendIndented('Press Ctrl+C to cancel, or wait 5 seconds to continue...', 1);

    // Wait 5 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));

    sendInfo('Starting evaluation...');

    // Initialize query engine
    const engine = new ModelQueryEngine();

    sendInfo('Initializing providers...');
    const initResult = await engine.initializeProviders();

    sendIndented(`${initResult.readyCount} provider(s) initialized`, 1);

    if (initResult.errors) {
      sendWarning('Some providers failed to initialize:');
      for (const error of initResult.errors) {
        sendIndented(`- ${error.provider}: ${error.error}`, 1);
      }
    }

    // Run evaluation
    sendInfo('Querying providers (this may take several minutes)...');

    const progressCallback = createProgressCallback();
    const results = await engine.evaluateAll(EVALUATION_PROMPTS, progressCallback);

    sendSuccess('All evaluations complete!');

    // Analyze results
    sendInfo('Analyzing results...');
    const analyzer = new ModelRecommendationAnalyzer(results.evaluations);
    const analysis = analyzer.analyze();
    sendIndented('Analysis complete', 1);

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
    sendOutput('\n╔══════════════════════════════════════════════════════════════╗');
    sendOutput('║                    Evaluation Complete!                      ║');
    sendOutput('╚══════════════════════════════════════════════════════════════╝');
    sendSectionHeader('Output files');
    sendIndented(`- JSON: ${jsonPath}`, 1);
    sendIndented(`- Report: ${markdownPath}`, 1);

    sendSectionHeader('Next steps');
    sendIndented('1. Review the markdown report for provider recommendations', 1);
    sendIndented('2. Compare consensus vs current defaults', 1);
    sendIndented('3. Consider cost vs quality trade-offs', 1);
    sendIndented('4. Update model configurations in AVC if desired', 1);

  } catch (error) {
    sendError(`ERROR: ${error.message}`);
    sendOutput(`\nStack trace: ${error.stack}`);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
