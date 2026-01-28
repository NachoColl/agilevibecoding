# Auto-Update Feature - Implementation Plan

## Overview

Implement automatic package updates that run in the background, check for new versions every hour, install updates silently, and notify users when updates are ready.

## Architecture Options

### Option 1: npm-Based Auto-Update ⭐ **RECOMMENDED**
**Pros**:
- Simple implementation (uses npm registry)
- Reliable (npm handles download, verification, installation)
- Standard approach (many CLI tools use this)
- No custom update server needed

**Cons**:
- Requires npm to be installed
- User must restart CLI to use new version
- May need sudo permissions for global installs

**How it works**:
1. Background process checks npm registry every hour
2. Compares current version with latest available
3. If newer version found, runs `npm install -g @agile-vibe-coding/avc-cli@latest`
4. Shows notification in REPL banner
5. User restarts CLI to use new version

### Option 2: Self-Updater Binary
**Pros**:
- Full control over update process
- Can replace binary without restart (on some OSes)
- Can include custom update logic

**Cons**:
- Complex implementation
- Must handle checksums, signatures, rollback
- Platform-specific code (Windows vs Unix)
- Need update server infrastructure

### Option 3: Daemon Service
**Pros**:
- Most robust (separate process handles updates)
- Can update even when CLI not running
- Better process isolation

**Cons**:
- Most complex (requires daemon management)
- Platform-specific service installation
- Overkill for a CLI tool

---

## Recommended Implementation: Option 1 (npm-Based)

### Component Architecture

```
┌─────────────────────────────────────────────────┐
│                  AVC CLI                        │
│  ┌───────────────────────────────────────────┐  │
│  │         Main REPL Process                 │  │
│  │  - User interface                         │  │
│  │  - Command handling                       │  │
│  │  - Shows update notifications             │  │
│  └───────────────────────────────────────────┘  │
│              ↕ (IPC/File)                       │
│  ┌───────────────────────────────────────────┐  │
│  │      Update Checker (Background)          │  │
│  │  - Spawned on startup                     │  │
│  │  - Checks npm registry every hour         │  │
│  │  - Writes update status to file           │  │
│  └───────────────────────────────────────────┘  │
│              ↓ (When update found)              │
│  ┌───────────────────────────────────────────┐  │
│  │         Update Installer                  │  │
│  │  - Runs npm install in background         │  │
│  │  - Updates status file on completion      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── cli/
│   ├── index.js                  # Main entry point
│   ├── repl-ink.js               # REPL interface (add notification)
│   ├── update-checker.js         # NEW - Background update checker
│   ├── update-installer.js       # NEW - Update installation logic
│   └── update-notifier.js        # NEW - Notification component
├── .avc/                         # NEW - Update state directory
│   ├── update-state.json         # Current update status
│   └── update-lock               # Lock file (prevent concurrent updates)
└── package.json                  # Add update configuration
```

### State File Format

**`.avc/update-state.json`**:
```json
{
  "currentVersion": "1.1.3",
  "latestVersion": "1.2.0",
  "lastChecked": "2026-01-27T10:30:00Z",
  "updateAvailable": true,
  "updateReady": false,
  "downloadedVersion": "1.2.0",
  "updateStatus": "downloading|ready|failed",
  "errorMessage": null,
  "userDismissed": false,
  "dismissedAt": null,
  "checkInterval": 3600000
}
```

---

## Implementation Details

### Phase 1: Version Checking (Background Process)

**File**: `src/cli/update-checker.js`

```javascript
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class UpdateChecker {
  constructor() {
    this.stateDir = path.join(__dirname, '..', '.avc');
    this.stateFile = path.join(this.stateDir, 'update-state.json');
    this.checkInterval = 60 * 60 * 1000; // 1 hour
    this.packageName = '@agile-vibe-coding/avc-cli';
  }

  // Initialize state directory
  initStateDir() {
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
  }

  // Get current version from package.json
  getCurrentVersion() {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  }

  // Check npm registry for latest version
  async getLatestVersion() {
    try {
      const result = execSync(`npm view ${this.packageName} version`, {
        encoding: 'utf8',
        timeout: 10000
      });
      return result.trim();
    } catch (error) {
      console.error('Failed to check for updates:', error.message);
      return null;
    }
  }

  // Compare versions (returns true if remote is newer)
  isNewerVersion(current, latest) {
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
      return {
        currentVersion: this.getCurrentVersion(),
        latestVersion: null,
        lastChecked: null,
        updateAvailable: false,
        updateReady: false,
        downloadedVersion: null,
        updateStatus: 'idle',
        errorMessage: null,
        userDismissed: false,
        dismissedAt: null,
        checkInterval: this.checkInterval
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
    const currentVersion = this.getCurrentVersion();
    const latestVersion = await this.getLatestVersion();

    if (!latestVersion) {
      return { updateAvailable: false, error: 'Failed to check for updates' };
    }

    const updateAvailable = this.isNewerVersion(currentVersion, latestVersion);

    const state = this.readState();
    state.currentVersion = currentVersion;
    state.latestVersion = latestVersion;
    state.lastChecked = new Date().toISOString();
    state.updateAvailable = updateAvailable;

    // Reset dismissed flag if new version available
    if (updateAvailable && state.downloadedVersion !== latestVersion) {
      state.userDismissed = false;
      state.updateReady = false;
    }

    this.writeState(state);

    return { updateAvailable, currentVersion, latestVersion };
  }

  // Start background checker
  startBackgroundChecker() {
    // Check immediately on start
    this.checkForUpdates().then(result => {
      if (result.updateAvailable) {
        console.log(`Update available: ${result.latestVersion}`);
      }
    });

    // Check every hour
    setInterval(() => {
      this.checkForUpdates();
    }, this.checkInterval);
  }
}
```

### Phase 2: Update Installation

**File**: `src/cli/update-installer.js`

```javascript
import { spawn } from 'child_process';
import { UpdateChecker } from './update-checker.js';

export class UpdateInstaller {
  constructor() {
    this.checker = new UpdateChecker();
    this.packageName = '@agile-vibe-coding/avc-cli';
  }

  // Install update in background
  async installUpdate(version) {
    const state = this.checker.readState();

    // Don't install if already in progress
    if (state.updateStatus === 'downloading') {
      return { success: false, message: 'Update already in progress' };
    }

    // Update state to downloading
    state.updateStatus = 'downloading';
    state.errorMessage = null;
    this.checker.writeState(state);

    return new Promise((resolve) => {
      // Spawn npm install as detached background process
      const npmProcess = spawn('npm', ['install', '-g', `${this.packageName}@${version}`], {
        detached: true,
        stdio: 'ignore',
        shell: true
      });

      npmProcess.unref(); // Allow parent to exit independently

      npmProcess.on('close', (code) => {
        const state = this.checker.readState();

        if (code === 0) {
          state.updateStatus = 'ready';
          state.updateReady = true;
          state.downloadedVersion = version;
          state.errorMessage = null;
          this.checker.writeState(state);

          resolve({ success: true, version });
        } else {
          state.updateStatus = 'failed';
          state.updateReady = false;
          state.errorMessage = `Installation failed with code ${code}`;
          this.checker.writeState(state);

          resolve({ success: false, message: state.errorMessage });
        }
      });

      npmProcess.on('error', (error) => {
        const state = this.checker.readState();
        state.updateStatus = 'failed';
        state.updateReady = false;
        state.errorMessage = error.message;
        this.checker.writeState(state);

        resolve({ success: false, message: error.message });
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
      return { success: true, message: 'Update already installed' };
    }

    return await this.installUpdate(state.latestVersion);
  }
}
```

### Phase 3: Update Notification Component

**File**: `src/cli/update-notifier.js`

```javascript
import React from 'react';
import { Box, Text } from 'ink';
import { UpdateChecker } from './update-checker.js';

// Update notification banner
export const UpdateNotification = ({ onDismiss, onRestart }) => {
  const checker = new UpdateChecker();
  const state = checker.readState();

  // Don't show if no update available
  if (!state.updateAvailable) return null;

  // Don't show if user dismissed
  if (state.userDismissed) return null;

  // Update available but not yet downloaded
  if (!state.updateReady && state.updateStatus !== 'downloading') {
    return React.createElement(Box, {
      borderStyle: 'round',
      borderColor: 'yellow',
      padding: 1,
      marginBottom: 1
    },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'yellow' },
          `📦 Update available: v${state.latestVersion}`
        ),
        React.createElement(Text, null,
          'Installing in background...'
        ),
        React.createElement(Text, { dimColor: true, italic: true },
          'You will be notified when ready'
        )
      )
    );
  }

  // Update downloading
  if (state.updateStatus === 'downloading') {
    return React.createElement(Box, {
      borderStyle: 'round',
      borderColor: 'blue',
      padding: 1,
      marginBottom: 1
    },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'blue' },
          `⬇️  Downloading update v${state.latestVersion}...`
        ),
        React.createElement(Text, { dimColor: true },
          'This happens in the background. Continue working!'
        )
      )
    );
  }

  // Update ready to use
  if (state.updateReady) {
    return React.createElement(Box, {
      borderStyle: 'round',
      borderColor: 'green',
      padding: 1,
      marginBottom: 1
    },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'green' },
          `✅ Update v${state.downloadedVersion} ready!`
        ),
        React.createElement(Text, null,
          'Restart to use the new version'
        ),
        React.createElement(Box, { marginTop: 1 },
          React.createElement(Text, { dimColor: true },
            'Type '
          ),
          React.createElement(Text, { color: 'cyan', bold: true },
            '/restart'
          ),
          React.createElement(Text, { dimColor: true },
            ' or press '
          ),
          React.createElement(Text, { color: 'cyan', bold: true },
            'Ctrl+R'
          ),
          React.createElement(Text, { dimColor: true },
            ' to restart'
          )
        ),
        React.createElement(Text, { dimColor: true, italic: true, marginTop: 1 },
          'Or dismiss to continue with current version'
        )
      )
    );
  }

  // Update failed
  if (state.updateStatus === 'failed') {
    return React.createElement(Box, {
      borderStyle: 'round',
      borderColor: 'red',
      padding: 1,
      marginBottom: 1
    },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'red' },
          '❌ Update failed'
        ),
        React.createElement(Text, null,
          state.errorMessage || 'Unknown error'
        ),
        React.createElement(Text, { dimColor: true, marginTop: 1 },
          'Will retry on next check (1 hour)'
        )
      )
    );
  }

  return null;
};

// Update status indicator (compact, for banner)
export const UpdateStatusBadge = () => {
  const checker = new UpdateChecker();
  const state = checker.readState();

  if (!state.updateAvailable || state.userDismissed) return null;

  if (state.updateReady) {
    return React.createElement(Text, { color: 'green', bold: true },
      ' [Update Ready!]'
    );
  }

  if (state.updateStatus === 'downloading') {
    return React.createElement(Text, { color: 'blue', bold: true },
      ' [Updating...]'
    );
  }

  return null;
};
```

### Phase 4: Integration with REPL

**Modify**: `src/cli/repl-ink.js`

Add to imports:
```javascript
import { UpdateNotification, UpdateStatusBadge } from './update-notifier.js';
import { UpdateChecker } from './update-checker.js';
import { UpdateInstaller } from './update-installer.js';
```

Add to App component state:
```javascript
const [showUpdateNotification, setShowUpdateNotification] = useState(true);
```

Add to App component initialization (after exit hook):
```javascript
// Start update checker on mount
useEffect(() => {
  const checker = new UpdateChecker();
  checker.startBackgroundChecker();

  // Check if update ready
  const state = checker.readState();
  if (state.updateReady && !state.userDismissed) {
    setShowUpdateNotification(true);
  }

  return () => {
    // Cleanup if needed
  };
}, []);
```

Add restart command handler:
```javascript
case '/restart':
  setOutput('\n🔄 Restarting AVC...\n');
  setTimeout(() => {
    // Exit and let shell/terminal restart
    exit();
  }, 500);
  return;
```

Add keyboard shortcut for restart (Ctrl+R):
```javascript
// In useInput handler for prompt mode
if (key.ctrl && inputChar === 'r') {
  const checker = new UpdateChecker();
  const state = checker.readState();
  if (state.updateReady) {
    setOutput('\n🔄 Restarting AVC...\n');
    setTimeout(() => exit(), 500);
  }
  return;
}
```

Add to render function:
```javascript
return React.createElement(Box, { flexDirection: 'column' },
  React.createElement(Banner),
  showUpdateNotification && React.createElement(UpdateNotification, {
    onDismiss: () => {
      const checker = new UpdateChecker();
      const state = checker.readState();
      state.userDismissed = true;
      state.dismissedAt = new Date().toISOString();
      checker.writeState(state);
      setShowUpdateNotification(false);
    },
    onRestart: () => {
      exit();
    }
  }),
  renderOutput(),
  renderSelector(),
  renderPrompt()
);
```

Update Banner to show update badge:
```javascript
React.createElement(Text, { bold: true }, 'AGILE VIBE CODING'),
React.createElement(UpdateStatusBadge), // NEW
```

---

## User Experience Flow

### Scenario 1: Update Available (First Time)

```
User starts CLI:
┌─────────────────────────────────────────────────┐
│ AGILE VIBE CODING [Updating...]                │
│ ═════════════════                               │
│ Version: 1.1.3                                  │
│                                                 │
│ ⚠️  UNDER DEVELOPMENT - DO NOT USE  ⚠️          │
│                                                 │
│ Framework for AI-powered Agile development     │
│                                                 │
│ Type / to see commands                          │
│                                                 │
│ ╭─────────────────────────────────────────────╮ │
│ │ ⬇️  Downloading update v1.2.0...            │ │
│ │ This happens in the background.             │ │
│ │ Continue working!                           │ │
│ ╰─────────────────────────────────────────────╯ │
└─────────────────────────────────────────────────┘

User continues working normally...
```

### Scenario 2: Update Ready

```
After download completes:
┌─────────────────────────────────────────────────┐
│ AGILE VIBE CODING [Update Ready!]              │
│ ═════════════════                               │
│                                                 │
│ ╭─────────────────────────────────────────────╮ │
│ │ ✅ Update v1.2.0 ready!                     │ │
│ │ Restart to use the new version              │ │
│ │                                             │ │
│ │ Type /restart or press Ctrl+R to restart   │ │
│ │                                             │ │
│ │ Or dismiss to continue with current version │ │
│ ╰─────────────────────────────────────────────╯ │
└─────────────────────────────────────────────────┘

> █
```

### Scenario 3: User Restarts

```
User types: /restart
> /restart

─────────────────────────────────────────────────────
🔄 Restarting AVC...
─────────────────────────────────────────────────────

[CLI exits and shell restarts it]

┌─────────────────────────────────────────────────┐
│ AGILE VIBE CODING                               │
│ ═════════════════                               │
│ Version: 1.2.0 ← NEW VERSION!                   │
│                                                 │
│ Framework for AI-powered Agile development     │
│                                                 │
│ Type / to see commands                          │
└─────────────────────────────────────────────────┘
```

---

## Activation Strategy

### Does User Need to Restart? **YES**

**Why restart is needed:**
1. **npm global install** replaces the package files on disk
2. Current Node.js process is running from old files
3. New version is already installed, but not loaded
4. Next invocation (`avc` command) will use new version

### Restart Options:

#### Option A: Manual Restart (Simple) ⭐ **RECOMMENDED**
**Implementation**:
- Show notification with restart prompt
- User types `/restart` or presses `Ctrl+R`
- CLI exits gracefully
- Shell/terminal automatically restarts CLI (if user re-runs)

**Pros**:
- Simple implementation
- User has control
- No complex process management

**Cons**:
- Requires user action
- User must re-run `avc` command

#### Option B: Auto-Restart (Advanced)
**Implementation**:
- After update completes, show countdown
- After countdown (e.g., 10 seconds), auto-exit
- Use `process.exit()` or `exec()` to restart

**Pros**:
- Seamless experience
- User doesn't need to do anything

**Cons**:
- May interrupt user's work
- More complex (need to exec new process)

#### Option C: Hot Reload (Complex, Not Recommended)
**Implementation**:
- Clear require cache
- Re-import updated modules
- Reload components

**Pros**:
- No restart needed

**Cons**:
- Very complex
- May cause issues with state
- Not reliable for all code changes
- Not recommended for complete package updates

### Recommended: Option A + Auto-Notification

**Best approach**:
1. Download and install update in background (silent)
2. Show notification when ready
3. User chooses when to restart via:
   - `/restart` command
   - `Ctrl+R` keyboard shortcut
   - Natural exit (will use new version next time)
4. If user dismisses, notification persists until next session

---

## Configuration

**Add to `package.json`**:

```json
{
  "avc": {
    "autoUpdate": {
      "enabled": true,
      "checkInterval": 3600000,
      "silent": true,
      "notifyUser": true
    }
  }
}
```

**User can disable via config**:
```bash
# Future: avc config set autoUpdate.enabled false
```

---

## Security Considerations

### 1. Verify Updates
- Use npm registry (already verified by npm)
- Check package signature (npm does this)
- Validate version format

### 2. Permissions
- Global install may need sudo
- Handle permission errors gracefully
- Fallback to manual update instructions

### 3. Rollback
- Keep previous version info in state
- If new version fails, show rollback instructions
- User can manually install previous version

### 4. Network
- Handle offline scenarios
- Timeout requests (10 seconds)
- Don't block CLI if network fails

---

## Error Handling

### Scenario 1: npm Not Found
```
❌ Auto-update failed: npm not found
   Please install updates manually:
   npm install -g @agile-vibe-coding/avc-cli@latest
```

### Scenario 2: Permission Denied
```
❌ Auto-update failed: Permission denied
   Please run with sudo or install manually:
   sudo npm install -g @agile-vibe-coding/avc-cli@latest
```

### Scenario 3: Network Error
```
❌ Failed to check for updates: Network error
   Will retry in 1 hour
```

### Scenario 4: Download Interrupted
```
❌ Update download interrupted
   Will retry on next check
```

---

## Testing Strategy

### Unit Tests
1. Version comparison logic
2. State file read/write
3. npm version check
4. Update status tracking

### Integration Tests
1. Full update cycle (mock npm)
2. Background checker timing
3. Notification display
4. Restart functionality

### Manual Tests
1. Install old version
2. Publish new version to npm
3. Wait for auto-update
4. Verify notification
5. Restart and verify new version

---

## Rollout Plan

### Phase 1: Basic Update Checker (Week 1)
- Implement UpdateChecker
- Check npm registry
- Write state file
- No auto-install yet

### Phase 2: Background Installation (Week 2)
- Implement UpdateInstaller
- Silent background install
- Update state on completion

### Phase 3: User Notifications (Week 3)
- Implement UpdateNotification component
- Integrate with REPL
- Add restart command

### Phase 4: Polish & Testing (Week 4)
- Error handling
- Configuration options
- User documentation
- Testing across platforms

---

## Alternative Approaches

### Approach 1: Update on Exit
Instead of background updates:
- Check for updates on CLI exit
- Install on next startup
- Simpler, but slower

### Approach 2: Prompt User
Ask user before downloading:
- "Update available. Download now? [Y/n]"
- More control, but interrupts workflow

### Approach 3: Scheduled Task
Use system scheduler (cron/Task Scheduler):
- Separate from CLI
- More reliable
- More complex setup

---

## Implementation Timeline

**Estimated time**: 2-3 days

- **Day 1**: UpdateChecker + UpdateInstaller (6 hours)
- **Day 2**: UpdateNotification + REPL integration (6 hours)
- **Day 3**: Testing + error handling + documentation (4 hours)

**Total**: ~16 hours of development

---

## Questions to Resolve

1. **Where will package be published?**
   - npm registry (public or private?)
   - GitHub releases?
   - Custom server?

2. **Update frequency?**
   - Every hour (as specified)?
   - Configurable by user?
   - Randomize to avoid thundering herd?

3. **Permission handling?**
   - Require sudo?
   - Fallback to user directory install?
   - Show manual instructions?

4. **Restart behavior?**
   - Manual restart only?
   - Auto-restart after countdown?
   - Force restart?

5. **Versioning strategy?**
   - Semantic versioning?
   - Breaking changes notification?
   - Allow rollback?

---

## Recommendation

**Start with**:
- Option 1 (npm-based auto-update)
- Manual restart (Option A)
- Silent background installation
- Clear notification when ready

**This provides**:
- ✅ Simple implementation
- ✅ Reliable updates via npm
- ✅ Non-intrusive UX
- ✅ User control over restart timing
- ✅ Easy to test and maintain

**Next iteration can add**:
- Configuration options
- Auto-restart with countdown
- Rollback capability
- Update channels (stable/beta)

---

**Status**: 📋 Plan Complete - Ready for Implementation
**Complexity**: Medium (2-3 days)
**User Impact**: Low (background operation)
**Risk Level**: Low (uses npm, user controls restart)
