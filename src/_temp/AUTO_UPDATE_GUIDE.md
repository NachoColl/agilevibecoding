# Auto-Update Feature - User Guide

## Overview

AVC CLI now includes **automatic updates** that run in the background, checking for new versions every hour and installing them silently without interrupting your work.

## How It Works

### 1. Background Checking (Every Hour)
- Checks npm registry for new versions
- Compares with your current version
- Runs silently in the background

### 2. Silent Installation
- When update found, installs automatically via `npm install -g`
- Happens in the background while you work
- No interruption to your workflow

### 3. User Notification
- Shows notification banner when update is ready
- Provides clear restart instructions
- You choose when to restart

### 4. Manual Restart Required
- Type `/restart` or press `Ctrl+R` to activate new version
- Or exit normally and restart CLI
- New version loads automatically on next start

## Visual Experience

### When Update is Downloading
```
┌─────────────────────────────────────────────────┐
│ AGILE VIBE CODING [Updating...]                │
│ ═════════════════                               │
│                                                 │
│ ╭─────────────────────────────────────────────╮ │
│ │ ⬇️  Downloading update v1.2.0...            │ │
│ │ This happens in the background.             │ │
│ │ Continue working!                           │ │
│ ╰─────────────────────────────────────────────╯ │
└─────────────────────────────────────────────────┘
```

### When Update is Ready
```
┌─────────────────────────────────────────────────┐
│ AGILE VIBE CODING [Update Ready!]              │
│ ═════════════════                               │
│                                                 │
│ ╭─────────────────────────────────────────────╮ │
│ │ ✅ Update v1.2.0 ready!                     │ │
│ │ Restart to use the new version              │ │
│ │                                             │ │
│ │ Type /restart or press Ctrl+R              │ │
│ │ Press Esc to dismiss                        │ │
│ ╰─────────────────────────────────────────────╯ │
└─────────────────────────────────────────────────┘
```

### After Restart
```
┌─────────────────────────────────────────────────┐
│ AGILE VIBE CODING                               │
│ ═════════════════                               │
│ Version: 1.2.0 ← NEW VERSION!                   │
└─────────────────────────────────────────────────┘
```

## Commands

### /restart
Restarts AVC CLI to activate installed updates.

**Usage**:
```bash
> /restart
🔄 Restarting AVC...
```

**Keyboard Shortcut**: `Ctrl+R`

### Dismiss Notification
Press **Esc** to dismiss the update notification and continue with current version.

## Configuration

Settings are stored in `~/.avc/settings.json`.

### Default Settings
```json
{
  "autoUpdate": {
    "enabled": true,
    "checkInterval": 3600000,
    "silent": true,
    "notifyUser": true
  }
}
```

### Configuration Options

#### `enabled` (boolean)
Enable or disable auto-updates.
- **Default**: `true`
- **Example**: Set to `false` to disable auto-updates

#### `checkInterval` (number)
How often to check for updates, in milliseconds.
- **Default**: `3600000` (1 hour)
- **Example**: `1800000` (30 minutes), `7200000` (2 hours)

#### `silent` (boolean)
Install updates silently in background.
- **Default**: `true`
- **Example**: Set to `false` to prompt before installing

#### `notifyUser` (boolean)
Show notification when update is ready.
- **Default**: `true`
- **Example**: Set to `false` to hide notifications

### How to Configure

**Method 1: Edit settings file directly**
```bash
# Edit settings
nano ~/.avc/settings.json

# Example: Disable auto-updates
{
  "autoUpdate": {
    "enabled": false
  }
}

# Example: Check every 2 hours
{
  "autoUpdate": {
    "checkInterval": 7200000
  }
}
```

**Method 2: Backup and restore settings**
```bash
# Backup
cp ~/.avc/settings.json ~/.avc/settings.backup.json

# Restore
cp ~/.avc/settings.backup.json ~/.avc/settings.json
```

## State Files

Auto-update stores state in `~/.avc/`.

### Files Created

#### `~/.avc/settings.json`
User configuration for auto-updates.

#### `~/.avc/update-state.json`
Current update status (auto-managed).

**Example**:
```json
{
  "currentVersion": "1.1.3",
  "latestVersion": "1.2.0",
  "lastChecked": "2026-01-27T10:30:00Z",
  "updateAvailable": true,
  "updateReady": false,
  "updateStatus": "downloading",
  "errorMessage": null,
  "userDismissed": false
}
```

### State File Fields

- `currentVersion`: Your installed version
- `latestVersion`: Latest version on npm
- `lastChecked`: When last check occurred
- `updateAvailable`: Is newer version available?
- `updateReady`: Is update downloaded and ready?
- `updateStatus`: Current status (`idle`, `pending`, `downloading`, `ready`, `failed`)
- `errorMessage`: Error details if update failed
- `userDismissed`: Did user dismiss notification?

## Troubleshooting

### Update Failed - Permission Denied

**Symptom**:
```
❌ Update failed
Permission denied. Try: sudo npm install -g @agile-vibe-coding/avc-cli@1.2.0
```

**Solution**: Run the manual install command with sudo:
```bash
sudo npm install -g @agile-vibe-coding/avc-cli@1.2.0
```

### Update Failed - npm Not Found

**Symptom**:
```
❌ Update failed
npm not found. Please install npm to enable auto-updates.
```

**Solution**: Install npm:
```bash
# On Ubuntu/Debian
sudo apt install npm

# On macOS
brew install node

# On Windows
# Download from https://nodejs.org
```

### Update Not Detecting

**Check current state**:
```bash
cat ~/.avc/update-state.json
```

**Check last check time**:
```bash
cat ~/.avc/update-state.json | grep lastChecked
```

**Force check manually**:
```bash
# Remove state file to force fresh check
rm ~/.avc/update-state.json

# Restart AVC
avc
```

### Disable Auto-Updates

**Temporary** (current session):
Press `Esc` to dismiss notification.

**Permanent**:
```bash
# Edit settings
nano ~/.avc/settings.json

# Set enabled to false
{
  "autoUpdate": {
    "enabled": false
  }
}
```

### Check Update Status

**View state**:
```bash
cat ~/.avc/update-state.json
```

**View settings**:
```bash
cat ~/.avc/settings.json
```

## Security

### How Updates Are Verified

1. **npm Registry**: Updates come from official npm registry
2. **Package Signature**: npm verifies package signatures automatically
3. **Version Validation**: Only semantic versions accepted (e.g., 1.2.3)
4. **HTTPS**: All downloads use encrypted HTTPS connections

### What Gets Updated

- Only the `@agile-vibe-coding/avc-cli` package
- No other dependencies modified
- No system files changed (except package installation)

### Permissions

**Global install** may require:
- `sudo` on Unix systems
- Administrator rights on Windows
- User has npm install permissions

If permission denied, manual install instructions are provided.

## Manual Updates

If you prefer manual updates, disable auto-updates:

```bash
# Disable auto-updates
echo '{"autoUpdate":{"enabled":false}}' > ~/.avc/settings.json

# Update manually when ready
npm install -g @agile-vibe-coding/avc-cli@latest

# Or update to specific version
npm install -g @agile-vibe-coding/avc-cli@1.2.0
```

## FAQ

### Q: Does auto-update require internet?
**A**: Yes, checks npm registry and downloads updates.

### Q: How much bandwidth does it use?
**A**: Minimal. Version check is ~1KB. Package download is ~500KB-2MB depending on version.

### Q: Will it interrupt my work?
**A**: No. Updates download silently in background. You restart when ready.

### Q: Can I rollback to previous version?
**A**: Yes, manually install previous version:
```bash
npm install -g @agile-vibe-coding/avc-cli@1.1.3
```

### Q: What if update fails?
**A**: Notification shows error and instructions. Will retry on next check (1 hour).

### Q: Can I change check frequency?
**A**: Yes, edit `~/.avc/settings.json` and set `checkInterval` in milliseconds.

### Q: Does it work offline?
**A**: No. Requires internet to check and download updates. CLI works offline, updates don't.

### Q: Will it update while I'm using it?
**A**: Yes, downloads in background. But restart required to activate new version.

### Q: What happens if I don't restart?
**A**: You continue using current version. Update remains ready for when you restart.

### Q: Can I test beta versions?
**A**: Not via auto-update. Must manually install:
```bash
npm install -g @agile-vibe-coding/avc-cli@1.2.0-beta.1
```

## Best Practices

### Recommended Settings

**For production users**:
```json
{
  "autoUpdate": {
    "enabled": true,
    "checkInterval": 3600000,
    "silent": true,
    "notifyUser": true
  }
}
```

**For cautious users**:
```json
{
  "autoUpdate": {
    "enabled": false,
    "checkInterval": 86400000
  }
}
```

**For active development**:
```json
{
  "autoUpdate": {
    "enabled": true,
    "checkInterval": 1800000,
    "silent": true,
    "notifyUser": true
  }
}
```

### When to Restart

- **After critical update**: Restart soon to get security fixes
- **After feature update**: Restart when convenient
- **During work**: Dismiss and restart later
- **End of day**: Restart before closing

### Backup Settings

```bash
# Backup before making changes
cp ~/.avc/settings.json ~/.avc/settings.backup.json

# Restore if needed
cp ~/.avc/settings.backup.json ~/.avc/settings.json
```

---

**Feature**: Auto-Update
**Status**: ✅ Active
**Version**: 1.1.3+
**Documentation Updated**: 2026-01-27
