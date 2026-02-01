import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectInitiator } from '../../cli/init.js';
import fs from 'fs';
import path from 'path';

describe('Remove Command', () => {
  let testDir;
  let initiator;

  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-remove-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });

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

  describe('REPL Mode Detection', () => {
    it('should detect REPL mode and note that interactive confirmation is handled by REPL', async () => {
      // Initialize project
      await initiator.init();

      // Set REPL mode
      process.env.AVC_REPL_MODE = 'true';

      const logSpy = vi.spyOn(console, 'log');

      await initiator.remove();

      // Should note that this is unexpected (REPL should handle confirmation)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Interactive confirmation should be handled by REPL'));

      // .avc folder should still exist (not deleted without confirmation)
      expect(fs.existsSync(initiator.avcDir)).toBe(true);

      logSpy.mockRestore();
    });

    it('should work normally when not in REPL mode', async () => {
      // Initialize project
      await initiator.init();

      // Not in REPL mode
      delete process.env.AVC_REPL_MODE;

      const logSpy = vi.spyOn(console, 'log');

      // This would normally prompt for confirmation
      // We can't easily test the interactive part, but we can verify it tries
      const removePromise = initiator.remove();

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should show confirmation prompt (not REPL limitation message)
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('REPL Mode Limitation'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('To confirm deletion, type exactly: delete all'));

      logSpy.mockRestore();

      // Note: We can't complete this test without handling stdin
      // The promise will hang, so we just verify the initial behavior
    });
  });

  describe('Not Initialized', () => {
    it('should handle remove when project not initialized', async () => {
      const logSpy = vi.spyOn(console, 'log');

      await initiator.remove();

      // Should inform user that project is not initialized
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No AVC project found'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Nothing to remove'));

      logSpy.mockRestore();
    });
  });

  describe('Content Listing', () => {
    it('should list .avc contents before removal', async () => {
      // Initialize project
      await initiator.init();

      // Create some test content
      const projectDir = path.join(initiator.avcDir, 'project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'test.md'), 'test content', 'utf8');

      // Set REPL mode to avoid hanging on confirmation
      process.env.AVC_REPL_MODE = 'true';

      const logSpy = vi.spyOn(console, 'log');

      await initiator.remove();

      // Should list the .avc contents
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('.avc/ folder contents:'));

      logSpy.mockRestore();
    });

    it('should get AVC contents correctly', () => {
      // Initialize project
      fs.mkdirSync(initiator.avcDir, { recursive: true });
      fs.writeFileSync(path.join(initiator.avcDir, 'avc.json'), '{}', 'utf8');

      const projectDir = path.join(initiator.avcDir, 'project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'doc.md'), 'content', 'utf8');

      const contents = initiator.getAvcContents();

      expect(contents.length).toBeGreaterThan(0);
      expect(contents.some(item => item.includes('avc.json'))).toBe(true);
      expect(contents.some(item => item.includes('project/'))).toBe(true);
    });

    it('should count items recursively', () => {
      // Create nested structure
      fs.mkdirSync(initiator.avcDir, { recursive: true });

      const level1 = path.join(initiator.avcDir, 'level1');
      fs.mkdirSync(level1, { recursive: true });
      fs.writeFileSync(path.join(level1, 'file1.md'), 'content', 'utf8');

      const level2 = path.join(level1, 'level2');
      fs.mkdirSync(level2, { recursive: true });
      fs.writeFileSync(path.join(level2, 'file2.md'), 'content', 'utf8');

      const count = initiator.countItemsRecursive(initiator.avcDir);

      // Should count all items (directories + files)
      expect(count).toBeGreaterThan(2);
    });
  });

  describe('Environment File Handling', () => {
    it('should note that .env file will not be deleted', async () => {
      // Initialize project
      await initiator.init();

      // Create .env file
      const envPath = path.join(testDir, '.env');
      fs.writeFileSync(envPath, 'ANTHROPIC_API_KEY=test', 'utf8');

      // Set REPL mode
      process.env.AVC_REPL_MODE = 'true';

      const logSpy = vi.spyOn(console, 'log');

      await initiator.remove();

      // Should note that .env will not be deleted
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('.env file will NOT be deleted'));

      logSpy.mockRestore();
    });
  });

  describe('Error Cases', () => {
    it('should handle getAvcContents when .avc does not exist', () => {
      const contents = initiator.getAvcContents();

      expect(contents).toEqual([]);
    });

    it('should handle countItemsRecursive with invalid directory', () => {
      const count = initiator.countItemsRecursive('/nonexistent/path');

      expect(count).toBe(0);
    });
  });
});
