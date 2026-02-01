import { spawn } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Background Process Manager
 * Manages lifecycle of long-running background processes
 */
export class BackgroundProcessManager extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map(); // id -> processMetadata
    this.maxOutputLines = 500; // Keep last 500 lines per process
  }

  /**
   * Start a background process
   * @param {Object} options
   * @param {string} options.name - Human-readable name
   * @param {string} options.command - Command to execute
   * @param {string[]} options.args - Command arguments
   * @param {string} options.cwd - Working directory
   * @param {Object} options.env - Environment variables
   * @returns {string} Process ID
   */
  startProcess({ name, command, args = [], cwd, env = process.env }) {
    const id = `${this.sanitizeName(name)}-${Date.now()}`;

    const childProcess = spawn(command, args, {
      cwd,
      env,
      stdio: 'pipe',
      detached: false
    });

    const metadata = {
      id,
      name,
      command: `${command} ${args.join(' ')}`,
      cwd,
      pid: childProcess.pid,
      status: 'running',
      startTime: new Date().toISOString(),
      exitCode: null,
      exitSignal: null,
      output: [],
      process: childProcess
    };

    this.processes.set(id, metadata);

    // Capture stdout
    childProcess.stdout.on('data', (data) => {
      this.appendOutput(id, 'stdout', data.toString());
    });

    // Capture stderr
    childProcess.stderr.on('data', (data) => {
      this.appendOutput(id, 'stderr', data.toString());
    });

    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      this.handleProcessExit(id, code, signal);
    });

    // Handle process error
    childProcess.on('error', (error) => {
      this.handleProcessError(id, error);
    });

    this.emit('process-started', { id, name });

    return id;
  }

  /**
   * Stop a running process
   */
  stopProcess(id) {
    const metadata = this.processes.get(id);
    if (!metadata) return false;

    if (metadata.status === 'running' && metadata.process) {
      metadata.process.kill('SIGTERM');
      metadata.status = 'stopped';
      this.emit('process-stopped', { id, name: metadata.name });
      return true;
    }

    return false;
  }

  /**
   * Find process by PID
   * @param {number} pid - Process ID to search for
   * @returns {Object|null} Process metadata or null if not found
   */
  findProcessByPid(pid) {
    for (const metadata of this.processes.values()) {
      if (metadata.pid === pid) {
        return metadata;
      }
    }
    return null;
  }

  /**
   * Remove process from manager by PID
   * Used when external kill is performed on a managed process
   * @param {number} pid - Process ID to remove
   * @returns {boolean} True if process was found and removed
   */
  removeProcessByPid(pid) {
    const process = this.findProcessByPid(pid);
    if (process) {
      this.processes.delete(process.id);
      this.emit('process-removed', { id: process.id, name: process.name, pid });
      return true;
    }
    return false;
  }

  /**
   * Get process metadata
   */
  getProcess(id) {
    return this.processes.get(id);
  }

  /**
   * Get all processes
   */
  getAllProcesses() {
    return Array.from(this.processes.values());
  }

  /**
   * Get running processes only
   */
  getRunningProcesses() {
    return this.getAllProcesses().filter(p => p.status === 'running');
  }

  /**
   * Append output to process buffer
   */
  appendOutput(id, type, text) {
    const metadata = this.processes.get(id);
    if (!metadata) return;

    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      metadata.output.push({
        timestamp: new Date().toISOString(),
        type,
        text: line
      });
    }

    // Trim to max lines
    if (metadata.output.length > this.maxOutputLines) {
      metadata.output = metadata.output.slice(-this.maxOutputLines);
    }

    this.emit('output', { id, type, text });
  }

  /**
   * Handle process exit
   */
  handleProcessExit(id, code, signal) {
    const metadata = this.processes.get(id);
    if (!metadata) return;

    metadata.exitCode = code;
    metadata.exitSignal = signal;
    metadata.status = code === 0 ? 'exited' : 'crashed';

    this.emit('process-exited', {
      id,
      name: metadata.name,
      code,
      signal,
      status: metadata.status
    });
  }

  /**
   * Handle process error
   */
  handleProcessError(id, error) {
    const metadata = this.processes.get(id);
    if (!metadata) return;

    metadata.status = 'crashed';
    this.appendOutput(id, 'stderr', `Process error: ${error.message}`);

    this.emit('process-error', { id, name: metadata.name, error });
  }

  /**
   * Clean up finished processes
   * Removes processes with status: exited, crashed, or stopped
   */
  cleanupFinished() {
    const finished = this.getAllProcesses().filter(
      p => p.status === 'exited' || p.status === 'crashed' || p.status === 'stopped'
    );

    for (const process of finished) {
      this.processes.delete(process.id);
    }

    return finished.length;
  }

  /**
   * Stop all running processes
   */
  stopAll() {
    const running = this.getRunningProcesses();

    for (const process of running) {
      this.stopProcess(process.id);
    }

    return running.length;
  }

  /**
   * Get process uptime in seconds
   */
  getUptime(id) {
    const metadata = this.processes.get(id);
    if (!metadata) return 0;

    const start = new Date(metadata.startTime);
    const now = new Date();
    return Math.floor((now - start) / 1000);
  }

  /**
   * Format uptime as human-readable string
   */
  formatUptime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Sanitize name for use as ID prefix
   */
  sanitizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
}
