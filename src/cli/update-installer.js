import { spawn, execSync } from 'child_process';
import { UpdateChecker } from './update-checker.js';
import { installerLogger } from './logger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * UpdateInstaller - Handles npm package installation
 * Runs npm install in background
 */
export class UpdateInstaller {
  constructor() {
    this.checker = new UpdateChecker();
    this.packageName = '@agile-vibe-coding/avc-cli';
  }

  // Check if npm is available
  checkNpmAvailable() {
    try {
      execSync('npm --version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      installerLogger.error('npm availability check failed', error);
      return false;
    }
  }

  // Install update in background
  async installUpdate(version) {
    installerLogger.info(`Starting update installation for version ${version}`);
    const state = this.checker.readState();

    // Don't install if already in progress
    if (state.updateStatus === 'downloading') {
      installerLogger.warn('Update already in progress');
      return { success: false, message: 'Update already in progress' };
    }

    // Check if npm is available
    if (!this.checkNpmAvailable()) {
      installerLogger.error('npm not found on system');
      state.updateStatus = 'failed';
      state.errorMessage = 'npm not found. Please install npm to enable auto-updates.';
      this.checker.writeState(state);
      return { success: false, message: state.errorMessage };
    }

    // Update state to downloading
    installerLogger.debug('Setting status to downloading');
    state.updateStatus = 'downloading';
    state.errorMessage = null;
    this.checker.writeState(state);

    return new Promise((resolve) => {
      // Prepare log files for npm output
      const logDir = path.join(os.homedir(), '.avc', 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const npmLogFile = path.join(logDir, 'npm-install.log');
      const npmErrorLogFile = path.join(logDir, 'npm-install-error.log');

      // Use shell redirection for reliable log capture with detached process
      const npmCmd = `npm install -g "${this.packageName}@${version}" >> "${npmLogFile}" 2>> "${npmErrorLogFile}"`;

      installerLogger.info(`Executing: npm install -g ${this.packageName}@${version}`);
      installerLogger.debug(`npm output will be logged to ${npmLogFile}`);

      const npmProcess = spawn(npmCmd, [], {
        detached: true,
        stdio: 'ignore',
        shell: true
      });

      npmProcess.unref(); // Allow parent to exit independently

      npmProcess.on('close', (code) => {
        const state = this.checker.readState();
        installerLogger.debug(`npm install exited with code ${code}`);

        if (code === 0) {
          // Success
          installerLogger.info(`Update installed successfully: ${version}`);
          state.updateStatus = 'ready';
          state.updateReady = true;
          state.downloadedVersion = version;
          state.errorMessage = null;
          this.checker.writeState(state);

          resolve({ success: true, version });
        } else if (code === 243 || code === 1) {
          // Permission error (common code 243 on Unix, 1 on Windows)
          const errorMsg = `Permission denied. Try: sudo npm install -g ${this.packageName}@${version}\nLogs: ${npmLogFile}`;
          installerLogger.error(`Installation failed with permission error (code ${code})`, { error: errorMsg, logFile: npmLogFile });
          state.updateStatus = 'failed';
          state.updateReady = false;
          state.errorMessage = errorMsg;
          this.checker.writeState(state);

          resolve({ success: false, message: state.errorMessage, needsSudo: true });
        } else {
          // Other error
          const errorMsg = `Installation failed with code ${code}. Check logs: ${npmLogFile}`;
          installerLogger.error(errorMsg, { logFile: npmLogFile, errorLogFile: npmErrorLogFile });
          state.updateStatus = 'failed';
          state.updateReady = false;
          state.errorMessage = errorMsg;
          this.checker.writeState(state);

          resolve({ success: false, message: state.errorMessage });
        }
      });

      npmProcess.on('error', (error) => {
        const state = this.checker.readState();
        installerLogger.error('npm process error', error);

        if (error.code === 'EACCES' || error.code === 'EPERM') {
          const errorMsg = `Permission denied. Try: sudo npm install -g ${this.packageName}@${version}\nLogs: ${npmLogFile}`;
          installerLogger.error(`Permission error: ${error.code}`, { error: errorMsg, logFile: npmLogFile });
          state.updateStatus = 'failed';
          state.updateReady = false;
          state.errorMessage = errorMsg;
          this.checker.writeState(state);

          resolve({ success: false, message: state.errorMessage, needsSudo: true });
        } else {
          const errorMsg = `${error.message}. Check logs: ${npmLogFile}`;
          installerLogger.error(`Unexpected npm process error: ${error.message}`, { error, logFile: npmLogFile });
          state.updateStatus = 'failed';
          state.updateReady = false;
          state.errorMessage = errorMsg;
          this.checker.writeState(state);

          resolve({ success: false, message: state.errorMessage });
        }
      });
    });
  }

  // Trigger update installation
  async triggerUpdate() {
    const state = this.checker.readState();

    if (!state.updateAvailable) {
      return { success: false, message: 'No update available' };
    }

    if (state.updateReady) {
      return { success: true, message: 'Update already installed', alreadyReady: true };
    }

    if (state.updateStatus === 'downloading') {
      return { success: false, message: 'Update already in progress', inProgress: true };
    }

    return await this.installUpdate(state.latestVersion);
  }

  // Auto-trigger update if available and not dismissed
  async autoTriggerUpdate() {
    const state = this.checker.readState();
    const settings = this.checker.readSettings();

    // Don't auto-install if disabled or user dismissed
    if (!settings.autoUpdate.enabled || state.userDismissed) {
      return { success: false, message: 'Auto-update disabled or dismissed' };
    }

    // Don't install if already ready or downloading
    if (state.updateReady || state.updateStatus === 'downloading') {
      return { success: false, message: 'Update already processed' };
    }

    // Only auto-install if update available and in idle/pending state
    if (state.updateAvailable && (state.updateStatus === 'idle' || state.updateStatus === 'pending')) {
      return await this.triggerUpdate();
    }

    return { success: false, message: 'No action needed' };
  }
}
