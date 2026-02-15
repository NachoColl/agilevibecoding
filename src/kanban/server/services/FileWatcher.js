import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';

/**
 * FileWatcher
 * Watches .avc/project/ for changes to work.json files
 * Emits events when files are added, changed, or deleted
 */
export class FileWatcher extends EventEmitter {
  /**
   * @param {string} projectRoot - Absolute path to project root directory
   */
  constructor(projectRoot) {
    super();
    this.projectRoot = projectRoot;
    this.avcProjectPath = path.join(projectRoot, '.avc', 'project');
    this.watcher = null;
  }

  /**
   * Start watching for file changes
   */
  start() {
    if (this.watcher) {
      console.warn('FileWatcher already started');
      return;
    }

    // Watch all work.json files in .avc/project/
    const watchPattern = path.join(this.avcProjectPath, '**/work.json');

    this.watcher = chokidar.watch(watchPattern, {
      persistent: true,
      ignoreInitial: true, // Don't emit events for initial scan
      awaitWriteFinish: {
        // Wait for file writes to complete before emitting event
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    // File added
    this.watcher.on('add', (filePath) => {
      this.emit('added', filePath);
    });

    // File changed
    this.watcher.on('change', (filePath) => {
      this.emit('changed', filePath);
    });

    // File deleted
    this.watcher.on('unlink', (filePath) => {
      this.emit('deleted', filePath);
    });

    // Error
    this.watcher.on('error', (error) => {
      this.emit('error', error);
    });

    // Ready (initial scan complete)
    this.watcher.on('ready', () => {
      this.emit('ready');
    });
  }

  /**
   * Stop watching for file changes
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Check if watcher is active
   * @returns {boolean}
   */
  isWatching() {
    return this.watcher !== null;
  }
}
