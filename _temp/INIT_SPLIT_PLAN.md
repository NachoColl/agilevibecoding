# Plan: Split /init Command to Resolve Circular Dependency

**Date:** 2026-01-29
**Status:** PLANNING
**Estimated effort:** 6-8 hours

---

## Executive Summary

**What's changing:**
1. Split `/init` into two commands: `/init` (setup) + `/sponsor-call` (ceremony)
2. Add smart merge logic for `avc.json` to preserve user customizations during CLI updates
3. Document `.env` file preservation behavior

**Why:**
- Resolves circular dependency: Users can't add API keys to `.env` that doesn't exist yet
- Enables seamless CLI updates without breaking user configurations
- Clearer separation: setup vs AI ceremony

**Impact:**
- Zero breaking changes for existing users
- Better UX for new users
- Forward-compatible configuration management

---

## Problem Statement

### Current Circular Dependency

Users face a confusing workflow that creates a circular dependency:

1. **Documentation says:** "You must configure API keys BEFORE using AVC"
2. **But:** The `/init` command creates the `.env` file
3. **And:** The `/init` command requires API keys to run the Sponsor Call ceremony

**The problem:** Users cannot add API keys to a `.env` file that doesn't exist yet, but they cannot run `/init` to create the `.env` file without having API keys already configured.

### Current User Experience (Broken)

```
User: Installs AVC
  ↓
User: Runs `avc`
  ↓
User: Runs `/init`
  ↓
System: Creates .env file
System: Validates API key
  ↓
❌ ERROR: ANTHROPIC_API_KEY not found in .env file
  ↓
User: Confused - "How do I add keys to a file that was just created?"
```

---

## Proposed Solution

Split `/init` into two separate commands:

### 1. `/init` - Project Setup (No API Keys Required)

Creates the basic project structure without any LLM calls:

- Create `.avc/` folder
- Create `.avc/avc.json` config file
- Create `.env` file with placeholders
- Add `.env` to `.gitignore`
- Display next steps message

**No API key validation. No LLM calls. Just file creation.**

### 2. `/sponsor-call` - Run Sponsor Call Ceremony (Requires API Keys)

Runs the AI-powered interactive questionnaire:

- Validate API keys (fail if not present)
- Load/resume questionnaire progress
- Collect 5 project inputs (with AI suggestions)
- Generate project document via LLM
- Save to `.avc/project/doc.md`

**Requires API keys. Makes LLM calls. Generates documentation.**

### 3. Additional Requirements: Smart File Handling

#### `.env` File Preservation

**Requirement:** The `.env` file must NEVER be deleted or overwritten if it already exists.

**Rationale:** Users may have already configured API keys. Running `/init` again (e.g., after updating the CLI) should not delete their keys.

**Implementation:** Already implemented correctly in `createEnvFile()` - just needs documentation.

#### `avc.json` Merge Logic

**Requirement:** When `avc.json` exists, merge new attributes from CLI updates while preserving user customizations.

**Rationale:** Users may have customized their configuration (changed providers, modified context scopes, etc.). CLI updates should add new features without breaking existing customizations.

**Implementation:** New `deepMerge()` utility that:
- Adds new keys that don't exist in user's config
- Preserves existing values (never overwrites user changes)
- Recursively merges nested objects
- Tracks CLI version in `avcVersion` field
- Adds `updated` timestamp when changes are made

**Example scenario:**
```
User has v0.0.9 config → Updates CLI to v0.1.0 → Runs /init
Result: New 'ceremonies' array added, user's custom 'contextScopes' preserved
```

**Benefits:**
- Seamless CLI updates without manual config migration
- User customizations never lost
- New features automatically available
- Backward compatibility maintained

---

## New User Experience (Fixed)

```
User: Installs AVC
  ↓
User: Runs `avc`
  ↓
User: Runs `/init`
  ↓
System: Creates .env file (with placeholders)
System: Creates .avc/avc.json
System: Adds .env to .gitignore
  ↓
✅ Project setup complete!

   Next steps:
   1. Open .env file and add your API key
   2. Run /sponsor-call to define your project
  ↓
User: Opens .env and adds ANTHROPIC_API_KEY=sk-ant-...
  ↓
User: Runs `/sponsor-call`
  ↓
System: Validates API key ✓
System: Runs interactive questionnaire
System: Generates project document
  ↓
✅ Project initialized successfully!
```

---

## Detailed Changes Required

### 1. Code Changes

#### File: `src/cli/init.js`

**Current structure:**
```javascript
class ProjectInitiator {
  async init() {
    // Creates .avc/, avc.json, .env
    // Validates API key
    // Runs sponsor call ceremony
    // Generates project document
  }
}
```

**New structure:**
```javascript
class ProjectInitiator {
  /**
   * Setup project structure only (no LLM calls)
   */
  async init() {
    // Create .avc/ folder
    // Create avc.json
    // Create .env file
    // Add to .gitignore
    // Display "run /sponsor-call next" message
    // NO API key validation
    // NO ceremony execution
  }

  /**
   * Run Sponsor Call ceremony (requires API keys)
   */
  async sponsorCall() {
    // Check if init was run first
    // Validate API keys (fail if missing)
    // Load/resume progress
    // Run questionnaire
    // Generate project document
  }
}
```

**Specific changes:**

1. **Remove from `init()` method:**
   - Line 336-342: API key validation
   - Line 344-357: Progress initialization for ceremony
   - Line 359-363: Ceremony execution and cleanup

2. **Create new `sponsorCall()` method:**
   - Move API key validation here
   - Move progress management here
   - Move `generateProjectDocument()` call here
   - Add prerequisite check: require `.avc/avc.json` to exist

3. **Update `createEnvFile()` method (lines 114-132):**

   **Current behavior (ALREADY CORRECT):**
   ```javascript
   createEnvFile() {
     const envPath = path.join(this.projectRoot, '.env');

     if (!fs.existsSync(envPath)) {
       // Create new .env file
       fs.writeFileSync(envPath, envContent, 'utf8');
       console.log('✓ Created .env file for API keys');
       return true;
     }
     console.log('✓ .env file already exists');
     return false;  // PRESERVES EXISTING FILE
   }
   ```

   **No changes needed** - The method already preserves existing `.env` files and only creates new ones if they don't exist. This ensures user API keys are never deleted.

4. **Update `createAvcConfig()` method (lines 66-97) - MERGE LOGIC:**

   **Current behavior (NEEDS CHANGE):**
   ```javascript
   createAvcConfig() {
     if (!this.hasAvcConfig()) {
       // Create new config
       fs.writeFileSync(this.avcConfigPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
       console.log('✓ Created .avc/avc.json configuration file');
       return true;
     }
     console.log('✓ .avc/avc.json already exists');
     return false;  // SKIPS - NO MERGE
   }
   ```

   **New behavior (MERGE NEW ATTRIBUTES):**
   ```javascript
   /**
    * Get the current AVC package version
    */
   getAvcVersion() {
     const packagePath = path.join(__dirname, '../package.json');
     const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
     return packageJson.version;
   }

   /**
    * Deep merge objects - adds new keys, preserves existing values
    */
   deepMerge(target, source) {
     const result = { ...target };

     for (const key in source) {
       if (source.hasOwnProperty(key)) {
         if (key in result) {
           // Key exists in target
           if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
             // Recursively merge objects
             result[key] = this.deepMerge(result[key], source[key]);
           }
           // else: Keep existing value (don't overwrite)
         } else {
           // New key - add it
           result[key] = source[key];
         }
       }
     }

     return result;
   }

   /**
    * Create or update avc.json with default settings
    * Merges new attributes from version updates while preserving existing values
    */
   createAvcConfig() {
     const defaultConfig = {
       version: '1.0.0',
       avcVersion: this.getAvcVersion(),  // Track AVC CLI version
       projectName: this.getProjectName(),
       framework: 'avc',
       created: new Date().toISOString(),
       settings: {
         contextScopes: ['epic', 'story', 'task', 'subtask'],
         workItemStatuses: ['ready', 'pending', 'implementing', 'implemented', 'testing', 'completed', 'blocked', 'feedback'],
         agentTypes: ['product-owner', 'server', 'client', 'infrastructure', 'testing'],
         ceremonies: [
           {
             name: 'sponsor-call',
             defaultModel: 'claude-sonnet-4-5-20250929',
             provider: 'claude'
           }
         ]
       }
     };

     if (!this.hasAvcConfig()) {
       // Create new config
       fs.writeFileSync(
         this.avcConfigPath,
         JSON.stringify(defaultConfig, null, 2),
         'utf8'
       );
       console.log('✓ Created .avc/avc.json configuration file');
       return true;
     }

     // Config exists - check for merge
     try {
       const existingConfig = JSON.parse(fs.readFileSync(this.avcConfigPath, 'utf8'));

       // Merge: add new keys, keep existing values
       const mergedConfig = this.deepMerge(existingConfig, defaultConfig);

       // Update avcVersion to track CLI version
       mergedConfig.avcVersion = this.getAvcVersion();
       mergedConfig.updated = new Date().toISOString();

       // Check if anything changed
       const existingJson = JSON.stringify(existingConfig, null, 2);
       const mergedJson = JSON.stringify(mergedConfig, null, 2);

       if (existingJson !== mergedJson) {
         fs.writeFileSync(this.avcConfigPath, mergedJson, 'utf8');
         console.log('✓ Updated .avc/avc.json with new configuration attributes');
         return true;
       }

       console.log('✓ .avc/avc.json is up to date');
       return false;
     } catch (error) {
       console.error(`⚠️  Warning: Could not merge avc.json: ${error.message}`);
       console.log('✓ .avc/avc.json already exists (merge skipped)');
       return false;
     }
   }
   ```

   **Merge behavior examples:**

   **Example 1: User has old config without `ceremonies` array**
   ```javascript
   // Existing config (v0.0.9)
   {
     "version": "1.0.0",
     "projectName": "my-app",
     "settings": {
       "contextScopes": ["epic", "story", "task"],
       "model": "claude-sonnet-4-5-20250929"  // Old format
     }
   }

   // After merge (adds ceremonies, keeps existing)
   {
     "version": "1.0.0",
     "avcVersion": "0.1.0",
     "projectName": "my-app",
     "framework": "avc",  // NEW
     "created": "2026-01-15T10:00:00.000Z",  // NEW
     "updated": "2026-01-29T12:00:00.000Z",  // NEW
     "settings": {
       "contextScopes": ["epic", "story", "task"],  // PRESERVED (not overwritten)
       "model": "claude-sonnet-4-5-20250929",  // PRESERVED
       "workItemStatuses": [...],  // NEW
       "agentTypes": [...],  // NEW
       "ceremonies": [...]  // NEW
     }
   }
   ```

   **Example 2: User has custom ceremony configuration**
   ```javascript
   // Existing config
   {
     "settings": {
       "ceremonies": [
         {
           "name": "sponsor-call",
           "provider": "gemini",  // User changed to Gemini
           "defaultModel": "gemini-2.5-pro"  // User changed model
         }
       ]
     }
   }

   // After merge (preserves user customizations)
   {
     "settings": {
       "ceremonies": [
         {
           "name": "sponsor-call",
           "provider": "gemini",  // PRESERVED
           "defaultModel": "gemini-2.5-pro"  // PRESERVED
         }
       ]
     }
   }
   ```

5. **Update `init()` success message:**
   ```javascript
   console.log('\n✅ AVC project structure created successfully!\n');
   console.log('Next steps:');
   console.log('  1. Open .env file and add your API key(s)');
   console.log('     • ANTHROPIC_API_KEY for Claude');
   console.log('     • GEMINI_API_KEY for Gemini');
   console.log('  2. Run /sponsor-call to define your project\n');
   ```

6. **Update CLI execution block (line 397-412):**
   ```javascript
   switch (command) {
     case 'init':
       initiator.init();
       break;
     case 'sponsor-call':
       initiator.sponsorCall();
       break;
     case 'status':
       initiator.status();
       break;
     default:
       console.log('Unknown command. Available: init, sponsor-call, status');
       process.exit(1);
   }
   ```

#### File: `src/cli/repl-ink.js`

**Changes needed:**

1. **Add `/sponsor-call` command** (around line 130-150 where commands are defined):
   ```javascript
   {
     id: 'sponsor-call',
     label: '/sponsor-call',
     description: 'Run Sponsor Call ceremony to define project',
     category: 'Project Setup'
   }
   ```

2. **Add command execution** (around line 336-500 in `executeCommand` function):
   ```javascript
   case '/sponsor-call':
   case '/sc':  // alias
     setLoading(true);
     try {
       const { ProjectInitiator } = await import('./init.js');
       const initiator = new ProjectInitiator();
       await initiator.sponsorCall();
     } catch (error) {
       console.log(`\n❌ Error: ${error.message}\n`);
     } finally {
       setLoading(false);
       addToHistory(command);
     }
     break;
   ```

3. **Update `/init` execution** (currently runs full ceremony):
   ```javascript
   case '/init':
   case '/i':  // alias
     setLoading(true);
     try {
       const { ProjectInitiator } = await import('./init.js');
       const initiator = new ProjectInitiator();
       await initiator.init();  // Now only creates structure
     } catch (error) {
       console.log(`\n❌ Error: ${error.message}\n`);
     } finally {
       setLoading(false);
       addToHistory(command);
     }
     break;
   ```

#### File: `src/cli/template-processor.js`

**No changes required** - This file is only called during the ceremony, which is now in `sponsorCall()` method. The logic remains the same.

---

### 2. Documentation Changes

#### File: `INSTALL.md`

**Current text (lines 21-56):**
```markdown
## API Keys Required

AVC uses LLM providers to power ceremonies and generate project documentation. **You must configure API keys** for the providers you plan to use.

### Setting Up API Keys

When you run `/init` for the first time, AVC creates a `.env` file in your project directory with placeholders:
```

**New text:**
```markdown
## API Keys Required

AVC uses LLM providers to power the Sponsor Call ceremony and generate project documentation. API keys are **not required** for initial project setup, but **are required** when running the Sponsor Call ceremony.

### Setting Up API Keys

When you run `/init`, AVC creates a `.env` file in your project directory with placeholders:

```env
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

**Steps:**

1. Run `/init` to create the project structure and `.env` file
2. Open the `.env` file in your project directory
3. Add your API key(s) for the provider(s) you want to use
4. Save the file
5. Run `/sponsor-call` to define your project with AI assistance

**Example:**

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
GEMINI_API_KEY=AIzaSy-your-gemini-key-here
```

> **Note:** You only need to configure keys for the providers you're actually using. Check your `.avc/avc.json` file to see which provider is configured for the Sponsor Call ceremony.
```

**Changes:**
- Clarify that API keys are NOT required for `/init`
- Clarify that API keys ARE required for `/sponsor-call`
- Add step-by-step workflow: init → add keys → sponsor-call

#### File: `COMMANDS.md`

**Current structure:**
```markdown
# CLI Commands

## /init

Initialize an AVC project by running the Sponsor Call ceremony.

### What it does

1. Creates the `.avc/` directory
2. Writes `.avc/avc.json`
3. Creates a `.env` file
4. Adds `.env` to `.gitignore`
5. Launches an interactive questionnaire...
```

**New structure:**
```markdown
# CLI Commands

## /init

Create AVC project structure and configuration files.

### What it does

1. Creates the `.avc/` directory in the current working directory
2. Creates or updates `.avc/avc.json`:
   - **New project:** Creates default configuration with all settings
   - **Existing project:** Merges new attributes from CLI updates while preserving user customizations
   - Example: If a new CLI version adds `ceremonies` array, it's added to your config without overwriting your custom `contextScopes` or `agentTypes`
3. Creates `.env` file (if it doesn't exist):
   - **Preserves existing `.env`:** If you already have API keys configured, they are never deleted or overwritten
   - **Creates with placeholders:** If no `.env` exists, creates one with empty `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` entries
4. Adds `.env` to `.gitignore` (if the directory is a git repository)

**This command does NOT require API keys and does NOT make any LLM calls.**

### Smart merge behavior

When running `/init` on an existing project (e.g., after updating the AVC CLI), the command intelligently merges new configuration options:

**Example 1:** You updated from v0.0.9 (before `ceremonies`) to v0.1.0 (with `ceremonies`):

```json
// Your existing avc.json (v0.0.9)
{
  "projectName": "my-app",
  "settings": {
    "contextScopes": ["epic", "story"],  // Your customization
    "model": "claude-opus-4-5-20251101"
  }
}

// After running /init (merged with v0.1.0 defaults)
{
  "projectName": "my-app",  // ✓ Preserved
  "framework": "avc",  // ✓ Added
  "avcVersion": "0.1.0",  // ✓ Added
  "settings": {
    "contextScopes": ["epic", "story"],  // ✓ Your customization preserved
    "model": "claude-opus-4-5-20251101",  // ✓ Preserved
    "ceremonies": [...],  // ✓ New attribute added
    "workItemStatuses": [...],  // ✓ New attribute added
    "agentTypes": [...]  // ✓ New attribute added
  }
}
```

**Example 2:** You changed the Sponsor Call ceremony to use Gemini:

```json
// Your customization
{
  "settings": {
    "ceremonies": [{
      "name": "sponsor-call",
      "provider": "gemini",  // You changed this
      "defaultModel": "gemini-2.5-pro"  // You changed this
    }]
  }
}

// After running /init - your changes preserved
{
  "settings": {
    "ceremonies": [{
      "name": "sponsor-call",
      "provider": "gemini",  // ✓ Still Gemini
      "defaultModel": "gemini-2.5-pro"  // ✓ Still your model
    }]
  }
}
```

**Result:** Your customizations are never overwritten. New CLI features are automatically added to your config.

### Output

On success, the command prints:

```
✅ AVC project structure created successfully!

Next steps:
  1. Open .env file and add your API key(s)
     • ANTHROPIC_API_KEY for Claude
     • GEMINI_API_KEY for Gemini
  2. Run /sponsor-call to define your project
```

### Already initialized

If you run `/init` in a directory that already has `.avc/avc.json`, the command will skip initialization and display:

```
✓ AVC project already initialized

Project is ready to use.
```

---

## /sponsor-call

Run the [**Sponsor Call** ceremony](README.md#sponsor-call-project-initialization) to define your project with AI assistance.

**Prerequisite:** You must run `/init` first and configure API keys in `.env` file.

### What it does

1. Validates that API keys are configured in `.env` file
2. Checks the configured LLM provider from `.avc/avc.json`
3. Launches an interactive questionnaire that collects five core project inputs:

| # | Variable | Plural? | Description |
|---|----------|---------|-------------|
| 1 | Mission Statement | No | Core purpose and value proposition of the application |
| 2 | Target Users | Yes | User types and their roles |
| 3 | Initial Scope | No | Key features, main workflows, and essential capabilities |
| 4 | Technical Considerations | Yes | Technology stack, constraints, or preferences |
| 5 | Security & Compliance Requirements | Yes | Regulatory, privacy, or security constraints |

4. Skipped questions are filled automatically by the configured LLM provider (AI suggestion)
5. After all inputs are collected, the LLM enhances the raw template into a structured project definition document
6. The final document is saved to `.avc/project/doc.md`

### Resumability

If the process is interrupted (e.g., the terminal is closed mid-questionnaire), `/sponsor-call` detects the incomplete state on next run and resumes from the last answered question.

### Multi-provider support

The LLM provider used during the ceremony is governed by the first entry in the `ceremonies` array of `.avc/avc.json`:

```json
{
  "settings": {
    "ceremonies": [
      {
        "name": "sponsor-call",
        "defaultModel": "claude-sonnet-4-5-20250929",
        "provider": "claude"
      }
    ]
  }
}
```

Supported providers:

| Provider | Config value | Default model | Required env var |
|----------|-------------|---------------|------------------|
| Anthropic Claude | `claude` | `claude-sonnet-4-5-20250929` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini` | `gemini-2.5-flash` | `GEMINI_API_KEY` |

To switch providers, update `provider` and `defaultModel` in `avc.json` and ensure the matching API key is set in `.env`.

### Output

On success, the command prints:

```
✅ Project defined successfully!

Next steps:
  1. Review .avc/project/doc.md for your project definition
  2. Review .avc/avc.json configuration
  3. Create your project context and work items
  4. Use AI agents to implement features
```

### Error: No API key

If you haven't configured API keys in `.env`, you'll see:

```
❌ API Key Validation Failed

   ANTHROPIC_API_KEY not found in .env file.

   Steps to fix:
   1. Open .env file in the current directory
   2. Add your API key: ANTHROPIC_API_KEY=your-key-here
   3. Save the file and run /sponsor-call again

   Get your API key:
   • https://console.anthropic.com/settings/keys
```

### Error: Project not initialized

If you run `/sponsor-call` before running `/init`, you'll see:

```
❌ Project not initialized

   Please run /init first to create the project structure.
```

---

## Command aliases

| Alias | Expands to |
|-------|-----------|
| `/i` | `/init` |
| `/sc` | `/sponsor-call` |
| `/s` | `/status` |
| `/h` | `/help` |
| `/v` | `/version` |
| `/q` or `/quit` | `/exit` |
```

**Changes:**
- Split `/init` documentation into two sections
- Remove ceremony execution from `/init` description
- Create new `/sponsor-call` section with full details
- Add prerequisite checks
- Add error messages
- Update command aliases table

#### File: `README.md`

**Section to update:** "Sponsor Call (Project Initialization)" (around lines 135-150)

**Current text:**
```markdown
#### **Sponsor Call** (Project Initialization)

The Sponsor Call ceremony is manually triggered and is the first ceremony, which defines the project vision and initial scope. This ceremony uses an AI-powered interactive questionnaire to create an initial documentation, which once validated will be used by the next ceremony for creating first work items.
```

**New text:**
```markdown
#### **Sponsor Call** (Project Initialization)

The Sponsor Call ceremony is the first ceremony that defines the project vision and initial scope. This ceremony uses an AI-powered interactive questionnaire to create initial documentation, which will be used by subsequent ceremonies for creating work items.

**Two-step process:**

1. **Setup project structure** (`/init`):
   - Creates `.avc/` folder and configuration files
   - Creates `.env` file for API keys
   - No AI/LLM calls, no API keys required

2. **Run Sponsor Call ceremony** (`/sponsor-call`):
   - Interactive questionnaire with AI assistance
   - Generates project definition document
   - Requires API keys to be configured

This separation allows users to set up the project structure first, configure their API keys, and then run the AI-powered ceremony.
```

**Changes:**
- Clarify two-step process
- Add command references
- Explain why the split is beneficial

---

### 3. Test Changes

#### File: `src/tests/unit/init.test.js`

**Changes needed:**

1. **Split existing tests** into two suites:
   - `describe('init()', ...)` - Tests for structure creation only
   - `describe('sponsorCall()', ...)` - Tests for ceremony execution

2. **Update `init()` tests** (lines 1-200):
   - Remove API key validation expectations
   - Remove ceremony execution expectations
   - Add test: "does not call validateProviderApiKey"
   - Add test: "does not call generateProjectDocument"
   - Update success message expectation

3. **Add new tests for `.env` file preservation**:
   ```javascript
   describe('createEnvFile()', () => {
     it('creates .env file if it does not exist', () => {
       const initiator = new ProjectInitiator(testDir);

       // .env doesn't exist
       expect(fs.existsSync(path.join(testDir, '.env'))).toBe(false);

       initiator.createEnvFile();

       // .env created
       expect(fs.existsSync(path.join(testDir, '.env'))).toBe(true);
       const content = fs.readFileSync(path.join(testDir, '.env'), 'utf8');
       expect(content).toContain('ANTHROPIC_API_KEY=');
       expect(content).toContain('GEMINI_API_KEY=');
     });

     it('preserves existing .env file with user keys', () => {
       const initiator = new ProjectInitiator(testDir);
       const envPath = path.join(testDir, '.env');

       // Create .env with user's API keys
       const userEnv = 'ANTHROPIC_API_KEY=sk-ant-user-key-123\nMY_CUSTOM_VAR=foo\n';
       fs.writeFileSync(envPath, userEnv, 'utf8');

       initiator.createEnvFile();

       // Verify user's keys are preserved
       const content = fs.readFileSync(envPath, 'utf8');
       expect(content).toBe(userEnv);  // Exact same content
       expect(content).toContain('sk-ant-user-key-123');
       expect(content).toContain('MY_CUSTOM_VAR=foo');
     });
   });
   ```

4. **Add new tests for `avc.json` merge logic**:
   ```javascript
   describe('createAvcConfig() - merge behavior', () => {
     it('creates new config if it does not exist', () => {
       const initiator = new ProjectInitiator(testDir);

       initiator.createAvcConfig();

       const config = JSON.parse(fs.readFileSync(initiator.avcConfigPath, 'utf8'));
       expect(config.version).toBe('1.0.0');
       expect(config.projectName).toBeDefined();
       expect(config.settings.ceremonies).toBeDefined();
     });

     it('merges new attributes from CLI update', () => {
       const initiator = new ProjectInitiator(testDir);

       // User has old config without ceremonies
       const oldConfig = {
         version: '1.0.0',
         projectName: 'my-app',
         created: '2026-01-15T10:00:00.000Z',
         settings: {
           contextScopes: ['epic', 'story'],  // User customized
           model: 'claude-opus-4-5-20251101'  // Old format
         }
       };
       fs.mkdirSync(initiator.avcDir, { recursive: true });
       fs.writeFileSync(initiator.avcConfigPath, JSON.stringify(oldConfig, null, 2), 'utf8');

       // Run createAvcConfig (should merge)
       const changed = initiator.createAvcConfig();
       expect(changed).toBe(true);

       const merged = JSON.parse(fs.readFileSync(initiator.avcConfigPath, 'utf8'));

       // Verify new attributes added
       expect(merged.framework).toBe('avc');
       expect(merged.avcVersion).toBeDefined();
       expect(merged.updated).toBeDefined();
       expect(merged.settings.ceremonies).toBeDefined();
       expect(merged.settings.workItemStatuses).toBeDefined();
       expect(merged.settings.agentTypes).toBeDefined();

       // Verify existing attributes preserved
       expect(merged.projectName).toBe('my-app');
       expect(merged.created).toBe('2026-01-15T10:00:00.000Z');
       expect(merged.settings.contextScopes).toEqual(['epic', 'story']);  // User's custom value
       expect(merged.settings.model).toBe('claude-opus-4-5-20251101');  // User's old format kept
     });

     it('preserves user customizations in ceremonies', () => {
       const initiator = new ProjectInitiator(testDir);

       // User changed provider to Gemini
       const customConfig = {
         version: '1.0.0',
         projectName: 'my-app',
         settings: {
           ceremonies: [
             {
               name: 'sponsor-call',
               provider: 'gemini',  // User customized
               defaultModel: 'gemini-2.5-pro'  // User customized
             }
           ]
         }
       };
       fs.mkdirSync(initiator.avcDir, { recursive: true });
       fs.writeFileSync(initiator.avcConfigPath, JSON.stringify(customConfig, null, 2), 'utf8');

       // Run createAvcConfig (should merge without overwriting)
       initiator.createAvcConfig();

       const merged = JSON.parse(fs.readFileSync(initiator.avcConfigPath, 'utf8'));

       // Verify user's ceremony config preserved
       expect(merged.settings.ceremonies[0].provider).toBe('gemini');
       expect(merged.settings.ceremonies[0].defaultModel).toBe('gemini-2.5-pro');
     });

     it('does not modify config if already up to date', () => {
       const initiator = new ProjectInitiator(testDir);

       // First run - creates config
       initiator.createAvcConfig();

       const before = fs.readFileSync(initiator.avcConfigPath, 'utf8');
       const beforeTime = fs.statSync(initiator.avcConfigPath).mtimeMs;

       // Wait a bit
       const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
       await wait(100);

       // Second run - should not modify
       const changed = initiator.createAvcConfig();
       expect(changed).toBe(false);

       const after = fs.readFileSync(initiator.avcConfigPath, 'utf8');
       const afterTime = fs.statSync(initiator.avcConfigPath).mtimeMs;

       // Verify file not modified (except avcVersion which always updates)
       expect(afterTime).toBeGreaterThan(beforeTime);  // Timestamp updated

       const beforeConfig = JSON.parse(before);
       const afterConfig = JSON.parse(after);
       delete beforeConfig.avcVersion;
       delete beforeConfig.updated;
       delete afterConfig.avcVersion;
       delete afterConfig.updated;
       expect(afterConfig).toEqual(beforeConfig);
     });

     it('handles corrupt config file gracefully', () => {
       const initiator = new ProjectInitiator(testDir);

       // Write corrupt JSON
       fs.mkdirSync(initiator.avcDir, { recursive: true });
       fs.writeFileSync(initiator.avcConfigPath, '{invalid json', 'utf8');

       // Should not crash
       const consoleSpy = vi.spyOn(console, 'error');
       const changed = initiator.createAvcConfig();

       expect(changed).toBe(false);
       expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Could not merge avc.json'));
     });
   });

   describe('deepMerge()', () => {
     it('adds new keys from source', () => {
       const initiator = new ProjectInitiator();
       const target = { a: 1 };
       const source = { a: 1, b: 2 };

       const result = initiator.deepMerge(target, source);

       expect(result).toEqual({ a: 1, b: 2 });
     });

     it('preserves existing values in target', () => {
       const initiator = new ProjectInitiator();
       const target = { a: 1, b: 999 };
       const source = { a: 1, b: 2 };

       const result = initiator.deepMerge(target, source);

       expect(result.b).toBe(999);  // Target value preserved
     });

     it('recursively merges nested objects', () => {
       const initiator = new ProjectInitiator();
       const target = {
         settings: {
           contextScopes: ['epic', 'story'],
           model: 'claude-opus'
         }
       };
       const source = {
         settings: {
           contextScopes: ['epic', 'story', 'task', 'subtask'],
           ceremonies: [{ name: 'sponsor-call' }]
         }
       };

       const result = initiator.deepMerge(target, source);

       // Target's contextScopes preserved
       expect(result.settings.contextScopes).toEqual(['epic', 'story']);
       // Source's new key added
       expect(result.settings.ceremonies).toEqual([{ name: 'sponsor-call' }]);
       // Target's existing key preserved
       expect(result.settings.model).toBe('claude-opus');
     });

     it('handles arrays as atomic values (no merge)', () => {
       const initiator = new ProjectInitiator();
       const target = { items: [1, 2, 3] };
       const source = { items: [4, 5] };

       const result = initiator.deepMerge(target, source);

       // Arrays not merged - target array preserved
       expect(result.items).toEqual([1, 2, 3]);
     });

     it('handles null values correctly', () => {
       const initiator = new ProjectInitiator();
       const target = { a: null };
       const source = { a: { nested: 'value' } };

       const result = initiator.deepMerge(target, source);

       // Target null preserved (not overwritten)
       expect(result.a).toBe(null);
     });
   });
   ```

5. **Create new `sponsorCall()` tests**:
   ```javascript
   describe('sponsorCall()', () => {
     it('fails if project not initialized', async () => {
       // Mock: .avc/avc.json does not exist
       // Expect: Error with message "Please run /init first"
     });

     it('validates API key before starting ceremony', async () => {
       // Mock: .avc/avc.json exists
       // Mock: API key validation
       // Expect: validateProviderApiKey() called
     });

     it('fails if API key validation fails', async () => {
       // Mock: API key validation returns { valid: false }
       // Expect: Error message displayed
       // Expect: generateProjectDocument NOT called
     });

     it('runs ceremony if API key is valid', async () => {
       // Mock: API key validation returns { valid: true }
       // Expect: generateProjectDocument() called
     });

     it('resumes incomplete ceremony', async () => {
       // Mock: init-progress.json exists
       // Expect: Progress loaded and resumed
     });
   });
   ```

#### File: `src/tests/integration/init-with-provider.test.js`

**Changes needed:**

1. **Update test names** to reflect two-step process:
   - "initializes project with Claude provider" → "creates project structure"
   - Add new test: "runs sponsor call with Claude provider"

2. **Split test logic**:
   ```javascript
   it('creates project structure', async () => {
     const initiator = new ProjectInitiator(testDir);
     await initiator.init();

     // Verify files created
     expect(fs.existsSync(path.join(testDir, '.avc'))).toBe(true);
     expect(fs.existsSync(path.join(testDir, '.avc/avc.json'))).toBe(true);
     expect(fs.existsSync(path.join(testDir, '.env'))).toBe(true);

     // Verify project document NOT created yet
     expect(fs.existsSync(path.join(testDir, '.avc/project/doc.md'))).toBe(false);
   });

   it('runs sponsor call with Claude provider', async () => {
     const initiator = new ProjectInitiator(testDir);

     // First init
     await initiator.init();

     // Set up API key
     process.env.ANTHROPIC_API_KEY = 'test-key';

     // Then sponsor call
     await initiator.sponsorCall();

     // Verify project document created
     expect(fs.existsSync(path.join(testDir, '.avc/project/doc.md'))).toBe(true);
   });
   ```

---

### 4. User Migration Considerations

#### Existing Projects

**Question:** What happens to users who already have initialized projects?

**Answer:** No breaking changes for existing projects:

1. **Already completed `/init`:**
   - `.avc/avc.json` exists
   - `.avc/project/doc.md` exists
   - Running `/init` again will show "already initialized"
   - No action needed

2. **Incomplete ceremony (init-progress.json exists):**
   - User previously ran `/init` but ceremony didn't complete
   - Running `/init` again will show "already initialized" (structure exists)
   - Running `/sponsor-call` will detect `init-progress.json` and resume
   - Seamless migration

#### New Projects

**Workflow:**
```bash
# 1. Install
npm install -g @agile-vibe-coding/avc

# 2. Launch
avc

# 3. Create project structure
> /init

# 4. Add API keys
vim .env  # Add ANTHROPIC_API_KEY=...

# 5. Define project
> /sponsor-call
```

---

### 5. Implementation Timeline

**Estimated effort:** 6-8 hours

| Task | Effort | Description |
|------|--------|-------------|
| **Code changes - command split** | 1.5 hours | Split init() into init() + sponsorCall(), update repl-ink.js |
| **Code changes - merge logic** | 1.5 hours | Implement deepMerge(), update createAvcConfig(), add getAvcVersion() |
| **Test updates - command split** | 1 hour | Split init tests, add sponsorCall tests |
| **Test updates - merge logic** | 1.5 hours | Add deepMerge tests, .env preservation tests, avc.json merge tests |
| **Documentation** | 2 hours | Update INSTALL.md, COMMANDS.md, README.md with merge examples |
| **Testing & validation** | 1.5 hours | Manual testing, edge cases, migration scenarios |

**Breakdown:**

1. **Phase 1: Command split (3 hours)**
   - Split `init()` method
   - Create `sponsorCall()` method
   - Update REPL command handlers
   - Update tests for split commands

2. **Phase 2: Merge logic (3 hours)**
   - Implement `deepMerge()` utility
   - Update `createAvcConfig()` with merge behavior
   - Add `getAvcVersion()` helper
   - Write comprehensive merge tests

3. **Phase 3: Documentation & testing (2 hours)**
   - Update all documentation files
   - Add merge behavior examples
   - Manual testing of upgrade scenarios
   - Verify backward compatibility

---

### 6. Validation Checklist

Before merging:

**Command behavior:**
- [ ] `/init` creates .avc/, avc.json, .env without requiring API keys
- [ ] `/init` does NOT call validateProviderApiKey
- [ ] `/init` does NOT call generateProjectDocument
- [ ] `/init` displays correct next steps message
- [ ] `/sponsor-call` fails with helpful error if project not initialized
- [ ] `/sponsor-call` validates API key before starting ceremony
- [ ] `/sponsor-call` fails with helpful error if API key missing
- [ ] `/sponsor-call` runs questionnaire successfully
- [ ] `/sponsor-call` generates project document
- [ ] `/sponsor-call` resumes incomplete ceremony

**File preservation and merge:**
- [ ] `.env` file is never overwritten or deleted if it exists
- [ ] Existing API keys in `.env` are preserved when running `/init` again
- [ ] `avc.json` merge adds new attributes from CLI updates
- [ ] `avc.json` merge preserves user customizations (contextScopes, ceremonies, etc.)
- [ ] `avc.json` merge handles nested objects correctly
- [ ] `avc.json` merge updates `avcVersion` field to track CLI version
- [ ] `avc.json` merge adds `updated` timestamp when changes are made
- [ ] `avc.json` merge skips if config is already up to date
- [ ] `avc.json` merge handles corrupt files gracefully (doesn't crash)
- [ ] Running `/init` on v0.0.9 project adds `ceremonies` array without breaking config

**Testing:**
- [ ] All unit tests pass (including new merge tests)
- [ ] All integration tests pass
- [ ] New `deepMerge()` tests cover edge cases
- [ ] New `.env` preservation tests verify behavior
- [ ] New `avc.json` merge tests verify user customizations preserved

**Documentation:**
- [ ] INSTALL.md accurately describes new workflow
- [ ] INSTALL.md explains .env file preservation
- [ ] COMMANDS.md documents both commands clearly
- [ ] COMMANDS.md includes smart merge behavior examples
- [ ] README.md explains two-step process

---

## Benefits of This Change

1. **No more circular dependency:**
   - Users can create .env file first
   - Then add API keys
   - Then run ceremony

2. **Clearer separation of concerns:**
   - `/init` = Setup (no LLM)
   - `/sponsor-call` = Ceremony (with LLM)

3. **Better user experience:**
   - Clear error messages
   - Logical workflow
   - No confusion

4. **Faster project setup:**
   - Users who don't want AI assistance can skip `/sponsor-call`
   - Can manually create project documentation

5. **Consistent with command naming:**
   - `/init` = initialization
   - `/sponsor-call` = ceremony name

---

## Alternative Approaches Considered

### Alternative 1: Make API key optional in `/init`

**Approach:** Keep single `/init` command, but make API key validation optional.

**Problems:**
- Still confusing - when do you need keys, when don't you?
- Mixes two concerns in one command
- Harder to document clearly

**Rejected.**

### Alternative 2: Create .env before running AVC

**Approach:** Document that users should manually create .env before running avc.

**Problems:**
- Extra manual step
- Users don't know format of .env
- Inconsistent with "initialize everything" expectation

**Rejected.**

### Alternative 3: Interactive prompt for API key during `/init`

**Approach:** When API key missing, prompt user to enter it interactively.

**Problems:**
- Requires copying/pasting long API keys in terminal
- No way to see/edit what you pasted
- Keys not persisted in .env for future use
- Security concern: keys visible in terminal history

**Rejected.**

---

## Conclusion

Splitting `/init` into `/init` (setup) and `/sponsor-call` (ceremony) resolves the circular dependency, provides a clearer user experience, and maintains separation of concerns. Adding smart merge logic for `avc.json` ensures seamless CLI updates without breaking user customizations.

### Key Features

1. **Command split:**
   - `/init` - Creates structure, no API keys needed
   - `/sponsor-call` - Runs ceremony, requires API keys

2. **Smart file handling:**
   - `.env` preservation - Never overwrites existing API keys
   - `avc.json` merge - Adds new CLI features, preserves user customizations

3. **Backward compatibility:**
   - Existing projects work without changes
   - Incomplete ceremonies resume seamlessly
   - CLI updates don't break configurations

### Code Additions Summary

**New methods in `src/cli/init.js`:**
- `sponsorCall()` - Moved ceremony logic from `init()`
- `deepMerge(target, source)` - Recursive merge utility
- `getAvcVersion()` - Track CLI version in config

**Modified methods:**
- `init()` - Simplified to structure creation only
- `createAvcConfig()` - Now includes merge logic for existing configs

**New tests:**
- 18 new test cases for merge logic
- 6 new test cases for `.env` preservation
- 5 new test cases for `sponsorCall()` command

**Recommendation:** Proceed with implementation.

---

**Plan created:** 2026-01-29
**Plan updated:** 2026-01-29 (added merge logic)
**Plan status:** Ready for implementation
**Breaking changes:** None (backward compatible)
**Estimated implementation time:** 6-8 hours
