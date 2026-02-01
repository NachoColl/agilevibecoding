import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Logger', () => {
  let Logger;
  let existsSyncSpy;

  beforeEach(async () => {
    // Dynamically import Logger
    const module = await import('../../cli/logger.js');
    Logger = module.Logger;

    // Mock file system operations
    existsSyncSpy = vi.spyOn(fs, 'existsSync');
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 0 });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('stores component name', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('TestComponent');

      expect(logger.componentName).toBe('TestComponent');
    });

    it('defaults to "AVC" when no name provided', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger();

      expect(logger.componentName).toBe('AVC');
    });

    it('sets log file path when .avc exists', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger();

      expect(logger.logFile).toBe(path.join(process.cwd(), '.avc', 'logs', 'avc.log'));
    });

    it('sets maxLogSize to 10MB when .avc exists', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger();

      expect(logger.maxLogSize).toBe(10 * 1024 * 1024);
    });

    it('creates log directory when .avc exists', () => {
      // Mock: .avc exists but logs/ subdirectory doesn't exist yet
      existsSyncSpy.mockImplementation((path) => {
        return !path.includes('logs'); // .avc exists, but .avc/logs doesn't
      });
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync');

      new Logger('Test');

      expect(mkdirSpy).toHaveBeenCalled();
    });

    it('disables logging when .avc does not exist', () => {
      existsSyncSpy.mockReturnValue(false);
      const logger = new Logger('Test');

      expect(logger.loggingDisabled).toBe(true);
    });

    it('does not create log directory when .avc does not exist', () => {
      existsSyncSpy.mockReturnValue(false);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync');

      new Logger('Test');

      expect(mkdirSpy).not.toHaveBeenCalled();
    });

    it('enables logging when .avc exists', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      expect(logger.loggingDisabled).toBe(false);
    });
  });

  describe('formatMessage()', () => {
    it('formats message with timestamp and level', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      const formatted = logger.formatMessage('INFO', 'Test message');

      expect(formatted).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO timestamp
      expect(formatted).toContain('[INFO]');
      expect(formatted).toContain('[Test]');
      expect(formatted).toContain('Test message');
    });

    it('includes component name in message', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('MyComponent');

      const formatted = logger.formatMessage('ERROR', 'Error occurred');

      expect(formatted).toContain('[MyComponent]');
    });

    it('appends newline to message', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      const formatted = logger.formatMessage('DEBUG', 'Debug info');

      expect(formatted).toMatch(/\n$/);
    });

    it('includes error stack when data is Error', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');
      const error = new Error('Test error');

      const formatted = logger.formatMessage('ERROR', 'Failed', error);

      expect(formatted).toContain('Test error');
      expect(formatted).toContain('Error:');
    });

    it('stringifies object data', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');
      const data = { key: 'value', nested: { prop: 123 } };

      const formatted = logger.formatMessage('INFO', 'Data log', data);

      expect(formatted).toContain('"key"');
      expect(formatted).toContain('"value"');
    });
  });

  describe('writeLog()', () => {
    it('writes formatted message to log file when logging enabled', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');
      const appendSpy = vi.spyOn(fs, 'appendFileSync');

      logger.writeLog('INFO', 'Test message');

      expect(appendSpy).toHaveBeenCalled();
      const call = appendSpy.mock.calls[0];
      expect(call[0]).toBe(logger.logFile);
      expect(call[1]).toContain('[INFO]');
      expect(call[1]).toContain('Test message');
    });

    it('skips writing when logging disabled (.avc does not exist)', () => {
      existsSyncSpy.mockReturnValue(false);
      const logger = new Logger('Test');
      const appendSpy = vi.spyOn(fs, 'appendFileSync');

      logger.writeLog('INFO', 'Test message');

      expect(logger.loggingDisabled).toBe(true);
      expect(appendSpy).not.toHaveBeenCalled();
    });

    it('checks rotation before writing', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');
      const rotateSpy = vi.spyOn(logger, 'rotateLogIfNeeded');

      logger.writeLog('INFO', 'Test');

      expect(rotateSpy).toHaveBeenCalled();
    });

    it('handles write errors gracefully', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Should not throw
      expect(() => logger.writeLog('INFO', 'Test')).not.toThrow();
    });
  });

  describe('rotateLogIfNeeded()', () => {
    it('renames log file when size exceeds limit', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 11 * 1024 * 1024 }); // 11MB

      const renameSpy = vi.spyOn(fs, 'renameSync');

      logger.rotateLogIfNeeded();

      expect(renameSpy).toHaveBeenCalledWith(
        logger.logFile,
        logger.logFile + '.old'
      );
    });

    it('does not rotate when file is under size limit', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 5 * 1024 * 1024 }); // 5MB

      const renameSpy = vi.spyOn(fs, 'renameSync');

      logger.rotateLogIfNeeded();

      expect(renameSpy).not.toHaveBeenCalled();
    });

    it('does not rotate when log file does not exist', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const renameSpy = vi.spyOn(fs, 'renameSync');

      logger.rotateLogIfNeeded();

      expect(renameSpy).not.toHaveBeenCalled();
    });

    it('deletes old backup before rotating', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 11 * 1024 * 1024 });

      const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

      logger.rotateLogIfNeeded();

      expect(unlinkSpy).toHaveBeenCalledWith(logger.logFile + '.old');
    });

    it('handles rotation errors gracefully', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 11 * 1024 * 1024 });
      vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw
      expect(() => logger.rotateLogIfNeeded()).not.toThrow();
    });
  });

  describe('Convenience methods', () => {
    it('info() calls writeLog with INFO level', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      const writeSpy = vi.spyOn(logger, 'writeLog');

      logger.info('Info message');

      expect(writeSpy).toHaveBeenCalledWith('INFO', 'Info message', null);
    });

    it('warn() calls writeLog with WARN level', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      const writeSpy = vi.spyOn(logger, 'writeLog');

      logger.warn('Warning message');

      expect(writeSpy).toHaveBeenCalledWith('WARN', 'Warning message', null);
    });

    it('error() calls writeLog with ERROR level', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      const writeSpy = vi.spyOn(logger, 'writeLog');

      logger.error('Error message');

      expect(writeSpy).toHaveBeenCalledWith('ERROR', 'Error message', null);
    });

    it('debug() calls writeLog with DEBUG level', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      const writeSpy = vi.spyOn(logger, 'writeLog');

      logger.debug('Debug message');

      expect(writeSpy).toHaveBeenCalledWith('DEBUG', 'Debug message', null);
    });

    it('accepts optional data parameter', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      const writeSpy = vi.spyOn(logger, 'writeLog');
      const data = { key: 'value' };

      logger.info('Message with data', data);

      expect(writeSpy).toHaveBeenCalledWith('INFO', 'Message with data', data);
    });
  });

  describe('readRecentLogs()', () => {
    it('returns log content when file exists', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('Line 1\nLine 2\nLine 3\n');

      const logs = logger.readRecentLogs(10);

      expect(logs).toContain('Line 1');
      expect(logs).toContain('Line 2');
      expect(logs).toContain('Line 3');
    });

    it('returns message when logging disabled', () => {
      existsSyncSpy.mockReturnValue(false);
      const logger = new Logger('Test');

      const logs = logger.readRecentLogs();

      expect(logs).toBe('No logs available (project not initialized).');
    });

    it('returns message when no logs available', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const logs = logger.readRecentLogs();

      expect(logs).toBe('No logs available yet.');
    });

    it('limits to recent N lines', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      const manyLines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n');

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(manyLines);

      const logs = logger.readRecentLogs(5);

      const lineCount = logs.split('\n').length;
      expect(lineCount).toBe(5);
      expect(logs).toContain('Line 99'); // Last line
    });
  });

  describe('clearLogs()', () => {
    it('deletes main log file when logging enabled', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

      logger.clearLogs();

      expect(unlinkSpy).toHaveBeenCalledWith(logger.logFile);
    });

    it('does not delete files when logging disabled', () => {
      existsSyncSpy.mockReturnValue(false);
      const logger = new Logger('Test');
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

      logger.clearLogs();

      expect(logger.loggingDisabled).toBe(true);
      expect(unlinkSpy).not.toHaveBeenCalled();
    });

    it('deletes old log file', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

      logger.clearLogs();

      expect(unlinkSpy).toHaveBeenCalledWith(logger.logFile + '.old');
    });

    it('handles missing files gracefully', () => {
      existsSyncSpy.mockReturnValue(true);
      const logger = new Logger('Test');

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Should not throw
      expect(() => logger.clearLogs()).not.toThrow();
    });
  });
});
