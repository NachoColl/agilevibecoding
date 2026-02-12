import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpicStoryValidator } from '../../cli/epic-story-validator.js';

describe('EpicStoryValidator', () => {
  let mockLLMProvider;
  let mockVerificationTracker;
  let validator;

  beforeEach(() => {
    // Mock LLM provider
    mockLLMProvider = {
      generateJSON: vi.fn()
    };

    // Mock verification tracker
    mockVerificationTracker = {
      recordCheck: vi.fn()
    };

    validator = new EpicStoryValidator(mockLLMProvider, mockVerificationTracker);
  });

  describe('Validation Result Aggregation', () => {
    it('should calculate average score from multiple validators', () => {
      const results = [
        { _validatorName: 'validator-1', overallScore: 90 },
        { _validatorName: 'validator-2', overallScore: 80 },
        { _validatorName: 'validator-3', overallScore: 70 }
      ];

      const aggregated = validator.aggregateValidationResults(results, 'epic');

      expect(aggregated.averageScore).toBe(80); // (90 + 80 + 70) / 3
    });

    it('should categorize issues by severity', () => {
      const results = [
        {
          _validatorName: 'validator-1',
          overallScore: 65,
          issues: [
            { severity: 'critical', description: 'Critical issue 1', category: 'completeness' },
            { severity: 'major', description: 'Major issue 1', category: 'clarity' }
          ]
        },
        {
          _validatorName: 'validator-2',
          overallScore: 70,
          issues: [
            { severity: 'critical', description: 'Critical issue 2', category: 'technical-depth' },
            { severity: 'minor', description: 'Minor issue 1', category: 'best-practices' }
          ]
        }
      ];

      const aggregated = validator.aggregateValidationResults(results, 'epic');

      expect(aggregated.criticalIssues).toHaveLength(2);
      expect(aggregated.majorIssues).toHaveLength(1);
      expect(aggregated.minorIssues).toHaveLength(1);

      // Check that validator name is added
      expect(aggregated.criticalIssues[0].validator).toBe('validator-1');
      expect(aggregated.criticalIssues[1].validator).toBe('validator-2');
    });

    it('should extract domain from validator name', () => {
      const results = [
        {
          _validatorName: 'validator-epic-security',
          overallScore: 90,
          issues: [
            { severity: 'critical', description: 'Security issue', category: 'completeness' }
          ]
        }
      ];

      const aggregated = validator.aggregateValidationResults(results, 'epic');

      expect(aggregated.criticalIssues[0].domain).toBe('security');
    });

    it('should deduplicate similar strengths', () => {
      const results = [
        {
          _validatorName: 'validator-1',
          overallScore: 90,
          strengths: ['Clear epic scope', 'Well-defined features'],
          issues: []
        },
        {
          _validatorName: 'validator-2',
          overallScore: 85,
          strengths: ['Clear epic scope and boundaries', 'Good technical depth'],
          issues: []
        }
      ];

      const aggregated = validator.aggregateValidationResults(results, 'epic');

      // "Clear epic scope" and "Clear epic scope and boundaries" should be considered similar
      // Only one should be kept
      const scopeStrengths = aggregated.strengths.filter(s =>
        s.toLowerCase().includes('clear') && s.toLowerCase().includes('scope')
      );
      expect(scopeStrengths.length).toBe(1);
    });

    it('should rank improvement priorities by frequency', () => {
      const results = [
        {
          _validatorName: 'validator-1',
          overallScore: 70,
          improvementPriorities: [
            'Add security considerations',
            'Define success criteria'
          ],
          issues: []
        },
        {
          _validatorName: 'validator-2',
          overallScore: 75,
          improvementPriorities: [
            'Add security considerations',
            'Specify technical approach'
          ],
          issues: []
        },
        {
          _validatorName: 'validator-3',
          overallScore: 68,
          improvementPriorities: [
            'Add security considerations',
            'Define success criteria'
          ],
          issues: []
        }
      ];

      const aggregated = validator.aggregateValidationResults(results, 'epic');

      // "Add security considerations" mentioned 3 times
      // "Define success criteria" mentioned 2 times
      // "Specify technical approach" mentioned 1 time
      expect(aggregated.improvementPriorities[0].priority).toBe('Add security considerations');
      expect(aggregated.improvementPriorities[0].mentionedBy).toBe(3);

      expect(aggregated.improvementPriorities[1].priority).toBe('Define success criteria');
      expect(aggregated.improvementPriorities[1].mentionedBy).toBe(2);

      expect(aggregated.improvementPriorities[2].priority).toBe('Specify technical approach');
      expect(aggregated.improvementPriorities[2].mentionedBy).toBe(1);
    });

    it('should limit improvement priorities to top 5', () => {
      const results = [
        {
          _validatorName: 'validator-1',
          overallScore: 70,
          improvementPriorities: ['Priority 1', 'Priority 2', 'Priority 3'],
          issues: []
        },
        {
          _validatorName: 'validator-2',
          overallScore: 75,
          improvementPriorities: ['Priority 4', 'Priority 5', 'Priority 6'],
          issues: []
        },
        {
          _validatorName: 'validator-3',
          overallScore: 72,
          improvementPriorities: ['Priority 7', 'Priority 8', 'Priority 9'],
          issues: []
        }
      ];

      const aggregated = validator.aggregateValidationResults(results, 'epic');

      expect(aggregated.improvementPriorities.length).toBeLessThanOrEqual(5);
    });

    it('should include per-validator results summary', () => {
      const results = [
        {
          _validatorName: 'validator-epic-security',
          validationStatus: 'excellent',
          overallScore: 95,
          issues: [],
          strengths: [],
          improvementPriorities: []
        },
        {
          _validatorName: 'validator-epic-devops',
          validationStatus: 'acceptable',
          overallScore: 82,
          issues: [{ severity: 'major' }, { severity: 'minor' }],
          strengths: [],
          improvementPriorities: []
        }
      ];

      const aggregated = validator.aggregateValidationResults(results, 'epic');

      expect(aggregated.validatorResults).toHaveLength(2);
      expect(aggregated.validatorResults[0]).toEqual({
        validator: 'validator-epic-security',
        status: 'excellent',
        score: 95,
        issueCount: 0
      });
      expect(aggregated.validatorResults[1]).toEqual({
        validator: 'validator-epic-devops',
        status: 'acceptable',
        score: 82,
        issueCount: 2
      });
    });
  });

  describe('Overall Status Determination', () => {
    it('should return "needs-improvement" if any validator says needs-improvement', () => {
      const results = [
        { validationStatus: 'excellent' },
        { validationStatus: 'acceptable' },
        { validationStatus: 'needs-improvement' }
      ];

      const status = validator.determineOverallStatus(results);

      expect(status).toBe('needs-improvement');
    });

    it('should return "excellent" if all validators say excellent', () => {
      const results = [
        { validationStatus: 'excellent' },
        { validationStatus: 'excellent' },
        { validationStatus: 'excellent' }
      ];

      const status = validator.determineOverallStatus(results);

      expect(status).toBe('excellent');
    });

    it('should return "acceptable" if mix of excellent and acceptable', () => {
      const results = [
        { validationStatus: 'excellent' },
        { validationStatus: 'acceptable' },
        { validationStatus: 'excellent' }
      ];

      const status = validator.determineOverallStatus(results);

      expect(status).toBe('acceptable');
    });

    it('should handle single validator result', () => {
      const results = [
        { validationStatus: 'acceptable' }
      ];

      const status = validator.determineOverallStatus(results);

      expect(status).toBe('acceptable');
    });
  });

  describe('Domain Extraction', () => {
    it('should extract domain from epic validator name', () => {
      const domain = validator.extractDomain('validator-epic-security');
      expect(domain).toBe('security');
    });

    it('should extract domain from story validator name', () => {
      const domain = validator.extractDomain('validator-story-database');
      expect(domain).toBe('database');
    });

    it('should extract multi-word domain names', () => {
      const domain = validator.extractDomain('validator-epic-solution-architect');
      expect(domain).toBe('solution-architect');
    });

    it('should handle unknown format gracefully', () => {
      const domain = validator.extractDomain('unknown-format');
      expect(domain).toBe('unknown');
    });
  });

  describe('Similarity Detection', () => {
    it('should detect similar strings (substring match)', () => {
      expect(validator.isSimilar('Clear scope', 'Clear scope and boundaries')).toBe(true);
      expect(validator.isSimilar('Clear scope and boundaries', 'Clear scope')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(validator.isSimilar('CLEAR SCOPE', 'clear scope')).toBe(true);
      expect(validator.isSimilar('clear scope', 'CLEAR SCOPE')).toBe(true);
    });

    it('should detect dissimilar strings', () => {
      expect(validator.isSimilar('Security concerns', 'Performance issues')).toBe(false);
    });

    it('should handle identical strings', () => {
      expect(validator.isSimilar('Same string', 'Same string')).toBe(true);
    });
  });

  describe('Prompt Building', () => {
    it('should build epic validation prompt with all required fields', () => {
      const epic = {
        id: 'context-0001',
        name: 'Foundation Services',
        domain: 'infrastructure',
        description: 'Set up core infrastructure',
        features: ['logging', 'monitoring', 'database'],
        dependencies: ['cloud-provider'],
        children: ['context-0001-0001', 'context-0001-0002']
      };
      const epicContext = 'Epic context content...';

      const prompt = validator.buildEpicValidationPrompt(epic, epicContext);

      expect(prompt).toContain('context-0001');
      expect(prompt).toContain('Foundation Services');
      expect(prompt).toContain('infrastructure');
      expect(prompt).toContain('Set up core infrastructure');
      expect(prompt).toContain('logging');
      expect(prompt).toContain('monitoring');
      expect(prompt).toContain('database');
      expect(prompt).toContain('cloud-provider');
      expect(prompt).toContain('Epic context content...');
    });

    it('should handle epic with empty dependencies', () => {
      const epic = {
        id: 'context-0001',
        name: 'Simple Epic',
        domain: 'frontend',
        description: 'Build UI',
        features: [],
        dependencies: [],
        children: []
      };
      const epicContext = 'Context...';

      const prompt = validator.buildEpicValidationPrompt(epic, epicContext);

      expect(prompt).toContain('None'); // Dependencies: None
    });

    it('should build story validation prompt with all required fields', () => {
      const story = {
        id: 'context-0001-0001',
        name: 'User Login',
        userType: 'all users',
        description: 'Users can log in with email and password',
        acceptance: [
          'User can enter email and password',
          'Valid credentials grant access',
          'Invalid credentials show error'
        ],
        dependencies: []
      };
      const storyContext = 'Story context content...';
      const epic = {
        name: 'User Authentication',
        domain: 'user-management',
        features: ['authentication', 'authorization']
      };

      const prompt = validator.buildStoryValidationPrompt(story, storyContext, epic);

      expect(prompt).toContain('context-0001-0001');
      expect(prompt).toContain('User Login');
      expect(prompt).toContain('all users');
      expect(prompt).toContain('Users can log in with email and password');
      expect(prompt).toContain('User can enter email and password');
      expect(prompt).toContain('Valid credentials grant access');
      expect(prompt).toContain('Invalid credentials show error');
      expect(prompt).toContain('User Authentication');
      expect(prompt).toContain('user-management');
      expect(prompt).toContain('authentication');
      expect(prompt).toContain('Story context content...');
    });

    it('should handle story with empty acceptance criteria', () => {
      const story = {
        id: 'context-0001-0001',
        name: 'Simple Story',
        userType: 'admin',
        description: 'Admin can do something',
        acceptance: [],
        dependencies: []
      };
      const storyContext = 'Context...';
      const epic = {
        name: 'Admin Panel',
        domain: 'frontend',
        features: []
      };

      const prompt = validator.buildStoryValidationPrompt(story, storyContext, epic);

      // Should not crash, should have minimal content
      expect(prompt).toContain('context-0001-0001');
      expect(prompt).toContain('Simple Story');
    });
  });

  describe('Validation Feedback Storage', () => {
    it('should store validation feedback for work items', () => {
      const workItemId = 'context-0001';
      const validationResult = {
        averageScore: 85,
        overallStatus: 'acceptable',
        criticalIssues: [],
        majorIssues: [],
        minorIssues: []
      };

      validator.storeValidationFeedback(workItemId, validationResult);

      const retrieved = validator.getValidationFeedback(workItemId);
      expect(retrieved).toEqual(validationResult);
    });

    it('should return null for non-existent work item', () => {
      const retrieved = validator.getValidationFeedback('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should overwrite previous feedback for same work item', () => {
      const workItemId = 'context-0001';

      validator.storeValidationFeedback(workItemId, { score: 70 });
      validator.storeValidationFeedback(workItemId, { score: 85 });

      const retrieved = validator.getValidationFeedback(workItemId);
      expect(retrieved.score).toBe(85);
    });
  });

  describe('Error Handling', () => {
    it('should throw error if agent file not found', () => {
      expect(() => {
        validator.loadAgentInstructions('non-existent-agent.md');
      }).toThrow('Agent file not found');
    });
  });
});
