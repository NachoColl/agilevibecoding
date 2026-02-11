# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Repository Overview

**Agile Vibe Coding (AVC)** is a framework for managing agent-based software development projects. This repository contains:

1. **npm CLI package** (`src/`) - Interactive command-line tool for running AVC ceremonies
2. **Documentation website** (`_docs/`) - VitePress-powered documentation site

**This is a framework/CLI tool repository**, not a sample application. It provides:
- An npm package (`@agile-vibe-coding/avc`) published to npm registry
- Public documentation at https://agilevibecoding.org
- CLI commands that users run to initialize and manage their AVC projects


## Repository Structure

```
agilevibecoding/
├── src/                      # npm CLI package source
│   ├── cli/                  # CLI implementation (REPL, commands, processors)
│   ├── tests/                # Vitest test suite (unit + integration)
│   ├── package.json          # npm package configuration
│   └── vitest.config.js      # Test configuration
├── _docs/                    # VitePress documentation site (auto-synced from root .md files)
├── README.md, COMMANDS.md, INSTALL.md, CONTRIBUTING.md  # Documentation sources
├── package.json              # Root package.json for VitePress
└── .github/workflows/        # GitHub Actions (deploy docs, publish npm)
```


## Architecture Key Patterns

### REPL UI Architecture (`repl-ink.js`)

**Mode-based state machine** with multiple input handlers:
- `'prompt'`, `'selector'`, `'executing'`, `'questionnaire'`, `'preview'`, `'removeConfirm'`, `'process-viewer'`, `'kill-confirm'`
- Each mode has its own `useInput` hook activated by `isActive` flag
- Output ALWAYS accumulates - use `setOutput(prev => prev + newContent)`, NEVER `setOutput('')`
- All console output must be fully left-aligned (no indentation)

**Mode Transition Best Practice:** Only reset UI state in `finally` block, not between stages. Preserve special modes during async flows.

### Command Logger System (`command-logger.js`)

- Creates individual log files per command in `.avc/logs/`
- Intercepts console methods and writes to both console + log file
- Only created if `.avc` exists (except `/init`)
- Auto-cleanup keeps last 10 logs per command

### Questionnaire System

**Multi-line input with auto-save:**
- Double-Enter submits, Single-Enter on empty skips
- Auto-saves progress every 30s to `.avc/sponsor-call-progress.json`
- Mission Statement is MANDATORY - cannot be skipped (enforced at `currentQuestionIndex === 0`)
- Other questions use AI agents when skipped

### LLM Provider Pattern

Factory pattern in `llm-provider.js` supporting multiple providers (Claude, Gemini):
- Reads from `.avc/avc.json`: `{ "llm": { "provider": "claude" | "gemini" } }`
- Each provider implements: `generateSuggestions()`, `enhanceDocument()`

### Background Process Manager (`process-manager.js`)

- Manages lifecycle of background processes (e.g., documentation server)
- Event emission: process-started, process-stopped, process-exited, process-error
- Automatic cleanup via signal handlers on REPL exit

### Signal Handlers & Graceful Shutdown

**Critical:** Background processes must be cleaned up on ALL exit paths (Ctrl+C, /restart, exceptions)
- Use synchronous process-level handlers: `process.on('SIGINT', cleanupAndExit)`
- React lifecycle hooks won't run on forced exit
- Location: repl-ink.js:2274-2297


## Debug Logging

**Critical Requirement:** All commands that do actual work MUST have comprehensive debug logging saved to `.avc/logs/{command}-{timestamp}.log`

**Debug Helper Pattern:**
```javascript
function debug(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[DEBUG][${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[DEBUG][${timestamp}] ${message}`);
  }
}
```

**What to Log:**
1. **Function Entry/Exit** - With parameters and results
2. **State Changes** - Before/after with context
3. **API Calls** - Before (params) and after (response, tokens)
4. **Decision Points** - Which branch taken and why
5. **File Operations** - Path, size, success/failure
6. **Loop Iterations** - Progress for critical loops only
7. **Error Context** - Full error + stack + application state
8. **Progress Updates** - Stage transitions and substeps

**Log Levels:**
- `debug()` - Execution flow, internals
- `console.log()` - User-facing progress
- `console.error()` - Errors
- `console.warn()` - Non-critical issues

**Anti-Patterns:**
- ❌ Don't log sensitive data (API keys, passwords)
- ❌ Don't log in tight loops without conditionals
- ❌ Don't use string concatenation with objects (use structured data)
- ❌ Don't skip error context


## Development Workflow

### Working on CLI Code

```bash
npm install                 # Install dependencies
npm test                    # Run all tests (194 tests)
npm run test:watch          # Watch mode for TDD
node cli/index.js           # Test directly
npm install -g .            # Install globally to test 'avc' command
npm uninstall -g @agile-vibe-coding/avc  # Cleanup
```

**When modifying CLI:**
1. Make changes in `src/cli/`
2. Run tests: `npm test` (all must pass)
3. Test manually
4. Update `COMMANDS.md` if behavior changes
5. Commit when tests pass

### Working on Documentation

**IMPORTANT:** Edit root markdown files (README.md, COMMANDS.md, etc.), NOT `_docs/` files directly

```bash
# Edit source files
vim README.md, COMMANDS.md, INSTALL.md, CONTRIBUTING.md

# Sync and build
npm run docs:sync           # Copy to _docs/ with link transformation
npm run docs:dev            # Live reload at http://localhost:5173
npm run docs:build          # Build static site
npm run docs:preview        # Preview at http://localhost:4173
```

**Link transformation:** `](README.md#anchor)` → `](/#anchor)`, etc.


## Testing

**Framework:** Vitest (v2.1.9)
**Current Count:** 194 tests across 12 test files

```bash
npm test                    # Run all tests
npm run test:coverage       # With coverage (50% minimum)
npm run test:watch          # Watch mode
npm test path/to/file.test.js  # Run specific file
```

**Test Structure (AAA Pattern):**
- `tests/unit/` - Individual module tests
- `tests/integration/` - Component interaction tests

**All tests must pass before publishing to npm.**


## Publishing

### Auto-publish to npm

GitHub Actions workflow automatically publishes when:
1. Version in `src/package.json` changes
2. Push to `master` branch
3. All tests pass

**Manual publish:**
```bash
cd src
npm version patch|minor|major
npm publish
git push --follow-tags
```

### Auto-deploy Documentation

GitHub Actions automatically deploys when:
1. Documentation files change
2. Push to `master` branch
Deploys to: https://agilevibecoding.org


## Common Development Tasks

### Add New CLI Command

1. Add to switch statement in `repl-ink.js` `executeCommand()`
2. Add to: `allCommands` array, `commandGroups` array, `resolveAlias` function
3. Implement command function with initialization check (use `initiator.isAvcProject()`)
4. Add command to `init.js` if needed
5. Update `COMMANDS.md`
6. Add tests in `tests/unit/` or `tests/integration/`
7. Update `repl-commands.test.js`

**Commands requiring initialization check:** `/sponsor-call`, `/status`, `/remove`, etc.
**Commands skipping check:** `/init`, `/help`, `/version`, `/exit`, `/restart`

### Implement Safe Destructive Operations

**Requirements:**
1. Detailed preview of what will be affected
2. Exact string confirmation (e.g., "delete all", not "yes")
3. Visual separation (borders, colors, warnings)
4. Preserve critical data (.env, credentials)
5. Always require interactive confirmation

**Reference:** `/remove` command pattern in repl-ink.js:1936-1973

### Add Interactive Confirmation Dialog

Follow `/remove` command pattern:
1. Add state variables: `myConfirmActive`, `myConfirmInput`
2. Create confirmation component with warning UI
3. Add `useInput` handler with `isActive: myConfirmActive`
4. Update render logic to show confirmation when active

### Add New LLM Provider

1. Create `src/cli/llm-[provider].js` with `generateSuggestions()` and `enhanceDocument()` methods
2. Update factory in `llm-provider.js`
3. Add to package.json dependencies
4. Add tests in `tests/unit/llm-[provider].test.js`
5. Update documentation with API key setup


## Important Notes

### This is NOT a Sample Application

- This repository IS the framework/CLI tool itself
- Users install via `npm install -g @agile-vibe-coding/avc`
- Users run in their own projects, not in this repo
- Don't add sample project code here

### Framework Philosophy

AVC provides organizational structure for long-term AI-assisted development:
- Hierarchical work items: Epic → Story → Task → Subtask
- Context inheritance via `context.md` at each level
- LLM-powered ceremonies with multi-model support
- Verification-focused work items

### Critical Implementation Constraints

1. **REPL Output Must Scroll** - Never clear output, always append
2. **Mode-Based Input** - Each mode needs its own useInput handler
3. **Project Initialization Guard** - All commands except `/init` must check `isAvcProject()`
4. **Logger Conditional Creation** - Only create logger if `.avc` exists (or for `/init`)
5. **Documentation Sync** - Edit root MD files, never `_docs/` directly
6. **Console Output Formatting** - All output fully left-aligned, NO indentation
7. **Temporary Files** - All temporary markdown files go in `_temp/`, NOT root

### File Organization Rules

**Root Directory (documentation only):**
- CLAUDE.md, README.md, COMMANDS.md, INSTALL.md, CONTRIBUTING.md, LICENSE

**_temp/ Directory (temporary/planning files):**
- All implementation plans, checklists, summaries, analysis documents
- Examples: IMPLEMENTATION_PLAN.md, AGENT_VERIFICATION_REPORT.md

**Rule:** When creating temporary markdown files, ALWAYS create in `_temp/`, NEVER in root


## Version

CLI Version: 0.1.0
Test Count: 194 tests (12 files)
Documentation: https://agilevibecoding.org
