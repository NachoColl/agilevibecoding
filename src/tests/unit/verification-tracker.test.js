import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VerificationTracker } from '../../cli/verification-tracker.js';
import fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn()
  }
}));

describe('VerificationTracker', () => {
  let tracker;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new VerificationTracker('test-ceremony');
  });

  describe('constructor', () => {
    it('should initialize with ceremony name', () => {
      expect(tracker.ceremonyName).toBe('test-ceremony');
      expect(tracker.sessions).toEqual([]);
      expect(tracker.ceremonyStartTime).toBeDefined();
    });
  });

  describe('session tracking', () => {
    it('should track a complete verification session', () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        severity: 'major'
      };

      // Start session
      tracker.startSession('test-agent', 'test content');
      expect(tracker.currentSession).toBeDefined();
      expect(tracker.currentSession.agentName).toBe('test-agent');

      // Track rule check
      tracker.startRuleCheck(rule);
      expect(tracker.currentRuleExecution).toBeDefined();
      expect(tracker.currentRuleExecution.ruleId).toBe('test-rule');

      tracker.endRuleCheck('YES');
      expect(tracker.currentRuleExecution.wasViolated).toBe(true);

      // Track rule fix
      tracker.startRuleFix(100);
      expect(tracker.currentRuleExecution.fixApplied).toBe(true);

      tracker.endRuleFix(90);
      expect(tracker.currentRuleExecution.contentChangedBy).toBe(-10);

      // Complete rule
      tracker.completeRule();
      expect(tracker.currentSession.ruleExecutions).toHaveLength(1);

      // End session
      tracker.endSession('fixed content', [{ id: 'test-rule' }]);
      expect(tracker.sessions).toHaveLength(1);
    });

    it('should track rule that passed (not violated)', () => {
      const rule = {
        id: 'passing-rule',
        name: 'Passing Rule',
        severity: 'minor'
      };

      tracker.startSession('test-agent', 'test content');
      tracker.startRuleCheck(rule);
      tracker.endRuleCheck('NO');
      tracker.completeRule();
      tracker.endSession('test content', []);

      const session = tracker.sessions[0];
      expect(session.ruleStats.rulesPassed).toBe(1);
      expect(session.ruleStats.rulesViolated).toBe(0);
      expect(session.violations).toHaveLength(0);
    });
  });

  describe('statistics calculation', () => {
    it('should calculate session statistics correctly', () => {
      const rule1 = { id: 'rule-1', name: 'Rule 1', severity: 'critical' };
      const rule2 = { id: 'rule-2', name: 'Rule 2', severity: 'major' };

      tracker.startSession('test-agent', 'test content');

      // Rule 1: violated and fixed
      tracker.startRuleCheck(rule1);
      tracker.endRuleCheck('YES');
      tracker.startRuleFix(100);
      tracker.endRuleFix(90);
      tracker.completeRule();

      // Rule 2: passed
      tracker.startRuleCheck(rule2);
      tracker.endRuleCheck('NO');
      tracker.completeRule();

      tracker.endSession('fixed content', [{ id: 'rule-1' }]);

      const session = tracker.sessions[0];
      expect(session.ruleStats.totalRulesChecked).toBe(2);
      expect(session.ruleStats.rulesViolated).toBe(1);
      expect(session.ruleStats.rulesPassed).toBe(1);
      expect(session.ruleStats.rulesFixed).toBe(1);
      expect(session.apiCalls.checkCalls).toBe(2);
      expect(session.apiCalls.fixCalls).toBe(1);
      expect(session.apiCalls.totalCalls).toBe(3);
    });

    it('should calculate ceremony summary correctly', () => {
      // Session 1
      tracker.startSession('agent-1', 'content1');
      tracker.startRuleCheck({ id: 'r1', name: 'R1', severity: 'major' });
      tracker.endRuleCheck('YES');
      tracker.startRuleFix(100);
      tracker.endRuleFix(90);
      tracker.completeRule();
      tracker.endSession('fixed1', [{ id: 'r1' }]);

      // Session 2
      tracker.startSession('agent-2', 'content2');
      tracker.startRuleCheck({ id: 'r2', name: 'R2', severity: 'critical' });
      tracker.endRuleCheck('YES');
      tracker.startRuleFix(200);
      tracker.endRuleFix(180);
      tracker.completeRule();
      tracker.endSession('fixed2', [{ id: 'r2' }]);

      const summary = tracker.getCeremonySummary();

      expect(summary.summary.totalVerificationSessions).toBe(2);
      expect(summary.summary.totalRulesChecked).toBe(2);
      expect(summary.summary.totalRulesViolated).toBe(2);
      expect(summary.summary.totalApiCalls).toBe(4); // 2 checks + 2 fixes
    });

    it('should calculate most violated rules', () => {
      // Session 1: rule-1 violated
      tracker.startSession('agent-1', 'content1');
      tracker.startRuleCheck({ id: 'rule-1', name: 'R1', severity: 'major' });
      tracker.endRuleCheck('YES');
      tracker.startRuleFix(100);
      tracker.endRuleFix(90);
      tracker.completeRule();
      tracker.endSession('fixed1', [{ id: 'rule-1' }]);

      // Session 2: rule-1 violated again
      tracker.startSession('agent-2', 'content2');
      tracker.startRuleCheck({ id: 'rule-1', name: 'R1', severity: 'major' });
      tracker.endRuleCheck('YES');
      tracker.startRuleFix(200);
      tracker.endRuleFix(180);
      tracker.completeRule();
      tracker.endSession('fixed2', [{ id: 'rule-1' }]);

      const summary = tracker.getCeremonySummary();

      expect(summary.mostViolatedRules).toHaveLength(1);
      expect(summary.mostViolatedRules[0].ruleId).toBe('rule-1');
      expect(summary.mostViolatedRules[0].count).toBe(2);
      expect(summary.mostViolatedRules[0].agents).toEqual(['agent-1', 'agent-2']);
    });
  });

  describe('content hashing', () => {
    it('should generate consistent hash for same content', () => {
      const hash1 = tracker.hashContent('test content');
      const hash2 = tracker.hashContent('test content');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different content', () => {
      const hash1 = tracker.hashContent('test content 1');
      const hash2 = tracker.hashContent('test content 2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('file operations', () => {
    it('should save to file with ceremony name in filename', () => {
      fs.writeFileSync.mockImplementation(() => {});

      tracker.startSession('test-agent', 'content');
      tracker.startRuleCheck({ id: 'r1', name: 'R1', severity: 'major' });
      tracker.endRuleCheck('NO');
      tracker.completeRule();
      tracker.endSession('content', []);

      const { jsonPath, summaryPath } = tracker.saveToFile();

      expect(jsonPath).toContain('test-ceremony-verification-');
      expect(jsonPath).toContain('.json');
      expect(summaryPath).toContain('test-ceremony-verification-summary-');
      expect(summaryPath).toContain('.txt');
      // Now writes 3 files: JSON, summary, and rule profiles
      expect(fs.writeFileSync).toHaveBeenCalledTimes(3);
    });
  });

  describe('byAgent calculation', () => {
    it('should group statistics by agent', () => {
      // Agent 1: 2 rules, 1 violated
      tracker.startSession('agent-1', 'content1');
      tracker.startRuleCheck({ id: 'r1', name: 'R1', severity: 'major' });
      tracker.endRuleCheck('YES');
      tracker.startRuleFix(100);
      tracker.endRuleFix(90);
      tracker.completeRule();
      tracker.startRuleCheck({ id: 'r2', name: 'R2', severity: 'minor' });
      tracker.endRuleCheck('NO');
      tracker.completeRule();
      tracker.endSession('fixed1', [{ id: 'r1' }]);

      // Agent 2: 1 rule, 0 violated
      tracker.startSession('agent-2', 'content2');
      tracker.startRuleCheck({ id: 'r3', name: 'R3', severity: 'major' });
      tracker.endRuleCheck('NO');
      tracker.completeRule();
      tracker.endSession('content2', []);

      const summary = tracker.getCeremonySummary();

      expect(summary.byAgent['agent-1']).toEqual({
        rulesChecked: 2,
        rulesViolated: 1,
        apiCalls: 3, // 2 checks + 1 fix
        durationMs: expect.any(Number)
      });

      expect(summary.byAgent['agent-2']).toEqual({
        rulesChecked: 1,
        rulesViolated: 0,
        apiCalls: 1, // 1 check only
        durationMs: expect.any(Number)
      });
    });
  });
});
