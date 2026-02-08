import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMVerifier } from '../../cli/llm-verifier.js';
import fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  }
}));

describe('LLMVerifier', () => {
  let mockProvider;
  let verifier;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock LLM provider
    mockProvider = {
      generate: vi.fn()
    };
  });

  describe('constructor and loadRules', () => {
    it('should load verification rules from JSON file', () => {
      // Arrange
      const mockRules = {
        verifications: [
          {
            id: 'test-rule',
            name: 'Test Rule',
            enabled: true,
            severity: 'critical',
            check: { prompt: 'Check', expectedResponse: 'YES|NO', maxTokens: 10 },
            fix: { prompt: 'Fix', returnFormat: 'text', maxTokens: 4096 }
          }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockRules));

      // Act
      verifier = new LLMVerifier(mockProvider, 'test-agent');

      // Assert
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.readFileSync).toHaveBeenCalled();
      expect(verifier.getRuleCount()).toBe(1);
    });

    it('should filter out disabled rules', () => {
      // Arrange
      const mockRules = {
        verifications: [
          {
            id: 'enabled-rule',
            name: 'Enabled',
            enabled: true,
            check: { prompt: 'Check', expectedResponse: 'YES|NO', maxTokens: 10 },
            fix: { prompt: 'Fix', returnFormat: 'text', maxTokens: 4096 }
          },
          {
            id: 'disabled-rule',
            name: 'Disabled',
            enabled: false,
            check: { prompt: 'Check', expectedResponse: 'YES|NO', maxTokens: 10 },
            fix: { prompt: 'Fix', returnFormat: 'text', maxTokens: 4096 }
          }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockRules));

      // Act
      verifier = new LLMVerifier(mockProvider, 'test-agent');

      // Assert
      expect(verifier.getRuleCount()).toBe(1);
    });

    it('should handle missing rules file gracefully', () => {
      // Arrange
      fs.existsSync.mockReturnValue(false);

      // Act
      verifier = new LLMVerifier(mockProvider, 'nonexistent-agent');

      // Assert
      expect(verifier.getRuleCount()).toBe(0);
    });
  });

  describe('checkRule', () => {
    beforeEach(() => {
      const mockRules = {
        verifications: [
          {
            id: 'test-rule',
            name: 'Test Rule',
            enabled: true,
            check: {
              prompt: 'Check {content}',
              expectedResponse: 'YES|NO',
              maxTokens: 10
            },
            fix: {
              prompt: 'Fix {content}',
              returnFormat: 'text',
              maxTokens: 4096
            }
          }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockRules));

      verifier = new LLMVerifier(mockProvider, 'test-agent');
    });

    it('should return true when rule is violated (YES response)', async () => {
      // Arrange
      mockProvider.generate.mockResolvedValue('YES');
      const rule = verifier.rules[0];

      // Act
      const violated = await verifier.checkRule('test content', rule);

      // Assert
      expect(violated).toBe(true);
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.stringContaining('test content'),
        10
      );
    });

    it('should return false when rule is not violated (NO response)', async () => {
      // Arrange
      mockProvider.generate.mockResolvedValue('NO');
      const rule = verifier.rules[0];

      // Act
      const violated = await verifier.checkRule('test content', rule);

      // Assert
      expect(violated).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockProvider.generate.mockRejectedValue(new Error('API error'));
      const rule = verifier.rules[0];

      // Act
      const violated = await verifier.checkRule('test content', rule);

      // Assert
      expect(violated).toBe(false); // Should skip rule on error
    });
  });

  describe('fixContent', () => {
    beforeEach(() => {
      const mockRules = {
        verifications: [
          {
            id: 'test-rule',
            name: 'Test Rule',
            enabled: true,
            check: {
              prompt: 'Check {content}',
              expectedResponse: 'YES|NO',
              maxTokens: 10
            },
            fix: {
              prompt: 'Fix {content}',
              returnFormat: 'text',
              maxTokens: 4096
            }
          }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockRules));

      verifier = new LLMVerifier(mockProvider, 'test-agent');
    });

    it('should return fixed content', async () => {
      // Arrange
      mockProvider.generate.mockResolvedValue('  fixed content  ');
      const rule = verifier.rules[0];

      // Act
      const fixed = await verifier.fixContent('broken content', rule);

      // Assert
      expect(fixed).toBe('fixed content');
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.stringContaining('broken content'),
        4096
      );
    });

    it('should return original content on error', async () => {
      // Arrange
      mockProvider.generate.mockRejectedValue(new Error('API error'));
      const rule = verifier.rules[0];

      // Act
      const fixed = await verifier.fixContent('original content', rule);

      // Assert
      expect(fixed).toBe('original content');
    });
  });

  describe('verify', () => {
    beforeEach(() => {
      const mockRules = {
        verifications: [
          {
            id: 'rule-1',
            name: 'Rule 1',
            enabled: true,
            severity: 'critical',
            check: {
              prompt: 'Check {content}',
              expectedResponse: 'YES|NO',
              maxTokens: 10
            },
            fix: {
              prompt: 'Fix {content}',
              returnFormat: 'text',
              maxTokens: 4096
            }
          },
          {
            id: 'rule-2',
            name: 'Rule 2',
            enabled: true,
            severity: 'major',
            check: {
              prompt: 'Check {content}',
              expectedResponse: 'YES|NO',
              maxTokens: 10
            },
            fix: {
              prompt: 'Fix {content}',
              returnFormat: 'text',
              maxTokens: 4096
            }
          }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockRules));

      verifier = new LLMVerifier(mockProvider, 'test-agent');
    });

    it('should verify and fix violated rules', async () => {
      // Arrange
      mockProvider.generate
        .mockResolvedValueOnce('YES') // Rule 1 check: violated
        .mockResolvedValueOnce('fixed by rule 1') // Rule 1 fix
        .mockResolvedValueOnce('NO'); // Rule 2 check: not violated

      // Act
      const result = await verifier.verify('original content');

      // Assert
      expect(result.content).toBe('fixed by rule 1');
      expect(result.rulesApplied).toHaveLength(1);
      expect(result.rulesApplied[0].id).toBe('rule-1');
      expect(mockProvider.generate).toHaveBeenCalledTimes(3);
    });

    it('should return original content if no rules violated', async () => {
      // Arrange
      mockProvider.generate
        .mockResolvedValueOnce('NO') // Rule 1: not violated
        .mockResolvedValueOnce('NO'); // Rule 2: not violated

      // Act
      const result = await verifier.verify('original content');

      // Assert
      expect(result.content).toBe('original content');
      expect(result.rulesApplied).toHaveLength(0);
      expect(mockProvider.generate).toHaveBeenCalledTimes(2);
    });

    it('should call progress callback', async () => {
      // Arrange
      mockProvider.generate
        .mockResolvedValueOnce('NO')
        .mockResolvedValueOnce('NO');

      const progressCallback = vi.fn();

      // Act
      await verifier.verify('content', progressCallback);

      // Assert
      expect(progressCallback).toHaveBeenCalledWith(null, 'Checking: Rule 1...');
      expect(progressCallback).toHaveBeenCalledWith(null, 'Checking: Rule 2...');
    });

    it('should handle empty rules gracefully', async () => {
      // Arrange
      fs.existsSync.mockReturnValue(false);
      verifier = new LLMVerifier(mockProvider, 'nonexistent-agent');

      // Act
      const result = await verifier.verify('content');

      // Assert
      expect(result.content).toBe('content');
      expect(result.rulesApplied).toHaveLength(0);
      expect(mockProvider.generate).not.toHaveBeenCalled();
    });
  });

  describe('getRules', () => {
    it('should return rule metadata', () => {
      // Arrange
      const mockRules = {
        verifications: [
          {
            id: 'test-rule',
            name: 'Test Rule',
            enabled: true,
            severity: 'critical',
            description: 'Test description',
            check: { prompt: 'Check', expectedResponse: 'YES|NO', maxTokens: 10 },
            fix: { prompt: 'Fix', returnFormat: 'text', maxTokens: 4096 }
          }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockRules));

      verifier = new LLMVerifier(mockProvider, 'test-agent');

      // Act
      const rules = verifier.getRules();

      // Assert
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual({
        id: 'test-rule',
        name: 'Test Rule',
        severity: 'critical',
        description: 'Test description',
        enabled: true
      });
    });
  });
});
