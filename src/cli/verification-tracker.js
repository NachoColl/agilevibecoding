/**
 * VerificationTracker - Tracks LLM verification workflow efficiency
 *
 * Provides comprehensive tracking of verification sessions:
 * - Per-rule execution metrics (timing, results, content changes)
 * - Per-agent session statistics (violations, API calls, duration)
 * - Ceremony-level summaries (total overhead, most violated rules)
 *
 * Outputs:
 * - Real-time console logs during execution
 * - Structured JSON data for analysis
 * - Human-readable summary report
 */

import fs from 'fs';
import path from 'path';

class VerificationTracker {
  constructor(ceremonyName) {
    this.ceremonyName = ceremonyName;
    this.ceremonyStartTime = Date.now();
    this.sessions = [];
    this.currentSession = null;
    this.currentRuleExecution = null;
  }

  /**
   * Start tracking a verification session for an agent
   */
  startSession(agentName, inputContent) {
    this.currentSession = {
      sessionId: `verify-${this.sessions.length + 1}`,
      agentName,
      startTime: new Date().toISOString(),
      startTimeMs: Date.now(),
      input: {
        contentLength: inputContent.length,
        contentPreview: inputContent.substring(0, 200),
        contentHash: this.hashContent(inputContent)
      },
      ruleExecutions: [],
      violations: []
    };
  }

  /**
   * Start tracking a rule check
   */
  startRuleCheck(rule) {
    this.currentRuleExecution = {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      checkStartTime: new Date().toISOString(),
      checkStartTimeMs: Date.now()
    };
  }

  /**
   * End tracking a rule check
   */
  endRuleCheck(result) {
    this.currentRuleExecution.checkEndTime = new Date().toISOString();
    this.currentRuleExecution.checkEndTimeMs = Date.now();
    this.currentRuleExecution.checkDurationMs =
      this.currentRuleExecution.checkEndTimeMs - this.currentRuleExecution.checkStartTimeMs;
    this.currentRuleExecution.checkResult = result;
    this.currentRuleExecution.wasViolated = result === 'YES';
  }

  /**
   * Start tracking a rule fix
   */
  startRuleFix(contentLength) {
    this.currentRuleExecution.fixApplied = true;
    this.currentRuleExecution.fixStartTime = new Date().toISOString();
    this.currentRuleExecution.fixStartTimeMs = Date.now();
    this.currentRuleExecution.contentLengthBefore = contentLength;
  }

  /**
   * End tracking a rule fix
   */
  endRuleFix(contentLength) {
    this.currentRuleExecution.fixEndTime = new Date().toISOString();
    this.currentRuleExecution.fixEndTimeMs = Date.now();
    this.currentRuleExecution.fixDurationMs =
      this.currentRuleExecution.fixEndTimeMs - this.currentRuleExecution.fixStartTimeMs;
    this.currentRuleExecution.contentLengthAfter = contentLength;
    this.currentRuleExecution.contentChangedBy =
      contentLength - this.currentRuleExecution.contentLengthBefore;

    // Add to violations list
    this.currentSession.violations.push({
      ruleId: this.currentRuleExecution.ruleId,
      severity: this.currentRuleExecution.severity,
      fixed: true
    });
  }

  /**
   * Complete the current rule execution
   */
  completeRule() {
    if (this.currentRuleExecution && this.currentSession) {
      this.currentSession.ruleExecutions.push(this.currentRuleExecution);
      this.currentRuleExecution = null;
    }
  }

  /**
   * End the current verification session
   */
  endSession(outputContent, rulesApplied) {
    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.endTimeMs = Date.now();
    this.currentSession.durationMs =
      this.currentSession.endTimeMs - this.currentSession.startTimeMs;

    this.currentSession.output = {
      contentLength: outputContent.length,
      contentPreview: outputContent.substring(0, 200),
      contentChangedBy: outputContent.length - this.currentSession.input.contentLength,
      rulesAppliedCount: rulesApplied.length
    };

    // Calculate statistics
    const executions = this.currentSession.ruleExecutions;
    this.currentSession.ruleStats = {
      totalRulesChecked: executions.length,
      rulesPassed: executions.filter(e => !e.wasViolated).length,
      rulesViolated: executions.filter(e => e.wasViolated).length,
      rulesFixed: executions.filter(e => e.fixApplied).length,
      rulesSkipped: 0
    };

    this.currentSession.apiCalls = {
      checkCalls: executions.length,
      fixCalls: executions.filter(e => e.fixApplied).length,
      totalCalls: executions.length + executions.filter(e => e.fixApplied).length
    };

    this.sessions.push(this.currentSession);
    this.currentSession = null;
  }

  /**
   * Get complete ceremony summary
   */
  getCeremonySummary() {
    const ceremonyEndTime = Date.now();
    const ceremonyDurationMs = ceremonyEndTime - this.ceremonyStartTime;

    const summary = {
      ceremonyName: this.ceremonyName,
      ceremonyStartTime: new Date(this.ceremonyStartTime).toISOString(),
      ceremonyEndTime: new Date(ceremonyEndTime).toISOString(),
      ceremonyDurationMs,
      verificationSessions: this.sessions,
      summary: this.calculateSummary(ceremonyDurationMs),
      byAgent: this.calculateByAgent(),
      mostViolatedRules: this.calculateMostViolatedRules()
    };

    return summary;
  }

  /**
   * Calculate overall summary statistics
   */
  calculateSummary(ceremonyDurationMs) {
    const totalRulesChecked = this.sessions.reduce((sum, s) =>
      sum + s.ruleStats.totalRulesChecked, 0);
    const totalRulesViolated = this.sessions.reduce((sum, s) =>
      sum + s.ruleStats.rulesViolated, 0);
    const totalApiCalls = this.sessions.reduce((sum, s) =>
      sum + s.apiCalls.totalCalls, 0);
    const totalVerificationTimeMs = this.sessions.reduce((sum, s) =>
      sum + s.durationMs, 0);

    return {
      totalVerificationSessions: this.sessions.length,
      totalRulesChecked,
      totalRulesViolated,
      totalRulesFixed: totalRulesViolated,
      totalApiCalls,
      totalVerificationTimeMs,
      verificationTimePercentage:
        ceremonyDurationMs > 0 ? (totalVerificationTimeMs / ceremonyDurationMs) * 100 : 0
    };
  }

  /**
   * Calculate statistics by agent
   */
  calculateByAgent() {
    const byAgent = {};
    this.sessions.forEach(session => {
      byAgent[session.agentName] = {
        rulesChecked: session.ruleStats.totalRulesChecked,
        rulesViolated: session.ruleStats.rulesViolated,
        apiCalls: session.apiCalls.totalCalls,
        durationMs: session.durationMs
      };
    });
    return byAgent;
  }

  /**
   * Calculate most violated rules across all sessions
   */
  calculateMostViolatedRules() {
    const ruleViolations = {};
    this.sessions.forEach(session => {
      session.violations.forEach(v => {
        if (!ruleViolations[v.ruleId]) {
          ruleViolations[v.ruleId] = { count: 0, agents: [] };
        }
        ruleViolations[v.ruleId].count++;
        ruleViolations[v.ruleId].agents.push(session.agentName);
      });
    });

    return Object.entries(ruleViolations)
      .map(([ruleId, data]) => ({ ruleId, ...data }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate simple hash for content deduplication
   */
  hashContent(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Save tracking data to files
   */
  saveToFile() {
    const summary = this.getCeremonySummary();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Include ceremony name in filename: {ceremony}-verification-{timestamp}.json
    const jsonPath = path.join(process.cwd(), '.avc', 'logs',
      `${this.ceremonyName}-verification-${timestamp}.json`);
    const summaryPath = path.join(process.cwd(), '.avc', 'logs',
      `${this.ceremonyName}-verification-summary-${timestamp}.txt`);

    try {
      // Save JSON
      fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

      // Save human-readable summary
      const summaryText = this.formatSummaryText(summary);
      fs.writeFileSync(summaryPath, summaryText);

      return { jsonPath, summaryPath };
    } catch (error) {
      console.error('Error saving verification tracking:', error.message);
      return { jsonPath: null, summaryPath: null };
    }
  }

  /**
   * Format summary as human-readable text
   */
  formatSummaryText(summary) {
    const text = [];
    text.push('='.repeat(80));
    text.push(`VERIFICATION SUMMARY: ${summary.ceremonyName}`);
    text.push(`Time: ${summary.ceremonyStartTime}`);
    text.push('='.repeat(80));
    text.push('');

    text.push('OVERALL STATISTICS');
    text.push('-'.repeat(80));
    text.push(`Total verification sessions: ${summary.summary.totalVerificationSessions}`);
    text.push(`Total rules checked: ${summary.summary.totalRulesChecked}`);
    text.push(`Total rules violated: ${summary.summary.totalRulesViolated}`);
    text.push(`Total API calls: ${summary.summary.totalApiCalls}`);
    text.push(`Total verification time: ${(summary.summary.totalVerificationTimeMs / 1000).toFixed(2)}s`);
    text.push(`Verification overhead: ${summary.summary.verificationTimePercentage.toFixed(1)}%`);
    text.push('');

    text.push('BY AGENT');
    text.push('-'.repeat(80));
    Object.entries(summary.byAgent).forEach(([agent, stats]) => {
      text.push(`${agent}:`);
      text.push(`  Rules checked: ${stats.rulesChecked}`);
      text.push(`  Rules violated: ${stats.rulesViolated}`);
      text.push(`  API calls: ${stats.apiCalls}`);
      text.push(`  Duration: ${(stats.durationMs / 1000).toFixed(2)}s`);
      text.push('');
    });

    if (summary.mostViolatedRules.length > 0) {
      text.push('MOST VIOLATED RULES');
      text.push('-'.repeat(80));
      summary.mostViolatedRules.forEach(rule => {
        text.push(`${rule.ruleId}: ${rule.count} violations`);
        text.push(`  Agents: ${rule.agents.join(', ')}`);
      });
      text.push('');
    }

    text.push('='.repeat(80));
    return text.join('\n');
  }

  /**
   * Log session summary to console
   */
  logSessionSummary() {
    const session = this.sessions[this.sessions.length - 1];
    if (!session) return;

    console.log('');
    console.log('='.repeat(60));
    console.log(`VERIFICATION SESSION: ${session.agentName}`);
    console.log('='.repeat(60));
    console.log(`Rules checked: ${session.ruleStats.totalRulesChecked}`);
    console.log(`Rules violated: ${session.ruleStats.rulesViolated} (${((session.ruleStats.rulesViolated / session.ruleStats.totalRulesChecked) * 100).toFixed(1)}%)`);
    console.log(`Rules fixed: ${session.ruleStats.rulesFixed}`);
    console.log(`API calls: ${session.apiCalls.totalCalls} (${session.apiCalls.checkCalls} checks + ${session.apiCalls.fixCalls} fixes)`);
    console.log(`Duration: ${(session.durationMs / 1000).toFixed(2)}s`);
    console.log(`Content changed: ${session.output.contentChangedBy} chars`);

    if (session.violations.length > 0) {
      console.log('');
      console.log('Violations fixed:');
      session.violations.forEach(v => {
        console.log(`  - ${v.ruleId} (${v.severity})`);
      });
    }
    console.log('='.repeat(60));
    console.log('');
  }

  /**
   * Log ceremony summary to console
   */
  logCeremonySummary() {
    const summary = this.getCeremonySummary();

    console.log('');
    console.log('📊 Verification Summary');
    console.log('');
    console.log(`Total verification sessions: ${summary.summary.totalVerificationSessions}`);
    console.log(`Total rules checked: ${summary.summary.totalRulesChecked}`);
    console.log(`Total rules violated: ${summary.summary.totalRulesViolated} (${((summary.summary.totalRulesViolated / summary.summary.totalRulesChecked) * 100).toFixed(1)}%)`);
    console.log(`Total API calls: ${summary.summary.totalApiCalls}`);
    console.log(`Total verification time: ${(summary.summary.totalVerificationTimeMs / 1000).toFixed(2)}s (${summary.summary.verificationTimePercentage.toFixed(1)}% of ceremony)`);
    console.log('');

    if (Object.keys(summary.byAgent).length > 0) {
      console.log('By Agent:');
      Object.entries(summary.byAgent).forEach(([agent, stats]) => {
        console.log(`  ${agent}: ${stats.rulesViolated} violations, ${stats.apiCalls} calls, ${(stats.durationMs / 1000).toFixed(2)}s`);
      });
      console.log('');
    }

    if (summary.mostViolatedRules.length > 0) {
      console.log('Most Violated Rules:');
      summary.mostViolatedRules.forEach((rule, index) => {
        console.log(`  ${index + 1}. ${rule.ruleId}: ${rule.count} violations (${rule.agents.join(', ')})`);
      });
      console.log('');
    }
  }

  /**
   * Clean up old verification log files (keep last N logs per ceremony)
   */
  static cleanupOldLogs(ceremonyName, projectRoot = process.cwd(), keepCount = 10) {
    const logsDir = path.join(projectRoot, '.avc', 'logs');

    if (!fs.existsSync(logsDir)) return;

    try {
      const files = fs.readdirSync(logsDir);

      // Find all verification files for this ceremony
      const jsonFiles = [];
      const summaryFiles = [];

      files.forEach(file => {
        if (file.startsWith(`${ceremonyName}-verification-`) && file.endsWith('.json')) {
          jsonFiles.push({
            name: file,
            path: path.join(logsDir, file),
            mtime: fs.statSync(path.join(logsDir, file)).mtime
          });
        }
        if (file.startsWith(`${ceremonyName}-verification-summary-`) && file.endsWith('.txt')) {
          summaryFiles.push({
            name: file,
            path: path.join(logsDir, file),
            mtime: fs.statSync(path.join(logsDir, file)).mtime
          });
        }
      });

      // Sort by modification time (newest first)
      jsonFiles.sort((a, b) => b.mtime - a.mtime);
      summaryFiles.sort((a, b) => b.mtime - a.mtime);

      // Delete old JSON files
      jsonFiles.slice(keepCount).forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          // Ignore deletion errors
        }
      });

      // Delete old summary files
      summaryFiles.slice(keepCount).forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          // Ignore deletion errors
        }
      });
    } catch (error) {
      // Silently fail
    }
  }
}

export { VerificationTracker };
