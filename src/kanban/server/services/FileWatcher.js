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
    this.avcPath = path.join(projectRoot, '.avc');
    this.avcProjectPath = path.join(projectRoot, '.avc', 'project');
    this.watcher = null;
    this.dirWatcher = null;
    this.avcDirWatcher = null;
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
      usePolling: true,    // Required for WSL2 /mnt/ paths (no inotify on Windows mounts)
      interval: 2000,      // Poll every 2 seconds
      awaitWriteFinish: {
        // Wait for file writes to complete before emitting event
        stabilityThreshold: 500,
        pollInterval: 100,
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

    // Directory deleted inside .avc/project/
    this.watcher.on('unlinkDir', (dirPath) => {
      this.emit('deleted', dirPath);
    });

    // Error
    this.watcher.on('error', (error) => {
      this.emit('error', error);
    });

    // Ready (initial scan complete)
    this.watcher.on('ready', () => {
      this.emit('ready');
    });

    // Secondary watcher: explicitly watch the .avc/project directory itself.
    // On WSL2, polling a file-glob may not reliably emit unlinkDir when the
    // entire .avc/ tree is deleted (e.g. by /remove). Watching the directory
    // path directly guarantees detection on the next 2-second poll cycle.
    this.dirWatcher = chokidar.watch(this.avcProjectPath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 2000,
      depth: 0, // Only care about the directory itself, not its contents
    });

    this.dirWatcher.on('unlinkDir', () => {
      this.emit('deleted', this.avcProjectPath);
    });

    this.dirWatcher.on('error', (error) => {
      this.emit('error', error);
    });

    // Tertiary watcher: watch .avc/ itself so that when /remove deletes the
    // entire .avc/ tree, we reliably detect it on the next poll cycle.
    // On WSL2, chokidar polling may not fire unlinkDir for .avc/project/ when
    // its parent is deleted — watching the parent directly fixes this.
    this.avcDirWatcher = chokidar.watch(this.avcPath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 2000,
      depth: 0,
    });

    this.avcDirWatcher.on('unlinkDir', () => {
      this.emit('deleted', this.avcProjectPath);
    });

    this.avcDirWatcher.on('error', (error) => {
      this.emit('error', error);
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
    if (this.dirWatcher) {
      await this.dirWatcher.close();
      this.dirWatcher = null;
    }
    if (this.avcDirWatcher) {
      await this.avcDirWatcher.close();
      this.avcDirWatcher = null;
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
