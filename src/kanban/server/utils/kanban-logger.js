/**
 * KanbanLogger
 * Per-operation debug logger for the kanban server.
 * Each significant operation (mission generation, ceremony run, etc.)
 * creates a timestamped log file under .avc/logs/.
 *
 * Log files: kanban-<operation>-YYYY-MM-DD-HH-MM-SS.log
 * Auto-cleanup: keeps last 10 logs per operation prefix.
 */

import fs from 'fs';
import path from 'path';

export class KanbanLogger {
  /**
   * @param {string} operationName - e.g. 'mission', 'ceremony-run', 'analyze-db'
   * @param {string} projectRoot   - absolute path to the project root
   */
  constructor(operationName, projectRoot) {
    this.operationName = operationName;
    this.projectRoot = projectRoot;
    this.logsDir = path.join(projectRoot, '.avc', 'logs');
    this.logFile = null;
    this.startTime = Date.now();

    const now = new Date();
    const ts = now.toISOString()
      .replace('T', '-')
      .replace(/:/g, '-')
      .replace(/\..+/, '');

    const fileName = `kanban-${operationName}-${ts}.log`;
    this.logFile = path.join(this.logsDir, fileName);

    try {
      fs.mkdirSync(this.logsDir, { recursive: true });
      const header = [
        '='.repeat(80),
        `Kanban Server Log: ${operationName}`,
        `Started : ${now.toISOString()}`,
        `Project : ${projectRoot}`,
        `Log file: ${fileName}`,
        '='.repeat(80),
        '',
      ].join('\n');
      fs.writeFileSync(this.logFile, header, 'utf8');
    } catch {
      this.logFile = null;
    }
  }

  // ── Core write ──────────────────────────────────────────────────────────────

  _write(level, message, data) {
    if (!this.logFile) return;
    const ts = new Date().toISOString();
    const elapsed = `+${Date.now() - this.startTime}ms`;
    let line = `[${ts}] [${elapsed}] [${level}] ${message}`;
    if (data !== undefined && data !== null) {
      try {
        line += '\n' + JSON.stringify(data, (_k, v) =>
          typeof v === 'function' ? '[Function]' : v, 2);
      } catch {
        line += '\n[unserializable]';
      }
    }
    line += '\n';
    try {
      fs.appendFileSync(this.logFile, line, 'utf8');
    } catch (err) {
      process.stderr.write(`[KanbanLogger] write failed: ${err.message}\n`);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  debug(message, data) { this._write('DEBUG', message, data); }
  info(message, data)  { this._write('INFO',  message, data); }
  warn(message, data)  { this._write('WARN',  message, data); }
  error(message, data) { this._write('ERROR', message, data); }

  /** Call at the end of an operation to write the footer and trigger cleanup. */
  finish(success = true, summary = null) {
    const elapsed = Date.now() - this.startTime;
    const status = success ? 'COMPLETED' : 'FAILED';
    const footer = [
      '',
      '='.repeat(80),
      `Operation ${status}: ${this.operationName}`,
      `Elapsed  : ${elapsed}ms`,
      summary ? `Summary  : ${summary}` : null,
      `Finished : ${new Date().toISOString()}`,
      '='.repeat(80),
    ].filter(Boolean).join('\n');

    try {
      if (this.logFile) fs.appendFileSync(this.logFile, footer + '\n', 'utf8');
    } catch {}

    KanbanLogger.cleanup(this.logsDir, `kanban-${this.operationName}`);
  }

  /** Returns the absolute path to the log file (useful for debugging the logger itself). */
  getLogPath() {
    return this.logFile;
  }

  // ── Static helpers ──────────────────────────────────────────────────────────

  /**
   * Remove old logs keeping only the last `keepCount` per prefix.
   * @param {string} logsDir
   * @param {string} prefix   - e.g. 'kanban-mission'
   * @param {number} keepCount
   */
  static cleanup(logsDir, prefix, keepCount = 10) {
    try {
      const files = fs.readdirSync(logsDir)
        .filter(f => f.startsWith(prefix) && f.endsWith('.log'))
        .map(f => ({
          name: f,
          fullPath: path.join(logsDir, f),
          mtime: fs.statSync(path.join(logsDir, f)).mtime,
        }))
        .sort((a, b) => b.mtime - a.mtime);   // newest first

      files.slice(keepCount).forEach(f => {
        try { fs.unlinkSync(f.fullPath); } catch {}
      });
    } catch {}
  }
}
