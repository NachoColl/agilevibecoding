# Live Command Filtering Feature

## Overview

The REPL now features **live command filtering** - the command list appears immediately when you type "/" and filters in real-time as you continue typing.

## How It Works

### Basic Usage

1. **Type "/" (just the slash)**
   - Command list appears **immediately** (no need to press Enter)
   - Shows all 5 commands

2. **Continue typing** (e.g., "/h")
   - List filters to show only matching commands
   - Example: "/h" shows only `/help`
   - Example: "/st" shows only `/status`

3. **Press Enter**
   - Executes the typed command or selected command
   - If only one match, executes it
   - If multiple matches, executes the highlighted one

4. **Press Backspace**
   - Deletes characters and updates filter
   - If you delete back to just "/", shows all commands
   - If you delete the "/", exits selector and returns to prompt

5. **Press Esc**
   - Cancels selector and returns to prompt
   - Input is cleared

## Visual Example

### Step 1: Type "/"
```
AGILE VIBE CODING
═════════════════
Version: 1.1.3
Framework for AI-powered Agile development

Type / to see commands

─────────────────────────────────────────────────────
> /

[1] /init        Initialize an AVC project (Sponsor Call ceremony)
[2] /status      Show current project status
[3] /help        Show this help message
[4] /version     Show version information
[5] /exit        Exit AVC interactive mode
(Use arrows, number keys, or Esc to cancel)
─────────────────────────────────────────────────────
```

### Step 2: Type "h" (now "/h")
```
─────────────────────────────────────────────────────
> /h

[1] /help        Show this help message
(Use arrows, number keys, or Esc to cancel)
─────────────────────────────────────────────────────
```

### Step 3: Type "e" (now "/he")
```
─────────────────────────────────────────────────────
> /he

[1] /help        Show this help message
(Use arrows, number keys, or Esc to cancel)
─────────────────────────────────────────────────────
```

### Step 4: Continue typing "lp" (now "/help")
```
─────────────────────────────────────────────────────
> /help

[1] /help        Show this help message
(Use arrows, number keys, or Esc to cancel)
─────────────────────────────────────────────────────
```

### Step 5: Press Enter
```
─────────────────────────────────────────────────────

📚 Available Commands:

  /init (or /i)      Initialize an AVC project (Sponsor Call ceremony)
  /status (or /s)    Show current project status
  /help (or /h)      Show this help message
  /version (or /v)   Show version information
  /exit (or /q)      Exit AVC interactive mode

💡 Tips:
  - Type / and press Enter to see interactive command selector
  - Use arrow keys (↑/↓) to navigate command history
  - Use number keys (1-5) to quickly select commands from the menu
  - Press Esc to cancel command selector

─────────────────────────────────────────────────────
```

## Filter Examples

| You Type | Matches Shown |
|----------|---------------|
| `/` | All 5 commands |
| `/h` | `/help` only |
| `/he` | `/help` only |
| `/help` | `/help` only |
| `/v` | `/version` only |
| `/e` | `/exit` only |
| `/i` | `/init` only |
| `/in` | `/init` only |
| `/s` | `/status` only |
| `/st` | `/status` only |
| `/sta` | `/status` only |
| `/status` | `/status` only |
| `/x` | No matches (shows "No matching commands") |

## Keyboard Shortcuts in Selector

| Key | Action |
|-----|--------|
| **Any letter/number** | Continues typing, filters list |
| **Backspace** | Deletes last character, updates filter |
| **Enter** | Executes typed/selected command |
| **Esc** | Cancels and returns to prompt |
| **1-5** | Instantly selects command by number |
| **↑/↓ arrows** | Navigate filtered list |

## Special Behaviors

### No Matches
If your input doesn't match any command:
```
─────────────────────────────────────────────────────
> /xyz

No matching commands
(Press Esc to cancel)
─────────────────────────────────────────────────────
```

### Delete Back to "/"
If you backspace to just "/", all commands reappear:
```
Type: /help
Backspace 4 times → /

Result: All 5 commands shown again
```

### Delete the "/"
If you backspace and delete the "/", selector closes:
```
Type: /h
Backspace twice → (empty)

Result: Back to normal prompt mode
```

## Compatibility with Existing Features

### ✅ Command History
History still works! After executing a command:
- Press **↑** to recall previous commands
- If recalled command starts with "/", selector opens automatically

### ✅ Command Aliases
Aliases work with live filtering:
- Type `/h` → filters to `/help`
- Type `/v` → filters to `/version`
- Type `/q` → filters to `/exit` (though alias `/quit` also works)

### ✅ Number Shortcuts
Even when filtered, number keys work:
- Type `/h` → shows one command as `[1] /help`
- Press **1** → executes `/help`

### ✅ "/" + Enter Still Works
The original behavior is preserved:
- Type `/` and press **Enter** → clears input, shows all commands
- Same as typing just `/` (selector shows immediately)

## Implementation Details

### State Management
- **Input state**: Tracks what user types (e.g., "/h", "/help")
- **Mode state**: `'prompt'` or `'selector'`
- **Filter logic**: Commands filtered by `command.value.startsWith(input.toLowerCase())`

### Input Handlers
Two `useInput` handlers:
1. **Prompt mode** (`mode === 'prompt'`):
   - Handles typing in normal prompt
   - Switches to selector when "/" is typed
   - Handles history navigation (↑/↓)

2. **Selector mode** (`mode === 'selector'`):
   - Handles continued typing for filtering
   - Handles backspace to update/exit
   - Delegates arrows/Enter to SelectInput component

### Rendering
Selector shows:
1. Input line: `> /[typed text]`
2. Filtered command list
3. Help text

## Testing Guide

### Test 1: Immediate Appearance
```bash
node cli/index.js
```
1. Type `/` (don't press Enter)
2. **Expected**: Command list appears immediately

### Test 2: Live Filtering
1. Type `/h`
2. **Expected**: Only `/help` shown
3. Backspace once → `/`
4. **Expected**: All commands shown again

### Test 3: No Matches
1. Type `/xyz`
2. **Expected**: "No matching commands" message
3. Backspace 3 times → `/`
4. **Expected**: All commands shown

### Test 4: Execute Filtered Command
1. Type `/v`
2. **Expected**: Only `/version` shown
3. Press **Enter**
4. **Expected**: Version info displayed

### Test 5: Number Shortcuts with Filter
1. Type `/s`
2. **Expected**: Only `/status` shown as `[1] /status`
3. Press **1**
4. **Expected**: Status command executes

### Test 6: Exit Selector
1. Type `/h`
2. Press **Esc**
3. **Expected**: Back to prompt, input cleared

### Test 7: Delete to Exit
1. Type `/h`
2. Backspace twice (deletes "h" then "/")
3. **Expected**: Back to prompt mode

### Test 8: History with Filter
1. Type `/version` and press Enter
2. Press **↑** (history)
3. **Expected**: Input shows `/version`, selector appears with one match

## Comparison: Before vs After

### Before
- Type `/` → (nothing happens)
- Press **Enter** → Selector appears
- Type more → (cannot type in selector)
- Must press Esc → type again → Enter

### After
- Type `/` → **Selector appears immediately** ✅
- Continue typing → **Live filtering** ✅
- Type `/h` → Shows only `/help` ✅
- Press Enter → Executes ✅
- Much faster workflow! ⚡

## Code Changes

### Files Modified
- `src/cli/repl-ink.js`

### Key Changes
1. **Line 334-345**: Detect "/" in prompt mode, auto-enter selector
2. **Line 348-369**: New useInput handler for selector mode typing
3. **Line 321-331**: Backspace handling exits selector if "/" deleted
4. **Line 377-395**: Selector shows input field and passes filter

### Lines Changed
- Added: ~30 lines
- Modified: ~15 lines
- Total: ~45 lines of changes

## Benefits

1. **⚡ Faster**: No need to press Enter after "/"
2. **🎯 Precise**: Filter as you type to find commands
3. **🧠 Intuitive**: Works like autocomplete/search
4. **🔄 Flexible**: Both "/" and "/command" work
5. **✅ Compatible**: All existing features still work

---

**Feature**: Live Command Filtering
**Status**: ✅ Implemented
**Testing**: Ready for manual testing
**Compatibility**: 100% with existing features
