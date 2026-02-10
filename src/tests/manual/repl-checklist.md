# Manual REPL Testing Checklist

This checklist covers interactive features of the AVC REPL that require manual testing.

## Setup

To run the REPL for testing:

```bash
cd /mnt/x/Git/nacho.coll/agilevibecoding/src
node cli/index.js
```


## Test Categories

### Basic Features

- [ ] 1. Banner displays with version
- [ ] 2. Separator lines span full terminal width
- [ ] 3. Prompt shows "> " with cursor

### Command Selector

- [ ] 4. Type "/" and press Enter → Shows command list
- [ ] 5. Arrow keys (↑/↓) navigate commands
- [ ] 6. Number keys (1-5) select commands instantly
- [ ] 7. Press Esc → Cancels and returns to prompt

### Direct Commands

- [ ] 8. Type "/version" → Shows version info
- [ ] 9. Type "/help" → Shows help with aliases
- [ ] 10. Type "/v" → Shows version (alias test)
- [ ] 11. Type "/h" → Shows help (alias test)
- [ ] 11b. Type "/i" → Starts init (alias test)
- [ ] 11c. Type "/s" → Shows status (alias test)

### Command History

- [ ] 12. Run "/version", then "/help"
- [ ] 13. Press ↑ arrow → Shows "/help"
- [ ] 14. Press ↑ again → Shows "/version"
- [ ] 15. Press ↓ → Shows "/help" again
- [ ] 16. Press ↓ → Clears input

### Loading Indicators

- [ ] 17. Type "/status" → Shows spinner (brief)
- [ ] 18. Spinner displays "Checking project status..."
- [ ] 19. Type "/init" → Shows spinner during API validation

### Error Handling

- [ ] 20. Type "/foo" → Shows error with tips
- [ ] 21. Type "hello" → Shows "must start with /" error
- [ ] 22. Run "/init" without API key → Shows clear setup instructions

### Terminal Resize

- [ ] 23. Resize terminal → Separator lines adjust dynamically

### Exit

- [ ] 24. Type "/exit" → Exits gracefully
- [ ] 25. Type "/q" → Exits (alias test)
- [ ] 26. Press Ctrl+C → Exits gracefully


## New Features (Added in Enhanced REPL)

✨ Command history (↑/↓ arrows)
✨ Command aliases (/h, /v, /q, /i, /s)
✨ Loading spinners for async commands
✨ Number shortcuts (1-5) in command selector
✨ Better error messages with tips
✨ Command filtering when typing "/xxx"
✨ API key validation before ceremonies


## Testing Notes

- **Tab completion**: Currently not implemented (future enhancement)
- **Filtering**: Type "/v" directly to see filtering (shows only version command)
- **Colors**: Test in both light and dark terminal themes
- **Performance**: Spinner should appear within 100ms for perceived responsiveness


## Reporting Issues

If you find issues during manual testing:

1. Note the specific test case number
2. Describe the expected vs actual behavior
3. Include terminal size if resize-related
4. Capture screenshot if visual issue
5. Report at: https://github.com/NachoColl/agilevibecoding/issues


_Last updated: 2026-01-28 (Enhanced REPL with API validation)_
