import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LLM-based verification engine
 *
 * CONFIGURATION-DRIVEN VALIDATION:
 * - All validation logic defined in JSON rule files
 * - Fast-path optimizations configurable per rule (not hardcoded)
 * - Hardcoded helpers exist (JSON parsing, regex) but triggered by JSON config
 * - Each rule checks ONE thing and fixes ONE thing (atomic)
 *
 * Fast-Path Types Available:
 * - 'json-parse': Validate JSON syntax programmatically
 * - 'json-fields': Check required fields programmatically
 * - 'none': Always use LLM (no fast-path)
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
   * Fast-path: Programmatically unwrap JSON from markdown code fence
   * @param {string} content - Content that may be wrapped
   * @returns {object} { isWrapped: boolean, unwrapped: string }
   */
  unwrapJsonCodeFence(content) {
    const trimmed = content.trim();

    // Pattern 1: ```json\n...\n```
    const pattern1 = /^```json\s*\n([\s\S]*)\n```$/;
    const match1 = trimmed.match(pattern1);
    if (match1) {
      return { isWrapped: true, unwrapped: match1[1].trim() };
    }

    // Pattern 2: ```\n...\n``` (generic code fence)
    const pattern2 = /^```\s*\n([\s\S]*)\n```$/;
    const match2 = trimmed.match(pattern2);
    if (match2) {
      // Check if content looks like JSON
      const unwrapped = match2[1].trim();
      if (unwrapped.startsWith('{') || unwrapped.startsWith('[')) {
        return { isWrapped: true, unwrapped };
      }
    }

    return { isWrapped: false, unwrapped: content };
  }

  /**
   * Fast-path: Check if content is valid JSON
   * @param {string} content - Content to check
   * @returns {object} { canFastPath: boolean, violated: boolean, reason: string }
   */
  fastPathValidJson(content) {
    // Check for markdown code fence
    const { isWrapped, unwrapped } = this.unwrapJsonCodeFence(content);

    if (isWrapped) {
      return { canFastPath: true, violated: true, reason: 'markdown-fence' };
    }

    // Try parsing JSON
    try {
      JSON.parse(unwrapped);
      return { canFastPath: true, violated: false };
    } catch (e) {
      // Parse error - might be fixable by LLM
      return { canFastPath: false, violated: true, reason: e.message };
    }
  }

  /**
   * Fast-path: Check if required fields present
   * @param {string} content - JSON content
   * @param {array} requiredFields - Field names to check
   * @returns {object} { canFastPath: boolean, violated: boolean, missingFields: array }
   */
  fastPathRequiredFields(content, requiredFields) {
    try {
      // First unwrap if needed
      const { unwrapped } = this.unwrapJsonCodeFence(content);
      const obj = JSON.parse(unwrapped);
      const missing = requiredFields.filter(field => !(field in obj));

      if (missing.length === 0) {
        return { canFastPath: true, violated: false };
      } else {
        return { canFastPath: true, violated: true, missingFields: missing };
      }
    } catch (e) {
      // Can't parse - let LLM handle
      return { canFastPath: false };
    }
  }

  /**
   * Execute fast-path optimization if configured
   * @param {string} content - Content to check
   * @param {Object} rule - Verification rule with fastPath config
   * @returns {Promise<Object>} { canFastPath: boolean, violated: boolean, reason: string }
   */
  async executeFastPath(content, rule) {
    if (!rule.fastPath?.enabled) {
      return { canFastPath: false };
    }

    const type = rule.fastPath.type;

    switch (type) {
      case 'json-parse':
        // JSON parsing fast-path
        return this.fastPathValidJson(content);

      case 'json-fields':
        // Required fields fast-path
        const fields = rule.fastPath.requiredFields || [];
        return this.fastPathRequiredFields(content, fields);

      case 'none':
      default:
        // No fast-path, use LLM
        return { canFastPath: false };
    }
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

      // Try fast-path if configured in rule
      if (rule.fastPath?.enabled) {
        const fastPathResult = await this.executeFastPath(content, rule);
        if (fastPathResult.canFastPath) {
          console.log(`[DEBUG] Fast-path used for ${rule.id}: ${fastPathResult.violated ? 'VIOLATED' : 'PASSED'}${fastPathResult.reason ? ` (${fastPathResult.reason})` : ''}${fastPathResult.missingFields ? ` (missing: ${fastPathResult.missingFields.join(', ')})` : ''}`);
          if (this.tracker) {
            this.tracker.endRuleCheck(fastPathResult.violated ? 'YES' : 'NO');
          }
          return fastPathResult.violated;
        }
      }

      // Fallback to LLM check
      console.log(`[DEBUG] Fast-path not available for ${rule.id}, using LLM`);
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

      // Fast-path fix if configured
      if (rule.fastPath?.enabled && rule.fastPath.type === 'json-parse') {
        const { isWrapped, unwrapped } = this.unwrapJsonCodeFence(content);
        if (isWrapped) {
          console.log('[DEBUG] Fast-path: Unwrapping JSON code fence (no LLM call)');
          if (this.tracker) {
            this.tracker.endRuleFix(unwrapped.length);
          }
          return unwrapped;
        }
      }

      // Fallback to LLM fix
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
    // Check cache first
    if (this.tracker && this.tracker.verificationCache) {
      const contentHash = this.tracker.hashContent(content);
      const cacheKey = `${this.agentName}-${contentHash}`;

      if (this.tracker.verificationCache.has(cacheKey)) {
        console.log(`[DEBUG] Cache HIT: Reusing verification for ${this.agentName} (hash: ${contentHash})`);
        return this.tracker.verificationCache.get(cacheKey);
      }

      console.log(`[DEBUG] Cache MISS: Running verification for ${this.agentName} (hash: ${contentHash})`);
    }

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

    // PHASE 1: Check all rules in parallel
    console.log(`[DEBUG] verify - Phase 1: Checking ${this.rules.length} rules in parallel`);
    if (progressCallback) {
      progressCallback(null, `Checking ${this.rules.length} rules...`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const checkPromises = this.rules.map(async (rule) => {
      // Check if rule should be skipped based on profiling
      if (this.tracker && this.tracker.shouldSkipRule(this.agentName, rule.id)) {
        return { rule, violated: false, error: null, skipped: true };
      }

      try {
        const violated = await this.checkRule(current, rule);

        // Update rule profile
        if (this.tracker) {
          this.tracker.updateRuleProfile(this.agentName, rule.id, violated);
        }

        return { rule, violated, error: null, skipped: false };
      } catch (error) {
        console.error(`Error checking rule ${rule.id}:`, error.message);
        return { rule, violated: false, error: error.message, skipped: false };
      }
    });

    const checkResults = await Promise.all(checkPromises);

    // PHASE 2: Fix violations sequentially
    console.log(`[DEBUG] verify - Phase 2: Fixing violations sequentially`);
    const violatedRules = checkResults.filter(r => r.violated && !r.error);
    console.log(`[DEBUG] verify - Found ${violatedRules.length} violations:`, violatedRules.map(r => r.rule.id));

    for (const { rule, violated } of violatedRules) {
      // SAFEGUARD: Double-check that rule was actually violated
      if (!violated) {
        console.warn(`[WARN] verify - Skipping fix for ${rule.id} - violated flag is false (defensive check)`);
        if (this.tracker) {
          this.tracker.completeRule();
        }
        continue;
      }

      // Report progress: fixing
      if (progressCallback) {
        progressCallback(null, `Fixing: ${rule.name}...`);
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      try {
        const beforeLength = current.length;

        // Apply fix
        const fixed = await this.fixContent(current, rule);

        // Only update if fix actually changed content
        if (fixed !== current) {
          const afterLength = fixed.length;
          const changePercent = Math.abs((afterLength - beforeLength) / beforeLength * 100);
          const changeChars = afterLength - beforeLength;

          // SAFEGUARD: Warn on aggressive content changes
          if (changePercent > 30) {
            console.warn(`[WARN] verify - Rule ${rule.id} caused ${changePercent.toFixed(1)}% content change (${changeChars > 0 ? '+' : ''}${changeChars} chars)`);
            console.warn(`[WARN] verify - Before: ${beforeLength} chars, After: ${afterLength} chars`);
            console.warn(`[WARN] verify - This may indicate an overly aggressive fix. Review rule prompt.`);
          } else {
            console.log(`[DEBUG] verify - Rule ${rule.id} changed content by ${changePercent.toFixed(1)}% (${changeChars > 0 ? '+' : ''}${changeChars} chars)`);
          }

          current = fixed;
          applied.push({
            id: rule.id,
            name: rule.name,
            severity: rule.severity
          });
        } else {
          console.log(`[DEBUG] verify - Rule ${rule.id} fix did not change content (no-op fix)`);
        }
      } catch (error) {
        console.error(`Error fixing rule ${rule.id}:`, error.message);
      }

      if (this.tracker) {
        this.tracker.completeRule();
      }
    }

    // Complete tracking for rules that didn't violate
    const passedRules = checkResults.filter(r => !r.violated || r.error);
    for (const { rule } of passedRules) {
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

    const result = {
      content: current,
      rulesApplied: applied,
      noViolations: applied.length === 0, // Track if this was a perfect verification
      timestamp: Date.now()
    };

    // Store in cache
    if (this.tracker && this.tracker.verificationCache) {
      const contentHash = this.tracker.hashContent(content);
      const cacheKey = `${this.agentName}-${contentHash}`;
      this.tracker.verificationCache.set(cacheKey, result);

      if (applied.length === 0) {
        console.log(`[DEBUG] Cached PERFECT verification result for ${this.agentName} (hash: ${contentHash}) - no violations found`);
      } else {
        console.log(`[DEBUG] Cached verification result for ${this.agentName} (hash: ${contentHash}) - ${applied.length} fixes applied`);
      }
    }

    return result;
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
