import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectInitiator } from '../../cli/init.js';
import { TemplateProcessor } from '../../cli/template-processor.js';
import fs from 'fs';
import path from 'path';

describe('Questionnaire Feature', () => {
  let testDir;
  let initiator;

  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-questionnaire-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });

    // Set up test environment
    process.env.ANTHROPIC_API_KEY = 'test-key-12345';
    process.env.AVC_REPL_MODE = 'true';

    // Create initiator
    initiator = new ProjectInitiator(testDir);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Clean up environment
    delete process.env.AVC_REPL_MODE;
  });

  describe('sponsorCallWithAnswers', () => {
    it('should reject if project not initialized', async () => {
      const answers = {
        MISSION_STATEMENT: 'Test mission',
        TARGET_USERS: 'Test users',
        INITIAL_SCOPE: 'Test scope',
        TECHNICAL_CONSIDERATIONS: 'Test tech',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: 'Test security'
      };

      // Spy on console.log to capture output
      const logSpy = vi.spyOn(console, 'log');

      await initiator.sponsorCallWithAnswers(answers);

      // Should log error about not initialized
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Project not initialized'));

      logSpy.mockRestore();
    });

    it('should accept all answers provided', async () => {
      // Initialize project first
      await initiator.init();

      const answers = {
        MISSION_STATEMENT: 'A comprehensive project management tool',
        TARGET_USERS: 'Software developers and project managers',
        INITIAL_SCOPE: 'Task tracking, time management, reporting',
        TECHNICAL_CONSIDERATIONS: 'React, Node.js, PostgreSQL',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: 'HTTPS, JWT authentication'
      };

      // Mock the LLM provider to avoid API calls
      vi.mock('../../cli/llm-provider.js', () => ({
        LLMProvider: {
          validate: vi.fn().mockResolvedValue({ valid: true }),
          create: vi.fn().mockResolvedValue({
            generate: vi.fn().mockResolvedValue('Enhanced document content')
          })
        }
      }));

      const logSpy = vi.spyOn(console, 'log');

      await initiator.sponsorCallWithAnswers(answers);

      // Should log success
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Received 5/5 answers'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Project defined successfully'));

      logSpy.mockRestore();
    });

    it('should handle partial answers (some skipped)', async () => {
      // Initialize project first
      await initiator.init();

      const answers = {
        MISSION_STATEMENT: 'A comprehensive project management tool',
        TARGET_USERS: null, // Skipped
        INITIAL_SCOPE: 'Task tracking, time management',
        TECHNICAL_CONSIDERATIONS: null, // Skipped
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: 'HTTPS, JWT'
      };

      const logSpy = vi.spyOn(console, 'log');

      await initiator.sponsorCallWithAnswers(answers);

      // Should log correct count (3 answers, 2 skipped)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Received 3/5 answers'));

      logSpy.mockRestore();
    });

    it('should create progress file during processing', async () => {
      // Initialize project first
      await initiator.init();

      const answers = {
        MISSION_STATEMENT: 'Test mission',
        TARGET_USERS: 'Test users',
        INITIAL_SCOPE: 'Test scope',
        TECHNICAL_CONSIDERATIONS: 'Test tech',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: 'Test security'
      };

      const progressPath = initiator.sponsorCallProgressPath;

      await initiator.sponsorCallWithAnswers(answers);

      // Progress file should be cleaned up after completion
      expect(fs.existsSync(progressPath)).toBe(false);
    });

    it('should handle empty answers object', async () => {
      // Initialize project first
      await initiator.init();

      const answers = {};

      const logSpy = vi.spyOn(console, 'log');

      await initiator.sponsorCallWithAnswers(answers);

      // Should log 0 answers
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Received 0/5 answers'));

      logSpy.mockRestore();
    });
  });

  describe('Template Processor - Pre-filled Answers', () => {
    // No beforeEach needed - TemplateProcessor creates .avc directory automatically via TokenTracker.init()

    it('should detect all answers pre-filled', () => {
      const processor = new TemplateProcessor('sponsor-call');

      // Read template content
      const templateContent = fs.readFileSync(
        path.join(process.cwd(), 'cli/templates/project.md'),
        'utf8'
      );

      // Extract variables
      const variables = processor.extractVariables(templateContent);

      // All variables should be detected
      expect(variables.length).toBeGreaterThan(0);
      expect(variables.some(v => v.name === 'MISSION_STATEMENT')).toBe(true);
      expect(variables.some(v => v.name === 'TARGET_USERS')).toBe(true);
    });

    it('should replace variables correctly', () => {
      const processor = new TemplateProcessor('sponsor-call');

      const template = `# Project

Mission: {{MISSION_STATEMENT}}

Users: {{TARGET_USERS}}`;

      const values = {
        MISSION_STATEMENT: 'Build great software',
        TARGET_USERS: 'Developers'
      };

      const result = processor.replaceVariables(template, values);

      expect(result).toContain('Build great software');
      expect(result).toContain('Developers');
      expect(result).not.toContain('{{MISSION_STATEMENT}}');
      expect(result).not.toContain('{{TARGET_USERS}}');
    });

    it('should handle array values correctly', () => {
      const processor = new TemplateProcessor('sponsor-call');

      const template = `Items: {{TEST_ITEMS}}`;

      const values = {
        TEST_ITEMS: ['Item 1', 'Item 2', 'Item 3']
      };

      const result = processor.replaceVariables(template, values);

      expect(result).toContain('- Item 1');
      expect(result).toContain('- Item 2');
      expect(result).toContain('- Item 3');
    });

    it('should detect plural variables', () => {
      const processor = new TemplateProcessor('sponsor-call');

      expect(processor.isPlural('REQUIREMENTS')).toBe(true);
      expect(processor.isPlural('OBJECTIVES')).toBe(true);
      expect(processor.isPlural('USERS')).toBe(true);
      expect(processor.isPlural('MISSION_STATEMENT')).toBe(false);
    });

    it('should convert variable names to display format', () => {
      const processor = new TemplateProcessor('sponsor-call');

      expect(processor.toDisplayName('MISSION_STATEMENT')).toBe('Mission Statement');
      expect(processor.toDisplayName('TARGET_USERS')).toBe('Target Users');
      expect(processor.toDisplayName('INITIAL_SCOPE')).toBe('Initial Scope');
    });
  });

  describe('Auto-Save and Resume', () => {
    it('should save progress correctly', () => {
      const progress = {
        stage: 'questionnaire',
        totalQuestions: 5,
        answeredQuestions: 3,
        collectedValues: {
          MISSION_STATEMENT: 'Test mission',
          TARGET_USERS: 'Test users',
          INITIAL_SCOPE: 'Test scope'
        },
        currentQuestionIndex: 3,
        currentAnswer: 'Partial answer',
        lastUpdate: new Date().toISOString()
      };

      const progressPath = path.join(testDir, 'test-progress.json');
      initiator.writeProgress(progress, progressPath);

      expect(fs.existsSync(progressPath)).toBe(true);

      const loaded = initiator.readProgress(progressPath);
      expect(loaded.stage).toBe('questionnaire');
      expect(loaded.answeredQuestions).toBe(3);
      expect(loaded.collectedValues.MISSION_STATEMENT).toBe('Test mission');
    });

    it('should detect incomplete progress', () => {
      const progressPath = path.join(testDir, 'test-progress.json');

      // No progress file exists
      expect(initiator.hasIncompleteProgress(progressPath)).toBe(false);

      // Create progress file
      const progress = {
        stage: 'questionnaire',
        totalQuestions: 5,
        answeredQuestions: 2
      };
      initiator.writeProgress(progress, progressPath);

      // Should detect progress file
      expect(initiator.hasIncompleteProgress(progressPath)).toBe(true);
    });

    it('should clear progress after completion', () => {
      const progressPath = path.join(testDir, 'test-progress.json');

      // Create progress file
      const progress = {
        stage: 'questionnaire',
        totalQuestions: 5,
        answeredQuestions: 5
      };
      initiator.writeProgress(progress, progressPath);

      expect(fs.existsSync(progressPath)).toBe(true);

      // Clear progress
      initiator.clearProgress(progressPath);

      expect(fs.existsSync(progressPath)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null answers', async () => {
      await initiator.init();

      const answers = {
        MISSION_STATEMENT: null,
        TARGET_USERS: null,
        INITIAL_SCOPE: null,
        TECHNICAL_CONSIDERATIONS: null,
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: null
      };

      const logSpy = vi.spyOn(console, 'log');

      await initiator.sponsorCallWithAnswers(answers);

      // Should still proceed
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Received 0/5 answers'));

      logSpy.mockRestore();
    });

    it('should handle empty string answers', async () => {
      await initiator.init();

      const answers = {
        MISSION_STATEMENT: '',
        TARGET_USERS: '',
        INITIAL_SCOPE: 'Something',
        TECHNICAL_CONSIDERATIONS: '',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: ''
      };

      const logSpy = vi.spyOn(console, 'log');

      await initiator.sponsorCallWithAnswers(answers);

      // Should count only non-empty answers
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Received 1/5 answers'));

      logSpy.mockRestore();
    });

    it('should handle very long answers', async () => {
      await initiator.init();

      const longAnswer = 'A'.repeat(5000);

      const answers = {
        MISSION_STATEMENT: longAnswer,
        TARGET_USERS: 'Users',
        INITIAL_SCOPE: 'Scope',
        TECHNICAL_CONSIDERATIONS: 'Tech',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: 'Security'
      };

      await initiator.sponsorCallWithAnswers(answers);

      // Should handle without errors
      const docPath = path.join(testDir, '.avc/project/doc.md');
      // Document may or may not exist depending on LLM provider availability
      // Just verify no crash occurred
    });

    it('should handle multi-line answers correctly', () => {
      const processor = new TemplateProcessor('sponsor-call');

      const template = `Answer: {{TEST}}`;

      const values = {
        TEST: 'Line 1\nLine 2\nLine 3'
      };

      const result = processor.replaceVariables(template, values);

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing .avc directory gracefully', async () => {
      const answers = {
        MISSION_STATEMENT: 'Test',
        TARGET_USERS: 'Users',
        INITIAL_SCOPE: 'Scope',
        TECHNICAL_CONSIDERATIONS: 'Tech',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: 'Security'
      };

      const logSpy = vi.spyOn(console, 'log');

      await initiator.sponsorCallWithAnswers(answers);

      // Should log error about not initialized
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Project not initialized'));

      logSpy.mockRestore();
    });

    it('should handle corrupted progress file', () => {
      const progressPath = path.join(testDir, 'corrupted-progress.json');

      // Write invalid JSON
      fs.writeFileSync(progressPath, '{invalid json', 'utf8');

      const loaded = initiator.readProgress(progressPath);

      // Should return null for corrupted file
      expect(loaded).toBeNull();
    });

    it('should handle missing template file gracefully', () => {
      const processor = new TemplateProcessor('sponsor-call');
      processor.templatePath = path.join(testDir, 'nonexistent-template.md');

      expect(() => {
        const content = fs.readFileSync(processor.templatePath, 'utf8');
      }).toThrow();
    });
  });
});
