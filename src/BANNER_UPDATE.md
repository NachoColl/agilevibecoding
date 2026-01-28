# Banner Update - Development Warning Added

## Change Made

Added a prominent red warning message to the banner: **"⚠️  UNDER DEVELOPMENT - DO NOT USE  ⚠️"**

## Visual Preview

When you start the REPL, you'll now see:

```
AGILE VIBE CODING
═════════════════
Version: 1.1.3

⚠️  UNDER DEVELOPMENT - DO NOT USE  ⚠️

Framework for AI-powered Agile development

Type / to see commands

─────────────────────────────────────────────────────
>
─────────────────────────────────────────────────────
```

**Note**: The warning message appears in **bold red** text.

## File Modified

- **`src/cli/repl-ink.js`** (lines 29-30)

## Code Change

```javascript
// Added after version line:
React.createElement(Text, null, ' '),
React.createElement(Text, { bold: true, color: 'red' }, '⚠️  UNDER DEVELOPMENT - DO NOT USE  ⚠️'),
React.createElement(Text, null, ' '),
```

## Properties

- **Color**: Red (`color: 'red'`)
- **Style**: Bold (`bold: true`)
- **Icons**: Warning emojis (⚠️) on both sides
- **Spacing**: Empty lines before and after for emphasis

## Test Verification

```bash
cd /mnt/x/Git/nacho.coll/agilevibecoding/src
node cli/index.js
```

You should immediately see the red warning message in the banner.

## Automated Tests

✅ All 5 automated tests still passing:
- Version reading
- Dependencies
- Module import
- Spinner component
- SelectInput component

---

**Added**: 2026-01-27
**Status**: ✅ Complete
**Visual Impact**: High (red, bold, prominent placement)
