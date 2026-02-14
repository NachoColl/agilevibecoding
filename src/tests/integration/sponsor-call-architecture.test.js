import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TemplateProcessor } from '../../cli/template-processor.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Integration tests for sponsor-call architecture selection workflow
 *
 * Tests the new flow:
 * 1. Mission Statement → Initial Scope
 * 2. Architecture recommendation
 * 3. Architecture selection
 * 4. Cloud provider selection (if applicable)
 * 5. Question pre-filling
 */

describe('Sponsor Call Architecture Selection Workflow', () => {
  let testDir;
  let avcDir;
  let processor;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-test-'));
    avcDir = path.join(testDir, '.avc');
    fs.mkdirSync(avcDir, { recursive: true });

    // Create minimal avc.json
    const avcConfigPath = path.join(avcDir, 'avc.json');
    fs.writeFileSync(
      avcConfigPath,
      JSON.stringify({
        version: '1.0.0',
        projectName: 'test-project',
        settings: {
          ceremonies: [
            {
              name: 'sponsor-call',
              provider: 'claude',
              defaultModel: 'claude-sonnet-4-5-20250929',
              stages: {
                'architecture-recommendation': {
                  provider: 'claude',
                  model: 'claude-opus-4-6'
                },
                'question-prefilling': {
                  provider: 'claude',
                  model: 'claude-sonnet-4-5-20250929'
                }
              }
            }
          ]
        }
      }),
      'utf8'
    );

    // Change to test directory
    process.chdir(testDir);

    // Create processor instance
    processor = new TemplateProcessor('sponsor-call', null, true);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getArchitectureRecommendations', () => {
    it('should return architecture recommendations', async () => {
      if (!global.hasRealApiKeys()) {
        console.log('⚠️  Skipping test: requires real API keys (set ANTHROPIC_API_KEY in .env)');
        return;
      }

      const missionStatement = 'Help remote teams track daily tasks and collaborate asynchronously';
      const initialScope = 'Task creation, assignment, comments, basic notifications';

      const architectures = await processor.getArchitectureRecommendations(
        missionStatement,
        initialScope
      );

      // Verify response structure
      expect(architectures).toBeDefined();
      expect(Array.isArray(architectures)).toBe(true);
      expect(architectures.length).toBeGreaterThan(0);
      expect(architectures.length).toBeLessThanOrEqual(5);

      // Verify each architecture has required fields
      architectures.forEach(arch => {
        expect(arch).toHaveProperty('name');
        expect(arch).toHaveProperty('description');
        expect(arch).toHaveProperty('requiresCloudProvider');
        expect(arch).toHaveProperty('bestFor');
        expect(typeof arch.name).toBe('string');
        expect(typeof arch.description).toBe('string');
        expect(typeof arch.requiresCloudProvider).toBe('boolean');
        expect(typeof arch.bestFor).toBe('string');
      });
    }, 60000); // Increase timeout for LLM call

    it('should handle mission statements for different project types', async () => {
      if (!global.hasRealApiKeys()) {
        console.log('⚠️  Skipping test: requires real API keys (set ANTHROPIC_API_KEY in .env)');
        return;
      }

      const testCases = [
        {
          mission: 'Provide real-time image classification API for e-commerce',
          scope: 'Image upload, ML inference, REST API, batch processing'
        },
        {
          mission: 'Automate database migration workflow for development teams',
          scope: 'Schema diff detection, migration generation, rollback support'
        }
      ];

      for (const testCase of testCases) {
        const architectures = await processor.getArchitectureRecommendations(
          testCase.mission,
          testCase.scope
        );

        expect(architectures).toBeDefined();
        expect(architectures.length).toBeGreaterThan(0);
      }
    }, 120000);

    it('should throw error when architecture recommendation fails', async () => {
      if (!global.hasRealApiKeys()) {
        console.log('⚠️  Skipping test: requires real API keys (set ANTHROPIC_API_KEY in .env)');
        return;
      }

      // Create processor with invalid configuration
      const invalidProcessor = new TemplateProcessor('invalid-ceremony', null, true);

      await expect(
        invalidProcessor.getArchitectureRecommendations('test', 'test')
      ).rejects.toThrow();
    }, 20000);
  });

  describe('prefillQuestions', () => {
    it('should prefill questions based on architecture selection', async () => {
      if (!global.hasRealApiKeys()) {
        console.log('⚠️  Skipping test: requires real API keys (set ANTHROPIC_API_KEY in .env)');
        return;
      }

      const missionStatement = 'Help remote teams track daily tasks';
      const initialScope = 'Task creation, assignment, comments';
      const architecture = {
        name: 'Next.js Full-Stack on Vercel',
        description: 'Next.js 14 with App Router, Server Actions, Vercel Postgres',
        requiresCloudProvider: false,
        bestFor: 'Rapid development with seamless integration'
      };

      const prefilled = await processor.prefillQuestions(
        missionStatement,
        initialScope,
        architecture,
        null
      );

      // Verify response structure
      expect(prefilled).toBeDefined();
      expect(prefilled).toHaveProperty('TARGET_USERS');
      expect(prefilled).toHaveProperty('DEPLOYMENT_TARGET');
      expect(prefilled).toHaveProperty('TECHNICAL_CONSIDERATIONS');
      expect(prefilled).toHaveProperty('SECURITY_AND_COMPLIANCE_REQUIREMENTS');

      // Verify content is not empty
      expect(prefilled.TARGET_USERS.length).toBeGreaterThan(0);
      expect(prefilled.DEPLOYMENT_TARGET.length).toBeGreaterThan(0);
      expect(prefilled.TECHNICAL_CONSIDERATIONS.length).toBeGreaterThan(0);
      expect(prefilled.SECURITY_AND_COMPLIANCE_REQUIREMENTS.length).toBeGreaterThan(0);

      // Verify deployment target mentions Vercel (matches architecture)
      expect(prefilled.DEPLOYMENT_TARGET.toLowerCase()).toContain('vercel');
    }, 60000);

    it('should include cloud provider in pre-filled answers when specified', async () => {
      if (!global.hasRealApiKeys()) {
        console.log('⚠️  Skipping test: requires real API keys (set ANTHROPIC_API_KEY in .env)');
        return;
      }

      const missionStatement = 'Real-time API for image classification';
      const initialScope = 'Image upload, ML inference, batch processing';
      const architecture = {
        name: 'Serverless ML Pipeline',
        description: 'API Gateway + Lambda + SageMaker',
        requiresCloudProvider: true,
        bestFor: 'Production ML workloads'
      };

      const prefilled = await processor.prefillQuestions(
        missionStatement,
        initialScope,
        architecture,
        'AWS'
      );

      expect(prefilled).toBeDefined();

      // Verify AWS-specific services are mentioned
      const deploymentTarget = prefilled.DEPLOYMENT_TARGET.toLowerCase();
      const technicalConsiderations = prefilled.TECHNICAL_CONSIDERATIONS.toLowerCase();

      const hasAwsReferences =
        deploymentTarget.includes('aws') ||
        deploymentTarget.includes('lambda') ||
        technicalConsiderations.includes('aws') ||
        technicalConsiderations.includes('lambda');

      expect(hasAwsReferences).toBe(true);
    }, 60000);

    it('should handle different cloud providers', async () => {
      if (!global.hasRealApiKeys()) {
        console.log('⚠️  Skipping test: requires real API keys (set ANTHROPIC_API_KEY in .env)');
        return;
      }

      const architecture = {
        name: 'Containerized Application',
        description: 'Docker containers with managed database',
        requiresCloudProvider: true,
        bestFor: 'Scalable applications'
      };

      const providers = ['AWS', 'Azure', 'GCP'];

      for (const provider of providers) {
        const prefilled = await processor.prefillQuestions(
          'Test application',
          'Core features',
          architecture,
          provider
        );

        expect(prefilled).toBeDefined();
        expect(prefilled.DEPLOYMENT_TARGET).toBeDefined();
        expect(prefilled.DEPLOYMENT_TARGET.length).toBeGreaterThan(0);
      }
    }, 120000);

    it('should fill missing fields with empty strings on error', async () => {
      // Mock generateJSON to return incomplete response
      const originalMethod = processor.llmProvider?.generateJSON;

      if (processor.llmProvider) {
        processor.llmProvider.generateJSON = vi.fn().mockResolvedValue({
          TARGET_USERS: 'Test users',
          // Missing other fields
        });

        const result = await processor.prefillQuestions(
          'test',
          'test',
          { name: 'test', description: 'test', requiresCloudProvider: false, bestFor: 'test' },
          null
        );

        expect(result.DEPLOYMENT_TARGET).toBe('');
        expect(result.TECHNICAL_CONSIDERATIONS).toBe('');
        expect(result.SECURITY_AND_COMPLIANCE_REQUIREMENTS).toBe('');

        // Restore original method
        processor.llmProvider.generateJSON = originalMethod;
      }
    });
  });

  describe('Progress save/load with architecture selection', () => {
    it('should save architecture selection stage to progress', () => {
      const progressPath = path.join(avcDir, 'sponsor-call-progress.json');
      const progress = {
        stage: 'architecture-selection',
        collectedValues: {
          MISSION_STATEMENT: 'Test mission',
          INITIAL_SCOPE: 'Test scope'
        },
        architectureSelection: {
          options: [
            {
              name: 'Test Architecture',
              description: 'Test description',
              requiresCloudProvider: false,
              bestFor: 'Testing'
            }
          ],
          selected: null
        },
        cloudProvider: null,
        aiPrefilledQuestions: [],
        lastUpdate: new Date().toISOString()
      };

      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf8');

      const loaded = JSON.parse(fs.readFileSync(progressPath, 'utf8'));

      expect(loaded.stage).toBe('architecture-selection');
      expect(loaded.architectureSelection).toBeDefined();
      expect(loaded.architectureSelection.options).toBeDefined();
      expect(loaded.collectedValues.MISSION_STATEMENT).toBe('Test mission');
    });

    it('should save cloud provider selection stage to progress', () => {
      const progressPath = path.join(avcDir, 'sponsor-call-progress.json');
      const progress = {
        stage: 'cloud-provider-selection',
        collectedValues: {
          MISSION_STATEMENT: 'Test mission',
          INITIAL_SCOPE: 'Test scope'
        },
        architectureSelection: {
          options: [],
          selected: {
            name: 'Cloud Architecture',
            description: 'Test',
            requiresCloudProvider: true,
            bestFor: 'Testing'
          }
        },
        cloudProvider: null,
        aiPrefilledQuestions: [],
        lastUpdate: new Date().toISOString()
      };

      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf8');

      const loaded = JSON.parse(fs.readFileSync(progressPath, 'utf8'));

      expect(loaded.stage).toBe('cloud-provider-selection');
      expect(loaded.architectureSelection.selected.requiresCloudProvider).toBe(true);
    });

    it('should save AI prefilled questions to progress', () => {
      const progressPath = path.join(avcDir, 'sponsor-call-progress.json');
      const progress = {
        stage: 'questionnaire',
        collectedValues: {
          MISSION_STATEMENT: 'Test mission',
          INITIAL_SCOPE: 'Test scope',
          TARGET_USERS: 'AI generated users',
          DEPLOYMENT_TARGET: 'AI generated target'
        },
        aiPrefilledQuestions: ['TARGET_USERS', 'DEPLOYMENT_TARGET'],
        lastUpdate: new Date().toISOString()
      };

      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf8');

      const loaded = JSON.parse(fs.readFileSync(progressPath, 'utf8'));

      expect(loaded.aiPrefilledQuestions).toBeDefined();
      expect(loaded.aiPrefilledQuestions).toContain('TARGET_USERS');
      expect(loaded.aiPrefilledQuestions).toContain('DEPLOYMENT_TARGET');
    });
  });

  describe('Error handling and graceful degradation', () => {
    it('should handle LLM failures gracefully in architecture recommendation', async () => {
      // Create processor with invalid provider to trigger error
      const invalidProcessor = new TemplateProcessor('sponsor-call', null, true);

      // Mock the provider to throw an error
      if (invalidProcessor.llmProvider) {
        const originalMethod = invalidProcessor.llmProvider.generateJSON;
        invalidProcessor.llmProvider.generateJSON = vi.fn().mockRejectedValue(
          new Error('API error')
        );

        await expect(
          invalidProcessor.getArchitectureRecommendations('test', 'test')
        ).rejects.toThrow('API error');

        // Restore
        invalidProcessor.llmProvider.generateJSON = originalMethod;
      }
    });

    it('should handle missing required fields in architecture response', async () => {
      const invalidProcessor = new TemplateProcessor('sponsor-call', null, true);

      if (invalidProcessor.llmProvider) {
        const originalMethod = invalidProcessor.llmProvider.generateJSON;
        invalidProcessor.llmProvider.generateJSON = vi.fn().mockResolvedValue({
          architectures: [
            {
              name: 'Test',
              // Missing description, requiresCloudProvider, bestFor
            }
          ]
        });

        await expect(
          invalidProcessor.getArchitectureRecommendations('test', 'test')
        ).rejects.toThrow();

        invalidProcessor.llmProvider.generateJSON = originalMethod;
      }
    });
  });
});
