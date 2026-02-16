import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mockEnv } from '../helpers/test-helpers.js';
import { outputBuffer } from '../../cli/output-buffer.js';
import { messageManager } from '../../cli/message-manager.js';

describe('Sponsor Call Ceremony - End-to-End', () => {
  let ProjectInitiator;
  let LLMProvider;
  let testProjectPath;
  let restoreEnv;

  beforeEach(async () => {
    ProjectInitiator = (await import('../../cli/init.js')).ProjectInitiator;
    LLMProvider = (await import('../../cli/llm-provider.js')).LLMProvider;

    testProjectPath = path.join('/tmp', `avc-test-sponsor-${Date.now()}`);
    fs.mkdirSync(testProjectPath, { recursive: true });

    // Clear output buffer
    outputBuffer.clear();

    // Mock console
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock environment with valid keys
    restoreEnv = mockEnv({
      ANTHROPIC_API_KEY: 'sk-ant-test-key-valid',
      GEMINI_API_KEY: 'test-gemini-key-valid'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (restoreEnv) restoreEnv();

    try {
      if (fs.existsSync(testProjectPath)) {
        fs.rmSync(testProjectPath, { recursive: true, force: true });
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('Full ceremony execution', () => {
    it('should handle uninitialized project gracefully', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      // DON'T initialize project - this should fail gracefully

      // THIS TEST WOULD HAVE CAUGHT THE process.exit() BUG
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called'); // Prevent actual exit in tests
      });

      // Start messaging context so messages are captured
      messageManager.startExecution('sponsor-call');

      // Should not call process.exit - should return gracefully
      await initiator.sponsorCall();

      // The bug: process.exit(1) was called
      // The fix: should just return
      expect(exitSpy).not.toHaveBeenCalled();

      // Check output buffer for error message (now uses messaging API with ERROR: prefix)
      const output = outputBuffer.getLines().join('\n');
      expect(output).toContain('ERROR: Project not initialized');

      // Clean up
      messageManager.endExecution();
    });

    it('should handle API key validation failure gracefully', async () => {
      const initiator = new ProjectInitiator(testProjectPath);

      // Initialize project
      initiator.init();

      // Mock failed API validation
      vi.spyOn(LLMProvider, 'validate').mockResolvedValue({
        valid: false,
        error: 'Invalid API key'
      });

      // THIS TEST WOULD HAVE CAUGHT THE process.exit() BUG
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Start messaging context so messages are captured
      messageManager.startExecution('sponsor-call');

      await initiator.sponsorCall();

      // Should not exit - should return gracefully
      expect(exitSpy).not.toHaveBeenCalled();

      // Check output buffer for error message (now uses messaging API with ERROR: prefix)
      const output = outputBuffer.getLines().join('\n');
      expect(output).toContain('ERROR: API Key Validation Failed');

      // Clean up
      messageManager.endExecution();
    });
  });
});
