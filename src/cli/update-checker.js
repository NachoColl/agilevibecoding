import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { updateLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * UpdateChecker - Checks npm registry for new versions
 * Runs in background and updates state file
 */
export class UpdateChecker {
  constructor() {
    // Use user's home directory for state (works across installations)
    this.stateDir = path.join(os.homedir(), '.avc');
    this.stateFile = path.join(this.stateDir, 'update-state.json');
    this.settingsFile = path.join(this.stateDir, 'settings.json');
    this.packageName = '@agile-vibe-coding/avc';
    this.defaultCheckInterval = 60 * 60 * 1000; // 1 hour default
  }

  // Initialize state directory
  initStateDir() {
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
  }

  // Read settings
  readSettings() {
    if (!existsSync(this.settingsFile)) {
      return {
        autoUpdate: {
          enabled: true,
          checkInterval: this.defaultCheckInterval,
          silent: true,
          notifyUser: true
        }
      };
    }

    try {
      return JSON.parse(readFileSync(this.settingsFile, 'utf8'));
    } catch (error) {
      return {
        autoUpdate: {
          enabled: true,
          checkInterval: this.defaultCheckInterval,
          silent: true,
          notifyUser: true
        }
      };
    }
  }

  // Write settings
  writeSettings(settings) {
    this.initStateDir();
    writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
  }

  // Get current version from package.json
  getCurrentVersion() {
    try {
      const packageJsonPath = path.join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      updateLogger.debug(`Current version: ${packageJson.version}`);
      return packageJson.version;
    } catch (error) {
      updateLogger.error('Failed to read current version', error);
      // Don't use console.error - it interferes with React Ink rendering during startup
      return null;
    }
  }

  // Check npm registry for latest version
  async getLatestVersion() {
    try {
      updateLogger.debug('Checking npm registry for latest version');
      const result = execSync(`npm view ${this.packageName} version`, {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      });
      const version = result.trim();
      updateLogger.debug(`Latest version on npm: ${version}`);
      return version;
    } catch (error) {
      updateLogger.error('Failed to check npm registry', error);
      // Silently fail - will retry on next check
      return null;
    }
  }

  // Compare versions (returns true if remote is newer)
  isNewerVersion(current, latest) {
    if (!current || !latest) return false;

    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (latestParts[i] > currentParts[i]) return true;
      if (latestParts[i] < currentParts[i]) return false;
    }
    return false;
  }

  // Read current state
  readState() {
    if (!existsSync(this.stateFile)) {
      const currentVersion = this.getCurrentVersion();
      return {
        currentVersion: currentVersion,
        latestVersion: null,
        lastChecked: null,
        updateAvailable: false,
        updateReady: false,
        downloadedVersion: null,
        updateStatus: 'idle',
        errorMessage: null,
        userDismissed: false,
        dismissedAt: null
      };
    }

    try {
      return JSON.parse(readFileSync(this.stateFile, 'utf8'));
    } catch (error) {
      return this.readState(); // Return default if parse fails
    }
  }

  // Write state
  writeState(state) {
    this.initStateDir();
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  // Check for updates
  async checkForUpdates() {
    updateLogger.info('Checking for updates');
    const settings = this.readSettings();

    // Don't check if auto-update disabled
    if (!settings.autoUpdate.enabled) {
      updateLogger.info('Auto-update disabled in settings');
      return { updateAvailable: false, disabled: true };
    }

    const currentVersion = this.getCurrentVersion();
    const latestVersion = await this.getLatestVersion();

    if (!currentVersion) {
      updateLogger.error('Failed to read current version');
      return { updateAvailable: false, error: 'Failed to read current version' };
    }

    if (!latestVersion) {
      updateLogger.error('Failed to check for updates from npm');
      return { updateAvailable: false, error: 'Failed to check for updates' };
    }

    const updateAvailable = this.isNewerVersion(currentVersion, latestVersion);

    updateLogger.info(`Version check: current=${currentVersion}, latest=${latestVersion}, updateAvailable=${updateAvailable}`);

    const state = this.readState();
    state.currentVersion = currentVersion;
    state.latestVersion = latestVersion;
    state.lastChecked = new Date().toISOString();
    state.updateAvailable = updateAvailable;

    // Reset dismissed flag if new version available
    if (updateAvailable && state.downloadedVersion !== latestVersion) {
      updateLogger.info(`New version available: ${latestVersion}`);
      state.userDismissed = false;
      state.updateReady = false;
      state.updateStatus = 'pending';
    }

    this.writeState(state);

    return { updateAvailable, currentVersion, latestVersion };
  }

  // Start background checker
  startBackgroundChecker() {
    const settings = this.readSettings();

    // Don't start if disabled
    if (!settings.autoUpdate.enabled) {
      return;
    }

    // Check immediately on start (async, don't block)
    this.checkForUpdates().catch(() => {
      // Silently fail
    });

    // Check at configured interval
    const interval = settings.autoUpdate.checkInterval || this.defaultCheckInterval;
    setInterval(() => {
      this.checkForUpdates().catch(() => {
        // Silently fail
      });
    }, interval);
  }

  // Get check interval from settings
  getCheckInterval() {
    const settings = this.readSettings();
    return settings.autoUpdate.checkInterval || this.defaultCheckInterval;
  }
}
