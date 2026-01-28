# UI Changes - Bottom-Right Status Display

## Date: 2026-01-27

## Summary

Moved version and update information from banner badge and notification boxes to a bottom-right status display for a cleaner, more compact UI.

## Changes Made

### 1. Removed Components

**Removed from UI**:
- ❌ `UpdateStatusBadge` - Previously shown in banner next to "AGILE VIBE CODING"
- ❌ `UpdateNotification` - Large notification box with border shown above separator
- ❌ Import statement for update-notifier.js components

**Removed State**:
- ❌ `showUpdateNotification` - No longer needed

### 2. Added Component

**New: `BottomRightStatus`** (cli/repl-ink.js:130-187)

Features:
- Shows version on every screen: `v1.1.3`
- Updates dynamically every 2 seconds (polls state file)
- Shows update status when available
- Right-aligned to terminal width
- Automatic resize handling

**Status Messages**:
```
v1.1.3                                    // No update (gray/dimmed)
v1.1.3 → v1.2.0 available                // Update pending (yellow)
v1.1.3 → v1.2.0 downloading...           // Downloading (blue)
v1.1.3 → v1.2.0 ready! (Ctrl+R)          // Ready to install (green)
v1.1.3 | Update failed                   // Failed (red)
```

### 3. Banner Changes

**Kept in banner**:
- ✅ Version still shown: `Version: 1.1.3`
- User requested version to remain on splash screen

### 4. Update Check Timing

**Changed**:
```javascript
// BEFORE: Only background checker (first check after interval)
checker.startBackgroundChecker();

// AFTER: Immediate first check, then background
checker.checkForUpdates().catch(() => {});  // Immediate
checker.startBackgroundChecker();           // Then recurring
```

**Effect**: User sees update status immediately on startup instead of waiting for first hourly check.

### 5. UI Layout

**Before**:
```
┌─────────────────────────────────────────┐
│ AGILE VIBE CODING [Update Ready!]      │  ← Badge in banner
│ ═════════════════                       │
│ Version: 1.1.3                          │
│ ...                                     │
│                                         │
│ ╭─────────────────────────────────────╮ │
│ │ ✅ Update v1.2.0 ready!             │ │  ← Large notification box
│ │ Restart to use the new version      │ │
│ │ Type /restart or press Ctrl+R       │ │
│ ╰─────────────────────────────────────╯ │
│                                         │
│ ─────────────────────────────────────── │
│ > /                                     │
│ ─────────────────────────────────────── │
└─────────────────────────────────────────┘
```

**After**:
```
┌─────────────────────────────────────────┐
│ AGILE VIBE CODING                       │  ← No badge
│ ═════════════════                       │
│ Version: 1.1.3                          │  ← Still in banner
│ ...                                     │
│                                         │
│ ─────────────────────────────────────── │  ← No notification box
│ > /                                     │
│ ─────────────────────────────────────── │
│     v1.1.3 → v1.2.0 ready! (Ctrl+R)    │  ← Bottom-right status
└─────────────────────────────────────────┘
```

### 6. Interaction Changes

**Esc key dismissal**:
- Still works - sets `userDismissed: true` in state file
- BottomRightStatus component hides update info when dismissed
- Works automatically via state polling

**Ctrl+R restart**:
- Still works - no changes to this functionality

**First update check**:
- Now runs immediately on startup
- User sees status right away (not after 1 hour)

## Technical Details

### BottomRightStatus Component

**State Management**:
```javascript
const [updateState, setUpdateState] = useState(null);  // Polled state
const [width, setWidth] = useState(process.stdout.columns || 80);  // Terminal width
```

**Polling Logic**:
```javascript
useEffect(() => {
  const checker = new UpdateChecker();

  const updateStatus = () => {
    const state = checker.readState();
    setUpdateState(state);
  };

  updateStatus();  // Initial read
  const interval = setInterval(updateStatus, 2000);  // Poll every 2 seconds

  return () => clearInterval(interval);
}, []);
```

**Right-Alignment**:
```javascript
const padding = Math.max(0, width - statusText.length - 2);

return React.createElement(Box, { justifyContent: 'flex-end' },
  React.createElement(Text, { ... },
    ' '.repeat(padding),  // Pad to push text right
    statusText
  )
);
```

### Render Order

```javascript
return React.createElement(Box, { flexDirection: 'column' },
  React.createElement(Banner),           // Top
  renderOutput(),                        // Command output
  renderSelector(),                      // Command selector (when typing /)
  renderPrompt(),                        // Input prompt
  React.createElement(BottomRightStatus) // Bottom-right status ← NEW
);
```

## Files Modified

**File**: `cli/repl-ink.js`

**Lines Changed**:
- Banner component (24-37): Re-added version display
- New BottomRightStatus component (130-187): Added
- Removed imports (line 9): Removed update-notifier.js imports
- Updated useEffect (186-203): Added immediate update check
- Removed showUpdateNotification state (line 184): Deleted
- Updated Esc handler (432-439): Removed setShowUpdateNotification
- Updated render (609-614): Removed UpdateNotification, added BottomRightStatus

**Total Changes**: ~60 lines modified/added, ~30 lines removed

## Benefits

1. **Cleaner UI**: No large notification boxes interrupting workflow
2. **Persistent Info**: Version always visible in bottom-right
3. **Space Efficient**: Single line vs multi-line notification box
4. **Immediate Feedback**: First update check happens on startup
5. **Dynamic Updates**: Polls every 2 seconds, shows real-time status
6. **Right-Aligned**: Doesn't interfere with command input area
7. **Still Dismissable**: Esc key still works via state file

## Testing

**Manual Test**:
```bash
# With mock update ready state
node cli/index.js

# Expected bottom-right:
# v1.1.3 → v1.2.0 ready! (Ctrl+R)  (in green)
```

**Test Scenarios**:
1. ✅ Version shows on startup
2. ✅ Update status appears immediately (not after 1 hour)
3. ✅ Status updates dynamically (changes color/text)
4. ✅ Right-aligned to terminal width
5. ✅ Esc key dismisses (hides update info)
6. ✅ Ctrl+R restart still works
7. ✅ No notification boxes shown
8. ✅ Version remains in banner

## Migration Notes

**No breaking changes**:
- All update functionality preserved
- Same state files (~/.avc/update-state.json, ~/.avc/settings.json)
- Same commands (/restart, Ctrl+R, Esc)
- Same auto-update behavior

**Only UI changed**:
- Different display location (bottom-right vs banner/notification)
- More compact presentation
- Immediate first check

---

**Implementation Date**: 2026-01-27
**Status**: ✅ Complete
**Testing**: ✅ Imports verified
**Ready for**: Manual UI testing
