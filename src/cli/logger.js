import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Logger - Writes debug and error logs to file
 *
 * Log location: ~/.avc/logs/avc.log
 * Log rotation: Keeps last 10MB, rotates to avc.log.old
 */
export class Logger {
  constructor(componentName = 'AVC') {
    this.componentName = componentName;
    this.logDir = path.join(os.homedir(), '.avc', 'logs');
    this.logFile = path.join(this.logDir, 'avc.log');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB

    this.ensureLogDir();
  }

  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      // Silently fail if we can't create log directory
      console.error('Failed to create log directory:', error.message);
    }
  }

  rotateLogIfNeeded() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxLogSize) {
          const oldLogFile = this.logFile + '.old';
          if (fs.existsSync(oldLogFile)) {
            fs.unlinkSync(oldLogFile);
          }
          fs.renameSync(this.logFile, oldLogFile);
        }
      }
    } catch (error) {
      // Silently fail rotation
    }
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] [${this.componentName}] ${message}`;

    if (data) {
      if (data instanceof Error) {
        logLine += `\n  Error: ${data.message}`;
        if (data.stack) {
          logLine += `\n  Stack: ${data.stack}`;
        }
      } else if (typeof data === 'object') {
        try {
          logLine += `\n  Data: ${JSON.stringify(data, null, 2)}`;
        } catch (e) {
          logLine += `\n  Data: [Unable to stringify]`;
        }
      } else {
        logLine += `\n  Data: ${data}`;
      }
    }

    return logLine + '\n';
  }

  writeLog(level, message, data = null) {
    try {
      this.rotateLogIfNeeded();
      const logMessage = this.formatMessage(level, message, data);
      fs.appendFileSync(this.logFile, logMessage, 'utf8');
    } catch (error) {
      // Silently fail if we can't write to log
      console.error('Failed to write log:', error.message);
    }
  }

  debug(message, data = null) {
    this.writeLog('DEBUG', message, data);
  }

  info(message, data = null) {
    this.writeLog('INFO', message, data);
  }

  warn(message, data = null) {
    this.writeLog('WARN', message, data);
  }

  error(message, data = null) {
    this.writeLog('ERROR', message, data);
  }

  // Read recent logs (last N lines)
  readRecentLogs(lines = 50) {
    try {
      if (!fs.existsSync(this.logFile)) {
        return 'No logs available yet.';
      }

      const content = fs.readFileSync(this.logFile, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      const recentLines = allLines.slice(-lines);

      return recentLines.join('\n');
    } catch (error) {
      return `Error reading logs: ${error.message}`;
    }
  }

  // Clear all logs
  clearLogs() {
    try {
      if (fs.existsSync(this.logFile)) {
        fs.unlinkSync(this.logFile);
      }
      const oldLogFile = this.logFile + '.old';
      if (fs.existsSync(oldLogFile)) {
        fs.unlinkSync(oldLogFile);
      }
      this.info('Logs cleared');
    } catch (error) {
      console.error('Failed to clear logs:', error.message);
    }
  }
}

// Export singleton instances for common components
export const updateLogger = new Logger('UpdateChecker');
export const installerLogger = new Logger('UpdateInstaller');
export const replLogger = new Logger('REPL');
export const initLogger = new Logger('Init');
