import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LLM-based verification engine
 *
 * NO HARDCODED VALIDATION - All logic is in JSON rule files.
 * Each rule checks ONE thing and fixes ONE thing (atomic).
 *
 * Usage:
 *   const verifier = new LLMVerifier(llmProvider, 'project-documentation-creator');
 *   const result = await verifier.verify(content, progressCallback);
 */
export class LLMVerifier {
  constructor(llmProvider, agentName, tracker = null) {
    this.llmProvider = llmProvider;
    this.agentName = agentName;
    this.tracker = tracker;  // Optional verification tracker
    this.rules = this.loadRules();
  }

  /**
   * Load verification rules from JSON file
   * @returns {Array} Enabled verification rules
   */
  loadRules() {
    const rulesPath = path.join(__dirname, 'agents', `${this.agentName}.json`);

    if (!fs.existsSync(rulesPath)) {
      console.warn(`Warning: No verification rules found for agent: ${this.agentName}`);
      return [];
    }

    try {
      const data = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

      // Filter to enabled rules only
      const enabledRules = data.verifications.filter(r => r.enabled !== false);

      return enabledRules;
    } catch (error) {
      console.error(`Error loading verification rules from ${rulesPath}:`, error.message);
      return [];
    }
  }

  /**
   * Check if rule is violated
   * @param {string} content - Content to check
   * @param {Object} rule - Verification rule
   * @returns {Promise<boolean>} True if rule is violated (needs fixing)
   */
  async checkRule(content, rule) {
    try {
      if (this.tracker) {
        this.tracker.startRuleCheck(rule);
      }

      const prompt = rule.check.prompt.replace('{content}', content);
      const maxTokens = rule.check.maxTokens || 10;

      const response = await this.llmProvider.generate(prompt, maxTokens);
      const answer = response.trim().toUpperCase();

      // Check if response matches expected pattern (YES means violation found)
      let result = false;
      if (rule.check.expectedResponse === 'YES|NO') {
        result = answer === 'YES';
      }

      if (this.tracker) {
        this.tracker.endRuleCheck(answer);
      }

      console.log(`[DEBUG] checkRule - Rule: ${rule.id}, Result: ${answer}`);
      return result;
    } catch (error) {
      console.error(`Error checking rule ${rule.id}:`, error.message);
      if (this.tracker) {
        this.tracker.endRuleCheck('ERROR');
        this.tracker.completeRule();
      }
      return false; // Skip this rule on error
    }
  }

  /**
   * Fix content according to rule
   * @param {string} content - Content to fix
   * @param {Object} rule - Verification rule
   * @returns {Promise<string>} Fixed content
   */
  async fixContent(content, rule) {
    try {
      if (this.tracker) {
        this.tracker.startRuleFix(content.length);
      }

      const prompt = rule.fix.prompt.replace('{content}', content);
      const maxTokens = rule.fix.maxTokens || 4096;

      console.log(`[DEBUG] fixContent - Rule: ${rule.id}, Fixing content (length: ${content.length})`);
      const fixed = await this.llmProvider.generate(prompt, maxTokens);
      console.log(`[DEBUG] fixContent - Rule: ${rule.id}, LLM returned ${fixed.length} chars`);
      console.log(`[DEBUG] fixContent - Rule: ${rule.id}, Raw output preview:`, fixed.substring(0, 300));

      const trimmed = fixed.trim();
      console.log(`[DEBUG] fixContent - Rule: ${rule.id}, After trim: ${trimmed.length} chars`);

      if (this.tracker) {
        this.tracker.endRuleFix(trimmed.length);
      }

      return trimmed;
    } catch (error) {
      console.error(`Error fixing with rule ${rule.id}:`, error.message);
      return content; // Return original content on error
    }
  }

  /**
   * Verify and fix content using all enabled rules
   * @param {string} content - Content to verify
   * @param {Function} progressCallback - Optional callback (mainMsg, substep)
   * @returns {Promise<Object>} { content, rulesApplied }
   */
  async verify(content, progressCallback = null) {
    if (this.tracker) {
      this.tracker.startSession(this.agentName, content);
    }

    console.log(`[DEBUG] verify - Starting verification with ${this.rules.length} rules`);
    console.log(`[DEBUG] verify - Input content length: ${content.length}`);
    console.log(`[DEBUG] verify - Input content preview:`, content.substring(0, 300));

    let current = content;
    const applied = [];

    // If no rules loaded, return original content
    if (this.rules.length === 0) {
      return { content: current, rulesApplied: [] };
    }

    for (const rule of this.rules) {
      // Report progress: checking
      if (progressCallback) {
        progressCallback(null, `Checking: ${rule.name}...`);
        // Small delay to allow UI to update
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      // Check if rule is violated
      const violated = await this.checkRule(current, rule);

      if (violated) {
        // Report progress: fixing
        if (progressCallback) {
          progressCallback(null, `Fixing: ${rule.name}...`);
          // Small delay to allow UI to update
          await new Promise(resolve => setTimeout(resolve, 20));
        }

        // Apply fix
        const fixed = await this.fixContent(current, rule);

        // Only update if fix actually changed content
        if (fixed !== current) {
          current = fixed;
          applied.push({
            id: rule.id,
            name: rule.name,
            severity: rule.severity
          });
        }
      }

      if (this.tracker) {
        this.tracker.completeRule();
      }
    }

    console.log(`[DEBUG] verify - Completed with ${applied.length} rules applied:`, applied.map(r => r.id));
    console.log(`[DEBUG] verify - Final content length: ${current.length}`);
    console.log(`[DEBUG] verify - Final content preview:`, current.substring(0, 300));

    if (this.tracker) {
      this.tracker.endSession(current, applied);
      this.tracker.logSessionSummary();
    }

    return {
      content: current,
      rulesApplied: applied
    };
  }

  /**
   * Get list of all rules for this agent
   * @returns {Array} Rule metadata (id, name, severity, description)
   */
  getRules() {
    return this.rules.map(r => ({
      id: r.id,
      name: r.name,
      severity: r.severity,
      description: r.description,
      enabled: r.enabled !== false
    }));
  }

  /**
   * Get count of enabled rules
   * @returns {number} Number of enabled rules
   */
  getRuleCount() {
    return this.rules.length;
  }
}
