import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandLogger } from '../../cli/command-logger.js';
import fs from 'fs';
import path from 'path';

describe('CommandLogger', () => {
  let testDir;
  let logger;

  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-logger-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Stop logger if running
    if (logger) {
      logger.stop();
    }

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Log File Creation', () => {
    it('should create log file with correct name format', () => {
      logger = new CommandLogger('init', testDir);

      const logPath = logger.getLogPath();
      expect(logPath).toBeTruthy();
      expect(logPath).toContain('.avc/logs/');
      expect(logPath).toContain('init-');
      expect(logPath).toMatch(/\.log$/);
    });

    it('should create logs directory if it does not exist', () => {
      logger = new CommandLogger('status', testDir);

      const logsDir = path.join(testDir, '.avc', 'logs');
      expect(fs.existsSync(logsDir)).toBe(true);
    });

    it('should write header to log file', () => {
      logger = new CommandLogger('sponsor-call', testDir);

      const logPath = logger.getLogPath();
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('AVC Command Log: sponsor-call');
      expect(content).toContain('Timestamp:');
      expect(content).toContain('Project:');
    });
  });

  describe('Console Interception', () => {
    it('should capture console.log output', () => {
      logger = new CommandLogger('test', testDir);
      logger.start();

      console.log('Test log message');

      logger.stop();

      const logPath = logger.getLogPath();
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('Test log message');
      expect(content).toContain('[INFO]');
    });

    it('should capture console.error output', () => {
      logger = new CommandLogger('test', testDir);
      logger.start();

      console.error('Test error message');

      logger.stop();

      const logPath = logger.getLogPath();
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('Test error message');
      expect(content).toContain('[ERROR]');
    });

    it('should capture console.warn output', () => {
      logger = new CommandLogger('test', testDir);
      logger.start();

      console.warn('Test warning message');

      logger.stop();

      const logPath = logger.getLogPath();
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('Test warning message');
      expect(content).toContain('[WARN]');
    });

    it('should restore original console methods after stop', () => {
      const originalLog = console.log;

      logger = new CommandLogger('test', testDir);
      logger.start();

      expect(console.log).not.toBe(originalLog);

      logger.stop();

      expect(console.log).toBe(originalLog);
    });
  });

  describe('Log Content', () => {
    it('should include timestamps in log entries', () => {
      logger = new CommandLogger('test', testDir);
      logger.start();

      console.log('Message with timestamp');

      logger.stop();

      const logPath = logger.getLogPath();
      const content = fs.readFileSync(logPath, 'utf8');

      // Should have ISO timestamp format
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    it('should handle multiple log entries', () => {
      logger = new CommandLogger('test', testDir);
      logger.start();

      console.log('First message');
      console.log('Second message');
      console.log('Third message');

      logger.stop();

      const logPath = logger.getLogPath();
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('First message');
      expect(content).toContain('Second message');
      expect(content).toContain('Third message');
    });

    it('should handle object logging', () => {
      logger = new CommandLogger('test', testDir);
      logger.start();

      console.log({ key: 'value', nested: { data: 123 } });

      logger.stop();

      const logPath = logger.getLogPath();
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('"key"');
      expect(content).toContain('"value"');
      expect(content).toContain('"nested"');
    });

    it('should write footer when stopped', () => {
      logger = new CommandLogger('test', testDir);
      logger.start();

      console.log('Test message');

      logger.stop();

      const logPath = logger.getLogPath();
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('Command completed:');
      expect(content).toContain('Log saved:');
    });
  });

  describe('Cleanup Old Logs', () => {
    it('should keep only specified number of logs per command', () => {
      const logsDir = path.join(testDir, '.avc', 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      // Create 15 old log files for 'init' command
      for (let i = 0; i < 15; i++) {
        const filename = `init-2026-01-${String(i + 1).padStart(2, '0')}-12-00-00.log`;
        fs.writeFileSync(path.join(logsDir, filename), 'test content', 'utf8');
      }

      // Create 5 old log files for 'status' command
      for (let i = 0; i < 5; i++) {
        const filename = `status-2026-01-${String(i + 1).padStart(2, '0')}-12-00-00.log`;
        fs.writeFileSync(path.join(logsDir, filename), 'test content', 'utf8');
      }

      // Cleanup - keep last 10
      CommandLogger.cleanupOldLogs(testDir, 10);

      const remainingFiles = fs.readdirSync(logsDir);
      const initLogs = remainingFiles.filter(f => f.startsWith('init-'));
      const statusLogs = remainingFiles.filter(f => f.startsWith('status-'));

      expect(initLogs.length).toBe(10); // Should keep 10 out of 15
      expect(statusLogs.length).toBe(5); // Should keep all 5
    });

    it('should handle cleanup when logs directory does not exist', () => {
      // Should not throw error
      expect(() => {
        CommandLogger.cleanupOldLogs(testDir, 10);
      }).not.toThrow();
    });

    it('should handle cleanup with no log files', () => {
      const logsDir = path.join(testDir, '.avc', 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      // Should not throw error
      expect(() => {
        CommandLogger.cleanupOldLogs(testDir, 10);
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle log directory creation failure gracefully', () => {
      // Create a file where the directory should be (causes mkdir to fail)
      const avcPath = path.join(testDir, '.avc');
      fs.mkdirSync(avcPath, { recursive: true });
      fs.writeFileSync(path.join(avcPath, 'logs'), 'blocking file', 'utf8');

      // Should not throw error
      expect(() => {
        logger = new CommandLogger('test', testDir);
      }).not.toThrow();

      // Log path should be null when creation fails
      expect(logger.getLogPath()).toBeNull();
    });

    it('should continue working even if log file creation fails', () => {
      logger = new CommandLogger('test', testDir);

      // Corrupt the log path
      logger.logFilePath = null;

      // Should not throw when writing logs
      expect(() => {
        logger.start();
        console.log('This should not crash');
        logger.stop();
      }).not.toThrow();
    });
  });

  describe('Different Commands', () => {
    it('should create separate log files for different commands', () => {
      const logger1 = new CommandLogger('init', testDir);
      const logger2 = new CommandLogger('sponsor-call', testDir);
      const logger3 = new CommandLogger('status', testDir);

      const path1 = logger1.getLogPath();
      const path2 = logger2.getLogPath();
      const path3 = logger3.getLogPath();

      expect(path1).toContain('init-');
      expect(path2).toContain('sponsor-call-');
      expect(path3).toContain('status-');

      expect(path1).not.toBe(path2);
      expect(path2).not.toBe(path3);
      expect(path1).not.toBe(path3);
    });

    it('should create unique log files for same command run multiple times', async () => {
      const logger1 = new CommandLogger('init', testDir);
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait >1 second for timestamp to change
      const logger2 = new CommandLogger('init', testDir);

      const path1 = logger1.getLogPath();
      const path2 = logger2.getLogPath();

      expect(path1).not.toBe(path2);
      expect(path1).toContain('init-');
      expect(path2).toContain('init-');
    });
  });
});
