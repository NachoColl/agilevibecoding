/**
 * Command Logger - Creates individual log files for each command execution
 *
 * Each command creates a timestamped log file in .avc/logs/ directory:
 * - init-2026-01-31-13-05-23.log
 * - sponsor-call-2026-01-31-13-10-45.log
 * - status-2026-01-31-13-15-30.log
 * - remove-2026-01-31-13-20-15.log
 */

import fs from 'fs';
import path from 'path';

class CommandLogger {
  constructor(commandName, projectRoot = process.cwd()) {
    this.commandName = commandName;
    this.projectRoot = projectRoot;
    this.logsDir = path.join(projectRoot, '.avc', 'logs');

    // Create timestamp for this command execution
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '-')
      .replace(/:/g, '-')
      .replace(/\..+/, '');

    this.logFileName = `${commandName}-${timestamp}.log`;
    this.logFilePath = path.join(this.logsDir, this.logFileName);

    // Store original console methods
    this.originalLog = console.log;
    this.originalError = console.error;
    this.originalWarn = console.warn;
    this.originalInfo = console.info;

    // Buffer for logs
    this.logBuffer = [];

    // Initialize log file
    this.initializeLogFile();
  }

  /**
   * Initialize log file and directory
   */
  initializeLogFile() {
    try {
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      // Write header to log file
      const header = [
        '='.repeat(80),
        `AVC Command Log: ${this.commandName}`,
        `Timestamp: ${new Date().toISOString()}`,
        `Project: ${this.projectRoot}`,
        `Log File: ${this.logFileName}`,
        '='.repeat(80),
        ''
      ].join('\n');

      fs.writeFileSync(this.logFilePath, header, 'utf8');
    } catch (error) {
      // If we can't create the log file, just continue without logging
      this.logFilePath = null;
    }
  }

  /**
   * Write a log entry to the file
   */
  writeLog(level, ...args) {
    if (!this.logFilePath) return;

    try {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg, null, 2);
        }
        return String(arg);
      }).join(' ');

      const logEntry = `[${timestamp}] [${level}] ${message}\n`;

      fs.appendFileSync(this.logFilePath, logEntry, 'utf8');
    } catch (error) {
      // Silently fail if we can't write to log
    }
  }

  /**
   * Start capturing console output
   */
  start() {
    // Intercept console.log
    console.log = (...args) => {
      this.writeLog('INFO', ...args);
      this.originalLog(...args); // Still output to console
    };

    // Intercept console.error
    console.error = (...args) => {
      this.writeLog('ERROR', ...args);
      this.originalError(...args);
    };

    // Intercept console.warn
    console.warn = (...args) => {
      this.writeLog('WARN', ...args);
      this.originalWarn(...args);
    };

    // Intercept console.info
    console.info = (...args) => {
      this.writeLog('INFO', ...args);
      this.originalInfo(...args);
    };
  }

  /**
   * Stop capturing console output and write footer
   */
  stop() {
    // Restore original console methods
    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;
    console.info = this.originalInfo;

    // Write footer
    if (this.logFilePath) {
      try {
        const footer = [
          '',
          '='.repeat(80),
          `Command completed: ${new Date().toISOString()}`,
          `Log saved: ${this.logFilePath}`,
          '='.repeat(80)
        ].join('\n');

        fs.appendFileSync(this.logFilePath, footer, 'utf8');
      } catch (error) {
        // Silently fail
      }
    }
  }

  /**
   * Get the path to the log file
   */
  getLogPath() {
    return this.logFilePath;
  }

  /**
   * Clean up old log files (keep last N logs per command)
   */
  static cleanupOldLogs(projectRoot = process.cwd(), keepCount = 10) {
    const logsDir = path.join(projectRoot, '.avc', 'logs');

    if (!fs.existsSync(logsDir)) return;

    try {
      const files = fs.readdirSync(logsDir);

      // Group files by command name
      const filesByCommand = {};
      files.forEach(file => {
        if (!file.endsWith('.log')) return;

        const commandName = file.split('-')[0];
        if (!filesByCommand[commandName]) {
          filesByCommand[commandName] = [];
        }

        filesByCommand[commandName].push({
          name: file,
          path: path.join(logsDir, file),
          mtime: fs.statSync(path.join(logsDir, file)).mtime
        });
      });

      // For each command, keep only the latest N files
      Object.keys(filesByCommand).forEach(commandName => {
        const files = filesByCommand[commandName];

        // Sort by modification time (newest first)
        files.sort((a, b) => b.mtime - a.mtime);

        // Delete old files
        files.slice(keepCount).forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (error) {
            // Ignore deletion errors
          }
        });
      });
    } catch (error) {
      // Silently fail
    }
  }
}

export { CommandLogger };
