# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Repository Overview

**Agile Vibe Coding (AVC)** is a framework for managing agent-based software development projects. This repository contains:

1. **npm CLI package** (`src/`) - Interactive command-line tool for running AVC ceremonies
2. **Documentation website** (root level) - VitePress-powered documentation site

**This is a framework/CLI tool repository**, not a sample application. It provides:
- An npm package (`@agile-vibe-coding/avc`) published to npm registry
- Public documentation at https://agilevibecoding.org
- CLI commands that users run to initialize and manage their AVC projects

---

## Repository Structure

```
agilevibecoding/
├── src/                      # npm CLI package source
│   ├── cli/                  # CLI implementation
│   │   ├── index.js          # Entry point (REPL)
│   │   ├── init.js           # /init command (setup project structure)
│   │   ├── repl-ink.js       # Interactive REPL UI (React Ink)
│   │   ├── template-processor.js  # Sponsor Call ceremony logic
│   │   ├── command-logger.js # Command-specific logging system
│   │   ├── update-checker.js # Auto-update checking
│   │   ├── update-installer.js # Auto-update installation
│   │   ├── llm-provider.js   # Multi-model LLM abstraction
│   │   ├── llm-claude.js     # Claude provider implementation
│   │   └── llm-gemini.js     # Gemini provider implementation
│   ├── tests/                # Vitest test suite
│   │   ├── unit/             # Unit tests (questionnaire, logger, commands, etc.)
│   │   └── integration/      # Integration tests
│   ├── package.json          # npm package configuration
│   └── vitest.config.js      # Test configuration
│
├── docs/                     # VitePress documentation site
│   ├── .vitepress/           # VitePress config and theme
│   │   ├── config.mts        # Site configuration
│   │   └── theme/            # Custom theme with CSS
│   ├── public/               # Static assets (logo, CNAME)
│   ├── index.md              # Home page (auto-synced from README.md)
│   ├── commands.md           # CLI commands reference (auto-synced)
│   ├── install.md            # Installation guide (auto-synced)
│   └── contribute.md         # Contributing guide (auto-synced)
│
├── README.md                 # Framework manifesto and overview
├── COMMANDS.md               # CLI commands reference
├── INSTALL.md                # Installation instructions
├── CONTRIBUTING.md           # Contributing guidelines
├── package.json              # Root package.json for VitePress
└── .github/workflows/        # GitHub Actions
    ├── deploy-pages.yml      # Auto-deploy docs to GitHub Pages
    └── publish-avc.yml       # Auto-publish to npm on version changes
```

---

## Architecture Deep Dive

### REPL UI Architecture (`repl-ink.js`)

The REPL is built with React Ink using a **mode-based state machine** with multiple input handlers:

**Modes:**
- `'prompt'` - Normal command input (default)
- `'selector'` - Command menu/autocomplete
- `'executing'` - Running command with spinner
- `'questionnaire'` - Multi-line questionnaire for Sponsor Call
- `'preview'` - Preview questionnaire answers before submission
- `'removeConfirm'` - Interactive confirmation for /remove command
- `'process-viewer'` - View and manage background processes (/processes command)
- `'kill-confirm'` - Confirmation dialog for killing external processes using AVC ports

**Key Pattern - Multiple useInput Hooks:**
Each mode has its own `useInput` hook activated by `isActive` flag:
```javascript
useInput((inputChar, key) => {
  if (mode !== 'prompt') return;
  // Handle prompt mode input
}, { isActive: mode === 'prompt' });

useInput((inputChar, key) => {
  if (!questionnaireActive) return;
  // Handle questionnaire mode input
}, { isActive: questionnaireActive });
```

**State Management:**
- Output accumulates (scrolling history) - use `setOutput(prev => prev + newContent)`
- Command history stored in array for up/down arrow navigation
- Tab completion filters commands from `allCommands` array
- Questionnaire state includes auto-save every 30s with resume capability

**Critical Implementation Details:**
- NEVER clear output with `setOutput('')` - always append to preserve scrolling history
- Command execution shows `> /command` before output for context
- All error handlers must append to output, not replace
- BottomRightStatus shows version + update notifications (right-aligned)
- **All console output must be fully left-aligned** - no indentation or leading spaces (command-line style)

**Mode Transition Best Practices:**
- Only reset UI state in the `finally` block of async operations, not between stages
- Preserve special modes ('process-viewer', 'kill-confirm') during async flows
- Never interrupt a mode transition with setTimeout/executeCommand cleanup
- Mode changes must be atomic - no partial transitions

**Example - Correct Pattern:**
```javascript
const runDocumentation = async () => {
  try {
    setMode('executing');
    await checkPort();

    // Check for port conflict
    if (portInUse && !isAvcServer) {
      setMode('kill-confirm'); // Special mode - must preserve
      setKillConfirmActive(true);
      return; // Exit early, don't reset mode
    }

    await startServer();
  } finally {
    // Only reset if not in special mode
    if (mode !== 'kill-confirm' && mode !== 'process-viewer') {
      setMode('prompt');
    }
  }
};
```

**Anti-pattern (will cause bugs):**
```javascript
// BAD: Resets mode between stages
setMode('executing');
await checkPort();
setMode('prompt'); // ❌ Interrupts flow!
await showConfirmation(); // Won't work - mode already reset
```

**Lesson Learned:** Confirmation dialogs were being overridden by premature mode resets. Always delay mode reset until the very end.

### Command Logger System (`command-logger.js`)

**Purpose:** Creates individual log files per command execution in `.avc/logs/`

**Key Behavior:**
- Logger only created if `.avc` folder exists (except `/init` which creates it)
- Intercepts `console.log`, `console.error`, `console.warn`, `console.info`
- Timestamped filenames: `{command}-{timestamp}.log`
- Auto-cleanup keeps last 10 logs per command
- Logs auto-added to `.gitignore` when `/init` runs

**Usage Pattern in executeCommand:**
```javascript
const avcExists = existsSync(path.join(process.cwd(), '.avc'));
if (['/init', '/sponsor-call', '/status', '/remove'].includes(command)) {
  if (command === '/init' || avcExists) {
    logger = new CommandLogger(commandName);
    logger.start();
  }
}
// ... execute command ...
if (logger) {
  logger.stop();
  const logPath = logger.getLogPath();
  console.log(`\n📝 Command log saved: ${logPath}`);
}
```

### Questionnaire System (Multi-line Input)

**Components:**
- `QuestionDisplay` - Shows question with guidance and examples
- `MultiLineInput` - Multi-line text input with line numbers and character count
- `QuestionnaireProgress` - Shows progress (2/5) and last auto-save time
- `QuestionnaireHelp` - Keyboard shortcuts panel
- `AnswersPreview` - Final review before submission

**Input Flow:**
1. User types multi-line answer
2. Double-Enter submits current answer
3. Single Enter on empty line skips (AI will suggest)
4. Ctrl+E enters edit mode to modify previous answers
5. Ctrl+P/N navigate between questions in edit mode
6. After all 5 questions, preview shows all answers
7. Enter from preview submits to ceremony

**Auto-save:**
- Saves progress every 30s to `.avc/sponsor-call-progress.json`
- On next `/sponsor-call`, prompts to resume if incomplete progress found
- Restores question index, answers, and current input

**Progress Persistence Pattern (General):**

**Principle:** Long-running operations (>1 minute) should auto-save progress for resumability.

**Implementation for Questionnaire:**
- **Interval:** 30 seconds (repl-ink.js:914)
- **Storage:** `.avc/sponsor-call-progress.json`
- **Data Saved:** Current question index, collected answers, current input, timestamp
- **Resume Detection:** On next command, check for incomplete progress file
- **User Choice:** Prompt to resume or start fresh

**Auto-Save Function:**
```javascript
const autoSaveProgress = () => {
  const progress = {
    stage: 'questionnaire',
    currentQuestionIndex,
    totalQuestions: questions.length,
    answeredQuestions: Object.keys(questionnaireAnswers).length,
    collectedValues: questionnaireAnswers,
    currentAnswer,
    lastUpdate: new Date().toISOString()
  };

  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
};

// Start auto-save timer
const autoSaveTimer = setInterval(autoSaveProgress, 30000);
```

**Resume Flow:**
```javascript
if (initiator.hasIncompleteProgress(progressPath)) {
  const progress = JSON.parse(fs.readFileSync(progressPath));

  // Prompt user
  console.log(`Found incomplete progress from ${progress.lastUpdate}`);
  console.log('Resume? (y/n)');

  // If yes, restore state
  setCurrentQuestionIndex(progress.currentQuestionIndex);
  setQuestionnaireAnswers(progress.collectedValues);
  setCurrentAnswer(progress.currentAnswer || '');
}
```

**Best Practices:**
- Use 30-60 second intervals (balance between overhead and data loss)
- Include timestamp in progress file for user context
- Always clean up progress file after successful completion
- Prompt user rather than auto-resuming silently
- Store enough state to fully restore UI

**Applicable to:**
- Multi-step wizards
- Long-form input
- Batch processing with user input
- Any operation >1 minute duration

**Location in code:** repl-ink.js:906-917, 1288-1303, 1380-1400

### Project Initialization Guard Pattern

**Critical Rule:** `/init` must be first command. Other commands check initialization:

```javascript
if (!this.isAvcProject()) {
  console.log('❌ Project not initialized\n');
  console.log('   Please run /init first to create the project structure.\n');
  return;
}
```

**What `/init` creates:**
- `.avc/` folder structure
- `.avc/avc.json` config file
- `.avc/project/` for project definitions
- `.avc/logs/` for command logs
- `.env.example` template
- Updates `.gitignore` with AVC entries

### Smart Configuration Merging

**Problem:** When `/init` runs on existing project, how to add new config fields without overwriting user customizations?

**Solution:** `deepMerge()` utility in init.js (lines 65-86)

**Behavior:**
- **Adds new keys** from default config (framework updates)
- **Preserves existing values** (user customizations)
- **Recursively merges** nested objects
- **Treats arrays as atomic** (doesn't merge array contents)

**Example:**
```javascript
// Default config (framework v0.2.0)
const defaultConfig = {
  llm: { provider: 'claude', model: 'sonnet' },
  logging: { level: 'info' },
  newFeature: { enabled: true }  // New in v0.2.0
};

// Existing user config (created with v0.1.0)
const userConfig = {
  llm: { provider: 'gemini' },  // User customization
  logging: { level: 'debug' }   // User customization
};

// Result after deepMerge(userConfig, defaultConfig)
{
  llm: {
    provider: 'gemini',  // ✅ Preserved user value
    model: 'sonnet'      // ✅ Added new field
  },
  logging: { level: 'debug' },  // ✅ Preserved
  newFeature: { enabled: true } // ✅ Added new section
}
```

**Implementation:**
```javascript
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      // Recursively merge nested objects
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else if (!(key in target)) {
      // Add new keys only if they don't exist
      result[key] = source[key];
    }
    // Else: preserve existing value
  }

  return result;
}
```

**When to use:**
- Adding new config fields in framework updates
- Merging default settings with user preferences
- Preserving user customizations during re-initialization

**Location in code:** init.js:65-86

### LLM Provider Pattern

**Factory pattern** in `llm-provider.js` supporting multiple providers:

```javascript
export class LLMProvider {
  static create(provider = process.env.LLM_PROVIDER || 'claude') {
    switch (provider.toLowerCase()) {
      case 'claude':
        return new ClaudeProvider();
      case 'gemini':
        return new GeminiProvider();
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}
```

**Each provider implements:**
- `generateSuggestions(context, variable, isPlural)` - For Sponsor Call questionnaire
- `enhanceDocument(content)` - For final document enhancement

**Configuration:**
- Reads from `.avc/avc.json`: `{ "llm": { "provider": "claude" | "gemini" } }`
- Falls back to `process.env.LLM_PROVIDER`
- API keys from `.env`: `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`

### Auto-Update System

**Three-component system:**
- `update-checker.js` - Checks npm registry for new versions
- `update-installer.js` - Downloads and installs updates
- `update-notifier.js` - Coordinates update flow

**Update Flow:**
1. On REPL start, check npm registry for latest version
2. If newer version available, download in background
3. Show notification in BottomRightStatus: "v0.1.0 → v0.1.1 ready! (Ctrl+R)"
4. User presses Ctrl+R to restart with new version
5. State stored in `.avc/update-state.json`

**User can dismiss:** Press Escape to hide notification (stored in state)

### Background Process Manager (`process-manager.js`)

**Purpose:** Manages lifecycle of background processes (e.g., documentation server) with health monitoring and cleanup.

**Key Features:**
- Process lifecycle management (start/stop/exit tracking)
- Output buffering (last 500 lines per process)
- Event emission: process-started, process-stopped, process-exited, process-error
- Automatic cleanup on REPL exit via signal handlers

**Usage Pattern:**
```javascript
import { BackgroundProcessManager } from './process-manager.js';

const processManager = new BackgroundProcessManager();

// Start a process
const proc = spawn('vitepress', ['dev'], { cwd: docsPath });
processManager.startProcess('documentation', proc);

// Listen for events
processManager.on('process-exited', ({ name, exitCode }) => {
  console.log(`${name} exited with code ${exitCode}`);
});

// Check if process is running
if (processManager.isProcessRunning('documentation')) {
  const uptime = processManager.getUptime('documentation');
}

// Stop all processes (called by signal handlers)
processManager.stopAll();
```

**Integration Points:**
- Used in repl-ink.js (line 38) for process tracking
- Cleaned up by signal handlers (lines 2274-2297)
- Powers /processes command for process viewing

### Signal Handlers & Graceful Shutdown

**Critical Pattern:** Background processes must be cleaned up on ALL exit paths (Ctrl+C, /restart, Ctrl+R, exceptions).

**Implementation:**
```javascript
// Global cleanup function (synchronous)
function cleanupAndExit() {
  if (backgroundProcessManager) {
    backgroundProcessManager.stopAll();
  }
  process.exit(0);
}

// Register signal handlers at process level
process.on('SIGINT', cleanupAndExit);  // Ctrl+C
process.on('SIGTERM', cleanupAndExit); // Kill signal

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanupAndExit();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  cleanupAndExit();
});
```

**Why Synchronous:**
- Signal handlers execute immediately, can't wait for async operations
- React lifecycle hooks (useEffect cleanup) won't run on forced exit
- Must use process-level handlers, not component-level

**Location in code:** repl-ink.js:2274-2297

**Lesson Learned:** Async cleanup in React components is insufficient for signal handlers. Always use synchronous process-level handlers for critical cleanup.

---

## Debug Logging Guidelines

**Critical Requirement:** All commands that do actual work MUST have comprehensive step-by-step debug logging to enable troubleshooting and monitoring. Logs are automatically saved to `.avc/logs/{command}-{timestamp}.log` via CommandLogger.

### Logging Architecture

**CommandLogger System:**
- Automatically captures all `console.log`, `console.error`, `console.warn`, `console.info` calls
- Writes to both console (for UI) and log file (for debugging)
- Active for commands: `/init`, `/sponsor-call`, `/project-expansion`, `/seed`, `/status`, `/models`, `/tokens`, `/remove`, `/documentation`
- NOT active for informational commands: `/help`, `/version`, `/exit`, `/restart`, `/processes`

**Debug Helper Function Pattern:**
```javascript
/**
 * Debug logging helper - adds timestamp and context
 * Use this for detailed execution flow logging
 */
function debug(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[DEBUG][${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[DEBUG][${timestamp}] ${message}`);
  }
}
```

### What to Log

**1. Function Entry/Exit**
```javascript
async function processTemplate(initialProgress = null) {
  debug('Starting processTemplate', {
    hasInitialProgress: !!initialProgress,
    ceremony: this.ceremonyName
  });

  try {
    // ... function body ...

    debug('processTemplate completed', { filesCreated: 5, tokensUsed: 1234 });
  } catch (error) {
    debug('processTemplate failed', { error: error.message, stack: error.stack });
    throw error;
  }
}
```

**2. State Changes**
```javascript
// Before state change
debug('Transitioning ceremony stage', { from: 'questionnaire', to: 'generation' });
this.stage = 'generation';

// After state change
debug('Stage transition complete', { stage: this.stage, tokensUsed: this.tokenTracker.getTotal() });
```

**3. API Calls (Before and After)**
```javascript
debug('Calling LLM API', {
  operation: 'generateJSON',
  provider: this._providerName,
  model: this._modelName,
  promptLength: prompt.length,
  maxTokens: 8000
});

const response = await this.llmProvider.generateJSON(prompt, agentInstructions);

debug('LLM API response received', {
  operation: 'generateJSON',
  responseLength: JSON.stringify(response).length,
  tokensUsed: this.llmProvider.getTokensUsed()
});
```

**4. Decision Points**
```javascript
if (initialProgress && initialProgress.collectedValues) {
  debug('Restoring from saved progress', {
    answeredCount: Object.keys(initialProgress.collectedValues).length,
    totalQuestions: variables.length
  });
  collectedValues = { ...initialProgress.collectedValues };
} else {
  debug('Starting fresh questionnaire', {
    totalQuestions: variables.length
  });
  collectedValues = {};
}
```

**5. File Operations**
```javascript
debug('Reading template file', { path: this.templatePath });
const content = fs.readFileSync(this.templatePath, 'utf8');
debug('Template loaded', { size: content.length, lines: content.split('\n').length });

debug('Writing output file', { path: this.outputPath, size: finalContent.length });
fs.writeFileSync(this.outputPath, finalContent, 'utf8');
debug('File written successfully');
```

**6. Loop Iterations (for critical loops)**
```javascript
debug('Starting variable collection loop', { totalVariables: variables.length });

for (const [index, variable] of variables.entries()) {
  debug(`Processing variable ${index + 1}/${variables.length}`, {
    name: variable.name,
    isPlural: variable.isPlural,
    hasDefault: !!defaults[variable.name]
  });

  // ... processing ...

  debug(`Variable processed`, {
    name: variable.name,
    valueLength: result.value?.length || 0,
    skipped: result.value === null
  });
}

debug('Variable collection complete', { collected: Object.keys(collectedValues).length });
```

**7. Error Context (always log full context)**
```javascript
try {
  await this.generateDocumentation(context);
} catch (error) {
  debug('Documentation generation failed', {
    error: error.message,
    stack: error.stack,
    context: {
      stage: this.stage,
      tokensUsed: this.tokenTracker.getTotal(),
      filesCreated: this.filesCreated.length
    }
  });
  throw error;
}
```

**8. Progress Callbacks**
```javascript
const progressCallback = (message, substep = null, metadata = {}) => {
  debug('Progress update', {
    message,
    substep,
    metadata,
    currentStage: this.stage
  });

  if (substep !== null) {
    this.currentSubstep = substep;
  }
};
```

### Log Level Guidelines

**Use `debug()` for:**
- Execution flow tracking
- Function entry/exit
- State transitions
- API call details
- Decision branches taken
- Loop iterations (critical loops only)
- Variable values at key points

**Use `console.log()` for:**
- User-facing progress messages
- Success confirmations
- File paths created
- Summary information

**Use `console.error()` for:**
- Error messages (user-facing)
- Validation failures
- API errors (after retries exhausted)

**Use `console.warn()` for:**
- Non-critical issues
- Fallback behavior
- Missing optional configuration
- Performance warnings

### Anti-Patterns (DO NOT DO)

**❌ Don't log sensitive data:**
```javascript
// BAD
debug('API call', { apiKey: process.env.ANTHROPIC_API_KEY });

// GOOD
debug('API call', { hasApiKey: !!process.env.ANTHROPIC_API_KEY });
```

**❌ Don't log in tight loops without conditionals:**
```javascript
// BAD - Creates massive log files
for (let i = 0; i < 10000; i++) {
  debug('Processing item', { i });
}

// GOOD - Only log at intervals or thresholds
for (let i = 0; i < 10000; i++) {
  if (i % 1000 === 0) {
    debug('Progress', { processed: i, total: 10000 });
  }
}
```

**❌ Don't use string concatenation with objects:**
```javascript
// BAD
debug('Processing ' + variable.name + ' with ' + variable.isPlural);

// GOOD
debug('Processing variable', { name: variable.name, isPlural: variable.isPlural });
```

**❌ Don't skip error context:**
```javascript
// BAD
try {
  await riskyOperation();
} catch (error) {
  debug('Error occurred');
  throw error;
}

// GOOD
try {
  await riskyOperation();
} catch (error) {
  debug('Operation failed', {
    error: error.message,
    stack: error.stack,
    context: { stage: this.stage, state: this.currentState }
  });
  throw error;
}
```

### Verifying Logs Are Written

**After adding logging:**
1. Run command: `avc /sponsor-call` (or relevant command)
2. Check log file: `.avc/logs/{command}-{timestamp}.log`
3. Verify all debug messages appear with timestamps
4. Confirm execution flow is clear from logs alone

**Example verification:**
```bash
# Run command
cd /path/to/project
avc
/sponsor-call

# Check latest log
ls -lh .avc/logs/sponsor-call-*.log | tail -1

# View log
cat .avc/logs/sponsor-call-2026-02-10-15-30-00.log
```

**Good log file should show:**
- Clear start/end markers
- Function entry/exit points
- Decision branches taken
- API calls with parameters and responses
- State transitions
- File operations
- Error context if failures occur

### Example: Well-Logged Function

```javascript
async function generateProjectContext(collectedValues, progressCallback) {
  debug('Starting generateProjectContext', {
    variableCount: Object.keys(collectedValues).length,
    hasProgressCallback: !!progressCallback
  });

  try {
    // 1. Build context
    debug('Building context from collected values');
    const context = this.buildContext(collectedValues);
    debug('Context built', { contextLength: JSON.stringify(context).length });

    // 2. Get agent instructions
    debug('Loading agent instructions', { agent: 'project-context-generator' });
    const agent = this.getAgentForStage('context');
    debug('Agent loaded', { hasInstructions: !!agent });

    // 3. Call LLM
    debug('Calling LLM for context generation', {
      provider: this._providerName,
      model: this._modelName,
      contextSize: JSON.stringify(context).length
    });

    if (progressCallback) {
      progressCallback('Generating project context...', 'context-generation');
    }

    const response = await this.llmProvider.generateText(
      this.buildContextPrompt(context),
      agent
    );

    debug('LLM response received', {
      responseLength: response.length,
      tokensUsed: this.llmProvider.getTokensUsed()
    });

    // 4. Save to file
    const outputPath = path.join(this.outputDir, 'context.md');
    debug('Writing context file', { path: outputPath, size: response.length });
    fs.writeFileSync(outputPath, response, 'utf8');
    debug('Context file written successfully');

    debug('generateProjectContext completed', {
      outputPath,
      tokensUsed: this.llmProvider.getTokensUsed()
    });

    return response;

  } catch (error) {
    debug('generateProjectContext failed', {
      error: error.message,
      stack: error.stack,
      context: {
        stage: this.stage,
        tokensUsed: this.tokenTracker?.getTotal() || 0
      }
    });
    throw error;
  }
}
```

**Location:** See `template-processor.js` for implementation examples

---

## Development Workflow

### Working on CLI Code

**Location:** `src/` folder

```bash
# Install dependencies
npm install

# Run tests
npm test                    # Run all tests (194 tests)
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:watch          # Watch mode for development
npm run test:coverage       # Generate coverage report

# Run single test file
npm test tests/unit/repl-commands.test.js

# Test CLI locally
node cli/index.js           # Start REPL directly

# Install globally for full testing (recommended)
npm install -g .            # Makes 'avc' command available
avc                         # Run from anywhere
npm install -g .            # Reinstall after code changes
npm uninstall -g @agile-vibe-coding/avc  # Uninstall when done
```

**When modifying CLI:**
1. Make changes to files in `src/cli/`
2. Run tests: `npm test` (all 194 tests must pass)
3. Test manually: `node cli/index.js` or `npm install -g . && avc`
4. Update `COMMANDS.md` if command behavior changes
5. Commit changes when all tests pass

**Test Structure (AAA Pattern):**
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Arrange: Setup
  });

  it('should do something', () => {
    // Arrange
    const input = { /* test data */ };

    // Act
    const result = functionToTest(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Working on Documentation

**Location:** Root level markdown files

```bash
# Edit source files (these are the source of truth)
vim README.md               # Framework overview
vim COMMANDS.md             # CLI commands reference
vim INSTALL.md              # Installation guide
vim CONTRIBUTING.md         # Contributing guide

# Sync and build
npm run docs:sync           # Copy to docs/ with link transformation
npm run docs:build          # Build static site
npm run docs:preview        # Preview at http://localhost:4173

# Or use development mode
npm run docs:dev            # Live reload at http://localhost:5173
```

**IMPORTANT - Documentation Sync:**
- **DO NOT edit files in `docs/` directly** - they are auto-generated
- Edit root markdown files (README.md, COMMANDS.md, etc.)
- Run `npm run docs:sync` to copy to docs/ with transformed links
- Commit both root file and docs/ version

**Link transformation:**
- `](README.md#anchor)` → `](/#anchor)`
- `](COMMANDS.md)` → `](/commands)`
- `](INSTALL.md)` → `](/install)`
- `](CONTRIBUTING.md)` → `](/contribute)`

### Documentation Server Management (build-docs.js)

**Extended Capabilities:**

**Port Management:**
- Reads port from `.avc/avc.json` config (default: 5173 for dev, 4173 for preview)
- Checks port availability before starting server
- Cross-platform port detection (Windows/Linux/macOS)

**Server Verification:**
- HTTP check for AVC-specific metatag to identify AVC documentation servers
- Distinguishes AVC servers from external processes using same port
- Method: `isDocumentationServer(port)` fetches page and checks for `<meta name="avc-documentation">`

**Conflict Resolution:**
- Detects external processes using AVC port
- Identifies process name and PID (cross-platform)
- Prompts user: kill external process or cancel
- Safe kill with error handling

**Cross-Platform Process Detection:**
```javascript
// Windows
const cmd = `netstat -ano | findstr :${port}`;

// Linux/macOS
const cmd = `lsof -i :${port} -t`;
```

**Key Methods:**
- `getPort()` - Read port from config with fallback
- `isPortInUse(port)` - Check port availability
- `isDocumentationServer(port)` - Verify AVC server via HTTP
- `findProcessUsingPort(port)` - Get process details
- `killProcess(pid)` - Cross-platform process termination

**Location in code:** build-docs.js (lines 32-227)

### View Background Processes

The `/processes` (or `/ps`) command shows all background processes managed by AVC:

**Features:**
- Process name, PID, status, uptime
- Last 500 lines of output
- Interactive: Press 'k' to kill process, 'q' to exit viewer
- Auto-refreshes every 2 seconds

**Mode Handling:**
- Sets `mode = 'process-viewer'`
- Preserved during cleanup (like 'kill-confirm')
- Has dedicated input handler for 'k' and 'q' keys

**Location in code:** repl-ink.js:1147-1149 (command), process-viewer UI component

### Working on REPL UI

**Location:** `src/cli/repl-ink.js`

**Critical Rules:**
1. **Output must accumulate** - Use `setOutput(prev => prev + newContent)`, never `setOutput(newContent)`
2. **Mode transitions** - Ensure input handlers check mode with `if (mode !== 'targetMode') return`
3. **Input handler activation** - Use `isActive` parameter: `{ isActive: mode === 'prompt' }`
4. **Error handling** - All error messages must append to output, not replace

**Component Pattern:**
```javascript
const MyComponent = ({ prop1, prop2 }) => {
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'cyan' }, 'Title'),
    React.createElement(Text, null, 'Content')
  );
};
```

**Testing REPL Changes:**
Since REPL requires TTY, automated testing is limited. Always test manually:
```bash
npm install -g .
avc
# Test all modes: prompt, selector (/), questionnaire (/sponsor-call), remove (/remove)
```

---

## Testing

**Framework:** Vitest (v2.1.9)
**Current Count:** 194 tests across 12 test files

```bash
npm test                    # Run all tests
npm run test:coverage       # With coverage report (50% minimum threshold)
npm run test:watch          # Watch mode for TDD
npm test path/to/file.test.js  # Run specific file
```

**Test Organization:**
- `tests/unit/` - Individual module tests (init, logger, providers, commands, questionnaire)
- `tests/integration/` - Component interaction tests (sponsor-call, template processing)
- `tests/helpers/` - Shared test utilities
- `tests/fixtures/` - Test data

**Key Test Files:**
- `repl-commands.test.js` - Command consistency, aliases, help text, unknown command handling
- `questionnaire.test.js` - Multi-line input, auto-save, resume, preview
- `command-logger.test.js` - Log file creation, console interception, cleanup
- `remove-command.test.js` - REPL mode detection, confirmation flow

**All tests must pass before publishing to npm.**

---

## Publishing

### Auto-publish to npm

**GitHub Actions workflow** (`.github/workflows/publish-avc.yml`) automatically publishes when:
1. Version in `src/package.json` changes
2. Push to `master` branch
3. All tests pass

**Manual publish:**
```bash
cd src

# Update version
npm version patch           # 0.1.0 → 0.1.1 (bug fixes)
npm version minor           # 0.1.0 → 0.2.0 (new features)
npm version major           # 0.1.0 → 1.0.0 (breaking changes)

# Publish (runs tests automatically via prepublishOnly)
npm publish

# Push version tag
git push --follow-tags
```

**Package:** `@agile-vibe-coding/avc` on npm registry

### Auto-deploy Documentation

**GitHub Actions workflow** (`.github/workflows/deploy-pages.yml`) automatically deploys when:
1. Documentation files change (README.md, COMMANDS.md, INSTALL.md, CONTRIBUTING.md)
2. Push to `master` branch

Deploys to: https://agilevibecoding.org

---

## Common Development Tasks

### Add New CLI Command

1. **Add to switch statement** in `repl-ink.js` `executeCommand()`:
```javascript
case '/newcmd':
case '/nc':  // Add alias
  setExecutingMessage('Running new command...');
  await runNewCommand();
  break;
```

2. **Add to command lists:**
- `allCommands` array (for tab completion) in `repl-ink.js`
- `commandGroups` array (for interactive menu) in `CommandSelector` component
- `resolveAlias` function (if adding alias)

3. **Implement command function with initialization check:**
```javascript
const runNewCommand = async () => {
  const initiator = new ProjectInitiator();

  // IMPORTANT: Check if project is initialized (except for /init, /help, /version, /exit)
  // A project is considered initialized when:
  // - .avc/ folder exists (initiator.hasAvcFolder())
  // - .avc/avc.json config file exists (initiator.hasAvcConfig())
  // - Both checks combined: initiator.isAvcProject()
  if (!initiator.isAvcProject()) {
    setOutput(prev => prev + '\n❌ Project not initialized\n\n');
    setOutput(prev => prev + '   Please run /init first to create the project structure.\n\n');
    return;
  }

  // Capture console output
  const originalLog = console.log;
  let logs = [];
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await initiator.newCommand();
  } finally {
    console.log = originalLog;
  }

  setOutput(prev => prev + logs.join('\n') + '\n');
};
```

**Commands that MUST check initialization:**
- `/sponsor-call` (or `/sc`) - Requires .avc structure to save progress and documents
- `/status` (or `/s`) - Shows project status, needs .avc folder to report on
- `/remove` (or `/rm`) - Removes .avc structure, needs to check it exists
- Any future commands that work with project files or configuration

**Commands that SKIP initialization check:**
- `/init` (or `/i`) - Creates the project structure
- `/help` (or `/h`) - Shows help, works anywhere
- `/version` (or `/v`) - Shows version, works anywhere
- `/exit` (or `/q`, `/quit`) - Exits REPL, works anywhere
- `/restart` - Restarts REPL, works anywhere

4. **Add command to `init.js`** if it needs project initialization logic

5. **Update `COMMANDS.md`** with command documentation

6. **Add tests** in `tests/unit/` or `tests/integration/`

7. **Update `repl-commands.test.js`** to include new command in expected lists

### Implement Safe Destructive Operations

**Pattern:** Multi-layer safety for operations that delete data or kill processes.

**Requirements:**
1. **Detailed Preview** - Show exactly what will be affected
2. **Exact String Confirmation** - Require typing "delete all" or "confirm", not "y" or "yes"
3. **Visual Separation** - Use borders, colors, warnings
4. **Preserve Critical Data** - Never delete credentials or user configs
5. **No Silent Mode** - Always require interactive confirmation

**Example (/remove command):**
```javascript
// 1. Show detailed preview
console.log('⚠️  WARNING: This is a DESTRUCTIVE operation!\n');
console.log('The following will be PERMANENTLY DELETED:\n');
console.log('📁 .avc/ folder contents:');
listAllFiles('.avc').forEach(f => console.log(`   • ${f}`));
console.log('\nℹ️  Note: The .env file will NOT be deleted.');

// 2. Interactive confirmation in REPL
setRemoveConfirmActive(true);
setRemoveConfirmInput('');

// 3. Validate exact string
useInput((inputChar, key) => {
  if (!removeConfirmActive) return;

  if (key.return) {
    if (removeConfirmInput === 'delete all') {  // Exact match required
      performDeletion();
    } else {
      console.log('❌ Cancelled - confirmation did not match.');
    }
    setRemoveConfirmActive(false);
  }

  // Allow typing and backspace
  if (key.backspace) {
    setRemoveConfirmInput(prev => prev.slice(0, -1));
  } else if (inputChar) {
    setRemoveConfirmInput(prev => prev + inputChar);
  }
}, { isActive: removeConfirmActive });

// 4. Preserve critical files
const filesToPreserve = ['.env', 'avc.json'];
// Delete only non-critical files
```

**Why "delete all" instead of "yes":**
- Harder to type accidentally
- No auto-complete interference
- Clear intent from user
- Not a common word that might be typed by mistake

**Location in code:** repl-ink.js:1936-1973 (remove confirmation)

### Add Interactive Confirmation Dialog

Follow the `/remove` command pattern:

1. **Add state variables:**
```javascript
const [myConfirmActive, setMyConfirmActive] = useState(false);
const [myConfirmInput, setMyConfirmInput] = useState('');
```

2. **Create confirmation component:**
```javascript
const MyConfirmation = ({ confirmInput }) => {
  return React.createElement(Box, { flexDirection: 'column', marginY: 1 },
    React.createElement(Text, { bold: true, color: 'red' }, '\n⚠️ Warning Message\n'),
    React.createElement(Box, { borderStyle: 'round', borderColor: 'yellow', paddingX: 1 },
      React.createElement(Text, { bold: true }, 'Type "confirm" to proceed')
    ),
    React.createElement(Text, null, `Input: ${confirmInput}`)
  );
};
```

3. **Add input handler:**
```javascript
useInput((inputChar, key) => {
  if (!myConfirmActive) return;

  if (key.return) {
    if (myConfirmInput === 'confirm') {
      confirmAction();
    } else {
      cancelAction();
    }
    return;
  }

  if (key.backspace) {
    setMyConfirmInput(myConfirmInput.slice(0, -1));
    return;
  }

  if (inputChar) {
    setMyConfirmInput(myConfirmInput + inputChar);
  }
}, { isActive: myConfirmActive });
```

4. **Update render logic** to show confirmation when active

### Add New LLM Provider

1. **Create provider file** `src/cli/llm-[provider].js`:
```javascript
export class ProviderNameProvider {
  constructor() {
    this.apiKey = process.env.PROVIDER_API_KEY;
    // Initialize SDK
  }

  async generateSuggestions(context, variable, isPlural) {
    // Implement suggestion generation
  }

  async enhanceDocument(content) {
    // Implement document enhancement
  }
}
```

2. **Update factory** in `llm-provider.js`:
```javascript
case 'providername':
  return new ProviderNameProvider();
```

3. **Add to package.json dependencies:**
```json
"dependencies": {
  "@provider/sdk": "^1.0.0"
}
```

4. **Add tests** in `tests/unit/llm-[provider].test.js`

5. **Update documentation** with API key setup instructions

---

## Important Notes

### This is NOT a Sample Application

- This repository IS the framework/CLI tool itself
- Users install via `npm install -g @agile-vibe-coding/avc`
- Users run in their own projects, not in this repo
- Don't add sample project code here

### Framework Philosophy

AVC provides organizational structure for long-term AI-assisted development:

- **Hierarchical work items:** Epic → Story → Task → Subtask
- **Context inheritance:** Each level has `context.md` for scope
- **LLM-powered ceremonies:** Starting with Sponsor Call for project definition
- **Multi-model support:** Claude and Gemini (extensible to more)
- **Verification-focused:** Work items include validation tests

### Critical Implementation Constraints

1. **REPL Output Must Scroll** - Never clear output, always append
2. **Mode-Based Input** - Each mode needs its own useInput handler
3. **Project Initialization Guard** - All commands except `/init` must check `isAvcProject()`
4. **Logger Conditional Creation** - Only create logger if `.avc` exists (or for `/init`)
5. **Documentation Sync** - Edit root MD files, never `docs/` directly
6. **Console Output Formatting** - All console.log messages must be **fully left-aligned** with NO leading tabs or spaces (command-line style)
7. **Temporary Files Organization** - All temporary/planning/work markdown files MUST be created in `_temp/` folder, NOT in root. Root should only contain: CLAUDE.md, README.md, COMMANDS.md, INSTALL.md, CONTRIBUTING.md, LICENSE

### File Organization Rules

**Root Directory (documentation only):**
- `CLAUDE.md` - Project instructions for Claude Code
- `README.md` - Main project documentation (synced to docs/index.md)
- `COMMANDS.md` - CLI reference (synced to docs/commands.md)
- `INSTALL.md` - Installation guide (synced to docs/install.md)
- `CONTRIBUTING.md` - Contributor guide (synced to docs/contribute.md)
- `LICENSE` - MIT license

**_temp/ Directory (temporary/planning files):**
- All implementation plans, checklists, summaries
- All analysis documents, reports, strategies
- All workflow documentation
- Any markdown files created during development
- Examples: `IMPLEMENTATION_PLAN.md`, `AGENT_VERIFICATION_REPORT.md`, `WORKFLOW.md`

**IMPORTANT:** When Claude creates temporary markdown files for planning, tracking, or analysis:
1. Always create them in `_temp/` directory
2. Never create planning files in root
3. If a temporary file exists in root, move it to `_temp/`
4. Use descriptive ALL_CAPS names with underscores (e.g., `FEATURE_IMPLEMENTATION_PLAN.md`)

---

## Version

CLI Version: 0.1.0
Test Count: 194 tests (12 files)
Documentation: https://agilevibecoding.org
Last Updated: 2026-02-02
