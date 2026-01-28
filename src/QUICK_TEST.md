# Quick Interactive Test - 5 Minutes

## Start the REPL
```bash
cd /mnt/x/Git/nacho.coll/agilevibecoding/src
node cli/index.js
```

## Test Sequence (5 minutes)

### 1. Basic Display (30 seconds)
✅ **Check**: Banner shows "AGILE VIBE CODING" with version
✅ **Check**: Separator lines span full width
✅ **Check**: Prompt shows "> " ready for input

### 2. Command Selector (1 minute)
**Type**: `/` then press **Enter**

✅ **Check**: List shows [1-5] numbered commands
✅ **Check**: Use ↑/↓ arrows to navigate
✅ **Try**: Press **3** → Should run /help instantly
✅ **Try**: Press **Esc** → Should cancel back to prompt

### 3. Command Aliases (1 minute)
**Type**: `/h` then press **Enter**
✅ **Check**: Shows help (same as /help)

**Type**: `/v` then press **Enter**
✅ **Check**: Shows version (same as /version)

**Type**: `/q` then press **Enter**
✅ **Check**: Exits with goodbye message

**Restart**: `node cli/index.js`

### 4. Command History (1 minute)
**Type**: `/version` then press **Enter**
**Type**: `/help` then press **Enter**

**Press**: **↑** arrow
✅ **Check**: Shows "/help"

**Press**: **↑** arrow again
✅ **Check**: Shows "/version"

**Press**: **↓** arrow
✅ **Check**: Shows "/help"

**Press**: **↓** arrow
✅ **Check**: Clears input

**Note**: History hint "(↑/↓ for history)" appears

### 5. Loading Spinner (30 seconds)
**Type**: `/status` then press **Enter**
✅ **Check**: Green spinner appears briefly
✅ **Check**: Message shows "Checking project status..."

### 6. Error Messages (30 seconds)
**Type**: `/foo` then press **Enter**
✅ **Check**: Shows error with helpful tips

**Type**: `hello` then press **Enter**
✅ **Check**: Shows "must start with /" error

### 7. Terminal Resize (30 seconds)
✅ **Try**: Drag terminal window wider
✅ **Check**: Separator lines adjust automatically

✅ **Try**: Drag terminal window narrower
✅ **Check**: Separator lines shrink to fit

### 8. Exit (30 seconds)
**Type**: `/exit` then press **Enter**
✅ **Check**: Shows "👋 Thanks for using AVC!"
✅ **Check**: Exits cleanly

## ✅ All Tests Pass?

If all checks passed:
- **You're done!** The enhanced REPL is working perfectly.
- Ready to commit the changes

If any failed:
- Note which test failed
- Check error messages
- Report back and we'll fix it

## Quick Commands Reference

| Command | Alias | Description |
|---------|-------|-------------|
| `/help` | `/h` | Show help |
| `/version` | `/v` | Show version |
| `/exit` | `/q` or `/quit` | Exit REPL |
| `/init` | `/i` | Initialize project |
| `/status` | `/s` | Show status |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **↑** | Previous command (history) |
| **↓** | Next command (history) |
| **1-5** | Quick select in menu |
| **Esc** | Cancel menu |
| **Ctrl+C** | Exit |

---

**Time**: ~5 minutes
**Checklist**: 8 main items
**Status**: Ready to test!
